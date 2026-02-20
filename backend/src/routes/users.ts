import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import UserModel from '../models/User.js';
import RoleService from '../services/RoleService.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin, requireUserManagement } from '../middleware/permissions.js';
import { UserRole } from '../types/index.js';
import { logActivity } from '../services/ActivityLogService.js';
import connection from '../database/connection.js';
import { hashPassword } from '../utils/password.js';

const router = express.Router();
const userModel = new UserModel();
const roleService = new RoleService();

const getAdapter = () => connection.getAdapter();

const SYSTEM_USER_EMAIL = 'system@infradb.invalid';
const SYSTEM_USER_USERNAME = 'System';

const parseBooleanQueryParam = (value: unknown): boolean => {
  if (value === true || value === 1) return true;
  if (typeof value !== 'string') return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
};

const ensureSystemUserId = async (adapter: ReturnType<typeof getAdapter>): Promise<number> => {
  const existing = await adapter.query('SELECT id FROM users WHERE email = ? LIMIT 1', [SYSTEM_USER_EMAIL]);
  const existingId = Number((existing as any[])?.[0]?.id);
  if (existingId) return existingId;

  const randomPassword = `sys-${crypto.randomBytes(32).toString('hex')}`;
  const passwordHash = await hashPassword(randomPassword);

  await adapter.execute(
    'INSERT INTO users (email, password_hash, username, role, is_active) VALUES (?, ?, ?, ?, ?)',
    [SYSTEM_USER_EMAIL, passwordHash, SYSTEM_USER_USERNAME, 'USER', 0]
  );

  const created = await adapter.query('SELECT id FROM users WHERE email = ? LIMIT 1', [SYSTEM_USER_EMAIL]);
  const createdId = Number((created as any[])?.[0]?.id);
  if (!createdId) {
    throw new Error('Failed to create System user');
  }

  return createdId;
};

// Validation schemas
const updateUserSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(['GLOBAL_ADMIN', 'USER']).optional(),
});

const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['GLOBAL_ADMIN', 'USER']).default('USER'),
});

/**
 * GET /api/users - List all users (admin only)
 */
router.get('/', authenticateToken, requireUserManagement, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    const users = await roleService.getAllUsersWithRoles(limit, offset);
    const totalUsers = await userModel.count();
    const totalPages = Math.ceil(totalUsers / limit);

    // Remove password_hash from response
    const sanitizedUsers = users.map(user => {
      const { ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    res.json({
      success: true,
      data: {
        users: sanitizedUsers,
        pagination: {
          page,
          limit,
          total: totalUsers,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
    });
  }
});

/**
 * GET /api/users/stats - Get user statistics (admin only)
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await userModel.count();
    const usersByRole = await roleService.countUsersByRole();

    res.json({
      success: true,
      data: {
        totalUsers,
        usersByRole,
      },
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user statistics',
    });
  }
});

/**
 * PUT /api/users/:id - Update user (admin only)
 */
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(String(req.params.id));
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    // Validate request body
    const validation = updateUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validation.error.errors,
      });
    }

    const updateDataRaw = validation.data;
    const updateData = {
      ...(updateDataRaw.email ? { email: updateDataRaw.email } : {}),
      ...(updateDataRaw.role ? { role: updateDataRaw.role } : {}),
    };

    // Check if user exists
    const existingUser = await userModel.findById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const beforeEmail = String((existingUser as any).email ?? '');
    const beforeRole = String((existingUser as any).role ?? '');

    // Check if email is already taken (if updating email)
    const emailToCheck = updateData.email;
    if (emailToCheck && await userModel.emailExists(emailToCheck, userId)) {
      return res.status(409).json({
        success: false,
        error: 'Email already exists',
      });
    }

    // Update user
    const updatedUser = await userModel.update(userId, updateData);
    if (!updatedUser) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update user',
      });
    }

    // Update role if provided
    if (updateData.role && updateData.role !== existingUser.role) {
      await roleService.assignRole(userId, updateData.role);
    }

    try {
      await logActivity({
        actorUserId: req.user!.userId,
        action: 'USER_UPDATED',
        summary: `Updated user ${existingUser.username}${existingUser.email ? ` (${existingUser.email})` : ''}`,
        metadata: {
          target_user_id: userId,
          before: {
            email: beforeEmail,
            role: beforeRole,
          },
          after: {
            ...(updateData.email ? { email: updateData.email } : {}),
            ...(updateData.role ? { role: updateData.role } : {}),
          },
        },
      });
    } catch (error) {
      console.warn('⚠️ Failed to log user update activity:', error);
    }

    // Remove password_hash from response
    const { password_hash, ...userResponse } = updatedUser;

    res.json({
      success: true,
      data: userResponse,
      message: 'User updated successfully',
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user',
    });
  }
});

/**
 * DELETE /api/users/:id - Delete user (admin only)
 */
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(String(req.params.id));
    const cascadeDelete = parseBooleanQueryParam(req.query.cascade);
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    // Prevent admin from deleting themselves
    if (userId === req.user!.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account',
      });
    }

    // Check if user exists
    const existingUser = await userModel.findById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const deletedUsername = String((existingUser as any).username ?? '').trim();
    const deletedEmail = String((existingUser as any).email ?? '').trim();

    if (deletedEmail.toLowerCase() === SYSTEM_USER_EMAIL.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete the System user',
      });
    }

    const adapter = getAdapter();
    try {
      await adapter.beginTransaction();

      if (!cascadeDelete) {
        const systemUserId = await ensureSystemUserId(adapter);
        await adapter.execute('UPDATE labels SET created_by = ? WHERE created_by = ?', [systemUserId, userId]);
        await adapter.execute('UPDATE sites SET created_by = ? WHERE created_by = ?', [systemUserId, userId]);
      }

      const deleteResult = await adapter.execute('DELETE FROM users WHERE id = ?', [userId]);
      if (!deleteResult.affectedRows) {
        throw new Error('Failed to delete user');
      }

      await adapter.commit();
    } catch (err) {
      await adapter.rollback();
      throw err;
    }

    try {
      await logActivity({
        actorUserId: req.user!.userId,
        action: 'USER_DELETED',
        summary: `Deleted user ${deletedUsername}${deletedEmail ? ` (${deletedEmail})` : ''}`,
        metadata: {
          target_user_id: userId,
          username: deletedUsername,
          email: deletedEmail,
          cascade: cascadeDelete,
          reassigned_created_content_to_system: !cascadeDelete,
        },
      });
    } catch (error) {
      console.warn('⚠️ Failed to log user delete activity:', error);
    }

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user',
    });
  }
});

export { router as userRoutes };
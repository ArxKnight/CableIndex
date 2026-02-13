import express from 'express';
import { z } from 'zod';
import UserModel from '../models/User.js';
import RoleService from '../services/RoleService.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin, requireUserManagement } from '../middleware/permissions.js';
import { UserRole } from '../types/index.js';
import { logActivity } from '../services/ActivityLogService.js';

const router = express.Router();
const userModel = new UserModel();
const roleService = new RoleService();

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

    // Delete user
    const deleted = await userModel.delete(userId);
    if (!deleted) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete user',
      });
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
import express from 'express';
import { z } from 'zod';
import UserModel from '../models/User.js';
import RoleService from '../services/RoleService.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin, requireUserManagement } from '../middleware/permissions.js';
import { UserRole } from '../types/index.js';

const router = express.Router();
const userModel = new UserModel();
const roleService = new RoleService();

// Validation schemas
const updateUserSchema = z.object({
  email: z.string().email().optional(),
  full_name: z.string().min(1).max(100).optional(),
  role: z.enum(['admin', 'moderator', 'user']).optional(),
});

const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'moderator', 'user']).default('user'),
});

/**
 * GET /api/users - List all users (admin only)
 */
router.get('/', authenticateToken, requireUserManagement, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    const users = roleService.getAllUsersWithRoles(limit, offset);
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
    const usersByRole = roleService.countUsersByRole();

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
      ...(updateDataRaw.full_name ? { full_name: updateDataRaw.full_name } : {}),
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
      roleService.assignRole(userId, updateData.role);
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

    // Delete user
    const deleted = await userModel.delete(userId);
    if (!deleted) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete user',
      });
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
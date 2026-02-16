import { Router, Request, Response } from 'express';
import { z } from 'zod';
import UserModel from '../models/User.js';
import { generateTokens, verifyToken } from '../utils/jwt.js';
import { validatePassword } from '../utils/password.js';
import { authenticateToken } from '../middleware/auth.js';
import { ApiResponse } from '../types/index.js';
import connection from '../database/connection.js';
import { logActivity } from '../services/ActivityLogService.js';
import crypto from 'crypto';

const router = Router();
const userModel = new UserModel();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  username: z.string().min(2, 'Username must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

/**
 * POST /api/auth/login
 * Authenticate user with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    console.log(`🔐 Login attempt for email: ${email}`);

    // Validate request body
    const validated = loginSchema.parse(req.body);
    console.log(`✓ Login validation passed for: ${email}`);

    // Verify credentials
    console.log(`🔍 Verifying credentials for: ${email}`);
    const user = await userModel.verifyCredentials(validated.email, validated.password);
    
    console.log(`🔍 verifyCredentials returned: ${user ? `user ${user.id}` : 'null'}`);
    
    if (!user) {
      console.warn(`✗ Invalid credentials for: ${email}`);
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    console.log(`✓ Credentials verified for user: ${user.id} (${user.email})`);

    try {
      const now = new Date();
      await connection.getAdapter().execute(
        `INSERT INTO user_activity (user_id, last_activity, last_login)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           last_activity = VALUES(last_activity),
           last_login = VALUES(last_login)`,
        [user.id, now, now]
      );
    } catch (error) {
      console.warn('⚠️ Failed to record login activity:', error);
    }

    // Generate tokens
    console.log(`🔑 Generating tokens for user: ${user.id}`);
    const tokens = generateTokens(user);

    // Return user data (without password hash) and tokens
    const { password_hash, ...userWithoutPassword } = user;
    
    console.log(`✓ Login successful for: ${email}`);
    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        ...tokens,
      },
      message: 'Login successful',
    } as ApiResponse);

  } catch (error) {
    console.error(`❌ Login error for ${req.body?.email}:`, error);
    if (error instanceof Error) {
      console.error(`Error message: ${error.message}`);
      console.error(`Error stack: ${error.stack}`);
    }

    if (error instanceof z.ZodError) {
      console.error('Validation errors:', error.errors);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * POST /api/auth/register
 * Register a new user account
 */
router.post('/register', async (req: Request, res: Response) => {
  res.status(403).json({
    success: false,
    error: 'Public registration is disabled. Please use an invitation link.'
  } as ApiResponse);
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const { refresh_token } = refreshTokenSchema.parse(req.body);

    // Verify refresh token
    const decoded = verifyToken(refresh_token);
    
    // Get current user data
    const user = await userModel.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      } as ApiResponse);
    }

    // Generate new tokens
    const tokens = generateTokens(user);

    // Return new tokens
    res.json({
      success: true,
      data: tokens,
      message: 'Token refreshed successfully',
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Token refresh error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid or expired refresh token',
    } as ApiResponse);
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
    }

    // Get current user data
    const user = await userModel.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      } as ApiResponse);
    }

    // Return user data (without password hash)
    const { password_hash, ...userWithoutPassword } = user;

    const normalizedUser = {
      ...userWithoutPassword,
      role: (userWithoutPassword as any).role === 'ADMIN' ? 'GLOBAL_ADMIN' : (userWithoutPassword as any).role,
    };

    const membershipRows = await connection.getAdapter().query(
      `SELECT sm.site_id, sm.site_role, s.name as site_name, s.code as site_code
       FROM site_memberships sm
       JOIN sites s ON s.id = sm.site_id
       WHERE sm.user_id = ?
       ORDER BY s.name ASC`,
      [req.user.userId]
    );

    const memberships = (membershipRows as any[]).map(row => ({
      site_id: Number(row.site_id),
      site_role: row.site_role === 'ADMIN'
        ? 'SITE_ADMIN'
        : row.site_role === 'USER'
          ? 'SITE_USER'
          : row.site_role,
      site_name: String(row.site_name ?? ''),
      site_code: String(row.site_code ?? ''),
    }));
    
    res.json({
      success: true,
      data: { user: normalizedUser, memberships },
    } as ApiResponse);

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * PUT /api/auth/profile
 * Update current user's profile
 */
router.put('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
    }

    // Validation schema for profile updates
    const updateProfileSchema = z.object({
      email: z.string().email('Invalid email format').optional(),
    });

    const parsed = updateProfileSchema.parse(req.body);
    const { email } = parsed;

    // Check if email is already taken (if updating email)
    if (email && await userModel.emailExists(email, req.user.userId)) {
      return res.status(409).json({
        success: false,
        error: 'Email already exists',
      } as ApiResponse);
    }

    // Update user profile
    const updatePayload = {
      ...(email ? { email } : {}),
    };
    const updatedUser = await userModel.update(req.user.userId, updatePayload);
    if (!updatedUser) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update profile',
      } as ApiResponse);
    }

    // Return updated user data (without password hash)
    const { password_hash, ...userWithoutPassword } = updatedUser;

    try {
      await logActivity({
        actorUserId: req.user.userId,
        action: 'PROFILE_UPDATED',
        summary: `Updated profile${email ? ' email' : ''}`,
        metadata: {
          ...(email ? { email } : {}),
        },
      });
    } catch (error) {
      console.warn('⚠️ Failed to log profile update activity:', error);
    }
    
    res.json({
      success: true,
      data: { user: userWithoutPassword },
      message: 'Profile updated successfully',
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * PUT /api/auth/password
 * Change current user's password
 */
router.put('/password', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
    }

    // Validation schema for password change
    const changePasswordSchema = z.object({
      current_password: z.string().min(1, 'Current password is required'),
      new_password: z.string().min(8, 'New password must be at least 8 characters'),
    });

    const { current_password, new_password } = changePasswordSchema.parse(req.body);

    // Get current user
    const user = await userModel.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      } as ApiResponse);
    }

    // Verify current password
    const isCurrentPasswordValid = await userModel.verifyCredentials(user.email, current_password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect',
      } as ApiResponse);
    }

    // Validate new password strength
    const passwordValidation = validatePassword(new_password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'New password does not meet requirements',
        details: passwordValidation.errors,
      } as ApiResponse);
    }

    // Update password
    const passwordUpdated = await userModel.updatePassword(req.user.userId, new_password);
    if (!passwordUpdated) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update password',
      } as ApiResponse);
    }

    try {
      await logActivity({
        actorUserId: req.user.userId,
        action: 'PASSWORD_CHANGED',
        summary: 'Changed password',
      });
    } catch (error) {
      console.warn('⚠️ Failed to log password change activity:', error);
    }

    res.json({
      success: true,
      message: 'Password updated successfully',
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * POST /api/auth/password-reset
 * Confirm a password reset using a token (public)
 */
router.post('/password-reset', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      token: z.string().min(1, 'Token is required'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    });

    const parsed = schema.parse(req.body);

    const passwordValidation = validatePassword(parsed.password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Password does not meet requirements',
        details: passwordValidation.errors,
      } as ApiResponse);
    }

    const tokenHash = crypto.createHash('sha256').update(parsed.token).digest('hex');
    const adapter = connection.getAdapter();
    const now = new Date();

    await adapter.beginTransaction();
    try {
      const rows = await adapter.query(
        `SELECT id, user_id, expires_at, used_at
         FROM password_reset_tokens
         WHERE token_hash = ?
         LIMIT 1`,
        [tokenHash]
      );

      const record = (rows as any[])?.[0];
      if (!record) {
        await adapter.rollback();
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired password reset token',
        } as ApiResponse);
      }

      if (record.used_at) {
        await adapter.rollback();
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired password reset token',
        } as ApiResponse);
      }

      const expiresAt = new Date(record.expires_at);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
        await adapter.rollback();
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired password reset token',
        } as ApiResponse);
      }

      const userId = Number(record.user_id);
      if (!Number.isFinite(userId) || userId <= 0) {
        await adapter.rollback();
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired password reset token',
        } as ApiResponse);
      }

      const ok = await userModel.updatePassword(userId, parsed.password);
      if (!ok) {
        throw new Error('Failed to update password');
      }

      const usedResult = await adapter.execute(
        'UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL',
        [now, Number(record.id)]
      );
      if (usedResult.affectedRows === 0) {
        throw new Error('Failed to mark reset token as used');
      }

      await adapter.commit();
    } catch (error) {
      await adapter.rollback();
      throw error;
    }

    try {
      const rows = await connection.getAdapter().query(
        'SELECT u.id FROM password_reset_tokens prt JOIN users u ON u.id = prt.user_id WHERE prt.token_hash = ? LIMIT 1',
        [tokenHash]
      );
      const userId = Number((rows as any[])?.[0]?.id);
      if (Number.isFinite(userId) && userId > 0) {
        await logActivity({
          actorUserId: userId,
          action: 'PASSWORD_CHANGED',
          summary: 'Reset password via reset link',
        });
      }
    } catch (error) {
      console.warn('⚠️ Failed to log password reset activity:', error);
    }

    return res.json({
      success: true,
      message: 'Password reset successfully',
    } as ApiResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Password reset error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', authenticateToken, (req: Request, res: Response) => {
  // Since we're using stateless JWT tokens, logout is handled client-side
  // This endpoint exists for consistency and future token blacklisting if needed
  try {
    if (req.user?.userId) {
      // Fire-and-forget; do not delay response
      void logActivity({
        actorUserId: req.user.userId,
        action: 'LOGOUT',
        summary: 'Logged out',
      });
    }
  } catch {
    // ignore
  }
  res.json({
    success: true,
    message: 'Logout successful',
  } as ApiResponse);
});

export default router;
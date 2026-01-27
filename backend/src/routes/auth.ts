import { Router, Request, Response } from 'express';
import { z } from 'zod';
import UserModel from '../models/User.js';
import { generateTokens, verifyToken } from '../utils/jwt.js';
import { validatePassword } from '../utils/password.js';
import { authenticateToken } from '../middleware/auth.js';
import { ApiResponse } from '../types/index.js';

const router = Router();
const userModel = new UserModel();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
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
    // Validate request body
    const { email, password } = loginSchema.parse(req.body);

    // Verify credentials
    const user = await userModel.verifyCredentials(email, password);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      } as ApiResponse);
    }

    // Generate tokens
    const tokens = generateTokens(user);

    // Return user data (without password hash) and tokens
    const { password_hash, ...userWithoutPassword } = user;
    
    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        ...tokens,
      },
      message: 'Login successful',
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Login error:', error);
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
  try {
    // Validate request body
    const { email, full_name, password } = registerSchema.parse(req.body);

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Password does not meet requirements',
        details: passwordValidation.errors,
      } as ApiResponse);
    }

    // Check if email already exists
    if (userModel.emailExists(email)) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered',
      } as ApiResponse);
    }

    // Create user
    const user = await userModel.create({
      email,
      full_name,
      password,
      role: 'user', // Default role
    });

    // Generate tokens
    const tokens = generateTokens(user);

    // Return user data (without password hash) and tokens
    const { password_hash, ...userWithoutPassword } = user;
    
    res.status(201).json({
      success: true,
      data: {
        user: userWithoutPassword,
        ...tokens,
      },
      message: 'Registration successful',
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
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
    const user = userModel.findById(decoded.userId);
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
    const user = userModel.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      } as ApiResponse);
    }

    // Return user data (without password hash)
    const { password_hash, ...userWithoutPassword } = user;
    
    res.json({
      success: true,
      data: { user: userWithoutPassword },
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
      full_name: z.string().min(2, 'Full name must be at least 2 characters').optional(),
    });

    const parsed = updateProfileSchema.parse(req.body);
    const { email, full_name } = parsed;

    // Check if email is already taken (if updating email)
    if (email && userModel.emailExists(email, req.user.userId)) {
      return res.status(409).json({
        success: false,
        error: 'Email already exists',
      } as ApiResponse);
    }

    // Update user profile
    const updatePayload = {
      ...(email ? { email } : {}),
      ...(full_name ? { full_name } : {}),
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
    const user = userModel.findById(req.user.userId);
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
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', authenticateToken, (req: Request, res: Response) => {
  // Since we're using stateless JWT tokens, logout is handled client-side
  // This endpoint exists for consistency and future token blacklisting if needed
  res.json({
    success: true,
    message: 'Logout successful',
  } as ApiResponse);
});

export default router;
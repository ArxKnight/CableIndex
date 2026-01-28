import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import UserModel from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/permissions.js';
import connection from '../database/connection.js';

const router = express.Router();
const getUserModel = () => new UserModel();
const getAdapter = () => connection.getAdapter();

// Validation schemas
const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'moderator', 'user']).default('user'),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  full_name: z.string().min(1).max(100),
  password: z.string().min(8),
});

/**
 * POST /api/admin/invite - Invite new user (admin only)
 */
router.post('/invite', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Validate request body
    const validation = inviteUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validation.error.errors,
      });
    }

    const { email, role } = validation.data;

    // Check if user already exists
    if (await getUserModel().emailExists(email)) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists',
      });
    }

    // Check if there's already a pending invitation
    const nowIso = new Date().toISOString();
    const existingInviteRows = await getAdapter().query(
      `SELECT id FROM user_invitations 
       WHERE email = ? AND used_at IS NULL AND expires_at > ?`,
      [email, nowIso]
    );
    const existingInvite = existingInviteRows[0];

    if (existingInvite) {
      return res.status(409).json({
        success: false,
        error: 'Invitation already sent to this email',
      });
    }

    // Generate invitation token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create invitation record
    const result = await getAdapter().execute(
      `INSERT INTO user_invitations (email, token, invited_by, role, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [email, token, req.user!.userId, role, expiresAt.toISOString()]
    );

    if (!result.insertId) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create invitation',
      });
    }

    // In a real application, you would send an email here
    // For now, we'll just return the invitation details
    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        email,
        role,
        token, // In production, don't return the token
        expiresAt: expiresAt.toISOString(),
      },
      message: 'User invitation created successfully',
    });
  } catch (error) {
    console.error('Error creating invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create invitation',
    });
  }
});

/**
 * GET /api/admin/invitations - List pending invitations (admin only)
 */
router.get('/invitations', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const invitations = await getAdapter().query(`
      SELECT 
        ui.id,
        ui.email,
        ui.role,
        ui.expires_at,
        ui.created_at,
        u.full_name as invited_by_name
      FROM user_invitations ui
      JOIN users u ON ui.invited_by = u.id
      WHERE ui.used_at IS NULL
      ORDER BY ui.created_at DESC
    `);

    res.json({
      success: true,
      data: invitations,
    });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch invitations',
    });
  }
});

/**
 * DELETE /api/admin/invitations/:id - Cancel invitation (admin only)
 */
router.delete('/invitations/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const invitationId = parseInt(String(req.params.id));
    if (isNaN(invitationId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid invitation ID',
      });
    }

    const result = await getAdapter().execute(
      'DELETE FROM user_invitations WHERE id = ? AND used_at IS NULL',
      [invitationId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found or already used',
      });
    }

    res.json({
      success: true,
      message: 'Invitation cancelled successfully',
    });
  } catch (error) {
    console.error('Error cancelling invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel invitation',
    });
  }
});

/**
 * POST /api/admin/accept-invite - Accept invitation and create account (public)
 */
router.post('/accept-invite', async (req, res) => {
  try {
    // Validate request body
    const validation = acceptInviteSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validation.error.errors,
      });
    }

    const { token, full_name, password } = validation.data;

    // Find valid invitation
    const nowIso = new Date().toISOString();
    const invitationRows = await getAdapter().query(
      `SELECT * FROM user_invitations 
       WHERE token = ? AND used_at IS NULL AND expires_at > ?`,
      [token, nowIso]
    );
    const invitation = invitationRows[0] as any;

    if (!invitation) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired invitation token',
      });
    }

    // Check if user already exists
    if (await getUserModel().emailExists(invitation.email)) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists',
      });
    }

    // Create user account
    const user = await getUserModel().create({
      email: invitation.email,
      full_name,
      password,
      role: invitation.role,
    });

    // Mark invitation as used
    await getAdapter().execute(
      `UPDATE user_invitations 
       SET used_at = ? 
       WHERE id = ?`,
      [new Date().toISOString(), invitation.id]
    );

    // Remove password_hash from response
    const { password_hash, ...userResponse } = user;

    res.status(201).json({
      success: true,
      data: userResponse,
      message: 'Account created successfully',
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create account',
    });
  }
});

/**
 * GET /api/admin/validate-invite/:token - Validate invitation token (public)
 */
router.get('/validate-invite/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const nowIso = new Date().toISOString();
    const invitationRows = await getAdapter().query(
      `SELECT email, role, expires_at FROM user_invitations 
       WHERE token = ? AND used_at IS NULL AND expires_at > ?`,
      [String(token), nowIso]
    );
    const invitation = invitationRows[0] as any;

    if (!invitation) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired invitation token',
      });
    }

    res.json({
      success: true,
      data: {
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expires_at,
      },
    });
  } catch (error) {
    console.error('Error validating invitation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate invitation',
    });
  }
});

/**
 * GET /api/admin/users - List all users with statistics (admin only)
 */
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { search, role } = req.query;
    const dbConfig = connection.getConfig();
    const dbType = dbConfig?.type || 'unknown';
    
    console.log(`📊 Fetching users [DB: ${dbType.toUpperCase()}] for admin: ${req.user?.email}`);

    // Use UserModel instead of direct database access for better compatibility
    const userModel = getUserModel();
    
    // Get all users first
    const allUsers = await userModel.findAll(1000, 0);
    
    if (!allUsers || !Array.isArray(allUsers)) {
      console.warn(`⚠️  No users found or invalid response from model`);
      return res.json({
        success: true,
        data: { users: [] },
      });
    }

    // Apply filters
    let filteredUsers = allUsers;

    if (search) {
      const searchLower = (search as string).toLowerCase();
      filteredUsers = filteredUsers.filter(u => 
        u.full_name?.toLowerCase().includes(searchLower) ||
        u.email?.toLowerCase().includes(searchLower)
      );
    }

    if (role && role !== 'all') {
      filteredUsers = filteredUsers.filter(u => u.role === role);
    }

    // Sort by created_at descending
    filteredUsers.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    console.log(`✓ Found ${filteredUsers.length} users`);

    res.json({
      success: true,
      data: { users: filteredUsers },
    });
  } catch (error) {
    console.error(`❌ Error fetching users:`, error);
    if (error instanceof Error) {
      console.error(`Error message: ${error.message}`);
      console.error(`Error stack: ${error.stack}`);
    }
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
    });
  }
});

/**
 * PUT /api/admin/users/:id/role - Update user role (admin only)
 */
router.put('/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(String(req.params.id));
    const { role } = req.body as { role?: string };

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    if (!role || !['admin', 'moderator', 'user'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role',
      });
    }

    // Check if user exists
    const user = await getUserModel().findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Update user role
    const validRole = role as 'admin' | 'moderator' | 'user';
    const result = await getAdapter().execute(
      'UPDATE users SET role = ?, updated_at = ? WHERE id = ?',
      [validRole, new Date().toISOString(), userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      message: 'User role updated successfully',
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user role',
    });
  }
});

/**
 * DELETE /api/admin/users/:id - Delete user (admin only)
 */
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(String(req.params.id));

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    // Check if user exists
    const user = getUserModel().findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Prevent self-deletion
    if (userId === req.user!.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account',
      });
    }

    // Delete user and cascade delete their data
    const adapter = getAdapter();
    try {
      await adapter.beginTransaction();
      await adapter.execute('DELETE FROM labels WHERE user_id = ?', [userId]);
      await adapter.execute('DELETE FROM sites WHERE user_id = ?', [userId]);
      await adapter.execute('DELETE FROM users WHERE id = ?', [userId]);
      await adapter.commit();
    } catch (err) {
      await adapter.rollback();
      throw err;
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

/**
 * GET /api/admin/settings - Get application settings (admin only)
 */
router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const settingsRows = await getAdapter().query(
      `SELECT * FROM app_settings ORDER BY created_at DESC LIMIT 1`
    );
    const settings = settingsRows[0] as any;

    // Return default settings if none exist
    const defaultSettings = {
      public_registration_enabled: false,
      default_user_role: 'user',
      max_labels_per_user: null,
      max_sites_per_user: null,
      system_name: 'Cable Manager',
      system_description: 'Professional cable labeling system for Brady printers',
      maintenance_mode: false,
      maintenance_message: 'System is under maintenance. Please try again later.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    res.json({
      success: true,
      data: {
        settings: settings || defaultSettings,
      },
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settings',
    });
  }
});

/**
 * PUT /api/admin/settings - Update application settings (admin only)
 */
router.put('/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      public_registration_enabled,
      default_user_role,
      max_labels_per_user,
      max_sites_per_user,
      system_name,
      system_description,
      maintenance_mode,
      maintenance_message,
    } = req.body;

    // Validate required fields
    if (!system_name || system_name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'System name is required',
      });
    }

    if (!['user', 'moderator'].includes(default_user_role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid default user role',
      });
    }

    // Check if settings exist
    const existingSettingsRows = await getAdapter().query(
      `SELECT id FROM app_settings ORDER BY created_at DESC LIMIT 1`
    );
    const existingSettings = existingSettingsRows[0] as any;

    if (existingSettings) {
      // Update existing settings
      await getAdapter().execute(
        `UPDATE app_settings SET
          public_registration_enabled = ?,
          default_user_role = ?,
          max_labels_per_user = ?,
          max_sites_per_user = ?,
          system_name = ?,
          system_description = ?,
          maintenance_mode = ?,
          maintenance_message = ?,
          updated_at = ?
        WHERE id = ?`,
        [
          public_registration_enabled ? 1 : 0,
          default_user_role,
          max_labels_per_user || null,
          max_sites_per_user || null,
          system_name,
          system_description || null,
          maintenance_mode ? 1 : 0,
          maintenance_message || null,
          new Date().toISOString(),
          existingSettings.id
        ]
      );
    } else {
      // Create new settings
      await getAdapter().execute(
        `INSERT INTO app_settings (
          public_registration_enabled,
          default_user_role,
          max_labels_per_user,
          max_sites_per_user,
          system_name,
          system_description,
          maintenance_mode,
          maintenance_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          public_registration_enabled ? 1 : 0,
          default_user_role,
          max_labels_per_user || null,
          max_sites_per_user || null,
          system_name,
          system_description || null,
          maintenance_mode ? 1 : 0,
          maintenance_message || null
        ]
      );
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings',
    });
  }
});

/**
 * GET /api/admin/stats - Get admin statistics (admin only)
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();
    const todayStartIso = todayStart.toISOString();

    // User statistics
    const userStatsRows = await getAdapter().query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as new_this_month,
        COUNT(CASE WHEN id IN (
          SELECT DISTINCT user_id FROM labels WHERE created_at >= ?
        ) THEN 1 END) as active_this_month
      FROM users`,
      [thirtyDaysAgoIso, thirtyDaysAgoIso]
    );
    const userStats = userStatsRows[0] as any;

    const roleStats = await getAdapter().query(
      `SELECT 
        role,
        COUNT(*) as count
      FROM users
      GROUP BY role`
    ) as any[];

    const usersByRole = {
      admin: 0,
      moderator: 0,
      user: 0,
    };

    roleStats.forEach(stat => {
      usersByRole[stat.role as keyof typeof usersByRole] = stat.count;
    });

    // Label statistics
    const labelStatsRows = await getAdapter().query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as created_this_month,
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as created_today
      FROM labels`,
      [thirtyDaysAgoIso, todayStartIso]
    );
    const labelStats = labelStatsRows[0] as any;

    const mostActiveUserRows = await getAdapter().query(
      `SELECT 
        u.full_name,
        COUNT(l.id) as count
      FROM users u
      JOIN labels l ON u.id = l.user_id
      GROUP BY u.id, u.full_name
      ORDER BY count DESC
      LIMIT 1`
    );
    const mostActiveUser = mostActiveUserRows[0] as any;

    // Site statistics
    const siteStatsRows = await getAdapter().query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as created_this_month,
        CAST(AVG(label_count) AS REAL) as average_labels_per_site
      FROM (
        SELECT 
          s.id,
          s.created_at,
          COUNT(l.id) as label_count
        FROM sites s
        LEFT JOIN labels l ON s.id = l.site_id
        GROUP BY s.id, s.created_at
      ) site_counts`,
      [thirtyDaysAgoIso]
    );
    const siteStats = siteStatsRows[0] as any;

    // Recent activity
    const recentRegistrations = await getAdapter().query(
      `SELECT id, full_name, email, role, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 5`
    );

    const recentLabels = await getAdapter().query(
      `SELECT 
        l.id,
        l.reference_number,
        l.created_at,
        u.full_name as user_name,
        s.name as site_name
      FROM labels l
      JOIN users u ON l.user_id = u.id
      JOIN sites s ON l.site_id = s.id
      ORDER BY l.created_at DESC
      LIMIT 5`
    );

    const stats = {
      users: {
        total: userStats.total,
        active_this_month: userStats.active_this_month,
        new_this_month: userStats.new_this_month,
        by_role: usersByRole,
      },
      labels: {
        total: labelStats.total,
        created_this_month: labelStats.created_this_month,
        created_today: labelStats.created_today,
        most_active_user: mostActiveUser,
      },
      sites: {
        total: siteStats.total,
        created_this_month: siteStats.created_this_month,
        average_labels_per_site: siteStats.average_labels_per_site || 0,
      },
      activity: {
        recent_registrations: recentRegistrations,
        recent_labels: recentLabels,
      },
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
    });
  }
});

export { router as adminRoutes };
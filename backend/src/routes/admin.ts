import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import UserModel from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin, requireGlobalRole, resolveSiteAccess } from '../middleware/permissions.js';
import connection from '../database/connection.js';
import { buildInviteUrl, sendInviteEmailIfConfigured } from '../services/InvitationEmailService.js';

const router = express.Router();
const getUserModel = () => new UserModel();
const getAdapter = () => connection.getAdapter();

const isMySQL = () => connection.getConfig()?.type === 'mysql';
const dbDateParam = (date: Date): Date | string => {
  // mysql2 can safely bind JS Date objects; SQLite expects text
  if (isMySQL()) return date;
  return date.toISOString();
};

// Validation schemas
const inviteUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  sites: z.array(z.object({
    site_id: z.number().min(1),
    site_role: z.enum(['ADMIN', 'USER']).default('USER'),
  })).min(1),
  role: z.enum(['GLOBAL_ADMIN', 'ADMIN', 'USER']).optional(),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  full_name: z.string().min(1).max(100).optional(), // Optional since it can come from invitation
  password: z.string().min(8),
});

const updateUserSitesSchema = z.object({
  sites: z.array(z.object({
    site_id: z.number().min(1),
    site_role: z.enum(['ADMIN', 'USER']).default('USER'),
  })).optional().default([]),
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

    const { email, full_name, sites } = validation.data;

    const requesterRole = req.user!.role as string;
    if (validation.data.role === 'GLOBAL_ADMIN' && requesterRole !== 'GLOBAL_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only Global Admin can invite Global Admin users',
      });
    }

    // Check if user already exists
    if (await getUserModel().emailExists(email)) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists',
      });
    }

    // Check if there's already a pending invitation
    const now = new Date();
    const existingInviteRows = await getAdapter().query(
      `SELECT id FROM invitations
       WHERE email = ? AND used_at IS NULL AND expires_at > ?`,
      [email, dbDateParam(now)]
    );
    const existingInvite = existingInviteRows[0];

    if (existingInvite) {
      return res.status(409).json({
        success: false,
        error: 'Invitation already sent to this email',
      });
    }

    // Validate site access for non-global admins
    const siteIds = sites.map(site => site.site_id);

    // Validate that all referenced sites actually exist (prevents FK errors -> 500)
    {
      const placeholders = siteIds.map(() => '?').join(', ');
      const siteRows = await getAdapter().query(
        `SELECT id FROM sites WHERE id IN (${placeholders})`,
        [...siteIds]
      );
      const existingIds = new Set((siteRows as any[]).map(r => Number(r.id)));
      const missing = siteIds.filter(id => !existingIds.has(id));
      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'One or more selected sites do not exist',
        });
      }
    }

    if (requesterRole !== 'GLOBAL_ADMIN') {
      const placeholders = siteIds.map(() => '?').join(', ');
      const rows = await getAdapter().query(
        `SELECT DISTINCT site_id FROM site_memberships
         WHERE user_id = ? AND site_id IN (${placeholders})`,
        [req.user!.userId, ...siteIds]
      );

      if (rows.length !== siteIds.length) {
        return res.status(403).json({
          success: false,
          error: 'You can only invite users to sites you have access to',
        });
      }
    }

    // Generate invitation token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await getAdapter().beginTransaction();
    let invitationId: number | undefined;

    try {
      // Create invitation record
      const result = await getAdapter().execute(
        `INSERT INTO invitations (email, full_name, token_hash, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [email, full_name, tokenHash, req.user!.userId, dbDateParam(expiresAt)]
      );

      invitationId = Number(result.insertId);
      if (!invitationId) {
        throw new Error('Failed to create invitation');
      }

      // Assign sites
      for (const site of sites) {
        await getAdapter().execute(
          `INSERT INTO invitation_sites (invitation_id, site_id, site_role)
           VALUES (?, ?, ?)`,
          [invitationId, site.site_id, site.site_role]
        );
      }

      await getAdapter().commit();
    } catch (error) {
      await getAdapter().rollback();
      throw error;
    }

    const baseUrl = (process.env.APP_URL && String(process.env.APP_URL).trim())
      ? String(process.env.APP_URL)
      : `${req.protocol}://${req.get('host')}`;
    const invite_url = buildInviteUrl(token, baseUrl);

    const emailResult = await sendInviteEmailIfConfigured({
      to: email,
      inviteeName: full_name,
      inviterName: String((req.user as any)?.full_name || req.user?.email || 'An Admin'),
      inviteUrl: invite_url,
      expiresAtIso: expiresAt.toISOString(),
    });

    const emailNotConfigured = emailResult.email_error === 'SMTP not configured';
    const responseMessage = emailResult.email_sent
      ? 'User invitation created successfully'
      : emailNotConfigured
        ? 'Email not sent (SMTP not configured).'
        : 'Email not sent (SMTP error).';

    res.status(201).json({
      success: true,
      data: {
        id: invitationId,
        email,
        token, // In production, don't return the token
        invite_url,
        email_sent: emailResult.email_sent,
        ...(emailResult.email_error ? { email_error: emailResult.email_error } : {}),
        expiresAt: expiresAt.toISOString(),
        sites,
      },
      message: responseMessage,
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
    const requesterRole = req.user!.role as string;
    let siteFilter = '';
    let params: any[] = [];

    if (requesterRole !== 'GLOBAL_ADMIN') {
      const siteRows = await getAdapter().query(
        `SELECT site_id FROM site_memberships WHERE user_id = ?`,
        [req.user!.userId]
      );
      const siteIds = siteRows.map((row: any) => row.site_id);
      if (siteIds.length === 0) {
        return res.json({
          success: true,
          data: [],
        });
      }

      const placeholders = siteIds.map(() => '?').join(', ');
      siteFilter = `AND isites.site_id IN (${placeholders})`;
      params = siteIds;
    }

    const invitationRows = await getAdapter().query(
      `SELECT 
        i.id,
        i.email,
        i.full_name,
        i.expires_at,
        i.created_at,
        u.full_name as invited_by_name,
        isites.site_id,
        isites.site_role,
        s.name as site_name,
        s.code as site_code
      FROM invitations i
      JOIN users u ON i.invited_by = u.id
      JOIN invitation_sites isites ON isites.invitation_id = i.id
      JOIN sites s ON s.id = isites.site_id
      WHERE i.used_at IS NULL
      ${siteFilter}
      ORDER BY i.created_at DESC`,
      params
    );

    const grouped = new Map<number, any>();
    for (const row of invitationRows as any[]) {
      if (!grouped.has(row.id)) {
        grouped.set(row.id, {
          id: row.id,
          email: row.email,
          full_name: row.full_name,
          expires_at: row.expires_at,
          created_at: row.created_at,
          invited_by_name: row.invited_by_name,
          sites: [],
        });
      }

      grouped.get(row.id).sites.push({
        site_id: row.site_id,
        site_role: row.site_role,
        site_name: row.site_name,
        site_code: row.site_code,
      });
    }

    res.json({
      success: true,
      data: Array.from(grouped.values()),
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

    const requesterRole = req.user!.role as string;
    if (requesterRole !== 'GLOBAL_ADMIN') {
      const accessRows = await getAdapter().query(
        `SELECT 1
         FROM invitation_sites isites
         JOIN site_memberships sm ON sm.site_id = isites.site_id
         WHERE isites.invitation_id = ? AND sm.user_id = ?
         LIMIT 1`,
        [invitationId, req.user!.userId]
      );

      if (accessRows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Access denied',
        });
      }
    }

    const result = await getAdapter().execute(
      'DELETE FROM invitations WHERE id = ? AND used_at IS NULL',
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
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find invitation (differentiate used vs expired vs invalid)
    const now = new Date();
    const invitationRows = await getAdapter().query(
      `SELECT id, email, full_name, expires_at, used_at
       FROM invitations
       WHERE token_hash = ?
       LIMIT 1`,
      [tokenHash]
    );
    const invitation = invitationRows[0] as any;

    if (!invitation) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired invitation token',
      });
    }

    if (invitation.used_at) {
      return res.status(409).json({
        success: false,
        error: 'Invite already used',
      });
    }

    const expiresAt = new Date(invitation.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired invitation token',
      });
    }

    // Use full_name from request or from invitation
    const userFullName = full_name || invitation.full_name;
    
    if (!userFullName) {
      return res.status(400).json({
        success: false,
        error: 'Full name is required',
      });
    }

    // Check if user already exists
    if (await getUserModel().emailExists(invitation.email)) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists',
      });
    }

    const invitationSites = await getAdapter().query(
      `SELECT site_id, site_role FROM invitation_sites WHERE invitation_id = ?`,
      [invitation.id]
    ) as Array<{ site_id: number; site_role: string }>;

    if (invitationSites.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invitation has no sites assigned',
      });
    }

    const hasAdminSite = invitationSites.some(site => site.site_role === 'ADMIN');
    const globalRole = hasAdminSite ? 'ADMIN' : 'USER';

    await getAdapter().beginTransaction();
    let user;
    try {
      // Create user account
      user = await getUserModel().create({
        email: invitation.email,
        full_name: userFullName,
        password,
        role: globalRole as any,
      });

      // Create site memberships
      for (const site of invitationSites) {
        await getAdapter().execute(
          `INSERT INTO site_memberships (site_id, user_id, site_role)
           VALUES (?, ?, ?)`,
          [site.site_id, user.id, site.site_role]
        );
      }

      // Mark invitation as used
      await getAdapter().execute(
        `UPDATE invitations 
         SET used_at = ? 
         WHERE id = ?`,
        [dbDateParam(new Date()), invitation.id]
      );

      await getAdapter().commit();
    } catch (error) {
      await getAdapter().rollback();
      throw error;
    }

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
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');

    const now = new Date();
    const invitationRows = await getAdapter().query(
      `SELECT id, email, expires_at FROM invitations 
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
      [tokenHash, dbDateParam(now)]
    );
    const invitation = invitationRows[0] as any;

    if (!invitation) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired invitation token',
      });
    }

    const siteRows = await getAdapter().query(
      `SELECT s.id as site_id, s.name as site_name, s.code as site_code, isites.site_role
       FROM invitation_sites isites
       JOIN sites s ON s.id = isites.site_id
       WHERE isites.invitation_id = ?`,
      [invitation.id]
    );

    res.json({
      success: true,
      data: {
        email: invitation.email,
        expiresAt: invitation.expires_at,
        sites: siteRows,
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
    const requesterRole = req.user!.role as string;

    let users: any[] = [];

    if (requesterRole === 'GLOBAL_ADMIN') {
      users = await getAdapter().query(
        `SELECT 
          u.id, u.email, u.full_name, u.role, u.is_active, u.created_at, u.updated_at,
          COUNT(DISTINCT sm.site_id) as site_count,
          COUNT(DISTINCT l.id) as label_count
        FROM users u
        LEFT JOIN site_memberships sm ON sm.user_id = u.id
        LEFT JOIN labels l ON l.site_id = sm.site_id AND l.created_by = u.id
        GROUP BY u.id
        ORDER BY u.created_at DESC`
      );
    } else {
      const siteRows = await getAdapter().query(
        `SELECT site_id FROM site_memberships WHERE user_id = ?`,
        [req.user!.userId]
      );
      const siteIds = siteRows.map((row: any) => row.site_id);
      if (siteIds.length === 0) {
        return res.json({
          success: true,
          data: { users: [] },
        });
      }

      const placeholders = siteIds.map(() => '?').join(', ');
      users = await getAdapter().query(
        `SELECT 
          u.id, u.email, u.full_name, u.role, u.is_active, u.created_at, u.updated_at,
          COUNT(DISTINCT sm.site_id) as site_count,
          COUNT(DISTINCT l.id) as label_count
        FROM users u
        JOIN site_memberships sm ON sm.user_id = u.id AND sm.site_id IN (${placeholders})
        LEFT JOIN labels l ON l.site_id = sm.site_id AND l.created_by = u.id
        GROUP BY u.id
        ORDER BY u.created_at DESC`,
        siteIds
      );
    }

    // Apply filters in-memory
    let filteredUsers = users;
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

    if (!role || !['GLOBAL_ADMIN', 'ADMIN', 'USER'].includes(role)) {
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

    const requesterRole = req.user!.role as string;
    if (role === 'GLOBAL_ADMIN' && requesterRole !== 'GLOBAL_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only Global Admin can assign Global Admin role',
      });
    }

    if (requesterRole !== 'GLOBAL_ADMIN') {
      const accessRows = await getAdapter().query(
        `SELECT 1
         FROM site_memberships sm1
         JOIN site_memberships sm2 ON sm1.site_id = sm2.site_id
         WHERE sm1.user_id = ? AND sm2.user_id = ?
         LIMIT 1`,
        [req.user!.userId, userId]
      );

      if (accessRows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'You can only manage users within your sites',
        });
      }
    }

    // Update user role
    const validRole = role as 'GLOBAL_ADMIN' | 'ADMIN' | 'USER';
    const result = await getAdapter().execute(
      'UPDATE users SET role = ?, updated_at = ? WHERE id = ?',
      [validRole, dbDateParam(new Date()), userId]
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
 * GET /api/admin/users/:id/sites - List user site memberships
 */
router.get('/users/:id/sites', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(String(req.params.id));
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    const requesterRole = req.user!.role as string;
    let params: any[] = [userId];
    let siteFilter = '';

    if (requesterRole !== 'GLOBAL_ADMIN') {
      const siteRows = await getAdapter().query(
        `SELECT site_id FROM site_memberships WHERE user_id = ?`,
        [req.user!.userId]
      );
      const siteIds = siteRows.map((row: any) => row.site_id);
      if (siteIds.length === 0) {
        return res.json({
          success: true,
          data: { sites: [] },
        });
      }

      const placeholders = siteIds.map(() => '?').join(', ');
      siteFilter = `AND sm.site_id IN (${placeholders})`;
      params = [userId, ...siteIds];
    }

    const memberships = await getAdapter().query(
      `SELECT sm.site_id, sm.site_role, s.name as site_name, s.code as site_code
       FROM site_memberships sm
       JOIN sites s ON s.id = sm.site_id
       WHERE sm.user_id = ?
       ${siteFilter}
       ORDER BY s.name ASC`,
      params
    );

    res.json({
      success: true,
      data: { sites: memberships },
    });
  } catch (error) {
    console.error('Error fetching user sites:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user sites',
    });
  }
});

/**
 * PUT /api/admin/users/:id/sites - Replace user site memberships
 */
router.put('/users/:id/sites', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(String(req.params.id));
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID',
      });
    }

    const validation = updateUserSitesSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validation.error.errors,
      });
    }

    const { sites } = validation.data;
    const siteIds = sites.map(site => site.site_id);

    const requesterRole = req.user!.role as string;
    if (requesterRole !== 'GLOBAL_ADMIN') {
      const siteRows = await getAdapter().query(
        `SELECT site_id FROM site_memberships WHERE user_id = ?`,
        [req.user!.userId]
      );
      const allowedSiteIds = siteRows.map((row: any) => row.site_id);

      const disallowed = siteIds.filter(id => !allowedSiteIds.includes(id));
      if (disallowed.length > 0) {
        return res.status(403).json({
          success: false,
          error: 'You can only assign users to sites you have access to',
        });
      }
    }

    await getAdapter().beginTransaction();
    try {
      if (siteIds.length > 0) {
        const placeholders = siteIds.map(() => '?').join(', ');
        await getAdapter().execute(
          `DELETE FROM site_memberships WHERE user_id = ? AND site_id IN (${placeholders})`,
          [userId, ...siteIds]
        );
      }

      for (const site of sites) {
        await getAdapter().execute(
          `INSERT INTO site_memberships (site_id, user_id, site_role)
           VALUES (?, ?, ?)`,
          [site.site_id, userId, site.site_role]
        );
      }

      await getAdapter().commit();
    } catch (error) {
      await getAdapter().rollback();
      throw error;
    }

    res.json({
      success: true,
      message: 'User site memberships updated successfully',
    });
  } catch (error) {
    console.error('Error updating user sites:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user sites',
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
    const user = await getUserModel().findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const requesterRole = req.user!.role as string;
    if (requesterRole !== 'GLOBAL_ADMIN') {
      const accessRows = await getAdapter().query(
        `SELECT 1
         FROM site_memberships sm1
         JOIN site_memberships sm2 ON sm1.site_id = sm2.site_id
         WHERE sm1.user_id = ? AND sm2.user_id = ?
         LIMIT 1`,
        [req.user!.userId, userId]
      );

      if (accessRows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'You can only manage users within your sites',
        });
      }
    }

    // Prevent self-deletion
    if (userId === req.user!.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account',
      });
    }

    // Hard-delete user and their associated data
    // NOTE: schema uses labels.created_by and sites.created_by (not user_id)
    const adapter = getAdapter();
    try {
      await adapter.beginTransaction();

      // Invitations sent by this user
      await adapter.execute(
        'DELETE FROM invitation_sites WHERE invitation_id IN (SELECT id FROM invitations WHERE invited_by = ?)',
        [userId]
      );
      await adapter.execute('DELETE FROM invitations WHERE invited_by = ?', [userId]);

      // Memberships for this user
      await adapter.execute('DELETE FROM site_memberships WHERE user_id = ?', [userId]);

      // Data created/owned by this user
      await adapter.execute('DELETE FROM labels WHERE created_by = ?', [userId]);
      await adapter.execute('DELETE FROM sites WHERE created_by = ?', [userId]);

      // Finally delete the user
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
    const defaultSettings = {
      default_user_role: 'user',
      max_labels_per_user: null as number | null,
      max_sites_per_user: null as number | null,
      maintenance_mode: false,
      maintenance_message: 'System is under maintenance. Please try again later.',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // app_settings is a key/value table (see migrations)
    const keys = [
      'default_user_role',
      'max_labels_per_user',
      'max_sites_per_user',
      'maintenance_mode',
      'maintenance_message',
    ] as const;

    const placeholders = keys.map(() => '?').join(', ');
    const rows = await getAdapter().query(
      `SELECT \`key\` AS setting_key, \`value\` AS setting_value FROM app_settings WHERE \`key\` IN (${placeholders})`,
      [...keys]
    );

    const map = new Map<string, string>();
    for (const row of rows as any[]) {
      if (row?.setting_key) {
        map.set(String(row.setting_key), String(row.setting_value ?? ''));
      }
    }

    const parseNullableNumber = (value: string | undefined): number | null => {
      if (value === undefined) return null;
      const trimmed = String(value).trim();
      if (trimmed.length === 0) return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const parseBoolean = (value: string | undefined): boolean => {
      if (value === undefined) return false;
      const trimmed = String(value).trim().toLowerCase();
      return trimmed === 'true' || trimmed === '1' || trimmed === 'yes';
    };

    const settings = {
      ...defaultSettings,
      default_user_role: map.get('default_user_role') || defaultSettings.default_user_role,
      max_labels_per_user: parseNullableNumber(map.get('max_labels_per_user')),
      max_sites_per_user: parseNullableNumber(map.get('max_sites_per_user')),
      maintenance_mode: parseBoolean(map.get('maintenance_mode')),
      maintenance_message: map.get('maintenance_message') || defaultSettings.maintenance_message,
    };

    res.json({
      success: true,
      data: { settings },
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
      default_user_role,
      max_labels_per_user,
      max_sites_per_user,
      maintenance_mode,
      maintenance_message,
    } = req.body;

    const normalizeLimit = (value: any): number | null => {
      if (value === '' || value === null || value === undefined) return null;
      const parsed = Number(value);
      if (Number.isNaN(parsed)) return NaN;
      return parsed;
    };

    const normalizedMaxLabels = normalizeLimit(max_labels_per_user);
    const normalizedMaxSites = normalizeLimit(max_sites_per_user);

    if (!['user', 'moderator'].includes(default_user_role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid default user role',
      });
    }

    if (normalizedMaxLabels !== null && (!Number.isFinite(normalizedMaxLabels) || normalizedMaxLabels < 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid max labels per user value',
      });
    }

    if (normalizedMaxSites !== null && (!Number.isFinite(normalizedMaxSites) || normalizedMaxSites < 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid max sites per user value',
      });
    }

    // Persist settings in app_settings key/value table
    const adapter = getAdapter();
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    const nowParam = dbDateParam(new Date());

    const settingsToPersist: Array<{ key: string; value: string }> = [
      { key: 'default_user_role', value: String(default_user_role) },
      { key: 'max_labels_per_user', value: normalizedMaxLabels === null ? '' : String(normalizedMaxLabels) },
      { key: 'max_sites_per_user', value: normalizedMaxSites === null ? '' : String(normalizedMaxSites) },
      { key: 'maintenance_mode', value: maintenance_mode ? 'true' : 'false' },
      { key: 'maintenance_message', value: maintenance_message ? String(maintenance_message) : '' },
    ];

    const upsertSql = isMySQL
      ? `INSERT INTO app_settings (\`key\`, value, updated_at, created_at)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)`
      : `INSERT INTO app_settings (key, value, updated_at, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;

    await adapter.beginTransaction();
    try {
      for (const entry of settingsToPersist) {
        await adapter.execute(upsertSql, [entry.key, entry.value, nowParam, nowParam]);
      }
      await adapter.commit();
    } catch (err) {
      await adapter.rollback();
      throw err;
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
router.get('/stats', authenticateToken, requireAdmin, resolveSiteAccess(req => Number(req.query.site_id)), async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const thirtyDaysAgoParam = dbDateParam(thirtyDaysAgo);
    const todayStartParam = dbDateParam(todayStart);

    const siteId = req.site!.id;

    // User statistics (site-scoped)
    const userStatsRows = await getAdapter().query(
      `SELECT 
        COUNT(DISTINCT u.id) as total,
        COUNT(DISTINCT CASE WHEN u.created_at >= ? THEN u.id END) as new_this_month,
        COUNT(DISTINCT CASE WHEN u.id IN (
          SELECT DISTINCT created_by FROM labels WHERE site_id = ? AND created_at >= ?
        ) THEN u.id END) as active_this_month
      FROM users u
      JOIN site_memberships sm ON sm.user_id = u.id
      WHERE sm.site_id = ?`,
      [thirtyDaysAgoParam, siteId, thirtyDaysAgoParam, siteId]
    );
    const userStats = userStatsRows[0] as any;

    const roleStats = await getAdapter().query(
      `SELECT 
        u.role,
        COUNT(DISTINCT u.id) as count
      FROM users u
      JOIN site_memberships sm ON sm.user_id = u.id
      WHERE sm.site_id = ?
      GROUP BY u.role`,
      [siteId]
    ) as any[];

    const usersByRole = {
      GLOBAL_ADMIN: 0,
      ADMIN: 0,
      USER: 0,
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
      FROM labels
      WHERE site_id = ?`,
      [thirtyDaysAgoParam, todayStartParam, siteId]
    );
    const labelStats = labelStatsRows[0] as any;

    const mostActiveUserRows = await getAdapter().query(
      `SELECT 
        u.full_name,
        COUNT(l.id) as count
      FROM users u
      JOIN labels l ON u.id = l.created_by
      WHERE l.site_id = ?
      GROUP BY u.id, u.full_name
      ORDER BY count DESC
      LIMIT 1`,
      [siteId]
    );
    const mostActiveUser = mostActiveUserRows[0] as any;

    // Site statistics
    const siteStatsRows = await getAdapter().query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as created_this_month,
        CAST(COUNT(l.id) AS REAL) as average_labels_per_site
      FROM sites s
      LEFT JOIN labels l ON s.id = l.site_id
      WHERE s.id = ?
      GROUP BY s.id`,
      [thirtyDaysAgoParam, siteId]
    );
    const siteStats = siteStatsRows[0] as any;

    // Recent activity
    const recentRegistrations = await getAdapter().query(
      `SELECT u.id, u.full_name, u.email, u.role, u.created_at
       FROM users u
       JOIN site_memberships sm ON sm.user_id = u.id
       WHERE sm.site_id = ?
       ORDER BY u.created_at DESC
       LIMIT 5`,
      [siteId]
    );

    const recentLabels = await getAdapter().query(
      `SELECT 
        l.id,
        l.ref_string as reference_number,
        l.created_at,
        u.full_name as user_name,
        s.name as site_name
      FROM labels l
      JOIN users u ON l.created_by = u.id
      JOIN sites s ON l.site_id = s.id
      WHERE l.site_id = ?
      ORDER BY l.created_at DESC
      LIMIT 5`,
      [siteId]
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
import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import UserModel from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin, requireGlobalRole, resolveSiteAccess } from '../middleware/permissions.js';
import connection from '../database/connection.js';
import { buildInviteUrl, isSmtpConfigured, sendInviteEmailIfConfigured } from '../services/InvitationEmailService.js';

const router = express.Router();
const getUserModel = () => new UserModel();
const getAdapter = () => connection.getAdapter();

const isMySQL = () => connection.getConfig()?.type === 'mysql';
const dbDateParam = (date: Date): Date | string => {
  // mysql2 can safely bind JS Date objects; SQLite expects text
  if (isMySQL()) return date;
  return date.toISOString();
};

/**
 * GET /api/admin/overview - Admin notification counts (admin only)
 */
router.get('/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const requesterRole = req.user!.role as string;
    const now = new Date();

    let siteFilter = '';
    let siteParams: any[] = [];

    if (requesterRole !== 'GLOBAL_ADMIN') {
      const siteRows = await getAdapter().query(
        `SELECT site_id FROM site_memberships WHERE user_id = ? AND site_role = 'ADMIN'`,
        [req.user!.userId]
      );
      const siteIds = (siteRows as any[]).map(r => Number(r.site_id)).filter(Boolean);
      if (siteIds.length === 0) {
        const smtp_configured = await isSmtpConfigured();
        return res.json({
          success: true,
          data: {
            overview: {
              pending_invites_count: 0,
              expired_invites_count: 0,
              users_without_sites_count: 0,
              smtp_configured,
            },
          },
        });
      }

      const placeholders = siteIds.map(() => '?').join(', ');
      siteFilter = `AND isites.site_id IN (${placeholders})`;
      siteParams = siteIds;
    }

    const pendingRows = await getAdapter().query(
      `SELECT COUNT(DISTINCT i.id) AS count
       FROM invitations i
       JOIN invitation_sites isites ON isites.invitation_id = i.id
       WHERE i.used_at IS NULL
         AND i.expires_at > ?
       ${siteFilter}`,
      [dbDateParam(now), ...siteParams]
    );

    const expiredRows = await getAdapter().query(
      `SELECT COUNT(DISTINCT i.id) AS count
       FROM invitations i
       JOIN invitation_sites isites ON isites.invitation_id = i.id
       WHERE i.used_at IS NULL
         AND i.expires_at <= ?
       ${siteFilter}`,
      [dbDateParam(now), ...siteParams]
    );

    const usersWithoutSitesRows = await getAdapter().query(
      `SELECT COUNT(*) AS count
       FROM users u
       LEFT JOIN site_memberships sm ON sm.user_id = u.id
       WHERE sm.user_id IS NULL`
    );

    const smtp_configured = await isSmtpConfigured();

    const pending_invites_count = Number((pendingRows as any[])?.[0]?.count || 0);
    const expired_invites_count = Number((expiredRows as any[])?.[0]?.count || 0);
    const users_without_sites_count = Number((usersWithoutSitesRows as any[])?.[0]?.count || 0);

    return res.json({
      success: true,
      data: {
        overview: {
          pending_invites_count,
          expired_invites_count,
          users_without_sites_count,
          smtp_configured,
        },
      },
    });
  } catch (error) {
    console.error('Error loading admin overview:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load admin overview',
    });
  }
});

// Validation schemas
const inviteUserSchema = z.object({
  email: z.string().email(),
  // Admin-assigned username (display name). Email remains the login identifier.
  username: z.string().min(1, 'Username is required').max(100, 'Username must be less than 100 characters'),
  sites: z.array(z.object({
    site_id: z.number().min(1),
    site_role: z.enum(['ADMIN', 'USER']).default('USER'),
  })).min(1),
  role: z.enum(['GLOBAL_ADMIN', 'ADMIN', 'USER']).optional(),
  expires_in_days: z.number().int().min(1).max(30).optional().default(7),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
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

    const { email, sites, expires_in_days } = validation.data;
    const username = String(validation.data.username).trim();

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
         WHERE user_id = ? AND site_role = 'ADMIN' AND site_id IN (${placeholders})`,
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
    const expiresAt = new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000);

    await getAdapter().beginTransaction();
    let invitationId: number | undefined;

    try {
      // Create invitation record
      const result = await getAdapter().execute(
        `INSERT INTO invitations (email, username, token_hash, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [email, username, tokenHash, req.user!.userId, dbDateParam(expiresAt)]
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
      inviteeName: username,
      inviterName: String(req.user?.email || 'An Admin'),
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
        username,
        token, // In production, don't return the token
        invite_url,
        email_sent: emailResult.email_sent,
        ...(emailResult.email_error ? { email_error: emailResult.email_error } : {}),
        expiresAt: expiresAt.toISOString(),
        expires_in_days,
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
        i.username,
        i.expires_at,
        i.used_at,
        i.created_at,
        u.username as invited_by_name,
        isites.site_id,
        isites.site_role,
        s.name as site_name,
        s.code as site_code
      FROM invitations i
      JOIN users u ON i.invited_by = u.id
      JOIN invitation_sites isites ON isites.invitation_id = i.id
      JOIN sites s ON s.id = isites.site_id
      WHERE 1=1
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
          username: row.username,
          expires_at: row.expires_at,
          used_at: row.used_at,
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

const invitationActionSchema = z.object({
  expires_in_days: z.number().int().min(1).max(30).optional(),
});

const assertInvitationAccess = async (invitationId: number, requester: any) => {
  const requesterRole = requester.role as string;
  if (requesterRole === 'GLOBAL_ADMIN') return;

  const accessRows = await getAdapter().query(
    `SELECT 1
     FROM invitation_sites isites
     JOIN site_memberships sm ON sm.site_id = isites.site_id
     WHERE isites.invitation_id = ? AND sm.user_id = ?
     LIMIT 1`,
    [invitationId, requester.userId]
  );

  if (accessRows.length === 0) {
    const err: any = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }
};

const rotateInvitationToken = async (invitationId: number, opts: { expiresInDays?: number }) => {
  const rows = await getAdapter().query(
    `SELECT id, email, username, expires_at, used_at
     FROM invitations
     WHERE id = ?
     LIMIT 1`,
    [invitationId]
  );
  const invitation = rows[0] as any;
  if (!invitation) {
    const err: any = new Error('Invitation not found');
    err.statusCode = 404;
    throw err;
  }
  if (invitation.used_at) {
    const err: any = new Error('Invite already used');
    err.statusCode = 409;
    throw err;
  }

  const now = new Date();
  const currentExpires = new Date(invitation.expires_at);
  const shouldExtend = !Number.isNaN(currentExpires.getTime()) && currentExpires <= now;
  const effectiveDays = opts.expiresInDays ?? (shouldExtend ? 7 : undefined);
  const nextExpiresAt = effectiveDays ? new Date(Date.now() + effectiveDays * 24 * 60 * 60 * 1000) : currentExpires;

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await getAdapter().execute(
    `UPDATE invitations
     SET token_hash = ?, expires_at = ?
     WHERE id = ? AND used_at IS NULL`,
    [tokenHash, dbDateParam(nextExpiresAt), invitationId]
  );

  if (result.affectedRows === 0) {
    const err: any = new Error('Invitation not found or already used');
    err.statusCode = 404;
    throw err;
  }

  return {
    invitation: {
      id: invitation.id,
      email: invitation.email,
      username: invitation.username,
      expires_at: nextExpiresAt,
    },
    token,
    expires_at: nextExpiresAt,
  };
};

/**
 * POST /api/admin/invitations/:id/link - Rotate token and return a fresh invite URL (admin only)
 */
router.post('/invitations/:id/link', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const invitationId = parseInt(String(req.params.id));
    if (isNaN(invitationId)) {
      return res.status(400).json({ success: false, error: 'Invalid invitation ID' });
    }

    const validation = invitationActionSchema.safeParse(req.body ?? {});
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validation.error.errors,
      });
    }

    await assertInvitationAccess(invitationId, req.user);

    const rotated = await rotateInvitationToken(
      invitationId,
      validation.data.expires_in_days ? { expiresInDays: validation.data.expires_in_days } : {}
    );

    const baseUrl = (process.env.APP_URL && String(process.env.APP_URL).trim())
      ? String(process.env.APP_URL)
      : `${req.protocol}://${req.get('host')}`;
    const invite_url = buildInviteUrl(rotated.token, baseUrl);

    res.json({
      success: true,
      data: {
        invite_url,
        expires_at: rotated.expires_at.toISOString(),
      },
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 500;
    if (statusCode >= 500) {
      console.error('Error rotating invitation link:', error);
    }
    res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to rotate invitation link',
    });
  }
});

/**
 * POST /api/admin/invitations/:id/resend - Rotate token, optionally extend expiry, and send email (admin only)
 */
router.post('/invitations/:id/resend', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const invitationId = parseInt(String(req.params.id));
    if (isNaN(invitationId)) {
      return res.status(400).json({ success: false, error: 'Invalid invitation ID' });
    }

    const validation = invitationActionSchema.safeParse(req.body ?? {});
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: validation.error.errors,
      });
    }

    await assertInvitationAccess(invitationId, req.user);

    const rotated = await rotateInvitationToken(invitationId, {
      expiresInDays: validation.data.expires_in_days ?? 7,
    });

    const baseUrl = (process.env.APP_URL && String(process.env.APP_URL).trim())
      ? String(process.env.APP_URL)
      : `${req.protocol}://${req.get('host')}`;
    const invite_url = buildInviteUrl(rotated.token, baseUrl);

    const emailResult = await sendInviteEmailIfConfigured({
      to: rotated.invitation.email,
      inviteeName: rotated.invitation.username,
      inviterName: String(req.user?.email || 'An Admin'),
      inviteUrl: invite_url,
      expiresAtIso: rotated.expires_at.toISOString(),
    });

    res.json({
      success: true,
      data: {
        invite_url,
        expires_at: rotated.expires_at.toISOString(),
        email_sent: emailResult.email_sent,
        ...(emailResult.email_error ? { email_error: emailResult.email_error } : {}),
      },
    });
  } catch (error: any) {
    const statusCode = Number(error?.statusCode) || 500;
    if (statusCode >= 500) {
      console.error('Error resending invitation:', error);
    }
    res.status(statusCode).json({
      success: false,
      error: error?.message || 'Failed to resend invitation',
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

    const { token, password } = validation.data;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find invitation (differentiate used vs expired vs invalid)
    const now = new Date();
    const invitationRows = await getAdapter().query(
      `SELECT id, email, username, expires_at, used_at
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

    const username = String((invitation.username || '')).trim();
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Invitation is missing a username',
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
        username,
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
      `SELECT id, email, username, expires_at FROM invitations 
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
        username: invitation.username,
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
          u.id, u.email, u.username, u.role, u.is_active, u.created_at, u.updated_at,
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
        `SELECT site_id FROM site_memberships WHERE user_id = ? AND site_role = 'ADMIN'`,
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
          u.id, u.email, u.username, u.role, u.is_active, u.created_at, u.updated_at,
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
        u.username?.toLowerCase().includes(searchLower) ||
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

    const requesterRole = req.user!.role as string;

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

    // Site Admin restrictions
    if (requesterRole !== 'GLOBAL_ADMIN') {
      if (user.role === 'GLOBAL_ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Site Admin cannot modify Global Admin users',
        });
      }

      if (role === 'GLOBAL_ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Site Admin cannot set role to Global Admin',
        });
      }

      // Ensure target user is within the requester's admin site scope
      const adminSiteRows = await getAdapter().query(
        `SELECT site_id FROM site_memberships WHERE user_id = ? AND site_role = 'ADMIN'`,
        [req.user!.userId]
      );
      const adminSiteIds = (adminSiteRows as any[]).map(r => Number(r.site_id)).filter(Boolean);
      if (adminSiteIds.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'No admin site scope available',
        });
      }

      const placeholders = adminSiteIds.map(() => '?').join(', ');
      const inScopeRows = await getAdapter().query(
        `SELECT 1 AS ok FROM site_memberships WHERE user_id = ? AND site_id IN (${placeholders}) LIMIT 1`,
        [userId, ...adminSiteIds]
      );
      if ((inScopeRows as any[]).length === 0) {
        return res.status(403).json({
          success: false,
          error: 'You can only modify users within your site scope',
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
        `SELECT site_id FROM site_memberships WHERE user_id = ? AND site_role = 'ADMIN'`,
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
    // Load target user so we can enforce Global Admin protection
    const targetUser = await getUserModel().findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    let allowedSiteIds: number[] | null = null;

    if (requesterRole !== 'GLOBAL_ADMIN') {
      if (targetUser.role === 'GLOBAL_ADMIN') {
        return res.status(403).json({
          success: false,
          error: 'Site Admin cannot modify Global Admin users',
        });
      }

      const siteRows = await getAdapter().query(
        `SELECT site_id FROM site_memberships WHERE user_id = ? AND site_role = 'ADMIN'`,
        [req.user!.userId]
      );
      allowedSiteIds = (siteRows as any[]).map((row: any) => Number(row.site_id)).filter(Boolean);

      if (allowedSiteIds.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'No admin site scope available',
        });
      }

      // Ensure target user is within the requester's admin site scope
      const scopePlaceholders = allowedSiteIds.map(() => '?').join(', ');
      const inScopeRows = await getAdapter().query(
        `SELECT 1 AS ok FROM site_memberships WHERE user_id = ? AND site_id IN (${scopePlaceholders}) LIMIT 1`,
        [userId, ...allowedSiteIds]
      );
      if ((inScopeRows as any[]).length === 0) {
        return res.status(403).json({
          success: false,
          error: 'You can only modify users within your site scope',
        });
      }

      const disallowed = siteIds.filter(id => !allowedSiteIds!.includes(id));
      if (disallowed.length > 0) {
        return res.status(403).json({
          success: false,
          error: 'You can only assign users to sites within your admin scope',
        });
      }
    }

    await getAdapter().beginTransaction();
    try {
      if (requesterRole === 'GLOBAL_ADMIN') {
        // Replace all memberships
        await getAdapter().execute(
          `DELETE FROM site_memberships WHERE user_id = ?`,
          [userId]
        );
      } else {
        // Replace memberships only within the requester's admin scope
        const placeholders = (allowedSiteIds || []).map(() => '?').join(', ');
        await getAdapter().execute(
          `DELETE FROM site_memberships WHERE user_id = ? AND site_id IN (${placeholders})`,
          [userId, ...(allowedSiteIds || [])]
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

    const requesterRole = req.user!.role as string;
    if (requesterRole !== 'GLOBAL_ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Only Global Admin can delete users',
      });
    }

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

    // requesterRole is GLOBAL_ADMIN (enforced above)

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
      smtp_host: '',
      smtp_port: null as number | null,
      smtp_username: '',
      smtp_password: '',
      smtp_password_set: false,
      smtp_from: '',
      smtp_secure: false,
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
      'smtp_host',
      'smtp_port',
      'smtp_username',
      'smtp_password',
      'smtp_from',
      'smtp_secure',
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
      smtp_host: map.get('smtp_host') || defaultSettings.smtp_host,
      smtp_port: parseNullableNumber(map.get('smtp_port')),
      smtp_username: map.get('smtp_username') || defaultSettings.smtp_username,
      smtp_password: '',
      smtp_password_set: Boolean((map.get('smtp_password') || '').trim()),
      smtp_from: map.get('smtp_from') || defaultSettings.smtp_from,
      smtp_secure: parseBoolean(map.get('smtp_secure')),
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
      smtp_host,
      smtp_port,
      smtp_username,
      smtp_password,
      smtp_from,
      smtp_secure,
    } = req.body;

    const hasOwn = (key: string): boolean => Object.prototype.hasOwnProperty.call(req.body ?? {}, key);

    const normalizeLimit = (value: any): number | null => {
      if (value === '' || value === null || value === undefined) return null;
      const parsed = Number(value);
      if (Number.isNaN(parsed)) return NaN;
      return parsed;
    };

    const normalizedMaxLabels = hasOwn('max_labels_per_user') ? normalizeLimit(max_labels_per_user) : undefined;
    const normalizedMaxSites = hasOwn('max_sites_per_user') ? normalizeLimit(max_sites_per_user) : undefined;

    if (!['user', 'moderator'].includes(default_user_role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid default user role',
      });
    }

    if (normalizedMaxLabels !== undefined && normalizedMaxLabels !== null && (!Number.isFinite(normalizedMaxLabels) || normalizedMaxLabels < 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid max labels per user value',
      });
    }

    if (normalizedMaxSites !== undefined && normalizedMaxSites !== null && (!Number.isFinite(normalizedMaxSites) || normalizedMaxSites < 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid max sites per user value',
      });
    }

    const normalizedSmtpPort = hasOwn('smtp_port') ? normalizeLimit(smtp_port) : undefined;
    if (normalizedSmtpPort !== undefined && normalizedSmtpPort !== null && (!Number.isFinite(normalizedSmtpPort) || normalizedSmtpPort <= 0 || normalizedSmtpPort > 65535)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid SMTP port',
      });
    }

    // Persist settings in app_settings key/value table
    const adapter = getAdapter();
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    const nowParam = dbDateParam(new Date());

    const settingsToPersist: Array<{ key: string; value: string }> = [];

    settingsToPersist.push({ key: 'default_user_role', value: String(default_user_role) });

    if (normalizedMaxLabels !== undefined) {
      settingsToPersist.push({ key: 'max_labels_per_user', value: normalizedMaxLabels === null ? '' : String(normalizedMaxLabels) });
    }

    if (normalizedMaxSites !== undefined) {
      settingsToPersist.push({ key: 'max_sites_per_user', value: normalizedMaxSites === null ? '' : String(normalizedMaxSites) });
    }

    if (hasOwn('maintenance_mode')) {
      settingsToPersist.push({ key: 'maintenance_mode', value: maintenance_mode ? 'true' : 'false' });
    }

    if (hasOwn('maintenance_message')) {
      settingsToPersist.push({ key: 'maintenance_message', value: maintenance_message ? String(maintenance_message) : '' });
    }

    if (hasOwn('smtp_host')) {
      settingsToPersist.push({ key: 'smtp_host', value: smtp_host ? String(smtp_host) : '' });
    }

    if (normalizedSmtpPort !== undefined) {
      settingsToPersist.push({ key: 'smtp_port', value: normalizedSmtpPort === null ? '' : String(normalizedSmtpPort) });
    }

    if (hasOwn('smtp_username')) {
      settingsToPersist.push({ key: 'smtp_username', value: smtp_username ? String(smtp_username) : '' });
    }

    if (hasOwn('smtp_from')) {
      settingsToPersist.push({ key: 'smtp_from', value: smtp_from ? String(smtp_from) : '' });
    }

    if (hasOwn('smtp_secure')) {
      settingsToPersist.push({ key: 'smtp_secure', value: smtp_secure ? 'true' : 'false' });
    }

    // Do not return passwords in GET responses. For updates, only persist when a real password is provided.
    if (hasOwn('smtp_password')) {
      const pwd = smtp_password === undefined || smtp_password === null ? '' : String(smtp_password);
      const trimmed = pwd.trim();
      const looksMasked = trimmed === '••••••' || trimmed === '******';
      if (trimmed.length > 0 && !looksMasked) {
        settingsToPersist.push({ key: 'smtp_password', value: trimmed });
      }
    }

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
 * POST /api/admin/settings/test-email - Send a test email using configured SMTP (admin only)
 */
router.post('/settings/test-email', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const to = (req.body?.to && String(req.body.to).trim())
      ? String(req.body.to).trim()
      : String((req.user as any)?.email || '').trim();

    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Test email recipient is required',
      });
    }

    const { sendTestEmailIfConfigured } = await import('../services/InvitationEmailService.js');
    const result = await sendTestEmailIfConfigured({ to });

    if (!result.email_sent) {
      return res.status(400).json({
        success: false,
        error: result.email_error || 'SMTP not configured',
      });
    }

    res.json({
      success: true,
      message: 'Test email sent successfully',
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test email',
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
        u.username,
        COUNT(l.id) as count
      FROM users u
      JOIN labels l ON u.id = l.created_by
      WHERE l.site_id = ?
      GROUP BY u.id, u.username
      ORDER BY count DESC
      LIMIT 1`,
      [siteId]
    );
    const mostActiveUser = mostActiveUserRows[0] as any;

    // Site statistics
    const siteStatsRows = await getAdapter().query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN s.created_at >= ? THEN 1 END) as created_this_month,
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
      `SELECT u.id, u.username, u.email, u.role, u.created_at
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
        u.username as user_name,
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
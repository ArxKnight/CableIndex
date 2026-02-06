import { Request, Response, NextFunction } from 'express';
import connection from '../database/connection.js';
import { SiteRole, UserRole } from '../types/index.js';

function normalizeSiteRole(value: unknown): SiteRole | null {
  const raw = String(value ?? '').toUpperCase();
  if (raw === 'SITE_ADMIN') return 'SITE_ADMIN';
  if (raw === 'SITE_USER') return 'SITE_USER';
  return null;
}

async function getAdminSiteIds(userId: number): Promise<number[]> {
  const adapter = connection.getAdapter();
  const rows = await adapter.query(
    `SELECT DISTINCT site_id FROM site_memberships
     WHERE user_id = ? AND site_role = 'SITE_ADMIN'`,
    [userId]
  );
  return (rows as any[]).map(r => Number(r.site_id)).filter(Boolean);
}

/**
 * Middleware to check if user has required role
 */
export const requireGlobalRole = (...allowedRoles: UserRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const userRole = req.user.role as UserRole | undefined;

    if (!userRole || !allowedRoles.includes(userRole)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
      return;
    }

    next();
    return;
  };
};

/**
 * Middleware for Admin UI/API access:
 * - GLOBAL_ADMIN always allowed
 * - otherwise allowed if user is SITE_ADMIN of at least one site
 */
export const requireAdminAccess = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  const userRole = req.user.role as string | undefined;
  if (userRole === 'GLOBAL_ADMIN') {
    next();
    return;
  }

  const siteIds = await getAdminSiteIds(req.user.userId);
  if (siteIds.length === 0) {
    res.status(403).json({
      success: false,
      error: 'Insufficient permissions',
    });
    return;
  }

  next();
  return;
};

/**
 * Middleware to check if user has specific tool permission
 */
export const resolveSiteAccess = (siteIdResolver: (req: Request) => number | undefined) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const siteId = siteIdResolver(req);
      if (!siteId || Number.isNaN(siteId)) {
        res.status(400).json({
          success: false,
          error: 'Site ID is required'
        });
        return;
      }

      const adapter = connection.getAdapter();
      const userRole = req.user.role as UserRole;

      if (userRole === 'GLOBAL_ADMIN') {
        const siteRows = await adapter.query(
          `SELECT id, name, code, created_by, location, description, created_at, updated_at
           FROM sites WHERE id = ?`,
          [siteId]
        );
        const site = siteRows[0] as any;
        if (!site) {
          res.status(404).json({
            success: false,
            error: 'Site not found'
          });
          return;
        }

        req.site = site;
        req.siteRole = 'SITE_ADMIN';
        next();
        return;
      }

      const rows = await adapter.query(
        `SELECT s.id, s.name, s.code, s.created_by, s.location, s.description, s.created_at, s.updated_at,
                sm.site_role
         FROM sites s
         JOIN site_memberships sm ON sm.site_id = s.id
         WHERE s.id = ? AND sm.user_id = ?`,
        [siteId, req.user.userId]
      );

      const result = rows[0] as any;
      if (!result) {
        const siteExistsRows = await adapter.query(
          `SELECT id FROM sites WHERE id = ?`,
          [siteId]
        );

        if (!siteExistsRows.length) {
          res.status(404).json({
            success: false,
            error: 'Site not found'
          });
          return;
        }

        res.status(403).json({
          success: false,
          error: 'Site access denied'
        });
        return;
      }

      req.site = {
        id: result.id,
        name: result.name,
        code: result.code,
        created_by: result.created_by,
        location: result.location,
        description: result.description,
        created_at: result.created_at,
        updated_at: result.updated_at
      };
      const normalized = normalizeSiteRole(result.site_role);
      if (!normalized) {
        res.status(403).json({
          success: false,
          error: 'Insufficient site permissions',
        });
        return;
      }

      req.siteRole = normalized;

      next();
      return;
    } catch (error) {
      console.error('Resolve site access error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to resolve site access'
      });
    }
  };
};

export const requireSiteRole = (...allowedRoles: SiteRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const userRole = req.user.role as UserRole | undefined;
    if (userRole === 'GLOBAL_ADMIN') {
      next();
      return;
    }

    const siteRole = req.siteRole as SiteRole | undefined;
    if (!siteRole || !allowedRoles.includes(siteRole)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient site permissions'
      });
      return;
    }

    next();
    return;
  };
};

/**
 * Global admin only.
 */
export const requireAdmin = requireGlobalRole('GLOBAL_ADMIN');

/**
 * Global admin only.
 */
export const requireModerator = requireGlobalRole('GLOBAL_ADMIN');

/**
 * Middleware to check if user owns the resource or is admin
 */
export const requireOwnershipOrAdmin = (userIdField: string = 'user_id') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
      return;
    }

    const userId = req.user.userId;
    const userRole = req.user.role as UserRole | undefined;

    if (userRole === 'GLOBAL_ADMIN') {
      next();
      return;
    }

    // Check ownership based on request parameters or body
    const resourceUserId = req.params[userIdField] || req.body[userIdField];
    
    if (resourceUserId && parseInt(resourceUserId) !== userId) {
      res.status(403).json({ 
        success: false,
        error: 'Access denied. You can only access your own resources.' 
      });
      return;
    }

    next();
    return;
  };
};

/**
 * Middleware to check if user can manage other users (admin only for now)
 */
export const requireUserManagement = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    res.status(401).json({ 
      success: false,
      error: 'Authentication required' 
    });
    return;
  }

  const userRole = req.user.role as UserRole | undefined;
  if (userRole !== 'GLOBAL_ADMIN') {
    res.status(403).json({
      success: false,
      error: 'Insufficient permissions'
    });
    return;
  }

  next();
  return;
};

// Default export for backward compatibility
const permissions = requireGlobalRole;
export default permissions;
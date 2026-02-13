import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/jwt.js';
import { Site, SiteRole } from '../types/index.js';
import connection from '../database/connection.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      userId?: number;
      site?: Site;
      siteRole?: SiteRole;
    }
  }
}

/**
 * Authentication middleware to verify JWT tokens
 */
const upsertUserActivity = async (userId: number, fields: { lastActivity?: Date; lastLogin?: Date }) => {
  if (!Number.isFinite(userId) || userId <= 0) return;
  if (!connection.isConnected()) return;

  const adapter = connection.getAdapter();
  const lastActivity = fields.lastActivity ?? null;
  const lastLogin = fields.lastLogin ?? null;

  await adapter.execute(
    `INSERT INTO user_activity (user_id, last_activity, last_login)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       last_activity = COALESCE(VALUES(last_activity), last_activity),
       last_login = COALESCE(VALUES(last_login), last_login)`,
    [userId, lastActivity, lastLogin]
  );
};

export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    if (!token) {
      res.status(401).json({ 
        success: false,
        error: 'Access denied. No token provided.' 
      });
      return;
    }

    const decoded = verifyToken(token);
    // Backward compatibility: normalize legacy global roles.
    if (decoded) {
      const rawRole = String((decoded as any).role ?? '').toUpperCase();
      if (rawRole === 'ADMIN') (decoded as any).role = 'GLOBAL_ADMIN';
      if (rawRole === 'MODERATOR') (decoded as any).role = 'USER';
    }
    req.user = decoded;
    req.userId = decoded.userId;

    try {
      await upsertUserActivity(decoded.userId, { lastActivity: new Date() });
    } catch (error) {
      console.warn('⚠️ Failed to update user activity:', error);
    }

    next();
    return;
  } catch (error) {
    res.status(401).json({ 
      success: false,
      error: 'Invalid or expired token.' 
    });
    return;
  }
};

export const requireAuth = authenticateToken;

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    if (token) {
      const decoded = verifyToken(token);
      // Backward compatibility: normalize legacy global roles.
      if (decoded) {
        const rawRole = String((decoded as any).role ?? '').toUpperCase();
        if (rawRole === 'ADMIN') (decoded as any).role = 'GLOBAL_ADMIN';
        if (rawRole === 'MODERATOR') (decoded as any).role = 'USER';
      }
      req.user = decoded;
      req.userId = decoded.userId;

      void upsertUserActivity(decoded.userId, { lastActivity: new Date() }).catch((error) => {
        console.warn('⚠️ Failed to update optional user activity:', error);
      });
    }
    
    next();
    return;
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
    return;
  }
};

// Default export for backward compatibility
export default authenticateToken;
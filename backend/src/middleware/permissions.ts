import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/index.js';

/**
 * Middleware to check if user has required role
 */
export const requireRole = (requiredRole: UserRole) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
      return;
    }

    const userRole = req.user.role as UserRole | undefined;
    
    // Check role hierarchy
    const roleHierarchy: Record<UserRole, number> = {
      admin: 3,
      moderator: 2,
      user: 1,
    };

    if (!userRole || roleHierarchy[userRole] < roleHierarchy[requiredRole]) {
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
 * Middleware to check if user has specific tool permission
 */
export const requireToolPermission = (toolName: string, action: 'create' | 'read' | 'update' | 'delete') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
      return;
    }

    // For now, allow all authenticated users to perform actions
    // Tool-level permissions can be implemented later with a permissions table
    next();
    return;
  };
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = requireRole('admin');

/**
 * Middleware to check if user is moderator or admin
 */
export const requireModerator = requireRole('moderator');

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
    
    // Admin can access everything
    const roleHierarchy: Record<UserRole, number> = {
      admin: 3,
      moderator: 2,
      user: 1,
    };

    if (userRole && roleHierarchy[userRole] >= roleHierarchy['admin']) {
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

  const userId = req.user.userId;
  
  // User management is admin-only (handled by requireRole middleware above)
  // No additional permission check needed

  next();
  return;
};

// Default export for backward compatibility
const permissions = requireRole;
export default permissions;
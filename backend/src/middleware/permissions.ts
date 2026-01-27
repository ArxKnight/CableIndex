import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/index.js';
import RoleService from '../services/RoleService.js';

const getRoleService = () => new RoleService();

/**
 * Middleware to check if user has required role
 */
export const requireRole = (requiredRole: UserRole) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
    }

    const userId = req.user.userId;
    
    if (!getRoleService().hasRole(userId, requiredRole)) {
      return res.status(403).json({ 
        success: false,
        error: 'Insufficient permissions' 
      });
    }

    next();
  };
};

/**
 * Middleware to check if user has specific tool permission
 */
export const requireToolPermission = (toolName: string, action: 'create' | 'read' | 'update' | 'delete') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
    }

    const userId = req.user.userId;
    
    if (!getRoleService().hasPermission(userId, toolName, action)) {
      return res.status(403).json({ 
        success: false,
        error: `Insufficient permissions for ${action} on ${toolName}` 
      });
    }

    next();
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
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
    }

    const userId = req.user.userId;
    
    // Admin can access everything
    if (getRoleService().hasRole(userId, 'admin')) {
      return next();
    }

    // Check ownership based on request parameters or body
    const resourceUserId = req.params[userIdField] || req.body[userIdField];
    
    if (resourceUserId && parseInt(resourceUserId) !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Access denied. You can only access your own resources.' 
      });
    }

    next();
  };
};

/**
 * Middleware to check if user can manage other users (admin only for now)
 */
export const requireUserManagement = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ 
      success: false,
      error: 'Authentication required' 
    });
  }

  const userId = req.user.userId;
  
  if (!getRoleService().hasPermission(userId, 'users', 'read')) {
    return res.status(403).json({ 
      success: false,
      error: 'Insufficient permissions for user management' 
    });
  }

  next();
};

// Default export for backward compatibility
const permissions = requireRole;
export default permissions;
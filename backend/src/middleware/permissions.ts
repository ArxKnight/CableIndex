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
      res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
      return;
    }

    const userId = req.user.userId;
    
    if (!getRoleService().hasRole(userId, requiredRole)) {
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

    const userId = req.user.userId;
    
    if (!getRoleService().hasPermission(userId, toolName, action)) {
      res.status(403).json({ 
        success: false,
        error: `Insufficient permissions for ${action} on ${toolName}` 
      });
      return;
    }

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
    
    // Admin can access everything
    if (getRoleService().hasRole(userId, 'admin')) {
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
  
  if (!getRoleService().hasPermission(userId, 'users', 'read')) {
    res.status(403).json({ 
      success: false,
      error: 'Insufficient permissions for user management' 
    });
    return;
  }

  next();
  return;
};

// Default export for backward compatibility
const permissions = requireRole;
export default permissions;
import { Request, Response, NextFunction } from 'express';
import { verifyToken, JWTPayload } from '../utils/jwt.js';
import { User } from '../types/index.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      userId?: number;
    }
  }
}

/**
 * Authentication middleware to verify JWT tokens
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
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
    req.user = decoded;
    req.userId = decoded.userId;
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

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    
    if (token) {
      const decoded = verifyToken(token);
      req.user = decoded;
      req.userId = decoded.userId;
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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { generateTokens } from '../utils/jwt.js';
import { User } from '../types/index.js';

describe('Authentication Middleware', () => {
  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    full_name: 'Test User',
    password_hash: 'hashed_password',
    role: 'USER',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      header: vi.fn(),
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('authenticateToken', () => {
    it('should authenticate valid token', () => {
      const tokens = generateTokens(mockUser);
      (mockRequest.header as any).mockReturnValue(`Bearer ${tokens.accessToken}`);

      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.userId).toBe(mockUser.id);
      expect(mockRequest.user?.email).toBe(mockUser.email);
      expect(mockRequest.userId).toBe(mockUser.id);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject request without token', () => {
      (mockRequest.header as any).mockReturnValue(undefined);

      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied. No token provided.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', () => {
      (mockRequest.header as any).mockReturnValue('Bearer invalid-token');

      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired token.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle token without Bearer prefix', () => {
      const tokens = generateTokens(mockUser);
      (mockRequest.header as any).mockReturnValue(tokens.accessToken);

      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied. No token provided.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should authenticate valid token', () => {
      const tokens = generateTokens(mockUser);
      (mockRequest.header as any).mockReturnValue(`Bearer ${tokens.accessToken}`);

      optionalAuth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.userId).toBe(mockUser.id);
      expect(mockRequest.userId).toBe(mockUser.id);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without token', () => {
      (mockRequest.header as any).mockReturnValue(undefined);

      optionalAuth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toBeUndefined();
      expect(mockRequest.userId).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should continue with invalid token', () => {
      (mockRequest.header as any).mockReturnValue('Bearer invalid-token');

      optionalAuth(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toBeUndefined();
      expect(mockRequest.userId).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });
});
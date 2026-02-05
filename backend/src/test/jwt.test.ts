import { describe, it, expect, beforeEach } from 'vitest';
import { generateTokens, verifyToken, decodeToken, isTokenExpired } from '../utils/jwt.js';
import { User } from '../types/index.js';

describe('JWT Utilities', () => {
  const mockUser: User = {
    id: 1,
    email: 'test@example.com',
    full_name: 'Test User',
    password_hash: 'hashed_password',
    role: 'USER',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
  };

  beforeEach(() => {
    // Ensure test environment variables are set
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', () => {
      const tokens = generateTokens(mockUser);
      
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('expiresIn');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
      expect(typeof tokens.expiresIn).toBe('number');
    });

    it('should generate tokens with correct payload', () => {
      const tokens = generateTokens(mockUser);
      const decoded = decodeToken(tokens.accessToken);
      
      expect(decoded).toMatchObject({
        userId: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const tokens = generateTokens(mockUser);
      const decoded = verifyToken(tokens.accessToken);
      
      expect(decoded).toMatchObject({
        userId: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });

    it('should throw error for invalid token', () => {
      expect(() => verifyToken('invalid-token')).toThrow('Invalid or expired token');
    });

    it('should throw error for token with wrong secret', () => {
      const tokens = generateTokens(mockUser);
      process.env.JWT_SECRET = 'different-secret';
      
      expect(() => verifyToken(tokens.accessToken)).toThrow('Invalid or expired token');
    });
  });

  describe('decodeToken', () => {
    it('should decode token without verification', () => {
      const tokens = generateTokens(mockUser);
      const decoded = decodeToken(tokens.accessToken);
      
      expect(decoded).toMatchObject({
        userId: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });

    it('should return null for invalid token', () => {
      const decoded = decodeToken('invalid-token');
      expect(decoded).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid token', () => {
      const tokens = generateTokens(mockUser);
      const expired = isTokenExpired(tokens.accessToken);
      
      expect(expired).toBe(false);
    });

    it('should return true for invalid token', () => {
      const expired = isTokenExpired('invalid-token');
      expect(expired).toBe(true);
    });
  });
});
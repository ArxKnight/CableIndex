import jwt from 'jsonwebtoken';
import { User } from '../types/index.js';

export interface JWTPayload {
  userId: number;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Generate JWT access and refresh tokens for a user
 */
export function generateTokens(user: User): TokenPair {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  const secret = process.env.JWT_SECRET ?? '';
  const envAccess = process.env.JWT_EXPIRES_IN;
  const envRefresh = process.env.JWT_REFRESH_EXPIRES_IN;
  const accessSeconds = envAccess && !isNaN(Number(envAccess)) ? Number(envAccess) : 24 * 60 * 60;
  const refreshSeconds = envRefresh && !isNaN(Number(envRefresh)) ? Number(envRefresh) : 7 * 24 * 60 * 60;
  const accessOpts = { expiresIn: accessSeconds };
  const accessToken = jwt.sign(
    payload,
    secret,
    accessOpts
  );

  const refreshOpts = { expiresIn: refreshSeconds };
  const refreshToken = jwt.sign(
    payload,
    secret,
    refreshOpts
  );

  // Calculate expiration time in seconds
  const decoded = jwt.decode(accessToken) as jwt.JwtPayload | null;
  const expirationTime = decoded && decoded.exp && decoded.iat ? decoded.exp - decoded.iat : 0;

  return {
    accessToken,
    refreshToken,
    expiresIn: expirationTime,
  };
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, process.env.JWT_SECRET ?? '') as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * Decode JWT token without verification (for expired token handling)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  
  return Date.now() >= decoded.exp * 1000;
}

/**
 * Backward compatibility: generate only an access token
 */
export function generateToken(user: User): string {
  return generateTokens(user).accessToken;
}
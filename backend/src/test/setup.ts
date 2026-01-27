// Test setup file
import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Setup test environment
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.DATABASE_PATH = ':memory:';
});

afterAll(() => {
  // Cleanup after tests
});
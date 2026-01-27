import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import UserModel from '../models/User.js';
import connection from '../database/connection.js';
import { initializeDatabase } from '../database/init.js';

describe('User Model', () => {
  let userModel: UserModel;
  let db: Database.Database;

  beforeEach(async () => {
    // Initialize in-memory database for testing
    await initializeDatabase({ runMigrations: true, seedData: false });
    db = connection.getConnection();
    userModel = new UserModel();
  });

  afterEach(() => {
    // Clean up database
    if (db) {
      db.exec('DELETE FROM users');
    }
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        password: 'TestPassword123!',
        role: 'user' as const,
      };

      const user = await userModel.create(userData);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.full_name).toBe(userData.full_name);
      expect(user.role).toBe(userData.role);
      expect(user.password_hash).toBeDefined();
      expect(user.password_hash).not.toBe(userData.password);
    });

    it('should create user with default role', async () => {
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        password: 'TestPassword123!',
      };

      const user = await userModel.create(userData);

      expect(user.role).toBe('user');
    });
  });

  describe('findById', () => {
    it('should find user by ID', async () => {
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        password: 'TestPassword123!',
      };

      const createdUser = await userModel.create(userData);
      const foundUser = userModel.findById(createdUser.id);

      expect(foundUser).toBeDefined();
      expect(foundUser?.id).toBe(createdUser.id);
      expect(foundUser?.email).toBe(userData.email);
    });

    it('should return null for non-existent ID', () => {
      const user = userModel.findById(999);
      expect(user).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        password: 'TestPassword123!',
      };

      await userModel.create(userData);
      const foundUser = userModel.findByEmail(userData.email);

      expect(foundUser).toBeDefined();
      expect(foundUser?.email).toBe(userData.email);
    });

    it('should be case insensitive', async () => {
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        password: 'TestPassword123!',
      };

      await userModel.create(userData);
      const foundUser = userModel.findByEmail('TEST@EXAMPLE.COM');

      expect(foundUser).toBeDefined();
      expect(foundUser?.email).toBe(userData.email);
    });

    it('should return null for non-existent email', () => {
      const user = userModel.findByEmail('nonexistent@example.com');
      expect(user).toBeNull();
    });
  });

  describe('verifyCredentials', () => {
    it('should verify correct credentials', async () => {
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        password: 'TestPassword123!',
      };

      await userModel.create(userData);
      const user = await userModel.verifyCredentials(userData.email, userData.password);

      expect(user).toBeDefined();
      expect(user?.email).toBe(userData.email);
    });

    it('should reject incorrect password', async () => {
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        password: 'TestPassword123!',
      };

      await userModel.create(userData);
      const user = await userModel.verifyCredentials(userData.email, 'WrongPassword123!');

      expect(user).toBeNull();
    });

    it('should reject non-existent email', async () => {
      const user = await userModel.verifyCredentials('nonexistent@example.com', 'TestPassword123!');
      expect(user).toBeNull();
    });
  });

  describe('emailExists', () => {
    it('should return true for existing email', async () => {
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        password: 'TestPassword123!',
      };

      await userModel.create(userData);
      const exists = userModel.emailExists(userData.email);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent email', () => {
      const exists = userModel.emailExists('nonexistent@example.com');
      expect(exists).toBe(false);
    });

    it('should exclude specific user ID', async () => {
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        password: 'TestPassword123!',
      };

      const user = await userModel.create(userData);
      const exists = userModel.emailExists(userData.email, user.id);

      expect(exists).toBe(false);
    });
  });

  describe('update', () => {
    it('should update user data', async () => {
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        password: 'TestPassword123!',
      };

      const user = await userModel.create(userData);
      const updatedUser = await userModel.update(user.id, {
        full_name: 'Updated Name',
        role: 'admin',
      });

      expect(updatedUser).toBeDefined();
      expect(updatedUser?.full_name).toBe('Updated Name');
      expect(updatedUser?.role).toBe('admin');
      expect(updatedUser?.email).toBe(userData.email); // Should remain unchanged
    });

    it('should return null for non-existent user', async () => {
      const updatedUser = await userModel.update(999, { full_name: 'Updated Name' });
      expect(updatedUser).toBeNull();
    });
  });

  describe('updatePassword', () => {
    it('should update user password', async () => {
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        password: 'TestPassword123!',
      };

      const user = await userModel.create(userData);
      const newPassword = 'NewPassword123!';
      const success = await userModel.updatePassword(user.id, newPassword);

      expect(success).toBe(true);

      // Verify new password works
      const verifiedUser = await userModel.verifyCredentials(userData.email, newPassword);
      expect(verifiedUser).toBeDefined();

      // Verify old password doesn't work
      const oldPasswordUser = await userModel.verifyCredentials(userData.email, userData.password);
      expect(oldPasswordUser).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete user', async () => {
      const userData = {
        email: 'test@example.com',
        full_name: 'Test User',
        password: 'TestPassword123!',
      };

      const user = await userModel.create(userData);
      const success = userModel.delete(user.id);

      expect(success).toBe(true);

      const deletedUser = userModel.findById(user.id);
      expect(deletedUser).toBeNull();
    });

    it('should return false for non-existent user', () => {
      const success = userModel.delete(999);
      expect(success).toBe(false);
    });
  });
});
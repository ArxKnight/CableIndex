import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import UserModel from '../models/User.js';
import RoleService from '../services/RoleService.js';
import connection from '../database/connection.js';
import { initializeDatabase } from '../database/init.js';

describe('Role Service', () => {
  let userModel: UserModel;
  let roleService: RoleService;
  let db: Database.Database;
  let testUserId: number;

  beforeEach(async () => {
    // Initialize in-memory database for testing
    await initializeDatabase({ runMigrations: true, seedData: false });
    db = connection.getConnection();
    userModel = new UserModel();
    roleService = new RoleService();

    // Create a test user
    const testUser = await userModel.create({
      email: 'test@example.com',
      full_name: 'Test User',
      password: 'TestPassword123!',
      role: 'user',
    });
    testUserId = testUser.id;
  });

  afterEach(() => {
    // Clean up database
    if (db) {
      db.exec('DELETE FROM tool_permissions');
      db.exec('DELETE FROM users');
    }
  });

  describe('assignRole', () => {
    it('should assign role to user', () => {
      const success = roleService.assignRole(testUserId, 'admin');
      expect(success).toBe(true);

      const userRole = roleService.getUserRole(testUserId);
      expect(userRole).toBe('admin');
    });

    it('should update permissions when role changes', () => {
      // Initially user role
      expect(roleService.hasPermission(testUserId, 'users', 'read')).toBe(false);

      // Assign admin role
      roleService.assignRole(testUserId, 'admin');

      // Should now have admin permissions
      expect(roleService.hasPermission(testUserId, 'users', 'read')).toBe(true);
      expect(roleService.hasPermission(testUserId, 'admin', 'create')).toBe(true);
    });

    it('should return false for non-existent user', () => {
      const success = roleService.assignRole(999, 'admin');
      expect(success).toBe(false);
    });
  });

  describe('getUserRole', () => {
    it('should return user role', () => {
      const role = roleService.getUserRole(testUserId);
      expect(role).toBe('user');
    });

    it('should return null for non-existent user', () => {
      const role = roleService.getUserRole(999);
      expect(role).toBeNull();
    });
  });

  describe('hasRole', () => {
    it('should check role hierarchy correctly', () => {
      // User role
      expect(roleService.hasRole(testUserId, 'user')).toBe(true);
      expect(roleService.hasRole(testUserId, 'moderator')).toBe(false);
      expect(roleService.hasRole(testUserId, 'admin')).toBe(false);

      // Assign moderator role
      roleService.assignRole(testUserId, 'moderator');
      expect(roleService.hasRole(testUserId, 'user')).toBe(true);
      expect(roleService.hasRole(testUserId, 'moderator')).toBe(true);
      expect(roleService.hasRole(testUserId, 'admin')).toBe(false);

      // Assign admin role
      roleService.assignRole(testUserId, 'admin');
      expect(roleService.hasRole(testUserId, 'user')).toBe(true);
      expect(roleService.hasRole(testUserId, 'moderator')).toBe(true);
      expect(roleService.hasRole(testUserId, 'admin')).toBe(true);
    });

    it('should return false for non-existent user', () => {
      expect(roleService.hasRole(999, 'user')).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('should return user permissions', () => {
      const permissions = roleService.getUserPermissions(testUserId);
      expect(permissions).toHaveLength(5); // labels, sites, port_labels, pdu_labels, profile

      const labelsPermission = permissions.find(p => p.tool_name === 'labels');
      expect(labelsPermission).toBeDefined();
      expect(labelsPermission?.can_create).toBe(true);
      expect(labelsPermission?.can_read).toBe(true);
    });

    it('should return empty array for non-existent user', () => {
      const permissions = roleService.getUserPermissions(999);
      expect(permissions).toHaveLength(0);
    });
  });

  describe('getToolPermission', () => {
    it('should return specific tool permission', () => {
      const permission = roleService.getToolPermission(testUserId, 'labels');
      expect(permission).toBeDefined();
      expect(permission?.tool_name).toBe('labels');
      expect(permission?.can_create).toBe(true);
    });

    it('should return null for non-existent tool', () => {
      const permission = roleService.getToolPermission(testUserId, 'nonexistent');
      expect(permission).toBeNull();
    });
  });

  describe('hasPermission', () => {
    it('should check specific permissions correctly', () => {
      // User should have basic permissions
      expect(roleService.hasPermission(testUserId, 'labels', 'create')).toBe(true);
      expect(roleService.hasPermission(testUserId, 'labels', 'read')).toBe(true);
      expect(roleService.hasPermission(testUserId, 'users', 'read')).toBe(false);

      // Admin should have all permissions
      roleService.assignRole(testUserId, 'admin');
      expect(roleService.hasPermission(testUserId, 'users', 'read')).toBe(true);
      expect(roleService.hasPermission(testUserId, 'admin', 'create')).toBe(true);
    });

    it('should return false for non-existent tool', () => {
      expect(roleService.hasPermission(testUserId, 'nonexistent', 'read')).toBe(false);
    });
  });

  describe('updateToolPermission', () => {
    it('should update tool permissions', () => {
      const success = roleService.updateToolPermission(testUserId, 'labels', {
        can_delete: false,
      });
      expect(success).toBe(true);

      expect(roleService.hasPermission(testUserId, 'labels', 'delete')).toBe(false);
      expect(roleService.hasPermission(testUserId, 'labels', 'create')).toBe(true); // Should remain unchanged
    });

    it('should return false for non-existent user or tool', () => {
      const success = roleService.updateToolPermission(999, 'labels', { can_delete: false });
      expect(success).toBe(false);
    });
  });

  describe('getAllUsersWithRoles', () => {
    it('should return users with roles', async () => {
      // Create additional test users
      await userModel.create({
        email: 'admin@example.com',
        full_name: 'Admin User',
        password: 'AdminPassword123!',
        role: 'admin',
      });

      const users = roleService.getAllUsersWithRoles();
      expect(users).toHaveLength(2);
      
      const adminUser = users.find(u => u.email === 'admin@example.com');
      expect(adminUser).toBeDefined();
      expect(adminUser?.role).toBe('admin');
    });

    it('should support pagination', async () => {
      // Create multiple users
      for (let i = 0; i < 5; i++) {
        await userModel.create({
          email: `user${i}@example.com`,
          full_name: `User ${i}`,
          password: 'Password123!',
          role: 'user',
        });
      }

      const firstPage = roleService.getAllUsersWithRoles(3, 0);
      const secondPage = roleService.getAllUsersWithRoles(3, 3);

      expect(firstPage).toHaveLength(3);
      expect(secondPage).toHaveLength(3); // 6 total users (1 original + 5 new)
    });
  });

  describe('countUsersByRole', () => {
    it('should count users by role', async () => {
      // Create users with different roles
      await userModel.create({
        email: 'admin@example.com',
        full_name: 'Admin User',
        password: 'AdminPassword123!',
        role: 'admin',
      });

      await userModel.create({
        email: 'moderator@example.com',
        full_name: 'Moderator User',
        password: 'ModeratorPassword123!',
        role: 'moderator',
      });

      const counts = roleService.countUsersByRole();
      expect(counts.user).toBe(1);
      expect(counts.admin).toBe(1);
      expect(counts.moderator).toBe(1);
    });
  });

  describe('default permissions by role', () => {
    it('should assign correct permissions for user role', () => {
      expect(roleService.hasPermission(testUserId, 'labels', 'create')).toBe(true);
      expect(roleService.hasPermission(testUserId, 'sites', 'create')).toBe(true);
      expect(roleService.hasPermission(testUserId, 'port_labels', 'create')).toBe(true);
      expect(roleService.hasPermission(testUserId, 'port_labels', 'update')).toBe(false);
      expect(roleService.hasPermission(testUserId, 'users', 'read')).toBe(false);
      expect(roleService.hasPermission(testUserId, 'admin', 'read')).toBe(false);
    });

    it('should assign correct permissions for moderator role', async () => {
      const moderator = await userModel.create({
        email: 'moderator@example.com',
        full_name: 'Moderator User',
        password: 'ModeratorPassword123!',
        role: 'moderator',
      });

      expect(roleService.hasPermission(moderator.id, 'labels', 'create')).toBe(true);
      expect(roleService.hasPermission(moderator.id, 'port_labels', 'update')).toBe(true);
      expect(roleService.hasPermission(moderator.id, 'port_labels', 'delete')).toBe(false);
      expect(roleService.hasPermission(moderator.id, 'users', 'read')).toBe(true);
      expect(roleService.hasPermission(moderator.id, 'users', 'create')).toBe(false);
      expect(roleService.hasPermission(moderator.id, 'admin', 'read')).toBe(true);
      expect(roleService.hasPermission(moderator.id, 'admin', 'create')).toBe(false);
    });

    it('should assign correct permissions for admin role', async () => {
      const admin = await userModel.create({
        email: 'admin@example.com',
        full_name: 'Admin User',
        password: 'AdminPassword123!',
        role: 'admin',
      });

      expect(roleService.hasPermission(admin.id, 'labels', 'create')).toBe(true);
      expect(roleService.hasPermission(admin.id, 'labels', 'delete')).toBe(true);
      expect(roleService.hasPermission(admin.id, 'port_labels', 'delete')).toBe(true);
      expect(roleService.hasPermission(admin.id, 'users', 'create')).toBe(true);
      expect(roleService.hasPermission(admin.id, 'users', 'delete')).toBe(true);
      expect(roleService.hasPermission(admin.id, 'admin', 'create')).toBe(true);
    });
  });
});
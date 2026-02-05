import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import UserModel from '../models/User.js';
import RoleService from '../services/RoleService.js';
import { generateToken } from '../utils/jwt.js';
import { setupTestDatabase, cleanupTestDatabase } from './setup.js';

describe('User Routes', () => {
  let userModel: UserModel;
  let roleService: RoleService;
  let db: any;
  let adminUser: any;
  let regularUser: any;
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    db = await setupTestDatabase({ runMigrations: true, seedData: false });
    userModel = new UserModel();
    roleService = new RoleService();

    // Create test users
    adminUser = await userModel.create({
      email: 'admin@example.com',
      full_name: 'Admin User',
      password: 'AdminPassword123!',
      role: 'ADMIN',
    });

    regularUser = await userModel.create({
      email: 'user@example.com',
      full_name: 'Regular User',
      password: 'UserPassword123!',
      role: 'USER',
    });

    // Generate tokens
    adminToken = generateToken(adminUser);
    userToken = generateToken(regularUser);
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  describe('GET /api/users', () => {
    it('should return users list for admin', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(2);
      expect(response.body.data.pagination).toBeDefined();
      
      // Should not include password_hash
      response.body.data.users.forEach((user: any) => {
        expect(user.password_hash).toBeUndefined();
      });
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('permissions');
    });

    it('should deny access without authentication', async () => {
      const response = await request(app)
        .get('/api/users')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Access denied. No token provided.');
    });

    it('should support pagination', async () => {
      // Create additional users
      for (let i = 0; i < 5; i++) {
        await userModel.create({
          email: `user${i}@example.com`,
          full_name: `User ${i}`,
          password: 'Password123!',
          role: 'USER',
        });
      }

      const response = await request(app)
        .get('/api/users?page=1&limit=3')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.users).toHaveLength(3);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(3);
      expect(response.body.data.pagination.total).toBe(7); // 2 original + 5 new
    });
  });

  describe('GET /api/users/stats', () => {
    it('should return user statistics for admin', async () => {
      const response = await request(app)
        .get('/api/users/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalUsers).toBe(2);
      expect(response.body.data.usersByRole).toBeDefined();
      expect(response.body.data.usersByRole.ADMIN).toBe(1);
      expect(response.body.data.usersByRole.USER).toBe(1);
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .get('/api/users/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should update user for admin', async () => {
      const updateData = {
        full_name: 'Updated Name',
        role: 'ADMIN',
      };

      const response = await request(app)
        .put(`/api/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.full_name).toBe(updateData.full_name);
      expect(response.body.data.role).toBe(updateData.role);
      expect(response.body.data.password_hash).toBeUndefined();
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .put(`/api/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ full_name: 'Updated Name' })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .put('/api/users/999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ full_name: 'Updated Name' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .put(`/api/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid input');
    });

    it('should prevent duplicate email', async () => {
      const response = await request(app)
        .put(`/api/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: adminUser.email })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should delete user for admin', async () => {
      const response = await request(app)
        .delete(`/api/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');

      // Verify user is deleted
      const deletedUser = await userModel.findById(regularUser.id);
      expect(deletedUser).toBeNull();
    });

    it('should prevent admin from deleting themselves', async () => {
      const response = await request(app)
        .delete(`/api/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Cannot delete your own account');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .delete(`/api/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .delete('/api/users/999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });
});
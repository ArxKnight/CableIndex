import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import app from '../app.js';
import UserModel from '../models/User.js';
import connection from '../database/connection.js';
import { initializeDatabase } from '../database/init.js';
import { generateToken } from '../utils/jwt.js';

describe('Admin Routes', () => {
  let userModel: UserModel;
  let db: Database.Database;
  let adminUser: any;
  let regularUser: any;
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    // Initialize in-memory database for testing
    await initializeDatabase({ runMigrations: true, seedData: false });
    db = connection.getConnection();
    userModel = new UserModel();

    // Create test users
    adminUser = await userModel.create({
      email: 'admin@example.com',
      full_name: 'Admin User',
      password: 'AdminPassword123!',
      role: 'admin',
    });

    regularUser = await userModel.create({
      email: 'user@example.com',
      full_name: 'Regular User',
      password: 'UserPassword123!',
      role: 'user',
    });

    // Generate tokens
    adminToken = generateToken({ userId: adminUser.id, email: adminUser.email, role: adminUser.role });
    userToken = generateToken({ userId: regularUser.id, email: regularUser.email, role: regularUser.role });
  });

  afterEach(() => {
    // Clean up database
    if (db) {
      db.exec('DELETE FROM user_invitations');
      db.exec('DELETE FROM tool_permissions');
      db.exec('DELETE FROM users');
    }
  });

  describe('POST /api/admin/invite', () => {
    it('should create user invitation for admin', async () => {
      const inviteData = {
        email: 'newuser@example.com',
        role: 'user',
      };

      const response = await request(app)
        .post('/api/admin/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(inviteData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(inviteData.email);
      expect(response.body.data.role).toBe(inviteData.role);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.expiresAt).toBeDefined();

      // Verify invitation was created in database
      const invitation = db.prepare('SELECT * FROM user_invitations WHERE email = ?').get(inviteData.email);
      expect(invitation).toBeDefined();
    });

    it('should use default role if not specified', async () => {
      const inviteData = {
        email: 'newuser@example.com',
      };

      const response = await request(app)
        .post('/api/admin/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(inviteData)
        .expect(201);

      expect(response.body.data.role).toBe('user');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .post('/api/admin/invite')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ email: 'newuser@example.com' })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should prevent inviting existing user', async () => {
      const response = await request(app)
        .post('/api/admin/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: adminUser.email })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });

    it('should prevent duplicate invitations', async () => {
      const inviteData = { email: 'newuser@example.com' };

      // First invitation
      await request(app)
        .post('/api/admin/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(inviteData)
        .expect(201);

      // Second invitation should fail
      const response = await request(app)
        .post('/api/admin/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(inviteData)
        .expect(409);

      expect(response.body.error).toContain('already sent');
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .post('/api/admin/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid input');
    });
  });

  describe('GET /api/admin/invitations', () => {
    beforeEach(async () => {
      // Create test invitations
      const stmt = db.prepare(`
        INSERT INTO user_invitations (email, token, invited_by, role, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      stmt.run('invite1@example.com', 'token1', adminUser.id, 'user', expiresAt);
      stmt.run('invite2@example.com', 'token2', adminUser.id, 'moderator', expiresAt);
    });

    it('should return pending invitations for admin', async () => {
      const response = await request(app)
        .get('/api/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].email).toBeDefined();
      expect(response.body.data[0].role).toBeDefined();
      expect(response.body.data[0].invited_by_name).toBe(adminUser.full_name);
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .get('/api/admin/invitations')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/admin/invitations/:id', () => {
    let invitationId: number;

    beforeEach(() => {
      // Create test invitation
      const stmt = db.prepare(`
        INSERT INTO user_invitations (email, token, invited_by, role, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const result = stmt.run('invite@example.com', 'token123', adminUser.id, 'user', expiresAt);
      invitationId = Number(result.lastInsertRowid);
    });

    it('should cancel invitation for admin', async () => {
      const response = await request(app)
        .delete(`/api/admin/invitations/${invitationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('cancelled successfully');

      // Verify invitation was deleted
      const invitation = db.prepare('SELECT * FROM user_invitations WHERE id = ?').get(invitationId);
      expect(invitation).toBeUndefined();
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .delete(`/api/admin/invitations/${invitationId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent invitation', async () => {
      const response = await request(app)
        .delete('/api/admin/invitations/999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('GET /api/admin/validate-invite/:token', () => {
    let validToken: string;

    beforeEach(() => {
      // Create test invitation
      validToken = 'valid-token-123';
      const stmt = db.prepare(`
        INSERT INTO user_invitations (email, token, invited_by, role, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      stmt.run('invite@example.com', validToken, adminUser.id, 'user', expiresAt);
    });

    it('should validate valid invitation token', async () => {
      const response = await request(app)
        .get(`/api/admin/validate-invite/${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('invite@example.com');
      expect(response.body.data.role).toBe('user');
      expect(response.body.data.expiresAt).toBeDefined();
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/admin/validate-invite/invalid-token')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid or expired');
    });

    it('should reject expired token', async () => {
      // Create expired invitation
      const expiredToken = 'expired-token-123';
      const stmt = db.prepare(`
        INSERT INTO user_invitations (email, token, invited_by, role, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Yesterday
      stmt.run('expired@example.com', expiredToken, adminUser.id, 'user', expiredAt);

      const response = await request(app)
        .get(`/api/admin/validate-invite/${expiredToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid or expired');
    });
  });

  describe('POST /api/admin/accept-invite', () => {
    let validToken: string;

    beforeEach(() => {
      // Create test invitation
      validToken = 'valid-token-123';
      const stmt = db.prepare(`
        INSERT INTO user_invitations (email, token, invited_by, role, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      stmt.run('invite@example.com', validToken, adminUser.id, 'moderator', expiresAt);
    });

    it('should accept valid invitation and create account', async () => {
      const acceptData = {
        token: validToken,
        full_name: 'New User',
        password: 'NewPassword123!',
      };

      const response = await request(app)
        .post('/api/admin/accept-invite')
        .send(acceptData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('invite@example.com');
      expect(response.body.data.full_name).toBe(acceptData.full_name);
      expect(response.body.data.role).toBe('moderator');
      expect(response.body.data.password_hash).toBeUndefined();

      // Verify invitation was marked as used
      const invitation = db.prepare('SELECT used_at FROM user_invitations WHERE token = ?').get(validToken) as any;
      expect(invitation.used_at).toBeDefined();

      // Verify user was created
      const user = userModel.findByEmail('invite@example.com');
      expect(user).toBeDefined();
      expect(user?.role).toBe('moderator');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .post('/api/admin/accept-invite')
        .send({
          token: 'invalid-token',
          full_name: 'New User',
          password: 'NewPassword123!',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid or expired');
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .post('/api/admin/accept-invite')
        .send({
          token: validToken,
          full_name: '', // Invalid
          password: '123', // Too short
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid input');
    });

    it('should prevent creating account if user already exists', async () => {
      // First, accept the invitation
      await request(app)
        .post('/api/admin/accept-invite')
        .send({
          token: validToken,
          full_name: 'New User',
          password: 'NewPassword123!',
        })
        .expect(201);

      // Create another invitation for the same email
      const newToken = 'new-token-123';
      const stmt = db.prepare(`
        INSERT INTO user_invitations (email, token, invited_by, role, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      stmt.run('invite@example.com', newToken, adminUser.id, 'user', expiresAt);

      // Try to accept the new invitation
      const response = await request(app)
        .post('/api/admin/accept-invite')
        .send({
          token: newToken,
          full_name: 'Another User',
          password: 'AnotherPassword123!',
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('GET /api/admin/users', () => {
    beforeEach(async () => {
      // Create additional test users
      await userModel.create({
        email: 'moderator@example.com',
        full_name: 'Moderator User',
        password: 'ModPassword123!',
        role: 'moderator',
      });
    });

    it('should return users list for admin', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(3); // admin, regular, moderator
      expect(response.body.data.users[0]).toHaveProperty('email');
      expect(response.body.data.users[0]).toHaveProperty('full_name');
      expect(response.body.data.users[0]).toHaveProperty('role');
      expect(response.body.data.users[0]).toHaveProperty('label_count');
      expect(response.body.data.users[0]).toHaveProperty('site_count');
    });

    it('should filter users by search term', async () => {
      const response = await request(app)
        .get('/api/admin/users?search=admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(1);
      expect(response.body.data.users[0].email).toBe('admin@example.com');
    });

    it('should filter users by role', async () => {
      const response = await request(app)
        .get('/api/admin/users?role=moderator')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(1);
      expect(response.body.data.users[0].role).toBe('moderator');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/admin/users/:id/role', () => {
    it('should update user role for admin', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${regularUser.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'moderator' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('updated successfully');

      // Verify role was updated
      const updatedUser = userModel.findById(regularUser.id);
      expect(updatedUser?.role).toBe('moderator');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${regularUser.id}/role`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ role: 'moderator' })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should validate role value', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${regularUser.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'invalid_role' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid role');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .put('/api/admin/users/999/role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'moderator' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('DELETE /api/admin/users/:id', () => {
    let targetUser: any;

    beforeEach(async () => {
      targetUser = await userModel.create({
        email: 'delete@example.com',
        full_name: 'Delete User',
        password: 'DeletePassword123!',
        role: 'user',
      });
    });

    it('should delete user for admin', async () => {
      const response = await request(app)
        .delete(`/api/admin/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');

      // Verify user was deleted
      const deletedUser = userModel.findById(targetUser.id);
      expect(deletedUser).toBeNull();
    });

    it('should prevent self-deletion', async () => {
      const response = await request(app)
        .delete(`/api/admin/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Cannot delete your own account');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .delete(`/api/admin/users/${targetUser.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .delete('/api/admin/users/999')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('GET /api/admin/stats', () => {
    beforeEach(async () => {
      // Create some test data for statistics
      const siteModel = db.prepare(`
        INSERT INTO sites (name, location, user_id) VALUES (?, ?, ?)
      `);
      siteModel.run('Test Site 1', 'Location 1', adminUser.id);
      siteModel.run('Test Site 2', 'Location 2', regularUser.id);

      const labelModel = db.prepare(`
        INSERT INTO labels (reference_number, source, destination, site_id, user_id) 
        VALUES (?, ?, ?, ?, ?)
      `);
      labelModel.run('TEST-001', 'Source 1', 'Dest 1', 1, adminUser.id);
      labelModel.run('TEST-002', 'Source 2', 'Dest 2', 2, regularUser.id);
    });

    it('should return admin statistics for admin', async () => {
      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('users');
      expect(response.body.data).toHaveProperty('labels');
      expect(response.body.data).toHaveProperty('sites');
      expect(response.body.data).toHaveProperty('activity');

      expect(response.body.data.users).toHaveProperty('total');
      expect(response.body.data.users).toHaveProperty('by_role');
      expect(response.body.data.labels).toHaveProperty('total');
      expect(response.body.data.sites).toHaveProperty('total');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/admin/settings', () => {
    it('should return default settings for admin', async () => {
      const response = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.settings).toHaveProperty('public_registration_enabled');
      expect(response.body.data.settings).toHaveProperty('default_user_role');
      expect(response.body.data.settings).toHaveProperty('system_name');
      expect(response.body.data.settings.system_name).toBe('Cable Manager');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .get('/api/admin/settings')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/admin/settings', () => {
    const validSettings = {
      public_registration_enabled: true,
      default_user_role: 'moderator',
      max_labels_per_user: 1000,
      max_sites_per_user: 50,
      system_name: 'Custom Cable Manager',
      system_description: 'Custom description',
      maintenance_mode: false,
      maintenance_message: 'Under maintenance',
    };

    it('should update settings for admin', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(validSettings)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('updated successfully');

      // Verify settings were saved
      const settings = db.prepare('SELECT * FROM app_settings ORDER BY created_at DESC LIMIT 1').get() as any;
      expect(settings.system_name).toBe(validSettings.system_name);
      expect(settings.default_user_role).toBe(validSettings.default_user_role);
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validSettings)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validSettings, system_name: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('System name is required');
    });

    it('should validate default user role', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validSettings, default_user_role: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid default user role');
    });
  });
});
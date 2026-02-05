import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import UserModel from '../models/User.js';
import { SiteModel } from '../models/Site.js';
import { generateToken } from '../utils/jwt.js';
import { setupTestDatabase, cleanupTestDatabase } from './setup.js';
import crypto from 'crypto';

describe('Admin Routes', () => {
  let userModel: UserModel;
  let db: any;
  let adminUser: any;
  let regularUser: any;
  let adminToken: string;
  let userToken: string;
  let testSite: any;
  let extraSite: any;

  beforeEach(async () => {
    db = await setupTestDatabase({ runMigrations: true, seedData: false });
    userModel = new UserModel();

    // Create test users
    adminUser = await userModel.create({
      email: 'admin@example.com',
      username: 'Admin User',
      password: 'AdminPassword123!',
      role: 'GLOBAL_ADMIN',
    });

    regularUser = await userModel.create({
      email: 'user@example.com',
      username: 'Regular User',
      password: 'UserPassword123!',
      role: 'USER',
    });

    // Generate tokens
    adminToken = generateToken(adminUser);
    userToken = generateToken(regularUser);

    const siteModel = new SiteModel();
    testSite = await siteModel.create({
      name: 'Test Site 1',
      code: 'TS1',
      created_by: adminUser.id,
      location: 'Location 1',
      description: 'Test site',
    });
    extraSite = await siteModel.create({
      name: 'Test Site 2',
      code: 'TS2',
      created_by: adminUser.id,
      location: 'Location 2',
      description: 'Another test site',
    });
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  describe('POST /api/admin/invite', () => {
    it('should create user invitation for admin', async () => {
      const inviteData = {
        email: 'newuser@example.com',
        username: 'New User',
        sites: [{ site_id: testSite.id, site_role: 'USER' }],
      };

      const response = await request(app)
        .post('/api/admin/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(inviteData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(inviteData.email);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.expiresAt).toBeDefined();
      expect(response.body.data.sites).toHaveLength(1);
      expect(response.body.data.sites[0]).toMatchObject({ site_id: testSite.id, site_role: 'USER' });

      // Verify invitation was created in database
      const rows = await db.query('SELECT id, email, username, used_at FROM invitations WHERE email = ?', [inviteData.email]);
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe(inviteData.email);
      expect(rows[0].username).toBe(inviteData.username);
      expect(rows[0].used_at).toBeNull();
    });

    it('should use default role if not specified', async () => {
      const inviteData = {
        email: 'newuser@example.com',
        username: 'New User',
        sites: [{ site_id: testSite.id }],
      };

      const response = await request(app)
        .post('/api/admin/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(inviteData)
        .expect(201);

      expect(response.body.data.sites).toHaveLength(1);
      expect(response.body.data.sites[0]).toMatchObject({ site_id: testSite.id, site_role: 'USER' });
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .post('/api/admin/invite')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ email: 'newuser@example.com', username: 'New User', sites: [{ site_id: testSite.id }] })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should prevent inviting existing user', async () => {
      const response = await request(app)
        .post('/api/admin/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: adminUser.email, username: 'Existing Admin', sites: [{ site_id: testSite.id }] })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });

    it('should prevent duplicate invitations', async () => {
      const inviteData = { email: 'newuser@example.com', username: 'New User', sites: [{ site_id: testSite.id }] };

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
        .send({ email: 'invalid-email', username: 'New User', sites: [{ site_id: testSite.id }] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid input');
    });
  });

  describe('GET /api/admin/invitations', () => {
    beforeEach(async () => {
      const insertInvitation = async (opts: { email: string; token: string; username: string; siteId: number; siteRole: 'ADMIN' | 'USER' }) => {
        const tokenHash = crypto.createHash('sha256').update(opts.token).digest('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const result = await db.execute(
          `INSERT INTO invitations (email, username, token_hash, invited_by, expires_at)
           VALUES (?, ?, ?, ?, ?)`,
          [opts.email, opts.username, tokenHash, adminUser.id, expiresAt]
        );
        const invitationId = Number(result.insertId);
        await db.execute(
          `INSERT INTO invitation_sites (invitation_id, site_id, site_role)
           VALUES (?, ?, ?)`,
          [invitationId, opts.siteId, opts.siteRole]
        );
        return invitationId;
      };

      await insertInvitation({ email: 'invite1@example.com', token: 'token1', username: 'Invite One', siteId: testSite.id, siteRole: 'USER' });
      await insertInvitation({ email: 'invite2@example.com', token: 'token2', username: 'Invite Two', siteId: extraSite.id, siteRole: 'ADMIN' });
    });

    it('should return pending invitations for admin', async () => {
      const response = await request(app)
        .get('/api/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].email).toBeDefined();
      expect(response.body.data[0].invited_by_name).toBe(adminUser.username);
      expect(response.body.data[0].sites).toBeDefined();
      expect(response.body.data[0].sites.length).toBeGreaterThan(0);
      expect(response.body.data[0].sites[0]).toHaveProperty('site_id');
      expect(response.body.data[0].sites[0]).toHaveProperty('site_role');
      expect(response.body.data[0].sites[0]).toHaveProperty('site_name');
      expect(response.body.data[0].sites[0]).toHaveProperty('site_code');
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

    beforeEach(async () => {
      const token = 'token123';
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const result = await db.execute(
        `INSERT INTO invitations (email, username, token_hash, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        ['invite@example.com', 'Invited User', tokenHash, adminUser.id, expiresAt]
      );
      invitationId = Number(result.insertId);
      await db.execute(
        `INSERT INTO invitation_sites (invitation_id, site_id, site_role)
         VALUES (?, ?, ?)`,
        [invitationId, testSite.id, 'USER']
      );
    });

    it('should cancel invitation for admin', async () => {
      const response = await request(app)
        .delete(`/api/admin/invitations/${invitationId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('cancelled successfully');

      // Verify invitation was deleted
      const rows = await db.query('SELECT id FROM invitations WHERE id = ?', [invitationId]);
      expect(rows).toHaveLength(0);
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

    beforeEach(async () => {
      validToken = 'valid-token-123';
      const tokenHash = crypto.createHash('sha256').update(validToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const result = await db.execute(
        `INSERT INTO invitations (email, username, token_hash, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        ['invite@example.com', 'Invited User', tokenHash, adminUser.id, expiresAt]
      );
      const invitationId = Number(result.insertId);
      await db.execute(
        `INSERT INTO invitation_sites (invitation_id, site_id, site_role)
         VALUES (?, ?, ?)`,
        [invitationId, testSite.id, 'USER']
      );
    });

    it('should validate valid invitation token', async () => {
      const response = await request(app)
        .get(`/api/admin/validate-invite/${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('invite@example.com');
      expect(response.body.data.expiresAt).toBeDefined();
      expect(response.body.data.sites).toBeDefined();
      expect(response.body.data.sites.length).toBeGreaterThan(0);
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
      const tokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
        const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await db.execute(
        `INSERT INTO invitations (email, username, token_hash, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        ['expired@example.com', 'Expired User', tokenHash, adminUser.id, expiredAt]
      );
      const invitationId = Number(result.insertId);
      await db.execute(
        `INSERT INTO invitation_sites (invitation_id, site_id, site_role)
         VALUES (?, ?, ?)`,
        [invitationId, testSite.id, 'USER']
      );

      const response = await request(app)
        .get(`/api/admin/validate-invite/${expiredToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid or expired');
    });
  });

  describe('POST /api/admin/accept-invite', () => {
    let validToken: string;

    beforeEach(async () => {
      validToken = 'valid-token-123';
      const tokenHash = crypto.createHash('sha256').update(validToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const result = await db.execute(
        `INSERT INTO invitations (email, username, token_hash, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        ['invite@example.com', 'New User', tokenHash, adminUser.id, expiresAt]
      );
      const invitationId = Number(result.insertId);
      await db.execute(
        `INSERT INTO invitation_sites (invitation_id, site_id, site_role)
         VALUES (?, ?, ?)`,
        [invitationId, testSite.id, 'ADMIN']
      );
    });

    it('should accept valid invitation and create account', async () => {
      const acceptData = {
        token: validToken,
        password: 'NewPassword123!',
      };

      const response = await request(app)
        .post('/api/admin/accept-invite')
        .send(acceptData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('invite@example.com');
      expect(response.body.data.username).toBe('New User');
      expect(response.body.data.role).toBe('ADMIN');
      expect(response.body.data.password_hash).toBeUndefined();

      // Verify invitation was marked as used
      const tokenHash = crypto.createHash('sha256').update(validToken).digest('hex');
      const usedRows = await db.query('SELECT used_at FROM invitations WHERE token_hash = ?', [tokenHash]);
      expect(usedRows).toHaveLength(1);
      expect(usedRows[0].used_at).toBeTruthy();

      // Verify user was created
      const user = await userModel.findByEmail('invite@example.com');
      expect(user).toBeDefined();
      expect(user?.role).toBe('ADMIN');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .post('/api/admin/accept-invite')
        .send({
          token: 'invalid-token',
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
          password: 'NewPassword123!',
        })
        .expect(201);

      // Create another invitation for the same email
      const newToken = 'new-token-123';
      const tokenHash = crypto.createHash('sha256').update(newToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const result = await db.execute(
        `INSERT INTO invitations (email, username, token_hash, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        ['invite@example.com', 'Another User', tokenHash, adminUser.id, expiresAt]
      );
      const invitationId = Number(result.insertId);
      await db.execute(
        `INSERT INTO invitation_sites (invitation_id, site_id, site_role)
         VALUES (?, ?, ?)`,
        [invitationId, testSite.id, 'USER']
      );

      // Try to accept the new invitation
      const response = await request(app)
        .post('/api/admin/accept-invite')
        .send({
          token: newToken,
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
        username: 'Moderator User',
        password: 'ModPassword123!',
        role: 'ADMIN',
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
      expect(response.body.data.users[0]).toHaveProperty('username');
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
        .get('/api/admin/users?role=ADMIN')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(1);
      expect(response.body.data.users[0].role).toBe('ADMIN');
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
        .send({ role: 'ADMIN' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('updated successfully');

      // Verify role was updated
      const updatedUser = await userModel.findById(regularUser.id);
      expect(updatedUser?.role).toBe('ADMIN');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${regularUser.id}/role`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ role: 'ADMIN' })
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
        .send({ role: 'ADMIN' })
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
        username: 'Delete User',
        password: 'DeletePassword123!',
        role: 'USER',
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
      const deletedUser = await userModel.findById(targetUser.id);
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
    it('should return admin statistics for admin', async () => {
      const response = await request(app)
        .get(`/api/admin/stats?site_id=${testSite.id}`)
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
        .get(`/api/admin/stats?site_id=${testSite.id}`)
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
      expect(response.body.data.settings).toHaveProperty('default_user_role');
      expect(response.body.data.settings).not.toHaveProperty('system_name');
      expect(response.body.data.settings).not.toHaveProperty('system_description');
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
      default_user_role: 'moderator',
      max_labels_per_user: 1000,
      max_sites_per_user: 50,
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

      // Verify settings were saved (key/value)
      const getValue = async (key: string) => {
        const rows = await db.query('SELECT value FROM app_settings WHERE `key` = ?', [key]);
        return rows[0] as any;
      };
      expect((await getValue('default_user_role')).value).toBe(validSettings.default_user_role);
      expect((await getValue('max_labels_per_user')).value).toBe(String(validSettings.max_labels_per_user));
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
          .send({ ...validSettings, default_user_role: 'invalid' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid default user role');
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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import UserModel from '../models/User.js';
import { SiteModel } from '../models/Site.js';
import { generateToken } from '../utils/jwt.js';
import { normalizeUsername } from '../utils/username.js';
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
        sites: [{ site_id: testSite.id, site_role: 'SITE_USER' }],
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
      expect(response.body.data.sites[0]).toMatchObject({ site_id: testSite.id, site_role: 'SITE_USER' });

      // Verify invitation was created in database
      const rows = await db.query('SELECT id, email, username, used_at FROM invitations WHERE email = ?', [inviteData.email]);
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe(inviteData.email);
      expect(rows[0].username).toBe(normalizeUsername(inviteData.username));
      expect(rows[0].used_at).toBeNull();
    });

    it('should allow Global Admin to invite users with no sites', async () => {
      const inviteData = {
        email: 'nosites@example.com',
        username: 'No Sites User',
        sites: [],
      };

      const inviteResponse = await request(app)
        .post('/api/admin/invite')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(inviteData)
        .expect(201);

      expect(inviteResponse.body.success).toBe(true);
      expect(inviteResponse.body.data.email).toBe(inviteData.email);
      expect(inviteResponse.body.data.token).toBeDefined();
      expect(inviteResponse.body.data.sites).toEqual([]);

      // Accept invite should succeed and create a user without site memberships.
      const token = String(inviteResponse.body.data.token);
      const acceptResponse = await request(app)
        .post('/api/admin/accept-invite')
        .send({ token, password: 'Password123!' })
        .expect(201);

      expect(acceptResponse.body.success).toBe(true);
      expect(acceptResponse.body.data.email).toBe(inviteData.email);

      const memberships = await db.query(
        'SELECT site_id, site_role FROM site_memberships WHERE user_id = ?',
        [acceptResponse.body.data.id],
      );
      expect(memberships).toHaveLength(0);
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
      expect(response.body.data.sites[0]).toMatchObject({ site_id: testSite.id, site_role: 'SITE_USER' });
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
    let siteAdminUser: any;
    let siteAdminToken: string;

    beforeEach(async () => {
      siteAdminUser = await userModel.create({
        email: 'siteadmin-invites@example.com',
        username: 'Site Admin Invites',
        password: 'SiteAdminPassword123!',
        role: 'USER',
      });
      siteAdminToken = generateToken(siteAdminUser);

      // Give this user SITE_ADMIN access to testSite only.
      await db.execute(
        `INSERT INTO site_memberships (site_id, user_id, site_role)
         VALUES (?, ?, ?)`
        , [testSite.id, siteAdminUser.id, 'SITE_ADMIN']
      );

      const insertInvitation = async (opts: { email: string; token: string; username: string; siteId: number; siteRole: 'SITE_ADMIN' | 'SITE_USER' }) => {
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

      const insertInvitationNoSites = async (opts: { email: string; token: string; username: string }) => {
        const tokenHash = crypto.createHash('sha256').update(opts.token).digest('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const result = await db.execute(
          `INSERT INTO invitations (email, username, token_hash, invited_by, expires_at)
           VALUES (?, ?, ?, ?, ?)`,
          [opts.email, opts.username, tokenHash, adminUser.id, expiresAt]
        );
        return Number(result.insertId);
      };

      await insertInvitation({ email: 'invite1@example.com', token: 'token1', username: 'Invite One', siteId: testSite.id, siteRole: 'SITE_USER' });
      await insertInvitation({ email: 'invite2@example.com', token: 'token2', username: 'Invite Two', siteId: extraSite.id, siteRole: 'SITE_ADMIN' });
      await insertInvitationNoSites({ email: 'nosites@example.com', token: 'token3', username: 'No Sites User' });
    });

    it('should return pending invitations for admin', async () => {
      const response = await request(app)
        .get('/api/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data[0].email).toBeDefined();
      expect(response.body.data[0].invited_by_name).toBe(adminUser.username);
      expect(response.body.data[0].sites).toBeDefined();

      const noSites = (response.body.data as any[]).find((i) => i.email === 'nosites@example.com');
      expect(noSites).toBeDefined();
      expect(noSites.sites).toEqual([]);

      const withSites = (response.body.data as any[]).find((i) => i.email === 'invite1@example.com');
      expect(withSites).toBeDefined();
      expect(withSites.sites.length).toBeGreaterThan(0);
      expect(withSites.sites[0]).toHaveProperty('site_id');
      expect(withSites.sites[0]).toHaveProperty('site_role');
      expect(withSites.sites[0]).toHaveProperty('site_name');
      expect(withSites.sites[0]).toHaveProperty('site_code');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .get('/api/admin/invitations')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should scope invitations to SITE_ADMIN sites for Global Users', async () => {
      const response = await request(app)
        .get('/api/admin/invitations')
        .set('Authorization', `Bearer ${siteAdminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const emails = (response.body.data as any[]).map((i) => i.email);
      expect(emails).toContain('invite1@example.com');
      expect(emails).not.toContain('invite2@example.com');
      expect(emails).not.toContain('nosites@example.com');
    });
  });

  describe('PUT /api/admin/users/:id/sites', () => {
    let siteAdminUser: any;
    let siteAdminToken: string;

    beforeEach(async () => {
      siteAdminUser = await userModel.create({
        email: 'siteadmin@example.com',
        username: 'Site Admin User',
        password: 'SiteAdminPassword123!',
        role: 'USER',
      });
      siteAdminToken = generateToken(siteAdminUser);

      // Seed memberships: regular user is in-scope for the site admin; site admin administers testSite.
      await db.execute(
        `INSERT INTO site_memberships (site_id, user_id, site_role)
         VALUES (?, ?, ?)`,
        [testSite.id, siteAdminUser.id, 'SITE_ADMIN']
      );
      await db.execute(
        `INSERT INTO site_memberships (site_id, user_id, site_role)
         VALUES (?, ?, ?)`,
        [testSite.id, regularUser.id, 'SITE_USER']
      );
    });

    it('should prevent a Site Admin from demoting themselves', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${siteAdminUser.id}/sites`)
        .set('Authorization', `Bearer ${siteAdminToken}`)
        .send({
          sites: [{ site_id: testSite.id, site_role: 'SITE_USER' }],
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(String(response.body.error)).toContain('cannot modify');
    });

    it('should prevent a Site Admin from removing their own admin membership', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${siteAdminUser.id}/sites`)
        .set('Authorization', `Bearer ${siteAdminToken}`)
        .send({ sites: [] })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(String(response.body.error)).toContain('cannot modify');
    });

    it('should allow a Site Admin to update another user within their scope', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${regularUser.id}/sites`)
        .set('Authorization', `Bearer ${siteAdminToken}`)
        .send({
          sites: [{ site_id: testSite.id, site_role: 'SITE_ADMIN' }],
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      const rows = await db.query(
        'SELECT site_id, site_role FROM site_memberships WHERE user_id = ? AND site_id = ?',
        [regularUser.id, testSite.id]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].site_role).toBe('SITE_ADMIN');
    });

    it('should prevent a Site Admin from removing site access for another user', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${regularUser.id}/sites`)
        .set('Authorization', `Bearer ${siteAdminToken}`)
        .send({ sites: [] })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(String(response.body.error)).toContain('cannot remove');
    });

    it('should prevent a Site Admin from demoting another Site Admin to Site User', async () => {
      // Promote regularUser to SITE_ADMIN first.
      await db.execute(
        `UPDATE site_memberships SET site_role = ? WHERE site_id = ? AND user_id = ?`,
        ['SITE_ADMIN', testSite.id, regularUser.id]
      );

      const response = await request(app)
        .put(`/api/admin/users/${regularUser.id}/sites`)
        .set('Authorization', `Bearer ${siteAdminToken}`)
        .send({
          sites: [{ site_id: testSite.id, site_role: 'SITE_USER' }],
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(String(response.body.error)).toContain('cannot demote');
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
        [invitationId, testSite.id, 'SITE_USER']
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
        [invitationId, testSite.id, 'SITE_USER']
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
        [invitationId, testSite.id, 'SITE_USER']
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
        [invitationId, testSite.id, 'SITE_ADMIN']
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
      expect(response.body.data.username).toBe('newuser');
      expect(response.body.data.role).toBe('USER');
      expect(response.body.data.password_hash).toBeUndefined();

      // Verify invitation was marked as used
      const tokenHash = crypto.createHash('sha256').update(validToken).digest('hex');
      const usedRows = await db.query('SELECT used_at FROM invitations WHERE token_hash = ?', [tokenHash]);
      expect(usedRows).toHaveLength(1);
      expect(usedRows[0].used_at).toBeTruthy();

      // Verify user was created
      const user = await userModel.findByEmail('invite@example.com');
      expect(user).toBeDefined();
      expect(user?.role).toBe('USER');
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
        [invitationId, testSite.id, 'SITE_USER']
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
        role: 'USER',
      });
    });

    it('should return users list for admin', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(3); // global admin + 2 regular users
      expect(response.body.data.users[0]).toHaveProperty('email');
      expect(response.body.data.users[0]).toHaveProperty('username');
      expect(response.body.data.users[0]).toHaveProperty('role');
      expect(response.body.data.users[0]).toHaveProperty('label_count');
      expect(response.body.data.users[0]).toHaveProperty('site_count');
      expect(response.body.data.users[0]).toHaveProperty('last_activity');
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
        .get('/api/admin/users?role=GLOBAL_ADMIN')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.users).toHaveLength(1);
      expect(response.body.data.users[0].role).toBe('GLOBAL_ADMIN');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should scope users list for SITE_ADMIN Global Users', async () => {
      const siteAdminUser = await userModel.create({
        email: 'siteadmin-users@example.com',
        username: 'Site Admin Users',
        password: 'SiteAdminPassword123!',
        role: 'USER',
      });
      const siteAdminToken = generateToken(siteAdminUser);

      // Put the SITE_ADMIN user in testSite, and seed a regular member in testSite.
      await db.execute(
        `INSERT INTO site_memberships (site_id, user_id, site_role)
         VALUES (?, ?, ?)`
        , [testSite.id, siteAdminUser.id, 'SITE_ADMIN']
      );
      await db.execute(
        `INSERT INTO site_memberships (site_id, user_id, site_role)
         VALUES (?, ?, ?)`
        , [testSite.id, regularUser.id, 'SITE_USER']
      );

      // Create a Global Admin who is not in the site admin's scope (member of extraSite only)
      const outOfScopeGlobalAdmin = await userModel.create({
        email: 'global-out@example.com',
        username: 'Global Out',
        password: 'AdminPassword123!',
        role: 'GLOBAL_ADMIN',
      });
      await db.execute(
        `INSERT INTO site_memberships (site_id, user_id, site_role)
         VALUES (?, ?, ?)`
        , [extraSite.id, outOfScopeGlobalAdmin.id, 'SITE_ADMIN']
      );

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${siteAdminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      const emails = (response.body.data.users as any[]).map((u) => u.email);

      // Includes users in testSite (including the creator/adminUser) ...
      expect(emails).toContain(adminUser.email);
      expect(emails).toContain(siteAdminUser.email);
      expect(emails).toContain(regularUser.email);

      // ... but excludes Global Admins not in any shared admin-scoped site.
      expect(emails).not.toContain(outOfScopeGlobalAdmin.email);
    });
  });

  describe('PUT /api/admin/users/:id/role', () => {
    it('should update user role for admin', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${regularUser.id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'GLOBAL_ADMIN' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('updated successfully');

      // Verify role was updated
      const updatedUser = await userModel.findById(regularUser.id);
      expect(updatedUser?.role).toBe('GLOBAL_ADMIN');
    });

    it('should deny access for regular user', async () => {
      const response = await request(app)
        .put(`/api/admin/users/${regularUser.id}/role`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ role: 'GLOBAL_ADMIN' })
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
        .send({ role: 'GLOBAL_ADMIN' })
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
      default_user_role: 'user',
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

  describe('POST /api/admin/users/:id/password-reset + POST /api/auth/password-reset', () => {
    it('should create a password reset link and persist a token', async () => {
      const response = await request(app)
        .post(`/api/admin/users/${regularUser.id}/password-reset`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('reset_url');
      expect(response.body.data).toHaveProperty('email_sent');
      expect(response.body.data).toHaveProperty('expires_at');

      const resetUrlStr = String(response.body.data.reset_url);
      const url = resetUrlStr.startsWith('http')
        ? new URL(resetUrlStr)
        : new URL(resetUrlStr, 'http://example.local');
      const token = url.searchParams.get('token');
      expect(token).toBeTruthy();

      // In tests, SMTP is typically not configured; assert the API still returns a link.
      expect(response.body.data.email_sent).toBe(false);
      expect(response.body.data.email_error).toBeDefined();

      const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
      const rows = await db.query(
        'SELECT user_id, token_hash, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ? LIMIT 1',
        [tokenHash]
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].user_id)).toBe(regularUser.id);
      expect(String(rows[0].token_hash)).toBe(tokenHash);
      expect(rows[0].used_at).toBeNull();
    });

    it('should reset password using the token and prevent reuse', async () => {
      const createResponse = await request(app)
        .post(`/api/admin/users/${regularUser.id}/password-reset`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(201);

      const resetUrlStr = String(createResponse.body.data.reset_url);
      const url = resetUrlStr.startsWith('http')
        ? new URL(resetUrlStr)
        : new URL(resetUrlStr, 'http://example.local');
      const token = String(url.searchParams.get('token') || '');
      expect(token.length).toBeGreaterThan(0);

      const newPassword = 'NewPassword123!';
      const resetResponse = await request(app)
        .post('/api/auth/password-reset')
        .send({ token, password: newPassword })
        .expect(200);

      expect(resetResponse.body.success).toBe(true);
      expect(resetResponse.body.message).toContain('Password reset successfully');

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const rows = await db.query(
        'SELECT used_at FROM password_reset_tokens WHERE token_hash = ? LIMIT 1',
        [tokenHash]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].used_at).not.toBeNull();

      // Old password should fail, new password should succeed.
      const oldLogin = await userModel.verifyCredentials(regularUser.email, 'UserPassword123!');
      expect(oldLogin).toBeNull();
      const newLogin = await userModel.verifyCredentials(regularUser.email, newPassword);
      expect(newLogin).not.toBeNull();

      // Token reuse should be rejected.
      await request(app)
        .post('/api/auth/password-reset')
        .send({ token, password: 'AnotherPassword123!' })
        .expect(400);
    });
  });
});
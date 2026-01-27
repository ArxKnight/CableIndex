import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import app from '../app.js';
import UserModel from '../models/User.js';
import SiteModel from '../models/Site.js';
import connection from '../database/connection.js';
import { initializeDatabase } from '../database/init.js';
import { generateTokens } from '../utils/jwt.js';

describe('Site Routes', () => {
  let userModel: UserModel;
  let siteModel: SiteModel;
  let db: Database.Database;
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    // Initialize in-memory database for testing
    await initializeDatabase({ runMigrations: true, seedData: false });
    db = connection.getConnection();
    userModel = new UserModel();
    siteModel = new SiteModel();

    // Create test user and get auth token
    testUser = await userModel.create({
      email: 'test@example.com',
      full_name: 'Test User',
      password: 'TestPassword123!',
    });

    const tokens = generateTokens(testUser);
    authToken = tokens.accessToken;
  });

  afterEach(() => {
    // Clean up database
    if (db) {
      db.exec('DELETE FROM labels');
      db.exec('DELETE FROM sites');
      db.exec('DELETE FROM users');
    }
  });

  describe('GET /api/sites', () => {
    it('should get user sites', async () => {
      // Create test sites
      siteModel.create({
        name: 'Site 1',
        location: 'Location 1',
        user_id: testUser.id,
      });
      siteModel.create({
        name: 'Site 2',
        location: 'Location 2',
        user_id: testUser.id,
      });

      const response = await request(app)
        .get('/api/sites')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sites).toHaveLength(2);
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.total).toBe(2);
    });

    it('should get sites with label counts', async () => {
      const site = siteModel.create({
        name: 'Test Site',
        user_id: testUser.id,
      });

      // Create a label for this site
      db.exec(`
        INSERT INTO labels (reference_number, site_id, user_id, source, destination)
        VALUES ('TEST-001', ${site.id}, ${testUser.id}, 'Source', 'Dest')
      `);

      const response = await request(app)
        .get('/api/sites?include_counts=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sites).toHaveLength(1);
      expect(response.body.data.sites[0].label_count).toBe(1);
    });

    it('should filter sites by search term', async () => {
      siteModel.create({
        name: 'Office Site',
        location: 'New York',
        user_id: testUser.id,
      });
      siteModel.create({
        name: 'Warehouse Site',
        location: 'California',
        user_id: testUser.id,
      });

      const response = await request(app)
        .get('/api/sites?search=Office')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sites).toHaveLength(1);
      expect(response.body.data.sites[0].name).toBe('Office Site');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/sites')
        .expect(401);
    });

    it('should handle pagination parameters', async () => {
      // Create multiple sites
      for (let i = 1; i <= 5; i++) {
        siteModel.create({
          name: `Site ${i}`,
          user_id: testUser.id,
        });
      }

      const response = await request(app)
        .get('/api/sites?limit=2&offset=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sites).toHaveLength(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.offset).toBe(1);
      expect(response.body.data.pagination.has_more).toBe(true);
    });
  });

  describe('GET /api/sites/:id', () => {
    it('should get specific site', async () => {
      const site = siteModel.create({
        name: 'Test Site',
        location: 'Test Location',
        description: 'Test Description',
        user_id: testUser.id,
      });

      const response = await request(app)
        .get(`/api/sites/${site.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.site.name).toBe('Test Site');
      expect(response.body.data.site.location).toBe('Test Location');
      expect(response.body.data.site.description).toBe('Test Description');
      expect(response.body.data.site.label_count).toBe(0);
    });

    it('should return 404 for non-existent site', async () => {
      await request(app)
        .get('/api/sites/999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/sites/1')
        .expect(401);
    });

    it('should not allow access to other users sites', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const site = siteModel.create({
        name: 'Other User Site',
        user_id: otherUser.id,
      });

      await request(app)
        .get(`/api/sites/${site.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('POST /api/sites', () => {
    it('should create new site', async () => {
      const siteData = {
        name: 'New Site',
        location: 'New Location',
        description: 'New Description',
      };

      const response = await request(app)
        .post('/api/sites')
        .set('Authorization', `Bearer ${authToken}`)
        .send(siteData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.site.name).toBe(siteData.name);
      expect(response.body.data.site.location).toBe(siteData.location);
      expect(response.body.data.site.description).toBe(siteData.description);
      expect(response.body.data.site.user_id).toBe(testUser.id);
    });

    it('should create site with minimal data', async () => {
      const siteData = {
        name: 'Minimal Site',
      };

      const response = await request(app)
        .post('/api/sites')
        .set('Authorization', `Bearer ${authToken}`)
        .send(siteData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.site.name).toBe(siteData.name);
      expect(response.body.data.site.location).toBeNull();
      expect(response.body.data.site.description).toBeNull();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/sites')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate field lengths', async () => {
      const siteData = {
        name: 'x'.repeat(101), // Exceeds 100 character limit
        location: 'x'.repeat(201), // Exceeds 200 character limit
        description: 'x'.repeat(501), // Exceeds 500 character limit
      };

      const response = await request(app)
        .post('/api/sites')
        .set('Authorization', `Bearer ${authToken}`)
        .send(siteData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/sites')
        .send({ name: 'Test Site' })
        .expect(401);
    });
  });

  describe('PUT /api/sites/:id', () => {
    it('should update existing site', async () => {
      const site = siteModel.create({
        name: 'Original Site',
        location: 'Original Location',
        user_id: testUser.id,
      });

      const updateData = {
        name: 'Updated Site',
        location: 'Updated Location',
        description: 'Updated Description',
      };

      const response = await request(app)
        .put(`/api/sites/${site.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.site.name).toBe(updateData.name);
      expect(response.body.data.site.location).toBe(updateData.location);
      expect(response.body.data.site.description).toBe(updateData.description);
    });

    it('should update partial site data', async () => {
      const site = siteModel.create({
        name: 'Original Site',
        location: 'Original Location',
        description: 'Original Description',
        user_id: testUser.id,
      });

      const updateData = {
        name: 'Updated Site',
      };

      const response = await request(app)
        .put(`/api/sites/${site.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.site.name).toBe(updateData.name);
      expect(response.body.data.site.location).toBe('Original Location');
      expect(response.body.data.site.description).toBe('Original Description');
    });

    it('should return 404 for non-existent site', async () => {
      await request(app)
        .put('/api/sites/999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Site' })
        .expect(404);
    });

    it('should not allow updating other users sites', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const site = siteModel.create({
        name: 'Other User Site',
        user_id: otherUser.id,
      });

      await request(app)
        .put(`/api/sites/${site.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Site' })
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(app)
        .put('/api/sites/1')
        .send({ name: 'Updated Site' })
        .expect(401);
    });
  });

  describe('DELETE /api/sites/:id', () => {
    it('should delete site', async () => {
      const site = siteModel.create({
        name: 'Test Site',
        user_id: testUser.id,
      });

      const response = await request(app)
        .delete(`/api/sites/${site.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Site deleted successfully');

      // Verify site is deleted
      const deletedSite = siteModel.findById(site.id);
      expect(deletedSite).toBeNull();
    });

    it('should prevent deletion when site has labels', async () => {
      const site = siteModel.create({
        name: 'Test Site',
        user_id: testUser.id,
      });

      // Create a label for this site
      db.exec(`
        INSERT INTO labels (reference_number, site_id, user_id, source, destination)
        VALUES ('TEST-001', ${site.id}, ${testUser.id}, 'Source', 'Dest')
      `);

      const response = await request(app)
        .delete(`/api/sites/${site.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Cannot delete site with existing labels');
    });

    it('should return 404 for non-existent site', async () => {
      await request(app)
        .delete('/api/sites/999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should not allow deleting other users sites', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const site = siteModel.create({
        name: 'Other User Site',
        user_id: otherUser.id,
      });

      await request(app)
        .delete(`/api/sites/${site.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(app)
        .delete('/api/sites/1')
        .expect(401);
    });
  });
});
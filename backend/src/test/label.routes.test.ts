import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import app from '../app.js';
import UserModel from '../models/User.js';
import SiteModel from '../models/Site.js';
import LabelModel from '../models/Label.js';
import connection from '../database/connection.js';
import { initializeDatabase } from '../database/init.js';
import { generateTokens } from '../utils/jwt.js';

describe('Label Routes', () => {
  let userModel: UserModel;
  let siteModel: SiteModel;
  let labelModel: LabelModel;
  let db: Database.Database;
  let testUser: any;
  let testSite: any;
  let authToken: string;

  beforeEach(async () => {
    // Initialize in-memory database for testing
    await initializeDatabase({ runMigrations: true, seedData: false });
    db = connection.getConnection();
    userModel = new UserModel();
    siteModel = new SiteModel();
    labelModel = new LabelModel();

    // Create test user and get auth token
    testUser = await userModel.create({
      email: 'test@example.com',
      full_name: 'Test User',
      password: 'TestPassword123!',
    });

    const tokens = generateTokens(testUser);
    authToken = tokens.accessToken;

    // Create test site
    testSite = siteModel.create({
      name: 'TestSite',
      location: 'Test Location',
      user_id: testUser.id,
    });
  });

  afterEach(() => {
    // Clean up database
    if (db) {
      db.exec('DELETE FROM labels');
      db.exec('DELETE FROM sites');
      db.exec('DELETE FROM users');
    }
  });

  describe('GET /api/labels', () => {
    it('should get user labels', async () => {
      // Create test labels
      labelModel.create({
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSite.id,
        user_id: testUser.id,
      });
      labelModel.create({
        source: 'Switch A Port 2',
        destination: 'Server B NIC 2',
        site_id: testSite.id,
        user_id: testUser.id,
      });

      const response = await request(app)
        .get('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(2);
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.total).toBe(2);
    });

    it('should get labels with site information', async () => {
      labelModel.create({
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSite.id,
        user_id: testUser.id,
      });

      const response = await request(app)
        .get('/api/labels?include_site_info=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(1);
      expect(response.body.data.labels[0].site_name).toBe('TestSite');
      expect(response.body.data.labels[0].site_location).toBe('Test Location');
    });

    it('should filter labels by search term', async () => {
      labelModel.create({
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSite.id,
        user_id: testUser.id,
      });
      labelModel.create({
        source: 'Router C Port 1',
        destination: 'Firewall D Port 1',
        site_id: testSite.id,
        user_id: testUser.id,
      });

      const response = await request(app)
        .get('/api/labels?search=Switch')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(1);
      expect(response.body.data.labels[0].source).toBe('Switch A Port 1');
    });

    it('should filter labels by site_id', async () => {
      // Create another site
      const site2 = siteModel.create({
        name: 'Site2',
        user_id: testUser.id,
      });

      labelModel.create({
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSite.id,
        user_id: testUser.id,
      });
      labelModel.create({
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: site2.id,
        user_id: testUser.id,
      });

      const response = await request(app)
        .get(`/api/labels?site_id=${testSite.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(1);
      expect(response.body.data.labels[0].source).toBe('Source 1');
    });

    it('should handle pagination parameters', async () => {
      // Create multiple labels
      for (let i = 1; i <= 5; i++) {
        labelModel.create({
          source: `Source ${i}`,
          destination: `Dest ${i}`,
          site_id: testSite.id,
          user_id: testUser.id,
        });
      }

      const response = await request(app)
        .get('/api/labels?limit=2&offset=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.offset).toBe(1);
      expect(response.body.data.pagination.has_more).toBe(true);
    });

    it('should handle sorting parameters', async () => {
      labelModel.create({
        source: 'B Source',
        destination: 'Dest 1',
        site_id: testSite.id,
        user_id: testUser.id,
      });
      labelModel.create({
        source: 'A Source',
        destination: 'Dest 2',
        site_id: testSite.id,
        user_id: testUser.id,
      });

      const response = await request(app)
        .get('/api/labels?sort_by=source&sort_order=ASC')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(2);
      expect(response.body.data.labels[0].source).toBe('A Source');
      expect(response.body.data.labels[1].source).toBe('B Source');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/labels')
        .expect(401);
    });
  });

  describe('GET /api/labels/stats', () => {
    it('should get label statistics', async () => {
      labelModel.create({
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSite.id,
        user_id: testUser.id,
      });

      const response = await request(app)
        .get('/api/labels/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.stats).toBeDefined();
      expect(response.body.data.stats.total_labels).toBe(1);
      expect(response.body.data.stats.labels_today).toBe(1);
      expect(response.body.data.stats.labels_this_month).toBe(1);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/labels/stats')
        .expect(401);
    });
  });

  describe('GET /api/labels/recent', () => {
    it('should get recent labels', async () => {
      labelModel.create({
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSite.id,
        user_id: testUser.id,
      });

      const response = await request(app)
        .get('/api/labels/recent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(1);
      expect(response.body.data.labels[0].site_name).toBe('TestSite');
    });

    it('should respect limit parameter', async () => {
      // Create multiple labels
      for (let i = 1; i <= 5; i++) {
        labelModel.create({
          source: `Source ${i}`,
          destination: `Dest ${i}`,
          site_id: testSite.id,
          user_id: testUser.id,
        });
      }

      const response = await request(app)
        .get('/api/labels/recent?limit=3')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(3);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/labels/recent')
        .expect(401);
    });
  });

  describe('GET /api/labels/:id', () => {
    it('should get specific label', async () => {
      const label = labelModel.create({
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSite.id,
        user_id: testUser.id,
        notes: 'Test notes',
      });

      const response = await request(app)
        .get(`/api/labels/${label.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.label.source).toBe('Switch A Port 1');
      expect(response.body.data.label.destination).toBe('Server B NIC 1');
      expect(response.body.data.label.notes).toBe('Test notes');
      expect(response.body.data.label.reference_number).toBe('TestSite-1');
    });

    it('should return 404 for non-existent label', async () => {
      await request(app)
        .get('/api/labels/999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should not allow access to other users labels', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const label = labelModel.create({
        source: 'Source',
        destination: 'Destination',
        site_id: testSite.id,
        user_id: otherUser.id,
      });

      await request(app)
        .get(`/api/labels/${label.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/labels/1')
        .expect(401);
    });
  });

  describe('POST /api/labels', () => {
    it('should create new label', async () => {
      const labelData = {
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSite.id,
        notes: 'Test cable',
      };

      const response = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(labelData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.label.source).toBe(labelData.source);
      expect(response.body.data.label.destination).toBe(labelData.destination);
      expect(response.body.data.label.site_id).toBe(testSite.id);
      expect(response.body.data.label.user_id).toBe(testUser.id);
      expect(response.body.data.label.notes).toBe(labelData.notes);
      expect(response.body.data.label.reference_number).toBe('TestSite-1');
    });

    it('should create label with minimal data', async () => {
      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: testSite.id,
      };

      const response = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(labelData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.label.source).toBe(labelData.source);
      expect(response.body.data.label.destination).toBe(labelData.destination);
      expect(response.body.data.label.notes).toBeNull();
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate field lengths', async () => {
      const labelData = {
        source: 'x'.repeat(201), // Exceeds 200 character limit
        destination: 'x'.repeat(201), // Exceeds 200 character limit
        site_id: testSite.id,
        notes: 'x'.repeat(1001), // Exceeds 1000 character limit
      };

      const response = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(labelData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate site ownership', async () => {
      // Create another user and their site
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const otherSite = siteModel.create({
        name: 'OtherSite',
        user_id: otherUser.id,
      });

      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: otherSite.id,
      };

      const response = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(labelData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid site ID or site does not belong to user');
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/labels')
        .send({ source: 'Source', destination: 'Destination', site_id: testSite.id })
        .expect(401);
    });
  });

  describe('PUT /api/labels/:id', () => {
    it('should update existing label', async () => {
      const label = labelModel.create({
        source: 'Original Source',
        destination: 'Original Destination',
        site_id: testSite.id,
        user_id: testUser.id,
        notes: 'Original notes',
      });

      const updateData = {
        source: 'Updated Source',
        destination: 'Updated Destination',
        notes: 'Updated notes',
      };

      const response = await request(app)
        .put(`/api/labels/${label.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.label.source).toBe(updateData.source);
      expect(response.body.data.label.destination).toBe(updateData.destination);
      expect(response.body.data.label.notes).toBe(updateData.notes);
      expect(response.body.data.label.reference_number).toBe(label.reference_number); // Should remain unchanged
    });

    it('should update partial label data', async () => {
      const label = labelModel.create({
        source: 'Original Source',
        destination: 'Original Destination',
        site_id: testSite.id,
        user_id: testUser.id,
        notes: 'Original notes',
      });

      const updateData = {
        source: 'Updated Source',
      };

      const response = await request(app)
        .put(`/api/labels/${label.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.label.source).toBe(updateData.source);
      expect(response.body.data.label.destination).toBe('Original Destination');
      expect(response.body.data.label.notes).toBe('Original notes');
    });

    it('should return 404 for non-existent label', async () => {
      await request(app)
        .put('/api/labels/999')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ source: 'Updated Source' })
        .expect(404);
    });

    it('should not allow updating other users labels', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const label = labelModel.create({
        source: 'Source',
        destination: 'Destination',
        site_id: testSite.id,
        user_id: otherUser.id,
      });

      await request(app)
        .put(`/api/labels/${label.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ source: 'Updated Source' })
        .expect(404);
    });

    it('should validate empty source and destination', async () => {
      const label = labelModel.create({
        source: 'Source',
        destination: 'Destination',
        site_id: testSite.id,
        user_id: testUser.id,
      });

      const response = await request(app)
        .put(`/api/labels/${label.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ source: '' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should require authentication', async () => {
      await request(app)
        .put('/api/labels/1')
        .send({ source: 'Updated Source' })
        .expect(401);
    });
  });

  describe('DELETE /api/labels/:id', () => {
    it('should delete label', async () => {
      const label = labelModel.create({
        source: 'Source',
        destination: 'Destination',
        site_id: testSite.id,
        user_id: testUser.id,
      });

      const response = await request(app)
        .delete(`/api/labels/${label.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Label deleted successfully');

      // Verify label is deleted
      const deletedLabel = labelModel.findById(label.id);
      expect(deletedLabel).toBeNull();
    });

    it('should return 404 for non-existent label', async () => {
      await request(app)
        .delete('/api/labels/999')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should not allow deleting other users labels', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const label = labelModel.create({
        source: 'Source',
        destination: 'Destination',
        site_id: testSite.id,
        user_id: otherUser.id,
      });

      await request(app)
        .delete(`/api/labels/${label.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(app)
        .delete('/api/labels/1')
        .expect(401);
    });
  });

  describe('POST /api/labels/bulk-delete', () => {
    it('should delete multiple labels', async () => {
      const label1 = labelModel.create({
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSite.id,
        user_id: testUser.id,
      });

      const label2 = labelModel.create({
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: testSite.id,
        user_id: testUser.id,
      });

      const response = await request(app)
        .post('/api/labels/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: [label1.id, label2.id] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted_count).toBe(2);

      // Verify labels are deleted
      expect(labelModel.findById(label1.id)).toBeNull();
      expect(labelModel.findById(label2.id)).toBeNull();
    });

    it('should validate request body', async () => {
      const response = await request(app)
        .post('/api/labels/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate array limits', async () => {
      const ids = Array.from({ length: 101 }, (_, i) => i + 1); // 101 IDs

      const response = await request(app)
        .post('/api/labels/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should only delete labels owned by user', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const label1 = labelModel.create({
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSite.id,
        user_id: testUser.id,
      });

      const label2 = labelModel.create({
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: testSite.id,
        user_id: otherUser.id,
      });

      const response = await request(app)
        .post('/api/labels/bulk-delete')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: [label1.id, label2.id] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deleted_count).toBe(1); // Only one label deleted

      // Verify only the user's label is deleted
      expect(labelModel.findById(label1.id)).toBeNull();
      expect(labelModel.findById(label2.id)).toBeDefined();
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/labels/bulk-delete')
        .send({ ids: [1, 2] })
        .expect(401);
    });
  });

  describe('Advanced search and filter scenarios', () => {
    beforeEach(() => {
      // Create test data for advanced scenarios
      labelModel.create({
        source: 'Switch-A Port 1',
        destination: 'Server-B NIC 1',
        site_id: testSite.id,
        user_id: testUser.id,
        notes: 'Production critical cable',
      });

      labelModel.create({
        source: 'Router-C Port 2',
        destination: 'Firewall-D Port 1',
        site_id: testSite.id,
        user_id: testUser.id,
        notes: 'Backup connection',
      });

      labelModel.create({
        source: 'Switch-A Port 2',
        destination: 'Server-E NIC 1',
        site_id: testSite.id,
        user_id: testUser.id,
        notes: 'Test environment',
      });
    });

    it('should handle complex search queries', async () => {
      const response = await request(app)
        .get('/api/labels?search=Switch-A')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(2);
      expect(response.body.data.labels.every((label: any) => 
        label.source.includes('Switch-A')
      )).toBe(true);
    });

    it('should handle search in notes field', async () => {
      const response = await request(app)
        .get('/api/labels?search=Production')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(1);
      expect(response.body.data.labels[0].notes).toContain('Production');
    });

    it('should handle multiple filter combinations', async () => {
      const response = await request(app)
        .get(`/api/labels?site_id=${testSite.id}&source=Switch&destination=Server`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(2);
      expect(response.body.data.labels.every((label: any) => 
        label.source.includes('Switch') && label.destination.includes('Server')
      )).toBe(true);
    });

    it('should handle case-insensitive filtering', async () => {
      const response = await request(app)
        .get('/api/labels?source=switch')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(2);
    });

    it('should return empty results for non-matching filters', async () => {
      const response = await request(app)
        .get('/api/labels?search=NonExistentTerm')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(0);
      expect(response.body.data.pagination.total).toBe(0);
    });
  });

  describe('Reference number uniqueness validation', () => {
    it('should generate unique reference numbers for same site', async () => {
      const label1Data = {
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSite.id,
      };

      const label2Data = {
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: testSite.id,
      };

      const response1 = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(label1Data)
        .expect(201);

      const response2 = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(label2Data)
        .expect(201);

      expect(response1.body.data.label.reference_number).toBe('TestSite-1');
      expect(response2.body.data.label.reference_number).toBe('TestSite-2');
      expect(response1.body.data.label.reference_number).not.toBe(response2.body.data.label.reference_number);
    });

    it('should handle reference numbers across different sites', async () => {
      // Create another site
      const site2 = siteModel.create({
        name: 'Site2',
        user_id: testUser.id,
      });

      const label1Data = {
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSite.id,
      };

      const label2Data = {
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: site2.id,
      };

      const response1 = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(label1Data)
        .expect(201);

      const response2 = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(label2Data)
        .expect(201);

      expect(response1.body.data.label.reference_number).toBe('TestSite-1');
      expect(response2.body.data.label.reference_number).toBe('Site2-1');
    });
  });

  describe('Data validation edge cases', () => {
    it('should handle maximum length inputs', async () => {
      const labelData = {
        source: 'A'.repeat(200), // Max length
        destination: 'B'.repeat(200), // Max length
        site_id: testSite.id,
        notes: 'C'.repeat(1000), // Max length
      };

      const response = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(labelData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.label.source).toBe(labelData.source);
      expect(response.body.data.label.destination).toBe(labelData.destination);
      expect(response.body.data.label.notes).toBe(labelData.notes);
    });

    it('should reject inputs exceeding maximum length', async () => {
      const labelData = {
        source: 'A'.repeat(201), // Exceeds max length
        destination: 'B'.repeat(201), // Exceeds max length
        site_id: testSite.id,
        notes: 'C'.repeat(1001), // Exceeds max length
      };

      const response = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(labelData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should trim whitespace from inputs', async () => {
      const labelData = {
        source: '  Source with spaces  ',
        destination: '  Destination with spaces  ',
        site_id: testSite.id,
        notes: '  Notes with spaces  ',
      };

      const response = await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(labelData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.label.source).toBe('Source with spaces');
      expect(response.body.data.label.destination).toBe('Destination with spaces');
      expect(response.body.data.label.notes).toBe('  Notes with spaces  '); // Notes are not trimmed
    });

    it('should reject whitespace-only inputs', async () => {
      const labelData1 = {
        source: '   ',
        destination: 'Valid Destination',
        site_id: testSite.id,
      };

      const labelData2 = {
        source: 'Valid Source',
        destination: '   ',
        site_id: testSite.id,
      };

      await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(labelData1)
        .expect(400);

      await request(app)
        .post('/api/labels')
        .set('Authorization', `Bearer ${authToken}`)
        .send(labelData2)
        .expect(400);
    });
  });

  describe('Pagination and sorting edge cases', () => {
    beforeEach(async () => {
      // Create multiple labels for pagination testing
      for (let i = 1; i <= 15; i++) {
        labelModel.create({
          source: `Source ${i.toString().padStart(2, '0')}`,
          destination: `Dest ${i.toString().padStart(2, '0')}`,
          site_id: testSite.id,
          user_id: testUser.id,
        });
      }
    });

    it('should handle large offset values', async () => {
      const response = await request(app)
        .get('/api/labels?limit=5&offset=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(5);
      expect(response.body.data.pagination.offset).toBe(10);
      expect(response.body.data.pagination.has_more).toBe(false);
    });

    it('should handle offset beyond available data', async () => {
      const response = await request(app)
        .get('/api/labels?limit=5&offset=20')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(0);
      expect(response.body.data.pagination.has_more).toBe(false);
    });

    it('should handle maximum limit values', async () => {
      const response = await request(app)
        .get('/api/labels?limit=100')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.labels).toHaveLength(15); // All available labels
      expect(response.body.data.pagination.limit).toBe(100);
    });

    it('should reject limit values exceeding maximum', async () => {
      const response = await request(app)
        .get('/api/labels?limit=101')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle different sorting combinations', async () => {
      const responseAsc = await request(app)
        .get('/api/labels?sort_by=source&sort_order=ASC&limit=3')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const responseDesc = await request(app)
        .get('/api/labels?sort_by=source&sort_order=DESC&limit=3')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(responseAsc.body.data.labels[0].source).toBe('Source 01');
      expect(responseDesc.body.data.labels[0].source).toBe('Source 15');
    });
  });
});
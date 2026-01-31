import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { setupTestDatabase, cleanupTestDatabase } from './setup.js';
import LabelModel from '../models/Label.js';
import SiteModel from '../models/Site.js';
import UserModel from '../models/User.js';
import { generateToken } from '../utils/jwt.js';

describe('ZPL Routes', () => {
  let testUserId: number;
  let testSiteId: number;
  let testLabelId: number;
  let authToken: string;

  beforeEach(async () => {
    setupTestDatabase();

    // Create test user
    const userModel = new UserModel();
    const user = userModel.create({
      email: 'test@example.com',
      password: 'password123',
      full_name: 'Test User'
    });
    testUserId = user.id;
    authToken = generateToken({ userId: user.id, email: user.email });

    // Create test site
    const siteModel = new SiteModel();
    const site = siteModel.create({
      name: 'TestSite',
      location: 'Test Location',
      description: 'Test site for ZPL tests',
      user_id: testUserId
    });
    testSiteId = site.id;

    // Create test label
    const labelModel = new LabelModel();
    const label = labelModel.create({
      source: 'Server-01',
      destination: 'Switch-01',
      site_id: testSiteId,
      user_id: testUserId,
      notes: 'Test label'
    });
    testLabelId = label.id;
  });

  afterEach(() => {
    cleanupTestDatabase();
  });

  describe('GET /api/labels/:id/zpl', () => {
    it('should generate and download ZPL for existing label', async () => {
      const response = await request(app)
        .get(`/api/labels/${testLabelId}/zpl`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('.txt');
      expect(response.text).toContain('^XA');
      expect(response.text).toContain('^XZ');
      expect(response.text).toContain('TestSite-1 Server-01 > Switch-01');
    });

    it('should return 404 for non-existent label', async () => {
      const response = await request(app)
        .get('/api/labels/99999/zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Label not found');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get(`/api/labels/${testLabelId}/zpl`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should return 400 for invalid label ID', async () => {
      const response = await request(app)
        .get('/api/labels/invalid/zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/labels/bulk-zpl', () => {
    it('should generate bulk ZPL for multiple labels', async () => {
      // Create another test label
      const labelModel = new LabelModel();
      const label2 = labelModel.create({
        source: 'Server-02',
        destination: 'Switch-02',
        site_id: testSiteId,
        user_id: testUserId
      });

      const response = await request(app)
        .post('/api/labels/bulk-zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: [testLabelId, label2.id] })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('bulk-labels-');
      expect(response.text).toContain('TestSite-1 Server-01 > Switch-01');
      expect(response.text).toContain('TestSite-2 Server-02 > Switch-02');
    });

    it('should return 404 when no valid labels found', async () => {
      const response = await request(app)
        .post('/api/labels/bulk-zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: [99999, 99998] })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No valid labels found');
    });

    it('should return 400 for empty IDs array', async () => {
      const response = await request(app)
        .post('/api/labels/bulk-zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: [] })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 400 for too many IDs', async () => {
      const manyIds = Array.from({ length: 101 }, (_, i) => i + 1);
      
      const response = await request(app)
        .post('/api/labels/bulk-zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ids: manyIds })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/labels/port-labels/zpl', () => {
    it('should generate ZPL for port labels', async () => {
      const response = await request(app)
        .post('/api/labels/port-labels/zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sid: 'SW01',
          fromPort: 1,
          toPort: 3
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('port-labels-SW01-1-3.txt');
      expect(response.text).toContain('^XA');
      expect(response.text).toContain('^XZ');
      expect(response.text).toContain('SW01/1');
      expect(response.text).toContain('SW01/2');
      expect(response.text).toContain('SW01/3');
    });

    it('should return 400 for missing SID', async () => {
      const response = await request(app)
        .post('/api/labels/port-labels/zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sid: '',
          fromPort: 1,
          toPort: 3
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 400 for invalid port range', async () => {
      const response = await request(app)
        .post('/api/labels/port-labels/zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sid: 'SW01',
          fromPort: 5,
          toPort: 3
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 400 for too many ports', async () => {
      const response = await request(app)
        .post('/api/labels/port-labels/zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sid: 'SW01',
          fromPort: 1,
          toPort: 102
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Port range cannot exceed 100 ports');
    });

    it('should return 400 for invalid characters in SID', async () => {
      const response = await request(app)
        .post('/api/labels/port-labels/zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sid: 'SW^01',
          fromPort: 1,
          toPort: 3
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('SID cannot contain ^ or ~ characters');
    });
  });

  describe('POST /api/labels/pdu-labels/zpl', () => {
    it('should generate ZPL for PDU labels', async () => {
      const response = await request(app)
        .post('/api/labels/pdu-labels/zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          pduSid: 'PDU-A1',
          fromPort: 1,
          toPort: 3
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('pdu-labels-PDU-A1-1-3.txt');
      expect(response.text).toContain('^XA');
      expect(response.text).toContain('^XZ');
      expect(response.text).toContain('PDU-A1/1');
      expect(response.text).toContain('PDU-A1/2');
      expect(response.text).toContain('PDU-A1/3');
    });

    it('should return 400 for missing PDU SID', async () => {
      const response = await request(app)
        .post('/api/labels/pdu-labels/zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          pduSid: '',
          fromPort: 1,
          toPort: 3
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 400 for too many PDU ports', async () => {
      const response = await request(app)
        .post('/api/labels/pdu-labels/zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          pduSid: 'PDU-A1',
          fromPort: 1,
          toPort: 50
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('PDU port range cannot exceed 48 ports');
    });

    it('should return 400 for invalid characters in PDU SID', async () => {
      const response = await request(app)
        .post('/api/labels/pdu-labels/zpl')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          pduSid: 'PDU~A1',
          fromPort: 1,
          toPort: 3
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('PDU SID cannot contain ^ or ~ characters');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/labels/pdu-labels/zpl')
        .send({
          pduSid: 'PDU-A1',
          fromPort: 1,
          toPort: 3
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });
  });
});
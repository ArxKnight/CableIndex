import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import SiteModel from '../models/Site.js';
import UserModel from '../models/User.js';
import { setupTestDatabase, cleanupTestDatabase } from './setup.js';

describe('Site Model', () => {
  let siteModel: SiteModel;
  let userModel: UserModel;
  let db: any;
  let testUserId: number;

  beforeEach(async () => {
    db = await setupTestDatabase({ runMigrations: true, seedData: false });
    siteModel = new SiteModel();
    userModel = new UserModel();

    const testUser = await userModel.create({
      email: 'test@example.com',
      full_name: 'Test User',
      password: 'TestPassword123!',
      role: 'USER',
    });
    testUserId = testUser.id;
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  describe('create', () => {
    it('creates a new site and membership', async () => {
      const site = await siteModel.create({
        name: 'Test Site',
        code: 'TS',
        location: 'Test Location',
        description: 'Test Description',
        created_by: testUserId,
      });

      expect(site.id).toBeDefined();
      expect(site.name).toBe('Test Site');
      expect(site.code).toBe('TS');
      expect(site.location).toBe('Test Location');
      expect(site.description).toBe('Test Description');
      expect(site.created_by).toBe(testUserId);
    });

    it('creates site with minimal data', async () => {
      const site = await siteModel.create({
        name: 'Minimal Site',
        code: 'MS',
        created_by: testUserId,
      });

      expect(site.name).toBe('Minimal Site');
      expect(site.code).toBe('MS');
      expect(site.location ?? null).toBeNull();
      expect(site.description ?? null).toBeNull();
    });
  });

  describe('findById', () => {
    it('finds site by ID', async () => {
      const createdSite = await siteModel.create({
        name: 'Test Site',
        code: 'TS',
        location: 'Test Location',
        created_by: testUserId,
      });

      const foundSite = await siteModel.findById(createdSite.id);
      expect(foundSite).toBeDefined();
      expect(foundSite!.id).toBe(createdSite.id);
      expect(foundSite!.name).toBe('Test Site');
      expect(foundSite!.code).toBe('TS');
    });

    it('returns null for non-existent ID', async () => {
      const site = await siteModel.findById(999);
      expect(site).toBeNull();
    });

    it('does not return inactive sites', async () => {
      const createdSite = await siteModel.create({
        name: 'Inactive Site',
        code: 'IS',
        created_by: testUserId,
      });

      await db.execute(`UPDATE sites SET is_active = 0 WHERE id = ?`, [createdSite.id]);
      const foundSite = await siteModel.findById(createdSite.id);
      expect(foundSite).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('lists sites for a user ordered by name', async () => {
      await siteModel.create({ name: 'Site 1', code: 'S1', created_by: testUserId });
      await siteModel.create({ name: 'Site 2', code: 'S2', created_by: testUserId });

      const sites = await siteModel.findByUserId(testUserId);
      expect(sites).toHaveLength(2);
      expect(sites[0]?.name).toBe('Site 1');
      expect(sites[1]?.name).toBe('Site 2');
    });

    it('filters by search term', async () => {
      await siteModel.create({ name: 'Office Site', code: 'OFF', location: 'New York', created_by: testUserId });
      await siteModel.create({ name: 'Warehouse Site', code: 'WH', location: 'California', created_by: testUserId });

      const sites = await siteModel.findByUserId(testUserId, { search: 'Office' });
      expect(sites).toHaveLength(1);
      expect(sites[0]?.name).toBe('Office Site');
    });

    it('respects limit and offset', async () => {
      for (let i = 1; i <= 5; i++) {
        await siteModel.create({ name: `Site ${i}`, code: `S${i}`, created_by: testUserId });
      }

      const sites = await siteModel.findByUserId(testUserId, { limit: 2, offset: 1 });
      expect(sites).toHaveLength(2);
      expect(sites[0]?.name).toBe('Site 2');
      expect(sites[1]?.name).toBe('Site 3');
    });
  });

  describe('update', () => {
    it('updates site data', async () => {
      const site = await siteModel.create({
        name: 'Original Site',
        code: 'OS',
        location: 'Original Location',
        description: 'Original Description',
        created_by: testUserId,
      });

      const updatedSite = await siteModel.update(site.id, testUserId, {
        name: 'Updated Site',
        location: 'Updated Location',
      });

      expect(updatedSite).toBeDefined();
      expect(updatedSite!.name).toBe('Updated Site');
      expect(updatedSite!.location).toBe('Updated Location');
      expect(updatedSite!.description ?? null).toBe('Original Description');
    });

    it('returns null for non-existent site', async () => {
      const updatedSite = await siteModel.update(999, testUserId, { name: 'Updated Site' });
      expect(updatedSite).toBeNull();
    });
  });

  describe('existsForUser', () => {
    it('returns true if user is a member of the site', async () => {
      const site = await siteModel.create({ name: 'Member Site', code: 'MB', created_by: testUserId });
      const exists = await siteModel.existsForUser(site.id, testUserId);
      expect(exists).toBe(true);
    });
  });

  describe('delete', () => {
    it('deletes a site without labels', async () => {
      const site = await siteModel.create({ name: 'Delete Site', code: 'DEL', created_by: testUserId });
      const success = await siteModel.delete(site.id, testUserId);
      expect(success).toBe(true);

      const found = await siteModel.findById(site.id);
      expect(found).toBeNull();
    });
  });
});


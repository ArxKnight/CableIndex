// @ts-ignore - Vitest globals are available at runtime
const { describe, it, expect, beforeEach, afterEach } = globalThis;
// Use any type for Database to avoid better-sqlite3 installation issues
type Database = any;
import SiteModel from '../models/Site.js';
import UserModel from '../models/User.js';
import connection from '../database/connection.js';
import { initializeDatabase } from '../database/init.js';

describe('Site Model', () => {
  let siteModel: SiteModel;
  let userModel: UserModel;
  let db: Database;
  let testUserId: number;

  beforeEach(async () => {
    // Initialize in-memory database for testing
    await initializeDatabase({ runMigrations: true, seedData: false });
    db = connection.getConnection();
    siteModel = new SiteModel();
    userModel = new UserModel();

    // Create a test user
    const testUser = await userModel.create({
      email: 'test@example.com',
      full_name: 'Test User',
      password: 'TestPassword123!',
    });
    testUserId = testUser.id;
  });

  afterEach(() => {
    // Clean up database
    if (db) {
      db.exec('DELETE FROM labels');
      db.exec('DELETE FROM sites');
      db.exec('DELETE FROM users');
    }
  });

  describe('create', () => {
    it('should create a new site', () => {
      const siteData = {
        name: 'Test Site',
        location: 'Test Location',
        description: 'Test Description',
        user_id: testUserId,
      };

      const site = siteModel.create(siteData);

      expect(site).toBeDefined();
      expect(site.id).toBeDefined();
      expect(site.name).toBe(siteData.name);
      expect(site.location).toBe(siteData.location);
      expect(site.description).toBe(siteData.description);
      expect(site.user_id).toBe(testUserId);
      expect(site.created_at).toBeDefined();
      expect(site.updated_at).toBeDefined();
    });

    it('should create site with minimal data', () => {
      const siteData = {
        name: 'Minimal Site',
        user_id: testUserId,
      };

      const site = siteModel.create(siteData);

      expect(site).toBeDefined();
      expect(site.name).toBe(siteData.name);
      expect(site.location).toBeNull();
      expect(site.description).toBeNull();
      expect(site.user_id).toBe(testUserId);
    });
  });

  describe('findById', () => {
    it('should find site by ID', () => {
      const siteData = {
        name: 'Test Site',
        location: 'Test Location',
        user_id: testUserId,
      };

      const createdSite = siteModel.create(siteData);
      const foundSite = siteModel.findById(createdSite.id);

      expect(foundSite).toBeDefined();
      expect(foundSite!.id).toBe(createdSite.id);
      expect(foundSite!.name).toBe(siteData.name);
      expect(foundSite!.location).toBe(siteData.location);
    });

    it('should return null for non-existent ID', () => {
      const site = siteModel.findById(999);
      expect(site).toBeNull();
    });

    it('should not find inactive sites', () => {
      const siteData = {
        name: 'Test Site',
        user_id: testUserId,
      };

      const createdSite = siteModel.create(siteData);

      // Manually set site as inactive
      db.exec(`UPDATE sites SET is_active = 0 WHERE id = ${createdSite.id}`);

      const foundSite = siteModel.findById(createdSite.id);
      expect(foundSite).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should find sites by user ID', () => {
      const siteData1 = {
        name: 'Site 1',
        location: 'Location 1',
        user_id: testUserId,
      };
      const siteData2 = {
        name: 'Site 2',
        location: 'Location 2',
        user_id: testUserId,
      };

      siteModel.create(siteData1);
      siteModel.create(siteData2);

      const sites = siteModel.findByUserId(testUserId);

      expect(sites).toHaveLength(2);
      expect(sites[0]?.name).toBe('Site 1'); // Should be ordered by name ASC
      expect(sites[1]?.name).toBe('Site 2');
    });

    it('should filter sites by search term', () => {
      const siteData1 = {
        name: 'Office Site',
        location: 'New York',
        user_id: testUserId,
      };
      const siteData2 = {
        name: 'Warehouse Site',
        location: 'California',
        user_id: testUserId,
      };

      siteModel.create(siteData1);
      siteModel.create(siteData2);

      const sites = siteModel.findByUserId(testUserId, { search: 'Office' });

      expect(sites).toHaveLength(1);
      expect(sites[0]?.name).toBe('Office Site');
    });

    it('should respect limit and offset', () => {
      // Create multiple sites
      for (let i = 1; i <= 5; i++) {
        siteModel.create({
          name: `Site ${i}`,
          user_id: testUserId,
        });
      }

      const sites = siteModel.findByUserId(testUserId, { limit: 2, offset: 1 });

      expect(sites).toHaveLength(2);
      expect(sites[0]?.name).toBe('Site 2');
      expect(sites[1]?.name).toBe('Site 3');
    });
  });

  describe('update', () => {
    it('should update site data', () => {
      const siteData = {
        name: 'Original Site',
        location: 'Original Location',
        description: 'Original Description',
        user_id: testUserId,
      };

      const site = siteModel.create(siteData);
      const updatedSite = siteModel.update(site.id, testUserId, {
        name: 'Updated Site',
        location: 'Updated Location',
      });

      expect(updatedSite).toBeDefined();
      expect(updatedSite!.name).toBe('Updated Site');
      expect(updatedSite!.location).toBe('Updated Location');
      expect(updatedSite!.description).toBe('Original Description'); // Should remain unchanged
    });

    it('should return null for non-existent site', () => {
      const updatedSite = siteModel.update(999, testUserId, { name: 'Updated Site' });
      expect(updatedSite).toBeNull();
    });

    it('should return null when user does not own site', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const siteData = {
        name: 'Test Site',
        user_id: testUserId,
      };

      const site = siteModel.create(siteData);
      const updatedSite = siteModel.update(site.id, otherUser.id, { name: 'Updated Site' });

      expect(updatedSite).toBeNull();
    });
  });

  describe('delete', () => {
    it('should soft delete site', () => {
      const siteData = {
        name: 'Test Site',
        user_id: testUserId,
      };

      const site = siteModel.create(siteData);
      const success = siteModel.delete(site.id, testUserId);

      expect(success).toBe(true);

      // Site should not be found by normal queries
      const deletedSite = siteModel.findById(site.id);
      expect(deletedSite).toBeNull();

      // But should still exist in database as inactive
      const rawSite = db.prepare('SELECT * FROM sites WHERE id = ?').get(site.id);
      expect(rawSite).toBeDefined();
      expect((rawSite as any).is_active).toBe(0);
    });

    it('should prevent deletion when site has labels', () => {
      const siteData = {
        name: 'Test Site',
        user_id: testUserId,
      };

      const site = siteModel.create(siteData);

      // Create a label for this site
      db.exec(`
        INSERT INTO labels (reference_number, site_id, user_id, source, destination)
        VALUES ('TEST-001', ${site.id}, ${testUserId}, 'Source', 'Destination')
      `);

      expect(() => {
        siteModel.delete(site.id, testUserId);
      }).toThrow('Cannot delete site with existing labels');
    });

    it('should return false for non-existent site', () => {
      const success = siteModel.delete(999, testUserId);
      expect(success).toBe(false);
    });

    it('should return false when user does not own site', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const siteData = {
        name: 'Test Site',
        user_id: testUserId,
      };

      const site = siteModel.create(siteData);
      const success = siteModel.delete(site.id, otherUser.id);

      expect(success).toBe(false);
    });
  });

  describe('existsForUser', () => {
    it('should return true for existing site owned by user', () => {
      const siteData = {
        name: 'Test Site',
        user_id: testUserId,
      };

      const site = siteModel.create(siteData);
      const exists = siteModel.existsForUser(site.id, testUserId);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent site', () => {
      const exists = siteModel.existsForUser(999, testUserId);
      expect(exists).toBe(false);
    });

    it('should return false for site owned by different user', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const siteData = {
        name: 'Test Site',
        user_id: testUserId,
      };

      const site = siteModel.create(siteData);
      const exists = siteModel.existsForUser(site.id, otherUser.id);

      expect(exists).toBe(false);
    });
  });

  describe('countByUserId', () => {
    it('should count sites for user', () => {
      siteModel.create({ name: 'Site 1', user_id: testUserId });
      siteModel.create({ name: 'Site 2', user_id: testUserId });

      const count = siteModel.countByUserId(testUserId);
      expect(count).toBe(2);
    });

    it('should count sites with search filter', () => {
      siteModel.create({ name: 'Office Site', user_id: testUserId });
      siteModel.create({ name: 'Warehouse Site', user_id: testUserId });

      const count = siteModel.countByUserId(testUserId, 'Office');
      expect(count).toBe(1);
    });
  });

  describe('findByIdWithLabelCount', () => {
    it('should return site with label count', () => {
      const siteData = {
        name: 'Test Site',
        user_id: testUserId,
      };

      const site = siteModel.create(siteData);

      // Create labels for this site
      db.exec(`
        INSERT INTO labels (reference_number, site_id, user_id, source, destination)
        VALUES 
          ('TEST-001', ${site.id}, ${testUserId}, 'Source1', 'Dest1'),
          ('TEST-002', ${site.id}, ${testUserId}, 'Source2', 'Dest2')
      `);

      const siteWithCount = siteModel.findByIdWithLabelCount(site.id, testUserId);

      expect(siteWithCount).toBeDefined();
      expect(siteWithCount!.name).toBe('Test Site');
      expect(siteWithCount!.label_count).toBe(2);
    });

    it('should return site with zero label count', () => {
      const siteData = {
        name: 'Test Site',
        user_id: testUserId,
      };

      const site = siteModel.create(siteData);
      const siteWithCount = siteModel.findByIdWithLabelCount(site.id, testUserId);

      expect(siteWithCount).toBeDefined();
      expect(siteWithCount!.label_count).toBe(0);
    });
  });

  describe('findByUserIdWithLabelCounts', () => {
    it('should return sites with label counts', () => {
      const site1 = siteModel.create({ name: 'Site 1', user_id: testUserId });
      const site2 = siteModel.create({ name: 'Site 2', user_id: testUserId });

      // Create labels for site1 only
      db.exec(`
        INSERT INTO labels (reference_number, site_id, user_id, source, destination)
        VALUES ('TEST-001', ${site1.id}, ${testUserId}, 'Source', 'Dest')
      `);

      const sitesWithCounts = siteModel.findByUserIdWithLabelCounts(testUserId);

      expect(sitesWithCounts).toHaveLength(2);
      expect(sitesWithCounts[0]?.name).toBe('Site 1');
      expect(sitesWithCounts[0]?.label_count).toBe(1);
      expect(sitesWithCounts[1]?.name).toBe('Site 2');
      expect(sitesWithCounts[1]?.label_count).toBe(0);
    });
  });
});
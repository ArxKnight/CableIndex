import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// Use any type for Database to avoid better-sqlite3 installation issues
type Database = any;
import LabelModel from '../models/Label.js';
import SiteModel from '../models/Site.js';
import UserModel from '../models/User.js';
import connection from '../database/connection.js';
import { initializeDatabase } from '../database/init.js';

describe('Label Model', () => {
  let labelModel: LabelModel;
  let siteModel: SiteModel;
  let userModel: UserModel;
  let db: Database;
  let testUserId: number;
  let testSiteId: number;

  beforeEach(async () => {
    // Initialize in-memory database for testing
    await initializeDatabase({ runMigrations: true, seedData: false });
    db = connection.getConnection();
    labelModel = new LabelModel();
    siteModel = new SiteModel();
    userModel = new UserModel();

    // Create a test user
    const testUser = await userModel.create({
      email: 'test@example.com',
      full_name: 'Test User',
      password: 'TestPassword123!',
    });
    testUserId = testUser.id;

    // Create a test site
    const testSite = siteModel.create({
      name: 'TestSite',
      location: 'Test Location',
      user_id: testUserId,
    });
    testSiteId = testSite.id;
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
    it('should create a new label with auto-generated reference number', () => {
      const labelData = {
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSiteId,
        user_id: testUserId,
        notes: 'Test cable',
      };

      const label = labelModel.create(labelData);

      expect(label).toBeDefined();
      expect(label.id).toBeDefined();
      expect(label.reference_number).toBe('TestSite-1');
      expect(label.source).toBe(labelData.source);
      expect(label.destination).toBe(labelData.destination);
      expect(label.site_id).toBe(testSiteId);
      expect(label.user_id).toBe(testUserId);
      expect(label.notes).toBe(labelData.notes);
      expect(label.created_at).toBeDefined();
      expect(label.updated_at).toBeDefined();
    });

    it('should auto-increment reference numbers for same site', () => {
      const labelData1 = {
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const labelData2 = {
        source: 'Switch A Port 2',
        destination: 'Server B NIC 2',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const label1 = labelModel.create(labelData1);
      const label2 = labelModel.create(labelData2);

      expect(label1.reference_number).toBe('TestSite-1');
      expect(label2.reference_number).toBe('TestSite-2');
    });

    it('should create label with minimal data', () => {
      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const label = labelModel.create(labelData);

      expect(label).toBeDefined();
      expect(label.source).toBe(labelData.source);
      expect(label.destination).toBe(labelData.destination);
      expect(label.notes).toBeNull();
      expect(label.zpl_content).toBeNull();
    });

    it('should validate required fields', () => {
      expect(() => {
        labelModel.create({
          source: '',
          destination: 'Destination',
          site_id: testSiteId,
          user_id: testUserId,
        });
      }).toThrow('Source is required');

      expect(() => {
        labelModel.create({
          source: 'Source',
          destination: '',
          site_id: testSiteId,
          user_id: testUserId,
        });
      }).toThrow('Destination is required');
    });

    it('should trim whitespace from source and destination', () => {
      const labelData = {
        source: '  Switch A Port 1  ',
        destination: '  Server B NIC 1  ',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const label = labelModel.create(labelData);

      expect(label.source).toBe('Switch A Port 1');
      expect(label.destination).toBe('Server B NIC 1');
    });

    it('should throw error for non-existent site', () => {
      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: 999,
        user_id: testUserId,
      };

      expect(() => {
        labelModel.create(labelData);
      }).toThrow('Site not found');
    });
  });

  describe('findById', () => {
    it('should find label by ID', () => {
      const labelData = {
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const createdLabel = labelModel.create(labelData);
      const foundLabel = labelModel.findById(createdLabel.id);

      expect(foundLabel).toBeDefined();
      expect(foundLabel!.id).toBe(createdLabel.id);
      expect(foundLabel!.reference_number).toBe(createdLabel.reference_number);
      expect(foundLabel!.source).toBe(labelData.source);
      expect(foundLabel!.destination).toBe(labelData.destination);
    });

    it('should return null for non-existent ID', () => {
      const label = labelModel.findById(999);
      expect(label).toBeNull();
    });

    it('should not find inactive labels', () => {
      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const createdLabel = labelModel.create(labelData);

      // Manually set label as inactive
      db.exec(`UPDATE labels SET is_active = 0 WHERE id = ${createdLabel.id}`);

      const foundLabel = labelModel.findById(createdLabel.id);
      expect(foundLabel).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should find labels by user ID', () => {
      const labelData1 = {
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSiteId,
        user_id: testUserId,
      };
      const labelData2 = {
        source: 'Switch A Port 2',
        destination: 'Server B NIC 2',
        site_id: testSiteId,
        user_id: testUserId,
      };

      labelModel.create(labelData1);
      labelModel.create(labelData2);

      const labels = labelModel.findByUserId(testUserId);

      expect(labels).toHaveLength(2);
      expect(labels[0]?.reference_number).toBe('TestSite-2'); // Should be ordered by created_at DESC
      expect(labels[1]?.reference_number).toBe('TestSite-1');
    });

    it('should filter labels by search term', () => {
      const labelData1 = {
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSiteId,
        user_id: testUserId,
        notes: 'Important cable',
      };
      const labelData2 = {
        source: 'Router C Port 1',
        destination: 'Firewall D Port 1',
        site_id: testSiteId,
        user_id: testUserId,
      };

      labelModel.create(labelData1);
      labelModel.create(labelData2);

      const labels = labelModel.findByUserId(testUserId, { search: 'Switch' });

      expect(labels).toHaveLength(1);
      expect(labels[0]?.source).toBe('Switch A Port 1');
    });

    it('should filter labels by site_id', () => {
      // Create another site
      const site2 = siteModel.create({
        name: 'Site2',
        user_id: testUserId,
      });

      const labelData1 = {
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSiteId,
        user_id: testUserId,
      };
      const labelData2 = {
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: site2.id,
        user_id: testUserId,
      };

      labelModel.create(labelData1);
      labelModel.create(labelData2);

      const labels = labelModel.findByUserId(testUserId, { site_id: testSiteId });

      expect(labels).toHaveLength(1);
      expect(labels[0]?.source).toBe('Source 1');
    });

    it('should filter labels by source', () => {
      const labelData1 = {
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSiteId,
        user_id: testUserId,
      };
      const labelData2 = {
        source: 'Router C Port 1',
        destination: 'Server B NIC 2',
        site_id: testSiteId,
        user_id: testUserId,
      };

      labelModel.create(labelData1);
      labelModel.create(labelData2);

      const labels = labelModel.findByUserId(testUserId, { source: 'Switch' });

      expect(labels).toHaveLength(1);
      expect(labels[0]?.source).toBe('Switch A Port 1');
    });

    it('should filter labels by destination', () => {
      const labelData1 = {
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSiteId,
        user_id: testUserId,
      };
      const labelData2 = {
        source: 'Switch A Port 2',
        destination: 'Workstation C NIC 1',
        site_id: testSiteId,
        user_id: testUserId,
      };

      labelModel.create(labelData1);
      labelModel.create(labelData2);

      const labels = labelModel.findByUserId(testUserId, { destination: 'Server' });

      expect(labels).toHaveLength(1);
      expect(labels[0]?.destination).toBe('Server B NIC 1');
    });

    it('should filter labels by reference number', () => {
      const labelData1 = {
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSiteId,
        user_id: testUserId,
      };
      const labelData2 = {
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: testSiteId,
        user_id: testUserId,
      };

      labelModel.create(labelData1);
      labelModel.create(labelData2);

      const labels = labelModel.findByUserId(testUserId, { reference_number: 'TestSite-1' });

      expect(labels).toHaveLength(1);
      expect(labels[0]?.reference_number).toBe('TestSite-1');
    });

    it('should respect limit and offset', () => {
      // Create multiple labels
      for (let i = 1; i <= 5; i++) {
        labelModel.create({
          source: `Source ${i}`,
          destination: `Dest ${i}`,
          site_id: testSiteId,
          user_id: testUserId,
        });
      }

      const labels = labelModel.findByUserId(testUserId, { limit: 2, offset: 1 });

      expect(labels).toHaveLength(2);
      // Should be ordered by created_at DESC, so offset 1 should skip the most recent
      expect(labels[0]?.reference_number).toBe('TestSite-4');
      expect(labels[1]?.reference_number).toBe('TestSite-3');
    });

    it('should sort by different columns', () => {
      const labelData1 = {
        source: 'B Source',
        destination: 'Dest 1',
        site_id: testSiteId,
        user_id: testUserId,
      };
      const labelData2 = {
        source: 'A Source',
        destination: 'Dest 2',
        site_id: testSiteId,
        user_id: testUserId,
      };

      labelModel.create(labelData1);
      labelModel.create(labelData2);

      const labels = labelModel.findByUserId(testUserId, { 
        sort_by: 'source', 
        sort_order: 'ASC' 
      });

      expect(labels).toHaveLength(2);
      expect(labels[0]?.source).toBe('A Source');
      expect(labels[1]?.source).toBe('B Source');
    });
  });

  describe('update', () => {
    it('should update label data', () => {
      const labelData = {
        source: 'Original Source',
        destination: 'Original Destination',
        site_id: testSiteId,
        user_id: testUserId,
        notes: 'Original notes',
      };

      const label = labelModel.create(labelData);
      const updatedLabel = labelModel.update(label.id, testUserId, {
        source: 'Updated Source',
        destination: 'Updated Destination',
        notes: 'Updated notes',
      });

      expect(updatedLabel).toBeDefined();
      expect(updatedLabel!.source).toBe('Updated Source');
      expect(updatedLabel!.destination).toBe('Updated Destination');
      expect(updatedLabel!.notes).toBe('Updated notes');
      expect(updatedLabel!.reference_number).toBe(label.reference_number); // Should remain unchanged
    });

    it('should validate source and destination are not empty', () => {
      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const label = labelModel.create(labelData);

      expect(() => {
        labelModel.update(label.id, testUserId, { source: '' });
      }).toThrow('Source cannot be empty');

      expect(() => {
        labelModel.update(label.id, testUserId, { destination: '' });
      }).toThrow('Destination cannot be empty');
    });

    it('should return null for non-existent label', () => {
      const updatedLabel = labelModel.update(999, testUserId, { source: 'Updated Source' });
      expect(updatedLabel).toBeNull();
    });

    it('should return null when user does not own label', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const label = labelModel.create(labelData);
      const updatedLabel = labelModel.update(label.id, otherUser.id, { source: 'Updated Source' });

      expect(updatedLabel).toBeNull();
    });
  });

  describe('delete', () => {
    it('should soft delete label', () => {
      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const label = labelModel.create(labelData);
      const success = labelModel.delete(label.id, testUserId);

      expect(success).toBe(true);

      // Label should not be found by normal queries
      const deletedLabel = labelModel.findById(label.id);
      expect(deletedLabel).toBeNull();

      // But should still exist in database as inactive
      const rawLabel = db.prepare('SELECT * FROM labels WHERE id = ?').get(label.id);
      expect(rawLabel).toBeDefined();
      expect((rawLabel as any).is_active).toBe(0);
    });

    it('should return false for non-existent label', () => {
      const success = labelModel.delete(999, testUserId);
      expect(success).toBe(false);
    });

    it('should return false when user does not own label', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const label = labelModel.create(labelData);
      const success = labelModel.delete(label.id, otherUser.id);

      expect(success).toBe(false);
    });
  });

  describe('bulkDelete', () => {
    it('should delete multiple labels', () => {
      const label1 = labelModel.create({
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSiteId,
        user_id: testUserId,
      });

      const label2 = labelModel.create({
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: testSiteId,
        user_id: testUserId,
      });

      const deletedCount = labelModel.bulkDelete([label1.id, label2.id], testUserId);

      expect(deletedCount).toBe(2);

      // Labels should not be found
      expect(labelModel.findById(label1.id)).toBeNull();
      expect(labelModel.findById(label2.id)).toBeNull();
    });

    it('should return 0 for empty array', () => {
      const deletedCount = labelModel.bulkDelete([], testUserId);
      expect(deletedCount).toBe(0);
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
        site_id: testSiteId,
        user_id: testUserId,
      });

      const label2 = labelModel.create({
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: testSiteId,
        user_id: testUserId,
      });

      // Try to delete with other user's ID
      const deletedCount = labelModel.bulkDelete([label1.id, label2.id], otherUser.id);

      expect(deletedCount).toBe(0);
      expect(labelModel.findById(label1.id)).toBeDefined();
      expect(labelModel.findById(label2.id)).toBeDefined();
    });
  });

  describe('countByUserId', () => {
    it('should count labels for user', () => {
      labelModel.create({
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSiteId,
        user_id: testUserId,
      });

      labelModel.create({
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: testSiteId,
        user_id: testUserId,
      });

      const count = labelModel.countByUserId(testUserId);
      expect(count).toBe(2);
    });

    it('should count labels with search filter', () => {
      labelModel.create({
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSiteId,
        user_id: testUserId,
      });

      labelModel.create({
        source: 'Router C Port 1',
        destination: 'Server B NIC 2',
        site_id: testSiteId,
        user_id: testUserId,
      });

      const count = labelModel.countByUserId(testUserId, { search: 'Switch' });
      expect(count).toBe(1);
    });
  });

  describe('existsForUser', () => {
    it('should return true for existing label owned by user', () => {
      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const label = labelModel.create(labelData);
      const exists = labelModel.existsForUser(label.id, testUserId);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent label', () => {
      const exists = labelModel.existsForUser(999, testUserId);
      expect(exists).toBe(false);
    });

    it('should return false for label owned by different user', async () => {
      // Create another user
      const otherUser = await userModel.create({
        email: 'other@example.com',
        full_name: 'Other User',
        password: 'TestPassword123!',
      });

      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const label = labelModel.create(labelData);
      const exists = labelModel.existsForUser(label.id, otherUser.id);

      expect(exists).toBe(false);
    });
  });

  describe('getStatsByUserId', () => {
    it('should return label statistics', () => {
      // Create labels with different dates
      const today = new Date().toISOString().split('T')[0];
      const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format

      // Create today's label
      const label1 = labelModel.create({
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSiteId,
        user_id: testUserId,
      });

      // Create this month's label (but not today)
      const label2 = labelModel.create({
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: testSiteId,
        user_id: testUserId,
      });

      // Manually set the second label to be from earlier this month
      db.exec(`UPDATE labels SET created_at = '${thisMonth}-01 10:00:00' WHERE id = ${label2.id}`);

      // Create old label
      const label3 = labelModel.create({
        source: 'Source 3',
        destination: 'Dest 3',
        site_id: testSiteId,
        user_id: testUserId,
      });

      // Set the third label to be from last year
      db.exec(`UPDATE labels SET created_at = '2023-01-01 10:00:00' WHERE id = ${label3.id}`);

      const stats = labelModel.getStatsByUserId(testUserId);

      expect(stats.total_labels).toBe(3);
      expect(stats.labels_this_month).toBe(2);
      expect(stats.labels_today).toBe(1);
    });
  });

  describe('referenceNumberExists', () => {
    it('should return true for existing reference number', () => {
      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const label = labelModel.create(labelData);
      const exists = labelModel.referenceNumberExists(testSiteId, label.reference_number);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent reference number', () => {
      const exists = labelModel.referenceNumberExists(testSiteId, 'TestSite-999');
      expect(exists).toBe(false);
    });

    it('should exclude specific label ID when checking', () => {
      const labelData = {
        source: 'Source',
        destination: 'Destination',
        site_id: testSiteId,
        user_id: testUserId,
      };

      const label = labelModel.create(labelData);
      const exists = labelModel.referenceNumberExists(testSiteId, label.reference_number, label.id);

      expect(exists).toBe(false);
    });

    it('should handle reference numbers with different site prefixes', () => {
      // Create another site
      const site2 = siteModel.create({
        name: 'Site2',
        user_id: testUserId,
      });

      // Create labels with same number but different sites
      labelModel.create({
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSiteId,
        user_id: testUserId,
      });

      labelModel.create({
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: site2.id,
        user_id: testUserId,
      });

      // Both should exist for their respective sites
      expect(labelModel.referenceNumberExists(testSiteId, 'TestSite-1')).toBe(true);
      expect(labelModel.referenceNumberExists(site2.id, 'Site2-1')).toBe(true);
      
      // But not cross-site
      expect(labelModel.referenceNumberExists(testSiteId, 'Site2-1')).toBe(false);
      expect(labelModel.referenceNumberExists(site2.id, 'TestSite-1')).toBe(false);
    });
  });

  describe('reference number generation edge cases', () => {
    it('should handle gaps in reference numbers correctly', () => {
      // Create labels 1, 2, 3
      const label1 = labelModel.create({
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSiteId,
        user_id: testUserId,
      });

      const label2 = labelModel.create({
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: testSiteId,
        user_id: testUserId,
      });

      const label3 = labelModel.create({
        source: 'Source 3',
        destination: 'Dest 3',
        site_id: testSiteId,
        user_id: testUserId,
      });

      // Delete label 2 (creating a gap)
      labelModel.delete(label2.id, testUserId);

      // Next label should still be 4 (not filling the gap)
      const label4 = labelModel.create({
        source: 'Source 4',
        destination: 'Dest 4',
        site_id: testSiteId,
        user_id: testUserId,
      });

      expect(label1.reference_number).toBe('TestSite-1');
      expect(label3.reference_number).toBe('TestSite-3');
      expect(label4.reference_number).toBe('TestSite-4');
    });

    it('should handle site names with special characters in reference numbers', () => {
      // Create site with special characters
      const specialSite = siteModel.create({
        name: 'Site-With_Special.Chars',
        user_id: testUserId,
      });

      const label = labelModel.create({
        source: 'Source',
        destination: 'Destination',
        site_id: specialSite.id,
        user_id: testUserId,
      });

      expect(label.reference_number).toBe('Site-With_Special.Chars-1');
    });
  });

  describe('search and filter edge cases', () => {
    it('should handle empty search results gracefully', () => {
      labelModel.create({
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSiteId,
        user_id: testUserId,
      });

      const labels = labelModel.findByUserId(testUserId, { search: 'NonExistentTerm' });
      expect(labels).toHaveLength(0);
    });

    it('should handle case-insensitive search', () => {
      labelModel.create({
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSiteId,
        user_id: testUserId,
      });

      const labelsLower = labelModel.findByUserId(testUserId, { search: 'switch' });
      const labelsUpper = labelModel.findByUserId(testUserId, { search: 'SWITCH' });
      const labelsMixed = labelModel.findByUserId(testUserId, { search: 'SwItCh' });

      expect(labelsLower).toHaveLength(1);
      expect(labelsUpper).toHaveLength(1);
      expect(labelsMixed).toHaveLength(1);
    });

    it('should search in notes field', () => {
      labelModel.create({
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSiteId,
        user_id: testUserId,
        notes: 'Important production cable',
      });

      labelModel.create({
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: testSiteId,
        user_id: testUserId,
        notes: 'Test environment cable',
      });

      const labels = labelModel.findByUserId(testUserId, { search: 'production' });
      expect(labels).toHaveLength(1);
      expect(labels[0]?.notes).toContain('production');
    });

    it('should handle multiple filter combinations', () => {
      // Create another site
      const site2 = siteModel.create({
        name: 'Site2',
        user_id: testUserId,
      });

      labelModel.create({
        source: 'Switch A Port 1',
        destination: 'Server B NIC 1',
        site_id: testSiteId,
        user_id: testUserId,
      });

      labelModel.create({
        source: 'Switch A Port 2',
        destination: 'Server C NIC 1',
        site_id: site2.id,
        user_id: testUserId,
      });

      labelModel.create({
        source: 'Router B Port 1',
        destination: 'Server B NIC 2',
        site_id: testSiteId,
        user_id: testUserId,
      });

      // Filter by site and source
      const labels = labelModel.findByUserId(testUserId, {
        site_id: testSiteId,
        source: 'Switch',
      });

      expect(labels).toHaveLength(1);
      expect(labels[0]?.source).toBe('Switch A Port 1');
      expect(labels[0]?.site_id).toBe(testSiteId);
    });
  });

  describe('validation edge cases', () => {
    it('should handle very long valid inputs', () => {
      const longSource = 'A'.repeat(200); // Max length
      const longDestination = 'B'.repeat(200); // Max length
      const longNotes = 'C'.repeat(1000); // Max length

      const label = labelModel.create({
        source: longSource,
        destination: longDestination,
        site_id: testSiteId,
        user_id: testUserId,
        notes: longNotes,
      });

      expect(label.source).toBe(longSource);
      expect(label.destination).toBe(longDestination);
      expect(label.notes).toBe(longNotes);
    });

    it('should handle whitespace-only inputs as invalid', () => {
      expect(() => {
        labelModel.create({
          source: '   ',
          destination: 'Destination',
          site_id: testSiteId,
          user_id: testUserId,
        });
      }).toThrow('Source is required');

      expect(() => {
        labelModel.create({
          source: 'Source',
          destination: '   ',
          site_id: testSiteId,
          user_id: testUserId,
        });
      }).toThrow('Destination is required');
    });

    it('should handle null and undefined notes correctly', () => {
      const label1 = labelModel.create({
        source: 'Source 1',
        destination: 'Dest 1',
        site_id: testSiteId,
        user_id: testUserId,
      });

      const label2 = labelModel.create({
        source: 'Source 2',
        destination: 'Dest 2',
        site_id: testSiteId,
        user_id: testUserId,
      });

      expect(label1.notes).toBeNull();
      expect(label2.notes).toBeNull();
    });
  });
});
import Database from 'better-sqlite3';
import connection from '../database/connection.js';
import { Site } from '../types/index.js';

export interface CreateSiteData {
  name: string;
  location?: string;
  description?: string;
  user_id: number;
}

export interface UpdateSiteData {
  name?: string;
  location?: string;
  description?: string;
}

export class SiteModel {
  private get db(): Database.Database {
    return connection.getConnection();
  }

  /**
   * Create a new site
   */
  create(siteData: CreateSiteData): Site {
    const { name, location, description, user_id } = siteData;
    
    const stmt = this.db.prepare(`
      INSERT INTO sites (name, location, description, user_id)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(name, location || null, description || null, user_id);
    
    if (!result.lastInsertRowid) {
      throw new Error('Failed to create site');
    }
    
    return this.findById(Number(result.lastInsertRowid))!;
  }

  /**
   * Find site by ID
   */
  findById(id: number): Site | null {
    const stmt = this.db.prepare(`
      SELECT id, name, location, description, user_id, is_active, created_at, updated_at
      FROM sites 
      WHERE id = ? AND is_active = 1
    `);
    
    return stmt.get(id) as Site | null;
  }

  /**
   * Find sites by user ID with optional filtering
   */
  findByUserId(userId: number, options: {
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Site[] {
    const { search, limit = 50, offset = 0 } = options;
    
    let query = `
      SELECT id, name, location, description, user_id, is_active, created_at, updated_at
      FROM sites 
      WHERE user_id = ? AND is_active = 1
    `;
    
    const params: any[] = [userId];
    
    if (search) {
      query += ` AND (name LIKE ? OR location LIKE ? OR description LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    query += ` ORDER BY name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const stmt = this.db.prepare(query);
    return stmt.all(...params) as Site[];
  }

  /**
   * Update site
   */
  update(id: number, userId: number, siteData: UpdateSiteData): Site | null {
    const updates: string[] = [];
    const values: any[] = [];

    if (siteData.name !== undefined) {
      updates.push('name = ?');
      values.push(siteData.name);
    }

    if (siteData.location !== undefined) {
      updates.push('location = ?');
      values.push(siteData.location);
    }

    if (siteData.description !== undefined) {
      updates.push('description = ?');
      values.push(siteData.description);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, userId);

    const stmt = this.db.prepare(`
      UPDATE sites 
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ? AND is_active = 1
    `);

    const result = stmt.run(...values);
    
    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  }

  /**
   * Delete site (soft delete)
   * Only allows deletion if no labels are associated with the site
   */
  delete(id: number, userId: number): boolean {
    // First check if site has any labels
    const labelCheckStmt = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM labels 
      WHERE site_id = ? AND is_active = 1
    `);
    
    const labelCount = labelCheckStmt.get(id) as { count: number };
    
    if (labelCount.count > 0) {
      throw new Error('Cannot delete site with existing labels');
    }

    // Soft delete the site
    const stmt = this.db.prepare(`
      UPDATE sites 
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND is_active = 1
    `);
    
    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  /**
   * Check if site exists and belongs to user
   */
  existsForUser(id: number, userId: number): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM sites 
      WHERE id = ? AND user_id = ? AND is_active = 1
    `);
    
    return stmt.get(id, userId) !== undefined;
  }

  /**
   * Count sites for user
   */
  countByUserId(userId: number, search?: string): number {
    let query = `
      SELECT COUNT(*) as count 
      FROM sites 
      WHERE user_id = ? AND is_active = 1
    `;
    
    const params: any[] = [userId];
    
    if (search) {
      query += ` AND (name LIKE ? OR location LIKE ? OR description LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  /**
   * Get site with label count
   */
  findByIdWithLabelCount(id: number, userId: number): (Site & { label_count: number }) | null {
    const stmt = this.db.prepare(`
      SELECT 
        s.id, s.name, s.location, s.description, s.user_id, s.is_active, s.created_at, s.updated_at,
        COUNT(l.id) as label_count
      FROM sites s
      LEFT JOIN labels l ON s.id = l.site_id AND l.is_active = 1
      WHERE s.id = ? AND s.user_id = ? AND s.is_active = 1
      GROUP BY s.id
    `);
    
    return stmt.get(id, userId) as (Site & { label_count: number }) | null;
  }

  /**
   * Get all sites for user with label counts
   */
  findByUserIdWithLabelCounts(userId: number, options: {
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): (Site & { label_count: number })[] {
    const { search, limit = 50, offset = 0 } = options;
    
    let query = `
      SELECT 
        s.id, s.name, s.location, s.description, s.user_id, s.is_active, s.created_at, s.updated_at,
        COUNT(l.id) as label_count
      FROM sites s
      LEFT JOIN labels l ON s.id = l.site_id AND l.is_active = 1
      WHERE s.user_id = ? AND s.is_active = 1
    `;
    
    const params: any[] = [userId];
    
    if (search) {
      query += ` AND (s.name LIKE ? OR s.location LIKE ? OR s.description LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    query += ` GROUP BY s.id ORDER BY s.name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const stmt = this.db.prepare(query);
    return stmt.all(...params) as (Site & { label_count: number })[];
  }
}

export default SiteModel;
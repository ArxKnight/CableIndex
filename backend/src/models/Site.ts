import connection from '../database/connection.js';
import { DatabaseAdapter } from '../database/adapters/base.js';
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
  private get adapter(): DatabaseAdapter {
    return connection.getAdapter();
  }

  /**
   * Create a new site
   */
  async create(siteData: CreateSiteData): Promise<Site> {
    const { name, location, description, user_id } = siteData;
    
    const result = await this.adapter.execute(
      `INSERT INTO sites (name, location, description, user_id)
       VALUES (?, ?, ?, ?)`,
      [name, location || null, description || null, user_id]
    );
    
    if (!result.insertId) {
      throw new Error('Failed to create site');
    }
    
    return (await this.findById(Number(result.insertId)))!;
  }

  /**
   * Find site by ID
   */
  async findById(id: number): Promise<Site | null> {
    const rows = await this.adapter.query(
      `SELECT id, name, location, description, user_id, is_active, created_at, updated_at
       FROM sites 
       WHERE id = ? AND is_active = 1`,
      [id]
    );
    
    return rows.length > 0 ? (rows[0] as Site) : null;
  }

  /**
   * Find sites by user ID with optional filtering
   */
  async findByUserId(userId: number, options: {
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<Site[]> {
    const { search, limit = 50, offset = 0 } = options;
    const safeLimit = parseInt(String(limit), 10) || 50;
    const safeOffset = parseInt(String(offset), 10) || 0;
    
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
    params.push(safeLimit, safeOffset);
    
    const rows = await this.adapter.query(query, params);
    return rows as Site[];
  }

  /**
   * Update site
   */
  async update(id: number, userId: number, siteData: UpdateSiteData): Promise<Site | null> {
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

    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    
    if (!isMySQL) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
    }
    
    values.push(id, userId);

    const result = await this.adapter.execute(
      `UPDATE sites 
       SET ${updates.join(', ')}
       WHERE id = ? AND user_id = ? AND is_active = 1`,
      values
    );
    
    if (result.affectedRows === 0) {
      return null;
    }

    return this.findById(id);
  }

  /**
   * Delete site (soft delete)
   * Only allows deletion if no labels are associated with the site
   */
  async delete(id: number, userId: number): Promise<boolean> {
    // First check if site has any labels
    const labelRows = await this.adapter.query(
      `SELECT COUNT(*) as count 
       FROM labels 
       WHERE site_id = ? AND is_active = 1`,
      [id]
    );
    
    const labelCount = labelRows[0].count;
    
    if (labelCount > 0) {
      throw new Error('Cannot delete site with existing labels');
    }

    // Soft delete the site
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    
    const result = await this.adapter.execute(
      isMySQL
        ? `UPDATE sites SET is_active = 0 WHERE id = ? AND user_id = ? AND is_active = 1`
        : `UPDATE sites SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_active = 1`,
      [id, userId]
    );
    
    return result.affectedRows > 0;
  }

  /**
   * Check if site exists and belongs to user
   */
  async existsForUser(id: number, userId: number): Promise<boolean> {
    const rows = await this.adapter.query(
      `SELECT 1 FROM sites 
       WHERE id = ? AND user_id = ? AND is_active = 1`,
      [id, userId]
    );
    
    return rows.length > 0;
  }

  /**
   * Count sites for user
   */
  async countByUserId(userId: number, search?: string): Promise<number> {
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
    
    const rows = await this.adapter.query(query, params);
    return rows[0].count;
  }

  /**
   * Get site with label count
   */
  async findByIdWithLabelCount(id: number, userId: number): Promise<(Site & { label_count: number }) | null> {
    const rows = await this.adapter.query(
      `SELECT 
        s.id, s.name, s.location, s.description, s.user_id, s.is_active, s.created_at, s.updated_at,
        COUNT(l.id) as label_count
      FROM sites s
      LEFT JOIN labels l ON s.id = l.site_id AND l.is_active = 1
      WHERE s.id = ? AND s.user_id = ? AND s.is_active = 1
      GROUP BY s.id`,
      [id, userId]
    );
    
    return rows.length > 0 ? (rows[0] as Site & { label_count: number }) : null;
  }

  /**
   * Get all sites for user with label counts
   */
  async findByUserIdWithLabelCounts(userId: number, options: {
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<(Site & { label_count: number })[]> {
    const { search, limit = 50, offset = 0 } = options;
    
    // Ensure limit and offset are integers for MySQL prepared statements
    const safeLimit = parseInt(String(limit), 10) || 50;
    const safeOffset = parseInt(String(offset), 10) || 0;
    
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
    params.push(safeLimit, safeOffset);
    
    const rows = await this.adapter.query(query, params);
    return rows as (Site & { label_count: number })[];
  }
}

export default SiteModel;
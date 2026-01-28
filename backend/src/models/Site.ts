import connection from '../database/connection.js';
import { DatabaseAdapter } from '../database/adapters/base.js';
import { Site } from '../types/index.js';

export interface CreateSiteData {
  name: string;
  code: string;
  created_by: number;
  location?: string;
  description?: string;
}

export interface UpdateSiteData {
  name?: string;
  code?: string;
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
    const { name, code, location, description, created_by } = siteData;

    await this.adapter.beginTransaction();
    try {
      const result = await this.adapter.execute(
        `INSERT INTO sites (name, code, created_by, location, description)
         VALUES (?, ?, ?, ?, ?)`
        ,[name, code, created_by, location || null, description || null]
      );

      if (!result.insertId) {
        throw new Error('Failed to create site');
      }

      await this.adapter.execute(
        `INSERT INTO site_memberships (site_id, user_id, site_role)
         VALUES (?, ?, 'ADMIN')`,
        [result.insertId, created_by]
      );

      await this.adapter.commit();
      return (await this.findById(Number(result.insertId)))!;
    } catch (error) {
      await this.adapter.rollback();
      throw error;
    }
  }

  /**
   * Find site by ID
   */
  async findById(id: number): Promise<Site | null> {
    const rows = await this.adapter.query(
      `SELECT id, name, code, created_by, location, description, is_active, created_at, updated_at
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
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    const finalLimit = Math.max(0, safeLimit);
    const finalOffset = Math.max(0, safeOffset);
    
    let query = `
      SELECT s.id, s.name, s.code, s.created_by, s.location, s.description, s.is_active, s.created_at, s.updated_at
      FROM sites s
      JOIN site_memberships sm ON sm.site_id = s.id
      WHERE sm.user_id = ? AND s.is_active = 1
    `;

    const params: any[] = [userId];
    
    if (search) {
      query += ` AND (s.name LIKE ? OR s.location LIKE ? OR s.description LIKE ? OR s.code LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    if (isMySQL) {
      query += ` ORDER BY name ASC LIMIT ${finalLimit} OFFSET ${finalOffset}`;
    } else {
      query += ` ORDER BY name ASC LIMIT ? OFFSET ?`;
      params.push(finalLimit, finalOffset);
    }
    
    const rows = await this.adapter.query(query, params);
    return rows as Site[];
  }

  /**
   * Find all sites (global admin)
   */
  async findAll(options: {
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<Site[]> {
    const { search, limit = 50, offset = 0 } = options;
    const safeLimit = parseInt(String(limit), 10) || 50;
    const safeOffset = parseInt(String(offset), 10) || 0;
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    const finalLimit = Math.max(0, safeLimit);
    const finalOffset = Math.max(0, safeOffset);

    let query = `
      SELECT id, name, code, created_by, location, description, is_active, created_at, updated_at
      FROM sites
      WHERE is_active = 1
    `;

    const params: any[] = [];

    if (search) {
      query += ` AND (name LIKE ? OR location LIKE ? OR description LIKE ? OR code LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (isMySQL) {
      query += ` ORDER BY name ASC LIMIT ${finalLimit} OFFSET ${finalOffset}`;
    } else {
      query += ` ORDER BY name ASC LIMIT ? OFFSET ?`;
      params.push(finalLimit, finalOffset);
    }

    const rows = await this.adapter.query(query, params);
    return rows as Site[];
  }

  /**
   * Find all sites with label counts (global admin)
   */
  async findAllWithLabelCounts(options: {
    search?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<(Site & { label_count: number })[]> {
    const { search, limit = 50, offset = 0 } = options;
    const safeLimit = parseInt(String(limit), 10) || 50;
    const safeOffset = parseInt(String(offset), 10) || 0;
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    const finalLimit = Math.max(0, safeLimit);
    const finalOffset = Math.max(0, safeOffset);

    let query = `
      SELECT 
        s.id, s.name, s.code, s.created_by, s.location, s.description, s.is_active, s.created_at, s.updated_at,
        COUNT(l.id) as label_count
      FROM sites s
      LEFT JOIN labels l ON s.id = l.site_id
      WHERE s.is_active = 1
    `;

    const params: any[] = [];

    if (search) {
      query += ` AND (s.name LIKE ? OR s.location LIKE ? OR s.description LIKE ? OR s.code LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (isMySQL) {
      query += ` GROUP BY s.id ORDER BY s.name ASC LIMIT ${finalLimit} OFFSET ${finalOffset}`;
    } else {
      query += ` GROUP BY s.id ORDER BY s.name ASC LIMIT ? OFFSET ?`;
      params.push(finalLimit, finalOffset);
    }

    const rows = await this.adapter.query(query, params);
    return rows as (Site & { label_count: number })[];
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

    if (siteData.code !== undefined) {
      updates.push('code = ?');
      values.push(siteData.code);
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
    
    values.push(id);

    const result = await this.adapter.execute(
      `UPDATE sites 
       SET ${updates.join(', ')}
       WHERE id = ? AND is_active = 1`,
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
       WHERE site_id = ?`,
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
        ? `UPDATE sites SET is_active = 0 WHERE id = ? AND is_active = 1`
        : `UPDATE sites SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = 1`,
      [id]
    );
    
    return result.affectedRows > 0;
  }

  /**
   * Check if site exists and belongs to user
   */
  async existsForUser(id: number, userId: number): Promise<boolean> {
    const rows = await this.adapter.query(
      `SELECT 1 FROM site_memberships sm
       JOIN sites s ON s.id = sm.site_id
       WHERE sm.site_id = ? AND sm.user_id = ? AND s.is_active = 1`,
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
      FROM sites s
      JOIN site_memberships sm ON sm.site_id = s.id
      WHERE sm.user_id = ? AND s.is_active = 1
    `;
    
    const params: any[] = [userId];
    
    if (search) {
      query += ` AND (s.name LIKE ? OR s.location LIKE ? OR s.description LIKE ? OR s.code LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    const rows = await this.adapter.query(query, params);
    return rows[0].count;
  }

  /**
   * Count all sites (global admin)
   */
  async countAll(search?: string): Promise<number> {
    let query = `
      SELECT COUNT(*) as count
      FROM sites
      WHERE is_active = 1
    `;

    const params: any[] = [];

    if (search) {
      query += ` AND (name LIKE ? OR location LIKE ? OR description LIKE ? OR code LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
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
        s.id, s.name, s.code, s.created_by, s.location, s.description, s.is_active, s.created_at, s.updated_at,
        COUNT(l.id) as label_count
      FROM sites s
      LEFT JOIN labels l ON s.id = l.site_id
      WHERE s.id = ? AND s.is_active = 1
      GROUP BY s.id`,
      [id]
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
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    const finalLimit = Math.max(0, safeLimit);
    const finalOffset = Math.max(0, safeOffset);
    
    let query = `
      SELECT 
        s.id, s.name, s.code, s.created_by, s.location, s.description, s.is_active, s.created_at, s.updated_at,
        COUNT(l.id) as label_count
      FROM sites s
      JOIN site_memberships sm ON sm.site_id = s.id
      LEFT JOIN labels l ON s.id = l.site_id
      WHERE sm.user_id = ? AND s.is_active = 1
    `;
    
    const params: any[] = [userId];
    
    if (search) {
      query += ` AND (s.name LIKE ? OR s.location LIKE ? OR s.description LIKE ? OR s.code LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    if (isMySQL) {
      query += ` GROUP BY s.id ORDER BY s.name ASC LIMIT ${finalLimit} OFFSET ${finalOffset}`;
    } else {
      query += ` GROUP BY s.id ORDER BY s.name ASC LIMIT ? OFFSET ?`;
      params.push(finalLimit, finalOffset);
    }
    
    const rows = await this.adapter.query(query, params);
    return rows as (Site & { label_count: number })[];
  }
}

export default SiteModel;
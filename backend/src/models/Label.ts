import Database from 'better-sqlite3';
import connection from '../database/connection.js';
import { Label } from '../types/index.js';

export interface CreateLabelData {
  source: string;
  destination: string;
  site_id: number;
  user_id: number;
  notes?: string;
  zpl_content?: string;
}

export interface UpdateLabelData {
  source?: string;
  destination?: string;
  notes?: string;
  zpl_content?: string;
}

export interface LabelSearchOptions {
  search?: string;
  site_id?: number;
  source?: string;
  destination?: string;
  reference_number?: string;
  limit?: number;
  offset?: number;
  sort_by?: 'created_at' | 'reference_number' | 'source' | 'destination';
  sort_order?: 'ASC' | 'DESC';
}

export class LabelModel {
  private get db(): Database.Database {
    return connection.getConnection();
  }

  /**
   * Generate next reference number for a site
   */
  private generateReferenceNumber(siteId: number): string {
    // Get site name for reference prefix
    const siteStmt = this.db.prepare('SELECT name FROM sites WHERE id = ?');
    const site = siteStmt.get(siteId) as { name: string } | null;
    
    if (!site) {
      throw new Error('Site not found');
    }

    // Get the next reference number for this site
    const refStmt = this.db.prepare(`
      SELECT COALESCE(
        MAX(CAST(SUBSTR(reference_number, INSTR(reference_number, '-') + 1) AS INTEGER)), 
        0
      ) + 1 as next_ref
      FROM labels 
      WHERE site_id = ? AND is_active = 1
      AND reference_number LIKE ?
    `);
    
    const result = refStmt.get(siteId, `${site.name}-%`) as { next_ref: number };
    return `${site.name}-${result.next_ref}`;
  }

  /**
   * Create a new label
   */
  create(labelData: CreateLabelData): Label {
    const { source, destination, site_id, user_id, notes, zpl_content } = labelData;
    
    // Validate required fields
    if (!source.trim()) {
      throw new Error('Source is required');
    }
    
    if (!destination.trim()) {
      throw new Error('Destination is required');
    }

    // Generate reference number
    const reference_number = this.generateReferenceNumber(site_id);
    
    // Generate ZPL content if not provided
    let finalZplContent = zpl_content;
    if (!finalZplContent) {
      // Get site information for ZPL generation
      const siteStmt = this.db.prepare('SELECT name FROM sites WHERE id = ?');
      const site = siteStmt.get(site_id) as { name: string } | null;
      
      if (site) {
        // Import ZPLService dynamically to avoid circular dependencies
        const { ZPLService } = require('../services/ZPLService.js');
        const zplService = new ZPLService();
        
        const refNumber = reference_number.split('-')[1] || reference_number;
        finalZplContent = zplService.generateCableLabel({
          site: site.name,
          referenceNumber: refNumber,
          source: source.trim(),
          destination: destination.trim()
        });
      }
    }
    
    const stmt = this.db.prepare(`
      INSERT INTO labels (reference_number, source, destination, site_id, user_id, notes, zpl_content)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      reference_number, 
      source.trim(), 
      destination.trim(), 
      site_id, 
      user_id, 
      notes || null, 
      finalZplContent || null
    );
    
    if (!result.lastInsertRowid) {
      throw new Error('Failed to create label');
    }
    
    return this.findById(Number(result.lastInsertRowid))!;
  }

  /**
   * Find label by ID
   */
  findById(id: number): Label | null {
    const stmt = this.db.prepare(`
      SELECT id, reference_number, source, destination, site_id, user_id, notes, zpl_content, is_active, created_at, updated_at
      FROM labels 
      WHERE id = ? AND is_active = 1
    `);
    
    return stmt.get(id) as Label | null;
  }

  /**
   * Find labels by user ID with filtering and search
   */
  findByUserId(userId: number, options: LabelSearchOptions = {}): Label[] {
    const { 
      search, 
      site_id, 
      source, 
      destination, 
      reference_number,
      limit = 50, 
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options;
    
    let query = `
      SELECT l.id, l.reference_number, l.source, l.destination, l.site_id, l.user_id, l.notes, l.zpl_content, l.is_active, l.created_at, l.updated_at
      FROM labels l
      WHERE l.user_id = ? AND l.is_active = 1
    `;
    
    const params: any[] = [userId];
    
    // Add filters
    if (site_id) {
      query += ` AND l.site_id = ?`;
      params.push(site_id);
    }
    
    if (source) {
      query += ` AND l.source LIKE ?`;
      params.push(`%${source}%`);
    }
    
    if (destination) {
      query += ` AND l.destination LIKE ?`;
      params.push(`%${destination}%`);
    }
    
    if (reference_number) {
      query += ` AND l.reference_number LIKE ?`;
      params.push(`%${reference_number}%`);
    }
    
    if (search) {
      query += ` AND (l.reference_number LIKE ? OR l.source LIKE ? OR l.destination LIKE ? OR l.notes LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    // Add sorting
    const validSortColumns = ['created_at', 'reference_number', 'source', 'destination'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order === 'ASC' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY l.${sortColumn} ${sortDirection} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const stmt = this.db.prepare(query);
    return stmt.all(...params) as Label[];
  }

  /**
   * Find labels by site ID
   */
  findBySiteId(siteId: number, userId: number, options: LabelSearchOptions = {}): Label[] {
    return this.findByUserId(userId, { ...options, site_id: siteId });
  }

  /**
   * Update label
   */
  update(id: number, userId: number, labelData: UpdateLabelData): Label | null {
    const updates: string[] = [];
    const values: any[] = [];

    if (labelData.source !== undefined) {
      if (!labelData.source.trim()) {
        throw new Error('Source cannot be empty');
      }
      updates.push('source = ?');
      values.push(labelData.source.trim());
    }

    if (labelData.destination !== undefined) {
      if (!labelData.destination.trim()) {
        throw new Error('Destination cannot be empty');
      }
      updates.push('destination = ?');
      values.push(labelData.destination.trim());
    }

    if (labelData.notes !== undefined) {
      updates.push('notes = ?');
      values.push(labelData.notes || null);
    }

    if (labelData.zpl_content !== undefined) {
      updates.push('zpl_content = ?');
      values.push(labelData.zpl_content || null);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, userId);

    const stmt = this.db.prepare(`
      UPDATE labels 
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
   * Delete label (soft delete)
   */
  delete(id: number, userId: number): boolean {
    const stmt = this.db.prepare(`
      UPDATE labels 
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND is_active = 1
    `);
    
    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  /**
   * Bulk delete labels
   */
  bulkDelete(ids: number[], userId: number): number {
    if (ids.length === 0) return 0;
    
    const placeholders = ids.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      UPDATE labels 
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders}) AND user_id = ? AND is_active = 1
    `);
    
    const result = stmt.run(...ids, userId);
    return result.changes;
  }

  /**
   * Count labels for user with optional filters
   */
  countByUserId(userId: number, options: Omit<LabelSearchOptions, 'limit' | 'offset' | 'sort_by' | 'sort_order'> = {}): number {
    const { search, site_id, source, destination, reference_number } = options;
    
    let query = `
      SELECT COUNT(*) as count 
      FROM labels l
      WHERE l.user_id = ? AND l.is_active = 1
    `;
    
    const params: any[] = [userId];
    
    // Add same filters as findByUserId
    if (site_id) {
      query += ` AND l.site_id = ?`;
      params.push(site_id);
    }
    
    if (source) {
      query += ` AND l.source LIKE ?`;
      params.push(`%${source}%`);
    }
    
    if (destination) {
      query += ` AND l.destination LIKE ?`;
      params.push(`%${destination}%`);
    }
    
    if (reference_number) {
      query += ` AND l.reference_number LIKE ?`;
      params.push(`%${reference_number}%`);
    }
    
    if (search) {
      query += ` AND (l.reference_number LIKE ? OR l.source LIKE ? OR l.destination LIKE ? OR l.notes LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  /**
   * Check if label exists and belongs to user
   */
  existsForUser(id: number, userId: number): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM labels 
      WHERE id = ? AND user_id = ? AND is_active = 1
    `);
    
    return stmt.get(id, userId) !== undefined;
  }

  /**
   * Get labels with site information
   */
  findByUserIdWithSiteInfo(userId: number, options: LabelSearchOptions = {}): (Label & { site_name: string; site_location?: string })[] {
    const { 
      search, 
      site_id, 
      source, 
      destination, 
      reference_number,
      limit = 50, 
      offset = 0,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options;
    
    let query = `
      SELECT 
        l.id, l.reference_number, l.source, l.destination, l.site_id, l.user_id, l.notes, l.zpl_content, l.is_active, l.created_at, l.updated_at,
        s.name as site_name, s.location as site_location
      FROM labels l
      JOIN sites s ON l.site_id = s.id
      WHERE l.user_id = ? AND l.is_active = 1 AND s.is_active = 1
    `;
    
    const params: any[] = [userId];
    
    // Add same filters as findByUserId
    if (site_id) {
      query += ` AND l.site_id = ?`;
      params.push(site_id);
    }
    
    if (source) {
      query += ` AND l.source LIKE ?`;
      params.push(`%${source}%`);
    }
    
    if (destination) {
      query += ` AND l.destination LIKE ?`;
      params.push(`%${destination}%`);
    }
    
    if (reference_number) {
      query += ` AND l.reference_number LIKE ?`;
      params.push(`%${reference_number}%`);
    }
    
    if (search) {
      query += ` AND (l.reference_number LIKE ? OR l.source LIKE ? OR l.destination LIKE ? OR l.notes LIKE ? OR s.name LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    // Add sorting
    const validSortColumns = ['created_at', 'reference_number', 'source', 'destination'];
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortDirection = sort_order === 'ASC' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY l.${sortColumn} ${sortDirection} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const stmt = this.db.prepare(query);
    return stmt.all(...params) as (Label & { site_name: string; site_location?: string })[];
  }

  /**
   * Get recent labels for dashboard
   */
  findRecentByUserId(userId: number, limit: number = 10): (Label & { site_name: string })[] {
    const stmt = this.db.prepare(`
      SELECT 
        l.id, l.reference_number, l.source, l.destination, l.site_id, l.user_id, l.notes, l.zpl_content, l.is_active, l.created_at, l.updated_at,
        s.name as site_name
      FROM labels l
      JOIN sites s ON l.site_id = s.id
      WHERE l.user_id = ? AND l.is_active = 1 AND s.is_active = 1
      ORDER BY l.created_at DESC
      LIMIT ?
    `);
    
    return stmt.all(userId, limit) as (Label & { site_name: string })[];
  }

  /**
   * Get label statistics for user
   */
  getStatsByUserId(userId: number): {
    total_labels: number;
    labels_this_month: number;
    labels_today: number;
  } {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total_labels,
        COUNT(CASE WHEN DATE(created_at) >= DATE('now', 'start of month') THEN 1 END) as labels_this_month,
        COUNT(CASE WHEN DATE(created_at) = DATE('now') THEN 1 END) as labels_today
      FROM labels
      WHERE user_id = ? AND is_active = 1
    `);
    
    return stmt.get(userId) as {
      total_labels: number;
      labels_this_month: number;
      labels_today: number;
    };
  }

  /**
   * Check if reference number exists for site (for validation)
   */
  referenceNumberExists(siteId: number, referenceNumber: string, excludeId?: number): boolean {
    let stmt;
    let params: any[];

    if (excludeId) {
      stmt = this.db.prepare(`
        SELECT 1 FROM labels 
        WHERE site_id = ? AND reference_number = ? AND id != ? AND is_active = 1
      `);
      params = [siteId, referenceNumber, excludeId];
    } else {
      stmt = this.db.prepare(`
        SELECT 1 FROM labels 
        WHERE site_id = ? AND reference_number = ? AND is_active = 1
      `);
      params = [siteId, referenceNumber];
    }

    return stmt.get(...params) !== undefined;
  }
}

export default LabelModel;
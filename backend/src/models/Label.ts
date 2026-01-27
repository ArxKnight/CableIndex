import connection from '../database/connection.js';
import { DatabaseAdapter } from '../database/adapters/base.js';
import { Label } from '../types/index.js';
import { ZPLService } from '../services/ZPLService.js';

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
  private get adapter(): DatabaseAdapter {
    return connection.getAdapter();
  }

  /**
   * Generate next reference number for a site
   */
  private async generateReferenceNumber(siteId: number): Promise<string> {
    // Get site name for reference prefix
    const siteRows = await this.adapter.query('SELECT name FROM sites WHERE id = ?', [siteId]);
    
    if (siteRows.length === 0) {
      throw new Error('Site not found');
    }
    
    const siteName = siteRows[0].name;

    // Get the next reference number for this site
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    
    const refRows = await this.adapter.query(isMySQL
      ? `SELECT COALESCE(MAX(CAST(SUBSTRING(reference_number, INSTR(reference_number, '-') + 1) AS UNSIGNED)), 0) + 1 as next_ref
         FROM labels 
         WHERE site_id = ? AND is_active = 1
         AND reference_number LIKE ?`
      : `SELECT COALESCE(MAX(CAST(SUBSTR(reference_number, INSTR(reference_number, '-') + 1) AS INTEGER)), 0) + 1 as next_ref
         FROM labels 
         WHERE site_id = ? AND is_active = 1
         AND reference_number LIKE ?`,
      [siteId, `${siteName}-%`]
    );
    
    const nextRef = refRows[0]?.next_ref || 1;
    return `${siteName}-${nextRef}`;
  }

  /**
   * Create a new label
   */
  async create(labelData: CreateLabelData): Promise<Label> {
    const { source, destination, site_id, user_id, notes, zpl_content } = labelData;
    
    // Validate required fields
    if (!source.trim()) {
      throw new Error('Source is required');
    }
    
    if (!destination.trim()) {
      throw new Error('Destination is required');
    }

    // Generate reference number
    const reference_number = await this.generateReferenceNumber(site_id);
    
    // Generate ZPL content if not provided
    let finalZplContent = zpl_content;
    if (!finalZplContent) {
      const siteRows = await this.adapter.query('SELECT name FROM sites WHERE id = ?', [site_id]);
      
      if (siteRows.length > 0) {
        const zplService = new ZPLService();
        const refNumber = reference_number.split('-')[1] || reference_number;
        finalZplContent = zplService.generateCableLabel({
          site: siteRows[0].name,
          referenceNumber: refNumber,
          source: source.trim(),
          destination: destination.trim()
        });
      }
    }

    const result = await this.adapter.execute(
      `INSERT INTO labels (reference_number, site_id, user_id, source, destination, notes, zpl_content)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reference_number, site_id, user_id, source.trim(), destination.trim(), notes || null, finalZplContent || null]
    );
    
    if (!result.insertId) {
      throw new Error('Failed to create label');
    }
    
    return (await this.findById(Number(result.insertId), user_id))!;
  }

  /**
   * Find label by ID
   */
  async findById(id: number, userId: number): Promise<Label | null> {
    const rows = await this.adapter.query(
      `SELECT id, reference_number, site_id, user_id, source, destination, notes, zpl_content, is_active, created_at, updated_at
       FROM labels 
       WHERE id = ? AND user_id = ? AND is_active = 1`,
      [id, userId]
    );
    
    return rows.length > 0 ? (rows[0] as Label) : null;
  }

  /**
   * Find labels by site
   */
  async findBySiteId(siteId: number, userId: number, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<Label[]> {
    const { limit = 50, offset = 0 } = options;
    const safeLimit = parseInt(String(limit), 10) || 50;
    const safeOffset = parseInt(String(offset), 10) || 0;
    
    const rows = await this.adapter.query(
      `SELECT id, reference_number, site_id, user_id, source, destination, notes, zpl_content, is_active, created_at, updated_at
       FROM labels 
       WHERE site_id = ? AND user_id = ? AND is_active = 1
       ORDER BY reference_number ASC
       LIMIT ? OFFSET ?`,
      [siteId, userId, safeLimit, safeOffset]
    );
    
    return rows as Label[];
  }

  /**
   * Search labels with multiple options
   */
  async search(userId: number, options: LabelSearchOptions = {}): Promise<Label[]> {
    let query = `
      SELECT id, reference_number, site_id, user_id, source, destination, notes, zpl_content, is_active, created_at, updated_at
      FROM labels 
      WHERE user_id = ? AND is_active = 1
    `;
    
    const params: any[] = [userId];
    
    if (options.site_id) {
      query += ` AND site_id = ?`;
      params.push(options.site_id);
    }
    
    if (options.reference_number) {
      query += ` AND reference_number = ?`;
      params.push(options.reference_number);
    }
    
    if (options.source) {
      query += ` AND source LIKE ?`;
      params.push(`%${options.source}%`);
    }
    
    if (options.destination) {
      query += ` AND destination LIKE ?`;
      params.push(`%${options.destination}%`);
    }
    
    if (options.search) {
      query += ` AND (reference_number LIKE ? OR source LIKE ? OR destination LIKE ? OR notes LIKE ?)`;
      const searchPattern = `%${options.search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    const sortBy = options.sort_by || 'created_at';
    const sortOrder = options.sort_order || 'DESC';
    query += ` ORDER BY ${sortBy} ${sortOrder}`;
    
    if (options.limit) {
      query += ` LIMIT ?`;
      params.push(parseInt(String(options.limit), 10) || 50);
    }

    if (options.offset) {
      query += ` OFFSET ?`;
      params.push(parseInt(String(options.offset), 10) || 0);
    }

    const rows = await this.adapter.query(query, params);
    return rows as Label[];
  }

  /**
   * Update label
   */
  async update(id: number, userId: number, labelData: UpdateLabelData): Promise<Label | null> {
    const updates: string[] = [];
    const values: any[] = [];

    if (labelData.source !== undefined) {
      updates.push('source = ?');
      values.push(labelData.source.trim());
    }

    if (labelData.destination !== undefined) {
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
      return this.findById(id, userId);
    }

    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    
    if (!isMySQL) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
    }
    
    values.push(id, userId);

    const result = await this.adapter.execute(
      `UPDATE labels 
       SET ${updates.join(', ')}
       WHERE id = ? AND user_id = ? AND is_active = 1`,
      values
    );
    
    if (result.affectedRows === 0) {
      return null;
    }

    return this.findById(id, userId);
  }

  /**
   * Delete label (soft delete)
   */
  async delete(id: number, userId: number): Promise<boolean> {
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    
    const result = await this.adapter.execute(
      isMySQL
        ? `UPDATE labels SET is_active = 0 WHERE id = ? AND user_id = ? AND is_active = 1`
        : `UPDATE labels SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_active = 1`,
      [id, userId]
    );
    
    return result.affectedRows > 0;
  }

  /**
   * Count labels for user
   */
  async countByUserId(userId: number, siteId?: number): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM labels WHERE user_id = ? AND is_active = 1`;
    const params: any[] = [userId];
    
    if (siteId) {
      query += ` AND site_id = ?`;
      params.push(siteId);
    }
    
    const rows = await this.adapter.query(query, params);
    return rows[0]?.count || 0;
  }

  /**
   * Get all labels for a site with counts
   */
  async findBySiteIdWithCounts(siteId: number, userId: number): Promise<Label[]> {
    const rows = await this.adapter.query(
      `SELECT id, reference_number, site_id, user_id, source, destination, notes, zpl_content, is_active, created_at, updated_at
       FROM labels 
       WHERE site_id = ? AND user_id = ? AND is_active = 1
       ORDER BY reference_number ASC`,
      [siteId, userId]
    );
    
    return rows as Label[];
  }

  /**
   * Find labels for user with site info
   */
  async findByUserIdWithSiteInfo(userId: number, options: LabelSearchOptions = {}): Promise<Label[]> {
    return this.search(userId, options);
  }

  /**
   * Find labels for user (alias for search)
   */
  async findByUserId(userId: number, options: LabelSearchOptions = {}): Promise<Label[]> {
    return this.search(userId, options);
  }

  /**
   * Get statistics for user
   */
  async getStatsByUserId(userId: number): Promise<any> {
    const rows = await this.adapter.query(
      `SELECT COUNT(*) as total_labels, COUNT(DISTINCT site_id) as total_sites FROM labels WHERE user_id = ? AND is_active = 1`,
      [userId]
    );
    
    return rows[0] || { total_labels: 0, total_sites: 0 };
  }

  /**
   * Find recent labels for user
   */
  async findRecentByUserId(userId: number, limit: number = 10): Promise<Label[]> {
    const safeLimit = parseInt(String(limit), 10) || 10;
    const rows = await this.adapter.query(
      `SELECT id, reference_number, site_id, user_id, source, destination, notes, zpl_content, is_active, created_at, updated_at
       FROM labels 
       WHERE user_id = ? AND is_active = 1
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, safeLimit]
    );
    
    return rows as Label[];
  }

  /**
   * Check if label exists for user
   */
  async existsForUser(id: number, userId: number): Promise<boolean> {
    const rows = await this.adapter.query(
      `SELECT id FROM labels WHERE id = ? AND user_id = ? AND is_active = 1`,
      [id, userId]
    );
    
    return rows.length > 0;
  }

  /**
   * Bulk delete labels
   */
  async bulkDelete(ids: number[], userId: number): Promise<number> {
    if (ids.length === 0) return 0;
    
    const placeholders = ids.map(() => '?').join(',');
    const params = [...ids, userId];
    
    const result = await this.adapter.execute(
      `UPDATE labels SET is_active = 0 WHERE id IN (${placeholders}) AND user_id = ? AND is_active = 1`,
      params
    );
    
    return result.affectedRows;
  }
}

export default LabelModel;

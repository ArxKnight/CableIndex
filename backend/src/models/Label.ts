import connection from '../database/connection.js';
import { DatabaseAdapter } from '../database/adapters/base.js';
import { Label } from '../types/index.js';

export interface CreateLabelData {
  source: string;
  destination: string;
  site_id: number;
  created_by: number;
  notes?: string;
  zpl_content?: string;
  type?: string;
}

export interface UpdateLabelData {
  source?: string;
  destination?: string;
  notes?: string;
  zpl_content?: string;
  type?: string;
}

export interface LabelSearchOptions {
  search?: string;
  reference_number?: string;
  source?: string;
  destination?: string;
  limit?: number;
  offset?: number;
  sort_by?: 'created_at' | 'ref_string';
  sort_order?: 'ASC' | 'DESC';
}

export class LabelModel {
  private get adapter(): DatabaseAdapter {
    return connection.getAdapter();
  }

  private async getNextRef(siteId: number): Promise<{ refNumber: number; refString: string }>{
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';

    const siteRows = await this.adapter.query(
      `SELECT code, name FROM sites WHERE id = ?`,
      [siteId]
    );

    if (!siteRows.length) {
      throw new Error('Site not found');
    }

    const siteCode = siteRows[0].code || siteRows[0].name;

    await this.adapter.beginTransaction();
    try {
      if (isMySQL) {
        await this.adapter.execute(
          `INSERT INTO site_counters (site_id, next_ref) VALUES (?, 1)
           ON DUPLICATE KEY UPDATE next_ref = next_ref`,
          [siteId]
        );
      } else {
        await this.adapter.execute(
          `INSERT OR IGNORE INTO site_counters (site_id, next_ref) VALUES (?, 1)`,
          [siteId]
        );
      }

      const rows = await this.adapter.query(
        `SELECT next_ref FROM site_counters WHERE site_id = ?`,
        [siteId]
      );

      const currentRef = rows[0]?.next_ref ? Number(rows[0].next_ref) : 1;
      const nextRef = currentRef + 1;

      await this.adapter.execute(
        `UPDATE site_counters SET next_ref = ? WHERE site_id = ?`,
        [nextRef, siteId]
      );

      await this.adapter.commit();

      const padded = String(currentRef).padStart(4, '0');
      return { refNumber: currentRef, refString: `${siteCode}-${padded}` };
    } catch (error) {
      await this.adapter.rollback();
      throw error;
    }
  }

  private mapLegacyFields(label: Label): Label {
    if (label.payload_json) {
      try {
        const payload = JSON.parse(label.payload_json) as any;
        return {
          ...label,
          reference_number: label.ref_string,
          source: payload.source,
          destination: payload.destination,
          notes: payload.notes,
          zpl_content: payload.zpl_content,
        };
      } catch (error) {
        return { ...label, reference_number: label.ref_string };
      }
    }

    return { ...label, reference_number: label.ref_string };
  }

  async create(labelData: CreateLabelData): Promise<Label> {
    const { source, destination, site_id, created_by, notes, zpl_content, type = 'cable' } = labelData;

    if (!source.trim()) {
      throw new Error('Source is required');
    }

    if (!destination.trim()) {
      throw new Error('Destination is required');
    }

    const { refNumber, refString } = await this.getNextRef(site_id);
    const payload = {
      source: source.trim(),
      destination: destination.trim(),
      notes: notes || null,
      zpl_content: zpl_content || null,
    };

    const result = await this.adapter.execute(
      `INSERT INTO labels (site_id, ref_number, ref_string, type, payload_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [site_id, refNumber, refString, type, JSON.stringify(payload), created_by]
    );

    if (!result.insertId) {
      throw new Error('Failed to create label');
    }

    const created = await this.findById(Number(result.insertId), site_id);
    if (!created) {
      throw new Error('Failed to load created label');
    }

    return created;
  }

  async findById(id: number, siteId: number): Promise<Label | null> {
    const rows = await this.adapter.query(
      `SELECT id, site_id, created_by, ref_number, ref_string, type, payload_json, created_at, updated_at
       FROM labels
       WHERE id = ? AND site_id = ?`,
      [id, siteId]
    );

    return rows.length > 0 ? this.mapLegacyFields(rows[0] as Label) : null;
  }

  async findBySiteId(siteId: number, options: LabelSearchOptions = {}): Promise<Label[]> {
    const { limit = 50, offset = 0, sort_by = 'created_at', sort_order = 'DESC' } = options;
    const safeLimit = Math.max(0, parseInt(String(limit), 10) || 50);
    const safeOffset = Math.max(0, parseInt(String(offset), 10) || 0);
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';

    let query = `
      SELECT id, site_id, created_by, ref_number, ref_string, type, payload_json, created_at, updated_at
      FROM labels
      WHERE site_id = ?
    `;

    const params: any[] = [siteId];

    if (options.reference_number) {
      query += ` AND ref_string = ?`;
      params.push(options.reference_number);
    }

    if (options.search) {
      query += ` AND (ref_string LIKE ? OR payload_json LIKE ?)`;
      const searchPattern = `%${options.search}%`;
      params.push(searchPattern, searchPattern);
    }

    query += ` ORDER BY ${sort_by === 'ref_string' ? 'ref_string' : 'created_at'} ${sort_order}`;

    if (isMySQL) {
      query += ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    } else {
      query += ` LIMIT ? OFFSET ?`;
      params.push(safeLimit, safeOffset);
    }

    const rows = await this.adapter.query(query, params);
    return (rows as Label[]).map((row) => this.mapLegacyFields(row));
  }

  async update(id: number, siteId: number, labelData: UpdateLabelData): Promise<Label | null> {
    const updates: string[] = [];
    const values: any[] = [];

    const payload: any = {};

    if (labelData.source !== undefined) payload.source = labelData.source.trim();
    if (labelData.destination !== undefined) payload.destination = labelData.destination.trim();
    if (labelData.notes !== undefined) payload.notes = labelData.notes || null;
    if (labelData.zpl_content !== undefined) payload.zpl_content = labelData.zpl_content || null;

    if (Object.keys(payload).length > 0) {
      updates.push('payload_json = ?');
      values.push(JSON.stringify(payload));
    }

    if (labelData.type !== undefined) {
      updates.push('type = ?');
      values.push(labelData.type);
    }

    if (updates.length === 0) {
      return this.findById(id, siteId);
    }

    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';
    if (!isMySQL) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
    }

    values.push(id, siteId);

    const result = await this.adapter.execute(
      `UPDATE labels
       SET ${updates.join(', ')}
       WHERE id = ? AND site_id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return null;
    }

    return this.findById(id, siteId);
  }

  async delete(id: number, siteId: number): Promise<boolean> {
    const result = await this.adapter.execute(
      `DELETE FROM labels WHERE id = ? AND site_id = ?`,
      [id, siteId]
    );

    return result.affectedRows > 0;
  }

  async bulkDelete(ids: number[], siteId: number): Promise<number> {
    const placeholders = ids.map(() => '?').join(', ');
    const result = await this.adapter.execute(
      `DELETE FROM labels WHERE site_id = ? AND id IN (${placeholders})`,
      [siteId, ...ids]
    );

    return result.affectedRows || 0;
  }

  async countBySiteId(siteId: number): Promise<number> {
    const rows = await this.adapter.query(
      `SELECT COUNT(*) as count FROM labels WHERE site_id = ?`,
      [siteId]
    );
    return rows[0]?.count || 0;
  }

  async getStatsBySiteId(siteId: number): Promise<{ total_labels: number; labels_this_month: number; labels_today: number }> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const rows = await this.adapter.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as created_this_month,
        COUNT(CASE WHEN created_at >= ? THEN 1 END) as created_today
      FROM labels
      WHERE site_id = ?`,
      [thirtyDaysAgo.toISOString(), todayStart.toISOString(), siteId]
    );

    const result = rows[0] as any;
    return {
      total_labels: result.total || 0,
      labels_this_month: result.created_this_month || 0,
      labels_today: result.created_today || 0,
    };
  }

  async findRecentBySiteId(siteId: number, limit: number = 10): Promise<Label[]> {
    const safeLimit = Math.max(0, parseInt(String(limit), 10) || 10);
    const config = connection.getConfig();
    const isMySQL = config?.type === 'mysql';

    const query = isMySQL
      ? `SELECT id, site_id, created_by, ref_number, ref_string, type, payload_json, created_at, updated_at
         FROM labels
         WHERE site_id = ?
         ORDER BY created_at DESC
         LIMIT ${safeLimit}`
      : `SELECT id, site_id, created_by, ref_number, ref_string, type, payload_json, created_at, updated_at
         FROM labels
         WHERE site_id = ?
         ORDER BY created_at DESC
         LIMIT ?`;

    const params = isMySQL ? [siteId] : [siteId, safeLimit];
    const rows = await this.adapter.query(query, params);
    return (rows as Label[]).map((row) => this.mapLegacyFields(row));
  }
}

export default LabelModel;

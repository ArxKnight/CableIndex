import connection from '../database/connection.js';
import { DatabaseAdapter } from '../database/adapters/base.js';
import { Label } from '../types/index.js';

export interface CreateLabelData {
  site_id: number;
  source_location_id: number;
  destination_location_id: number;
  cable_type_id: number;
  created_by: number;
  notes?: string;
  zpl_content?: string;
  type?: string;
}

export interface UpdateLabelData {
  source_location_id?: number;
  destination_location_id?: number;
  cable_type_id?: number;
  notes?: string;
  zpl_content?: string;
  type?: string;
}

export interface LabelSearchOptions {
  search?: string;
  reference_number?: string;
  limit?: number;
  offset?: number;
  sort_by?: 'created_at' | 'ref_string';
  sort_order?: 'ASC' | 'DESC';
}

function makePayloadContainsPattern(value: string): string {
  return `%${value}%`;
}

export class LabelModel {
  private get adapter(): DatabaseAdapter {
    return connection.getAdapter();
  }

  private async getSiteCode(siteId: number): Promise<string> {
    const siteRows = await this.adapter.query(
      `SELECT code FROM sites WHERE id = ?`,
      [siteId]
    );

    if (!siteRows.length) {
      throw new Error('Site not found');
    }

    const siteCode = siteRows[0].code;
    if (!siteCode) {
      throw new Error('Site abbreviation is required');
    }

    return String(siteCode);
  }

  private async assertLocationBelongsToSite(siteId: number, locationId: number): Promise<void> {
    const rows = await this.adapter.query(
      `SELECT id FROM site_locations WHERE id = ? AND site_id = ?`,
      [locationId, siteId]
    );

    if (!rows.length) {
      throw new Error('Invalid site location');
    }
  }

  private async assertCableTypeBelongsToSite(siteId: number, cableTypeId: number): Promise<void> {
    const rows = await this.adapter.query(
      `SELECT id FROM cable_types WHERE id = ? AND site_id = ?`,
      [cableTypeId, siteId]
    );

    if (!rows.length) {
      throw new Error('Invalid cable type');
    }
  }

  async findByRefNumberRange(siteId: number, startRef: number, endRef: number): Promise<Label[]> {
    const safeStart = Math.max(1, Math.floor(Number(startRef)));
    const safeEnd = Math.max(1, Math.floor(Number(endRef)));

    if (safeStart > safeEnd) {
      throw new Error('Invalid reference range');
    }

    const query = `
      SELECT
        l.id,
        l.site_id,
        l.created_by,
        l.ref_number,
        l.ref_string,
        l.cable_type_id,
        l.type,
        l.payload_json,
        l.source_location_id,
        l.destination_location_id,
        l.created_at,
        l.updated_at,
        s.code as site_code,
        ct.id as ct_id, ct.name as ct_name, ct.description as ct_description, ct.created_at as ct_created_at, ct.updated_at as ct_updated_at,
        sls.id as sls_id, sls.floor as sls_floor, sls.suite as sls_suite, sls.\`row\` as sls_row, sls.rack as sls_rack, sls.label as sls_label,
        sld.id as sld_id, sld.floor as sld_floor, sld.suite as sld_suite, sld.\`row\` as sld_row, sld.rack as sld_rack, sld.label as sld_label
      FROM labels l
      JOIN sites s ON s.id = l.site_id
      LEFT JOIN cable_types ct ON ct.id = l.cable_type_id
      LEFT JOIN site_locations sls ON sls.id = l.source_location_id
      LEFT JOIN site_locations sld ON sld.id = l.destination_location_id
      WHERE l.site_id = ? AND l.ref_number BETWEEN ? AND ?
      ORDER BY l.ref_number ASC
    `;

    const params: any[] = [siteId, safeStart, safeEnd];

    // NOTE: Do NOT apply LIMIT here.
    // Range-based bulk downloads must be based on BETWEEN semantics,
    // not row counts. Missing reference numbers should simply be absent.
    // Keep ordering stable.
    const rows = await this.adapter.query(query, params);
    return (rows as any[]).map((row) => this.mapRow(row));
  }

  private async getNextRef(siteId: number): Promise<{ refNumber: number; refString: string }>{
    await this.getSiteCode(siteId);

    await this.adapter.beginTransaction();
    try {
      await this.adapter.execute(
        `INSERT INTO site_counters (site_id, next_ref) VALUES (?, 1)
         ON DUPLICATE KEY UPDATE next_ref = next_ref`,
        [siteId]
      );

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
      return { refNumber: currentRef, refString: padded };
    } catch (error) {
      await this.adapter.rollback();
      throw error;
    }
  }

  private formatLocationDisplay(
    siteCode: string,
    location: { label?: string | null; floor: string; suite: string; row: string; rack: string }
  ): string {
    const label = (location.label ?? '').toString().trim();
    const floor = (location.floor ?? '').toString().trim();
    const suite = (location.suite ?? '').toString().trim();
    const row = (location.row ?? '').toString().trim();
    const rack = (location.rack ?? '').toString().trim();

    // UI display format: <LocationLabel> — Label: <SiteCode> | Floor: ...
    // (kept separate from ZPL print format)
    return `${label} — Label: ${siteCode} | Floor: ${floor} | Suite: ${suite} | Row: ${row} | Rack: ${rack}`;
  }

  private mapRow(row: any): Label {
    let notes: string | undefined;
    let zpl_content: string | undefined;

    if (row.payload_json) {
      try {
        const payload = JSON.parse(row.payload_json) as any;
        notes = payload.notes ?? undefined;
        zpl_content = payload.zpl_content ?? undefined;
      } catch {
        // ignore
      }
    }

    const siteCode = row.site_code as string | undefined;

    const cableType = row.ct_id
      ? {
          id: Number(row.ct_id),
          site_id: Number(row.site_id),
          name: String(row.ct_name),
          description: row.ct_description ?? null,
          created_at: row.ct_created_at ?? row.created_at,
          updated_at: row.ct_updated_at ?? row.updated_at,
        }
      : null;

    const sourceLoc = row.sls_id
      ? {
          id: Number(row.sls_id),
          site_id: Number(row.site_id),
          floor: String(row.sls_floor),
          suite: String(row.sls_suite),
          row: String(row.sls_row),
          rack: String(row.sls_rack),
          label: row.sls_label ?? null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }
      : null;

    const destLoc = row.sld_id
      ? {
          id: Number(row.sld_id),
          site_id: Number(row.site_id),
          floor: String(row.sld_floor),
          suite: String(row.sld_suite),
          row: String(row.sld_row),
          rack: String(row.sld_rack),
          label: row.sld_label ?? null,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }
      : null;

    const formattedSource = siteCode && sourceLoc ? this.formatLocationDisplay(siteCode, sourceLoc) : '';
    const formattedDestination = siteCode && destLoc ? this.formatLocationDisplay(siteCode, destLoc) : '';

    return {
      id: Number(row.id),
      site_id: Number(row.site_id),
      created_by: Number(row.created_by),
      created_by_name: row.created_by_name ?? null,
      created_by_email: row.created_by_email ?? null,
      ref_number: Number(row.ref_number),
      ref_string: String(row.ref_string),
      cable_type_id: row.cable_type_id ?? null,
      cable_type: cableType,
      type: String(row.type),
      payload_json: row.payload_json ?? null,
      source_location_id: row.source_location_id ?? null,
      destination_location_id: row.destination_location_id ?? null,
      source_location: sourceLoc,
      destination_location: destLoc,
      created_at: row.created_at,
      updated_at: row.updated_at,
      reference_number: String(row.ref_string),
      source: formattedSource,
      destination: formattedDestination,
      ...(notes !== undefined ? { notes } : {}),
      ...(zpl_content !== undefined ? { zpl_content } : {}),
    };
  }

  async create(labelData: CreateLabelData): Promise<Label> {
    const { site_id, created_by, notes, zpl_content, type = 'cable', source_location_id, destination_location_id, cable_type_id } = labelData;

    if (!Number.isFinite(source_location_id) || source_location_id < 1) {
      throw new Error('Source location is required');
    }

    if (!Number.isFinite(destination_location_id) || destination_location_id < 1) {
      throw new Error('Destination location is required');
    }

    if (!Number.isFinite(cable_type_id) || cable_type_id < 1) {
      throw new Error('Cable type is required');
    }

    await this.assertLocationBelongsToSite(site_id, source_location_id);
    await this.assertLocationBelongsToSite(site_id, destination_location_id);
    await this.assertCableTypeBelongsToSite(site_id, cable_type_id);

    const { refNumber, refString } = await this.getNextRef(site_id);
    const payload = {
      notes: notes || null,
      zpl_content: zpl_content || null,
    };

    const result = await this.adapter.execute(
      `INSERT INTO labels (site_id, ref_number, ref_string, cable_type_id, type, payload_json, created_by, source_location_id, destination_location_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ,[site_id, refNumber, refString, cable_type_id, type, JSON.stringify(payload), created_by, source_location_id, destination_location_id]
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

  async createMany(labelData: CreateLabelData, quantity: number): Promise<Label[]> {
    const {
      site_id,
      created_by,
      notes,
      zpl_content,
      type = 'cable',
      source_location_id,
      destination_location_id,
      cable_type_id,
    } = labelData;

    const qty = Math.floor(Number(quantity));
    if (!Number.isFinite(qty) || qty < 1) {
      throw new Error('Quantity must be at least 1');
    }
    if (qty > 100) {
      throw new Error('Quantity cannot exceed 100');
    }

    if (!Number.isFinite(source_location_id) || source_location_id < 1) {
      throw new Error('Source location is required');
    }

    if (!Number.isFinite(destination_location_id) || destination_location_id < 1) {
      throw new Error('Destination location is required');
    }

    if (!Number.isFinite(cable_type_id) || cable_type_id < 1) {
      throw new Error('Cable type is required');
    }

    await this.assertLocationBelongsToSite(site_id, source_location_id);
    await this.assertLocationBelongsToSite(site_id, destination_location_id);
    await this.assertCableTypeBelongsToSite(site_id, cable_type_id);

    // Ensures site exists and preserves previous error messages.
    await this.getSiteCode(site_id);

    const payload = {
      notes: notes || null,
      zpl_content: zpl_content || null,
    };

    let startRef = 1;
    let endRef = 1;

    await this.adapter.beginTransaction();
    try {
      await this.adapter.execute(
        `INSERT INTO site_counters (site_id, next_ref) VALUES (?, 1)
         ON DUPLICATE KEY UPDATE next_ref = next_ref`,
        [site_id]
      );

      const counterRows = await this.adapter.query(
        `SELECT next_ref FROM site_counters WHERE site_id = ?`,
        [site_id]
      );

      startRef = counterRows[0]?.next_ref ? Number(counterRows[0].next_ref) : 1;
      endRef = startRef + qty - 1;
      const nextRefAfterBlock = endRef + 1;

      await this.adapter.execute(
        `UPDATE site_counters SET next_ref = ? WHERE site_id = ?`,
        [nextRefAfterBlock, site_id]
      );

      for (let i = 0; i < qty; i++) {
        const refNumber = startRef + i;
        const refString = String(refNumber).padStart(4, '0');

        await this.adapter.execute(
          `INSERT INTO labels (site_id, ref_number, ref_string, cable_type_id, type, payload_json, created_by, source_location_id, destination_location_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            site_id,
            refNumber,
            refString,
            cable_type_id,
            type,
            JSON.stringify(payload),
            created_by,
            source_location_id,
            destination_location_id,
          ]
        );
      }

      await this.adapter.commit();
    } catch (error) {
      await this.adapter.rollback();
      throw error;
    }

    const created = await this.findByRefNumberRange(site_id, startRef, endRef);
    if (created.length !== qty) {
      throw new Error('Failed to load created labels');
    }
    return created;
  }

  async findById(id: number, siteId: number): Promise<Label | null> {
    const rows = await this.adapter.query(
      `SELECT
        l.id,
        l.site_id,
        l.created_by,
        l.ref_number,
        l.ref_string,
        l.cable_type_id,
        l.type,
        l.payload_json,
        l.source_location_id,
        l.destination_location_id,
        l.created_at,
        l.updated_at,
        u.username as created_by_name,
        u.email as created_by_email,
        s.code as site_code,
        ct.id as ct_id, ct.name as ct_name, ct.description as ct_description, ct.created_at as ct_created_at, ct.updated_at as ct_updated_at,
        sls.id as sls_id, sls.floor as sls_floor, sls.suite as sls_suite, sls.\`row\` as sls_row, sls.rack as sls_rack, sls.label as sls_label,
        sld.id as sld_id, sld.floor as sld_floor, sld.suite as sld_suite, sld.\`row\` as sld_row, sld.rack as sld_rack, sld.label as sld_label
       FROM labels l
       JOIN sites s ON s.id = l.site_id
       LEFT JOIN users u ON u.id = l.created_by
       LEFT JOIN cable_types ct ON ct.id = l.cable_type_id
       LEFT JOIN site_locations sls ON sls.id = l.source_location_id
       LEFT JOIN site_locations sld ON sld.id = l.destination_location_id
       WHERE l.id = ? AND l.site_id = ?`,
      [id, siteId]
    );

    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  async findBySiteId(siteId: number, options: LabelSearchOptions = {}): Promise<Label[]> {
    const { limit = 50, offset = 0, sort_by = 'created_at', sort_order = 'DESC' } = options;
    const safeLimit = Math.max(0, parseInt(String(limit), 10) || 50);
    const safeOffset = Math.max(0, parseInt(String(offset), 10) || 0);

    let query = `
      SELECT
        l.id,
        l.site_id,
        l.created_by,
        l.ref_number,
        l.ref_string,
        l.cable_type_id,
        l.type,
        l.payload_json,
        l.source_location_id,
        l.destination_location_id,
        l.created_at,
        l.updated_at,
        u.username as created_by_name,
        u.email as created_by_email,
        s.code as site_code,
        ct.id as ct_id, ct.name as ct_name, ct.description as ct_description, ct.created_at as ct_created_at, ct.updated_at as ct_updated_at,
        sls.id as sls_id, sls.floor as sls_floor, sls.suite as sls_suite, sls.\`row\` as sls_row, sls.rack as sls_rack, sls.label as sls_label,
        sld.id as sld_id, sld.floor as sld_floor, sld.suite as sld_suite, sld.\`row\` as sld_row, sld.rack as sld_rack, sld.label as sld_label
      FROM labels l
      JOIN sites s ON s.id = l.site_id
      LEFT JOIN users u ON u.id = l.created_by
      LEFT JOIN cable_types ct ON ct.id = l.cable_type_id
      LEFT JOIN site_locations sls ON sls.id = l.source_location_id
      LEFT JOIN site_locations sld ON sld.id = l.destination_location_id
      WHERE l.site_id = ?
    `;

    const params: any[] = [siteId];

    if (options.reference_number) {
      query += ` AND l.ref_string = ?`;
      params.push(options.reference_number);
    }

    if (options.search) {
      query += ` AND (l.ref_string LIKE ? OR l.payload_json LIKE ?)`;
      const searchPattern = `%${options.search}%`;
      params.push(searchPattern, searchPattern);
    }

    query += ` ORDER BY ${sort_by === 'ref_string' ? 'l.ref_string' : 'l.created_at'} ${sort_order}`;

    query += ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const rows = await this.adapter.query(query, params);
    return (rows as any[]).map((row) => this.mapRow(row));
  }

  async update(id: number, siteId: number, labelData: UpdateLabelData): Promise<Label | null> {
    const updates: string[] = [];
    const values: any[] = [];

    if (labelData.source_location_id !== undefined) {
      await this.assertLocationBelongsToSite(siteId, labelData.source_location_id);
      updates.push('source_location_id = ?');
      values.push(labelData.source_location_id);
    }

    if (labelData.destination_location_id !== undefined) {
      await this.assertLocationBelongsToSite(siteId, labelData.destination_location_id);
      updates.push('destination_location_id = ?');
      values.push(labelData.destination_location_id);
    }

    if (labelData.cable_type_id !== undefined) {
      await this.assertCableTypeBelongsToSite(siteId, labelData.cable_type_id);
      updates.push('cable_type_id = ?');
      values.push(labelData.cable_type_id);
    }

    if (labelData.notes !== undefined || labelData.zpl_content !== undefined) {
      const existing = await this.findById(id, siteId);
      const existingPayload = existing?.payload_json ? (() => {
        try { return JSON.parse(existing.payload_json) as any; } catch { return {}; }
      })() : {};

      const payload: any = {
        ...existingPayload,
      };

      if (labelData.notes !== undefined) payload.notes = labelData.notes || null;
      if (labelData.zpl_content !== undefined) payload.zpl_content = labelData.zpl_content || null;

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

  async countBySiteId(siteId: number, options: Pick<LabelSearchOptions, 'search' | 'reference_number'> = {}): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM labels WHERE site_id = ?`;
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

    const rows = await this.adapter.query(query, params);
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
      [thirtyDaysAgo, todayStart, siteId]
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
    const query = `SELECT
         l.id,
         l.site_id,
         l.created_by,
         l.ref_number,
         l.ref_string,
         l.cable_type_id,
         l.type,
         l.payload_json,
         l.source_location_id,
         l.destination_location_id,
         l.created_at,
         l.updated_at,
         s.code as site_code,
         ct.id as ct_id, ct.name as ct_name, ct.description as ct_description, ct.created_at as ct_created_at, ct.updated_at as ct_updated_at,
         sls.id as sls_id, sls.floor as sls_floor, sls.suite as sls_suite, sls.\`row\` as sls_row, sls.rack as sls_rack, sls.label as sls_label,
         sld.id as sld_id, sld.floor as sld_floor, sld.suite as sld_suite, sld.\`row\` as sld_row, sld.rack as sld_rack, sld.label as sld_label
        FROM labels l
        JOIN sites s ON s.id = l.site_id
        LEFT JOIN cable_types ct ON ct.id = l.cable_type_id
        LEFT JOIN site_locations sls ON sls.id = l.source_location_id
        LEFT JOIN site_locations sld ON sld.id = l.destination_location_id
        WHERE l.site_id = ?
        ORDER BY l.created_at DESC
        LIMIT ${safeLimit}`;

     const rows = await this.adapter.query(query, [siteId]);
     return (rows as any[]).map((row) => this.mapRow(row));
  }
}

export default LabelModel;

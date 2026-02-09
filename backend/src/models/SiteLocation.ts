import connection from '../database/connection.js';
import { DatabaseAdapter } from '../database/adapters/base.js';
import { SiteLocation } from '../types/index.js';

export type DeleteSiteLocationStrategy = 'auto' | 'reassign' | 'cascade';

export class SiteLocationInUseError extends Error {
  readonly usage: { source: number; destination: number };

  constructor(usage: { source: number; destination: number }) {
    super('Location is used by existing labels');
    this.name = 'SiteLocationInUseError';
    this.usage = usage;
  }
}

export class DuplicateSiteLocationCoordsError extends Error {
  readonly existing: SiteLocation | null;

  constructor(existing: SiteLocation | null) {
    super('A location with these coordinates already exists');
    this.name = 'DuplicateSiteLocationCoordsError';
    this.existing = existing;
  }
}

export interface CreateSiteLocationData {
  site_id: number;
  floor: string;
  suite: string;
  row: string;
  rack: string;
  label?: string | null;
}

export interface UpdateSiteLocationData {
  floor?: string;
  suite?: string;
  row?: string;
  rack?: string;
  label?: string | null;
}

export class SiteLocationModel {
  private get adapter(): DatabaseAdapter {
    return connection.getAdapter();
  }

  private async findByCoords(siteId: number, floor: string, suite: string, row: string, rack: string): Promise<SiteLocation | null> {
    const rows = await this.adapter.query(
      `SELECT
         sl.id,
         sl.site_id,
         sl.floor,
         sl.suite,
         sl.\`row\` as \`row\`,
         sl.rack,
         sl.label,
         COALESCE(NULLIF(TRIM(sl.label), ''), s.code) AS effective_label,
         sl.created_at,
         sl.updated_at
       FROM site_locations sl
       JOIN sites s ON s.id = sl.site_id
       WHERE sl.site_id = ? AND sl.floor = ? AND sl.suite = ? AND sl.\`row\` = ? AND sl.rack = ?
       LIMIT 1`,
      [siteId, floor, suite, row, rack]
    );

    return rows.length ? (rows[0] as SiteLocation) : null;
  }

  private async findByCoordsAndLabelKey(
    siteId: number,
    floor: string,
    suite: string,
    row: string,
    rack: string,
    labelKey: string
  ): Promise<SiteLocation | null> {
    const rows = await this.adapter.query(
      `SELECT
         sl.id,
         sl.site_id,
         sl.floor,
         sl.suite,
         sl.\`row\` as \`row\`,
         sl.rack,
         sl.label,
         COALESCE(NULLIF(TRIM(sl.label), ''), s.code) AS effective_label,
         sl.created_at,
         sl.updated_at
       FROM site_locations sl
       JOIN sites s ON s.id = sl.site_id
       WHERE sl.site_id = ? AND sl.floor = ? AND sl.suite = ? AND sl.\`row\` = ? AND sl.rack = ?
         AND sl.label_key = ?
       LIMIT 1`,
      [siteId, floor, suite, row, rack, labelKey]
    );

    return rows.length ? (rows[0] as SiteLocation) : null;
  }

  async getLabelUsageCounts(siteId: number, locationId: number): Promise<{ source: number; destination: number }> {
    const sourceRows = await this.adapter.query(
      'SELECT COUNT(*) as count FROM labels WHERE site_id = ? AND source_location_id = ?',
      [siteId, locationId]
    );
    const destinationRows = await this.adapter.query(
      'SELECT COUNT(*) as count FROM labels WHERE site_id = ? AND destination_location_id = ?',
      [siteId, locationId]
    );

    const source = Number((sourceRows?.[0] as any)?.count ?? 0);
    const destination = Number((destinationRows?.[0] as any)?.count ?? 0);

    return {
      source: Number.isFinite(source) ? source : 0,
      destination: Number.isFinite(destination) ? destination : 0,
    };
  }

  async deleteWithStrategy(
    locationId: number,
    siteId: number,
    options?: { strategy?: DeleteSiteLocationStrategy; target_location_id?: number }
  ): Promise<{
    deleted: boolean;
    strategyUsed: Exclude<DeleteSiteLocationStrategy, 'auto'> | 'none';
    usage: { source: number; destination: number };
    labelsDeleted: number;
    labelsReassignedSource: number;
    labelsReassignedDestination: number;
  }> {
    const strategy: DeleteSiteLocationStrategy = options?.strategy ?? 'auto';
    const usage = await this.getLabelUsageCounts(siteId, locationId);
    const totalInUse = usage.source + usage.destination;

    if (totalInUse > 0 && strategy === 'auto') {
      throw new SiteLocationInUseError(usage);
    }

    if (strategy === 'reassign') {
      const targetMaybe = options?.target_location_id;
      if (!Number.isFinite(targetMaybe) || (targetMaybe as number) < 1) {
        throw new Error('target_location_id is required for reassignment');
      }
      const target = Number(targetMaybe);
      if (target === locationId) {
        throw new Error('target_location_id must be different from the location being deleted');
      }

      const targetLocation = await this.findById(target, siteId);
      if (!targetLocation) {
        throw new Error('Target location not found');
      }
    }

    await this.adapter.beginTransaction();
    try {
      let labelsDeleted = 0;
      let labelsReassignedSource = 0;
      let labelsReassignedDestination = 0;
      let strategyUsed: Exclude<DeleteSiteLocationStrategy, 'auto'> | 'none' = 'none';

      if (totalInUse > 0) {
        if (strategy === 'cascade') {
          const del = await this.adapter.execute(
            'DELETE FROM labels WHERE site_id = ? AND (source_location_id = ? OR destination_location_id = ?)',
            [siteId, locationId, locationId]
          );
          labelsDeleted = del.affectedRows;
          strategyUsed = 'cascade';
        } else if (strategy === 'reassign') {
          const target = options!.target_location_id!;
          const updatedSource = await this.adapter.execute(
            'UPDATE labels SET source_location_id = ? WHERE site_id = ? AND source_location_id = ?',
            [target, siteId, locationId]
          );
          const updatedDestination = await this.adapter.execute(
            'UPDATE labels SET destination_location_id = ? WHERE site_id = ? AND destination_location_id = ?',
            [target, siteId, locationId]
          );
          labelsReassignedSource = updatedSource.affectedRows;
          labelsReassignedDestination = updatedDestination.affectedRows;
          strategyUsed = 'reassign';
        }
      }

      const deleted = await this.adapter.execute('DELETE FROM site_locations WHERE id = ? AND site_id = ?', [locationId, siteId]);
      if (deleted.affectedRows === 0) {
        await this.adapter.rollback();
        return {
          deleted: false,
          strategyUsed: 'none',
          usage,
          labelsDeleted: 0,
          labelsReassignedSource: 0,
          labelsReassignedDestination: 0,
        };
      }

      await this.adapter.commit();
      return {
        deleted: true,
        strategyUsed,
        usage,
        labelsDeleted,
        labelsReassignedSource,
        labelsReassignedDestination,
      };
    } catch (error) {
      await this.adapter.rollback();
      throw error;
    }
  }

  async listBySiteId(siteId: number): Promise<SiteLocation[]> {
    const rows = await this.adapter.query(
      `SELECT
         sl.id,
         sl.site_id,
         sl.floor,
         sl.suite,
         sl.\`row\` as \`row\`,
         sl.rack,
         sl.label,
         COALESCE(NULLIF(TRIM(sl.label), ''), s.code) AS effective_label,
         sl.created_at,
         sl.updated_at
       FROM site_locations sl
       JOIN sites s ON s.id = sl.site_id
       WHERE sl.site_id = ?
       ORDER BY sl.floor ASC, sl.suite ASC, sl.\`row\` ASC, sl.rack ASC, sl.id ASC`,
      [siteId]
    );

    return rows as SiteLocation[];
  }

  async findById(id: number, siteId: number): Promise<SiteLocation | null> {
    const rows = await this.adapter.query(
      `SELECT
         sl.id,
         sl.site_id,
         sl.floor,
         sl.suite,
         sl.\`row\` as \`row\`,
         sl.rack,
         sl.label,
         COALESCE(NULLIF(TRIM(sl.label), ''), s.code) AS effective_label,
         sl.created_at,
         sl.updated_at
       FROM site_locations sl
       JOIN sites s ON s.id = sl.site_id
       WHERE sl.id = ? AND sl.site_id = ?`,
      [id, siteId]
    );

    return rows.length ? (rows[0] as SiteLocation) : null;
  }

  async create(data: CreateSiteLocationData): Promise<SiteLocation> {
    const labelRaw = data.label;
    const labelTrimmed = typeof labelRaw === 'string' ? labelRaw.trim() : '';

    const payload = {
      site_id: data.site_id,
      floor: data.floor.trim(),
      suite: data.suite.trim(),
      row: data.row.trim(),
      rack: data.rack.trim(),
      label: labelTrimmed !== '' ? labelTrimmed : null,
    };

    if (!payload.floor || !payload.suite || !payload.row || !payload.rack) {
      throw new Error('All location fields are required');
    }

    let result: { insertId?: number; affectedRows: number };
    try {
      result = await this.adapter.execute(
        `INSERT INTO site_locations (site_id, floor, suite, \`row\`, rack, label)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [payload.site_id, payload.floor, payload.suite, payload.row, payload.rack, payload.label]
      );
    } catch (error: any) {
      const msg = (error?.message ?? '').toString();
      const isDup = error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
      const isCoordsIndex = msg.includes('idx_site_locations_unique_coords');
      const isCoordsLabelIndex = msg.includes('idx_site_locations_unique_coords_label');

      if (isDup && (isCoordsIndex || isCoordsLabelIndex)) {
        let existing: SiteLocation | null = null;
        if (isCoordsLabelIndex) {
          const labelKey = payload.label ? payload.label : '__UNLABELED__';
          try {
            existing = await this.findByCoordsAndLabelKey(
              payload.site_id,
              payload.floor,
              payload.suite,
              payload.row,
              payload.rack,
              labelKey
            );
          } catch {
            // If the column isn't present yet for some reason, fall back.
            existing = await this.findByCoords(
              payload.site_id,
              payload.floor,
              payload.suite,
              payload.row,
              payload.rack
            );
          }
        } else {
          existing = await this.findByCoords(
            payload.site_id,
            payload.floor,
            payload.suite,
            payload.row,
            payload.rack
          );
        }

        throw new DuplicateSiteLocationCoordsError(existing);
      }

      throw error;
    }

    if (!result.insertId) {
      throw new Error('Failed to create site location');
    }

    const created = await this.findById(Number(result.insertId), payload.site_id);
    if (!created) {
      throw new Error('Failed to load created site location');
    }

    return created;
  }

  async update(id: number, siteId: number, data: UpdateSiteLocationData): Promise<SiteLocation | null> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.floor !== undefined) {
      updates.push('floor = ?');
      values.push(data.floor.trim());
    }

    if (data.suite !== undefined) {
      updates.push('suite = ?');
      values.push(data.suite.trim());
    }

    if (data.row !== undefined) {
      updates.push('`row` = ?');
      values.push(data.row.trim());
    }

    if (data.rack !== undefined) {
      updates.push('rack = ?');
      values.push(data.rack.trim());
    }

    if (data.label !== undefined) {
      updates.push('label = ?');
      values.push(data.label ? data.label.trim() : null);
    }

    if (!updates.length) {
      return this.findById(id, siteId);
    }

    values.push(id, siteId);

    const result = await this.adapter.execute(
      `UPDATE site_locations
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
      `DELETE FROM site_locations WHERE id = ? AND site_id = ?`,
      [id, siteId]
    );

    return result.affectedRows > 0;
  }
}

export default SiteLocationModel;

import connection from '../database/connection.js';
import { DatabaseAdapter } from '../database/adapters/base.js';
import { CableType } from '../types/index.js';

export interface CreateCableTypeData {
  site_id: number;
  name: string;
  description?: string | null;
}

export interface UpdateCableTypeData {
  name?: string;
  description?: string | null;
}

export class CableTypeModel {
  private get adapter(): DatabaseAdapter {
    return connection.getAdapter();
  }

  async listBySiteId(siteId: number): Promise<CableType[]> {
    const rows = await this.adapter.query(
      `SELECT id, site_id, name, description, created_at, updated_at
       FROM cable_types
       WHERE site_id = ?
       ORDER BY name ASC, id ASC`,
      [siteId]
    );
    return rows as CableType[];
  }

  async findById(id: number, siteId: number): Promise<CableType | null> {
    const rows = await this.adapter.query(
      `SELECT id, site_id, name, description, created_at, updated_at
       FROM cable_types
       WHERE id = ? AND site_id = ?`,
      [id, siteId]
    );
    return rows.length ? (rows[0] as CableType) : null;
  }

  async create(data: CreateCableTypeData): Promise<CableType> {
    const site_id = Number(data.site_id);
    const name = (data.name ?? '').toString().trim();
    const description = data.description !== undefined ? (data.description ?? null) : null;

    if (!site_id || site_id < 1) throw new Error('Valid site_id is required');
    if (!name) throw new Error('Cable type name is required');

    const result = await this.adapter.execute(
      `INSERT INTO cable_types (site_id, name, description)
       VALUES (?, ?, ?)`,
      [site_id, name, description]
    );

    if (!result.insertId) {
      throw new Error('Failed to create cable type');
    }

    const created = await this.findById(Number(result.insertId), site_id);
    if (!created) throw new Error('Failed to load created cable type');
    return created;
  }

  async update(id: number, siteId: number, data: UpdateCableTypeData): Promise<CableType | null> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      const name = (data.name ?? '').toString().trim();
      if (!name) throw new Error('Cable type name is required');
      updates.push('name = ?');
      values.push(name);
    }

    if (data.description !== undefined) {
      updates.push('description = ?');
      values.push(data.description ?? null);
    }

    if (!updates.length) return this.findById(id, siteId);

    values.push(id, siteId);

    const result = await this.adapter.execute(
      `UPDATE cable_types
       SET ${updates.join(', ')}
       WHERE id = ? AND site_id = ?`,
      values
    );

    if (result.affectedRows === 0) return null;
    return this.findById(id, siteId);
  }

  async delete(id: number, siteId: number): Promise<boolean> {
    const result = await this.adapter.execute(
      `DELETE FROM cable_types WHERE id = ? AND site_id = ?`,
      [id, siteId]
    );
    return result.affectedRows > 0;
  }

  async countLabelsUsingType(siteId: number, cableTypeId: number): Promise<number> {
    const rows = await this.adapter.query(
      'SELECT COUNT(*) as count FROM labels WHERE site_id = ? AND cable_type_id = ?',
      [siteId, cableTypeId]
    );
    return Number((rows?.[0] as any)?.count ?? 0);
  }
}

export default CableTypeModel;

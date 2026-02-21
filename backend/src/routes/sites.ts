import { Router, Request, Response } from 'express';
import { z } from 'zod';
import SiteModel from '../models/Site.js';
import SiteLocationModel from '../models/SiteLocation.js';
import { DuplicateSiteLocationCoordsError, SiteLocationInUseError } from '../models/SiteLocation.js';
import CableTypeModel from '../models/CableType.js';
import connection from '../database/connection.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireGlobalRole, requireSiteRole, resolveSiteAccess } from '../middleware/permissions.js';
import { ApiResponse } from '../types/index.js';
import { logActivity } from '../services/ActivityLogService.js';
import {
  buildCableReportDocxBuffer,
  formatDateTimeDDMMYYYY_HHMM,
  formatPrintedDateDDMonYYYY_HHMM,
  formatTimestampYYYYMMDD_HHMMSS,
  type CableReportLocation,
  type CableReportRun,
} from '../utils/cableReportDocx.js';

const router = Router();
const siteModel = new SiteModel();
const siteLocationModel = new SiteLocationModel();
const cableTypeModel = new CableTypeModel();
const getAdapter = () => connection.getAdapter();

// Validation schemas
const createSiteSchema = z.object({
  name: z.string().min(1, 'Site name is required').max(100, 'Site name must be less than 100 characters'),
  code: z.string().min(2, 'Abbreviation is required').max(20, 'Abbreviation must be 20 characters or less'),
  location: z.string().max(200, 'Location must be less than 200 characters').optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
});

const updateSiteSchema = z.object({
  name: z.string().min(1, 'Site name is required').max(100, 'Site name must be less than 100 characters').optional(),
  code: z.string().min(2, 'Abbreviation is required').max(20, 'Abbreviation must be 20 characters or less').optional(),
  location: z.string().max(200, 'Location must be less than 200 characters').optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
});

const getSitesQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
  include_counts: z.enum(['true', 'false']).default('false').optional(),
}).passthrough();

const siteIdSchema = z.object({
  id: z.coerce.number().min(1, 'Invalid site ID'),
});

const locationIdSchema = z.object({
  locationId: z.coerce.number().min(1, 'Invalid location ID'),
});

const cableTypeIdSchema = z.object({
  cableTypeId: z.coerce.number().min(1, 'Invalid cable type ID'),
});

const locationTemplateTypeSchema = z.enum(['DATACENTRE', 'DOMESTIC']);

const createLocationSchema = z
  .object({
    template_type: locationTemplateTypeSchema.default('DATACENTRE').optional(),
    label: z.string().max(255).optional(),
    floor: z.string().min(1, 'Floor is required').max(50),
    suite: z.string().max(50).optional(),
    row: z.string().max(50).optional(),
    rack: z.string().max(50).optional(),
    area: z.string().max(64).optional(),
  })
  .superRefine((data, ctx) => {
    const template = (data.template_type ?? 'DATACENTRE') as 'DATACENTRE' | 'DOMESTIC';

    if (template === 'DATACENTRE') {
      if (!data.suite || data.suite.trim() === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['suite'], message: 'Suite is required' });
      }
      if (!data.row || data.row.trim() === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['row'], message: 'Row is required' });
      }
      if (!data.rack || data.rack.trim() === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rack'], message: 'Rack is required' });
      }
      if (data.area && data.area.trim() !== '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['area'], message: 'Area must be empty for Datacentre/Commercial locations' });
      }
    } else {
      if (!data.area || data.area.trim() === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['area'], message: 'Area is required' });
      }
      if ((data.suite && data.suite.trim() !== '') || (data.row && data.row.trim() !== '') || (data.rack && data.rack.trim() !== '')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'Suite/Row/Rack must be empty for Domestic locations' });
      }
    }
  });

const updateLocationSchema = z
  .object({
    template_type: locationTemplateTypeSchema.optional(),
    label: z.string().max(255).optional().or(z.literal('')),
    floor: z.string().min(1).max(50).optional(),
    suite: z.string().max(50).optional().or(z.literal('')),
    row: z.string().max(50).optional().or(z.literal('')),
    rack: z.string().max(50).optional().or(z.literal('')),
    area: z.string().max(64).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    // Template-specific required-field validation is enforced more strictly on create.
    // For update, we only block obviously invalid mixed-field submissions.
    if (data.template_type === 'DATACENTRE') {
      if (data.area !== undefined && data.area.trim() !== '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['area'], message: 'Area must be empty for Datacentre/Commercial locations' });
      }
    }

    if (data.template_type === 'DOMESTIC') {
      if ((data.suite && data.suite.trim() !== '') || (data.row && data.row.trim() !== '') || (data.rack && data.rack.trim() !== '')) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [], message: 'Suite/Row/Rack must be empty for Domestic locations' });
      }
    }
  });

const deleteLocationQuerySchema = z.object({
  strategy: z.enum(['reassign', 'cascade']).optional(),
  cascade: z.string().optional(),
  target_location_id: z.coerce.number().int().positive().optional(),
}).passthrough();

const reassignAndDeleteSchema = z.object({
  reassign_to_location_id: z.coerce.number().int().positive(),
});

const createCableTypeSchema = z.object({
  name: z.string().min(1, 'Cable type name is required').max(255, 'Cable type name must be less than 255 characters'),
  description: z.string().max(1000, 'Description must be less than 1000 characters').optional(),
});

const updateCableTypeSchema = z.object({
  name: z.string().min(1, 'Cable type name is required').max(255, 'Cable type name must be less than 255 characters').optional(),
  // Frontend may send null to clear description
  description: z.union([
    z.string().max(1000, 'Description must be less than 1000 characters'),
    z.literal(''),
    z.null(),
  ]).optional(),
});

// SID Index schemas
const sidIdSchema = z.object({
  sidId: z.coerce.number().min(1, 'Invalid SID ID'),
});

const getSidsQuerySchema = z
  .object({
    search: z.string().optional(),
    limit: z.coerce.number().min(1).max(1000).default(50).optional(),
    offset: z.coerce.number().min(0).default(0).optional(),
  })
  .passthrough();

const createSidSchema = z.object({
  sid_type_id: z.coerce.number().int().positive().optional().nullable(),
  device_model_id: z.coerce.number().int().positive().optional().nullable(),
  cpu_model_id: z.coerce.number().int().positive().optional().nullable(),
  hostname: z.string().max(255).optional().nullable(),
  serial_number: z.string().max(255).optional().nullable(),
  asset_tag: z.string().max(255).optional().nullable(),
  status: z.string().max(64).optional().nullable(),
  cpu_count: z.coerce.number().int().positive().optional().nullable(),
  cpu_cores: z.coerce.number().int().positive().optional().nullable(),
  cpu_threads: z.coerce.number().int().positive().optional().nullable(),
  ram_gb: z.coerce.number().int().positive().optional().nullable(),
  os_name: z.string().max(255).optional().nullable(),
  os_version: z.string().max(255).optional().nullable(),
  mgmt_ip: z.string().max(64).optional().nullable(),
  mgmt_mac: z.string().max(64).optional().nullable(),
  location_id: z.coerce.number().int().positive().optional().nullable(),
});

const updateSidSchema = createSidSchema.partial();

const createSidNoteSchema = z.object({
  note_text: z.string().min(1, 'Note text is required').max(10000),
  type: z.enum(['NOTE', 'CLOSING']).optional(),
});

const sidNoteIdSchema = z.object({
  noteId: z.coerce.number().min(1, 'Invalid note ID'),
});

const setSidNotePinnedSchema = z.object({
  pinned: z.boolean(),
});

const replaceSidNicsSchema = z.object({
  nics: z
    .array(
      z
        .object({
          name: z.string().min(1).max(255),
          mac_address: z.string().max(64).optional().nullable(),
          ip_address: z.string().max(64).optional().nullable(),
          site_vlan_id: z.coerce.number().int().positive().optional().nullable(),
          switch_sid_id: z.coerce.number().int().positive().optional().nullable(),
          switch_port: z.string().max(255).optional().nullable(),
        })
        .superRefine((val, ctx) => {
          const hasSwitch = Number.isFinite(val.switch_sid_id as any) && (val.switch_sid_id as any) > 0;
          const hasPort = (val.switch_port ?? '').toString().trim() !== '';
          if (hasSwitch !== hasPort) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['switch_port'],
              message: 'Switch and port must be set together',
            });
          }
        })
    )
    .default([]),
});

function isDuplicateKeyError(error: unknown): boolean {
  const anyErr = error as any;
  const code = anyErr?.code || anyErr?.errno;
  return code === 'ER_DUP_ENTRY' || code === 1062;
}

async function assertPicklistRowBelongsToSite(params: {
  adapter: ReturnType<typeof getAdapter>;
  table: 'sid_types' | 'sid_device_models' | 'sid_cpu_models' | 'site_vlans';
  rowId: number;
  siteId: number;
}): Promise<void> {
  const rows = await params.adapter.query(`SELECT id FROM ${params.table} WHERE id = ? AND site_id = ?`, [
    params.rowId,
    params.siteId,
  ]);
  if (!rows.length) {
    throw new Error('Not found');
  }
}

/**
 * GET /api/sites
 * Get all sites for the authenticated user with optional filtering
 */
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
    }

    const queryValidation = getSitesQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: queryValidation.error.errors,
      } as ApiResponse);
    }

    const { search, limit = 50, offset = 0, include_counts = 'false' } = queryValidation.data;

    const isGlobalAdmin = req.user.role === 'GLOBAL_ADMIN';
    let sites: any[] = [];
    let total = 0;

    if (isGlobalAdmin) {
      if (include_counts === 'true') {
        sites = await siteModel.findAllWithLabelCounts({
          ...(search ? { search } : {}),
          limit,
          offset,
        });
      } else {
        sites = await siteModel.findAll({
          ...(search ? { search } : {}),
          limit,
          offset,
        });
      }

      total = await siteModel.countAll(search ?? undefined);
    } else {
      if (include_counts === 'true') {
        sites = await siteModel.findByUserIdWithLabelCounts(req.user.userId, {
          ...(search ? { search } : {}),
          limit,
          offset,
        });
      } else {
        sites = await siteModel.findByUserId(req.user.userId, {
          ...(search ? { search } : {}),
          limit,
          offset,
        });
      }

      total = await siteModel.countByUserId(req.user.userId, search ?? undefined);
    }

    res.json({
      success: true,
      data: {
        sites,
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + limit < total,
        },
      },
    } as ApiResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Get sites error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * GET /api/sites/:id
 * Get a specific site by ID
 */
router.get('/:id', authenticateToken, resolveSiteAccess(req => Number(req.params.id)), async (req: Request, res: Response) => {
  try {
    // Validate site ID
    const { id } = siteIdSchema.parse(req.params);

    // Get site with label count
    const site = await siteModel.findByIdWithLabelCount(id, req.user!.userId);

    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: { site },
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Get site error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * GET /api/sites/:id/sids
 * List SIDs (site-scoped)
 */
router.get(
  '/:id/sids',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  async (req: Request, res: Response) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const queryValidation = getSidsQuerySchema.safeParse(req.query);
      if (!queryValidation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: queryValidation.error.errors,
        } as ApiResponse);
      }

      const { search, limit = 50, offset = 0 } = queryValidation.data;
      const safeLimit = Number.isFinite(limit) ? Math.min(1000, Math.max(1, Math.floor(limit))) : 50;
      const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
      const adapter = getAdapter();

      const where: string[] = ['s.site_id = ?'];
      const params: any[] = [siteId];

      if (search && search.trim() !== '') {
        where.push('(s.sid_number LIKE ? OR s.hostname LIKE ? OR s.serial_number LIKE ? OR s.asset_tag LIKE ?)');
        const pattern = `%${search.trim()}%`;
        params.push(pattern, pattern, pattern, pattern);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const totalRows = await adapter.query(`SELECT COUNT(*) as count FROM sids s ${whereSql}`, params);
      const total = Number(totalRows[0]?.count ?? 0);

      const rows = await adapter.query(
        `SELECT
          s.id,
          s.site_id,
          s.sid_number,
          s.hostname,
          s.serial_number,
          s.asset_tag,
          s.status,
          s.sid_type_id,
          st.name as sid_type_name,
          s.device_model_id,
          dm.name as device_model_name,
          s.cpu_model_id,
          cm.name as cpu_model_name,
          s.created_at,
          s.updated_at
        FROM sids s
        LEFT JOIN sid_types st ON st.id = s.sid_type_id
        LEFT JOIN sid_device_models dm ON dm.id = s.device_model_id
        LEFT JOIN sid_cpu_models cm ON cm.id = s.cpu_model_id
        ${whereSql}
        ORDER BY s.sid_number ASC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      return res.json({
        success: true,
        data: {
          sids: rows,
          pagination: {
            total,
            limit: safeLimit,
            offset: safeOffset,
            has_more: safeOffset + safeLimit < total,
          },
        },
      } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        } as ApiResponse);
      }

      console.error('Get sids error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

/**
 * POST /api/sites/:id/sids
 * Create a SID
 */
router.post(
  '/:id/sids',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const body = createSidSchema.parse(req.body);
      const adapter = getAdapter();

      await adapter.beginTransaction();
      try {
        // Ensure a counter row exists; seed counters from existing data if missing.
        await adapter.execute(
          `INSERT INTO site_counters (site_id, next_ref, next_sid)
           VALUES (
             ?,
             (SELECT COALESCE(MAX(ref_number), 0) + 1 FROM labels WHERE site_id = ?),
             (SELECT COALESCE(MAX(CAST(sid_number AS UNSIGNED)), 0) + 1
              FROM sids
              WHERE site_id = ?
                AND sid_number REGEXP '^[0-9]+$')
           )
           ON DUPLICATE KEY UPDATE next_sid = next_sid`,
          [siteId, siteId, siteId]
        );

        // Lock the counter row to allocate a unique SID number.
        const counterRows = await adapter.query(
          `SELECT next_sid FROM site_counters WHERE site_id = ? FOR UPDATE`,
          [siteId]
        );

        const currentNextSid = counterRows[0]?.next_sid ? Number(counterRows[0].next_sid) : 1;

        const sidNumberToUse = currentNextSid;
        const newNextSid = currentNextSid + 1;

        await adapter.execute(
          `UPDATE site_counters SET next_sid = ? WHERE site_id = ?`,
          [newNextSid, siteId]
        );

        const sidNumber = String(sidNumberToUse);

        const insert = await adapter.execute(
          `INSERT INTO sids (
            site_id, sid_number, sid_type_id, device_model_id, cpu_model_id,
            hostname, serial_number, asset_tag, status,
            cpu_count, cpu_cores, cpu_threads, ram_gb,
            os_name, os_version,
            mgmt_ip, mgmt_mac,
            location_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            siteId,
            sidNumber,
            body.sid_type_id ?? null,
            body.device_model_id ?? null,
            body.cpu_model_id ?? null,
            body.hostname ?? null,
            body.serial_number ?? null,
            body.asset_tag ?? null,
            body.status ?? null,
            body.cpu_count ?? null,
            body.cpu_cores ?? null,
            body.cpu_threads ?? null,
            body.ram_gb ?? null,
            body.os_name ?? null,
            body.os_version ?? null,
            body.mgmt_ip ?? null,
            body.mgmt_mac ?? null,
            body.location_id ?? null,
          ]
        );

        const sidId = Number(insert.insertId ?? adapter.getLastInsertId());
        await adapter.commit();

        try {
          await logActivity({
            actorUserId: req.user!.userId,
            action: 'SID_CREATED',
            summary: `Created SID ${sidNumber}`,
            siteId,
            metadata: { site_id: siteId, sid_id: sidId, sid_number: sidNumber },
          });
        } catch (err) {
          console.warn('⚠️ Failed to log SID create activity:', err);
        }

        return res.status(201).json({
          success: true,
          data: {
            sid: {
              id: sidId,
              site_id: siteId,
              sid_number: sidNumber,
            },
          },
        } as ApiResponse);
      } catch (error) {
        try {
          await adapter.rollback();
        } catch {
          // ignore rollback failures
        }

        if (isDuplicateKeyError(error)) {
          return res.status(409).json({ success: false, error: 'Duplicate SID number' } as ApiResponse);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      console.error('Create sid error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

/**
 * GET /api/sites/:id/sids/:sidId
 * Get a SID with notes and networking
 */
router.get(
  '/:id/sids/:sidId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  async (req: Request, res: Response) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const { sidId } = sidIdSchema.parse(req.params);
      const adapter = getAdapter();

      const sidRows = await adapter.query(
        `SELECT
          s.*, 
          st.name as sid_type_name,
          dm.name as device_model_name,
          cm.name as cpu_model_name,
          sl.floor as location_floor,
          sl.suite as location_suite,
          sl.\`row\` as location_row,
          sl.rack as location_rack,
          sl.area as location_area,
          sl.label as location_label,
          sl.template_type as location_template_type
        FROM sids s
        LEFT JOIN sid_types st ON st.id = s.sid_type_id
        LEFT JOIN sid_device_models dm ON dm.id = s.device_model_id
        LEFT JOIN sid_cpu_models cm ON cm.id = s.cpu_model_id
        LEFT JOIN site_locations sl ON sl.id = s.location_id
        WHERE s.site_id = ? AND s.id = ?`,
        [siteId, sidId]
      );

      if (!sidRows.length) {
        return res.status(404).json({ success: false, error: 'SID not found' } as ApiResponse);
      }

      const notes = await adapter.query(
        `SELECT
          n.id,
          n.sid_id,
          n.created_by,
          u.username as created_by_username,
          u.email as created_by_email,
          n.type,
          n.note_text,
          n.pinned,
          n.pinned_at,
          n.pinned_by,
          n.created_at
        FROM sid_notes n
        JOIN users u ON u.id = n.created_by
        WHERE n.sid_id = ?
        ORDER BY n.pinned DESC, n.pinned_at DESC, n.created_at DESC`,
        [sidId]
      );

      const nics = await adapter.query(
        `SELECT
          n.id,
          n.sid_id,
          n.name,
          n.mac_address,
          n.ip_address,
          n.site_vlan_id,
          v.vlan_id as vlan_id,
          v.name as vlan_name,
          c.switch_sid_id,
          sw.sid_number as switch_sid_number,
          c.switch_port
        FROM sid_nics n
        LEFT JOIN site_vlans v ON v.id = n.site_vlan_id
        LEFT JOIN sid_connections c ON c.nic_id = n.id
        LEFT JOIN sids sw ON sw.id = c.switch_sid_id
        WHERE n.sid_id = ?
        ORDER BY n.name ASC`,
        [sidId]
      );

      return res.json({ success: true, data: { sid: sidRows[0], notes, nics } } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      console.error('Get sid error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

/**
 * PUT /api/sites/:id/sids/:sidId
 * Update SID fields
 */
router.put(
  '/:id/sids/:sidId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const { sidId } = sidIdSchema.parse(req.params);
      const body = updateSidSchema.parse(req.body);
      const adapter = getAdapter();

      const existing = await adapter.query('SELECT id, sid_number FROM sids WHERE id = ? AND site_id = ?', [sidId, siteId]);
      if (!existing.length) {
        return res.status(404).json({ success: false, error: 'SID not found' } as ApiResponse);
      }

      const fields: string[] = [];
      const params: any[] = [];

      for (const [key, value] of Object.entries(body)) {
        if (value === undefined) continue;
        fields.push(`${key} = ?`);
        if (key === 'sid_number' && typeof value === 'string') {
          params.push(value.trim());
        } else {
          params.push(value);
        }
      }

      if (!fields.length) {
        return res.json({ success: true, data: { sid: existing[0] } } as ApiResponse);
      }

      try {
        await adapter.execute(`UPDATE sids SET ${fields.join(', ')} WHERE id = ? AND site_id = ?`, [...params, sidId, siteId]);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({ success: false, error: 'Duplicate SID number' } as ApiResponse);
        }
        throw error;
      }

      try {
        await logActivity({
          actorUserId: req.user!.userId,
          action: 'SID_UPDATED',
          summary: `Updated SID ${existing[0].sid_number}`,
          siteId,
          metadata: { site_id: siteId, sid_id: sidId },
        });
      } catch (err) {
        console.warn('⚠️ Failed to log SID update activity:', err);
      }

      const updated = await adapter.query('SELECT * FROM sids WHERE id = ? AND site_id = ?', [sidId, siteId]);
      return res.json({ success: true, data: { sid: updated[0] } } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      console.error('Update sid error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

/**
 * DELETE /api/sites/:id/sids/:sidId
 */
router.delete(
  '/:id/sids/:sidId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const { sidId } = sidIdSchema.parse(req.params);
      const adapter = getAdapter();

      const existing = await adapter.query('SELECT id, sid_number FROM sids WHERE id = ? AND site_id = ?', [sidId, siteId]);
      if (!existing.length) {
        return res.status(404).json({ success: false, error: 'SID not found' } as ApiResponse);
      }

      await adapter.execute('DELETE FROM sids WHERE id = ? AND site_id = ?', [sidId, siteId]);

      try {
        await logActivity({
          actorUserId: req.user!.userId,
          action: 'SID_DELETED',
          summary: `Deleted SID ${existing[0].sid_number}`,
          siteId,
          metadata: { site_id: siteId, sid_id: sidId, sid_number: existing[0].sid_number },
        });
      } catch (err) {
        console.warn('⚠️ Failed to log SID delete activity:', err);
      }

      return res.json({ success: true, data: { deleted: true } } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      console.error('Delete sid error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

/**
 * POST /api/sites/:id/sids/:sidId/notes
 */
router.post(
  '/:id/sids/:sidId/notes',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  async (req: Request, res: Response) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const { sidId } = sidIdSchema.parse(req.params);
      const body = createSidNoteSchema.parse(req.body);
      const adapter = getAdapter();

      const existing = await adapter.query('SELECT id, sid_number FROM sids WHERE id = ? AND site_id = ?', [sidId, siteId]);
      if (!existing.length) {
        return res.status(404).json({ success: false, error: 'SID not found' } as ApiResponse);
      }

      const type = body.type ?? 'NOTE';

      const insert = await adapter.execute(
        'INSERT INTO sid_notes (sid_id, created_by, type, note_text) VALUES (?, ?, ?, ?)',
        [sidId, req.user!.userId, type, body.note_text]
      );

      const noteId = Number(insert.insertId ?? adapter.getLastInsertId());

      try {
        await logActivity({
          actorUserId: req.user!.userId,
          action: type === 'CLOSING' ? 'SID_CLOSING_NOTE' : 'SID_NOTE_ADDED',
          summary: `${type === 'CLOSING' ? 'Added closing note' : 'Added note'} for SID ${existing[0].sid_number}`,
          siteId,
          metadata: { site_id: siteId, sid_id: sidId, note_id: noteId, note_type: type },
        });
      } catch (err) {
        console.warn('⚠️ Failed to log SID note activity:', err);
      }

      const noteRows = await adapter.query(
        `SELECT n.id, n.sid_id, n.created_by, u.username as created_by_username, u.email as created_by_email, n.type, n.note_text, n.pinned, n.pinned_at, n.pinned_by, n.created_at
         FROM sid_notes n JOIN users u ON u.id = n.created_by
         WHERE n.id = ?`,
        [noteId]
      );

      return res.status(201).json({ success: true, data: { note: noteRows[0] } } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      console.error('Create sid note error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

/**
 * PATCH /api/sites/:id/sids/:sidId/notes/:noteId/pin
 * Pin/unpin a SID note.
 * - Users can pin only their own notes (unless SITE_ADMIN)
 * - Only SITE_ADMIN can unpin
 */
router.patch(
  '/:id/sids/:sidId/notes/:noteId/pin',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  async (req: Request, res: Response) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const { sidId } = sidIdSchema.parse(req.params);
      const { noteId } = sidNoteIdSchema.parse(req.params);
      const body = setSidNotePinnedSchema.parse(req.body);
      const adapter = getAdapter();

      const rows = await adapter.query(
        `SELECT n.id, n.sid_id, n.created_by, n.pinned
         FROM sid_notes n
         JOIN sids s ON s.id = n.sid_id
         WHERE n.id = ? AND n.sid_id = ? AND s.site_id = ?`,
        [noteId, sidId, siteId]
      );

      const note = rows[0] as any;
      if (!note) {
        return res.status(404).json({ success: false, error: 'Note not found' } as ApiResponse);
      }

      const isAdmin = req.siteRole === 'SITE_ADMIN';

      if (body.pinned) {
        if (!isAdmin && Number(note.created_by) !== Number(req.user!.userId)) {
          return res.status(403).json({ success: false, error: 'Insufficient permissions' } as ApiResponse);
        }
      } else {
        if (!isAdmin) {
          return res.status(403).json({ success: false, error: 'Site admin access required' } as ApiResponse);
        }
      }

      if (body.pinned) {
        await adapter.execute(
          `UPDATE sid_notes
           SET pinned = 1, pinned_at = CURRENT_TIMESTAMP(3), pinned_by = ?
           WHERE id = ?`,
          [req.user!.userId, noteId]
        );
      } else {
        await adapter.execute(
          `UPDATE sid_notes
           SET pinned = 0, pinned_at = NULL, pinned_by = NULL
           WHERE id = ?`,
          [noteId]
        );
      }

      const noteRows = await adapter.query(
        `SELECT n.id, n.sid_id, n.created_by, u.username as created_by_username, u.email as created_by_email, n.type, n.note_text, n.pinned, n.pinned_at, n.pinned_by, n.created_at
         FROM sid_notes n
         JOIN users u ON u.id = n.created_by
         WHERE n.id = ?`,
        [noteId]
      );

      return res.json({ success: true, data: { note: noteRows[0] } } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      console.error('Set sid note pinned error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

/**
 * PUT /api/sites/:id/sids/:sidId/nics
 * Replace NIC list (and switch connections)
 */
router.put(
  '/:id/sids/:sidId/nics',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req: Request, res: Response) => {
    const adapter = getAdapter();
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const { sidId } = sidIdSchema.parse(req.params);
      const body = replaceSidNicsSchema.parse(req.body);

      const existing = await adapter.query('SELECT id FROM sids WHERE id = ? AND site_id = ?', [sidId, siteId]);
      if (!existing.length) {
        return res.status(404).json({ success: false, error: 'SID not found' } as ApiResponse);
      }

      // Validate referenced switch SIDs belong to the same site
      const switchIds = Array.from(
        new Set(
          body.nics
            .map(n => n.switch_sid_id)
            .filter((v): v is number => Number.isFinite(v as any) && (v as any) > 0)
        )
      );
      if (switchIds.length) {
        const rows = await adapter.query(
          `SELECT id FROM sids WHERE site_id = ? AND id IN (${switchIds.map(() => '?').join(',')})`,
          [siteId, ...switchIds]
        );
        const found = new Set(rows.map((r: any) => Number(r.id)));
        const missing = switchIds.filter(id => !found.has(id));
        if (missing.length) {
          return res.status(400).json({ success: false, error: 'Invalid switch SID', details: { missing } } as ApiResponse);
        }
      }

      await adapter.beginTransaction();
      try {
        // Remove old connections and nics
        await adapter.execute('DELETE FROM sid_connections WHERE sid_id = ? AND site_id = ?', [sidId, siteId]);
        await adapter.execute('DELETE FROM sid_nics WHERE sid_id = ?', [sidId]);

        for (const nic of body.nics) {
          const inserted = await adapter.execute(
            'INSERT INTO sid_nics (sid_id, name, mac_address, ip_address, site_vlan_id) VALUES (?, ?, ?, ?, ?)',
            [sidId, nic.name, nic.mac_address ?? null, nic.ip_address ?? null, nic.site_vlan_id ?? null]
          );
          const nicId = Number(inserted.insertId ?? adapter.getLastInsertId());

          if (nic.switch_sid_id && nic.switch_port) {
            const port = nic.switch_port.trim();
            if (port) {
              try {
                await adapter.execute(
                  'INSERT INTO sid_connections (site_id, sid_id, nic_id, switch_sid_id, switch_port) VALUES (?, ?, ?, ?, ?)',
                  [siteId, sidId, nicId, nic.switch_sid_id, port]
                );
              } catch (error) {
                if (isDuplicateKeyError(error)) {
                  const err: any = new Error('SWITCH_PORT_IN_USE');
                  err.kind = 'SWITCH_PORT_IN_USE';
                  err.details = { switch_sid_id: nic.switch_sid_id, switch_port: port };
                  throw err;
                }
                throw error;
              }
            }
          }
        }

        await adapter.commit();
      } catch (error) {
        await adapter.rollback();
        if ((error as any)?.kind === 'SWITCH_PORT_IN_USE') {
          return res.status(409).json({
            success: false,
            error: 'Switch port already in use',
            code: 'SWITCH_PORT_IN_USE',
            details: (error as any).details,
          } as any);
        }
        throw error;
      }

      const nics = await adapter.query(
        `SELECT
          n.id,
          n.sid_id,
          n.name,
          n.mac_address,
          n.ip_address,
          n.site_vlan_id,
          v.vlan_id as vlan_id,
          v.name as vlan_name,
          c.switch_sid_id,
          sw.sid_number as switch_sid_number,
          c.switch_port
        FROM sid_nics n
        LEFT JOIN site_vlans v ON v.id = n.site_vlan_id
        LEFT JOIN sid_connections c ON c.nic_id = n.id
        LEFT JOIN sids sw ON sw.id = c.switch_sid_id
        WHERE n.sid_id = ?
        ORDER BY n.name ASC`,
        [sidId]
      );

      return res.json({ success: true, data: { nics } } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      console.error('Replace sid nics error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

// --- SID picklists (site-admin) ---
const createPicklistSchema = z.object({
  name: z.string().min(1).max(255),
  manufacturer: z.string().max(255).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
});
const updatePicklistSchema = createPicklistSchema.partial();

const createVlanSchema = z.object({
  vlan_id: z.coerce.number().int().min(1).max(4094),
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional().nullable(),
});
const updateVlanSchema = createVlanSchema.partial();

router.get(
  '/:id/sid/types',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const rows = await getAdapter().query('SELECT * FROM sid_types WHERE site_id = ? ORDER BY name ASC', [siteId]);
      return res.json({ success: true, data: { sid_types: rows } } as ApiResponse);
    } catch (error) {
      console.error('Get sid types error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

router.post(
  '/:id/sid/types',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const body = createPicklistSchema.parse(req.body);
      try {
        const insert = await getAdapter().execute(
          'INSERT INTO sid_types (site_id, name, description) VALUES (?, ?, ?)',
          [siteId, body.name.trim(), body.description ?? null]
        );
        const id = Number(insert.insertId ?? getAdapter().getLastInsertId());
        const rows = await getAdapter().query('SELECT * FROM sid_types WHERE id = ?', [id]);
        return res.status(201).json({ success: true, data: { sid_type: rows[0] } } as ApiResponse);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({ success: false, error: 'Duplicate name' } as ApiResponse);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      console.error('Create sid type error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

router.put(
  '/:id/sid/types/:rowId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const rowId = Number(req.params.rowId);
      const body = updatePicklistSchema.parse(req.body);
      await assertPicklistRowBelongsToSite({ adapter: getAdapter(), table: 'sid_types', rowId, siteId });

      const fields: string[] = [];
      const params: any[] = [];
      if (body.name !== undefined) {
        fields.push('name = ?');
        params.push(body.name.trim());
      }
      if (body.description !== undefined) {
        fields.push('description = ?');
        params.push(body.description ?? null);
      }
      if (!fields.length) {
        const rows = await getAdapter().query('SELECT * FROM sid_types WHERE id = ?', [rowId]);
        return res.json({ success: true, data: { sid_type: rows[0] } } as ApiResponse);
      }

      try {
        await getAdapter().execute(`UPDATE sid_types SET ${fields.join(', ')} WHERE id = ? AND site_id = ?`, [...params, rowId, siteId]);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({ success: false, error: 'Duplicate name' } as ApiResponse);
        }
        throw error;
      }
      const rows = await getAdapter().query('SELECT * FROM sid_types WHERE id = ?', [rowId]);
      return res.json({ success: true, data: { sid_type: rows[0] } } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      if (error instanceof Error && error.message === 'Not found') {
        return res.status(404).json({ success: false, error: 'Not found' } as ApiResponse);
      }
      console.error('Update sid type error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

router.delete(
  '/:id/sid/types/:rowId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const rowId = Number(req.params.rowId);
      await assertPicklistRowBelongsToSite({ adapter: getAdapter(), table: 'sid_types', rowId, siteId });
      await getAdapter().execute('DELETE FROM sid_types WHERE id = ? AND site_id = ?', [rowId, siteId]);
      return res.json({ success: true, data: { deleted: true } } as ApiResponse);
    } catch (error) {
      if (error instanceof Error && error.message === 'Not found') {
        return res.status(404).json({ success: false, error: 'Not found' } as ApiResponse);
      }
      console.error('Delete sid type error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

// Device models
router.get(
  '/:id/sid/device-models',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const rows = await getAdapter().query('SELECT * FROM sid_device_models WHERE site_id = ? ORDER BY name ASC', [siteId]);
      return res.json({ success: true, data: { device_models: rows } } as ApiResponse);
    } catch (error) {
      console.error('Get device models error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

router.post(
  '/:id/sid/device-models',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const body = createPicklistSchema.parse(req.body);
      try {
        const insert = await getAdapter().execute(
          'INSERT INTO sid_device_models (site_id, manufacturer, name, description) VALUES (?, ?, ?, ?)',
          [siteId, body.manufacturer ?? null, body.name.trim(), body.description ?? null]
        );
        const id = Number(insert.insertId ?? getAdapter().getLastInsertId());
        const rows = await getAdapter().query('SELECT * FROM sid_device_models WHERE id = ?', [id]);
        return res.status(201).json({ success: true, data: { device_model: rows[0] } } as ApiResponse);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({ success: false, error: 'Duplicate name' } as ApiResponse);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      console.error('Create device model error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

router.put(
  '/:id/sid/device-models/:rowId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const rowId = Number(req.params.rowId);
      const body = updatePicklistSchema.parse(req.body);
      await assertPicklistRowBelongsToSite({ adapter: getAdapter(), table: 'sid_device_models', rowId, siteId });

      const fields: string[] = [];
      const params: any[] = [];
      if (body.manufacturer !== undefined) {
        fields.push('manufacturer = ?');
        params.push(body.manufacturer ?? null);
      }
      if (body.name !== undefined) {
        fields.push('name = ?');
        params.push(body.name.trim());
      }
      if (body.description !== undefined) {
        fields.push('description = ?');
        params.push(body.description ?? null);
      }
      if (!fields.length) {
        const rows = await getAdapter().query('SELECT * FROM sid_device_models WHERE id = ?', [rowId]);
        return res.json({ success: true, data: { device_model: rows[0] } } as ApiResponse);
      }

      try {
        await getAdapter().execute(
          `UPDATE sid_device_models SET ${fields.join(', ')} WHERE id = ? AND site_id = ?`,
          [...params, rowId, siteId]
        );
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({ success: false, error: 'Duplicate name' } as ApiResponse);
        }
        throw error;
      }
      const rows = await getAdapter().query('SELECT * FROM sid_device_models WHERE id = ?', [rowId]);
      return res.json({ success: true, data: { device_model: rows[0] } } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      if (error instanceof Error && error.message === 'Not found') {
        return res.status(404).json({ success: false, error: 'Not found' } as ApiResponse);
      }
      console.error('Update device model error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

router.delete(
  '/:id/sid/device-models/:rowId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const rowId = Number(req.params.rowId);
      await assertPicklistRowBelongsToSite({ adapter: getAdapter(), table: 'sid_device_models', rowId, siteId });
      await getAdapter().execute('DELETE FROM sid_device_models WHERE id = ? AND site_id = ?', [rowId, siteId]);
      return res.json({ success: true, data: { deleted: true } } as ApiResponse);
    } catch (error) {
      if (error instanceof Error && error.message === 'Not found') {
        return res.status(404).json({ success: false, error: 'Not found' } as ApiResponse);
      }
      console.error('Delete device model error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

// CPU models
router.get(
  '/:id/sid/cpu-models',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const rows = await getAdapter().query('SELECT * FROM sid_cpu_models WHERE site_id = ? ORDER BY name ASC', [siteId]);
      return res.json({ success: true, data: { cpu_models: rows } } as ApiResponse);
    } catch (error) {
      console.error('Get cpu models error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

router.post(
  '/:id/sid/cpu-models',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const body = createPicklistSchema.parse(req.body);
      try {
        const insert = await getAdapter().execute(
          'INSERT INTO sid_cpu_models (site_id, manufacturer, name, description) VALUES (?, ?, ?, ?)',
          [siteId, body.manufacturer ?? null, body.name.trim(), body.description ?? null]
        );
        const id = Number(insert.insertId ?? getAdapter().getLastInsertId());
        const rows = await getAdapter().query('SELECT * FROM sid_cpu_models WHERE id = ?', [id]);
        return res.status(201).json({ success: true, data: { cpu_model: rows[0] } } as ApiResponse);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({ success: false, error: 'Duplicate name' } as ApiResponse);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      console.error('Create cpu model error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

router.put(
  '/:id/sid/cpu-models/:rowId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const rowId = Number(req.params.rowId);
      const body = updatePicklistSchema.parse(req.body);
      await assertPicklistRowBelongsToSite({ adapter: getAdapter(), table: 'sid_cpu_models', rowId, siteId });

      const fields: string[] = [];
      const params: any[] = [];
      if (body.manufacturer !== undefined) {
        fields.push('manufacturer = ?');
        params.push(body.manufacturer ?? null);
      }
      if (body.name !== undefined) {
        fields.push('name = ?');
        params.push(body.name.trim());
      }
      if (body.description !== undefined) {
        fields.push('description = ?');
        params.push(body.description ?? null);
      }
      if (!fields.length) {
        const rows = await getAdapter().query('SELECT * FROM sid_cpu_models WHERE id = ?', [rowId]);
        return res.json({ success: true, data: { cpu_model: rows[0] } } as ApiResponse);
      }

      try {
        await getAdapter().execute(
          `UPDATE sid_cpu_models SET ${fields.join(', ')} WHERE id = ? AND site_id = ?`,
          [...params, rowId, siteId]
        );
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({ success: false, error: 'Duplicate name' } as ApiResponse);
        }
        throw error;
      }
      const rows = await getAdapter().query('SELECT * FROM sid_cpu_models WHERE id = ?', [rowId]);
      return res.json({ success: true, data: { cpu_model: rows[0] } } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      if (error instanceof Error && error.message === 'Not found') {
        return res.status(404).json({ success: false, error: 'Not found' } as ApiResponse);
      }
      console.error('Update cpu model error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

router.delete(
  '/:id/sid/cpu-models/:rowId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const rowId = Number(req.params.rowId);
      await assertPicklistRowBelongsToSite({ adapter: getAdapter(), table: 'sid_cpu_models', rowId, siteId });
      await getAdapter().execute('DELETE FROM sid_cpu_models WHERE id = ? AND site_id = ?', [rowId, siteId]);
      return res.json({ success: true, data: { deleted: true } } as ApiResponse);
    } catch (error) {
      if (error instanceof Error && error.message === 'Not found') {
        return res.status(404).json({ success: false, error: 'Not found' } as ApiResponse);
      }
      console.error('Delete cpu model error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

// VLANs
router.get(
  '/:id/sid/vlans',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const rows = await getAdapter().query('SELECT * FROM site_vlans WHERE site_id = ? ORDER BY vlan_id ASC', [siteId]);
      return res.json({ success: true, data: { vlans: rows } } as ApiResponse);
    } catch (error) {
      console.error('Get VLANs error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

router.post(
  '/:id/sid/vlans',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const body = createVlanSchema.parse(req.body);
      try {
        const insert = await getAdapter().execute(
          'INSERT INTO site_vlans (site_id, vlan_id, name, description) VALUES (?, ?, ?, ?)',
          [siteId, body.vlan_id, body.name.trim(), body.description ?? null]
        );
        const id = Number(insert.insertId ?? getAdapter().getLastInsertId());
        const rows = await getAdapter().query('SELECT * FROM site_vlans WHERE id = ?', [id]);
        return res.status(201).json({ success: true, data: { vlan: rows[0] } } as ApiResponse);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({ success: false, error: 'Duplicate VLAN ID' } as ApiResponse);
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      console.error('Create VLAN error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

router.put(
  '/:id/sid/vlans/:rowId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const rowId = Number(req.params.rowId);
      const body = updateVlanSchema.parse(req.body);
      await assertPicklistRowBelongsToSite({ adapter: getAdapter(), table: 'site_vlans', rowId, siteId });

      const fields: string[] = [];
      const params: any[] = [];
      if (body.vlan_id !== undefined) {
        fields.push('vlan_id = ?');
        params.push(body.vlan_id);
      }
      if (body.name !== undefined) {
        fields.push('name = ?');
        params.push(body.name.trim());
      }
      if (body.description !== undefined) {
        fields.push('description = ?');
        params.push(body.description ?? null);
      }
      if (!fields.length) {
        const rows = await getAdapter().query('SELECT * FROM site_vlans WHERE id = ?', [rowId]);
        return res.json({ success: true, data: { vlan: rows[0] } } as ApiResponse);
      }

      try {
        await getAdapter().execute(`UPDATE site_vlans SET ${fields.join(', ')} WHERE id = ? AND site_id = ?`, [
          ...params,
          rowId,
          siteId,
        ]);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return res.status(409).json({ success: false, error: 'Duplicate VLAN ID' } as ApiResponse);
        }
        throw error;
      }
      const rows = await getAdapter().query('SELECT * FROM site_vlans WHERE id = ?', [rowId]);
      return res.json({ success: true, data: { vlan: rows[0] } } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors } as ApiResponse);
      }
      if (error instanceof Error && error.message === 'Not found') {
        return res.status(404).json({ success: false, error: 'Not found' } as ApiResponse);
      }
      console.error('Update VLAN error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

router.delete(
  '/:id/sid/vlans/:rowId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req, res) => {
    try {
      const { id: siteId } = siteIdSchema.parse(req.params);
      const rowId = Number(req.params.rowId);
      await assertPicklistRowBelongsToSite({ adapter: getAdapter(), table: 'site_vlans', rowId, siteId });
      await getAdapter().execute('DELETE FROM site_vlans WHERE id = ? AND site_id = ?', [rowId, siteId]);
      return res.json({ success: true, data: { deleted: true } } as ApiResponse);
    } catch (error) {
      if (error instanceof Error && error.message === 'Not found') {
        return res.status(404).json({ success: false, error: 'Not found' } as ApiResponse);
      }
      console.error('Delete VLAN error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' } as ApiResponse);
    }
  }
);

/**
 * POST /api/sites
 * Create a new site
 */
router.post('/', authenticateToken, requireGlobalRole('GLOBAL_ADMIN'), async (req: Request, res: Response) => {
  try {
    // Validate request body
    const siteDataParsed = createSiteSchema.parse(req.body);
    const code = siteDataParsed.code.toUpperCase().trim();
    const siteData = {
      name: siteDataParsed.name,
      code,
      ...(siteDataParsed.location ? { location: siteDataParsed.location } : {}),
      ...(siteDataParsed.description ? { description: siteDataParsed.description } : {}),
    };

    // Create site
    const site = await siteModel.create({
      ...siteData,
      created_by: req.user!.userId,
    });

    try {
      await logActivity({
        actorUserId: req.user!.userId,
        action: 'SITE_CREATED',
        summary: `Created site ${site.name} (${site.code})`,
        siteId: Number(site.id),
        metadata: {
          site_id: Number(site.id),
          name: site.name,
          code: site.code,
        },
      });
    } catch (error) {
      console.warn('⚠️ Failed to log site create activity:', error);
    }

    res.status(201).json({
      success: true,
      data: { site },
      message: 'Site created successfully',
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Create site error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});


/**
 * PUT /api/sites/:id
 * Update an existing site
 */
router.put('/:id', authenticateToken, resolveSiteAccess(req => Number(req.params.id)), requireSiteRole('SITE_ADMIN'), async (req: Request, res: Response) => {
  try {
    // Validate site ID and request body
    const { id } = siteIdSchema.parse(req.params);
    const siteDataParsed = updateSiteSchema.parse(req.body);
    const siteData = {
      ...(siteDataParsed.name !== undefined ? { name: siteDataParsed.name } : {}),
      ...(siteDataParsed.code !== undefined ? { code: siteDataParsed.code.toUpperCase() } : {}),
      ...(siteDataParsed.location !== undefined ? { location: siteDataParsed.location } : {}),
      ...(siteDataParsed.description !== undefined ? { description: siteDataParsed.description } : {}),
    };

    // Update site
    const site = await siteModel.update(id, req.user!.userId, siteData);

    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'Site not found or no changes made',
      } as ApiResponse);
    }

    try {
      await logActivity({
        actorUserId: req.user!.userId,
        action: 'SITE_UPDATED',
        summary: `Updated site ${site.name} (${String(site.code || '').toUpperCase()})`,
        siteId: id,
        metadata: {
          site_id: id,
          changes: siteData,
        },
      });
    } catch (error) {
      console.warn('⚠️ Failed to log site update activity:', error);
    }

    res.json({
      success: true,
      data: { site },
      message: 'Site updated successfully',
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Update site error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * GET /api/sites/:id/locations
 * List all structured locations for a site
 */
router.get('/:id/locations', authenticateToken, resolveSiteAccess(req => Number(req.params.id)), async (req: Request, res: Response) => {
  try {
    const { id } = siteIdSchema.parse(req.params);
    const locations = await siteLocationModel.listBySiteId(id);

    res.json({
      success: true,
      data: { locations },
    } as ApiResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('List site locations error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * POST /api/sites/:id/locations
 * Create a structured location for a site (site admins only)
 */
router.post('/:id/locations', authenticateToken, resolveSiteAccess(req => Number(req.params.id)), requireSiteRole('SITE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = siteIdSchema.parse(req.params);
    const dataParsed = createLocationSchema.parse(req.body);

    const site = await siteModel.findById(id);
    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
      } as ApiResponse);
    }

    const labelTrimmed = (dataParsed.label ?? '').toString().trim();
    const label = labelTrimmed !== '' ? labelTrimmed : null;

    const template_type = (dataParsed.template_type ?? 'DATACENTRE') as 'DATACENTRE' | 'DOMESTIC';

    const baseCreate = {
      site_id: id,
      template_type,
      floor: dataParsed.floor,
      ...(label !== null ? { label } : {}),
    };

    const location = await siteLocationModel.create(
      template_type === 'DOMESTIC'
        ? {
          ...baseCreate,
          area: (dataParsed.area ?? '').toString().trim(),
        }
        : {
          ...baseCreate,
          suite: (dataParsed.suite ?? '').toString().trim(),
          row: (dataParsed.row ?? '').toString().trim(),
          rack: (dataParsed.rack ?? '').toString().trim(),
        }
    );

    try {
      const displayLabel = (location as any).effective_label ?? (location as any).label ?? site.code;
      await logActivity({
        actorUserId: req.user!.userId,
        siteId: id,
        action: 'LOCATION_CREATED',
        summary: `Created location ${displayLabel} on site ${site.name}`,
        metadata: {
          site_id: id,
          location_id: location.id,
          effective_label: (location as any).effective_label,
          label: (location as any).label,
          floor: (location as any).floor,
          suite: (location as any).suite,
          row: (location as any).row,
          rack: (location as any).rack,
          area: (location as any).area,
          template_type: (location as any).template_type,
        },
      });
    } catch (error) {
      console.warn('⚠️ Failed to log location create activity:', error);
    }

    res.status(201).json({
      success: true,
      data: { location },
      message: 'Location created successfully',
    } as ApiResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    if (error instanceof DuplicateSiteLocationCoordsError) {
      const existing = error.existing;
      const extra = existing?.id
        ? ` (existing ID ${existing.id}${existing.effective_label ? `, Label ${existing.effective_label}` : ''})`
        : '';

      return res.status(409).json({
        success: false,
        error: `A location with the same Floor/Suite/Row/Rack already exists for this site${extra}. Update the existing location instead of creating a duplicate.`,
        data: existing ? { existing } : undefined,
      } as ApiResponse);
    }

    if (error instanceof Error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      } as ApiResponse);
    }

    console.error('Create site location error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * PUT /api/sites/:id/locations/:locationId
 * Update a structured location (site admins only)
 */
router.put('/:id/locations/:locationId', authenticateToken, resolveSiteAccess(req => Number(req.params.id)), requireSiteRole('SITE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = siteIdSchema.parse(req.params);
    const { locationId } = locationIdSchema.parse(req.params);
    const dataParsed = updateLocationSchema.parse(req.body);

    let labelUpdate: string | null | undefined;
    if (dataParsed.label !== undefined) {
      const labelTrimmed = (dataParsed.label ?? '').toString().trim();
      labelUpdate = labelTrimmed !== '' ? labelTrimmed : null;
    }

    let areaUpdate: string | null | undefined;
    if (dataParsed.area !== undefined) {
      const areaTrimmed = (dataParsed.area ?? '').toString().trim();
      areaUpdate = areaTrimmed !== '' ? areaTrimmed : null;
    }

    let suiteUpdate: string | null | undefined;
    if (dataParsed.suite !== undefined) {
      const suiteTrimmed = (dataParsed.suite ?? '').toString().trim();
      suiteUpdate = suiteTrimmed !== '' ? suiteTrimmed : null;
    }

    let rowUpdate: string | null | undefined;
    if (dataParsed.row !== undefined) {
      const rowTrimmed = (dataParsed.row ?? '').toString().trim();
      rowUpdate = rowTrimmed !== '' ? rowTrimmed : null;
    }

    let rackUpdate: string | null | undefined;
    if (dataParsed.rack !== undefined) {
      const rackTrimmed = (dataParsed.rack ?? '').toString().trim();
      rackUpdate = rackTrimmed !== '' ? rackTrimmed : null;
    }

    const location = await siteLocationModel.update(locationId, id, {
      ...(dataParsed.template_type !== undefined ? { template_type: dataParsed.template_type } : {}),
      ...(dataParsed.floor !== undefined ? { floor: dataParsed.floor } : {}),
      ...(suiteUpdate !== undefined ? { suite: suiteUpdate } : {}),
      ...(rowUpdate !== undefined ? { row: rowUpdate } : {}),
      ...(rackUpdate !== undefined ? { rack: rackUpdate } : {}),
      ...(areaUpdate !== undefined ? { area: areaUpdate } : {}),
      ...(labelUpdate !== undefined ? { label: labelUpdate } : {}),
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        error: 'Location not found',
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: { location },
      message: 'Location updated successfully',
    } as ApiResponse);

    try {
      const displayLabel = (location as any).effective_label ?? (location as any).label ?? req.site?.code ?? id;
      await logActivity({
        actorUserId: req.user!.userId,
        siteId: id,
        action: 'LOCATION_UPDATED',
        summary: `Updated location ${displayLabel} on site ${req.site?.name ?? id}`,
        metadata: {
          site_id: id,
          location_id: location.id,
          effective_label: (location as any).effective_label,
          label: (location as any).label,
        },
      });
    } catch (error) {
      console.warn('⚠️ Failed to log location update activity:', error);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    if (error instanceof Error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      } as ApiResponse);
    }

    console.error('Update site location error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * GET /api/sites/:id/locations/:locationId/usage
 * Return label usage counts for a location (site admins only)
 */
router.get(
  '/:id/locations/:locationId/usage',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { id } = siteIdSchema.parse(req.params);
      const { locationId } = locationIdSchema.parse(req.params);

      const usage = await siteLocationModel.getLabelUsageCounts(id, locationId);
      return res.json({
        success: true,
        data: {
          usage: {
            source_count: usage.source,
            destination_count: usage.destination,
            total_in_use: usage.source + usage.destination,
          },
        },
      } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        } as ApiResponse);
      }

      console.error('Get site location usage error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      } as ApiResponse);
    }
  }
);

/**
 * DELETE /api/sites/:id/locations/:locationId
 * Delete a structured location (site admins only)
 */
router.delete('/:id/locations/:locationId', authenticateToken, resolveSiteAccess(req => Number(req.params.id)), requireSiteRole('SITE_ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = siteIdSchema.parse(req.params);
    const { locationId } = locationIdSchema.parse(req.params);

    let locationForLog: any = null;
    try {
      locationForLog = await siteLocationModel.findById(locationId, id);
    } catch {
      // ignore
    }

    const queryValidation = deleteLocationQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: queryValidation.error.errors,
      } as ApiResponse);
    }

    const { strategy: strategyParam, cascade, target_location_id } = queryValidation.data;
    const legacyCascade = String(cascade || '').toLowerCase() === 'true';

    const strategy = legacyCascade
      ? 'cascade'
      : strategyParam === 'reassign'
        ? 'reassign'
        : strategyParam === 'cascade'
          ? 'cascade'
          : 'auto';

    const result = await siteLocationModel.deleteWithStrategy(locationId, id, {
      strategy,
      ...(target_location_id !== undefined ? { target_location_id } : {}),
    });

    if (!result.deleted) {
      return res.status(404).json({
        success: false,
        error: 'Location not found',
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: {
        strategy: result.strategyUsed === 'none' ? 'auto' : result.strategyUsed,
        usage: {
          source_count: result.usage.source,
          destination_count: result.usage.destination,
          total_in_use: result.usage.source + result.usage.destination,
        },
        labels_deleted: result.labelsDeleted,
        labels_reassigned_source: result.labelsReassignedSource,
        labels_reassigned_destination: result.labelsReassignedDestination,
      },
      message: 'Location deleted successfully',
    } as ApiResponse);

    try {
      const displayLabel = locationForLog?.effective_label ?? locationForLog?.label ?? req.site?.code ?? id;
      await logActivity({
        actorUserId: req.user!.userId,
        siteId: id,
        action: 'LOCATION_DELETED',
        summary: `Deleted location ${displayLabel} on site ${req.site?.name ?? id}`,
        metadata: {
          site_id: id,
          location_id: locationId,
          effective_label: locationForLog?.effective_label,
          label: locationForLog?.label,
          strategy: result.strategyUsed,
          labels_deleted: result.labelsDeleted,
          labels_reassigned_source: result.labelsReassignedSource,
          labels_reassigned_destination: result.labelsReassignedDestination,
        },
      });
    } catch (error) {
      console.warn('⚠️ Failed to log location delete activity:', error);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    if (error instanceof SiteLocationInUseError) {
      return res.status(409).json({
        success: false,
        error: error.message,
        data: {
          usage: {
            source_count: error.usage.source,
            destination_count: error.usage.destination,
            total_in_use: error.usage.source + error.usage.destination,
          },
        },
      } as ApiResponse);
    }

    if (error instanceof Error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      } as ApiResponse);
    }

    console.error('Delete site location error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * POST /api/sites/:id/locations/:locationId/reassign-and-delete
 * Reassign all labels referencing this location (as source or destination) to another location, then delete it.
 */
router.post(
  '/:id/locations/:locationId/reassign-and-delete',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { id } = siteIdSchema.parse(req.params);
      const { locationId } = locationIdSchema.parse(req.params);
      const body = reassignAndDeleteSchema.parse(req.body);

      let fromLocationLabel: string | null = null;
      let toLocationLabel: string | null = null;
      try {
        const [fromLocation, toLocation] = await Promise.all([
          siteLocationModel.findById(locationId, id),
          siteLocationModel.findById(body.reassign_to_location_id, id),
        ]);
        fromLocationLabel = fromLocation ? String((fromLocation as any).effective_label ?? (fromLocation as any).label ?? fromLocation.id) : null;
        toLocationLabel = toLocation ? String((toLocation as any).effective_label ?? (toLocation as any).label ?? toLocation.id) : null;
      } catch {
        // Best-effort only
      }

      const result = await siteLocationModel.deleteWithStrategy(locationId, id, {
        strategy: 'reassign',
        target_location_id: body.reassign_to_location_id,
      });

      if (!result.deleted) {
        return res.status(404).json({
          success: false,
          error: 'Location not found',
        } as ApiResponse);
      }

      try {
        const fromText = fromLocationLabel ? fromLocationLabel : `#${locationId}`;
        const toText = toLocationLabel ? toLocationLabel : `#${body.reassign_to_location_id}`;
        await logActivity({
          actorUserId: req.user!.userId,
          action: 'LOCATION_REASSIGNED_AND_DELETED',
          summary: `Reassigned labels from ${fromText} to ${toText} and deleted ${fromText}`,
          siteId: id,
          metadata: {
            from_location_id: locationId,
            to_location_id: body.reassign_to_location_id,
            usage: result.usage,
            labels_reassigned_source: result.labelsReassignedSource,
            labels_reassigned_destination: result.labelsReassignedDestination,
          },
        });
      } catch (error) {
        console.warn('⚠️ Failed to log location reassign+delete activity:', error);
      }

      return res.json({
        success: true,
        data: {
          usage: result.usage,
          labels_reassigned_source: result.labelsReassignedSource,
          labels_reassigned_destination: result.labelsReassignedDestination,
        },
        message: 'Location reassigned and deleted successfully',
      } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        } as ApiResponse);
      }

      if (error instanceof SiteLocationInUseError) {
        return res.status(409).json({
          success: false,
          error: error.message,
          data: {
            usage: {
              source_count: error.usage.source,
              destination_count: error.usage.destination,
              total_in_use: error.usage.source + error.usage.destination,
            },
          },
        } as ApiResponse);
      }

      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
      }

      console.error('Reassign and delete site location error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      } as ApiResponse);
    }
  }
);

/**
 * GET /api/sites/:id/cable-types
 * List cable types for a site
 */
router.get(
  '/:id/cable-types',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  async (req: Request, res: Response) => {
    try {
      const { id } = siteIdSchema.parse(req.params);
      const cable_types = await cableTypeModel.listBySiteId(id);

      return res.json({
        success: true,
        data: { cable_types },
      } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        } as ApiResponse);
      }

      console.error('List cable types error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      } as ApiResponse);
    }
  }
);

/**
 * GET /api/sites/:id/cable-types/:cableTypeId/usage
 * Return usage count for a cable type (site admins only)
 */
router.get(
  '/:id/cable-types/:cableTypeId/usage',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { id } = siteIdSchema.parse(req.params);
      const { cableTypeId } = cableTypeIdSchema.parse(req.params);

      const cableType = await cableTypeModel.findById(cableTypeId, id);
      if (!cableType) {
        return res.status(404).json({
          success: false,
          error: 'Cable type not found',
        } as ApiResponse);
      }

      const inUseCount = await cableTypeModel.countLabelsUsingType(id, cableTypeId);
      return res.json({
        success: true,
        data: {
          usage: {
            cables_using_type: inUseCount,
          },
        },
      } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        } as ApiResponse);
      }

      console.error('Cable type usage error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      } as ApiResponse);
    }
  }
);

/**
 * GET /api/sites/:id/cable-report
 * Download a Word document containing a printable cable report for the site.
 */
router.get(
  '/:id/cable-report',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  async (req: Request, res: Response) => {
    try {
      const { id } = siteIdSchema.parse(req.params);

      const siteName = String(req.site?.name ?? '').trim();
      const siteCode = String(req.site?.code ?? '').trim().toUpperCase();
      const siteLocation = String((req.site as any)?.location ?? '').trim();
      const siteDescription = String(req.site?.description ?? '').trim();
      if (!siteName || !siteCode) {
        return res.status(500).json({
          success: false,
          error: 'Failed to resolve site details',
        } as ApiResponse);
      }

      const createdAt = new Date();

      const [locationsRaw, cableTypesRaw, runsRaw] = await Promise.all([
        siteLocationModel.listBySiteId(id),
        cableTypeModel.listBySiteId(id),
        getAdapter().query(
          `SELECT
             l.ref_number,
             l.created_at,
             l.payload_json,
             u.username AS created_by_username,
             u.email AS created_by_email,
             ct.name AS cable_type_name,
             COALESCE(NULLIF(TRIM(sls.label), ''), s.code) AS source_name,
             sls.template_type AS source_template_type,
             sls.floor AS source_floor,
             sls.suite AS source_suite,
             sls.\`row\` AS source_row,
             sls.rack AS source_rack,
             sls.area AS source_area,
             COALESCE(NULLIF(TRIM(sld.label), ''), s.code) AS dest_name,
             sld.template_type AS dest_template_type,
             sld.floor AS dest_floor,
             sld.suite AS dest_suite,
             sld.\`row\` AS dest_row,
             sld.rack AS dest_rack
             , sld.area AS dest_area
           FROM labels l
           JOIN sites s ON s.id = l.site_id
           LEFT JOIN users u ON u.id = l.created_by
           LEFT JOIN cable_types ct ON ct.id = l.cable_type_id
           LEFT JOIN site_locations sls ON sls.id = l.source_location_id
           LEFT JOIN site_locations sld ON sld.id = l.destination_location_id
           WHERE l.site_id = ?
            AND (l.type IS NULL OR l.type = 'cable')
           ORDER BY l.ref_number ASC, l.id ASC`,
          [id]
        ),
      ]);

      const locations: CableReportLocation[] = (locationsRaw as any[]).map((l) => ({
        name: String((l as any).label ?? '').trim() || siteCode,
        label: siteCode,
        floor: String((l as any).floor ?? ''),
        ...((l as any).template_type != null ? { template_type: String((l as any).template_type) } : {}),
        ...((l as any).area != null ? { area: String((l as any).area) } : {}),
        ...((l as any).suite != null ? { suite: String((l as any).suite) } : {}),
        ...((l as any).row != null ? { row: String((l as any).row) } : {}),
        ...((l as any).rack != null ? { rack: String((l as any).rack) } : {}),
      }));

      const runs: CableReportRun[] = (runsRaw as any[]).map((r) => {
        const sourceHasFloor = r.source_floor != null;
        const destHasFloor = r.dest_floor != null;

        const source = sourceHasFloor
          ? {
              label: String(r.source_name ?? siteCode),
              floor: String(r.source_floor ?? ''),
              ...(r.source_template_type != null ? { template_type: String(r.source_template_type) } : {}),
              ...(r.source_suite != null ? { suite: String(r.source_suite) } : {}),
              ...(r.source_row != null ? { row: String(r.source_row) } : {}),
              ...(r.source_rack != null ? { rack: String(r.source_rack) } : {}),
              ...(r.source_area != null ? { area: String(r.source_area) } : {}),
            }
          : null;

        const destination = destHasFloor
          ? {
              label: String(r.dest_name ?? siteCode),
              floor: String(r.dest_floor ?? ''),
              ...(r.dest_template_type != null ? { template_type: String(r.dest_template_type) } : {}),
              ...(r.dest_suite != null ? { suite: String(r.dest_suite) } : {}),
              ...(r.dest_row != null ? { row: String(r.dest_row) } : {}),
              ...(r.dest_rack != null ? { rack: String(r.dest_rack) } : {}),
              ...(r.dest_area != null ? { area: String(r.dest_area) } : {}),
            }
          : null;

        const username = String(r.created_by_username ?? '').trim();
        const email = String(r.created_by_email ?? '').trim();
        const createdByDisplay = username || email || 'Unknown';

        let description: string | null = null;
        if (r.payload_json != null && String(r.payload_json).trim() !== '') {
          try {
            const parsed = JSON.parse(String(r.payload_json));
            const notes = (parsed as any)?.notes;
            if (typeof notes === 'string' && notes.trim() !== '') {
              description = notes.trim();
            }
          } catch {
            // ignore invalid payload_json
          }
        }

        return {
          ref_number: Number(r.ref_number),
          source,
          destination,
          cable_type_name: r.cable_type_name != null ? String(r.cable_type_name) : null,
          description,
          created_at: new Date(r.created_at),
          created_by_display: createdByDisplay,
        };
      });

      const buffer = await buildCableReportDocxBuffer({
        siteName,
        siteCode,
        ...(siteLocation ? { siteLocation } : {}),
        ...(siteDescription ? { siteDescription } : {}),
        createdAt,
        locations,
        cableTypes: (cableTypesRaw as any[]).map((ct) => ({ name: String((ct as any).name ?? '').trim() })),
        runs,
      });

      const ts = formatTimestampYYYYMMDD_HHMMSS(createdAt);
      const filename = `${siteCode}_cable_report_${ts}.docx`;

      try {
        await logActivity({
          actorUserId: req.user!.userId,
          action: 'CABLE_REPORT_DOWNLOADED',
          summary: `Downloaded cable report for ${siteName} (${siteCode})`,
          siteId: id,
          metadata: {
            filename,
            created_at: createdAt.toISOString(),
          },
        });
      } catch (error) {
        console.warn('⚠️ Failed to log cable report download activity:', error);
      }

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Report-Created-On', formatPrintedDateDDMonYYYY_HHMM(createdAt));
      return res.status(200).send(buffer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        } as ApiResponse);
      }

      console.error('Cable report generation error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate cable report',
      } as ApiResponse);
    }
  }
);

/**
 * POST /api/sites/:id/cable-types
 * Create a cable type for a site (site admins only)
 */
router.post(
  '/:id/cable-types',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { id } = siteIdSchema.parse(req.params);
      const dataParsed = createCableTypeSchema.parse(req.body);

      const cable_type = await cableTypeModel.create({
        site_id: id,
        name: dataParsed.name,
        ...(dataParsed.description !== undefined ? { description: dataParsed.description } : {}),
      });

      try {
        await logActivity({
          actorUserId: req.user!.userId,
          action: 'CABLE_TYPE_CREATED',
          summary: `Created cable type ${cable_type.name}`,
          siteId: id,
          metadata: {
            cable_type_id: Number((cable_type as any).id),
            name: cable_type.name,
          },
        });
      } catch (error) {
        console.warn('⚠️ Failed to log cable type create activity:', error);
      }

      return res.status(201).json({
        success: true,
        data: { cable_type },
        message: 'Cable type created successfully',
      } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        } as ApiResponse);
      }

      if (error instanceof Error) {
        const msg = error.message || '';
        if (/unique|UNIQUE|duplicate/i.test(msg)) {
          return res.status(409).json({
            success: false,
            error: 'Cable type name must be unique per site',
          } as ApiResponse);
        }

        return res.status(400).json({
          success: false,
          error: msg,
        } as ApiResponse);
      }

      console.error('Create cable type error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      } as ApiResponse);
    }
  }
);

/**
 * PUT /api/sites/:id/cable-types/:cableTypeId
 * Update a cable type (site admins only)
 */
router.put(
  '/:id/cable-types/:cableTypeId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { id } = siteIdSchema.parse(req.params);
      const { cableTypeId } = cableTypeIdSchema.parse(req.params);
      const dataParsed = updateCableTypeSchema.parse(req.body);

      const cable_type = await cableTypeModel.update(cableTypeId, id, {
        ...(dataParsed.name !== undefined ? { name: dataParsed.name } : {}),
        ...(dataParsed.description !== undefined ? { description: dataParsed.description ? dataParsed.description : null } : {}),
      });

      if (!cable_type) {
        return res.status(404).json({
          success: false,
          error: 'Cable type not found',
        } as ApiResponse);
      }

      try {
        await logActivity({
          actorUserId: req.user!.userId,
          action: 'CABLE_TYPE_UPDATED',
          summary: `Updated cable type ${cable_type.name}`,
          siteId: id,
          metadata: {
            cable_type_id: cableTypeId,
            changes: {
              ...(dataParsed.name !== undefined ? { name: dataParsed.name } : {}),
              ...(dataParsed.description !== undefined ? { description: dataParsed.description } : {}),
            },
          },
        });
      } catch (error) {
        console.warn('⚠️ Failed to log cable type update activity:', error);
      }

      return res.json({
        success: true,
        data: { cable_type },
        message: 'Cable type updated successfully',
      } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        } as ApiResponse);
      }

      if (error instanceof Error) {
        const msg = error.message || '';
        if (/unique|UNIQUE|duplicate/i.test(msg)) {
          return res.status(409).json({
            success: false,
            error: 'Cable type name must be unique per site',
          } as ApiResponse);
        }

        return res.status(400).json({
          success: false,
          error: msg,
        } as ApiResponse);
      }

      console.error('Update cable type error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      } as ApiResponse);
    }
  }
);

/**
 * DELETE /api/sites/:id/cable-types/:cableTypeId
 * Delete a cable type (blocked if used by labels)
 */
router.delete(
  '/:id/cable-types/:cableTypeId',
  authenticateToken,
  resolveSiteAccess(req => Number(req.params.id)),
  requireSiteRole('SITE_ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { id } = siteIdSchema.parse(req.params);
      const { cableTypeId } = cableTypeIdSchema.parse(req.params);

      let cableTypeName: string | null = null;
      try {
        const rows = await getAdapter().query(
          'SELECT name FROM cable_types WHERE id = ? AND site_id = ? LIMIT 1',
          [cableTypeId, id]
        );
        cableTypeName = rows.length ? String((rows as any[])[0]?.name ?? '') : null;
      } catch {
        // Best-effort only
      }

      const inUseCount = await cableTypeModel.countLabelsUsingType(id, cableTypeId);
      if (inUseCount > 0) {
        return res.status(409).json({
          success: false,
          error: 'Cannot delete cable type that is in use',
          data: { labels_using_type: inUseCount },
        } as ApiResponse);
      }

      const deleted = await cableTypeModel.delete(cableTypeId, id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Cable type not found',
        } as ApiResponse);
      }

      try {
        await logActivity({
          actorUserId: req.user!.userId,
          action: 'CABLE_TYPE_DELETED',
          summary: `Deleted cable type ${cableTypeName ? cableTypeName : `#${cableTypeId}`}`,
          siteId: id,
          metadata: {
            cable_type_id: cableTypeId,
            name: cableTypeName,
          },
        });
      } catch (error) {
        console.warn('⚠️ Failed to log cable type delete activity:', error);
      }

      return res.json({
        success: true,
        message: 'Cable type deleted successfully',
      } as ApiResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        } as ApiResponse);
      }

      if (error instanceof Error) {
        return res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
      }

      console.error('Delete cable type error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      } as ApiResponse);
    }
  }
);

/**
 * DELETE /api/sites/:id
 * Delete a site
 *
 * By default, deletion is blocked if the site has labels.
 * To delete the site and all associated labels, pass `?cascade=true`.
 */
router.delete('/:id', authenticateToken, requireGlobalRole('GLOBAL_ADMIN'), async (req: Request, res: Response) => {
  try {
    // Validate site ID
    const { id } = siteIdSchema.parse(req.params);

    const cascade = String(req.query.cascade || '').toLowerCase() === 'true';

    let siteName: string | null = null;
    let siteCode: string | null = null;
    try {
      const existing = await siteModel.findById(id);
      if (existing) {
        siteName = String((existing as any).name ?? '').trim() || null;
        siteCode = String((existing as any).code ?? '').trim() || null;
      }
    } catch {
      // Best-effort only
    }

    // Attempt to delete site
    const deleted = await siteModel.delete(id, req.user!.userId, { cascade });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
      } as ApiResponse);
    }

    try {
      const label = siteName
        ? `${siteName}${siteCode ? ` (${String(siteCode).toUpperCase()})` : ''}`
        : `#${id}`;
      await logActivity({
        actorUserId: req.user!.userId,
        action: 'SITE_DELETED',
        summary: `Deleted site ${label}${cascade ? ' (cascade)' : ''}`,
        // Site has been deleted; avoid FK constraint on activity_log.site_id
        siteId: null,
        metadata: {
          site_id: id,
          name: siteName,
          code: siteCode,
          cascade,
        },
      });
    } catch (error) {
      console.warn('⚠️ Failed to log site delete activity:', error);
    }

    res.json({
      success: true,
      message: 'Site deleted successfully',
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    // Handle specific error for sites with labels
    if (error instanceof Error && error.message === 'Cannot delete site with existing labels') {
      return res.status(409).json({
        success: false,
        error: 'Cannot delete site with existing labels',
      } as ApiResponse);
    }

    console.error('Delete site error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

export default router;
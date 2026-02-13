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
  description: z.string().max(1000, 'Description must be less than 1000 characters').optional().or(z.literal('')),
});

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
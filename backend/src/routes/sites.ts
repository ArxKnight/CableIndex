import { Router, Request, Response } from 'express';
import { z } from 'zod';
import SiteModel from '../models/Site.js';
import SiteLocationModel from '../models/SiteLocation.js';
import { SiteLocationInUseError } from '../models/SiteLocation.js';
import CableTypeModel from '../models/CableType.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireGlobalRole, requireSiteRole, resolveSiteAccess } from '../middleware/permissions.js';
import { ApiResponse } from '../types/index.js';

const router = Router();
const siteModel = new SiteModel();
const siteLocationModel = new SiteLocationModel();
const cableTypeModel = new CableTypeModel();

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

const createLocationSchema = z.object({
  floor: z.string().min(1, 'Floor is required').max(50),
  suite: z.string().min(1, 'Suite is required').max(50),
  row: z.string().min(1, 'Row is required').max(50),
  rack: z.string().min(1, 'Rack is required').max(50),
  label: z.string().max(255).optional(),
});

const updateLocationSchema = z.object({
  floor: z.string().min(1).max(50).optional(),
  suite: z.string().min(1).max(50).optional(),
  row: z.string().min(1).max(50).optional(),
  rack: z.string().min(1).max(50).optional(),
  label: z.string().max(255).optional().or(z.literal('')),
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
    const label = labelTrimmed !== '' ? labelTrimmed : site.code;

    const location = await siteLocationModel.create({
      site_id: id,
      floor: dataParsed.floor,
      suite: dataParsed.suite,
      row: dataParsed.row,
      rack: dataParsed.rack,
      label,
    });

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

    let labelUpdate: string | undefined;
    if (dataParsed.label !== undefined) {
      const site = await siteModel.findById(id);
      if (!site) {
        return res.status(404).json({
          success: false,
          error: 'Site not found',
        } as ApiResponse);
      }
      const labelTrimmed = (dataParsed.label ?? '').toString().trim();
      labelUpdate = labelTrimmed !== '' ? labelTrimmed : site.code;
    }

    const location = await siteLocationModel.update(locationId, id, {
      ...(dataParsed.floor !== undefined ? { floor: dataParsed.floor } : {}),
      ...(dataParsed.suite !== undefined ? { suite: dataParsed.suite } : {}),
      ...(dataParsed.row !== undefined ? { row: dataParsed.row } : {}),
      ...(dataParsed.rack !== undefined ? { rack: dataParsed.rack } : {}),
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

    // Attempt to delete site
    const deleted = await siteModel.delete(id, req.user!.userId, { cascade });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
      } as ApiResponse);
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
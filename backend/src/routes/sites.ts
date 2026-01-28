import { Router, Request, Response } from 'express';
import { z } from 'zod';
import SiteModel from '../models/Site.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireGlobalRole, requireSiteRole, resolveSiteAccess } from '../middleware/permissions.js';
import { ApiResponse } from '../types/index.js';

const router = Router();
const siteModel = new SiteModel();

// Validation schemas
const createSiteSchema = z.object({
  name: z.string().min(1, 'Site name is required').max(100, 'Site name must be less than 100 characters'),
  code: z.string().min(2).max(20).optional(),
  location: z.string().max(200, 'Location must be less than 200 characters').optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
});

const updateSiteSchema = z.object({
  name: z.string().min(1, 'Site name is required').max(100, 'Site name must be less than 100 characters').optional(),
  code: z.string().min(2).max(20).optional(),
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

    // Validate query parameters - safeParse to avoid throwing on validation error
    const queryValidation = getSitesQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: queryValidation.error.errors,
      } as ApiResponse);
    }

    const { search, limit = 50, offset = 0, include_counts = 'false' } = queryValidation.data;

    let sites;
    let total;

    if (req.user.role === 'GLOBAL_ADMIN') {
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
router.post('/', authenticateToken, requireGlobalRole('GLOBAL_ADMIN', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    // Validate request body
    const siteDataParsed = createSiteSchema.parse(req.body);
    const code = siteDataParsed.code
      ? siteDataParsed.code.toUpperCase()
      : siteDataParsed.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'SITE';
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
router.put('/:id', authenticateToken, resolveSiteAccess(req => Number(req.params.id)), requireSiteRole('ADMIN'), async (req: Request, res: Response) => {
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
 * DELETE /api/sites/:id
 * Delete a site (soft delete)
 */
router.delete('/:id', authenticateToken, resolveSiteAccess(req => Number(req.params.id)), requireSiteRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    // Validate site ID
    const { id } = siteIdSchema.parse(req.params);

    // Attempt to delete site
    const deleted = await siteModel.delete(id, req.user!.userId);

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
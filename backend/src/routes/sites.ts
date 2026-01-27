import { Router, Request, Response } from 'express';
import { z } from 'zod';
import SiteModel from '../models/Site.js';
import { authenticateToken } from '../middleware/auth.js';
import { ApiResponse } from '../types/index.js';

const router = Router();
const siteModel = new SiteModel();

// Validation schemas
const createSiteSchema = z.object({
  name: z.string().min(1, 'Site name is required').max(100, 'Site name must be less than 100 characters'),
  location: z.string().max(200, 'Location must be less than 200 characters').optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
});

const updateSiteSchema = z.object({
  name: z.string().min(1, 'Site name is required').max(100, 'Site name must be less than 100 characters').optional(),
  location: z.string().max(200, 'Location must be less than 200 characters').optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
});

const getSitesQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  include_counts: z.enum(['true', 'false']).default('false'),
});

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

    // Validate query parameters
    const { search, limit, offset, include_counts } = getSitesQuerySchema.parse(req.query);

    let sites;
    let total;

    if (include_counts === 'true') {
      sites = siteModel.findByUserIdWithLabelCounts(req.user.userId, {
        search,
        limit,
        offset,
      });
    } else {
      sites = siteModel.findByUserId(req.user.userId, {
        search,
        limit,
        offset,
      });
    }

    total = siteModel.countByUserId(req.user.userId, search);

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
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
    }

    // Validate site ID
    const { id } = siteIdSchema.parse(req.params);

    // Get site with label count
    const site = siteModel.findByIdWithLabelCount(id, req.user.userId);

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
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
    }

    // Validate request body
    const siteData = createSiteSchema.parse(req.body);

    // Create site
    const site = siteModel.create({
      ...siteData,
      user_id: req.user.userId,
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
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
    }

    // Validate site ID and request body
    const { id } = siteIdSchema.parse(req.params);
    const siteData = updateSiteSchema.parse(req.body);

    // Check if site exists and belongs to user
    if (!siteModel.existsForUser(id, req.user.userId)) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
      } as ApiResponse);
    }

    // Update site
    const site = siteModel.update(id, req.user.userId, siteData);

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
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
    }

    // Validate site ID
    const { id } = siteIdSchema.parse(req.params);

    // Check if site exists and belongs to user
    if (!siteModel.existsForUser(id, req.user.userId)) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
      } as ApiResponse);
    }

    // Attempt to delete site
    const deleted = siteModel.delete(id, req.user.userId);

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
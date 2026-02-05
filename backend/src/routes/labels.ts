import { Router, Request, Response } from 'express';
import { z } from 'zod';
import LabelModel from '../models/Label.js';
import SiteModel from '../models/Site.js';
import ZPLService from '../services/ZPLService.js';
import { authenticateToken } from '../middleware/auth.js';
import { resolveSiteAccess } from '../middleware/permissions.js';
import { ApiResponse } from '../types/index.js';

const router = Router();
const labelModel = new LabelModel();
const siteModel = new SiteModel();
const zplService = new ZPLService();

// Validation schemas
const createLabelSchema = z.object({
  source_location_id: z.coerce.number().min(1, 'Source location is required'),
  destination_location_id: z.coerce.number().min(1, 'Destination location is required'),
  cable_type_id: z.coerce.number().min(1, 'Cable type is required'),
  site_id: z.number().min(1, 'Valid site ID is required'),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional(),
  zpl_content: z.string().optional(),
  quantity: z.coerce.number().int().min(1).max(500).optional(),
});

const updateLabelSchema = z.object({
  source_location_id: z.coerce.number().min(1, 'Source location is required').optional(),
  destination_location_id: z.coerce.number().min(1, 'Destination location is required').optional(),
  cable_type_id: z.coerce.number().min(1, 'Cable type is required').optional(),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional(),
  zpl_content: z.string().optional(),
});

const getLabelsQuerySchema = z.object({
  search: z.string().optional(),
  site_id: z.coerce.number().min(1),
  reference_number: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  sort_by: z.enum(['created_at', 'ref_string']).default('created_at'),
  sort_order: z.enum(['ASC', 'DESC']).default('DESC'),
  include_site_info: z.enum(['true', 'false']).default('false'),
});

const labelIdSchema = z.object({
  id: z.coerce.number().min(1, 'Invalid label ID'),
});

const bulkDeleteSchema = z.object({
  site_id: z.number().min(1),
  ids: z.array(z.number().min(1)).min(1, 'At least one label ID is required').max(100, 'Cannot delete more than 100 labels at once'),
});

const bulkZplSchema = z.object({
  site_id: z.number().min(1),
  ids: z.array(z.number().min(1)).min(1, 'At least one label ID is required').max(100, 'Cannot export more than 100 labels at once'),
});

const bulkZplRangeSchema = z.object({
  site_id: z.number().min(1),
  start_ref: z.coerce.string().min(1, 'Start reference is required'),
  end_ref: z.coerce.string().min(1, 'End reference is required'),
});

const portLabelSchema = z.object({
  sid: z.string().min(1, 'SID is required').max(50, 'SID must be less than 50 characters'),
  fromPort: z.number().min(1, 'From port must be at least 1'),
  toPort: z.number().min(1, 'To port must be at least 1'),
}).refine(data => data.fromPort <= data.toPort, {
  message: 'From port must be less than or equal to to port',
});

const pduLabelSchema = z.object({
  pduSid: z.string().min(1, 'PDU SID is required').max(50, 'PDU SID must be less than 50 characters'),
  fromPort: z.number().min(1, 'From port must be at least 1'),
  toPort: z.number().min(1, 'To port must be at least 1'),
}).refine(data => data.fromPort <= data.toPort, {
  message: 'From port must be less than or equal to to port',
});

/**
 * GET /api/labels
 * Get all labels for the authenticated user with optional filtering and search
 */
router.get('/', authenticateToken, resolveSiteAccess(req => Number(req.query.site_id)), async (req: Request, res: Response) => {
  try {
    // Validate query parameters
    const { 
      search, 
      site_id, 
      reference_number,
      limit, 
      offset, 
      sort_by, 
      sort_order,
      include_site_info 
    } = getLabelsQuerySchema.parse(req.query);

    const searchOptions = {
      ...(search ? { search } : {}),
      ...(reference_number ? { reference_number } : {}),
      limit,
      offset,
      sort_by,
      sort_order,
    };

    const labels = await labelModel.findBySiteId(site_id, searchOptions);
    const total = await labelModel.countBySiteId(site_id, {
      ...(search ? { search } : {}),
      ...(reference_number ? { reference_number } : {}),
    });

    res.json({
      success: true,
      data: {
        labels,
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

    console.error('Get labels error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * GET /api/labels/stats
 * Get label statistics for the authenticated user
 */
router.get('/stats', authenticateToken, resolveSiteAccess(req => Number(req.query.site_id)), async (req: Request, res: Response) => {
  try {
    const stats = await labelModel.getStatsBySiteId(req.site!.id);

    res.json({
      success: true,
      data: { stats },
    } as ApiResponse);

  } catch (error) {
    console.error('Get label stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * GET /api/labels/recent
 * Get recent labels for dashboard
 */
router.get('/recent', authenticateToken, resolveSiteAccess(req => Number(req.query.site_id)), async (req: Request, res: Response) => {
  try {
    const limitSchema = z.object({
      limit: z.coerce.number().min(1).max(50).default(10).optional(),
    }).passthrough();

    const queryValidation = limitSchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: queryValidation.error.errors,
      } as ApiResponse);
    }

    const { limit = 10 } = queryValidation.data;
    const recentLabels = await labelModel.findRecentBySiteId(req.site!.id, limit);

    res.json({
      success: true,
      data: { labels: recentLabels || [] },
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Get recent labels error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * GET /api/labels/:id
 * Get a specific label by ID
 */
router.get('/:id', authenticateToken, resolveSiteAccess(req => Number(req.query.site_id)), async (req: Request, res: Response) => {
  try {
    // Validate label ID
    const { id } = labelIdSchema.parse(req.params);

    // Get label
    const label = await labelModel.findById(id, req.site!.id);

    if (!label) {
      return res.status(404).json({
        success: false,
        error: 'Label not found',
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: { label },
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Get label error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * POST /api/labels
 * Create a new label
 */
router.post('/', authenticateToken, resolveSiteAccess(req => Number(req.body.site_id)), async (req: Request, res: Response) => {
  try {
    // Validate request body
    const labelDataParsed = createLabelSchema.parse(req.body);
    const quantity = labelDataParsed.quantity ?? 1;
    const labelData = {
      site_id: labelDataParsed.site_id,
      source_location_id: labelDataParsed.source_location_id,
      destination_location_id: labelDataParsed.destination_location_id,
      cable_type_id: labelDataParsed.cable_type_id,
      ...(labelDataParsed.notes ? { notes: labelDataParsed.notes } : {}),
      ...(labelDataParsed.zpl_content ? { zpl_content: labelDataParsed.zpl_content } : {}),
    };

    // Create label(s)
    if (quantity > 1) {
      const labels = await labelModel.createMany(
        {
          ...labelData,
          created_by: req.user!.userId,
        },
        quantity
      );

      res.status(201).json({
        success: true,
        data: { label: labels[0], labels },
        message: 'Labels created successfully',
      } as ApiResponse);
      return;
    }

    const label = await labelModel.create({
      ...labelData,
      created_by: req.user!.userId,
    });

    res.status(201).json({
      success: true,
      data: { label },
      message: 'Label created successfully',
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    // Handle specific model errors
    if (error instanceof Error) {
      if (error.message === 'Source location is required' || error.message === 'Destination location is required') {
        return res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
      }
      
      if (error.message === 'Site not found') {
        return res.status(400).json({
          success: false,
          error: 'Invalid site ID',
        } as ApiResponse);
      }
    }

    console.error('Create label error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * PUT /api/labels/:id
 * Update an existing label
 */
router.put('/:id', authenticateToken, resolveSiteAccess(req => Number(req.body.site_id)), async (req: Request, res: Response) => {
  try {
    // Validate label ID and request body
    const { id } = labelIdSchema.parse(req.params);
    const labelDataParsed = updateLabelSchema.parse(req.body);
    const labelData = {
      ...(labelDataParsed.source_location_id !== undefined ? { source_location_id: labelDataParsed.source_location_id } : {}),
      ...(labelDataParsed.destination_location_id !== undefined ? { destination_location_id: labelDataParsed.destination_location_id } : {}),
      ...(labelDataParsed.cable_type_id !== undefined ? { cable_type_id: labelDataParsed.cable_type_id } : {}),
      ...(labelDataParsed.notes !== undefined ? { notes: labelDataParsed.notes } : {}),
      ...(labelDataParsed.zpl_content !== undefined ? { zpl_content: labelDataParsed.zpl_content } : {}),
    };

    // Update label
    const label = await labelModel.update(id, req.site!.id, labelData);

    if (!label) {
      return res.status(404).json({
        success: false,
        error: 'Label not found or no changes made',
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: { label },
      message: 'Label updated successfully',
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    // Handle specific model errors
    if (error instanceof Error) {
      if (error.message === 'Source location is required' || error.message === 'Destination location is required') {
        return res.status(400).json({
          success: false,
          error: error.message,
        } as ApiResponse);
      }
    }

    console.error('Update label error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * DELETE /api/labels/:id
 * Delete a label (soft delete)
 */
router.delete('/:id', authenticateToken, resolveSiteAccess(req => Number(req.query.site_id)), async (req: Request, res: Response) => {
  try {
    // Validate label ID
    const { id } = labelIdSchema.parse(req.params);

    // Delete label
    const deleted = await labelModel.delete(id, req.site!.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Label not found',
      } as ApiResponse);
    }

    res.json({
      success: true,
      message: 'Label deleted successfully',
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Delete label error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * POST /api/labels/bulk-delete
 * Delete multiple labels (bulk operation)
 */
router.post('/bulk-delete', authenticateToken, resolveSiteAccess(req => Number(req.body.site_id)), async (req: Request, res: Response) => {
  try {
    // Validate request body
    const { ids } = bulkDeleteSchema.parse(req.body);

    // Perform bulk delete
    const deletedCount = await labelModel.bulkDelete(ids, req.site!.id);

    res.json({
      success: true,
      data: { deleted_count: deletedCount },
      message: `${deletedCount} label(s) deleted successfully`,
    } as ApiResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Bulk delete labels error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * GET /api/labels/:id/zpl
 * Generate and download ZPL for a specific label
 */
router.get('/:id/zpl', authenticateToken, resolveSiteAccess(req => Number(req.query.site_id)), async (req: Request, res: Response) => {
  try {
    // Validate label ID
    const { id } = labelIdSchema.parse(req.params);

    // Get label and verify ownership
    const label = await labelModel.findById(id, req.site!.id);
    if (!label) {
      return res.status(404).json({
        success: false,
        error: 'Label not found',
      } as ApiResponse);
    }

    // Get site information
    const site = await siteModel.findById(label.site_id);
    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
      } as ApiResponse);
    }

    // Generate ZPL
    const zplContent = zplService.generateFromLabel(label, site);

    // Set headers for file download
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${label.reference_number}.txt"`);
    
    res.send(zplContent);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Generate ZPL error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * POST /api/labels/bulk-zpl
 * Generate and download ZPL for multiple labels
 */
router.post('/bulk-zpl', authenticateToken, resolveSiteAccess(req => Number(req.body.site_id)), async (req: Request, res: Response) => {
  try {
    // Validate request body
    const { ids } = bulkZplSchema.parse(req.body);

    // Get labels and verify ownership
    const labels = [];
    const sites = new Map();

    for (const id of ids) {
      const label = await labelModel.findById(id, req.site!.id);
      if (!label) {
        continue; // Skip labels that don't exist or don't belong to user
      }
      
      labels.push(label);
      
      // Get site if not already cached
      if (!sites.has(label.site_id)) {
        const site = await siteModel.findById(label.site_id);
        if (site) {
          sites.set(label.site_id, site);
        }
      }
    }

    if (labels.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No valid labels found',
      } as ApiResponse);
    }

    // Generate bulk ZPL
    const sitesArray = Array.from(sites.values());
    const zplContent = zplService.generateBulkLabels(labels, sitesArray);

    // Set headers for file download
    const makeTimestamp = (): string => {
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const mi = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
    };

    const timestamp = makeTimestamp();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="crossrackref_${timestamp}.txt"`);
    
    res.send(zplContent);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Generate bulk ZPL error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * POST /api/labels/bulk-zpl-range
 * Generate and download ZPL for labels within a reference-number range (inclusive)
 */
router.post('/bulk-zpl-range', authenticateToken, resolveSiteAccess(req => Number(req.body.site_id)), async (req: Request, res: Response) => {
  try {
    const { start_ref, end_ref } = bulkZplRangeSchema.parse(req.body);

    const parseTrailingNumber = (value: string): number | null => {
      const match = value.trim().match(/(\d+)$/);
      if (!match) return null;
      const parsed = Number(match[1]);
      if (!Number.isFinite(parsed)) return null;
      return Math.floor(parsed);
    };

    const startNum = parseTrailingNumber(start_ref);
    const endNum = parseTrailingNumber(end_ref);

    if (!startNum || !endNum || startNum < 1 || endNum < 1 || startNum > endNum) {
      return res.status(400).json({
        success: false,
        error: 'Invalid reference range',
      } as ApiResponse);
    }

    const labels = await labelModel.findByRefNumberRange(req.site!.id, startNum, endNum, 1000);

    if (labels.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No labels found in the specified range',
      } as ApiResponse);
    }

    const site = await siteModel.findById(req.site!.id);
    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
      } as ApiResponse);
    }

    const zplContent = zplService.generateBulkLabels(labels, [site]);

    const makeTimestamp = (): string => {
      const now = new Date();
      const yyyy = String(now.getFullYear());
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const mi = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
    };

    const timestamp = makeTimestamp();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="crossrackref_${timestamp}.txt"`);
    res.send(zplContent);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      } as ApiResponse);
    }

    console.error('Generate bulk ZPL range error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * POST /api/labels/port-labels/zpl
 * Generate ZPL for port labels
 */
router.post('/port-labels/zpl', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
    }

    // Validate request body
    const portData = portLabelSchema.parse(req.body);

    // Generate ZPL for port labels
    const zplContent = zplService.generatePortLabels(portData);

    // Set headers for file download
    const filename = `port-labels-${portData.sid}-${portData.fromPort}-${portData.toPort}.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(zplContent);

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

    console.error('Generate port labels ZPL error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

/**
 * POST /api/labels/pdu-labels/zpl
 * Generate ZPL for PDU labels
 */
router.post('/pdu-labels/zpl', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
    }

    // Validate request body
    const pduData = pduLabelSchema.parse(req.body);

    // Generate ZPL for PDU labels
    const zplContent = zplService.generatePDULabels(pduData);

    // Set headers for file download
    const filename = `pdu-labels-${pduData.pduSid}-${pduData.fromPort}-${pduData.toPort}.txt`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(zplContent);

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

    console.error('Generate PDU labels ZPL error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    } as ApiResponse);
  }
});

export default router;
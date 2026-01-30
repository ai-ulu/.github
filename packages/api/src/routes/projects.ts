// Project management API routes
// Production-ready CRUD operations with validation and security

import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@autoqa/database';
import { ProjectCache } from '@autoqa/cache';
import { createJWTMiddleware, getDefaultJWTManager } from '@autoqa/auth';
import { encrypt, decrypt } from '../utils/encryption';
import { logger } from '../utils/logger';
import { ApiError, handleApiError } from '../utils/errors';

const router = Router();
const jwtMiddleware = createJWTMiddleware(getDefaultJWTManager());

// Validation schemas
const createProjectValidation = [
  body('name')
    .isString()
    .isLength({ min: 1, max: 255 })
    .trim()
    .withMessage('Project name must be 1-255 characters'),
  body('url')
    .isURL({ protocols: ['http', 'https'] })
    .withMessage('Valid URL is required'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .trim()
    .withMessage('Description must be max 1000 characters'),
  body('authCredentials')
    .optional()
    .isObject()
    .withMessage('Auth credentials must be an object'),
  body('authCredentials.username')
    .optional()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage('Username must be 1-255 characters'),
  body('authCredentials.password')
    .optional()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage('Password must be 1-255 characters'),
  body('authCredentials.token')
    .optional()
    .isString()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Token must be 1-1000 characters'),
];

const updateProjectValidation = [
  param('id').isUUID().withMessage('Valid project ID is required'),
  body('name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 255 })
    .trim()
    .withMessage('Project name must be 1-255 characters'),
  body('url')
    .optional()
    .isURL({ protocols: ['http', 'https'] })
    .withMessage('Valid URL is required'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .trim()
    .withMessage('Description must be max 1000 characters'),
  body('authCredentials')
    .optional()
    .isObject()
    .withMessage('Auth credentials must be an object'),
];

const projectIdValidation = [
  param('id').isUUID().withMessage('Valid project ID is required'),
];

const listProjectsValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .isString()
    .isLength({ max: 255 })
    .trim()
    .withMessage('Search term must be max 255 characters'),
];

// Helper function to validate request
const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request data',
      details: errors.array(),
      correlationId: req.correlationId,
    });
  }
  next();
};

// GET /api/projects - List user projects
router.get(
  '/',
  jwtMiddleware.authenticate,
  listProjectsValidation,
  validateRequest,
  async (req: any, res: any) => {
    try {
      const userId = req.user.userId;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const search = req.query.search || '';
      const offset = (page - 1) * limit;

      logger.info('Listing projects', {
        userId,
        page,
        limit,
        search,
        correlationId: req.correlationId,
      });

      // Try cache first
      const cacheKey = `user_projects:${userId}:${page}:${limit}:${search}`;
      let cachedProjects = await ProjectCache.getUserProjects(cacheKey);

      if (cachedProjects) {
        logger.debug('Projects retrieved from cache', {
          userId,
          count: cachedProjects.length,
          correlationId: req.correlationId,
        });

        return res.json({
          projects: cachedProjects,
          pagination: {
            page,
            limit,
            total: cachedProjects.length,
          },
          correlationId: req.correlationId,
        });
      }

      // Build where clause
      const whereClause: any = {
        userId,
        deletedAt: null,
      };

      if (search) {
        whereClause.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { url: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Get projects with pagination
      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where: whereClause,
          select: {
            id: true,
            name: true,
            url: true,
            description: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                testScenarios: {
                  where: { deletedAt: null },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        }),
        prisma.project.count({
          where: whereClause,
        }),
      ]);

      // Transform projects
      const transformedProjects = projects.map(project => ({
        id: project.id,
        name: project.name,
        url: project.url,
        description: project.description,
        scenarioCount: project._count.testScenarios,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }));

      // Cache results
      await ProjectCache.setUserProjects(cacheKey, transformedProjects);

      logger.info('Projects retrieved from database', {
        userId,
        count: transformedProjects.length,
        total,
        correlationId: req.correlationId,
      });

      res.json({
        projects: transformedProjects,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        correlationId: req.correlationId,
      });
    } catch (error) {
      handleApiError(error, req, res);
    }
  }
);

// GET /api/projects/:id - Get project by ID
router.get(
  '/:id',
  jwtMiddleware.authenticate,
  projectIdValidation,
  validateRequest,
  async (req: any, res: any) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.userId;

      logger.info('Getting project', {
        projectId,
        userId,
        correlationId: req.correlationId,
      });

      // Try cache first
      let project = await ProjectCache.getProject(projectId);

      if (!project) {
        // Get from database
        project = await prisma.project.findFirst({
          where: {
            id: projectId,
            userId,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            url: true,
            description: true,
            authCredentials: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                testScenarios: {
                  where: { deletedAt: null },
                },
              },
            },
          },
        });

        if (!project) {
          throw new ApiError(404, 'project_not_found', 'Project not found');
        }

        // Cache the project
        await ProjectCache.setProject(projectId, project);
      }

      // Decrypt auth credentials if present
      let authCredentials = null;
      if (project.authCredentials) {
        try {
          authCredentials = decrypt(project.authCredentials);
        } catch (error) {
          logger.warn('Failed to decrypt auth credentials', {
            projectId,
            error: error instanceof Error ? error.message : 'Unknown error',
            correlationId: req.correlationId,
          });
        }
      }

      const response = {
        id: project.id,
        name: project.name,
        url: project.url,
        description: project.description,
        authCredentials,
        scenarioCount: project._count?.testScenarios || 0,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        correlationId: req.correlationId,
      };

      logger.info('Project retrieved', {
        projectId,
        userId,
        correlationId: req.correlationId,
      });

      res.json(response);
    } catch (error) {
      handleApiError(error, req, res);
    }
  }
);

// POST /api/projects - Create new project
router.post(
  '/',
  jwtMiddleware.authenticate,
  createProjectValidation,
  validateRequest,
  async (req: any, res: any) => {
    try {
      const userId = req.user.userId;
      const { name, url, description, authCredentials } = req.body;
      const projectId = uuidv4();

      logger.info('Creating project', {
        projectId,
        userId,
        name,
        url,
        correlationId: req.correlationId,
      });

      // Encrypt auth credentials if provided
      let encryptedCredentials = null;
      if (authCredentials) {
        encryptedCredentials = encrypt(authCredentials);
      }

      // Create project in database
      const project = await prisma.project.create({
        data: {
          id: projectId,
          userId,
          name,
          url,
          description,
          authCredentials: encryptedCredentials,
        },
        select: {
          id: true,
          name: true,
          url: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Cache the project
      await ProjectCache.setProject(projectId, {
        ...project,
        authCredentials: authCredentials,
        _count: { testScenarios: 0 },
      });

      // Invalidate user projects cache
      const pattern = `user_projects:${userId}:*`;
      // Note: In a real implementation, you'd want a more sophisticated cache invalidation
      
      logger.info('Project created', {
        projectId,
        userId,
        correlationId: req.correlationId,
      });

      res.status(201).json({
        ...project,
        authCredentials,
        scenarioCount: 0,
        correlationId: req.correlationId,
      });
    } catch (error) {
      handleApiError(error, req, res);
    }
  }
);

// PUT /api/projects/:id - Update project
router.put(
  '/:id',
  jwtMiddleware.authenticate,
  updateProjectValidation,
  validateRequest,
  async (req: any, res: any) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.userId;
      const updates = req.body;

      logger.info('Updating project', {
        projectId,
        userId,
        updates: Object.keys(updates),
        correlationId: req.correlationId,
      });

      // Check if project exists and belongs to user
      const existingProject = await prisma.project.findFirst({
        where: {
          id: projectId,
          userId,
          deletedAt: null,
        },
      });

      if (!existingProject) {
        throw new ApiError(404, 'project_not_found', 'Project not found');
      }

      // Prepare update data
      const updateData: any = {};
      
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.url !== undefined) updateData.url = updates.url;
      if (updates.description !== undefined) updateData.description = updates.description;
      
      if (updates.authCredentials !== undefined) {
        updateData.authCredentials = updates.authCredentials 
          ? encrypt(updates.authCredentials)
          : null;
      }

      // Update project
      const project = await prisma.project.update({
        where: { id: projectId },
        data: updateData,
        select: {
          id: true,
          name: true,
          url: true,
          description: true,
          authCredentials: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              testScenarios: {
                where: { deletedAt: null },
              },
            },
          },
        },
      });

      // Decrypt auth credentials for response
      let authCredentials = null;
      if (project.authCredentials) {
        try {
          authCredentials = decrypt(project.authCredentials);
        } catch (error) {
          logger.warn('Failed to decrypt auth credentials', {
            projectId,
            error: error instanceof Error ? error.message : 'Unknown error',
            correlationId: req.correlationId,
          });
        }
      }

      // Update cache
      await ProjectCache.setProject(projectId, {
        ...project,
        authCredentials,
      });

      logger.info('Project updated', {
        projectId,
        userId,
        correlationId: req.correlationId,
      });

      res.json({
        id: project.id,
        name: project.name,
        url: project.url,
        description: project.description,
        authCredentials,
        scenarioCount: project._count.testScenarios,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        correlationId: req.correlationId,
      });
    } catch (error) {
      handleApiError(error, req, res);
    }
  }
);

// DELETE /api/projects/:id - Delete project (soft delete)
router.delete(
  '/:id',
  jwtMiddleware.authenticate,
  projectIdValidation,
  validateRequest,
  async (req: any, res: any) => {
    try {
      const projectId = req.params.id;
      const userId = req.user.userId;

      logger.info('Deleting project', {
        projectId,
        userId,
        correlationId: req.correlationId,
      });

      // Check if project exists and belongs to user
      const existingProject = await prisma.project.findFirst({
        where: {
          id: projectId,
          userId,
          deletedAt: null,
        },
      });

      if (!existingProject) {
        throw new ApiError(404, 'project_not_found', 'Project not found');
      }

      // Soft delete project and related scenarios
      await prisma.$transaction(async (tx) => {
        // Soft delete all test scenarios
        await tx.testScenario.updateMany({
          where: {
            projectId,
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
          },
        });

        // Soft delete project
        await tx.project.update({
          where: { id: projectId },
          data: {
            deletedAt: new Date(),
          },
        });
      });

      // Remove from cache
      await ProjectCache.deleteProject(projectId);

      logger.info('Project deleted', {
        projectId,
        userId,
        correlationId: req.correlationId,
      });

      res.status(204).send();
    } catch (error) {
      handleApiError(error, req, res);
    }
  }
);

export default router;
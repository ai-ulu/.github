// User management API routes
// Production-ready user profile operations with validation and security

import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { prisma } from '@autoqa/database';
import { UserCache } from '@autoqa/cache';
import { createJWTMiddleware, getDefaultJWTManager } from '@autoqa/auth';
import { logger } from '../utils/logger';
import { ApiError, handleApiError } from '../utils/errors';

const router = Router();
const jwtMiddleware = createJWTMiddleware(getDefaultJWTManager());

// Validation schemas
const updateUserValidation = [
  body('username')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username must be 1-50 characters and contain only letters, numbers, underscores, and hyphens'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .trim()
    .withMessage('Name must be 1-100 characters'),
  body('bio')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .trim()
    .withMessage('Bio must be max 500 characters'),
  body('location')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .trim()
    .withMessage('Location must be max 100 characters'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Valid website URL is required'),
];

const userIdValidation = [
  param('id').isUUID().withMessage('Valid user ID is required'),
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

// GET /api/users/me - Get current user profile
router.get(
  '/me',
  jwtMiddleware.authenticate,
  async (req: any, res: any) => {
    try {
      const userId = req.user.userId;

      logger.info('Getting user profile', {
        userId,
        correlationId: req.correlationId,
      });

      // Try cache first
      let user = await UserCache.getUser(userId);

      if (!user) {
        // Get from database
        user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            githubId: true,
            username: true,
            email: true,
            name: true,
            bio: true,
            location: true,
            website: true,
            avatarUrl: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                projects: {
                  where: { deletedAt: null },
                },
              },
            },
          },
        });

        if (!user) {
          throw new ApiError(404, 'user_not_found', 'User not found');
        }

        // Cache the user
        await UserCache.setUser(userId, user);
      }

      const response = {
        id: user.id,
        githubId: user.githubId,
        username: user.username,
        email: user.email,
        name: user.name,
        bio: user.bio,
        location: user.location,
        website: user.website,
        avatarUrl: user.avatarUrl,
        projectCount: user._count?.projects || 0,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        correlationId: req.correlationId,
      };

      logger.info('User profile retrieved', {
        userId,
        correlationId: req.correlationId,
      });

      res.json(response);
    } catch (error) {
      handleApiError(error, req, res);
    }
  }
);

// PUT /api/users/me - Update current user profile
router.put(
  '/me',
  jwtMiddleware.authenticate,
  updateUserValidation,
  validateRequest,
  async (req: any, res: any) => {
    try {
      const userId = req.user.userId;
      const updates = req.body;

      logger.info('Updating user profile', {
        userId,
        updates: Object.keys(updates),
        correlationId: req.correlationId,
      });

      // Check if username is already taken (if updating username)
      if (updates.username) {
        const existingUser = await prisma.user.findFirst({
          where: {
            username: updates.username,
            id: { not: userId },
          },
        });

        if (existingUser) {
          throw new ApiError(409, 'username_taken', 'Username is already taken');
        }
      }

      // Check if email is already taken (if updating email)
      if (updates.email) {
        const existingUser = await prisma.user.findFirst({
          where: {
            email: updates.email,
            id: { not: userId },
          },
        });

        if (existingUser) {
          throw new ApiError(409, 'email_taken', 'Email is already taken');
        }
      }

      // Prepare update data
      const updateData: any = {};
      
      if (updates.username !== undefined) updateData.username = updates.username;
      if (updates.email !== undefined) updateData.email = updates.email;
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.bio !== undefined) updateData.bio = updates.bio;
      if (updates.location !== undefined) updateData.location = updates.location;
      if (updates.website !== undefined) updateData.website = updates.website;

      // Update user
      const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          githubId: true,
          username: true,
          email: true,
          name: true,
          bio: true,
          location: true,
          website: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              projects: {
                where: { deletedAt: null },
              },
            },
          },
        },
      });

      // Update cache
      await UserCache.setUser(userId, user);

      logger.info('User profile updated', {
        userId,
        correlationId: req.correlationId,
      });

      res.json({
        id: user.id,
        githubId: user.githubId,
        username: user.username,
        email: user.email,
        name: user.name,
        bio: user.bio,
        location: user.location,
        website: user.website,
        avatarUrl: user.avatarUrl,
        projectCount: user._count.projects,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        correlationId: req.correlationId,
      });
    } catch (error) {
      handleApiError(error, req, res);
    }
  }
);

// GET /api/users/:id - Get user profile by ID (public info only)
router.get(
  '/:id',
  userIdValidation,
  validateRequest,
  async (req: any, res: any) => {
    try {
      const targetUserId = req.params.id;

      logger.info('Getting public user profile', {
        targetUserId,
        correlationId: req.correlationId,
      });

      // Get public user info from database
      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          username: true,
          name: true,
          bio: true,
          location: true,
          website: true,
          avatarUrl: true,
          createdAt: true,
          _count: {
            select: {
              projects: {
                where: { deletedAt: null },
              },
            },
          },
        },
      });

      if (!user) {
        throw new ApiError(404, 'user_not_found', 'User not found');
      }

      const response = {
        id: user.id,
        username: user.username,
        name: user.name,
        bio: user.bio,
        location: user.location,
        website: user.website,
        avatarUrl: user.avatarUrl,
        projectCount: user._count.projects,
        createdAt: user.createdAt,
        correlationId: req.correlationId,
      };

      logger.info('Public user profile retrieved', {
        targetUserId,
        correlationId: req.correlationId,
      });

      res.json(response);
    } catch (error) {
      handleApiError(error, req, res);
    }
  }
);

// DELETE /api/users/me - Delete current user account
router.delete(
  '/me',
  jwtMiddleware.authenticate,
  async (req: any, res: any) => {
    try {
      const userId = req.user.userId;

      logger.info('Deleting user account', {
        userId,
        correlationId: req.correlationId,
      });

      // Delete user and all related data in transaction
      await prisma.$transaction(async (tx) => {
        // Delete all test executions
        await tx.testExecution.deleteMany({
          where: {
            testScenario: {
              project: {
                userId,
              },
            },
          },
        });

        // Delete all test scenarios
        await tx.testScenario.deleteMany({
          where: {
            project: {
              userId,
            },
          },
        });

        // Delete all projects
        await tx.project.deleteMany({
          where: { userId },
        });

        // Delete user
        await tx.user.delete({
          where: { id: userId },
        });
      });

      // Remove from cache
      await UserCache.deleteUser(userId);

      // Invalidate all user sessions
      const jwtManager = getDefaultJWTManager();
      const sessions = await jwtManager.getUserSessions(userId);
      
      for (const session of sessions) {
        await jwtManager.invalidateSession(session.sessionId);
      }

      logger.info('User account deleted', {
        userId,
        correlationId: req.correlationId,
      });

      res.status(204).send();
    } catch (error) {
      handleApiError(error, req, res);
    }
  }
);

// GET /api/users/me/stats - Get user statistics
router.get(
  '/me/stats',
  jwtMiddleware.authenticate,
  async (req: any, res: any) => {
    try {
      const userId = req.user.userId;

      logger.info('Getting user statistics', {
        userId,
        correlationId: req.correlationId,
      });

      // Get user statistics
      const stats = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          _count: {
            select: {
              projects: {
                where: { deletedAt: null },
              },
            },
          },
          projects: {
            where: { deletedAt: null },
            select: {
              _count: {
                select: {
                  testScenarios: {
                    where: { deletedAt: null },
                  },
                },
              },
            },
          },
        },
      });

      if (!stats) {
        throw new ApiError(404, 'user_not_found', 'User not found');
      }

      // Calculate total scenarios and executions
      const totalScenarios = stats.projects.reduce(
        (sum, project) => sum + project._count.testScenarios,
        0
      );

      // Get execution statistics
      const executionStats = await prisma.testExecution.groupBy({
        by: ['status'],
        where: {
          testScenario: {
            project: {
              userId,
              deletedAt: null,
            },
            deletedAt: null,
          },
        },
        _count: {
          status: true,
        },
      });

      const executionsByStatus = executionStats.reduce((acc, stat) => {
        acc[stat.status] = stat._count.status;
        return acc;
      }, {} as Record<string, number>);

      const response = {
        projectCount: stats._count.projects,
        scenarioCount: totalScenarios,
        executions: {
          total: Object.values(executionsByStatus).reduce((sum, count) => sum + count, 0),
          byStatus: executionsByStatus,
        },
        correlationId: req.correlationId,
      };

      logger.info('User statistics retrieved', {
        userId,
        stats: response,
        correlationId: req.correlationId,
      });

      res.json(response);
    } catch (error) {
      handleApiError(error, req, res);
    }
  }
);

export default router;
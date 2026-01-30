/**
 * Property-Based Tests for API Endpoints
 * Feature: autoqa-pilot, API Endpoint Properties
 * 
 * Tests CRUD operation consistency, input validation, and authorization enforcement.
 * Validates: Requirements 1.4, 1.5, 1.6
 */

import fc from 'fast-check';
import request from 'supertest';
import express from 'express';
import { prisma } from '@autoqa/database';
import { redis } from '@autoqa/cache';
import { JWTManager } from '@autoqa/auth';
import projectRoutes from '../routes/projects';
import userRoutes from '../routes/users';
import { requestLogger } from '../utils/logger';

// Test app setup
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(requestLogger);
  app.use('/api/projects', projectRoutes);
  app.use('/api/users', userRoutes);
  return app;
};

// Test JWT manager
const testJWTConfig = {
  accessTokenSecret: 'test_access_secret_that_is_long_enough_for_security',
  refreshTokenSecret: 'test_refresh_secret_that_is_long_enough_for_security',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  issuer: 'autoqa-test',
  audience: 'autoqa-test-users',
};

const jwtManager = new JWTManager(testJWTConfig);

// Test helpers
async function createTestUser(userData: any = {}) {
  const defaultUser = {
    id: fc.sample(fc.uuid(), 1)[0],
    githubId: fc.sample(fc.integer({ min: 1, max: 999999 }), 1)[0],
    username: fc.sample(fc.string({ minLength: 3, maxLength: 20 }), 1)[0],
    email: fc.sample(fc.emailAddress(), 1)[0],
    name: fc.sample(fc.string({ minLength: 1, maxLength: 50 }), 1)[0],
    avatarUrl: fc.sample(fc.webUrl(), 1)[0],
  };

  const user = { ...defaultUser, ...userData };
  
  await prisma.user.create({
    data: user,
  });

  return user;
}

async function generateTestToken(userId: string, username: string) {
  const tokens = await jwtManager.generateTokenPair({
    userId,
    username,
    roles: ['user'],
    permissions: ['read', 'write'],
    sessionId: fc.sample(fc.uuid(), 1)[0],
  });

  return tokens.accessToken;
}

async function createTestProject(userId: string, projectData: any = {}) {
  const defaultProject = {
    id: fc.sample(fc.uuid(), 1)[0],
    userId,
    name: fc.sample(fc.string({ minLength: 1, maxLength: 100 }), 1)[0],
    url: fc.sample(fc.webUrl(), 1)[0],
    description: fc.sample(fc.string({ maxLength: 500 }), 1)[0],
  };

  const project = { ...defaultProject, ...projectData };
  
  await prisma.project.create({
    data: project,
  });

  return project;
}

// Test setup and teardown
beforeAll(async () => {
  // Ensure connections are ready
  await prisma.$connect();
  await redis.ping();
});

beforeEach(async () => {
  // Clean up database
  await prisma.testExecution.deleteMany();
  await prisma.testScenario.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  
  // Clean up Redis
  await redis.flushdb();
});

afterAll(async () => {
  // Clean up and disconnect
  await prisma.testExecution.deleteMany();
  await prisma.testScenario.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
  await redis.flushdb();
});

describe('Project API Endpoints Property Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('Project CRUD Operations Consistency', () => {
    it('should maintain consistency across create-read-update-delete operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 255 }),
            url: fc.webUrl(),
            description: fc.option(fc.string({ maxLength: 1000 })),
            authCredentials: fc.option(fc.record({
              username: fc.string({ minLength: 1, maxLength: 50 }),
              password: fc.string({ minLength: 1, maxLength: 100 }),
            })),
          }),
          async (projectData) => {
            // Create test user
            const user = await createTestUser();
            const token = await generateTestToken(user.id, user.username);

            // CREATE: Create project
            const createResponse = await request(app)
              .post('/api/projects')
              .set('Authorization', `Bearer ${token}`)
              .send(projectData)
              .expect(201);

            const createdProject = createResponse.body;
            expect(createdProject.id).toBeDefined();
            expect(createdProject.name).toBe(projectData.name);
            expect(createdProject.url).toBe(projectData.url);
            expect(createdProject.description).toBe(projectData.description);
            
            if (projectData.authCredentials) {
              expect(createdProject.authCredentials).toEqual(projectData.authCredentials);
            }

            // READ: Get project by ID
            const readResponse = await request(app)
              .get(`/api/projects/${createdProject.id}`)
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            const readProject = readResponse.body;
            expect(readProject.id).toBe(createdProject.id);
            expect(readProject.name).toBe(projectData.name);
            expect(readProject.url).toBe(projectData.url);
            expect(readProject.description).toBe(projectData.description);

            // UPDATE: Update project
            const updateData = {
              name: fc.sample(fc.string({ minLength: 1, maxLength: 255 }), 1)[0],
              description: fc.sample(fc.string({ maxLength: 1000 }), 1)[0],
            };

            const updateResponse = await request(app)
              .put(`/api/projects/${createdProject.id}`)
              .set('Authorization', `Bearer ${token}`)
              .send(updateData)
              .expect(200);

            const updatedProject = updateResponse.body;
            expect(updatedProject.id).toBe(createdProject.id);
            expect(updatedProject.name).toBe(updateData.name);
            expect(updatedProject.description).toBe(updateData.description);
            expect(updatedProject.url).toBe(projectData.url); // Should remain unchanged

            // READ after UPDATE: Verify changes persisted
            const readAfterUpdateResponse = await request(app)
              .get(`/api/projects/${createdProject.id}`)
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            const readAfterUpdate = readAfterUpdateResponse.body;
            expect(readAfterUpdate.name).toBe(updateData.name);
            expect(readAfterUpdate.description).toBe(updateData.description);

            // DELETE: Delete project
            await request(app)
              .delete(`/api/projects/${createdProject.id}`)
              .set('Authorization', `Bearer ${token}`)
              .expect(204);

            // READ after DELETE: Should return 404
            await request(app)
              .get(`/api/projects/${createdProject.id}`)
              .set('Authorization', `Bearer ${token}`)
              .expect(404);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle project listing with pagination consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            projectCount: fc.integer({ min: 5, max: 15 }),
            page: fc.integer({ min: 1, max: 3 }),
            limit: fc.integer({ min: 2, max: 10 }),
          }),
          async ({ projectCount, page, limit }) => {
            // Create test user
            const user = await createTestUser();
            const token = await generateTestToken(user.id, user.username);

            // Create multiple projects
            const projects = [];
            for (let i = 0; i < projectCount; i++) {
              const projectData = {
                name: `Project ${i}`,
                url: `https://example${i}.com`,
                description: `Description for project ${i}`,
              };

              const response = await request(app)
                .post('/api/projects')
                .set('Authorization', `Bearer ${token}`)
                .send(projectData)
                .expect(201);

              projects.push(response.body);
            }

            // List projects with pagination
            const listResponse = await request(app)
              .get('/api/projects')
              .query({ page, limit })
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            const { projects: listedProjects, pagination } = listResponse.body;

            // Verify pagination metadata
            expect(pagination.page).toBe(page);
            expect(pagination.limit).toBe(limit);
            expect(pagination.total).toBe(projectCount);
            expect(pagination.pages).toBe(Math.ceil(projectCount / limit));

            // Verify project count in response
            const expectedCount = Math.min(limit, Math.max(0, projectCount - (page - 1) * limit));
            expect(listedProjects.length).toBe(expectedCount);

            // Verify all returned projects belong to the user
            listedProjects.forEach((project: any) => {
              expect(projects.some(p => p.id === project.id)).toBe(true);
            });
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('Input Validation Properties', () => {
    it('should consistently validate project creation input', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            name: fc.oneof(
              fc.string({ minLength: 1, maxLength: 255 }), // Valid
              fc.string({ minLength: 256 }), // Too long
              fc.constant(''), // Empty
              fc.constant(null), // Null
              fc.integer() // Wrong type
            ),
            url: fc.oneof(
              fc.webUrl(), // Valid
              fc.string({ minLength: 1, maxLength: 50 }), // Invalid URL
              fc.constant(''), // Empty
              fc.constant(null) // Null
            ),
            description: fc.oneof(
              fc.string({ maxLength: 1000 }), // Valid
              fc.string({ minLength: 1001 }), // Too long
              fc.integer() // Wrong type
            ),
          }),
          async (invalidData) => {
            // Create test user
            const user = await createTestUser();
            const token = await generateTestToken(user.id, user.username);

            // Determine if data should be valid
            const isValidName = typeof invalidData.name === 'string' && 
                               invalidData.name.length >= 1 && 
                               invalidData.name.length <= 255;
            const isValidUrl = typeof invalidData.url === 'string' && 
                              /^https?:\/\/.+/.test(invalidData.url);
            const isValidDescription = invalidData.description === undefined ||
                                      invalidData.description === null ||
                                      (typeof invalidData.description === 'string' && 
                                       invalidData.description.length <= 1000);

            const shouldBeValid = isValidName && isValidUrl && isValidDescription;

            const response = await request(app)
              .post('/api/projects')
              .set('Authorization', `Bearer ${token}`)
              .send(invalidData);

            if (shouldBeValid) {
              expect(response.status).toBe(201);
              expect(response.body.name).toBe(invalidData.name);
              expect(response.body.url).toBe(invalidData.url);
            } else {
              expect(response.status).toBe(400);
              expect(response.body.error).toBe('validation_error');
              expect(response.body.details).toBeDefined();
            }
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should validate project update input consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            initialData: fc.record({
              name: fc.string({ minLength: 1, maxLength: 255 }),
              url: fc.webUrl(),
              description: fc.string({ maxLength: 1000 }),
            }),
            updateData: fc.record({
              name: fc.option(fc.oneof(
                fc.string({ minLength: 1, maxLength: 255 }), // Valid
                fc.string({ minLength: 256 }), // Too long
                fc.constant('') // Empty
              )),
              url: fc.option(fc.oneof(
                fc.webUrl(), // Valid
                fc.string({ minLength: 1, maxLength: 50 }) // Invalid URL
              )),
              description: fc.option(fc.oneof(
                fc.string({ maxLength: 1000 }), // Valid
                fc.string({ minLength: 1001 }) // Too long
              )),
            }),
          }),
          async ({ initialData, updateData }) => {
            // Create test user and project
            const user = await createTestUser();
            const token = await generateTestToken(user.id, user.username);
            const project = await createTestProject(user.id, initialData);

            // Determine if update data should be valid
            const isValidName = updateData.name === undefined ||
                               updateData.name === null ||
                               (typeof updateData.name === 'string' && 
                                updateData.name.length >= 1 && 
                                updateData.name.length <= 255);
            const isValidUrl = updateData.url === undefined ||
                              updateData.url === null ||
                              (typeof updateData.url === 'string' && 
                               /^https?:\/\/.+/.test(updateData.url));
            const isValidDescription = updateData.description === undefined ||
                                      updateData.description === null ||
                                      (typeof updateData.description === 'string' && 
                                       updateData.description.length <= 1000);

            const shouldBeValid = isValidName && isValidUrl && isValidDescription;

            const response = await request(app)
              .put(`/api/projects/${project.id}`)
              .set('Authorization', `Bearer ${token}`)
              .send(updateData);

            if (shouldBeValid) {
              expect(response.status).toBe(200);
              
              // Verify only provided fields were updated
              if (updateData.name !== undefined && updateData.name !== null) {
                expect(response.body.name).toBe(updateData.name);
              } else {
                expect(response.body.name).toBe(initialData.name);
              }
              
              if (updateData.url !== undefined && updateData.url !== null) {
                expect(response.body.url).toBe(updateData.url);
              } else {
                expect(response.body.url).toBe(initialData.url);
              }
            } else {
              expect(response.status).toBe(400);
              expect(response.body.error).toBe('validation_error');
            }
          }
        ),
        { numRuns: 25 }
      );
    });
  });

  describe('Authorization Enforcement Properties', () => {
    it('should enforce project ownership across all operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            projectData: fc.record({
              name: fc.string({ minLength: 1, maxLength: 255 }),
              url: fc.webUrl(),
              description: fc.string({ maxLength: 1000 }),
            }),
          }),
          async ({ projectData }) => {
            // Create two different users
            const owner = await createTestUser();
            const otherUser = await createTestUser();
            
            const ownerToken = await generateTestToken(owner.id, owner.username);
            const otherToken = await generateTestToken(otherUser.id, otherUser.username);

            // Owner creates project
            const createResponse = await request(app)
              .post('/api/projects')
              .set('Authorization', `Bearer ${ownerToken}`)
              .send(projectData)
              .expect(201);

            const project = createResponse.body;

            // Owner should be able to read their project
            await request(app)
              .get(`/api/projects/${project.id}`)
              .set('Authorization', `Bearer ${ownerToken}`)
              .expect(200);

            // Other user should NOT be able to read the project
            await request(app)
              .get(`/api/projects/${project.id}`)
              .set('Authorization', `Bearer ${otherToken}`)
              .expect(404); // Should return 404, not 403, to avoid information disclosure

            // Other user should NOT be able to update the project
            await request(app)
              .put(`/api/projects/${project.id}`)
              .set('Authorization', `Bearer ${otherToken}`)
              .send({ name: 'Hacked Name' })
              .expect(404);

            // Other user should NOT be able to delete the project
            await request(app)
              .delete(`/api/projects/${project.id}`)
              .set('Authorization', `Bearer ${otherToken}`)
              .expect(404);

            // Owner should still be able to access their project
            await request(app)
              .get(`/api/projects/${project.id}`)
              .set('Authorization', `Bearer ${ownerToken}`)
              .expect(200);
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should require authentication for all protected endpoints', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            projectData: fc.record({
              name: fc.string({ minLength: 1, maxLength: 255 }),
              url: fc.webUrl(),
            }),
          }),
          async ({ projectData }) => {
            // Create test user and project
            const user = await createTestUser();
            const token = await generateTestToken(user.id, user.username);
            const project = await createTestProject(user.id, projectData);

            // Test all endpoints without authentication
            const endpoints = [
              { method: 'get', path: '/api/projects' },
              { method: 'post', path: '/api/projects', body: projectData },
              { method: 'get', path: `/api/projects/${project.id}` },
              { method: 'put', path: `/api/projects/${project.id}`, body: { name: 'Updated' } },
              { method: 'delete', path: `/api/projects/${project.id}` },
              { method: 'get', path: '/api/users/me' },
              { method: 'put', path: '/api/users/me', body: { name: 'Updated' } },
            ];

            for (const endpoint of endpoints) {
              let req = request(app)[endpoint.method as keyof typeof request](endpoint.path);
              
              if (endpoint.body) {
                req = req.send(endpoint.body);
              }

              const response = await req;
              expect(response.status).toBe(401);
              expect(response.body.error).toBe('missing_token');
            }

            // Test with invalid token
            for (const endpoint of endpoints) {
              let req = request(app)[endpoint.method as keyof typeof request](endpoint.path)
                .set('Authorization', 'Bearer invalid_token');
              
              if (endpoint.body) {
                req = req.send(endpoint.body);
              }

              const response = await req;
              expect([401, 403]).toContain(response.status);
            }

            // Test with valid token should work (at least not return auth errors)
            const validResponse = await request(app)
              .get('/api/projects')
              .set('Authorization', `Bearer ${token}`);
            
            expect(validResponse.status).not.toBe(401);
            expect(validResponse.status).not.toBe(403);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});

describe('User API Endpoints Property Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('User Profile Operations Consistency', () => {
    it('should maintain consistency in user profile operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            initialData: fc.record({
              username: fc.string({ minLength: 3, maxLength: 20 }),
              email: fc.emailAddress(),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              bio: fc.option(fc.string({ maxLength: 500 })),
              location: fc.option(fc.string({ maxLength: 100 })),
              website: fc.option(fc.webUrl()),
            }),
            updateData: fc.record({
              name: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
              bio: fc.option(fc.string({ maxLength: 500 })),
              location: fc.option(fc.string({ maxLength: 100 })),
            }),
          }),
          async ({ initialData, updateData }) => {
            // Create test user
            const user = await createTestUser(initialData);
            const token = await generateTestToken(user.id, user.username);

            // READ: Get user profile
            const readResponse = await request(app)
              .get('/api/users/me')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            const profile = readResponse.body;
            expect(profile.id).toBe(user.id);
            expect(profile.username).toBe(initialData.username);
            expect(profile.email).toBe(initialData.email);
            expect(profile.name).toBe(initialData.name);

            // UPDATE: Update user profile
            const updateResponse = await request(app)
              .put('/api/users/me')
              .set('Authorization', `Bearer ${token}`)
              .send(updateData)
              .expect(200);

            const updatedProfile = updateResponse.body;
            expect(updatedProfile.id).toBe(user.id);
            
            // Verify updates
            if (updateData.name !== undefined) {
              expect(updatedProfile.name).toBe(updateData.name);
            } else {
              expect(updatedProfile.name).toBe(initialData.name);
            }
            
            if (updateData.bio !== undefined) {
              expect(updatedProfile.bio).toBe(updateData.bio);
            }
            
            if (updateData.location !== undefined) {
              expect(updatedProfile.location).toBe(updateData.location);
            }

            // READ after UPDATE: Verify changes persisted
            const readAfterUpdateResponse = await request(app)
              .get('/api/users/me')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            const profileAfterUpdate = readAfterUpdateResponse.body;
            expect(profileAfterUpdate.name).toBe(updatedProfile.name);
            expect(profileAfterUpdate.bio).toBe(updatedProfile.bio);
            expect(profileAfterUpdate.location).toBe(updatedProfile.location);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle user statistics consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            projectCount: fc.integer({ min: 0, max: 10 }),
          }),
          async ({ projectCount }) => {
            // Create test user
            const user = await createTestUser();
            const token = await generateTestToken(user.id, user.username);

            // Create projects for user
            for (let i = 0; i < projectCount; i++) {
              await createTestProject(user.id, {
                name: `Project ${i}`,
                url: `https://example${i}.com`,
              });
            }

            // Get user statistics
            const statsResponse = await request(app)
              .get('/api/users/me/stats')
              .set('Authorization', `Bearer ${token}`)
              .expect(200);

            const stats = statsResponse.body;
            expect(stats.projectCount).toBe(projectCount);
            expect(stats.scenarioCount).toBe(0); // No scenarios created
            expect(stats.executions.total).toBe(0); // No executions
            expect(typeof stats.executions.byStatus).toBe('object');
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('User Input Validation Properties', () => {
    it('should validate user profile updates consistently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            username: fc.option(fc.oneof(
              fc.string({ minLength: 1, maxLength: 50 }), // Valid
              fc.string({ minLength: 51 }), // Too long
              fc.constant(''), // Empty
              fc.string().filter(s => /[^a-zA-Z0-9_-]/.test(s)) // Invalid characters
            )),
            email: fc.option(fc.oneof(
              fc.emailAddress(), // Valid
              fc.string({ minLength: 1, maxLength: 50 }) // Invalid email
            )),
            name: fc.option(fc.oneof(
              fc.string({ minLength: 1, maxLength: 100 }), // Valid
              fc.string({ minLength: 101 }), // Too long
              fc.constant('') // Empty
            )),
            bio: fc.option(fc.oneof(
              fc.string({ maxLength: 500 }), // Valid
              fc.string({ minLength: 501 }) // Too long
            )),
          }),
          async (updateData) => {
            // Create test user
            const user = await createTestUser();
            const token = await generateTestToken(user.id, user.username);

            // Determine if data should be valid
            const isValidUsername = updateData.username === undefined ||
                                   updateData.username === null ||
                                   (typeof updateData.username === 'string' && 
                                    updateData.username.length >= 1 && 
                                    updateData.username.length <= 50 &&
                                    /^[a-zA-Z0-9_-]+$/.test(updateData.username));
            
            const isValidEmail = updateData.email === undefined ||
                                 updateData.email === null ||
                                 (typeof updateData.email === 'string' && 
                                  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updateData.email));
            
            const isValidName = updateData.name === undefined ||
                               updateData.name === null ||
                               (typeof updateData.name === 'string' && 
                                updateData.name.length >= 1 && 
                                updateData.name.length <= 100);
            
            const isValidBio = updateData.bio === undefined ||
                              updateData.bio === null ||
                              (typeof updateData.bio === 'string' && 
                               updateData.bio.length <= 500);

            const shouldBeValid = isValidUsername && isValidEmail && isValidName && isValidBio;

            const response = await request(app)
              .put('/api/users/me')
              .set('Authorization', `Bearer ${token}`)
              .send(updateData);

            if (shouldBeValid) {
              expect(response.status).toBe(200);
            } else {
              expect(response.status).toBe(400);
              expect(response.body.error).toBe('validation_error');
            }
          }
        ),
        { numRuns: 25 }
      );
    });
  });
});

describe('Cross-Entity Consistency Properties', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
  });

  it('should maintain referential integrity across user and project operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          projectCount: fc.integer({ min: 1, max: 5 }),
        }),
        async ({ projectCount }) => {
          // Create test user
          const user = await createTestUser();
          const token = await generateTestToken(user.id, user.username);

          // Create projects
          const projects = [];
          for (let i = 0; i < projectCount; i++) {
            const response = await request(app)
              .post('/api/projects')
              .set('Authorization', `Bearer ${token}`)
              .send({
                name: `Project ${i}`,
                url: `https://example${i}.com`,
                description: `Description ${i}`,
              })
              .expect(201);

            projects.push(response.body);
          }

          // Verify user stats reflect created projects
          const statsResponse = await request(app)
            .get('/api/users/me/stats')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

          expect(statsResponse.body.projectCount).toBe(projectCount);

          // Verify project list shows all projects
          const listResponse = await request(app)
            .get('/api/projects')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

          expect(listResponse.body.projects.length).toBe(projectCount);
          expect(listResponse.body.pagination.total).toBe(projectCount);

          // Delete some projects
          const projectsToDelete = projects.slice(0, Math.floor(projectCount / 2));
          
          for (const project of projectsToDelete) {
            await request(app)
              .delete(`/api/projects/${project.id}`)
              .set('Authorization', `Bearer ${token}`)
              .expect(204);
          }

          // Verify user stats updated
          const updatedStatsResponse = await request(app)
            .get('/api/users/me/stats')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

          const remainingCount = projectCount - projectsToDelete.length;
          expect(updatedStatsResponse.body.projectCount).toBe(remainingCount);

          // Verify project list updated
          const updatedListResponse = await request(app)
            .get('/api/projects')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

          expect(updatedListResponse.body.projects.length).toBe(remainingCount);
          expect(updatedListResponse.body.pagination.total).toBe(remainingCount);
        }
      ),
      { numRuns: 10 }
    );
  });
});
// Property-based tests for database operations
// **Feature: autoqa-pilot, Property 1: Project CRUD Operations Consistency**
// **Validates: Requirements 1.4, 1.6**

import * as fc from 'fast-check';
import { prisma, withTransaction } from '../client';
import { projectArbitrary, userArbitrary } from '@autoqa/testing-utils';
import { TestDataIsolation } from '@autoqa/testing-utils';

describe('Database Operations Property Tests', () => {
  let testIsolation: TestDataIsolation;
  
  beforeEach(() => {
    testIsolation = new TestDataIsolation();
  });
  
  afterEach(async () => {
    await testIsolation.cleanupAll();
  });
  
  describe('Property 1: Project CRUD Operations Consistency', () => {
    it('should maintain data consistency across CRUD operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          userArbitrary,
          projectArbitrary,
          async (userData, projectData) => {
            // Create user first (required for project)
            const user = await prisma.user.create({
              data: {
                githubId: userData.githubId,
                username: userData.username,
                email: userData.email,
                avatarUrl: userData.avatarUrl,
              },
            });
            
            testIsolation.addResource('user', user.id, async () => {
              await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
            });
            
            // Create project
            const createdProject = await prisma.project.create({
              data: {
                userId: user.id,
                name: projectData.name,
                url: projectData.url,
                description: projectData.description || null,
                settings: projectData.settings,
              },
            });
            
            testIsolation.addResource('project', createdProject.id, async () => {
              await prisma.project.delete({ where: { id: createdProject.id } }).catch(() => {});
            });
            
            // Read project back
            const retrievedProject = await prisma.project.findUnique({
              where: { id: createdProject.id },
            });
            
            // Verify consistency
            expect(retrievedProject).not.toBeNull();
            expect(retrievedProject!.name).toBe(projectData.name);
            expect(retrievedProject!.url).toBe(projectData.url);
            expect(retrievedProject!.userId).toBe(user.id);
            expect(retrievedProject!.isActive).toBe(true); // Default value
            
            // Update project
            const updatedName = `Updated ${projectData.name}`;
            const updatedProject = await prisma.project.update({
              where: { id: createdProject.id },
              data: { name: updatedName },
            });
            
            // Verify update consistency
            expect(updatedProject.name).toBe(updatedName);
            expect(updatedProject.updatedAt.getTime()).toBeGreaterThan(
              createdProject.updatedAt.getTime()
            );
            
            // List projects for user
            const userProjects = await prisma.project.findMany({
              where: { userId: user.id, isActive: true },
            });
            
            // Verify project appears in list
            expect(userProjects).toHaveLength(1);
            expect(userProjects[0].id).toBe(createdProject.id);
            
            return true;
          }
        ),
        { numRuns: 50, timeout: 30000 }
      );
    });
    
    it('should handle concurrent project operations without race conditions', async () => {
      await fc.assert(
        fc.asyncProperty(
          userArbitrary,
          fc.array(projectArbitrary, { minLength: 2, maxLength: 5 }),
          async (userData, projectsData) => {
            // Create user
            const user = await prisma.user.create({
              data: {
                githubId: userData.githubId,
                username: userData.username,
                email: userData.email,
              },
            });
            
            testIsolation.addResource('user', user.id, async () => {
              await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
            });
            
            // Create projects concurrently
            const createPromises = projectsData.map(projectData =>
              prisma.project.create({
                data: {
                  userId: user.id,
                  name: projectData.name,
                  url: projectData.url,
                  settings: projectData.settings,
                },
              })
            );
            
            const createdProjects = await Promise.all(createPromises);
            
            // Add cleanup for all projects
            createdProjects.forEach(project => {
              testIsolation.addResource('project', project.id, async () => {
                await prisma.project.delete({ where: { id: project.id } }).catch(() => {});
              });
            });
            
            // Verify all projects were created
            expect(createdProjects).toHaveLength(projectsData.length);
            
            // Verify no duplicate names (if they were unique in input)
            const uniqueInputNames = new Set(projectsData.map(p => p.name));
            const createdNames = new Set(createdProjects.map(p => p.name));
            
            if (uniqueInputNames.size === projectsData.length) {
              expect(createdNames.size).toBe(projectsData.length);
            }
            
            // Update projects concurrently
            const updatePromises = createdProjects.map((project, index) =>
              prisma.project.update({
                where: { id: project.id },
                data: { name: `Updated ${project.name} ${index}` },
              })
            );
            
            const updatedProjects = await Promise.all(updatePromises);
            
            // Verify all updates succeeded
            expect(updatedProjects).toHaveLength(createdProjects.length);
            updatedProjects.forEach((project, index) => {
              expect(project.name).toContain('Updated');
              expect(project.name).toContain(index.toString());
            });
            
            return true;
          }
        ),
        { numRuns: 20, timeout: 45000 }
      );
    });
    
    it('should maintain referential integrity on cascade deletes', async () => {
      await fc.assert(
        fc.asyncProperty(
          userArbitrary,
          projectArbitrary,
          async (userData, projectData) => {
            // Create user and project
            const user = await prisma.user.create({
              data: {
                githubId: userData.githubId,
                username: userData.username,
                email: userData.email,
              },
            });
            
            const project = await prisma.project.create({
              data: {
                userId: user.id,
                name: projectData.name,
                url: projectData.url,
                settings: projectData.settings,
              },
            });
            
            // Create related test scenario
            const scenario = await prisma.testScenario.create({
              data: {
                projectId: project.id,
                name: 'Test Scenario',
                naturalLanguageInput: 'Click login button',
                generatedCode: 'await page.click("#login")',
              },
            });
            
            testIsolation.addResource('user', user.id, async () => {
              await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
            });
            
            // Verify scenario exists
            const scenarioExists = await prisma.testScenario.findUnique({
              where: { id: scenario.id },
            });
            expect(scenarioExists).not.toBeNull();
            
            // Delete user (should cascade to project and scenario)
            await prisma.user.delete({ where: { id: user.id } });
            
            // Verify cascade delete worked
            const projectExists = await prisma.project.findUnique({
              where: { id: project.id },
            });
            expect(projectExists).toBeNull();
            
            const scenarioAfterDelete = await prisma.testScenario.findUnique({
              where: { id: scenario.id },
            });
            expect(scenarioAfterDelete).toBeNull();
            
            return true;
          }
        ),
        { numRuns: 30, timeout: 30000 }
      );
    });
    
    it('should handle soft deletes correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          userArbitrary,
          projectArbitrary,
          async (userData, projectData) => {
            // Create user and project
            const user = await prisma.user.create({
              data: {
                githubId: userData.githubId,
                username: userData.username,
                email: userData.email,
              },
            });
            
            const project = await prisma.project.create({
              data: {
                userId: user.id,
                name: projectData.name,
                url: projectData.url,
                settings: projectData.settings,
              },
            });
            
            testIsolation.addResource('user', user.id, async () => {
              await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
            });
            
            // Soft delete project
            const softDeletedProject = await prisma.project.update({
              where: { id: project.id },
              data: { deletedAt: new Date() },
            });
            
            expect(softDeletedProject.deletedAt).not.toBeNull();
            
            // Verify project is excluded from active queries
            const activeProjects = await prisma.project.findMany({
              where: { userId: user.id, deletedAt: null },
            });
            
            expect(activeProjects).toHaveLength(0);
            
            // Verify project still exists in database
            const allProjects = await prisma.project.findMany({
              where: { userId: user.id },
            });
            
            expect(allProjects).toHaveLength(1);
            expect(allProjects[0].id).toBe(project.id);
            
            return true;
          }
        ),
        { numRuns: 30, timeout: 30000 }
      );
    });
  });
  
  describe('Property 2: Transaction Consistency', () => {
    it('should maintain ACID properties in transactions', async () => {
      await fc.assert(
        fc.asyncProperty(
          userArbitrary,
          fc.array(projectArbitrary, { minLength: 2, maxLength: 3 }),
          async (userData, projectsData) => {
            // Create user
            const user = await prisma.user.create({
              data: {
                githubId: userData.githubId,
                username: userData.username,
                email: userData.email,
              },
            });
            
            testIsolation.addResource('user', user.id, async () => {
              await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
            });
            
            // Test successful transaction
            const createdProjects = await withTransaction(async (tx) => {
              const projects = [];
              for (const projectData of projectsData) {
                const project = await tx.project.create({
                  data: {
                    userId: user.id,
                    name: projectData.name,
                    url: projectData.url,
                    settings: projectData.settings,
                  },
                });
                projects.push(project);
              }
              return projects;
            });
            
            // Add cleanup
            createdProjects.forEach(project => {
              testIsolation.addResource('project', project.id, async () => {
                await prisma.project.delete({ where: { id: project.id } }).catch(() => {});
              });
            });
            
            // Verify all projects were created
            expect(createdProjects).toHaveLength(projectsData.length);
            
            const dbProjects = await prisma.project.findMany({
              where: { userId: user.id },
            });
            expect(dbProjects).toHaveLength(projectsData.length);
            
            // Test failed transaction (should rollback)
            const initialProjectCount = await prisma.project.count({
              where: { userId: user.id },
            });
            
            try {
              await withTransaction(async (tx) => {
                // Create a project
                await tx.project.create({
                  data: {
                    userId: user.id,
                    name: 'Should be rolled back',
                    url: 'https://rollback.example.com',
                  },
                });
                
                // Force an error to trigger rollback
                throw new Error('Intentional error for rollback test');
              });
            } catch (error) {
              // Expected error
              expect(error.message).toBe('Intentional error for rollback test');
            }
            
            // Verify rollback occurred
            const finalProjectCount = await prisma.project.count({
              where: { userId: user.id },
            });
            expect(finalProjectCount).toBe(initialProjectCount);
            
            return true;
          }
        ),
        { numRuns: 20, timeout: 45000 }
      );
    });
  });
  
  describe('Property 3: Connection Pool Behavior', () => {
    it('should handle connection pool exhaustion gracefully', async () => {
      // This test verifies that the connection pool doesn't leak connections
      const initialConnections = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()
      `;
      
      const initialCount = Number(initialConnections[0].count);
      
      // Create many concurrent operations
      const operations = Array.from({ length: 50 }, (_, i) =>
        prisma.user.findMany({
          where: { username: { contains: `test-${i}` } },
          take: 1,
        })
      );
      
      await Promise.all(operations);
      
      // Wait a bit for connections to be returned to pool
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const finalConnections = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()
      `;
      
      const finalCount = Number(finalConnections[0].count);
      
      // Connection count should not have grown significantly
      expect(finalCount - initialCount).toBeLessThanOrEqual(5);
    });
  });
});
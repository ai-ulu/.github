// Database migration utilities and helpers
// Production-ready migration management with rollback support

import { execSync } from 'child_process';
import { prisma } from './client';

export interface MigrationInfo {
  id: string;
  checksum: string;
  finished_at: Date | null;
  migration_name: string;
  logs: string | null;
  rolled_back_at: Date | null;
  started_at: Date;
  applied_steps_count: number;
}

export class MigrationManager {
  /**
   * Get current migration status
   */
  static async getMigrationStatus(): Promise<{
    current: string;
    pending: string[];
    applied: MigrationInfo[];
  }> {
    try {
      // Get applied migrations
      const applied = await prisma.$queryRaw<MigrationInfo[]>`
        SELECT * FROM _prisma_migrations 
        ORDER BY started_at DESC
      `;
      
      // Get current migration (last applied)
      const current = applied.length > 0 ? applied[0].migration_name : 'none';
      
      // Get pending migrations (this would require reading migration files)
      const pending: string[] = []; // TODO: Implement pending migration detection
      
      return {
        current,
        pending,
        applied,
      };
    } catch (error) {
      throw new Error(`Failed to get migration status: ${error}`);
    }
  }
  
  /**
   * Apply pending migrations
   */
  static async migrate(): Promise<void> {
    try {
      console.log('🔄 Applying database migrations...');
      
      // Run Prisma migrate deploy
      execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        env: { ...process.env },
      });
      
      console.log('✅ Database migrations applied successfully');
    } catch (error) {
      throw new Error(`Migration failed: ${error}`);
    }
  }
  
  /**
   * Create a new migration
   */
  static async createMigration(name: string): Promise<void> {
    try {
      console.log(`🔄 Creating migration: ${name}`);
      
      execSync(`npx prisma migrate dev --name ${name}`, {
        stdio: 'inherit',
        env: { ...process.env },
      });
      
      console.log(`✅ Migration created: ${name}`);
    } catch (error) {
      throw new Error(`Failed to create migration: ${error}`);
    }
  }
  
  /**
   * Reset database (development only)
   */
  static async reset(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database reset is not allowed in production');
    }
    
    try {
      console.log('🔄 Resetting database...');
      
      execSync('npx prisma migrate reset --force', {
        stdio: 'inherit',
        env: { ...process.env },
      });
      
      console.log('✅ Database reset completed');
    } catch (error) {
      throw new Error(`Database reset failed: ${error}`);
    }
  }
  
  /**
   * Validate migration integrity
   */
  static async validateMigrations(): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    try {
      // Check if all migrations have been applied
      const status = await this.getMigrationStatus();
      
      if (status.pending.length > 0) {
        issues.push(`${status.pending.length} pending migrations found`);
      }
      
      // Check for failed migrations
      const failedMigrations = status.applied.filter(m => m.finished_at === null);
      if (failedMigrations.length > 0) {
        issues.push(`${failedMigrations.length} failed migrations found`);
      }
      
      // Check for rolled back migrations
      const rolledBackMigrations = status.applied.filter(m => m.rolled_back_at !== null);
      if (rolledBackMigrations.length > 0) {
        issues.push(`${rolledBackMigrations.length} rolled back migrations found`);
      }
      
      return {
        valid: issues.length === 0,
        issues,
      };
    } catch (error) {
      issues.push(`Failed to validate migrations: ${error}`);
      return {
        valid: false,
        issues,
      };
    }
  }
  
  /**
   * Get migration history
   */
  static async getMigrationHistory(): Promise<MigrationInfo[]> {
    try {
      return await prisma.$queryRaw<MigrationInfo[]>`
        SELECT * FROM _prisma_migrations 
        ORDER BY started_at DESC
      `;
    } catch (error) {
      throw new Error(`Failed to get migration history: ${error}`);
    }
  }
}

/**
 * Database schema validation utilities
 */
export class SchemaValidator {
  /**
   * Validate database schema matches Prisma schema
   */
  static async validateSchema(): Promise<{
    valid: boolean;
    differences: string[];
  }> {
    const differences: string[] = [];
    
    try {
      // This would compare the actual database schema with the Prisma schema
      // For now, we'll do basic checks
      
      // Check if required tables exist
      const requiredTables = [
        'users',
        'projects',
        'test_scenarios',
        'test_runs',
        'test_executions',
        'execution_logs',
        'test_artifacts',
        'audit_log',
      ];
      
      for (const table of requiredTables) {
        const exists = await this.tableExists(table);
        if (!exists) {
          differences.push(`Missing table: ${table}`);
        }
      }
      
      // Check if required extensions are installed
      const requiredExtensions = ['uuid-ossp', 'pgcrypto'];
      
      for (const extension of requiredExtensions) {
        const exists = await this.extensionExists(extension);
        if (!exists) {
          differences.push(`Missing extension: ${extension}`);
        }
      }
      
      return {
        valid: differences.length === 0,
        differences,
      };
    } catch (error) {
      differences.push(`Schema validation failed: ${error}`);
      return {
        valid: false,
        differences,
      };
    }
  }
  
  private static async tableExists(tableName: string): Promise<boolean> {
    try {
      const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
        )
      `;
      
      return result[0]?.exists || false;
    } catch {
      return false;
    }
  }
  
  private static async extensionExists(extensionName: string): Promise<boolean> {
    try {
      const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM pg_extension 
          WHERE extname = ${extensionName}
        )
      `;
      
      return result[0]?.exists || false;
    } catch {
      return false;
    }
  }
  
  /**
   * Get database statistics
   */
  static async getDatabaseStats(): Promise<{
    tables: Array<{
      name: string;
      rowCount: number;
      size: string;
    }>;
    totalSize: string;
    connectionCount: number;
  }> {
    try {
      // Get table statistics
      const tableStats = await prisma.$queryRaw<Array<{
        table_name: string;
        row_count: bigint;
        size: string;
      }>>`
        SELECT 
          schemaname||'.'||tablename as table_name,
          n_tup_ins + n_tup_upd + n_tup_del as row_count,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
        FROM pg_stat_user_tables 
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `;
      
      // Get total database size
      const dbSize = await prisma.$queryRaw<Array<{ size: string }>>`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `;
      
      // Get connection count
      const connections = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) as count FROM pg_stat_activity 
        WHERE datname = current_database()
      `;
      
      return {
        tables: tableStats.map(t => ({
          name: t.table_name,
          rowCount: Number(t.row_count),
          size: t.size,
        })),
        totalSize: dbSize[0]?.size || '0 bytes',
        connectionCount: Number(connections[0]?.count || 0),
      };
    } catch (error) {
      throw new Error(`Failed to get database stats: ${error}`);
    }
  }
}

/**
 * Database maintenance utilities
 */
export class DatabaseMaintenance {
  /**
   * Analyze database performance
   */
  static async analyzePerformance(): Promise<{
    slowQueries: Array<{
      query: string;
      calls: number;
      totalTime: number;
      avgTime: number;
    }>;
    indexUsage: Array<{
      table: string;
      index: string;
      scans: number;
      tuples: number;
    }>;
  }> {
    try {
      // Get slow queries from pg_stat_statements
      const slowQueries = await prisma.$queryRaw<Array<{
        query: string;
        calls: bigint;
        total_time: number;
        mean_time: number;
      }>>`
        SELECT 
          query,
          calls,
          total_time,
          mean_time
        FROM pg_stat_statements 
        WHERE calls > 10
        ORDER BY mean_time DESC 
        LIMIT 10
      `;
      
      // Get index usage statistics
      const indexUsage = await prisma.$queryRaw<Array<{
        schemaname: string;
        tablename: string;
        indexname: string;
        idx_scan: bigint;
        idx_tup_read: bigint;
      }>>`
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan,
          idx_tup_read
        FROM pg_stat_user_indexes 
        ORDER BY idx_scan DESC
      `;
      
      return {
        slowQueries: slowQueries.map(q => ({
          query: q.query,
          calls: Number(q.calls),
          totalTime: q.total_time,
          avgTime: q.mean_time,
        })),
        indexUsage: indexUsage.map(i => ({
          table: `${i.schemaname}.${i.tablename}`,
          index: i.indexname,
          scans: Number(i.idx_scan),
          tuples: Number(i.idx_tup_read),
        })),
      };
    } catch (error) {
      // pg_stat_statements might not be available
      console.warn('Performance analysis requires pg_stat_statements extension');
      return {
        slowQueries: [],
        indexUsage: [],
      };
    }
  }
  
  /**
   * Vacuum and analyze database
   */
  static async vacuum(analyze: boolean = true): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      console.warn('Manual vacuum in production should be done carefully');
    }
    
    try {
      console.log('🔄 Running database vacuum...');
      
      if (analyze) {
        await prisma.$executeRaw`VACUUM ANALYZE`;
        console.log('✅ Database vacuum and analyze completed');
      } else {
        await prisma.$executeRaw`VACUUM`;
        console.log('✅ Database vacuum completed');
      }
    } catch (error) {
      throw new Error(`Vacuum failed: ${error}`);
    }
  }
  
  /**
   * Reindex database tables
   */
  static async reindex(tableName?: string): Promise<void> {
    try {
      console.log('🔄 Reindexing database...');
      
      if (tableName) {
        await prisma.$executeRaw`REINDEX TABLE ${Prisma.raw(tableName)}`;
        console.log(`✅ Reindexed table: ${tableName}`);
      } else {
        await prisma.$executeRaw`REINDEX DATABASE ${Prisma.raw(process.env.DATABASE_NAME || 'autoqa_pilot')}`;
        console.log('✅ Database reindex completed');
      }
    } catch (error) {
      throw new Error(`Reindex failed: ${error}`);
    }
  }
}
import { Server } from 'socket.io';
import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs/promises';

export interface TestFile {
  path: string;
  name: string;
  relativePath: string;
  tests: TestInfo[];
  lastModified: number;
}

export interface TestInfo {
  name: string;
  line: number;
  type: 'test' | 'describe';
}

export class FileWatcher {
  private watchers = new Map<string, chokidar.FSWatcher>();
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  watchDirectory(directory: string, socketId: string): void {
    // Stop existing watcher for this socket
    this.unwatchDirectory(socketId);

    const testPattern = path.join(directory, '**/*.{spec,test}.{ts,js,tsx,jsx}');
    
    const watcher = chokidar.watch(testPattern, {
      ignored: /node_modules/,
      persistent: true,
      ignoreInitial: false
    });

    watcher
      .on('add', async (filePath) => {
        const testFile = await this.parseTestFile(filePath, directory);
        this.io.to(socketId).emit('file-added', testFile);
      })
      .on('change', async (filePath) => {
        const testFile = await this.parseTestFile(filePath, directory);
        this.io.to(socketId).emit('file-changed', testFile);
      })
      .on('unlink', (filePath) => {
        const relativePath = path.relative(directory, filePath);
        this.io.to(socketId).emit('file-removed', { path: filePath, relativePath });
      })
      .on('error', (error) => {
        this.io.to(socketId).emit('watch-error', { error: error.message });
      });

    this.watchers.set(socketId, watcher);
  }

  unwatchDirectory(socketId: string): void {
    const watcher = this.watchers.get(socketId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(socketId);
    }
  }

  private async parseTestFile(filePath: string, baseDirectory: string): Promise<TestFile> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);
      
      const tests = this.extractTests(content);
      const relativePath = path.relative(baseDirectory, filePath);
      
      return {
        path: filePath,
        name: path.basename(filePath),
        relativePath,
        tests,
        lastModified: stats.mtime.getTime()
      };
    } catch (error) {
      console.error('Error parsing test file:', error);
      return {
        path: filePath,
        name: path.basename(filePath),
        relativePath: path.relative(baseDirectory, filePath),
        tests: [],
        lastModified: 0
      };
    }
  }

  private extractTests(content: string): TestInfo[] {
    const tests: TestInfo[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Match test() calls
      const testMatch = line.match(/test\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (testMatch) {
        tests.push({
          name: testMatch[1],
          line: i + 1,
          type: 'test'
        });
      }

      // Match describe() calls
      const describeMatch = line.match(/describe\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (describeMatch) {
        tests.push({
          name: describeMatch[1],
          line: i + 1,
          type: 'describe'
        });
      }

      // Match test.describe() calls
      const testDescribeMatch = line.match(/test\.describe\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (testDescribeMatch) {
        tests.push({
          name: testDescribeMatch[1],
          line: i + 1,
          type: 'describe'
        });
      }
    }

    return tests;
  }

  async getTestFiles(directory: string): Promise<TestFile[]> {
    try {
      const testPattern = path.join(directory, '**/*.{spec,test}.{ts,js,tsx,jsx}');
      const glob = await import('glob');
      const files = await glob.glob(testPattern, { ignore: '**/node_modules/**' });
      
      const testFiles = await Promise.all(
        files.map(file => this.parseTestFile(file, directory))
      );

      return testFiles;
    } catch (error) {
      console.error('Error getting test files:', error);
      return [];
    }
  }
}
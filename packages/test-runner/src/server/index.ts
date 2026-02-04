import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { TestExecutor } from './testExecutor';
import { FileWatcher } from './fileWatcher';
import { apiRoutes } from './routes/api';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3333;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Initialize services
const testExecutor = new TestExecutor(io);
const fileWatcher = new FileWatcher(io);

// API routes
app.use('/api', apiRoutes(testExecutor, fileWatcher));

// Serve React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  // Test execution events
  socket.on('run-test', async (data) => {
    try {
      await testExecutor.runTest(data.testFile, data.testName, socket.id);
    } catch (error) {
      socket.emit('test-error', { error: error.message });
    }
  });

  socket.on('stop-test', (data) => {
    testExecutor.stopTest(data.executionId);
  });

  socket.on('debug-test', async (data) => {
    try {
      await testExecutor.debugTest(data.testFile, data.testName, socket.id);
    } catch (error) {
      socket.emit('test-error', { error: error.message });
    }
  });

  // File watching events
  socket.on('watch-files', (data) => {
    fileWatcher.watchDirectory(data.directory, socket.id);
  });

  socket.on('unwatch-files', () => {
    fileWatcher.unwatchDirectory(socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 AutoQA Test Runner running on http://localhost:${PORT}`);
  console.log(`📁 Serving from: ${path.join(__dirname, '../client')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { app, server, io };
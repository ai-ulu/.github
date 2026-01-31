/**
 * WebSocket Manager for Real-time Communication
 * **Validates: Requirements 5.3**
 * 
 * Provides real-time execution monitoring with:
 * - WebSocket connections for live updates
 * - Client authentication and authorization
 * - Message broadcasting and targeted messaging
 * - Connection management and cleanup
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './utils/logger';

export interface WebSocketClient {
  id: string;
  ws: WebSocket;
  userId?: string;
  projectId?: string;
  subscriptions: Set<string>;
  lastPing: Date;
  authenticated: boolean;
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: Date;
  clientId?: string;
}

export class WebSocketManager extends EventEmitter {
  private server: WebSocket.Server;
  private clients: Map<string, WebSocketClient>;
  private pingInterval: NodeJS.Timeout;

  constructor(port: number = 8080) {
    super();
    
    this.clients = new Map();
    
    // Create WebSocket server
    this.server = new WebSocket.Server({
      port,
      verifyClient: this.verifyClient.bind(this),
    });

    this.setupServerEvents();
    this.startPingInterval();

    logger.info('WebSocket server started', { port });
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(type: string, data: any, filter?: (client: WebSocketClient) => boolean): void {
    const message: WebSocketMessage = {
      type,
      data,
      timestamp: new Date(),
    };

    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        if (!filter || filter(client)) {
          client.ws.send(messageStr);
          sentCount++;
        }
      }
    }

    logger.debug('Broadcast message sent', {
      type,
      clientCount: sentCount,
      totalClients: this.clients.size,
    });
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId: string, type: string, data: any): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message: WebSocketMessage = {
      type,
      data,
      timestamp: new Date(),
      clientId,
    };

    client.ws.send(JSON.stringify(message));
    return true;
  }

  /**
   * Send message to clients subscribed to a specific execution
   */
  sendToSubscribers(executionId: string, type: string, data: any): void {
    this.broadcast(type, data, (client) => 
      client.subscriptions.has(executionId)
    );
  }

  /**
   * Send message to clients of a specific user
   */
  sendToUser(userId: string, type: string, data: any): void {
    this.broadcast(type, data, (client) => 
      client.userId === userId
    );
  }

  /**
   * Send message to clients of a specific project
   */
  sendToProject(projectId: string, type: string, data: any): void {
    this.broadcast(type, data, (client) => 
      client.projectId === projectId
    );
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get authenticated client count
   */
  getAuthenticatedClientCount(): number {
    return Array.from(this.clients.values()).filter(c => c.authenticated).length;
  }

  /**
   * Get client statistics
   */
  getClientStats(): {
    total: number;
    authenticated: number;
    byProject: Record<string, number>;
  } {
    const stats = {
      total: this.clients.size,
      authenticated: 0,
      byProject: {} as Record<string, number>,
    };

    for (const client of this.clients.values()) {
      if (client.authenticated) {
        stats.authenticated++;
      }

      if (client.projectId) {
        stats.byProject[client.projectId] = (stats.byProject[client.projectId] || 0) + 1;
      }
    }

    return stats;
  }

  /**
   * Setup server event handlers
   */
  private setupServerEvents(): void {
    this.server.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      const clientId = uuidv4();
      
      const client: WebSocketClient = {
        id: clientId,
        ws,
        subscriptions: new Set(),
        lastPing: new Date(),
        authenticated: false,
      };

      this.clients.set(clientId, client);

      logger.info('WebSocket client connected', {
        clientId,
        remoteAddress: request.socket.remoteAddress,
        userAgent: request.headers['user-agent'],
      });

      // Setup client event handlers
      this.setupClientEvents(client);

      // Send welcome message
      this.sendToClient(clientId, 'connected', {
        clientId,
        serverTime: new Date(),
      });
    });

    this.server.on('error', (error) => {
      logger.error('WebSocket server error', { error: error.message });
    });
  }

  /**
   * Setup client event handlers
   */
  private setupClientEvents(client: WebSocketClient): void {
    client.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleClientMessage(client, message);
      } catch (error) {
        logger.warn('Invalid WebSocket message', {
          clientId: client.id,
          error: (error as Error).message,
        });
        
        this.sendToClient(client.id, 'error', {
          message: 'Invalid message format',
        });
      }
    });

    client.ws.on('pong', () => {
      client.lastPing = new Date();
    });

    client.ws.on('close', (code: number, reason: string) => {
      logger.info('WebSocket client disconnected', {
        clientId: client.id,
        code,
        reason: reason.toString(),
      });

      this.clients.delete(client.id);
      this.emit('client-disconnected', client);
    });

    client.ws.on('error', (error: Error) => {
      logger.error('WebSocket client error', {
        clientId: client.id,
        error: error.message,
      });
    });
  }

  /**
   * Handle client messages
   */
  private handleClientMessage(client: WebSocketClient, message: any): void {
    const { type, data } = message;

    switch (type) {
      case 'authenticate':
        this.handleAuthentication(client, data);
        break;

      case 'subscribe':
        this.handleSubscription(client, data);
        break;

      case 'unsubscribe':
        this.handleUnsubscription(client, data);
        break;

      case 'ping':
        this.sendToClient(client.id, 'pong', { timestamp: new Date() });
        break;

      default:
        logger.warn('Unknown message type', {
          clientId: client.id,
          type,
        });
        
        this.sendToClient(client.id, 'error', {
          message: `Unknown message type: ${type}`,
        });
    }
  }

  /**
   * Handle client authentication
   */
  private handleAuthentication(client: WebSocketClient, data: any): void {
    const { token, userId, projectId } = data;

    // In a real implementation, validate the JWT token
    // For now, we'll do basic validation
    if (!token || !userId) {
      this.sendToClient(client.id, 'auth-failed', {
        message: 'Invalid authentication data',
      });
      return;
    }

    // Mock token validation
    const isValidToken = this.validateToken(token, userId);
    
    if (!isValidToken) {
      this.sendToClient(client.id, 'auth-failed', {
        message: 'Invalid or expired token',
      });
      return;
    }

    client.authenticated = true;
    client.userId = userId;
    client.projectId = projectId;

    this.sendToClient(client.id, 'authenticated', {
      userId,
      projectId,
      timestamp: new Date(),
    });

    logger.info('Client authenticated', {
      clientId: client.id,
      userId,
      projectId,
    });

    this.emit('client-authenticated', client);
  }

  /**
   * Handle subscription to execution updates
   */
  private handleSubscription(client: WebSocketClient, data: any): void {
    const { executionId } = data;

    if (!client.authenticated) {
      this.sendToClient(client.id, 'error', {
        message: 'Authentication required for subscriptions',
      });
      return;
    }

    if (!executionId) {
      this.sendToClient(client.id, 'error', {
        message: 'Execution ID required for subscription',
      });
      return;
    }

    client.subscriptions.add(executionId);

    this.sendToClient(client.id, 'subscribed', {
      executionId,
      timestamp: new Date(),
    });

    logger.debug('Client subscribed to execution', {
      clientId: client.id,
      executionId,
    });
  }

  /**
   * Handle unsubscription from execution updates
   */
  private handleUnsubscription(client: WebSocketClient, data: any): void {
    const { executionId } = data;

    if (!executionId) {
      this.sendToClient(client.id, 'error', {
        message: 'Execution ID required for unsubscription',
      });
      return;
    }

    client.subscriptions.delete(executionId);

    this.sendToClient(client.id, 'unsubscribed', {
      executionId,
      timestamp: new Date(),
    });

    logger.debug('Client unsubscribed from execution', {
      clientId: client.id,
      executionId,
    });
  }

  /**
   * Verify client connection
   */
  private verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }): boolean {
    // In a real implementation, you might want to verify origin, check rate limits, etc.
    return true;
  }

  /**
   * Validate authentication token (mock implementation)
   */
  private validateToken(token: string, userId: string): boolean {
    // Mock validation - in real implementation, verify JWT signature and expiry
    return token.length > 10 && userId.length > 0;
  }

  /**
   * Start ping interval to keep connections alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = new Date();
      const staleClients: string[] = [];

      for (const [clientId, client] of this.clients.entries()) {
        const timeSinceLastPing = now.getTime() - client.lastPing.getTime();
        
        if (timeSinceLastPing > 60000) { // 60 seconds
          staleClients.push(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }

      // Remove stale clients
      for (const clientId of staleClients) {
        const client = this.clients.get(clientId);
        if (client) {
          logger.info('Removing stale client', { clientId });
          client.ws.terminate();
          this.clients.delete(clientId);
        }
      }

    }, 30000); // Check every 30 seconds
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up WebSocket manager');

    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down');
    }

    // Close server
    return new Promise((resolve) => {
      this.server.close(() => {
        logger.info('WebSocket server closed');
        resolve();
      });
    });
  }
}
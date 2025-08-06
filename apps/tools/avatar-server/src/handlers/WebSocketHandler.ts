import { WebSocketServer } from 'ws';
import { AvatarService } from '../services/AvatarService';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('avatar-websocket');

export class WebSocketHandler {
  private wss: WebSocketServer;

  constructor(
    private avatarService: AvatarService,
    server: any
  ) {
    this.wss = new WebSocketServer({ server });
    this.setupWebSocket();
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      logger.info('Web client connected via WebSocket');
      this.avatarService.addClient(ws);

      // Send current state
      ws.send(JSON.stringify({
        type: 'state',
        expression: this.avatarService.getCurrentExpression(),
        ...this.avatarService.getAvatarState(),
        timestamp: Date.now()
      }));

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          logger.debug('Received WebSocket message:', data);
          
          // Handle any client-side messages if needed
          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch (error) {
          logger.error('Error processing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        this.avatarService.removeClient(ws);
        logger.info('Web client disconnected');
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        this.avatarService.removeClient(ws);
      });
    });
  }
}
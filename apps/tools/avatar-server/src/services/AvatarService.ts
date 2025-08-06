import { Expression, AvatarState, BatchExpressions } from '../types';
import { getLogger } from '@rusty-butter/logger';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = getLogger('avatar-service');

export class AvatarService {
  private currentExpression = 'joyful';
  private avatarState: AvatarState = {
    direction: 'right',
    posX: 0,
    posY: 0,
    rotation: 0,
    scale: 1.0,
  };
  private batchExpressionsState: BatchExpressions | null = null;
  private expressions: Expression[] = [];
  private expressionMap: Record<string, Expression> = {};
  private clients = new Set<any>();

  constructor() {
    this.loadExpressions();
  }

  private loadExpressions() {
    try {
      const expressionsPath = path.join(__dirname, '../../public/expressions.json');
      const expressionsData = fs.readFileSync(expressionsPath, 'utf8');
      this.expressions = JSON.parse(expressionsData);
      
      this.expressionMap = this.expressions.reduce((map, exp) => {
        map[exp.name] = exp;
        return map;
      }, {} as Record<string, Expression>);
      
      logger.info(`Loaded ${this.expressions.length} expressions`);
    } catch (error) {
      logger.warn('Error loading expressions, using defaults:', error);
      this.setDefaultExpressions();
    }
  }

  private setDefaultExpressions() {
    this.expressions = [
      {
        name: 'joyful',
        imageUrl: '/images/joyful.png',
        description: 'Happy and celebratory expression',
        useCases: 'When tests pass, code works correctly, or celebrating achievements',
      },
      {
        name: 'excited',
        imageUrl: '/images/excited.png',
        description: 'Extremely enthusiastic expression',
        useCases: 'Big announcements, major breakthroughs, or hype moments',
      },
      {
        name: 'thinking',
        imageUrl: '/images/thinking.png',
        description: 'Deep in thought',
        useCases: 'Analyzing problems, debugging, or considering solutions',
      },
      {
        name: 'frustrated',
        imageUrl: '/images/frustrated.png',
        description: 'Annoyed or stuck expression',
        useCases: 'When encountering bugs, errors, or difficult problems',
      },
      {
        name: 'sipping_coffee',
        imageUrl: '/images/sipping_coffee.png',
        description: 'Taking a coffee break',
        useCases: 'During breaks, waiting for builds, or casual moments',
      }
    ];
    
    this.expressionMap = this.expressions.reduce((map, exp) => {
      map[exp.name] = exp;
      return map;
    }, {} as Record<string, Expression>);
  }

  addClient(client: any) {
    this.clients.add(client);
  }

  removeClient(client: any) {
    this.clients.delete(client);
  }

  private broadcast(data: any) {
    this.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(JSON.stringify(data));
      }
    });
  }

  setExpression(name: string, state?: Partial<AvatarState>) {
    if (!this.expressionMap[name]) {
      throw new Error(`Expression '${name}' not found`);
    }

    this.currentExpression = name;
    
    if (state) {
      this.avatarState = { ...this.avatarState, ...state };
    }

    const update = {
      type: 'expression',
      expression: name,
      ...this.avatarState,
      timestamp: Date.now()
    };

    this.broadcast(update);
    logger.info(`Set expression to: ${name}`, state);

    return {
      expression: name,
      state: this.avatarState
    };
  }

  setBatchExpressions(params: Omit<BatchExpressions, 'batchId'>) {
    const batchId = uuidv4();
    
    for (const action of params.actions) {
      if (!this.expressionMap[action.expression]) {
        throw new Error(`Expression '${action.expression}' not found in batch`);
      }
    }

    this.batchExpressionsState = {
      ...params,
      batchId
    };

    const update = {
      type: 'batch',
      ...this.batchExpressionsState,
      timestamp: Date.now()
    };

    this.broadcast(update);
    logger.info(`Started batch expressions: ${batchId}`);

    return {
      batchId,
      actions: params.actions.length,
      loop: params.loop,
      random: params.random
    };
  }

  getStatus() {
    return {
      currentExpression: this.currentExpression,
      avatarState: this.avatarState,
      batchActive: !!this.batchExpressionsState,
      batchId: this.batchExpressionsState?.batchId || null,
      availableExpressions: this.expressions.length,
      connectedClients: this.clients.size
    };
  }

  listExpressions() {
    return this.expressions;
  }

  getCurrentExpression() {
    const expression = this.expressionMap[this.currentExpression];
    if (!expression) {
      return null;
    }
    
    // Return full expression data with current avatar state
    return {
      ...expression,
      ...this.avatarState,
      batchExpressions: this.batchExpressionsState
    };
  }

  getAvatarState() {
    return this.avatarState;
  }
}
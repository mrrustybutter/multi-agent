#!/usr/bin/env node
/**
 * RustyButter Avatar Server - HTTP server for avatar expression management
 * 
 * This server manages avatar state and serves the web client for OBS browser sources.
 * It provides REST API endpoints for controlling avatar expressions and animations.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import cors from 'cors';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getPort } from '@rusty-butter/shared';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('avatar-server');

// Types
interface Expression {
  name: string;
  imageUrl: string;
  description: string;
  useCases: string;
}

interface AvatarState {
  direction: 'left' | 'right';
  posX: number;
  posY: number;
  rotation: number;
  scale: number;
}

interface BatchExpressions {
  loop: boolean;
  random: boolean;
  actions: Array<{
    expression: string;
    duration: number;
    direction: 'left' | 'right';
    posX: number;
    posY: number;
    rotation: number;
    scale: number;
  }>;
  batchId: string;
}

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Current avatar state
let currentExpression = 'joyful';
let avatarState: AvatarState = {
  direction: 'right',
  posX: 0,
  posY: 0,
  rotation: 0,
  scale: 1.0,
};
let batchExpressionsState: BatchExpressions | null = null;

// Load expressions
let expressions: Expression[] = [];
let expressionMap: Record<string, Expression> = {};

function loadExpressions() {
  try {
    const expressionsPath = path.join(__dirname, '../public/expressions.json');
    const expressionsData = fs.readFileSync(expressionsPath, 'utf8');
    expressions = JSON.parse(expressionsData);
    
    // Create lookup map
    expressionMap = expressions.reduce((map, exp) => {
      map[exp.name] = exp;
      return map;
    }, {} as Record<string, Expression>);
    
    logger.info(`Loaded ${expressions.length} expressions`);
  } catch (error) {
    logger.warn('Error loading expressions, using defaults:', error);
    
    // Provide default expressions
    expressions = [
      {
        name: 'joyful',
        imageUrl: '/images/joyful.png',
        description: 'Happy and celebratory expression',
        useCases: 'When tests pass, code works correctly, or celebrating achievements',
      },
      {
        name: 'focused',
        imageUrl: '/images/focused.png',
        description: 'Concentrated and thinking deeply',
        useCases: 'When debugging complex problems or working on difficult code',
      },
      {
        name: 'confused',
        imageUrl: '/images/confused.png',
        description: 'Puzzled and uncertain',
        useCases: 'When encountering unexpected errors or trying to understand complex logic',
      },
      {
        name: 'frustrated',
        imageUrl: '/images/frustrated.png',
        description: 'Annoyed and exasperated',
        useCases: 'When dealing with difficult bugs or broken dependencies',
      },
      {
        name: 'excited',
        imageUrl: '/images/excited.png',
        description: 'Enthusiastic and energetic',
        useCases: 'When starting new projects or discovering cool features',
      }
    ];
    
    expressionMap = expressions.reduce((map, exp) => {
      map[exp.name] = exp;
      return map;
    }, {} as Record<string, Expression>);
    
    logger.info('Using default expressions');
  }
}

// API Routes

/**
 * Get current avatar expression and state
 */
app.get('/api/current-expression', (_req, res) => {
  if (!expressionMap[currentExpression]) {
    logger.error(`Expression not found: ${currentExpression}`);
    return res.status(404).json({ error: 'Expression not found' });
  }

  const response = {
    ...expressionMap[currentExpression],
    direction: avatarState.direction,
    posX: avatarState.posX,
    posY: avatarState.posY,
    rotation: avatarState.rotation,
    scale: avatarState.scale,
  };

  if (batchExpressionsState) {
    const batchResponse = {
      ...response,
      batchExpressions: {
        ...batchExpressionsState,
        random: batchExpressionsState.random || false,
      },
    };
    return res.json(batchResponse);
  }

  return res.json(response);
});

/**
 * Set avatar expression
 */
app.post('/api/set-expression', (req, res) => {
  const { name, direction, posX, posY, rotation, scale } = req.body;

  if (!name || !expressionMap[name]) {
    return res.status(400).json({
      error: 'Invalid expression name',
      availableExpressions: Object.keys(expressionMap),
    });
  }

  // Clear batch expressions when setting single expression
  batchExpressionsState = null;
  currentExpression = name;

  // Update avatar state properties
  if (direction === 'left' || direction === 'right') {
    avatarState.direction = direction;
  }
  if (typeof posX === 'number') {
    avatarState.posX = posX;
  }
  if (typeof posY === 'number') {
    avatarState.posY = posY;
  }
  if (typeof rotation === 'number') {
    avatarState.rotation = Math.max(-30, Math.min(30, rotation));
  }
  if (typeof scale === 'number') {
    avatarState.scale = Math.max(0.1, Math.min(3.0, scale));
  }

  logger.info(`Expression set to: ${name}`);

  return res.json({
    success: true,
    expression: name,
    ...avatarState,
  });
});

/**
 * Set batch expressions for animations
 */
app.post('/api/set-batch-expressions', (req, res) => {
  const { loop, random, actions } = req.body;

  if (!Array.isArray(actions) || actions.length === 0) {
    return res.status(400).json({
      error: 'Actions array is required and must contain at least one expression',
    });
  }

  // Validate all actions
  const validActions: any[] = [];
  for (const action of actions) {
    if (!action.expression || !expressionMap[action.expression]) {
      return res.status(400).json({
        error: `Invalid expression: ${action.expression}`,
        availableExpressions: Object.keys(expressionMap),
      });
    }

    validActions.push({
      expression: action.expression,
      duration: action.duration || 1000,
      direction: action.direction || 'right',
      posX: action.posX || 0,
      posY: action.posY || 0,
      rotation: action.rotation !== undefined ? Math.max(-30, Math.min(30, action.rotation)) : 0,
      scale: action.scale !== undefined ? Math.max(0.1, Math.min(3.0, action.scale)) : 1.0,
    });
  }

  // Create batch expressions
  batchExpressionsState = {
    loop: Boolean(loop),
    random: Boolean(random),
    actions: validActions,
    batchId: uuidv4(),
  };

  // Set initial expression
  const firstAction = validActions[0];
  currentExpression = firstAction.expression;
  avatarState = {
    direction: firstAction.direction,
    posX: firstAction.posX,
    posY: firstAction.posY,
    rotation: firstAction.rotation,
    scale: firstAction.scale,
  };

  logger.info(`Batch expressions set with ${validActions.length} actions`);

  return res.json({
    success: true,
    batchId: batchExpressionsState.batchId,
    actionCount: validActions.length,
    loop,
  });
});

/**
 * Get all available expressions
 */
app.get('/api/expressions', (_req, res) => {
  res.json(expressions);
});

/**
 * Get server status
 */
app.get('/api/status', (_req, res) => {
  res.json({
    status: 'running',
    currentExpression,
    availableExpressions: Object.keys(expressionMap),
    batchActive: batchExpressionsState !== null,
    port: getPort('avatar-server'),
  });
});

/**
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`Server Error: ${err.stack || err.message || err}`);
  res.status(500).json({ error: 'Server error', message: err.message });
});

// Start server
function startServer() {
  loadExpressions();
  
  const port = getPort('avatar-server');
  
  app.listen(port, () => {
    logger.info(`RustyButter Avatar Server started on port ${port}`);
    logger.info(`Available expressions: ${Object.keys(expressionMap).join(', ')}`);
    logger.info(`Use OBS Browser Source: http://localhost:${port}`);
  });
}

// Start the server
startServer();
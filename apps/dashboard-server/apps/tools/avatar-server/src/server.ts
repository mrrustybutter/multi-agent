/**
 * @fileoverview RustyButter Avatar HTTP Server
 *
 * This module provides the HTTP API server for the avatar system.
 * It manages avatar state and serves both the web client and API endpoints.
 * The server can be accessed by both the web client (for polling) and
 * the MCP server (for state updates).
 *
 * @author CodingButter
 * @version 1.0.5
 */

import express from 'express';
import path from 'path';
import cors from 'cors';
import fs from 'fs';
import { Expression, AvatarState, BatchExpressions } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Initialize and start the HTTP server for avatar control.
 *
 * @function startHttpServer
 * @param {number} port - Port number to listen on
 * @returns {void}
 */
export function startHttpServer(port: number = 3000) {
  /** @type {express.Application} Express application instance */
  const app = express();

  // Enable CORS for cross-origin requests
  app.use(cors());

  // Middleware to parse JSON requests
  app.use(express.json());

  // Serve static files from the public directory (HTML, CSS, images)
  app.use(express.static(path.join(__dirname, '../public')));

  /**
   * Current avatar expression state.
   * @type {string}
   * @default 'joyful'
   */
  let currentExpression = 'joyful';

  /**
   * Array of available avatar expressions loaded from expressions.json.
   * @type {Expression[]}
   */
  let expressions: Expression[] = [];

  try {
    const expressionsPath = path.join(__dirname, '../public/expressions.json');
    const expressionsData = fs.readFileSync(expressionsPath, 'utf8');
    expressions = JSON.parse(expressionsData);
    console.log(`[Server] Loaded ${expressions.length} expressions`);
  } catch (error) {
    console.error('[Server] Error loading expressions:', error);
    // Provide default expression if file can't be loaded
    expressions = [
      {
        name: 'joyful',
        imageUrl: '/images/joyful.png',
        description: 'Happy and celebratory expression',
        useCases: 'When tests pass, code works correctly, or celebrating achievements',
      },
    ];
    console.error('[Server] Using default expression fallback');
  }

  /**
   * Expression lookup map for O(1) access to expressions by name.
   * @type {Record<string, Expression>}
   */
  const expressionMap = expressions.reduce(
    (map, exp) => {
      map[exp.name] = exp;
      return map;
    },
    {} as Record<string, Expression>
  );

  /**
   * Avatar positioning and visual state configuration.
   * @type {AvatarState}
   */
  let avatarState: AvatarState = {
    direction: 'right',
    posX: 0,
    posY: 0,
    rotation: 0,
    scale: 1.0,
  };

  /**
   * Batch expressions state for animated sequences.
   * @type {BatchExpressions | null}
   */
  let batchExpressionsState: BatchExpressions | null = null;

  /**
   * API endpoint to get the current avatar expression and state.
   * Used by the client for polling updates.
   *
   * @route GET /api/current-expression
   */
  app.get('/api/current-expression', (_req, res) => {
    if (!expressionMap[currentExpression]) {
      console.error(`[Server] Expression not found: ${currentExpression}`);
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
   * API endpoint to set avatar expression.
   * Used by both manual testing and MCP server.
   *
   * @route POST /api/set-expression
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

    console.log(`[Server] Expression set to: ${name}`);

    return res.json({
      success: true,
      expression: name,
      ...avatarState,
    });
  });

  /**
   * API endpoint to set batch expressions.
   * Used by MCP server for animated sequences.
   *
   * @route POST /api/set-batch-expressions
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

    console.log(`[Server] Batch expressions set with ${validActions.length} actions`);

    return res.json({
      success: true,
      batchId: batchExpressionsState.batchId,
      actionCount: validActions.length,
      loop,
    });
  });

  /**
   * API endpoint to get all available expressions.
   *
   * @route GET /api/expressions
   */
  app.get('/api/expressions', (_req, res) => {
    res.json(expressions);
  });

  /**
   * API endpoint to get server status.
   * Useful for health checks.
   *
   * @route GET /api/status
   */
  app.get('/api/status', (_req, res) => {
    res.json({
      status: 'running',
      currentExpression,
      availableExpressions: Object.keys(expressionMap),
      batchActive: batchExpressionsState !== null,
    });
  });

  /**
   * Global error handling middleware.
   */
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(`[Server Error] ${err.stack || err.message || err}`);
      res.status(500).json({ error: 'Server error', message: err.message });
    }
  );

  /**
   * Start the Express HTTP server.
   */
  app.listen(port, () => {
    console.log(`[Server] RustyButter Avatar Server started`);
    console.log(`[Server] Server running at http://localhost:${port}`);
    console.log(`[Server] Available expressions: ${Object.keys(expressionMap).join(', ')}`);
    console.log(`[Server] Use OBS Browser Source to display avatar at: http://localhost:${port}`);
  });
}

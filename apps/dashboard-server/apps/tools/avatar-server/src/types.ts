/**
 * @fileoverview TypeScript type definitions for RustyButter Avatar Server
 *
 * This file contains all the core TypeScript interfaces and types used
 * throughout the RustyButter Avatar system for type safety and documentation.
 *
 * @author CodingButter
 * @version 1.0.5
 */

/**
 * Represents a single avatar expression with its metadata.
 * Each expression corresponds to an image file and contains descriptive information
 * to help LLMs understand when and how to use the expression.
 *
 * @interface Expression
 * @example
 * {
 *   name: 'joyful',
 *   imageUrl: '/images/joyful.png',
 *   description: 'Happy and celebratory expression',
 *   useCases: 'When tests pass, code works correctly, or celebrating achievements'
 * }
 */
export interface Expression {
  /** Unique identifier for the expression (used in API calls) */
  name: string;
  /** Relative URL path to the expression image file */
  imageUrl: string;
  /** Human-readable description of the expression */
  description: string;
  /** Guidance on when this expression should be used */
  useCases: string;
}

/**
 * Represents the visual positioning and transformation state of the avatar.
 * Controls how the avatar appears on screen including direction, position,
 * rotation, and scale transformations.
 *
 * @interface AvatarState
 * @example
 * {
 *   direction: 'right',
 *   posX: 0,
 *   posY: -10,
 *   rotation: 5,
 *   scale: 1.2
 * }
 */
export interface AvatarState {
  /** Direction the avatar is facing ('right' or 'left') */
  direction: 'right' | 'left';
  /** Horizontal position offset in pixels (positive = right, negative = left) */
  posX: number;
  /** Vertical position offset in pixels (positive = down, negative = up) */
  posY: number;
  /** Rotation angle in degrees (limited to -30 to 30 for subtle leaning effect) */
  rotation: number;
  /** Scale factor for avatar size (1.0 = 100%, 0.5 = 50%, 2.0 = 200%) */
  scale: number;
}

/**
 * Represents a single action in a batch expression sequence.
 * Extends AvatarState to include the expression name and display duration.
 * Used for creating animated sequences of expressions with timing control.
 *
 * @interface ExpressionAction
 * @extends AvatarState
 * @example
 * {
 *   expression: 'excited',
 *   duration: 2000,
 *   direction: 'right',
 *   posX: 0,
 *   posY: 0,
 *   rotation: 0,
 *   scale: 1.0
 * }
 */
export interface ExpressionAction extends AvatarState {
  /** Name of the expression to display (must exist in available expressions) */
  expression: string;
  /** Duration to display this expression in milliseconds */
  duration: number;
}

/**
 * Represents a sequence of expressions to be played as an animation.
 * Supports looping, randomization, and contains metadata for tracking.
 * Used for creating complex avatar animations and emotional sequences.
 *
 * @interface BatchExpressions
 * @example
 * {
 *   loop: true,
 *   random: false,
 *   actions: [
 *     { expression: 'excited', duration: 1000, direction: 'right', posX: 0, posY: 0, rotation: 0, scale: 1.0 },
 *     { expression: 'joyful', duration: 1500, direction: 'left', posX: 10, posY: 0, rotation: 5, scale: 1.1 }
 *   ],
 *   batchId: 'batch_12345'
 * }
 */
export interface BatchExpressions {
  /** Whether to continuously loop through the expression sequence */
  loop: boolean;
  /** Optional flag to randomize the order of expressions after each loop iteration */
  random?: boolean;
  /** Array of expression actions to be played in sequence */
  actions: ExpressionAction[];
  /** Unique identifier for this batch sequence (used for tracking and updates) */
  batchId: string;
}

/**
 * Expression Mapper
 * Maps text content and sentiment to avatar expressions
 */

import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('expression-mapper');

// Available expressions from rustybutter-avatar
export const AVAILABLE_EXPRESSIONS = [
  'annoyed',
  'cheeky',
  'concerned',
  'confused',
  'excited',
  'joyful',
  'mind-blown',
  'nervous',
  'perplexed',
  'sipping_coffee',
  'worried',
  'evil',
  'sarcastic',
  'inspired'
] as const;

export type Expression = typeof AVAILABLE_EXPRESSIONS[number];

// Mapping rules
interface ExpressionRule {
  patterns: RegExp[];
  expressions: Expression[];
  confidence: number;
}

const expressionRules: ExpressionRule[] = [
  // Excitement patterns
  {
    patterns: [/let'?s\s+(fucking\s+)?go/i, /holy\s+shit/i, /fuck\s+yeah/i, /awesome/i, /amazing/i],
    expressions: ['excited'],
    confidence: 0.9
  },
  // Confusion patterns
  {
    patterns: [/what\s+the\s+fuck/i, /\?{2,}/, /confused/i, /don'?t\s+understand/i],
    expressions: ['confused', 'perplexed'],
    confidence: 0.85
  },
  // Thinking patterns
  {
    patterns: [/hmm+/i, /let\s+me\s+think/i, /interesting/i, /maybe/i],
    expressions: ['perplexed', 'sipping_coffee'],
    confidence: 0.7
  },
  // Error/problem patterns
  {
    patterns: [/error/i, /failed/i, /broken/i, /issue/i, /problem/i],
    expressions: ['concerned', 'worried'],
    confidence: 0.8
  },
  // Success patterns
  {
    patterns: [/done/i, /complete/i, /finished/i, /success/i, /working/i],
    expressions: ['joyful', 'cheeky'],
    confidence: 0.85
  },
  // Sarcasm patterns
  {
    patterns: [/oh\s+great/i, /wonderful/i, /perfect/i, /sure\s+thing/i],
    expressions: ['sarcastic', 'evil'],
    confidence: 0.6
  },
  // Inspiration patterns
  {
    patterns: [/idea/i, /let'?s\s+build/i, /create/i, /implement/i],
    expressions: ['inspired', 'excited'],
    confidence: 0.75
  },
  // Mind blown patterns
  {
    patterns: [/mind\s+blown/i, /incredible/i, /unbelievable/i, /insane/i],
    expressions: ['mind-blown'],
    confidence: 0.9
  }
];

/**
 * Map text to an expression
 */
export function mapTextToExpression(text: string): Expression {
  let bestMatch: { expression: Expression; confidence: number } | null = null;

  for (const rule of expressionRules) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        const expression = rule.expressions[Math.floor(Math.random() * rule.expressions.length)];
        
        if (!bestMatch || rule.confidence > bestMatch.confidence) {
          bestMatch = { expression, confidence: rule.confidence };
        }
      }
    }
  }

  // Default to excited if no match
  if (!bestMatch) {
    logger.debug(`No expression match for: "${text}", defaulting to excited`);
    return 'excited';
  }

  logger.debug(`Mapped "${text}" to expression: ${bestMatch.expression} (confidence: ${bestMatch.confidence})`);
  return bestMatch.expression;
}

/**
 * Map sentiment score to expression
 */
export function mapSentimentToExpression(sentiment: number): Expression {
  // Sentiment ranges from -1 (negative) to 1 (positive)
  if (sentiment > 0.7) return 'excited';
  if (sentiment > 0.4) return 'joyful';
  if (sentiment > 0.1) return 'cheeky';
  if (sentiment > -0.1) return 'sipping_coffee';
  if (sentiment > -0.4) return 'concerned';
  if (sentiment > -0.7) return 'worried';
  return 'annoyed';
}

/**
 * Generate expression sequence for speech
 */
export function generateExpressionSequence(
  text: string,
  durationMs: number
): Array<{ expression: Expression; duration: number }> {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  
  if (sentences.length === 0) {
    return [{ expression: mapTextToExpression(text), duration: durationMs }];
  }

  const sequence: Array<{ expression: Expression; duration: number }> = [];
  const baseDuration = Math.floor(durationMs / sentences.length);

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();
    if (!sentence) continue;

    const expression = mapTextToExpression(sentence);
    const duration = i === sentences.length - 1 
      ? durationMs - (baseDuration * (sentences.length - 1))  // Last gets remaining time
      : baseDuration;

    sequence.push({ expression, duration });
  }

  return sequence;
}

/**
 * Map action type to expression
 */
export function mapActionToExpression(action: string): Expression {
  const actionMap: Record<string, Expression> = {
    'coding': 'inspired',
    'debugging': 'concerned',
    'building': 'excited',
    'testing': 'nervous',
    'completing': 'joyful',
    'thinking': 'perplexed',
    'explaining': 'cheeky',
    'error': 'worried',
    'success': 'excited',
    'waiting': 'sipping_coffee'
  };

  return actionMap[action] || 'excited';
}
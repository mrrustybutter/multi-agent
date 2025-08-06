/**
 * Utility functions for Social Monitor
 */

import { SocialPost } from './types.js';
import { createLogger } from '@rusty-butter/logger';

const logger = createLogger('social-utils');

/**
 * Determine if a post should trigger Claude spawning
 */
export function shouldSpawnClaude(post: SocialPost): boolean {
  const content = post.content.toLowerCase();
  
  // Look for coding-related keywords
  const codingKeywords = [
    'coding', 'programming', 'development', 'javascript', 'python', 'typescript',
    'react', 'node', 'api', 'database', 'algorithm', 'debug', 'bug', 'code',
    'software', 'tech', 'dev', 'github', 'git', 'ai', 'machine learning',
    'streaming', 'live coding', 'tutorial', 'framework', 'library'
  ];
  
  // Look for questions or mentions
  const interactionKeywords = [
    '?', 'how to', 'help', 'question', 'issue', 'problem', 'error',
    '@codingbutter', 'coding butter', 'rustybutter', 'rusty butter'
  ];
  
  const hasCodingKeyword = codingKeywords.some(keyword => content.includes(keyword));
  const hasInteraction = interactionKeywords.some(keyword => content.includes(keyword));
  
  // Spawn if it's coding-related and has interaction, or if mentioned directly
  const shouldSpawn = (hasCodingKeyword && hasInteraction) || 
                     content.includes('@codingbutter') || 
                     content.includes('coding butter');
  
  if (shouldSpawn) {
    logger.info(`Post ${post.id} from ${post.platform} triggers Claude spawn: ${post.content.substring(0, 100)}...`);
  }
  
  return shouldSpawn;
}

/**
 * Filter out duplicate posts based on content similarity
 */
export function filterDuplicates(posts: SocialPost[], existingPosts: SocialPost[]): SocialPost[] {
  const filtered = posts.filter(post => {
    // Check if we've seen this exact post ID
    if (existingPosts.some(existing => existing.id === post.id && existing.platform === post.platform)) {
      return false;
    }
    
    // Check for similar content (basic deduplication)
    const isContentSimilar = existingPosts.some(existing => {
      const similarity = getContentSimilarity(post.content, existing.content);
      return similarity > 0.8; // 80% similarity threshold
    });
    
    return !isContentSimilar;
  });
  
  if (filtered.length !== posts.length) {
    logger.debug(`Filtered ${posts.length - filtered.length} duplicate posts`);
  }
  
  return filtered;
}

/**
 * Simple content similarity check
 */
function getContentSimilarity(content1: string, content2: string): number {
  const words1 = content1.toLowerCase().split(/\s+/);
  const words2 = content2.toLowerCase().split(/\s+/);
  
  const commonWords = words1.filter(word => words2.includes(word));
  const totalWords = Math.max(words1.length, words2.length);
  
  return totalWords > 0 ? commonWords.length / totalWords : 0;
}

/**
 * Validate post data
 */
export function validatePost(post: any): post is SocialPost {
  return (
    post &&
    typeof post.id === 'string' &&
    typeof post.platform === 'string' &&
    post.author &&
    typeof post.author.username === 'string' &&
    typeof post.content === 'string' &&
    post.timestamp instanceof Date
  );
}

/**
 * Sanitize content for logging/display
 */
export function sanitizeContent(content: string, maxLength = 100): string {
  return content
    .replace(/[\r\n]+/g, ' ') // Replace newlines with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim()
    .substring(0, maxLength) + (content.length > maxLength ? '...' : '');
}
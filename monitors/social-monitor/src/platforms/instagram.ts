/**
 * Instagram Platform Integration
 */

import axios from 'axios';
import { createLogger } from '@rusty-butter/logger';
import { SocialPost, PlatformAPI } from '../types.js';

const logger = createLogger('instagram-platform');

export class InstagramPlatform implements PlatformAPI {
  name = 'instagram';
  isActive = false;
  private config?: any;

  async initialize(config: any): Promise<void> {
    if (!config.accessToken || !config.accountId) {
      logger.warn('Instagram credentials not provided, skipping Instagram monitoring');
      return;
    }

    this.config = config;
    this.isActive = true;
    logger.info('Instagram API initialized successfully');
  }

  async fetchPosts(limit = 10): Promise<SocialPost[]> {
    if (!this.isActive) {
      return [];
    }

    try {
      // Get recent media from Instagram Business API
      const response = await axios.get(
        `https://graph.facebook.com/v18.0/${this.config.accountId}/media`,
        {
          params: {
            fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
            limit,
            access_token: this.config.accessToken,
          },
        }
      );

      const posts: SocialPost[] = [];

      for (const media of response.data?.data || []) {
        posts.push({
          id: media.id,
          platform: 'instagram',
          author: {
            id: this.config.accountId,
            username: 'codingbutter', // Would get this from profile API in real implementation
            displayName: 'Coding Butter',
          },
          content: media.caption || '',
          timestamp: new Date(media.timestamp),
          url: media.permalink,
          media: media.media_url ? [media.media_url] : undefined,
          metrics: {
            likes: media.like_count,
            comments: media.comments_count,
          },
          story: false, // Regular posts, not stories
        });
      }

      logger.debug(`Fetched ${posts.length} Instagram posts`);
      return posts;
    } catch (error) {
      logger.error('Error fetching Instagram posts:', error);
      return [];
    }
  }

  async postMessage(content: string): Promise<void> {
    if (!this.isActive) {
      throw new Error('Instagram not initialized');
    }

    // Note: Instagram posting requires media and is more complex
    // This is a placeholder for the posting functionality
    logger.warn('Instagram posting not yet implemented');
    throw new Error('Instagram posting not implemented');
  }
}
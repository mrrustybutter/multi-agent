/**
 * Twitter Platform Integration
 */

import { TwitterApi } from 'twitter-api-v2';
import { createLogger } from '@rusty-butter/logger';
import { SocialPost, PlatformAPI } from '../types.js';

const logger = createLogger('twitter-platform');

export class TwitterPlatform implements PlatformAPI {
  name = 'twitter';
  isActive = false;
  private client?: TwitterApi;
  private bearer?: TwitterApi;

  async initialize(config: any): Promise<void> {
    if (!config.apiKey || !config.apiSecret || !config.bearerToken) {
      logger.warn('Twitter credentials not provided, skipping Twitter monitoring');
      return;
    }

    try {
      this.client = new TwitterApi({
        appKey: config.apiKey,
        appSecret: config.apiSecret,
        accessToken: config.accessToken,
        accessSecret: config.accessTokenSecret,
      });

      this.bearer = new TwitterApi(config.bearerToken);

      // Test the connection
      await this.bearer.v2.me();
      this.isActive = true;
      logger.info('Twitter API initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Twitter API:', error);
      throw error;
    }
  }

  async fetchPosts(limit = 10): Promise<SocialPost[]> {
    if (!this.bearer || !this.isActive) {
      return [];
    }

    try {
      // Search for recent tweets about coding, streaming, AI, etc.
      const tweets = await this.bearer.v2.search('(coding OR streaming OR AI OR development OR programming) -is:retweet', {
        max_results: limit,
        'tweet.fields': ['created_at', 'author_id', 'public_metrics', 'context_annotations'],
        'user.fields': ['username', 'name'],
        expansions: ['author_id'],
      });

      const posts: SocialPost[] = [];

      for (const tweet of tweets.data?.data || []) {
        const author = tweets.includes?.users?.find(u => u.id === tweet.author_id);
        
        posts.push({
          id: tweet.id,
          platform: 'twitter',
          author: {
            id: tweet.author_id || '',
            username: author?.username || 'unknown',
            displayName: author?.name || 'Unknown',
          },
          content: tweet.text,
          timestamp: new Date(tweet.created_at || Date.now()),
          url: `https://twitter.com/${author?.username}/status/${tweet.id}`,
          metrics: {
            likes: tweet.public_metrics?.like_count,
            shares: tweet.public_metrics?.retweet_count,
            comments: tweet.public_metrics?.reply_count,
          },
        });
      }

      logger.debug(`Fetched ${posts.length} Twitter posts`);
      return posts;
    } catch (error) {
      logger.error('Error fetching Twitter posts:', error);
      return [];
    }
  }

  async postMessage(content: string): Promise<void> {
    if (!this.client || !this.isActive) {
      throw new Error('Twitter not initialized');
    }

    try {
      await this.client.v2.tweet(content);
      logger.info('Posted to Twitter successfully');
    } catch (error) {
      logger.error('Error posting to Twitter:', error);
      throw error;
    }
  }
}
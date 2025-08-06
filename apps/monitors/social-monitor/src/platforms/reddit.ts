/**
 * Reddit Platform Integration
 */

import axios from 'axios';
import { createLogger } from '@rusty-butter/logger';
import { SocialPost, PlatformAPI } from '../types.js';

const logger = createLogger('reddit-platform');

export class RedditPlatform implements PlatformAPI {
  name = 'reddit';
  isActive = false;
  private config?: any;

  async initialize(config: any): Promise<void> {
    if (!config.clientId || !config.clientSecret) {
      logger.warn('Reddit credentials not provided, skipping Reddit monitoring');
      return;
    }

    this.config = config;
    this.isActive = true;
    logger.info('Reddit API initialized successfully');
  }

  async fetchPosts(limit = 10): Promise<SocialPost[]> {
    if (!this.isActive) {
      return [];
    }

    try {
      // Get hot posts from programming subreddits
      const subreddits = ['programming', 'webdev', 'javascript', 'python', 'MachineLearning'];
      const posts: SocialPost[] = [];

      for (const subreddit of subreddits.slice(0, 2)) { // Limit to 2 subreddits for rate limiting
        const response = await axios.get(`https://www.reddit.com/r/${subreddit}/hot.json?limit=${Math.floor(limit/2)}`, {
          headers: {
            'User-Agent': this.config.userAgent || 'RustyButterBot/1.0',
          },
        });

        for (const post of response.data?.data?.children || []) {
          const postData = post.data;
          
          posts.push({
            id: postData.id,
            platform: 'reddit',
            author: {
              id: postData.author,
              username: postData.author,
              displayName: postData.author,
            },
            content: `${postData.title}\n\n${postData.selftext || ''}`.trim(),
            timestamp: new Date(postData.created_utc * 1000),
            url: `https://reddit.com${postData.permalink}`,
            metrics: {
              likes: postData.ups,
              comments: postData.num_comments,
            },
          });
        }
      }

      logger.debug(`Fetched ${posts.length} Reddit posts`);
      return posts;
    } catch (error) {
      logger.error('Error fetching Reddit posts:', error);
      return [];
    }
  }
}
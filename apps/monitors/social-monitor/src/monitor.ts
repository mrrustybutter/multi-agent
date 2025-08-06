/**
 * Social Monitor Core Class
 */

import { EventEmitter } from 'events';
import { createLogger } from '@rusty-butter/logger';
import { SocialPost, PlatformConfig, MonitorState, PlatformAPI } from './types.js';
import { TwitterPlatform, RedditPlatform, InstagramPlatform } from './platforms/index.js';
import { shouldSpawnClaude, filterDuplicates, validatePost, sanitizeContent } from './utils.js';

const logger = createLogger('social-monitor-core');

export class SocialMonitor extends EventEmitter {
  private platforms: Map<string, PlatformAPI> = new Map();
  private postHistory: SocialPost[] = [];
  private isRunning = false;
  private monitorInterval?: NodeJS.Timeout;
  private config: PlatformConfig;

  constructor(config: PlatformConfig) {
    super();
    this.config = config;
    this.initializePlatforms();
  }

  private async initializePlatforms(): Promise<void> {
    // Initialize Twitter
    if (this.config.twitter) {
      const twitter = new TwitterPlatform();
      try {
        await twitter.initialize(this.config.twitter);
        this.platforms.set('twitter', twitter);
        logger.info('Twitter platform initialized');
      } catch (error) {
        logger.error('Failed to initialize Twitter:', error);
      }
    }

    // Initialize Reddit
    if (this.config.reddit) {
      const reddit = new RedditPlatform();
      try {
        await reddit.initialize(this.config.reddit);
        this.platforms.set('reddit', reddit);
        logger.info('Reddit platform initialized');
      } catch (error) {
        logger.error('Failed to initialize Reddit:', error);
      }
    }

    // Initialize Instagram
    if (this.config.instagram) {
      const instagram = new InstagramPlatform();
      try {
        await instagram.initialize(this.config.instagram);
        this.platforms.set('instagram', instagram);
        logger.info('Instagram platform initialized');
      } catch (error) {
        logger.error('Failed to initialize Instagram:', error);
      }
    }

    logger.info(`Initialized ${this.platforms.size} social media platforms`);
  }

  async startMonitoring(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Monitor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting social media monitoring...');

    // Initial check
    await this.checkAllPlatforms();

    // Set up periodic monitoring
    this.monitorInterval = setInterval(async () => {
      await this.checkAllPlatforms();
    }, 30000); // Check every 30 seconds

    this.emit('monitor-started');
  }

  async stopMonitoring(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }

    logger.info('Stopped social media monitoring');
    this.emit('monitor-stopped');
  }

  private async checkAllPlatforms(): Promise<void> {
    const allPosts: SocialPost[] = [];

    for (const [name, platform] of this.platforms) {
      if (!platform.isActive) {
        continue;
      }

      try {
        const posts = await platform.fetchPosts(10);
        const validPosts = posts.filter(validatePost);
        
        if (validPosts.length > 0) {
          allPosts.push(...validPosts);
          logger.debug(`${name}: fetched ${validPosts.length} posts`);
        }
      } catch (error) {
        logger.error(`Error checking ${name}:`, error);
      }
    }

    if (allPosts.length > 0) {
      await this.processPosts(allPosts);
    }
  }

  private async processPosts(posts: SocialPost[]): Promise<void> {
    // Filter out duplicates
    const newPosts = filterDuplicates(posts, this.postHistory);
    
    if (newPosts.length === 0) {
      return;
    }

    // Add to history (keep last 1000 posts)
    this.postHistory.push(...newPosts);
    if (this.postHistory.length > 1000) {
      this.postHistory = this.postHistory.slice(-1000);
    }

    logger.info(`Processing ${newPosts.length} new social media posts`);

    // Process each post
    for (const post of newPosts) {
      await this.processPost(post);
    }
  }

  private async processPost(post: SocialPost): Promise<void> {
    try {
      // Log the post
      logger.debug(`New ${post.platform} post from @${post.author.username}: ${sanitizeContent(post.content)}`);

      // Emit post event
      this.emit('social-post', {
        type: 'social-post',
        platform: post.platform,
        data: post,
        timestamp: new Date(),
      });

      // Check if we should spawn Claude for this post
      if (shouldSpawnClaude(post)) {
        this.emit('spawn-claude', {
          type: 'social-respond',
          platform: post.platform,
          data: {
            post,
            action: 'respond',
            context: `Respond to this ${post.platform} post from @${post.author.username}: "${post.content}"`,
          },
          timestamp: new Date(),
        });
      }
    } catch (error) {
      logger.error('Error processing post:', error);
    }
  }

  getStatus(): MonitorState {
    const platforms: Record<string, boolean> = {};
    for (const [name, platform] of this.platforms) {
      platforms[name] = platform.isActive;
    }

    return {
      isRunning: this.isRunning,
      platforms,
      lastCheck: new Date(),
      postsMonitored: this.postHistory.length,
      errors: 0, // TODO: Track errors
    };
  }

  getRecentPosts(limit = 10): SocialPost[] {
    return this.postHistory
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async postToplatform(platform: string, content: string): Promise<void> {
    const platformAPI = this.platforms.get(platform);
    if (!platformAPI || !platformAPI.isActive) {
      throw new Error(`Platform ${platform} not available`);
    }

    if (!platformAPI.postMessage) {
      throw new Error(`Platform ${platform} does not support posting`);
    }

    await platformAPI.postMessage(content);
    logger.info(`Posted to ${platform}: ${sanitizeContent(content)}`);
  }
}
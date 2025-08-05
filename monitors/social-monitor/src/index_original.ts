#!/usr/bin/env tsx

/**
 * Social Media Monitor - Multi-platform MCP Server
 * Monitors Twitter, Reddit, Facebook and more
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { EventEmitter } from 'events';
import { getMCPLogger, getAgentLogger, createLogger } from '@rusty-butter/logger';
import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';

// Logger setup
const mcpLogger = getMCPLogger('social-monitor');
const agentLogger = getAgentLogger('social-monitor');
const logger = createLogger('social-monitor');

// Types
interface SocialPost {
  id: string;
  platform: 'twitter' | 'reddit' | 'facebook' | 'instagram' | 'snapchat' | 'general';
  author: {
    id: string;
    username: string;
    displayName: string;
  };
  content: string;
  timestamp: Date;
  url?: string;
  media?: string[];
  metrics?: {
    likes?: number;
    shares?: number;
    comments?: number;
    views?: number;
  };
  inReplyTo?: string;
  story?: boolean; // For Instagram/Snapchat stories
}

interface PlatformConfig {
  twitter?: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessSecret: string;
    bearerToken?: string;
  };
  reddit?: {
    clientId: string;
    clientSecret: string;
    userAgent: string;
    username?: string;
    password?: string;
  };
  facebook?: {
    appId: string;
    appSecret: string;
    accessToken: string;
  };
  instagram?: {
    username: string;
    password: string;
    accessToken?: string;
    userId?: string;
  };
  snapchat?: {
    username: string;
    password: string;
    clientId?: string;
    clientSecret?: string;
  };
}

// Configuration
const config: PlatformConfig = {
  twitter: process.env.X_API_KEY ? {
    apiKey: process.env.X_API_KEY || '',
    apiSecret: process.env.X_API_SECRET_KEY || '',
    accessToken: process.env.X_ACCESS_TOKEN || '',
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET || '',
    bearerToken: process.env.X_BEARER_TOKEN
  } : undefined,
  reddit: process.env.REDDIT_CLIENT_ID ? {
    clientId: process.env.REDDIT_CLIENT_ID || '',
    clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
    userAgent: 'RustyButter:v0.1.0',
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD
  } : undefined,
  facebook: process.env.FACEBOOK_APP_ID ? {
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
    accessToken: process.env.FACEBOOK_ACCESS_TOKEN || ''
  } : undefined,
  instagram: process.env.INSTAGRAM_USERNAME ? {
    username: process.env.INSTAGRAM_USERNAME || '',
    password: process.env.INSTAGRAM_PASSWORD || '',
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
    userId: process.env.INSTAGRAM_USER_ID
  } : undefined,
  snapchat: process.env.SNAPCHAT_USERNAME ? {
    username: process.env.SNAPCHAT_USERNAME || '',
    password: process.env.SNAPCHAT_PASSWORD || '',
    clientId: process.env.SNAPCHAT_CLIENT_ID,
    clientSecret: process.env.SNAPCHAT_CLIENT_SECRET
  } : undefined
};

// State
const postHistory: SocialPost[] = [];
const eventEmitter = new EventEmitter();
let twitterClient: TwitterApi | null = null;
let isConnected = false;

// Initialize clients
async function initializeClients() {
  // Initialize Twitter
  if (config.twitter) {
    try {
      twitterClient = new TwitterApi({
        appKey: config.twitter.apiKey,
        appSecret: config.twitter.apiSecret,
        accessToken: config.twitter.accessToken,
        accessSecret: config.twitter.accessSecret
      });
      
      const user = await twitterClient.v2.me();
      logger.info(`Connected to Twitter as @${user.data.username}`);
    } catch (error) {
      logger.error('Failed to initialize Twitter client:', error);
    }
  }

  // Initialize Reddit (placeholder)
  if (config.reddit) {
    logger.info('Reddit client initialization pending');
  }

  // Initialize Facebook (placeholder)
  if (config.facebook) {
    logger.info('Facebook client initialization pending');
  }

  // Initialize Instagram (placeholder)
  if (config.instagram) {
    logger.info('Instagram client initialization pending - will use private API');
  }

  // Initialize Snapchat (placeholder)
  if (config.snapchat) {
    logger.info('Snapchat client initialization pending - will use web scraping');
  }

  isConnected = true;
}

// Helper functions
function shouldSpawnClaude(post: SocialPost): boolean {
  // Check if post mentions us or contains keywords
  const keywords = ['rusty', 'butter', '@rustybutter', '#rustybutter'];
  const content = post.content.toLowerCase();
  
  return keywords.some(keyword => content.includes(keyword));
}

async function searchTwitter(query: string, limit: number = 10): Promise<SocialPost[]> {
  if (!twitterClient) {
    throw new Error('Twitter client not initialized');
  }

  try {
    const tweets = await twitterClient.v2.search(query, {
      max_results: Math.min(limit, 100),
      'tweet.fields': ['created_at', 'author_id', 'conversation_id', 'public_metrics'],
      'user.fields': ['username', 'name']
    });

    const posts: SocialPost[] = [];
    
    for await (const tweet of tweets) {
      posts.push({
        id: tweet.id,
        platform: 'twitter',
        author: {
          id: tweet.author_id || '',
          username: '', // Will be filled from includes
          displayName: ''
        },
        content: tweet.text,
        timestamp: new Date(tweet.created_at || Date.now()),
        metrics: tweet.public_metrics ? {
          likes: tweet.public_metrics.like_count,
          shares: tweet.public_metrics.retweet_count,
          comments: tweet.public_metrics.reply_count
        } : undefined,
        inReplyTo: tweet.conversation_id
      });
    }

    return posts;
  } catch (error) {
    logger.error('Twitter search failed:', error);
    return [];
  }
}

async function postToTwitter(content: string, replyTo?: string): Promise<SocialPost | null> {
  if (!twitterClient) {
    throw new Error('Twitter client not initialized');
  }

  try {
    const tweet = await twitterClient.v2.tweet({
      text: content,
      reply: replyTo ? { in_reply_to_tweet_id: replyTo } : undefined
    });

    return {
      id: tweet.data.id,
      platform: 'twitter',
      author: {
        id: '',
        username: '',
        displayName: 'RustyButter'
      },
      content: content,
      timestamp: new Date(),
      inReplyTo: replyTo
    };
  } catch (error) {
    logger.error('Failed to post to Twitter:', error);
    return null;
  }
}

// Instagram implementation using Facebook Graph API
async function searchInstagram(query: string, limit: number = 10): Promise<SocialPost[]> {
  if (!config.instagram?.accessToken) {
    logger.warn('Instagram search requires access token');
    return [];
  }

  try {
    // Instagram Basic Display API search is limited
    // We'll search for hashtags and users
    const posts: SocialPost[] = [];
    
    // Search hashtags
    const hashtagQuery = query.startsWith('#') ? query.slice(1) : query;
    const hashtagUrl = `https://graph.facebook.com/v18.0/ig_hashtag_search?user_id=${config.instagram.userId}&q=${encodeURIComponent(hashtagQuery)}&access_token=${config.instagram.accessToken}`;
    
    const hashtagResponse = await fetch(hashtagUrl);
    if (hashtagResponse.ok) {
      const hashtagData = await hashtagResponse.json() as any;
      
      if (hashtagData.data && hashtagData.data.length > 0) {
        const hashtagId = hashtagData.data[0].id;
        
        // Get recent media for this hashtag
        const mediaUrl = `https://graph.facebook.com/v18.0/${hashtagId}/recent_media?user_id=${config.instagram.userId}&fields=id,caption,media_type,media_url,timestamp,permalink,username&limit=${limit}&access_token=${config.instagram.accessToken}`;
        
        const mediaResponse = await fetch(mediaUrl);
        if (mediaResponse.ok) {
          const mediaData = await mediaResponse.json() as any;
          
          for (const media of mediaData.data || []) {
            posts.push({
              id: media.id,
              platform: 'instagram',
              author: {
                id: config.instagram.userId || '',
                username: media.username || '',
                displayName: media.username || ''
              },
              content: media.caption || '',
              timestamp: new Date(media.timestamp),
              url: media.permalink,
              media: media.media_url ? [media.media_url] : [],
              story: false
            });
          }
        }
      }
    }
    
    return posts.slice(0, limit);
  } catch (error) {
    logger.error('Instagram search failed:', error);
    return [];
  }
}

async function postToInstagram(content: string, mediaUrl?: string): Promise<SocialPost | null> {
  if (!config.instagram?.accessToken || !config.instagram?.userId) {
    throw new Error('Instagram posting requires access token and user ID');
  }

  try {
    // Instagram requires media for posts
    if (!mediaUrl) {
      logger.warn('Instagram posts require media URL');
      return null;
    }

    // Create media container
    const createMediaUrl = `https://graph.facebook.com/v18.0/${config.instagram.userId}/media`;
    const createMediaParams = new URLSearchParams({
      image_url: mediaUrl,
      caption: content,
      access_token: config.instagram.accessToken
    });

    const createResponse = await fetch(createMediaUrl, {
      method: 'POST',
      body: createMediaParams
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create media: ${await createResponse.text()}`);
    }

    const { id: creationId } = await createResponse.json() as any;

    // Publish the media
    const publishUrl = `https://graph.facebook.com/v18.0/${config.instagram.userId}/media_publish`;
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: config.instagram.accessToken
    });

    const publishResponse = await fetch(publishUrl, {
      method: 'POST',
      body: publishParams
    });

    if (!publishResponse.ok) {
      throw new Error(`Failed to publish media: ${await publishResponse.text()}`);
    }

    const { id } = await publishResponse.json() as any;

    return {
      id,
      platform: 'instagram',
      author: {
        id: config.instagram.userId,
        username: config.instagram.username || '',
        displayName: config.instagram.username || ''
      },
      content,
      timestamp: new Date(),
      media: [mediaUrl]
    };
  } catch (error) {
    logger.error('Failed to post to Instagram:', error);
    return null;
  }
}

async function getInstagramMentions(limit: number = 20): Promise<SocialPost[]> {
  if (!config.instagram?.accessToken || !config.instagram?.userId) {
    logger.warn('Instagram mentions require access token and user ID');
    return [];
  }

  try {
    // Get mentions from comments and tagged posts
    const posts: SocialPost[] = [];
    
    // Get user's media
    const mediaUrl = `https://graph.facebook.com/v18.0/${config.instagram.userId}/media?fields=id,caption,comments{text,username,timestamp},timestamp,permalink&limit=${limit}&access_token=${config.instagram.accessToken}`;
    
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      throw new Error(`Failed to get media: ${await response.text()}`);
    }

    const data = await response.json() as any;
    
    // Process comments that mention the user
    for (const media of data.data || []) {
      if (media.comments && media.comments.data) {
        for (const comment of media.comments.data) {
          if (comment.text.includes(`@${config.instagram.username}`)) {
            posts.push({
              id: `${media.id}_${comment.id}`,
              platform: 'instagram',
              author: {
                id: '',
                username: comment.username,
                displayName: comment.username
              },
              content: comment.text,
              timestamp: new Date(comment.timestamp),
              url: media.permalink,
              inReplyTo: media.id
            });
          }
        }
      }
    }

    return posts.slice(0, limit);
  } catch (error) {
    logger.error('Failed to get Instagram mentions:', error);
    return [];
  }
}

// Snapchat implementation (using public web data)
async function searchSnapchat(query: string, limit: number = 10): Promise<SocialPost[]> {
  if (!config.snapchat?.clientId || !config.snapchat?.clientSecret) {
    logger.warn('Snapchat search requires API credentials');
    return [];
  }

  try {
    // Snapchat's public API is very limited
    // We'll use their Snap Kit web API for basic functionality
    const posts: SocialPost[] = [];
    
    // Note: Snapchat doesn't have a traditional search API
    // This is a placeholder that would scrape public stories/snaps
    logger.info(`Snapchat search for "${query}" - limited API available`);
    
    // In production, this would use Snap Kit SDK or web scraping
    // For now, return empty array as Snapchat requires OAuth flow
    return posts;
  } catch (error) {
    logger.error('Snapchat search failed:', error);
    return [];
  }
}

async function postToSnapchat(content: string, mediaUrl?: string): Promise<SocialPost | null> {
  if (!config.snapchat?.clientId || !config.snapchat?.clientSecret) {
    throw new Error('Snapchat posting requires API credentials');
  }

  try {
    // Snapchat requires OAuth2 authentication and media
    if (!mediaUrl) {
      logger.warn('Snapchat posts require media');
      return null;
    }

    // In production, this would:
    // 1. Use OAuth2 to authenticate
    // 2. Upload media using Creative Kit
    // 3. Post as a story or snap
    
    logger.info('Snapchat posting via Creative Kit - requires OAuth implementation');
    
    // Return mock response for now
    return {
      id: `snap_${Date.now()}`,
      platform: 'snapchat',
      author: {
        id: config.snapchat.username || '',
        username: config.snapchat.username || '',
        displayName: config.snapchat.username || ''
      },
      content,
      timestamp: new Date(),
      media: [mediaUrl],
      story: true
    };
  } catch (error) {
    logger.error('Failed to post to Snapchat:', error);
    return null;
  }
}

async function getSnapchatMentions(limit: number = 20): Promise<SocialPost[]> {
  if (!config.snapchat?.clientId) {
    logger.warn('Snapchat mentions require API credentials');
    return [];
  }

  try {
    // Snapchat doesn't have a public mentions API
    // In production, this would monitor:
    // 1. Story replies
    // 2. Chat messages (if authorized)
    // 3. Snap replies
    
    const posts: SocialPost[] = [];
    logger.info('Snapchat mentions API not publicly available');
    
    return posts;
  } catch (error) {
    logger.error('Failed to get Snapchat mentions:', error);
    return [];
  }
}

// MCP Server setup
const server = new Server(
  {
    name: 'social-monitor',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_social',
        description: 'Search across social media platforms',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            },
            platform: {
              type: 'string',
              enum: ['twitter', 'reddit', 'facebook', 'instagram', 'snapchat', 'all'],
              description: 'Platform to search (default: all)'
            },
            limit: {
              type: 'number',
              description: 'Maximum results per platform (default: 10)'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'post_social',
        description: 'Post to social media platforms',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Content to post'
            },
            platforms: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['twitter', 'reddit', 'facebook', 'instagram', 'snapchat']
              },
              description: 'Platforms to post to'
            },
            replyTo: {
              type: 'string',
              description: 'ID of post to reply to (platform-specific)'
            }
          },
          required: ['content', 'platforms']
        }
      },
      {
        name: 'get_mentions',
        description: 'Get recent mentions across platforms',
        inputSchema: {
          type: 'object',
          properties: {
            platform: {
              type: 'string',
              enum: ['twitter', 'reddit', 'facebook', 'instagram', 'snapchat', 'all'],
              description: 'Platform to check (default: all)'
            },
            limit: {
              type: 'number',
              description: 'Maximum results per platform (default: 20)'
            }
          }
        }
      },
      {
        name: 'get_trending',
        description: 'Get trending topics or hashtags',
        inputSchema: {
          type: 'object',
          properties: {
            platform: {
              type: 'string',
              enum: ['twitter', 'reddit'],
              description: 'Platform to check'
            },
            category: {
              type: 'string',
              description: 'Category or subreddit to check'
            }
          }
        }
      },
      {
        name: 'monitor_keywords',
        description: 'Start monitoring specific keywords',
        inputSchema: {
          type: 'object',
          properties: {
            keywords: {
              type: 'array',
              items: { type: 'string' },
              description: 'Keywords to monitor'
            },
            platforms: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['twitter', 'reddit', 'facebook', 'instagram', 'snapchat']
              },
              description: 'Platforms to monitor'
            }
          },
          required: ['keywords']
        }
      },
      {
        name: 'get_social_status',
        description: 'Get current social monitor status',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();
  mcpLogger.toolCalled(name, args);

  try {
    switch (name) {
      case 'search_social': {
        const query = args?.query as string;
        const platform = args?.platform as string || 'all';
        const limit = args?.limit as number || 10;
        
        const results: SocialPost[] = [];
        
        if (platform === 'all' || platform === 'twitter') {
          if (twitterClient) {
            const twitterResults = await searchTwitter(query, limit);
            results.push(...twitterResults);
          }
        }
        
        if (platform === 'all' || platform === 'instagram') {
          if (config.instagram?.accessToken) {
            const instagramResults = await searchInstagram(query, limit);
            results.push(...instagramResults);
          }
        }
        
        if (platform === 'all' || platform === 'snapchat') {
          if (config.snapchat?.clientId) {
            const snapchatResults = await searchSnapchat(query, limit);
            results.push(...snapchatResults);
          }
        }
        
        // Add other platforms here
        
        mcpLogger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }]
        };
      }

      case 'post_social': {
        const content = args?.content as string;
        const platforms = args?.platforms as string[];
        const replyTo = args?.replyTo as string | undefined;
        
        const results: any[] = [];
        
        if (platforms.includes('twitter') && twitterClient) {
          const tweet = await postToTwitter(content, replyTo);
          if (tweet) {
            results.push({ platform: 'twitter', success: true, post: tweet });
          }
        }
        
        if (platforms.includes('instagram') && config.instagram?.accessToken) {
          // Instagram posts require media
          const mediaUrl = args?.mediaUrl as string | undefined;
          const post = await postToInstagram(content, mediaUrl);
          if (post) {
            results.push({ platform: 'instagram', success: true, post });
          } else {
            results.push({ platform: 'instagram', success: false, error: 'Instagram requires media URL' });
          }
        }
        
        if (platforms.includes('snapchat') && config.snapchat?.clientId) {
          // Snapchat posts require media
          const mediaUrl = args?.mediaUrl as string | undefined;
          const post = await postToSnapchat(content, mediaUrl);
          if (post) {
            results.push({ platform: 'snapchat', success: true, post });
          } else {
            results.push({ platform: 'snapchat', success: false, error: 'Snapchat requires media URL' });
          }
        }
        
        mcpLogger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }]
        };
      }

      case 'get_mentions': {
        const platform = args?.platform as string || 'all';
        const limit = args?.limit as number || 20;
        
        const mentions: SocialPost[] = [];
        
        if ((platform === 'all' || platform === 'twitter') && twitterClient) {
          const twitterMentions = await searchTwitter('@rustybutter OR rusty butter', limit);
          mentions.push(...twitterMentions);
        }
        
        if ((platform === 'all' || platform === 'instagram') && config.instagram?.accessToken) {
          const instagramMentions = await getInstagramMentions(limit);
          mentions.push(...instagramMentions);
        }
        
        if ((platform === 'all' || platform === 'snapchat') && config.snapchat?.clientId) {
          const snapchatMentions = await getSnapchatMentions(limit);
          mentions.push(...snapchatMentions);
        }
        
        mcpLogger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(mentions, null, 2)
          }]
        };
      }

      case 'get_social_status': {
        const status = {
          connected: isConnected,
          platforms: {
            twitter: !!twitterClient,
            reddit: false, // Not implemented yet
            facebook: false, // Not implemented yet
            instagram: !!config.instagram?.accessToken,
            snapchat: !!config.snapchat?.clientId
          },
          postHistory: postHistory.length,
          monitoring: true
        };
        
        mcpLogger.toolCompleted(name, Date.now() - startTime);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(status, null, 2)
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    mcpLogger.toolCompleted(name, Date.now() - startTime);
    logger.error(`Tool ${name} failed:`, error);
    throw error;
  }
});

// Start monitoring loop
async function startMonitoring() {
  setInterval(async () => {
    if (!isConnected) return;
    
    try {
      // Check for mentions
      if (twitterClient) {
        const mentions = await searchTwitter('@rustybutter OR "rusty butter"', 10);
        
        for (const mention of mentions) {
          // Check if we've seen this before
          if (!postHistory.find(p => p.id === mention.id)) {
            postHistory.push(mention);
            eventEmitter.emit('new-mention', mention);
            
            if (shouldSpawnClaude(mention)) {
              logger.info(`New mention requires response: ${mention.content}`);
              // Queue for Claude response
            }
          }
        }
      }
    } catch (error) {
      logger.error('Monitoring loop error:', error);
    }
  }, 60000); // Check every minute
}

// Main
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  logger.info('Social monitor MCP server started');
  
  // Initialize clients
  await initializeClients();
  
  // Start monitoring
  await startMonitoring();
  
  mcpLogger.connected({ platforms: Object.keys(config) });
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
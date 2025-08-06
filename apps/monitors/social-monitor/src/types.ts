/**
 * Shared types and interfaces for Social Monitor
 */

export interface SocialPost {
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

export interface PlatformConfig {
  twitter?: {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessTokenSecret: string;
    bearerToken: string;
  };
  reddit?: {
    clientId: string;
    clientSecret: string;
    userAgent: string;
  };
  facebook?: {
    appId: string;
    appSecret: string;
    accessToken: string;
    pageId: string;
  };
  instagram?: {
    appId: string;
    appSecret: string;
    accessToken: string;
    accountId: string;
  };
  snapchat?: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    accessToken: string;
  };
}

export interface PlatformAPI {
  name: string;
  isActive: boolean;
  initialize(config: any): Promise<void>;
  fetchPosts(limit?: number): Promise<SocialPost[]>;
  postMessage?(content: string): Promise<void>;
}

export interface MonitorState {
  isRunning: boolean;
  platforms: Record<string, boolean>;
  lastCheck: Date;
  postsMonitored: number;
  errors: number;
}
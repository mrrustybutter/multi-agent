import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { createLogger } from '@rusty-butter/logger';
import { randomBytes } from 'crypto';

const logger = createLogger('browser-manager');

export interface BrowserSession {
  id: string;
  context: BrowserContext;
  pages: Map<string, Page>;
  createdAt: Date;
  lastUsed: Date;
}

export interface BrowserConfig {
  headless: boolean;
  sessionTimeout: number;
  maxSessions: number;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private sessions = new Map<string, BrowserSession>();
  private config: BrowserConfig;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: BrowserConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    await this.initBrowser();
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(
      () => this.cleanupSessions(),
      60000 // Cleanup every minute
    );
    
    logger.info('Browser manager initialized');
  }

  private async initBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      logger.info('Browser launched');
    }
    return this.browser;
  }

  async createSession(): Promise<BrowserSession> {
    const browser = await this.initBrowser();
    const context = await browser.newContext();
    const id = randomBytes(16).toString('hex');
    
    const session: BrowserSession = {
      id,
      context,
      pages: new Map(),
      createdAt: new Date(),
      lastUsed: new Date()
    };
    
    this.sessions.set(id, session);
    logger.info(`Created session ${id}`);
    
    // Cleanup old sessions if we exceed max
    if (this.sessions.size > this.config.maxSessions) {
      const oldestSession = Array.from(this.sessions.values())
        .sort((a, b) => a.lastUsed.getTime() - b.lastUsed.getTime())[0];
      await this.closeSession(oldestSession.id);
    }
    
    return session;
  }

  async getPage(sessionId: string, pageId: string = 'default'): Promise<Page> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    session.lastUsed = new Date();
    
    let page = session.pages.get(pageId);
    if (!page) {
      page = await session.context.newPage();
      session.pages.set(pageId, page);
      logger.info(`Created page ${pageId} in session ${sessionId}`);
    }
    
    return page;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.context.close();
      this.sessions.delete(sessionId);
      logger.info(`Closed session ${sessionId}`);
    }
  }

  private async cleanupSessions(): Promise<void> {
    const now = Date.now();
    const sessionsToClose: string[] = [];
    
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastUsed.getTime() > this.config.sessionTimeout) {
        sessionsToClose.push(id);
      }
    }
    
    for (const id of sessionsToClose) {
      await this.closeSession(id);
      logger.info(`Cleaned up expired session ${id}`);
    }
  }

  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): Map<string, BrowserSession> {
    return this.sessions;
  }

  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Close all sessions
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
    
    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    
    logger.info('Browser manager shut down');
  }
}
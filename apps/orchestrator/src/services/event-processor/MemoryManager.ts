import { Event } from '../../types';
import { MemoryClient, initializeMemory } from '@rusty-butter/shared';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('memory-manager');

export class MemoryManager {
  private memoryClient: MemoryClient | null = null;

  async initialize(): Promise<MemoryClient | null> {
    try {
      logger.info('🧠 Initializing semantic memory client...');
      this.memoryClient = await initializeMemory();
      
      if (this.memoryClient) {
        const stats = await this.memoryClient.getStats();
        logger.info('✅ Semantic memory initialized:', stats);
      }
      
      return this.memoryClient;
    } catch (error) {
      logger.warn('⚠️ Failed to initialize semantic memory:', error);
      return null;
    }
  }

  getClient(): MemoryClient | null {
    return this.memoryClient;
  }

  async getSemanticContext(event: Event): Promise<string | undefined> {
    if (!this.memoryClient) return undefined;

    try {
      const query = this.buildMemoryQuery(event);
      const memories = await this.memoryClient.search(query, { limit: 5 });
      
      if (memories && memories.length > 0) {
        return memories.map(m => `[${m.timestamp}] ${m.content}`).join('\n');
      }
    } catch (error) {
      logger.error('Failed to get semantic context:', error);
    }
    
    return undefined;
  }

  async embedToMemory(
    content: string, 
    metadata: Record<string, any> = {},
    memoryBank?: string
  ): Promise<void> {
    if (!this.memoryClient) return;

    try {
      await this.memoryClient.embed(content, metadata, memoryBank);
      logger.debug(`📝 Embedded to memory bank: ${memoryBank || 'general'}`);
    } catch (error) {
      logger.error('Failed to embed to memory:', error);
    }
  }

  determineMemoryBank(event: Event): string {
    // Code-related events
    if (this.isCodeRelated(event)) {
      return 'code';
    }
    
    // User interactions and chat
    if (event.source === 'twitch' || event.source === 'discord') {
      if (event.type === 'chat_message' || event.type === 'voice_message') {
        return 'chat-history';
      }
      return 'conversations';
    }
    
    // Documentation and project info
    if (event.type === 'documentation' || event.type === 'project_update') {
      return 'documents';
    }
    
    // Default to general
    return 'general';
  }

  private isCodeRelated(event: Event): boolean {
    const codeKeywords = [
      'code', 'function', 'class', 'bug', 'error', 'implement',
      'refactor', 'debug', 'compile', 'syntax', 'variable', 'method',
      'api', 'endpoint', 'database', 'query', 'algorithm'
    ];
    
    const message = event.data?.message?.toLowerCase() || '';
    return codeKeywords.some(keyword => message.includes(keyword));
  }

  private buildMemoryQuery(event: Event): string {
    const parts = [];
    
    if (event.data?.message) {
      parts.push(event.data.message);
    }
    
    if (event.data?.user) {
      parts.push(`user:${event.data.user}`);
    }
    
    if (event.source) {
      parts.push(`source:${event.source}`);
    }
    
    return parts.join(' ');
  }

  async storeInteraction(event: Event, response: string): Promise<void> {
    const memoryBank = this.determineMemoryBank(event);
    
    // Store the interaction
    const interaction = {
      event: event.data?.message || '',
      response,
      user: event.data?.user || 'unknown',
      timestamp: new Date().toISOString()
    };
    
    await this.embedToMemory(
      JSON.stringify(interaction) + ' metadata:' + JSON.stringify({
        type: 'interaction',
        source: event.source,
        eventId: event.id
      }),
      {},
      memoryBank
    );
  }

  async extractAndStoreUserPreferences(event: Event, response: string): Promise<void> {
    // Extract potential preferences from conversation
    const preferenceKeywords = [
      'i like', 'i prefer', 'i hate', 'i love', "i'm interested in",
      'my favorite', 'i always', 'i never', "i'm a fan of"
    ];
    
    const message = (event.data?.message || '').toLowerCase();
    const hasPreference = preferenceKeywords.some(kw => message.includes(kw));
    
    if (hasPreference && event.data?.user) {
      await this.embedToMemory(
        `User ${event.data.user}: ${event.data.message} metadata: ${JSON.stringify({
          type: 'user_preference',
          user: event.data.user,
          source: event.source
        })}`,
        {},
        'chat-history'
      );
    }
  }
}
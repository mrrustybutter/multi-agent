import { Event } from '../../types';
import { ResponseParser } from '@rusty-butter/shared';

interface ParsedResponse {
  type: 'structured' | 'text';
  data: any;
}
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('response-processor');

export class ResponseProcessor {
  private responseParser: ResponseParser;

  constructor() {
    this.responseParser = new ResponseParser();
  }

  async parseAndExtractActionSummary(
    event: Event, 
    response: string, 
    provider: string
  ): Promise<any> {
    try {
      // Try to parse structured response
      const parsed = this.responseParser.parseResponse(response);
      
      if (parsed.type === 'structured') {
        return {
          actions: parsed.data.actions || [],
          summary: parsed.data.summary || response.substring(0, 200),
          tools: parsed.data.tools || [],
          nextSteps: parsed.data.nextSteps || []
        };
      }
      
      // Fallback to text extraction
      return this.extractFromText(response);
    } catch (error) {
      logger.warn('Failed to parse response, using text extraction:', error);
      return this.extractFromText(response);
    }
  }

  private extractFromText(text: string): any {
    return {
      actions: this.extractSection(text, 'actions'),
      summary: this.extractValue(text, 'summary') || text.substring(0, 200),
      tools: this.extractSection(text, 'tools'),
      nextSteps: this.extractSection(text, 'next steps')
    };
  }

  private extractSection(text: string, sectionName: string): string[] {
    const regex = new RegExp(`${sectionName}:?\\s*([\\s\\S]*?)(?:\\n\\n|$)`, 'i');
    const match = text.match(regex);
    
    if (match && match[1]) {
      return match[1]
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && line !== '-')
        .map(line => line.replace(/^[-*]\s*/, ''));
    }
    
    return [];
  }

  private extractValue(text: string, fieldName: string): string | null {
    const regex = new RegExp(`${fieldName}:?\\s*(.+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  extractCodeBlocks(text: string): Array<{language: string, code: string}> {
    const codeBlocks: Array<{language: string, code: string}> = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      codeBlocks.push({
        language: match[1] || 'plaintext',
        code: match[2].trim()
      });
    }
    
    return codeBlocks;
  }

  buildEventMessage(event: Event): string {
    const parts = [];
    
    // Add event context
    parts.push(`[${event.source}/${event.type}]`);
    
    // Add user if present
    if (event.data?.user) {
      parts.push(`User: ${event.data.user}`);
    }
    
    // Add message
    if (event.data?.message) {
      parts.push(`Message: ${event.data.message}`);
    }
    
    // Add any additional context
    if (event.context) {
      parts.push(`Context: ${JSON.stringify(event.context)}`);
    }
    
    return parts.join('\n');
  }

  formatResponseForPlatform(response: string, platform: string): string {
    switch (platform) {
      case 'twitch':
        // Twitch has 500 char limit
        return response.length > 500 
          ? response.substring(0, 497) + '...'
          : response;
      
      case 'discord':
        // Discord has 2000 char limit
        return response.length > 2000
          ? response.substring(0, 1997) + '...'
          : response;
      
      case 'twitter':
      case 'x':
        // Twitter has 280 char limit
        return response.length > 280
          ? response.substring(0, 277) + '...'
          : response;
      
      default:
        return response;
    }
  }
}
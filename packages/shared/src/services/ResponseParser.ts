import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('response-parser');

export interface ParsedResponse {
  speechText?: string;
  actionSummary?: ActionSummary;
  toolCalls?: any[];
  rawContent: string;
}

export interface ActionSummary {
  actionsTaken: string[];
  keyInformation: string[];
  responseType: string;
  complexity: 'simple' | 'moderate' | 'complex';
  embedMemory: boolean;
}

export class ResponseParser {
  /**
   * Parse LLM response to extract speech, action summary, and tool calls
   */
  static parseResponse(content: string, toolCalls?: any[]): ParsedResponse {
    const result: ParsedResponse = {
      rawContent: content,
      toolCalls
    };

    // Extract speech text from <speak> tags or clean text
    result.speechText = this.extractSpeechText(content);

    // Extract action summary
    result.actionSummary = this.extractActionSummary(content);

    return result;
  }

  /**
   * Extract speech text from response
   */
  private static extractSpeechText(content: string): string | undefined {
    // Check for SSML <speak> tags
    const ssmlMatch = content.match(/<speak>([\s\S]*?)<\/speak>/);
    if (ssmlMatch) {
      // Clean SSML tags but keep the text
      return ssmlMatch[1]
        .replace(/<[^>]+>/g, '') // Remove all XML tags
        .replace(/\s+/g, ' ')    // Normalize whitespace
        .trim();
    }

    // Check for speech markers
    const speechMatch = content.match(/Speech:\s*(.*?)(?:\n|$)/i);
    if (speechMatch) {
      return speechMatch[1].trim();
    }

    // If no special markers, extract clean text before action summary
    const beforeSummary = content.split('---ACTION SUMMARY---')[0];
    
    // Remove tool calls and JSON from the text
    const cleanText = beforeSummary
      .replace(/\{[\s\S]*?\}/g, '') // Remove JSON blocks
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/mcp__[\w-]+__[\w-]+/g, '') // Remove MCP tool references
      .trim();

    return cleanText || undefined;
  }

  /**
   * Extract action summary from response
   */
  private static extractActionSummary(content: string): ActionSummary | undefined {
    const summaryMatch = content.match(/---ACTION SUMMARY---([\s\S]*?)---END SUMMARY---/);
    
    if (!summaryMatch) {
      return undefined;
    }

    const summaryText = summaryMatch[1];
    
    // Parse actions taken
    const actionsTaken: string[] = [];
    const actionsMatch = summaryText.match(/\*\*Actions Taken:\*\*([\s\S]*?)(?:\*\*|$)/);
    if (actionsMatch) {
      const actions = actionsMatch[1].split('\n')
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(line => line.length > 0);
      actionsTaken.push(...actions);
    }

    // Parse key information
    const keyInformation: string[] = [];
    const keyInfoMatch = summaryText.match(/\*\*Key Information:\*\*([\s\S]*?)(?:\*\*|$)/);
    if (keyInfoMatch) {
      const info = keyInfoMatch[1].split('\n')
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(line => line.length > 0);
      keyInformation.push(...info);
    }

    // Parse response type
    const responseTypeMatch = summaryText.match(/\*\*Response Type:\*\*\s*(\w+)/);
    const responseType = responseTypeMatch ? responseTypeMatch[1] : 'unknown';

    // Parse complexity
    const complexityMatch = summaryText.match(/\*\*Complexity:\*\*\s*(\w+)/);
    const complexity = (complexityMatch ? complexityMatch[1] : 'simple') as 'simple' | 'moderate' | 'complex';

    // Parse embed memory flag
    const embedMatch = summaryText.match(/\*\*Embed Memory:\*\*\s*(\w+)/);
    const embedMemory = embedMatch ? embedMatch[1].toLowerCase() === 'true' : true;

    return {
      actionsTaken,
      keyInformation,
      responseType,
      complexity,
      embedMemory
    };
  }

  /**
   * Clean text for speech synthesis
   */
  static cleanForSpeech(text: string): string {
    return text
      // Remove markdown formatting
      .replace(/\*\*(.*?)\*\*/g, '$1')  // Bold
      .replace(/\*(.*?)\*/g, '$1')      // Italic
      .replace(/`(.*?)`/g, '$1')        // Code
      .replace(/#{1,6}\s/g, '')         // Headers
      
      // Remove URLs
      .replace(/https?:\/\/[^\s]+/g, 'link')
      
      // Remove special characters that might cause issues
      .replace(/[<>{}[\]]/g, '')
      
      // Clean up whitespace
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
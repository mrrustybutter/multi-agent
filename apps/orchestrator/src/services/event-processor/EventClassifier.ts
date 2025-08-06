import { Event, LLMProvider } from '../../types';
import { getLogger } from '@rusty-butter/logger';

const logger = getLogger('event-classifier');

export class EventClassifier {
  isVoiceEvent(event: Event): boolean {
    return event.type === 'voice_message' || 
           event.data?.requiresVoice === true ||
           (event.source === 'discord' && event.data?.channel?.includes('voice'));
  }

  isCodeRelated(event: Event): boolean {
    const codeKeywords = [
      'code', 'function', 'class', 'bug', 'error', 'implement',
      'refactor', 'debug', 'compile', 'syntax', 'variable', 'method',
      'api', 'endpoint', 'database', 'query', 'algorithm', 'typescript',
      'javascript', 'python', 'rust', 'npm', 'yarn', 'pnpm', 'git'
    ];
    
    const message = event.data?.message?.toLowerCase() || '';
    const hasCodeKeyword = codeKeywords.some(keyword => message.includes(keyword));
    
    // Check for code blocks
    const hasCodeBlock = message.includes('```') || message.includes('`');
    
    return hasCodeKeyword || hasCodeBlock;
  }

  determineLLMProvider(event: Event): LLMProvider {
    // Code-related tasks go to Claude
    if (this.isCodeRelated(event)) {
      return 'anthropic';
    }
    
    // Chat messages should use OpenAI for conversational ability
    if (event.source === 'twitch' || event.source === 'discord') {
      if (event.type === 'chat_message' || event.type === 'voice_message') {
        // Memes and banter go to Grok
        if (this.isMemeOrBanter(event)) {
          return 'grok';
        }
        return 'openai';
      }
    }
    
    // Twitter/X events should use Grok
    if (event.source === 'twitter' || event.source === 'x') {
      return 'grok';
    }
    
    // Quick responses can use Gemini for speed
    if (event.priority === 'low' || event.type === 'notification') {
      return 'gemini';
    }
    
    // Research and factual queries
    if (this.isResearchQuery(event)) {
      return 'gemini';
    }
    
    // Default to OpenAI for general purposes
    return 'openai';
  }

  private isMemeOrBanter(event: Event): boolean {
    const banterKeywords = [
      'lol', 'lmao', 'rofl', 'kek', 'based', 'cringe', 'cope',
      'meme', 'joke', 'funny', 'hilarious', 'wtf', 'bruh', 'poggers',
      'pepe', 'kappa', 'omegalul', 'copium', 'hopium', 'sadge'
    ];
    
    const message = event.data?.message?.toLowerCase() || '';
    return banterKeywords.some(keyword => message.includes(keyword));
  }

  private isResearchQuery(event: Event): boolean {
    const researchKeywords = [
      'what is', 'how does', 'explain', 'definition', 'research',
      'tell me about', 'describe', 'summary', 'summarize', 'facts about',
      'statistics', 'data on', 'information about', 'details on'
    ];
    
    const message = event.data?.message?.toLowerCase() || '';
    return researchKeywords.some(keyword => message.includes(keyword));
  }

  detectCodeLanguage(codeBlock: string): string {
    const patterns = {
      javascript: /\b(const|let|var|function|=>|async|await)\b/,
      typescript: /\b(interface|type|enum|implements|namespace)\b/,
      python: /\b(def|import|from|class|if __name__|print)\b/,
      rust: /\b(fn|let mut|impl|struct|enum|match|cargo)\b/,
      go: /\b(func|package|import|defer|goroutine)\b/,
      java: /\b(public class|private|protected|static void)\b/,
      cpp: /\b(#include|std::|cout|cin|nullptr)\b/,
      csharp: /\b(using|namespace|public class|static void Main)\b/
    };
    
    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(codeBlock)) {
        return lang;
      }
    }
    
    return 'unknown';
  }
}
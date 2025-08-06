import { Page } from 'playwright';
import { createLogger } from '@rusty-butter/logger';
import { BrowserManager } from './BrowserManager';
import { SSEManager } from './SSEManager';

const logger = createLogger('mcp-tool-handler');

export interface ToolResult {
  content: Array<{ type: string; text?: string; data?: any }>;
}

export class MCPToolHandler {
  constructor(
    private browserManager: BrowserManager,
    private sseManager: SSEManager
  ) {}

  async handleNavigate(args: any): Promise<ToolResult> {
    const { sessionId, url, pageId = 'default' } = args;
    
    if (!sessionId || !url) {
      throw new Error('sessionId and url are required');
    }

    const page = await this.browserManager.getPage(sessionId, pageId);
    await page.goto(url);
    
    this.sseManager.notifyPageNavigated(sessionId, pageId, url);
    
    return {
      content: [{ 
        type: 'text', 
        text: `Navigated to ${url} in session ${sessionId}` 
      }]
    };
  }

  async handleClick(args: any): Promise<ToolResult> {
    const { sessionId, selector, pageId = 'default' } = args;
    
    if (!sessionId || !selector) {
      throw new Error('sessionId and selector are required');
    }

    const page = await this.browserManager.getPage(sessionId, pageId);
    await page.click(selector);
    
    return {
      content: [{ 
        type: 'text', 
        text: `Clicked ${selector} in session ${sessionId}` 
      }]
    };
  }

  async handleType(args: any): Promise<ToolResult> {
    const { sessionId, selector, text, pageId = 'default' } = args;
    
    if (!sessionId || !selector || !text) {
      throw new Error('sessionId, selector, and text are required');
    }

    const page = await this.browserManager.getPage(sessionId, pageId);
    await page.type(selector, text);
    
    return {
      content: [{ 
        type: 'text', 
        text: `Typed "${text}" into ${selector}` 
      }]
    };
  }

  async handleScreenshot(args: any): Promise<ToolResult> {
    const { sessionId, pageId = 'default', fullPage = false } = args;
    
    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    const page = await this.browserManager.getPage(sessionId, pageId);
    const screenshot = await page.screenshot({ 
      fullPage, 
      type: 'png',
      encoding: 'base64'
    });
    
    return {
      content: [{ 
        type: 'image',
        data: screenshot
      }]
    };
  }

  async handleEvaluate(args: any): Promise<ToolResult> {
    const { sessionId, script, pageId = 'default' } = args;
    
    if (!sessionId || !script) {
      throw new Error('sessionId and script are required');
    }

    const page = await this.browserManager.getPage(sessionId, pageId);
    const result = await page.evaluate(script);
    
    return {
      content: [{ 
        type: 'text', 
        text: JSON.stringify(result, null, 2)
      }]
    };
  }

  async handleWaitFor(args: any): Promise<ToolResult> {
    const { sessionId, selector, pageId = 'default', timeout = 30000 } = args;
    
    if (!sessionId || !selector) {
      throw new Error('sessionId and selector are required');
    }

    const page = await this.browserManager.getPage(sessionId, pageId);
    await page.waitForSelector(selector, { timeout });
    
    return {
      content: [{ 
        type: 'text', 
        text: `Element ${selector} is now visible` 
      }]
    };
  }

  async handleGetContent(args: any): Promise<ToolResult> {
    const { sessionId, selector, pageId = 'default' } = args;
    
    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    const page = await this.browserManager.getPage(sessionId, pageId);
    
    let content: string;
    if (selector) {
      const element = await page.$(selector);
      if (!element) {
        throw new Error(`Element ${selector} not found`);
      }
      content = await element.textContent() || '';
    } else {
      content = await page.content();
    }
    
    return {
      content: [{ 
        type: 'text', 
        text: content
      }]
    };
  }

  async handleCreateSession(): Promise<ToolResult> {
    const session = await this.browserManager.createSession();
    this.sseManager.notifySessionCreated(session.id);
    
    return {
      content: [{ 
        type: 'text', 
        text: `Created session ${session.id}` 
      }]
    };
  }

  async handleCloseSession(args: any): Promise<ToolResult> {
    const { sessionId } = args;
    
    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    await this.browserManager.closeSession(sessionId);
    this.sseManager.notifySessionClosed(sessionId);
    
    return {
      content: [{ 
        type: 'text', 
        text: `Closed session ${sessionId}` 
      }]
    };
  }

  async handleListSessions(): Promise<ToolResult> {
    const sessionIds = this.browserManager.getSessionIds();
    
    return {
      content: [{ 
        type: 'text', 
        text: `Active sessions: ${sessionIds.join(', ') || 'none'}`
      }]
    };
  }

  async handleFill(args: any): Promise<ToolResult> {
    const { sessionId, selector, value, pageId = 'default' } = args;
    
    if (!sessionId || !selector || value === undefined) {
      throw new Error('sessionId, selector, and value are required');
    }

    const page = await this.browserManager.getPage(sessionId, pageId);
    await page.fill(selector, value.toString());
    
    return {
      content: [{ 
        type: 'text', 
        text: `Filled ${selector} with "${value}"` 
      }]
    };
  }

  async handlePress(args: any): Promise<ToolResult> {
    const { sessionId, key, pageId = 'default' } = args;
    
    if (!sessionId || !key) {
      throw new Error('sessionId and key are required');
    }

    const page = await this.browserManager.getPage(sessionId, pageId);
    await page.keyboard.press(key);
    
    return {
      content: [{ 
        type: 'text', 
        text: `Pressed key: ${key}` 
      }]
    };
  }

  async handleGoBack(args: any): Promise<ToolResult> {
    const { sessionId, pageId = 'default' } = args;
    
    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    const page = await this.browserManager.getPage(sessionId, pageId);
    await page.goBack();
    const url = page.url();
    
    this.sseManager.notifyPageNavigated(sessionId, pageId, url);
    
    return {
      content: [{ 
        type: 'text', 
        text: `Navigated back to ${url}` 
      }]
    };
  }

  async handleGoForward(args: any): Promise<ToolResult> {
    const { sessionId, pageId = 'default' } = args;
    
    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    const page = await this.browserManager.getPage(sessionId, pageId);
    await page.goForward();
    const url = page.url();
    
    this.sseManager.notifyPageNavigated(sessionId, pageId, url);
    
    return {
      content: [{ 
        type: 'text', 
        text: `Navigated forward to ${url}` 
      }]
    };
  }

  async handleReload(args: any): Promise<ToolResult> {
    const { sessionId, pageId = 'default' } = args;
    
    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    const page = await this.browserManager.getPage(sessionId, pageId);
    await page.reload();
    const url = page.url();
    
    return {
      content: [{ 
        type: 'text', 
        text: `Reloaded ${url}` 
      }]
    };
  }
}
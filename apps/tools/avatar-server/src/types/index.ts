export interface Expression {
  name: string;
  imageUrl: string;
  description: string;
  useCases: string;
}

export interface AvatarState {
  direction: 'left' | 'right';
  posX: number;
  posY: number;
  rotation: number;
  scale: number;
}

export interface BatchExpressions {
  loop: boolean;
  random: boolean;
  actions: Array<{
    expression: string;
    duration: number;
    direction?: 'left' | 'right';
    posX?: number;
    posY?: number;
    rotation?: number;
    scale?: number;
  }>;
  batchId: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}
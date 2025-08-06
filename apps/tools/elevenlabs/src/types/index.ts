export interface AudioGenerationParams {
  text: string;
  voice_id?: string;
  model_id?: string;
  voice_settings?: {
    stability?: number;
    similarity_boost?: number;
  };
}

export interface StreamAudioParams extends AudioGenerationParams {
  buffer_size?: number;
  optimize_streaming_latency?: number;
}

export interface Voice {
  voice_id: string;
  name: string;
  preview_url?: string;
  category?: string;
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
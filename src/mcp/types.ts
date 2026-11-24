export type McpServerKind = 'local' | 'remote';
export type McpAuthType = 'no_auth' | 'oauth';
export type McpConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'disconnected'
  | 'error'
  | 'auth_required';

export interface LocalMcpConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface McpServerRecord {
  id: string;
  name: string;
  description: string;
  kind: McpServerKind;
  /** Local stdio configuration (only for kind === 'local'). */
  config?: LocalMcpConfig;
  /** Remote endpoint URL (only for kind === 'remote'). */
  url?: string;
  auth_type?: McpAuthType;
  enabled: boolean;
  /** When true, this server's tools are also exposed to sub-agents. */
  allow_sub_agents: boolean;
  /** Native MCP tool names that the user disabled. */
  disabled_tools: string[];
  created_at: number;
  updated_at: number;
}

export interface McpToolInfo {
  serverId: string;
  serverName: string;
  /** Fully qualified name used with the LLM: mcp__<server>__<tool>. */
  qualifiedName: string;
  /** Original tool name advertised by the MCP server. */
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface McpServerState {
  status: McpConnectionStatus;
  error?: string;
  connected_at?: number;
  tools: McpToolInfo[];
  authorizationUrl?: string;
}

export interface McpServerView extends McpServerRecord {
  status: McpConnectionStatus;
  error?: string;
  connected_at?: number;
  tools: Array<{
    name: string;
    qualified_name: string;
    description: string;
    enabled: boolean;
  }>;
  authorization_url?: string;
}

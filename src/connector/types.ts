export interface ConnectorToolkit {
  slug: string;
  name: string;
  description: string;
  logo: string;
  categories: string[];
  app_url?: string;
  auth_schemes: string[];
}

export type ConnectorConnectionStatus =
  | 'connected'
  | 'pending'
  | 'error'
  | 'disconnected';

export interface ConnectorConnection {
  slug: string;
  connected_account_id: string;
  auth_config_id: string;
  status: ConnectorConnectionStatus;
  alias?: string;
  error?: string;
  connected_at?: number;
  updated_at: number;
}

export interface ConnectorStoreData {
  api_key: string;
  user_id: string;
  enabled: boolean;
  allow_sub_agents: boolean;
  connections: Record<string, ConnectorConnection>;
}

export interface ConnectorSettingsView {
  configured: boolean;
  api_key_masked: string;
  enabled: boolean;
  allow_sub_agents: boolean;
}

export interface ConnectorView extends ConnectorToolkit {
  connected: boolean;
  status: ConnectorConnectionStatus;
  connected_account_id?: string;
  connected_at?: number;
  tool_count: number;
  error?: string;
}

export interface ConnectorLink {
  slug: string;
  name: string;
  description: string;
  logo: string;
  redirect_url: string;
  connected_account_id: string;
  expires_at?: string;
}

export interface ComposioToolInfo {
  slug: string;
  name: string;
  description: string;
  input_parameters: Record<string, any>;
}

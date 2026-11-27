import { db } from '../db/index.js';
import { listCustomAgents } from '../custom-agents/index.js';
import { getAllResolvedProviders } from '../providers/index.js';

export const ACP_DEFAULT_MODE_ID = 'default';
const ACP_AGENT_MODE_SETTING = 'acp_agent_mode';

/**
 * Exactly what an ACP client needs to launch this agent over stdio.
 * Kept in one place so the UI and the API cannot drift apart.
 */
export const ACP_CLIENT_CONFIG = {
  agent_servers: {
    mythgram: {
      command: 'npx',
      args: ['--yes', 'mythgram'],
    },
  },
} as const;

export interface AcpMode {
  id: string;
  name: string;
  description?: string | null;
}

export interface AcpModeState {
  currentModeId: string;
  availableModes: AcpMode[];
}

export interface AcpSettingsPayload {
  ok: boolean;
  agentMode: string;
  customAgents: Array<{ id: string; name: string; description: string }>;
  provider: { id: string; name: string; model: string };
  config: typeof ACP_CLIENT_CONFIG;
}

/** Returns the configured custom agent id, or '' for the default Mythgram agent. */
export function getConfiguredAcpAgentId(): string {
  return db.getSetting(ACP_AGENT_MODE_SETTING, '').trim();
}

/** Drops the setting when the referenced custom agent no longer exists. */
export async function resolveConfiguredAcpAgentId(): Promise<string> {
  const configured = getConfiguredAcpAgentId();
  if (!configured) return '';
  const agents = await listCustomAgents();
  if (agents.some((agent) => agent.id === configured)) return configured;
  db.setSetting(ACP_AGENT_MODE_SETTING, '');
  return '';
}

export async function setConfiguredAcpAgentId(idOrNull: string | null): Promise<string> {
  if (!idOrNull || idOrNull === ACP_DEFAULT_MODE_ID) {
    db.setSetting(ACP_AGENT_MODE_SETTING, '');
    return '';
  }
  const agents = await listCustomAgents();
  const agent = agents.find((entry) => entry.id === idOrNull);
  if (!agent) throw new Error('Custom agent not found.');
  db.setSetting(ACP_AGENT_MODE_SETTING, agent.id);
  return agent.id;
}

export async function buildAcpModeState(currentModeId?: string): Promise<AcpModeState> {
  const agents = await listCustomAgents();
  const availableModes: AcpMode[] = [
    {
      id: ACP_DEFAULT_MODE_ID,
      name: 'Mythgram (default)',
      description: 'The default Mythgram agent.',
    },
    ...agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description || 'Custom Mythgram agent.',
    })),
  ];

  const requested = currentModeId ?? getConfiguredAcpAgentId();
  const active = availableModes.some((mode) => mode.id === requested)
    ? requested
    : ACP_DEFAULT_MODE_ID;

  return { currentModeId: active, availableModes };
}

export async function getAcpSettingsPayload(): Promise<AcpSettingsPayload> {
  const agentMode = await resolveConfiguredAcpAgentId();
  const agents = await listCustomAgents();
  const providerId = db.getSetting('active_provider', 'pollinations');
  const modelId = db.getSetting('active_model', 'openai');
  const provider = getAllResolvedProviders().find((entry) => entry.id === providerId);

  return {
    ok: true,
    agentMode,
    customAgents: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
    })),
    provider: {
      id: providerId,
      name: provider?.name || providerId,
      model: modelId,
    },
    config: ACP_CLIENT_CONFIG,
  };
}

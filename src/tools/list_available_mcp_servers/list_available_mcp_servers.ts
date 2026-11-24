import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { listMcpServerViews } from '../../mcp/index.js';

export const listAvailableMcpServersSchema = z.object({}).strict();

export const listAvailableMcpServersTool: MythgramTool<
  typeof listAvailableMcpServersSchema
> = {
  name: 'list_available_mcp_servers',
  description:
    'List all MCP servers currently available to the agent, including their names, descriptions, and connection status.',
  schema: listAvailableMcpServersSchema,
  execute: async () => {
    const servers = await listMcpServerViews();
    return {
      success: true,
      count: servers.length,
      servers: servers.map((s) => ({
        name: s.name,
        description: s.description,
        kind: s.kind,
        status: s.status,
        enabled: s.enabled,
        allow_sub_agents: s.allow_sub_agents,
        tool_count: s.tools.length,
        disabled_tools: s.disabled_tools,
        tools: s.tools.map((t) => t.name),
        error: s.error,
      })),
    };
  },
};

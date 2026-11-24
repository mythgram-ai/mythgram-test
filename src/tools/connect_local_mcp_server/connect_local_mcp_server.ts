import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { addAndConnectLocal, normalizeLocalConfig } from '../../mcp/index.js';

export const connectLocalMcpServerSchema = z
  .object({
    mcp_server_name: z.string().min(1).describe('A name for the MCP server.'),
    mcp_server_description: z
      .string()
      .min(1)
      .describe('A short description of what the MCP server provides or is used for.'),
    mcpconfig_json: z
      .union([z.object({}).passthrough(), z.string().min(1)])
      .describe(
        'The complete MCP server configuration JSON used to connect to the local MCP server. Supply an object, not an array or empty value.'
      ),
  })
  .strict();

export const connectLocalMcpServerTool: MythgramTool<typeof connectLocalMcpServerSchema> = {
  name: 'connect_local_mcp_server',
  description:
    'Connect to a local MCP server using its MCP configuration JSON. Provide the server name, description, and complete MCP configuration JSON.',
  schema: connectLocalMcpServerSchema,
  execute: async (args) => {
    let rawConfig: unknown = args.mcpconfig_json;
    if (typeof rawConfig === 'string') {
      try {
        rawConfig = JSON.parse(rawConfig);
      } catch {
        throw new Error('mcpconfig_json must be valid JSON.');
      }
    }
    const config = normalizeLocalConfig(rawConfig);
    const { server, state } = await addAndConnectLocal({
      name: args.mcp_server_name,
      description: args.mcp_server_description,
      config,
    });
    if (state.status !== 'connected') {
      throw new Error(
        state.error || `Failed to connect to local MCP server "${server.name}".`
      );
    }
    return {
      success: true,
      server: {
        id: server.id,
        name: server.name,
        description: server.description,
        kind: server.kind,
        status: state.status,
        tool_count: state.tools.length,
      },
      tools: state.tools.map((t) => ({
        name: t.name,
        qualified_name: t.qualifiedName,
        description: t.description,
      })),
      message: `Connected local MCP server "${server.name}" and exposed ${state.tools.length} tool(s).`,
    };
  },
};

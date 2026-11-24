import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { addAndConnectRemote } from '../../mcp/index.js';

export const connectRemoteMcpSchema = z
  .object({
    mcp_server_name: z.string().min(1).describe('A name for the MCP server.'),
    mcp_server_description: z
      .string()
      .min(1)
      .describe('A short description of what the MCP server provides or is used for.'),
    url: z
      .string()
      .min(1)
      .refine((value) => /^https?:\/\//i.test(value), {
        message: 'url must start with http:// or https://',
      })
      .describe('The remote MCP server URL; must use http:// or https://.'),
    auth_type: z
      .enum(['no_auth', 'oauth'])
      .describe('Authentication method for the MCP server.'),
  })
  .strict();

export const connectRemoteMcpTool: MythgramTool<typeof connectRemoteMcpSchema> = {
  name: 'connect_remote_mcp',
  description:
    'Connect to a remote MCP server. Provide the server name, description, MCP server URL, and authentication method. Use no_auth for unauthenticated servers or oauth for servers requiring OAuth authorization.',
  schema: connectRemoteMcpSchema,
  execute: async (args) => {
    const { server, state } = await addAndConnectRemote({
      name: args.mcp_server_name,
      description: args.mcp_server_description,
      url: args.url,
      authType: args.auth_type,
    });
    if (state.status === 'auth_required') {
      return {
        success: false,
        auth_required: true,
        server: { id: server.id, name: server.name, status: state.status },
        authorization_url: state.authorizationUrl,
        message:
          'The remote MCP server requires OAuth authorization. Ask the user to open the authorization URL in a browser, then reconnect the server from the MCP page.',
      };
    }
    if (state.status !== 'connected') {
      throw new Error(
        state.error || `Failed to connect to remote MCP server "${server.name}".`
      );
    }
    return {
      success: true,
      server: {
        id: server.id,
        name: server.name,
        description: server.description,
        kind: server.kind,
        url: server.url,
        status: state.status,
        tool_count: state.tools.length,
      },
      tools: state.tools.map((t) => ({
        name: t.name,
        qualified_name: t.qualifiedName,
        description: t.description,
      })),
      message: `Connected remote MCP server "${server.name}" and exposed ${state.tools.length} tool(s).`,
    };
  },
};

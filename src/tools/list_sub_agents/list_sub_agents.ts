import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { listAllSubAgents } from '../../sub-agents/index.js';

export const listSubAgentsSchema = z.object({}).strict();

export const listSubAgentsTool: MythgramTool<typeof listSubAgentsSchema> = {
  name: 'list_sub_agents',
  description:
    'Return the names and descriptions of available sub-agents that can be called with call_sub_agent.',
  schema: listSubAgentsSchema,
  execute: async () => {
    const agents = await listAllSubAgents();
    return {
      success: true,
      count: agents.length,
      sub_agents: agents.map((a) => ({
        name: a.name,
        description: a.description,
        is_default: a.is_default,
        file_path: a.file_path || null,
      })),
    };
  },
};

import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { createOrUpdateCustomSubAgent } from '../../sub-agents/index.js';

export const createSubAgentSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(70)
      .regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/)
      .describe(
        'Unique lowercase call name, using letters, digits, and single hyphens or underscores; maximum 70 characters.'
      ),
    description: z
      .string()
      .min(1)
      .max(300)
      .describe(
        "Concise description of the sub-agent's responsibility and intended use."
      ),
    system_prompt: z
      .string()
      .min(1)
      .describe(
        "System instructions defining the sub-agent's role, objectives, workflow, output requirements, and constraints."
      ),
  })
  .strict();

export const createSubAgentTool: MythgramTool<typeof createSubAgentSchema> = {
  name: 'create_sub_agent',
  description:
    'Create and register a specialized sub-agent for a specific task or responsibility. Its name must be unique, lowercase, and contain only lowercase letters, digits, hyphens, or underscores; it becomes callable by call_sub_agent.',
  schema: createSubAgentSchema,
  execute: async (args) => {
    const created = await createOrUpdateCustomSubAgent({
      name: args.name,
      description: args.description,
      systemPrompt: args.system_prompt,
    });
    return {
      success: true,
      agent: {
        id: created.id,
        name: created.name,
        description: created.description,
        file_path: created.file_path,
      },
      message: `Sub-agent "${created.name}" created and registered in .mythgram/sub-agents.`,
    };
  },
};

import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { runSingleSubAgent } from '../../agents/sub-agent.js';

export const callSubAgentSchema = z
  .object({
    agents: z
      .array(
        z
          .object({
            agent: z.string().describe('Name of the sub-agent to execute.'),
            task: z
              .string()
              .describe(
                'Clear and detailed task instructions for this specific sub-agent.'
              ),
          })
          .strict()
      )
      .min(1)
      .describe(
        'List of sub-agents to execute. Use list_sub_agents to discover available agents.'
      ),
    wait_for_output: z
      .boolean()
      .describe(
        'Whether to wait for all sub-agents to return their final results. False runs them in the background.'
      ),
    send_my_context: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether to share current conversation with all sub-agents. Defaults to false.'
      ),
  })
  .strict();

export const callSubAgentTool: MythgramTool<typeof callSubAgentSchema> = {
  name: 'call_sub_agent',
  description:
    'Call one or more specialized sub-agents to perform tasks. Each agent receives its own task instructions. Agents can execute independently or in parallel. Set wait_for_output to choose whether to wait for their final results; optionally share current conversation with all agents.',
  schema: callSubAgentSchema,
  execute: async (args, context) => {
    const parentToolCallId = context.toolCallId || `call_sub_${Date.now()}`;

    // Execute all requested sub-agents concurrently without blocking the event loop
    const results = await Promise.all(
      args.agents.map((item, idx) => {
        const runId = `subrun_${Date.now()}_${idx}_${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        return runSingleSubAgent({
          runId,
          parentSessionId: context.sessionId,
          parentToolCallId,
          agentName: item.agent,
          task: item.task,
          sendMyContext: Boolean(args.send_my_context),
          waitForOutput: args.wait_for_output,
          parentSignal: context.signal,
        });
      })
    );

    if (!args.wait_for_output) {
      return {
        success: true,
        wait_for_output: false,
        message:
          'Sub-agent(s) launched in the background. When each sub-agent finishes its task, its final output will be written to its output_file_path in .mythgram/sub-agents/outputs/. You can use wait and file_read on output_file_path to inspect their completed results.',
        runs: results.map((r) => ({
          run_id: r.runId,
          agent: r.agent,
          status: r.status,
          output_file_path: r.output_file_path,
        })),
      };
    }

    // When wait_for_output is true, return ONLY the final output of each sub-agent (no reasoning, no tool calls)
    return {
      success: true,
      wait_for_output: true,
      results: results.map((r) => ({
        run_id: r.runId,
        agent: r.agent,
        status: r.status,
        final_output: r.output || '',
      })),
    };
  },
};

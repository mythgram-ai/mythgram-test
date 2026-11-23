import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { db } from '../../db/index.js';

export const todoWriteSchema = z
  .object({
    todos: z
      .array(
        z
          .object({
            id: z.string().describe('Unique string identifier for the todo.'),
            content: z
              .string()
              .describe(
                'Clear description of the task. Keep it concise and actionable.'
              ),
            status: z
              .enum(['pending', 'in_progress', 'completed'])
              .describe('Current state of the todo.'),
            priority: z
              .enum(['low', 'medium', 'high'])
              .describe('Importance of the todo.'),
          })
          .strict()
      )
      .min(0)
      .max(200)
      .describe(
        'The complete, updated todo list. Items not included are removed.'
      ),
  })
  .strict();

export const todoWriteTool: MythgramTool<typeof todoWriteSchema> = {
  name: 'todo_write',
  description:
    'Create and manage a structured task list. The todos array is the complete updated list: include every todo to keep, update, or add; any omitted todo is removed.',
  schema: todoWriteSchema,
  execute: async (args, context) => {
    const updated = db.setSessionTodos(context.sessionId, args.todos);
    context.onUiAction?.({
      action: 'todos_updated',
      data: { todos: updated },
    });
    return {
      success: true,
      count: updated.length,
      todos: updated,
    };
  },
};

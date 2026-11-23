import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { db } from '../../db/index.js';

export const readTodosSchema = z.object({}).strict();

export const readTodosTool: MythgramTool<typeof readTodosSchema> = {
  name: 'read_todos',
  description:
    "Read the current todo list, including each todo's ID, content, status, and priority.",
  schema: readTodosSchema,
  execute: async (_args, context) => {
    const todos = db.getSessionTodos(context.sessionId);
    return {
      success: true,
      count: todos.length,
      todos,
    };
  },
};

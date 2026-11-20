import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import path from 'node:path';

export interface ToolContext {
  sessionId: string;
  workspace: string;
  visionSupport: boolean;
  onVisionAttachment?: (attachment: {
    type: 'image';
    mimeType: string;
    dataUrl: string;
    filePath: string;
  }) => void;
}

export interface MythgramTool<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: TSchema;
  execute: (args: z.infer<TSchema>, context: ToolContext) => Promise<any>;
}

/**
 * Converts a MythgramTool (Zod schema) into OpenAI native function-calling tool schema.
 */
export function toOpenAIToolDefinition(tool: MythgramTool): {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
} {
  const rawJsonSchema: any = zodToJsonSchema(tool.schema, {
    target: 'openAi',
    $refStrategy: 'none',
  });
  const { $schema, ...parameters } = rawJsonSchema;
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters,
    },
  };
}

/**
 * Validates that a path is an absolute path (supports POSIX `/` and Windows `C:\`).
 */
export function assertAbsolutePath(inputPath: string, paramName: string = 'file_path'): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error(`${paramName} is required and must be a non-empty string.`);
  }
  if (!path.isAbsolute(inputPath)) {
    throw new Error(`${paramName} must be an absolute path (received "${inputPath}").`);
  }
  return path.normalize(inputPath);
}

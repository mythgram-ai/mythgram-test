import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { generateSpeechWithLocalTts } from '../../tts/index.js';

export const generateSpeechSchema = z
  .object({
    speech: z.string().describe('The text to convert into speech.'),
    output_directory: z
      .string()
      .describe(
        'The absolute directory where the generated audio file will be saved (e.g. /home/user/project/audio). Relative paths are rejected.'
      ),
  })
  .strict();

export const generateSpeechTool: MythgramTool<typeof generateSpeechSchema> = {
  name: 'generate_speech',
  description:
    'Generate spoken audio from text and save the generated audio file to the specified absolute output directory (any accessible location on the local filesystem).',
  schema: generateSpeechSchema,
  execute: async (args, context) => {
    const result = await generateSpeechWithLocalTts({
      speech: args.speech,
      output_directory: args.output_directory,
      signal: context.signal,
    });
    // Return only file path and metadata (never send generated audio bytes to LLM input or API call)
    return {
      success: true,
      file_path: result.file_path,
      file_name: result.file_name,
      output_directory: result.output_directory,
      bytes: result.bytes,
      format: result.format,
      content_type: result.content_type,
      provider: result.provider,
      endpoint: result.endpoint,
      speech_length: result.speech_length,
      created_at: result.created_at,
      message: `Generated speech audio saved to ${result.file_path}`,
    };
  },
};

import { MythgramTool, ToolContext, toOpenAIToolDefinition } from './types.js';
import { fileWriteTool } from './file_write/file_write.js';
import { fileReadTool } from './file_read/file_read.js';
import { fileListTool } from './file_list/file_list.js';
import { readDirectoryTool } from './read_directory/read_directory.js';
import { grepTool } from './grep/grep.js';
import { astgrepTool } from './astgrep/astgrep.js';
import { globTool } from './glob/glob.js';
import { strReplaceTool } from './str_replace/str_replace.js';
import { applyPatchTool } from './apply_patch/apply_patch.js';
import { readImageTool } from './read_image/read_image.js';
import { scanQrCodeTool } from './scan_qr_code/scan_qr_code.js';
import { fetchTextFromImageTool } from './fetch_text_from_image/fetch_text_from_image.js';
import { archiveFilesTool } from './archive_files/archive_files.js';
import { extractArchiveTool } from './extract_archive/extract_archive.js';
import { shallTool } from './shall_tool/shall_tool.js';

export * from './types.js';

export const ALL_TOOLS: MythgramTool<any>[] = [
  fileWriteTool,
  fileReadTool,
  fileListTool,
  readDirectoryTool,
  grepTool,
  astgrepTool,
  globTool,
  strReplaceTool,
  applyPatchTool,
  readImageTool,
  scanQrCodeTool,
  fetchTextFromImageTool,
  archiveFilesTool,
  extractArchiveTool,
  shallTool,
];

export const TOOLS_MAP = new Map<string, MythgramTool<any>>(
  ALL_TOOLS.map((t) => [t.name, t])
);

export function getOpenAIToolsList(visionSupport: boolean = true) {
  return ALL_TOOLS.filter((t) => (t.name === 'read_image' ? visionSupport : true)).map((t) =>
    toOpenAIToolDefinition(t)
  );
}

export async function executeNativeTool(
  toolName: string,
  rawArgs: any,
  context: ToolContext
): Promise<any> {
  const tool = TOOLS_MAP.get(toolName);
  if (!tool) {
    throw new Error(`Unknown native tool: ${toolName}`);
  }
  const parsedArgs = tool.schema.parse(rawArgs);
  return await tool.execute(parsedArgs, context);
}

import { MythgramTool, ToolContext, toOpenAIToolDefinition } from './types.js';
import { fileWriteTool } from './file_write/file_write.js';
import { fileReadTool } from './file_read/file_read.js';
import { fileListTool } from './file_list/file_list.js';
import { readDirectoryTool } from './read_directory/read_directory.js';
import { grepTool } from './grep/grep.js';
import { astgrepTool } from './astgrep/astgrep.js';
import { globTool } from './glob/glob.js';
import { lspTool } from './lsp/lsp.js';
import { strReplaceTool } from './str_replace/str_replace.js';
import { applyPatchTool } from './apply_patch/apply_patch.js';
import { readImageTool } from './read_image/read_image.js';
import { scanQrCodeTool } from './scan_qr_code/scan_qr_code.js';
import { fetchTextFromImageTool } from './fetch_text_from_image/fetch_text_from_image.js';
import { archiveFilesTool } from './archive_files/archive_files.js';
import { extractArchiveTool } from './extract_archive/extract_archive.js';
import { shallTool } from './shall_tool/shall_tool.js';
import { waitTool } from './wait/wait.js';
import { saveArtifactsTool } from './save_artifacts/save_artifacts.js';
import { listArtifactsTool } from './list_artifacts/list_artifacts.js';
import { showArtifactToUserTool } from './show_artifact_to_user/show_artifact_to_user.js';
import { attachFilesTool } from './attach_files/attach_files.js';
import { askForSomethingTool } from './ask_for_something/ask_for_something.js';
import { askQuestionToUserTool } from './ask_question_to_user/ask_question_to_user.js';
import { embedUrlTool } from './embed_url/embed_url.js';
import { readTodosTool } from './read_todos/read_todos.js';
import { todoWriteTool } from './todo_write/todo_write.js';
import { submitPlanTool } from './submit_plan/submit_plan.js';
import { createSubAgentTool } from './create_sub_agent/create_sub_agent.js';
import { callSubAgentTool } from './call_sub_agent/call_sub_agent.js';
import { listSubAgentsTool } from './list_sub_agents/list_sub_agents.js';
import { createSkillTool } from './create_skill/create_skill.js';
import { listSkillsTool } from './list_skills/list_skills.js';
import { manageSlidesTool } from './manage_slides/manage_slides.js';
import { presentSlidesTool } from './present_slides/present_slides.js';
import { organizeSlidesTool } from './organize_slides/organize_slides.js';
import { RESTRICTED_SUB_AGENT_TOOLS } from '../sub-agents/index.js';

export * from './types.js';

export const ALL_TOOLS: MythgramTool<any>[] = [
  fileWriteTool,
  fileReadTool,
  fileListTool,
  readDirectoryTool,
  grepTool,
  astgrepTool,
  globTool,
  lspTool,
  strReplaceTool,
  applyPatchTool,
  readImageTool,
  scanQrCodeTool,
  fetchTextFromImageTool,
  archiveFilesTool,
  extractArchiveTool,
  shallTool,
  waitTool,
  saveArtifactsTool,
  listArtifactsTool,
  showArtifactToUserTool,
  attachFilesTool,
  askForSomethingTool,
  askQuestionToUserTool,
  embedUrlTool,
  readTodosTool,
  todoWriteTool,
  submitPlanTool,
  createSubAgentTool,
  callSubAgentTool,
  listSubAgentsTool,
  createSkillTool,
  listSkillsTool,
  manageSlidesTool,
  presentSlidesTool,
  organizeSlidesTool,
];

export const TOOLS_MAP = new Map<string, MythgramTool<any>>(
  ALL_TOOLS.map((t) => [t.name, t])
);

export const SUB_AGENT_ALLOWED_TOOLS: MythgramTool<any>[] = ALL_TOOLS.filter(
  (t) => !RESTRICTED_SUB_AGENT_TOOLS.has(t.name)
);

/**
 * read_image is intentionally always exposed to the model. When the active model has no
 * vision support the tool itself returns a clear error message that tells the LLM to keep
 * going with OCR/QR tools instead of aborting the task (see read_image.execute).
 */
export function getOpenAIToolsList(_visionSupport: boolean = true) {
  return ALL_TOOLS.map((t) => toOpenAIToolDefinition(t));
}

/**
 * Returns OpenAI tool definitions filtered for a sub-agent.
 * Strictly excludes all 12 restricted sub-agent tools.
 */
export function getSubAgentOpenAIToolsList(
  allowedToolNames?: string[],
  _visionSupport: boolean = true
) {
  const allowedSet =
    allowedToolNames && allowedToolNames.length > 0
      ? new Set(allowedToolNames.filter((n) => !RESTRICTED_SUB_AGENT_TOOLS.has(n)))
      : null;

  return SUB_AGENT_ALLOWED_TOOLS.filter((t) =>
    allowedSet ? allowedSet.has(t.name) : true
  ).map((t) => toOpenAIToolDefinition(t));
}

export async function executeNativeTool(
  toolName: string,
  rawArgs: any,
  context: ToolContext
): Promise<any> {
  if (context.isSubAgent && RESTRICTED_SUB_AGENT_TOOLS.has(toolName)) {
    throw new Error(
      `Tool "${toolName}" is restricted and cannot be executed by a sub-agent.`
    );
  }
  const tool = TOOLS_MAP.get(toolName);
  if (!tool) {
    throw new Error(`Unknown native tool: ${toolName}`);
  }
  const parsedArgs = tool.schema.parse(rawArgs);
  return await tool.execute(parsedArgs, context);
}

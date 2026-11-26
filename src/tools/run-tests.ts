import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { testFileWrite } from './file_write/file_write.test.js';
import { testFileRead } from './file_read/file_read.test.js';
import { testFileList } from './file_list/file_list.test.js';
import { testReadDirectory } from './read_directory/read_directory.test.js';
import { testGrep } from './grep/grep.test.js';
import { testAstgrep } from './astgrep/astgrep.test.js';
import { testGlob } from './glob/glob.test.js';
import { testLsp } from './lsp/lsp.test.js';
import { testStrReplace } from './str_replace/str_replace.test.js';
import { testApplyPatch } from './apply_patch/apply_patch.test.js';
import { testReadImage } from './read_image/read_image.test.js';
import { testScanQrCode } from './scan_qr_code/scan_qr_code.test.js';
import { testFetchTextFromImage } from './fetch_text_from_image/fetch_text_from_image.test.js';
import { testArchiveFiles } from './archive_files/archive_files.test.js';
import { testExtractArchive } from './extract_archive/extract_archive.test.js';
import { testShallTool } from './shall_tool/shall_tool.test.js';
import { testMemorySearchTool } from './memory_search/memory_search.test.js';
import { testKnowledgeSearchTool } from './knowledge_search/knowledge_search.test.js';
import { testFatchWebUrlsTool } from './fatch_web_urls/fatch_web_urls.test.js';
import { testGithubRepositorySearchTool } from './github_repository_search/github_repository_search.test.js';
import { testGenerateSpeechTool } from './generate_speech/generate_speech.test.js';
import { testMemorySystem } from '../memory/memory.test.js';
import { testKnowledgeSystem } from '../knowledge/knowledge.test.js';
import { testScraperSystem } from '../scraper/scraper.test.js';
import { testWebSearchSystem } from '../web-search/web-search.test.js';
import { testTtsSystem } from '../tts/tts.test.js';
import {
  ALL_TOOLS,
  SUB_AGENT_ALLOWED_TOOLS,
  executeNativeTool,
  getOpenAIToolsList,
  getSubAgentOpenAIToolsList,
} from './index.js';
import { RESTRICTED_SUB_AGENT_TOOLS } from '../sub-agents/index.js';
import { getDataDir } from '../datadir/index.js';
import { resolveUserInteraction } from './interactive-store.js';

async function testNewToolsSuite() {
  console.log('Running tests for 19 new native tools & systems...');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mythgram_new_tools_'));
  const sessionId = 'test_session_30_digits_1234567';
  const ctx = {
    sessionId,
    workspace: tmpDir,
    visionSupport: true,
  };

  // Verify total count of tools (40 previous + 6 search/memory tools + 1 generate_speech = 47)
  assert.equal(ALL_TOOLS.length, 47, 'Expected 47 total native tools');
  const openAiDefs = getOpenAIToolsList(true);
  assert.equal(openAiDefs.length, 47);

  // Verify sub-agent restricted tools are excluded
  const subAgentDefs = getSubAgentOpenAIToolsList();
  for (const def of subAgentDefs) {
    assert.equal(
      RESTRICTED_SUB_AGENT_TOOLS.has(def.function.name),
      false,
      `Restricted tool ${def.function.name} must not appear in sub-agent tools`
    );
  }
  assert.equal(SUB_AGENT_ALLOWED_TOOLS.length, ALL_TOOLS.length - RESTRICTED_SUB_AGENT_TOOLS.size);

  // 1. wait
  const waitRes = await executeNativeTool('wait', { seconds: 1 }, ctx);
  assert.equal(waitRes.success, true);
  assert.equal(waitRes.waited_seconds, 1);

  // 2. save_artifacts, list_artifacts, show_artifact_to_user + deletion resilience
  const sampleMd = path.join(tmpDir, 'report.md');
  await fs.writeFile(sampleMd, '# Test Artifact\nHello world', 'utf-8');
  const saveArtRes = await executeNativeTool(
    'save_artifacts',
    {
      artifact_file_path: sampleMd,
      title: 'Test Report',
      description: 'A markdown test report',
      type: 'markdown',
    },
    ctx
  );
  assert.equal(saveArtRes.success, true);
  assert.ok(saveArtRes.artifact_id);

  const listArtRes = await executeNativeTool('list_artifacts', {}, ctx);
  assert.equal(listArtRes.success, true);
  assert.ok(listArtRes.artifacts.some((a: any) => a.id === saveArtRes.artifact_id));

  const showArtRes = await executeNativeTool(
    'show_artifact_to_user',
    { artifact_id: saveArtRes.artifact_id },
    ctx
  );
  assert.equal(showArtRes.success, true);
  assert.ok(showArtRes.content.includes('# Test Artifact'));

  // Test resilience when artifacts.json is deleted
  const paths = getDataDir();
  await fs.unlink(paths.artifactsJsonPath).catch(() => {});
  const listAfterDelete = await executeNativeTool('list_artifacts', {}, ctx);
  assert.equal(listAfterDelete.success, true);
  assert.ok(Array.isArray(listAfterDelete.artifacts));

  // 3. attach_files
  const attachRes = await executeNativeTool(
    'attach_files',
    { file_paths: [sampleMd, '/nonexistent/path/file.txt'] },
    ctx
  );
  assert.equal(attachRes.success, true);
  assert.equal(attachRes.attached_count, 1);
  assert.equal(attachRes.skipped_files.length, 1);

  // 4. embed_url
  let embeddedTriggered = '';
  const embedRes = await executeNativeTool(
    'embed_url',
    { url: 'http://localhost:3000' },
    {
      ...ctx,
      onUiAction: (act) => {
        if (act.action === 'open_browser') embeddedTriggered = act.data.url;
      },
    }
  );
  assert.equal(embedRes.success, true);
  assert.equal(embeddedTriggered, 'http://localhost:3000');

  // 5. todo_write & read_todos
  const writeTodoRes = await executeNativeTool(
    'todo_write',
    {
      todos: [
        {
          id: 't1',
          content: 'Implement feature A',
          status: 'in_progress',
          priority: 'high',
        },
      ],
    },
    ctx
  );
  assert.equal(writeTodoRes.success, true);
  assert.equal(writeTodoRes.count, 1);

  const readTodoRes = await executeNativeTool('read_todos', {}, ctx);
  assert.equal(readTodoRes.success, true);
  assert.equal(readTodoRes.todos[0].id, 't1');

  // 6. ask_for_something, ask_question_to_user, submit_plan
  const askForCallId = 'call_ask_for_test';
  const askForPromise = executeNativeTool(
    'ask_for_something',
    {
      items: [{ request: 'API Key', placeholder: 'sk-...' }],
    },
    { ...ctx, toolCallId: askForCallId }
  );
  setTimeout(() => {
    resolveUserInteraction(askForCallId, [{ request: 'API Key', value: 'sk-123' }]);
  }, 50);
  const askForRes = await askForPromise;
  assert.equal(askForRes.success, true);

  const askQCallId = 'call_ask_q_test';
  const askQPromise = executeNativeTool(
    'ask_question_to_user',
    {
      questions: [
        {
          question: 'Which framework?',
          context: 'Select web framework',
          options: ['Hono', 'Express'],
        },
      ],
    },
    { ...ctx, toolCallId: askQCallId }
  );
  setTimeout(() => {
    resolveUserInteraction(askQCallId, [
      { question: 'Which framework?', answer: 'Custom: Fastify' },
    ]);
  }, 50);
  const askQRes = await askQPromise;
  assert.equal(askQRes.success, true);

  const planCallId = 'call_plan_test';
  const planPromise = executeNativeTool(
    'submit_plan',
    { plan: '# Milestone 1\nBuild core engine' },
    { ...ctx, toolCallId: planCallId }
  );
  setTimeout(() => {
    resolveUserInteraction(planCallId, { decision: 'approved' });
  }, 50);
  const planRes = await planPromise;
  assert.equal(planRes.success, true);
  assert.equal(planRes.decision, 'approved');

  // 7. list_sub_agents & create_sub_agent
  const listSubRes = await executeNativeTool('list_sub_agents', {}, ctx);
  assert.equal(listSubRes.success, true);
  assert.ok(listSubRes.sub_agents.length >= 10, 'Expected at least 10 default sub-agents');

  const createSubRes = await executeNativeTool(
    'create_sub_agent',
    {
      name: 'custom-qa-bot',
      description: 'Runs QA checks on outputs',
      system_prompt: 'You are custom-qa-bot.',
    },
    ctx
  );
  assert.equal(createSubRes.success, true);
  assert.equal(createSubRes.agent.name, 'custom-qa-bot');

  // 8. list_skills & create_skill
  const listSkillsRes = await executeNativeTool('list_skills', {}, ctx);
  assert.equal(listSkillsRes.success, true);
  assert.ok(listSkillsRes.skills.length >= 2, 'Expected 2 default skills');

  const customSkillSrc = path.join(tmpDir, 'my-custom-skill');
  await fs.mkdir(path.join(customSkillSrc, 'references'), { recursive: true });
  await fs.writeFile(
    path.join(customSkillSrc, 'SKILL.md'),
    '# My Custom Skill\nSkill instructions',
    'utf-8'
  );
  await fs.writeFile(
    path.join(customSkillSrc, 'references', 'guide.md'),
    'Guide content',
    'utf-8'
  );

  const createSkillRes = await executeNativeTool(
    'create_skill',
    {
      name: 'my-custom-skill',
      description: 'A custom test skill',
      source_path: customSkillSrc,
    },
    ctx
  );
  assert.equal(createSkillRes.success, true);
  assert.ok(createSkillRes.skill.skill_md_path.includes('.mythgram/skills/my-custom-skill/SKILL.md'));

  // 9. organize_slides, manage_slides, present_slides
  const slide1Path = path.join(tmpDir, 'slide1.html');
  const slide2Path = path.join(tmpDir, 'slide2.html');
  await fs.writeFile(slide1Path, '<div>Slide 1</div>', 'utf-8');
  await fs.writeFile(slide2Path, '<div>Slide 2</div>', 'utf-8');

  const orgRes = await executeNativeTool(
    'organize_slides',
    {
      project_name: 'Launch Deck',
      slides: [
        { html_file_path: slide1Path, slide_number: 1 },
        { html_file_path: slide2Path, slide_number: 2 },
      ],
    },
    ctx
  );
  assert.equal(orgRes.success, true);
  assert.equal(orgRes.slides_count, 2);

  const manageRenameRes = await executeNativeTool(
    'manage_slides',
    {
      project_id: orgRes.project_id,
      action: 'rename_slide_project',
      new_project_name: 'Updated Launch Deck',
    },
    ctx
  );
  assert.equal(manageRenameRes.success, true);
  assert.equal(manageRenameRes.project_name, 'Updated Launch Deck');

  const presentRes = await executeNativeTool(
    'present_slides',
    { project_ids: [orgRes.project_id] },
    ctx
  );
  assert.equal(presentRes.success, true);
  assert.equal(presentRes.presented_count, 1);

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log('All 19 new native tools & systems passed tests!');
}

async function runAll() {
  console.log('Running Mythgram Native Tool Tests...');
  await testFileWrite();
  await testFileRead();
  await testFileList();
  await testReadDirectory();
  await testGrep();
  await testAstgrep();
  await testGlob();
  await testLsp();
  await testStrReplace();
  await testApplyPatch();
  await testReadImage();
  await testScanQrCode();
  await testFetchTextFromImage();
  await testArchiveFiles();
  await testExtractArchive();
  await testShallTool();
  await testNewToolsSuite();
  await testMemorySystem();
  await testKnowledgeSystem();
  await testScraperSystem();
  await testWebSearchSystem();
  await testMemorySearchTool();
  await testKnowledgeSearchTool();
  await testFatchWebUrlsTool();
  await testGithubRepositorySearchTool();
  await testTtsSystem();
  await testGenerateSpeechTool();
  console.log('All 47 Mythgram Native Tools Passed Tests!');
}

runAll().catch((err) => {
  console.error('Tool test failed:', err);
  process.exit(1);
});

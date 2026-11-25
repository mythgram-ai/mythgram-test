import assert from 'node:assert/strict';
import { ALL_TOOLS, TOOLS_MAP, toOpenAIToolDefinition, MythgramTool } from '../index.js';
import { githubRepositorySearchTool, githubRepositorySearchSchema } from './github_repository_search.js';

export async function testGithubRepositorySearchTool() {
  assert.equal(TOOLS_MAP.get('github_repository_search'), githubRepositorySearchTool);
  assert.equal(
    ALL_TOOLS.some((tool) => tool.name === 'github_repository_search'),
    true
  );

  const definition = toOpenAIToolDefinition(githubRepositorySearchTool as MythgramTool<any>);
  assert.equal(definition.type, 'function');
  assert.equal(definition.function.name, 'github_repository_search');
  assert.deepEqual(definition.function.parameters.required, ['query']);

  assert.throws(() => githubRepositorySearchSchema.parse({ query: '' }));
  assert.throws(() => githubRepositorySearchSchema.parse({}));
}

import { z } from 'zod';
import { MythgramTool } from '../types.js';

export const githubRepositorySearchSchema = z
  .object({
    query: z.string().min(1).describe('The query to search.'),
  })
  .strict();

const MAX_RESULTS = 30;

export const githubRepositorySearchTool: MythgramTool<typeof githubRepositorySearchSchema> = {
  name: 'github_repository_search',
  description:
    'Search GitHub for repositories matching a query. Returns relevant repositories based on keywords, project names, programming languages, or topics.',
  schema: githubRepositorySearchSchema,
  execute: async (args) => {
    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', args.query);
    url.searchParams.set('sort', 'stars');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', String(MAX_RESULTS));

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Mythgram-Agent',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const request = async (withAuth: boolean) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      try {
        const res = await fetch(url.toString(), {
          headers: withAuth ? headers : { ...headers, Authorization: '' },
          signal: controller.signal,
        });
        const data: any = await res.json().catch(() => null);
        return { res, data };
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          throw new Error('GitHub repository search timed out after 60 seconds.');
        }
        throw new Error(`GitHub repository search failed: ${err?.message || err}`);
      } finally {
        clearTimeout(timer);
      }
    };

    let { res, data } = await request(Boolean(token));
    // An expired or revoked token should not block a public search.
    if (res.status === 401 && token) {
      ({ res, data } = await request(false));
    }
    if (!res.ok) {
      const message = data?.message || `HTTP ${res.status}`;
      throw new Error(`GitHub repository search failed: ${message}`);
    }

    const items = Array.isArray(data?.items) ? data.items.slice(0, MAX_RESULTS) : [];
    return {
      success: true,
      query: args.query,
      total_count: data?.total_count ?? items.length,
      returned: items.length,
      max_results: MAX_RESULTS,
      authenticated: Boolean(token),
      repositories: items.map((item: any) => ({
        name: item.full_name,
        url: item.html_url,
        description: item.description,
        stars: item.stargazers_count,
        forks: item.forks_count,
        open_issues: item.open_issues_count,
        language: item.language,
        topics: Array.isArray(item.topics) ? item.topics : [],
        license: item.license?.spdx_id || item.license?.name || null,
        archived: Boolean(item.archived),
        updated_at: item.updated_at,
        created_at: item.created_at,
        clone_url: item.clone_url,
      })),
    };
  },
};

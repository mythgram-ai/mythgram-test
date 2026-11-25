i got this tools schemas from  another ai agent, something will be wrong, and something maybe not match from my spec, so make sure you created according to my spec, so make sure.

## `memory_search`

**What it does:** Searches the agent's persistent memory with a natural-language query. Returns matching file paths and matching lines; use the file read tool to inspect surrounding context.

```json
{
  "type": "function",
  "function": {
    "name": "memory_search",
    "description": "Search persistent memory using a natural-language query. Returns matching file paths and matching line numbers/content; use file read on those paths to load surrounding context.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "The search query."
        }
      },
      "required": ["query"],
      "additionalProperties": false
    }
  }
}
```

## `knowledge_search`

**What it does:** Searches the persistent knowledge base with a natural-language query. Returns matching file paths and matching lines; use the file read tool to inspect surrounding context.

```json
{
  "type": "function",
  "function": {
    "name": "knowledge_search",
    "description": "Search the persistent knowledge base using a natural-language query. Returns matching file paths and matching line numbers/content; use file on those paths to load surrounding context.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "The search query."
        }
      },
      "required": ["query"],
      "additionalProperties": false
    }
  }
}
```

## `github_repository_search`

**What it does:** Searches GitHub repositories by keywords, project name, language, or topic. Returns up to 30 repository summaries with links and metadata such as stars, forks, license, and recent update timestamps.

```json
{
  "type": "function",
  "function": {
    "name": "github_repository_search",
    "description": "Search GitHub for repositories matching a query. Returns relevant repositories based on keywords, project names, programming languages, or topics.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "minLength": 1,
          "description": "The query to search."
        }
      },
      "required": ["query"],
      "additionalProperties": false
    }
  }
}
```

## `fatch_web_urls`

**What it does:** Fetches and extracts content from one URL, or crawls linked pages on the same site when `crawl` is true. Returns cleaned page content and metadata, with optional extracted links and image URLs. The tool name is spelled `fatch_web_urls` in the repository; retain this spelling when calling it.

```json
{
  "type": "function",
  "function": {
    "name": "fatch_web_urls",
    "description": "Fetch and extract clean content from a URL — a single page or a full site crawl. Returns Markdown, text, JSON, or auto-detected content plus page metadata, links, and images. Set crawl=true to fetch linked pages on the same site, bounded by maxPages and maxDepth.",
    "parameters": {
      "type": "object",
      "properties": {
        "url": {
          "type": "string",
          "description": "The URL to fetch or scrape."
        },
        "format": {
          "type": "string",
          "enum": ["markdown", "text", "json", "autodetect"],
          "default": "markdown",
          "description": "Output format for the extracted content."
        },
        "crawl": {
          "type": "boolean",
          "default": false,
          "description": "When true, crawl linked pages on the same site."
        },
        "maxPages": {
          "type": "integer",
          "minimum": 1,
          "maximum": 10,
          "default": 6,
          "description": "Maximum pages to fetch when crawling; ignored unless crawl is true."
        },
        "maxDepth": {
          "type": "integer",
          "minimum": 1,
          "maximum": 3,
          "default": 2,
          "description": "Maximum link depth when crawling; ignored unless crawl is true."
        },
        "extractImages": {
          "type": "boolean",
          "default": true,
          "description": "Include extracted image URLs in the result for HTML pages."
        },
        "extractLinks": {
          "type": "boolean",
          "default": true,
          "description": "Include extracted link URLs in the result for HTML pages."
        }
      },
      "required": ["url"]
    }
  }
}
```

## `web_search`

**What it does:** Performs a live web search for current information, news, or general knowledge. Returns up to 15 results with titles, URLs, and descriptions. Uses DuckDuckGo by default, with configured Tavily, Exa, or SerpAPI providers also supported.

```json
{
  "type": "function",
  "function": {
    "name": "web_search",
    "description": "Search the web for up-to-date information, news, and general knowledge. Returns up to 15 results with titles, URLs, and descriptions.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "The search query."
        }
      },
      "required": ["query"]
    }
  }
}
```

## `image_search`

**What it does:** Searches for images matching a query and returns live direct image URLs, along with source page URLs when available. Use this for visual references or when the agent needs to discover images.

```json
{
  "type": "function",
  "function": {
    "name": "image_search",
    "description": "Search the web for images using a search query. Returns image results with direct live image URLs and source URLs.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "minLength": 1,
          "description": "The search query used to find relevant images."
        }
      },
      "required": ["query"],
      "additionalProperties": false
    }
  }
}
```

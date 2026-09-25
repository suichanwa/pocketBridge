export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

/**
 * Performs a lightweight web search using DuckDuckGo public html API.
 */
export async function searchWeb(query: string, maxResults = 5): Promise<SearchResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Search request failed with status: ${response.status}`);
    }

    const html = await response.text();
    const results: SearchResult[] = [];

    // Parse html snippet results using simple regex matching
    const resultBlocks = html.split('<div class="result results_links results_links_deep');
    for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
      const block = resultBlocks[i];

      // Extract title and url
      const titleMatch = block.match(/<a class="result__snippet[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/) ||
                         block.match(/<a class="result__url[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/) ||
                         block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);

      const snippetMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/);

      if (titleMatch) {
        let link = titleMatch[1];
        // Clean duckduckgo redirect if present
        if (link.includes('uddg=')) {
          const matchedUddg = link.match(/uddg=([^&]+)/);
          if (matchedUddg) {
            link = decodeURIComponent(matchedUddg[1]);
          }
        }

        const title = (titleMatch[2] || '').replace(/<[^>]+>/g, '').trim();
        const snippet = snippetMatch
          ? snippetMatch[1].replace(/<[^>]+>/g, '').trim()
          : '';

        if (title && link.startsWith('http')) {
          results.push({ title, link, snippet });
        }
      }
    }

    if (results.length === 0) {
      // Fallback: try DuckDuckGo Lite API
      const liteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      const liteRes = await fetch(liteUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (liteRes.ok) {
        const liteHtml = await liteRes.text();
        const links = [...liteHtml.matchAll(/<a rel="nofollow" class='result-link' href="([^"]+)">([\s\S]*?)<\/a>/g)];
        const snippets = [...liteHtml.matchAll(/<td class='result-snippet'>([\s\S]*?)<\/td>/g)];

        for (let i = 0; i < Math.min(links.length, maxResults); i++) {
          results.push({
            title: links[i][2].replace(/<[^>]+>/g, '').trim(),
            link: links[i][1],
            snippet: snippets[i] ? snippets[i][1].replace(/<[^>]+>/g, '').trim() : '',
          });
        }
      }
    }

    return results;
  } catch (err: any) {
    console.error('Web search error:', err);
    return [
      {
        title: `Search Error for "${query}"`,
        link: '',
        snippet: `Failed to fetch search results: ${err?.message || 'Network error'}`,
      },
    ];
  }
}

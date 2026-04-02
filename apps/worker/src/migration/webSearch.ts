export type WebSearchHit = { title: string; url: string; description: string };

const BRAVE_URL = "https://api.search.brave.com/res/v1/web/search";

/**
 * Brave Web Search API (free tier / subscription).
 * Docs: https://api.search.brave.com/app/documentation/web-search/get-started
 */
export async function braveWebSearch(query: string, apiKey: string): Promise<WebSearchHit[]> {
  const u = new URL(BRAVE_URL);
  u.searchParams.set("q", query);
  u.searchParams.set("count", "8");

  const res = await fetch(u.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Brave search HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  const raw = data.web?.results ?? [];
  return raw
    .filter((r) => r.url)
    .map((r) => ({
      title: (r.title ?? "").trim() || "(untitled)",
      url: r.url as string,
      description: (r.description ?? "").trim()
    }));
}

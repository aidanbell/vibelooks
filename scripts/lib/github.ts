const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("GITHUB_TOKEN is not set. Put it in .env (see .env.example).");
  process.exit(1);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function gh(url: string, init: RequestInit = {}): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    });
    if (res.ok) return res.json();
    if (res.status === 403 || res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const wait = retryAfter ? retryAfter * 1000 : reset ? Math.max(reset * 1000 - Date.now(), 1000) : 60_000;
      console.warn(`  rate limited, waiting ${Math.ceil(wait / 1000)}s`);
      await sleep(wait + 500);
      continue;
    }
    if (res.status >= 500 && attempt < 2) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    throw new Error(`${res.status} ${url}\n${await res.text()}`);
  }
  throw new Error(`gave up on ${url}`);
}

// GraphQL reports its rate limit as a 200 with a RATE_LIMITED error, which
// would otherwise look like "file not found". Wait for the reset and retry.
export async function graphql(query: string): Promise<any> {
  for (;;) {
    const res = await gh("https://api.github.com/graphql", { method: "POST", body: JSON.stringify({ query }) });
    if (!res.errors?.some((e: any) => e.type === "RATE_LIMITED")) return res;
    const { resources } = await gh("https://api.github.com/rate_limit");
    const wait = Math.max(resources.graphql.reset * 1000 - Date.now(), 1000);
    console.warn(`  graphql rate limited, waiting ${Math.ceil(wait / 1000)}s`);
    await sleep(wait + 1000);
  }
}

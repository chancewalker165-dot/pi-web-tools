# pi-web-tools

Web search (SearXNG) + page fetch (fetch + Lightpanda SPA fallback) for pi coding agent.

| Tool | What it does |
|---|---|
| `web_search` | Searches the web via a local SearXNG instance. Returns titles, URLs, and snippets. |
| `fetch_content` | Fetches a URL and returns readable text. Plain `fetch()` for server-rendered pages; falls back to Lightpanda for JS-heavy SPAs. |

## Install

```bash
pi install git:github.com/chancewalker165-dot/pi-web-tools
```

## Setup

### 1. Lightpanda (auto-installed)

The extension auto-downloads Lightpanda on first use to `~/.local/bin/lightpanda`. No manual setup needed.

If auto-install fails, install manually:

```bash
curl -fsSL https://lightpanda.io/install.sh | bash
```

### 2. SearXNG (one command)

```bash
cd $(pi list 2>/dev/null | grep pi-web-tools | awk '{print $NF}')
docker compose up -d
```

This starts SearXNG on `http://localhost:8888` with a default config.

### 3. cloudscraper (optional, for retail sites)

```bash
pip install cloudscraper --break-system-packages
```

Handles Amazon, Walmart, and other bot-blocking retail sites. Falls back gracefully if not installed.

## How `fetch_content` works

Five-tier fallback chain — each tier only fires if the previous one returned empty or junk:

| Tier | Strategy | Speed | Handles |
|------|----------|-------|---------|
| 1 | `fetch()` Node.js + Chrome UA | <1s | 90% of pages |
| 2 | Lightpanda (10 retries) | 12s | JS SPAs (zread.ai, Next.js apps) |
| 3 | cloudscraper (Python) | 2-5s | Retail sites (Amazon, Walmart) |
| 4 | Jina Reader (`r.jina.ai`) | 5s | Medium JS sites, markdown output |
| 5 | `curl` | 2s | Sites blocking Node.js but not curl |

## License

MIT

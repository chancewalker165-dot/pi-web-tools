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
cd $(dirname $(pi list 2>/dev/null | grep pi-web-tools | awk '{print $NF}'))
docker compose up -d
```

This starts SearXNG on `http://localhost:8888` with a default config. To customize engines (Brave, Startpage, Mojeek, etc.), edit `./searxng/settings.yml` and restart with `docker compose restart`.

Without Docker, install SearXNG directly: https://docs.searxng.org/admin/installation.html

Override the URL with an env var:

```bash
export SEARXNG_URL=http://your-host:8080
```

## How `fetch_content` works

1. **Plain `fetch()` first** — fast, reliable, works for ~90% of pages
2. **SPA detection** — checks for empty body, `<div id="root">` shells, or tiny script-only pages
3. **Lightpanda fallback** — renders JavaScript, waits 12s for hydration, retries up to 10x with Cloudflare error detection

## License

MIT

# pi-web-tools

Web search + page content extraction for pi coding agent.

Provides two tools:

| Tool | What it does |
|---|---|
| `web_search` | Searches the web via a local SearXNG instance (aggregates Brave, Startpage, Mojeek). Returns titles, URLs, and snippets. |
| `fetch_content` | Fetches a URL and returns readable text. Plain `fetch()` for server-rendered pages; falls back to Lightpanda for JS-heavy SPAs. |

## Prerequisites

### 1. SearXNG (for `web_search`)

```bash
# Docker (recommended)
docker run -d --name searxng \
  -p 8888:8080 \
  -v ./searxng:/etc/searxng \
  searxng/searxng

# Or install directly: https://docs.searxng.org/admin/installation.html
```

Edit `searxng/settings.yml` to enable engines:

```yaml
search:
  formats:
    - html
    - json
engines:
  - name: brave
    api_key: "..."
  - name: startpage
  - name: mojeek
```

Configure the URL via env var (defaults to `http://localhost:8888`):

```bash
export SEARXNG_URL=http://localhost:8888
```

### 2. Lightpanda (for JS-heavy SPA fallback in `fetch_content`)

```bash
curl -fsSL https://lightpanda.io/install.sh | bash
# installs to ~/.local/bin/lightpanda
```

Or pick a binary from https://github.com/lightpanda-io/browser/releases

**No configuration needed** — the extension auto-detects `~/.local/bin/lightpanda`.

## Install

```bash
# From local path
pi install /path/to/pi-web-tools

# After publishing to npm
pi install npm:@thmoegg/pi-web-tools
```

## How `fetch_content` works

1. **Plain `fetch()` first** — fast, reliable, works for ~90% of pages
2. **SPA detection** — checks for empty body, `<div id="root">` shells, or tiny script-only pages
3. **Lightpanda fallback** — only triggered when step 1 fails. Renders JavaScript, waits 12s for hydration, retries up to 10x with Cloudflare error detection

Successful SPA renders are ~900KB (fully hydrated DOM). Failed renders (~6KB Next.js shell) and Cloudflare errors (`Gateway time-out`, `Navigation failed`) are automatically retried.

## License

MIT

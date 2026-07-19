/**
 * pi-web-tools — SearXNG web_search + fetch_content
 *
 * web_search: queries local SearXNG instance (format=json).
 * fetch_content: plain HTTP fetch of a URL, HTML stripped to text.
 *   Falls back to Lightpanda for JS-heavy SPAs.
 *
 * Prerequisites are auto-detected. See README for setup.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { access, mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";

const SEARXNG_URL = process.env.SEARXNG_URL ?? "http://localhost:8888";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_CONTENT_CHARS = 50_000;

interface SearxResult {
	url: string;
	title: string;
	content?: string;
	engine?: string;
	publishedDate?: string | null;
	score?: number;
}

function decodeEntities(s: string): string {
	return s
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

const LIGHTPANDA_DIR = join(homedir(), ".local", "bin");
const LIGHTPANDA_BIN = join(LIGHTPANDA_DIR, "lightpanda");

async function curlFetch(url: string, signal?: AbortSignal): Promise<string> {
	return new Promise((resolve, reject) => {
		const args = [
			"-sL", "--max-time", "15",
			"-H", "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
			"-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"-H", "Accept-Language: en-US,en;q=0.5",
			url,
		];
		const proc = execFile("curl", args, { timeout: 20_000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
			if (err) return reject(err);
			resolve(stdout || "");
		});
		if (signal) {
			signal.addEventListener("abort", () => proc.kill(), { once: true });
		}
	});
}

async function ensureLightpanda(): Promise<string> {
	try {
		await access(LIGHTPANDA_BIN);
		return LIGHTPANDA_BIN;
	} catch {
		// Auto-install
	}

	const platform = process.platform;
	const arch = process.arch === "x64" ? "amd64" : process.arch;
	const ext = platform === "win32" ? ".exe" : "";
	const tag = "nightly"; // latest stable: use a version tag
	const filename = `lightpanda-${platform}-${arch}${ext}`;
	const url = `https://github.com/lightpanda-io/browser/releases/download/${tag}/${filename}`;

	await mkdir(LIGHTPANDA_DIR, { recursive: true });
	const dest = LIGHTPANDA_BIN;

	try {
		const res = await fetch(url, { redirect: "follow" });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const buf = Buffer.from(await res.arrayBuffer());
		await require("node:fs/promises").writeFile(dest, buf);
		await chmod(dest, 0o755);
		return dest;
	} catch (e) {
		throw new Error(
			`Lightpanda not found and auto-install failed. Install manually:\n` +
			`  curl -fsSL https://lightpanda.io/install.sh | bash\n` +
			`  or download from https://github.com/lightpanda-io/browser/releases\n` +
			`  (${(e as Error).message})`,
		);
	}
}

async function runLightpanda(url: string): Promise<string> {
	const binary = await ensureLightpanda();
	const maxAttempts = 10;
	const minContentBytes = 50_000;

	async function attempt(n: number): Promise<string> {
		return new Promise((resolve, reject) => {
			const args = [
				"fetch", url,
				"--dump", "html",
				"--wait-ms", "12000",
				"--http-timeout", "20000",
				"--http-connect-timeout", "15000",
				"--log-level", "error",
			];
			const execTimeout = 30_000;
			execFile(binary, args, { timeout: execTimeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
				if (err) {
					if (n < maxAttempts) {
						return resolve(attempt(n + 1));
					}
					return reject(new Error(`Lightpanda failed after ${maxAttempts} attempts: ${err.message}`));
				}
				const html = stdout || "";
				// Retry on empty output, navigation failures, or Cloudflare error pages
				const isJunk =
					html.length < minContentBytes ||
					html.includes("Navigation failed") ||
					html.includes("Gateway time-out") ||
					html.includes("cf-browser-verification");
				if (isJunk && n < maxAttempts) {
					return resolve(attempt(n + 1));
				}
				resolve(html);
			});
		});
	}

	return attempt(1);
}

function isLikelySPA(rawHtml: string, text: string): boolean {
	if (text.trim().length === 0) return true;
	if (/<div\s[^>]*id=["'](?:root|app)["'][^>]*><\/div>/i.test(rawHtml)) return true;
	if (text.trim().length < 500 && /<script\b/i.test(rawHtml)) return true;
	return false;
}

function htmlToText(html: string): string {
	let t = html
		.replace(/<(script|style|noscript|svg|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer)>/gi, "\n\n")
		.replace(/<[^>]+>/g, " ");
	t = decodeEntities(t);
	return t
		.split("\n")
		.map((l) => l.replace(/[ \t]+/g, " ").trim())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web using the local SearXNG instance (aggregates Brave, Startpage, Mojeek). Returns titles, URLs, and snippets.",
		promptSnippet: "Search the web via local SearXNG",
		promptGuidelines: [
			"Use web_search for current information from the web.",
			"Follow up with fetch_content on a result URL when you need full page content.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
			max_results: Type.Optional(
				Type.Number({ description: "Max results to return (default 10)", minimum: 1, maximum: 50 }),
			),
		}),
		async execute(_toolCallId, params, signal) {
			const limit = params.max_results ?? 10;
			const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(params.query)}&format=json&categories=general`;
			const res = await fetch(url, {
				signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
				headers: { Accept: "application/json" },
			});
			if (!res.ok) {
				throw new Error(`SearXNG returned HTTP ${res.status} — is the instance running at ${SEARXNG_URL}?`);
			}
			const data = (await res.json()) as { results?: SearxResult[] };
			const results = (data.results ?? []).slice(0, limit);
			if (results.length === 0) {
				return { content: [{ type: "text", text: `No results for: ${params.query}` }], details: {} };
			}
			const text = results
				.map((r, i) => {
					const date = r.publishedDate ? ` (${r.publishedDate})` : "";
					const snippet = r.content ? `\n${r.content}` : "";
					return `${i + 1}. ${r.title}${date}\n${r.url}${snippet}`;
				})
				.join("\n\n");
			return {
				content: [{ type: "text", text: `Results for "${params.query}":\n\n${text}` }],
				details: { count: results.length },
			};
		},
	});

	pi.registerTool({
		name: "fetch_content",
		label: "Fetch Content",
		description:
			"Fetch a web page and return its text content (HTML stripped). For JS-heavy SPAs that return empty, use the lightpanda tool instead.",
		promptSnippet: "Fetch a URL and return readable text",
		parameters: Type.Object({
			url: Type.String({ description: "URL to fetch" }),
			max_chars: Type.Optional(
				Type.Number({ description: `Max characters to return (default ${MAX_CONTENT_CHARS})` }),
			),
		}),
		async execute(_toolCallId, params, signal) {
			let raw: string;
			let contentType: string;
			let usedLightpanda = false;

			try {
				const res = await fetch(params.url, {
					signal: AbortSignal.any([signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
					redirect: "follow",
					headers: {
						"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
						Accept: "text/html,application/xhtml+xml,text/plain,application/json,*/*",
					},
				});
				if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${params.url}`);
				raw = await res.text();
				contentType = res.headers.get("content-type") ?? "";
			} catch (_err) {
				raw = "";
				contentType = "text/html";
			}

			let text = contentType.includes("html") ? htmlToText(raw) : raw;

			if (isLikelySPA(raw, text)) {
				try {
					const lpRaw = await runLightpanda(params.url);
					if (lpRaw.length > 0) {
						text = htmlToText(lpRaw);
						usedLightpanda = true;
					}
				} catch (_err) {
					// Lightpanda failed — keep the original fetch result
				}
			}

			// Final fallback: if everything returned empty, try curl
			// (sites like Amazon block Node.js fetch but allow curl TLS fingerprint)
			if (text.trim().length === 0) {
				try {
					const curlRaw = await curlFetch(params.url, signal);
					if (curlRaw.length > 0) {
						text = htmlToText(curlRaw);
						usedLightpanda = false;
					}
				} catch (_err) {
					// all fallbacks exhausted
				}
			}

			const cap = params.max_chars ?? MAX_CONTENT_CHARS;
			let truncated = false;
			if (text.length > cap) {
				text = text.slice(0, cap);
				truncated = true;
			}
			return {
				content: [
					{
						type: "text",
						text: `Content of ${params.url} (${text.length} chars${truncated ? ", truncated" : ""}${usedLightpanda ? ", via Lightpanda" : ""}):\n\n${text}`,
					},
				],
				details: { truncated, contentType, usedLightpanda },
			};
		},
	});
}

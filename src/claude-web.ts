/**
 * The pure part of pi-claude-web: the server tools we add to a side request, the prompts, and how the
 * answer comes back. No Pi imports, so the tests run without a session.
 *
 * Each tool call is one short request to a small Claude model with one Anthropic server tool added to
 * the payload. Anthropic runs the search or the fetch on its side within that one response, so there is
 * no agent loop here, and the main model only sees the written answer.
 */

/** The model the side requests run on. Small and fast; the search and fetch quality is the tool's. */
export const MODEL_PROVIDER = "anthropic";
export const MODEL_ID = "claude-haiku-5-5";

export const WEB_SEARCH_TYPE = "web_search_20260318";
export const WEB_FETCH_TYPE = "web_fetch_20260318";

/** Searches per call. Simple look-ups take 1–3; this leaves room for a comparison. */
export const MAX_SEARCHES = 5;
/** Fetches per call: the page asked for, plus a couple of pages it links to if the question needs them. */
export const MAX_FETCHES = 3;
/** Cap on one fetched page's text in the side request's context (approximate, Anthropic counts it). */
export const MAX_PAGE_TOKENS = 50_000;
/** Cap on what goes back to the main model. */
export const MAX_ANSWER_CHARS = 12_000;

/**
 * Both tools are called directly (`allowed_callers: ["direct"]`), which turns dynamic filtering off. With
 * filtering on, the API runs the tool from its own code execution, and on a Claude subscription that
 * fails with `too_many_requests` every time (tested October 2026), so the answer comes back without results.
 */
const DIRECT = ["direct"];

export type DomainFilter = { allowedDomains?: string[]; blockedDomains?: string[] };

function cleanDomains(domains: string[] | undefined): string[] | undefined {
	const out = (domains ?? []).map((domain) => domain.trim()).filter(Boolean);
	return out.length > 0 ? out : undefined;
}

/** Anthropic refuses a request with both lists, so say so before sending it. */
function domainFields(filter: DomainFilter): Record<string, string[]> {
	const allowed = cleanDomains(filter.allowedDomains);
	const blocked = cleanDomains(filter.blockedDomains);
	if (allowed && blocked) throw new Error("Use allowed_domains or blocked_domains, not both.");
	if (allowed) return { allowed_domains: allowed };
	if (blocked) return { blocked_domains: blocked };
	return {};
}

export function webSearchTool(filter: DomainFilter = {}): Record<string, unknown> {
	return {
		type: WEB_SEARCH_TYPE,
		name: "web_search",
		max_uses: MAX_SEARCHES,
		allowed_callers: DIRECT,
		...domainFields(filter),
	};
}

export function webFetchTool(): Record<string, unknown> {
	return {
		type: WEB_FETCH_TYPE,
		name: "web_fetch",
		max_uses: MAX_FETCHES,
		max_content_tokens: MAX_PAGE_TOKENS,
		allowed_callers: DIRECT,
	};
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === "object" && !Array.isArray(value);

/**
 * Adds a server tool to an Anthropic Messages payload (Pi's `onPayload` hook). A payload that isn't an
 * object, or already carries a tool of that type, comes back unchanged.
 */
export function addServerTool(payload: unknown, tool: Record<string, unknown>): unknown {
	if (!isRecord(payload)) return payload;
	const tools = Array.isArray(payload.tools) ? payload.tools.slice() : [];
	if (tools.some((entry) => isRecord(entry) && entry.type === tool.type)) return payload;
	tools.push(tool);
	return { ...payload, tools };
}

export const SEARCH_SYSTEM = [
	"You are a web research helper for a coding agent. Search the web for the query and write a short, factual answer.",
	"Cite sources as labeled Markdown links next to the facts they support, e.g. [Node.js releases](https://nodejs.org/en/blog/release).",
	"Prefer primary sources: official docs, changelogs, release notes, source repositories.",
	"Keep version numbers, API names, flags and code exactly as the source writes them. Include short code snippets when they answer the query.",
	"Be concise. If the search finds nothing useful, say so plainly instead of guessing.",
].join("\n");

export const FETCH_SYSTEM = [
	"You are a web reading helper for a coding agent. Fetch the page you are given and answer the request from its content.",
	"Quote code, commands, version numbers and API names exactly as the page has them.",
	"If the page doesn't answer the request, say what it does contain. If the fetch fails, say why.",
	"When you rely on another page the first one links to, give its URL as a Markdown link.",
].join("\n");

export function searchRequest(query: string): string {
	return `Search the web and answer, with Markdown links to your sources: ${query}`;
}

/** The URL has to be in the user message: Anthropic's fetch tool only opens URLs already in the conversation. */
export function fetchRequest(url: string, prompt: string): string {
	return `Fetch ${url} and answer from its content: ${prompt}`;
}

/** Only `http(s)` URLs, with the scheme added when it's missing ("docs.python.org/3/"). */
export function normalizeUrl(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) throw new Error("A URL is required.");
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
	let url: URL;
	try {
		url = new URL(withScheme);
	} catch {
		throw new Error(`Not a valid URL: ${input}`);
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`Only http and https URLs can be fetched, not ${url.protocol}`);
	return url.toString();
}

type ContentBlock = { type: string; text?: string };

/** The answer's text: every text block, in order. Search and fetch results never reach Pi's message. */
export function answerText(content: readonly ContentBlock[]): string {
	return content
		.filter((block) => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("")
		.trim();
}

export function capAnswer(text: string): string {
	if (text.length <= MAX_ANSWER_CHARS) return text;
	return `${text.slice(0, MAX_ANSWER_CHARS).trimEnd()}\n\n[Answer truncated at ${MAX_ANSWER_CHARS} characters.]`;
}

import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	addServerTool,
	answerText,
	capAnswer,
	FETCH_SYSTEM,
	fetchRequest,
	MODEL_ID,
	MODEL_PROVIDER,
	normalizeUrl,
	SEARCH_SYSTEM,
	searchRequest,
	webFetchTool,
	webSearchTool,
} from "./claude-web.ts";

/**
 * One side request to the small Claude model with a server tool added. Pi resolves the Claude sign-in
 * (and refreshes it) itself, so no token is ever read or refreshed here.
 */
async function ask(
	ctx: ExtensionContext,
	systemPrompt: string,
	request: string,
	tool: Record<string, unknown>,
	signal: AbortSignal | undefined,
) {
	const model = ctx.modelRegistry.find(MODEL_PROVIDER, MODEL_ID);
	if (!model) throw new Error(`Pi doesn't know ${MODEL_PROVIDER}/${MODEL_ID}. Update Pi.`);
	if (!ctx.modelRegistry.hasConfiguredAuth(model)) {
		throw new Error("No Claude account is signed in. Run /login and choose Anthropic.");
	}
	const message = await ctx.modelRegistry.complete(
		model,
		{ systemPrompt, messages: [{ role: "user", content: request, timestamp: Date.now() }] },
		{ signal, onPayload: (payload) => addServerTool(payload, tool) },
	);
	if (message.stopReason === "aborted") throw new Error("Cancelled.");
	if (message.stopReason === "error") throw new Error(message.errorMessage ?? "The Claude request failed.");
	const text = answerText(message.content);
	if (!text) throw new Error("Claude returned no answer.");
	return { text: capAnswer(text), usage: message.usage };
}

const webSearch = defineTool({
	name: "web_search",
	label: "Web search",
	description:
		"Search the public web through Claude and get back a short written answer with Markdown links to its sources. Use it for anything current or outside your training data: library versions, changelogs, API docs, error messages, release dates.",
	promptSnippet: "Search the web through Claude; returns a short answer with source links",
	promptGuidelines: [
		"Use web_search for current facts (versions, docs, changelogs, errors); write the query as a specific question, and name the library and version when they matter.",
		"Use allowed_domains to keep a web_search to official sources (e.g. [\"docs.python.org\"]) when the answer should come from them.",
	],
	parameters: Type.Object({
		query: Type.String({ description: 'What to find out, as a specific question (e.g. "Vite 7 breaking changes for library mode").' }),
		allowed_domains: Type.Optional(
			Type.Array(Type.String(), { description: 'Only use results from these domains, e.g. ["react.dev"]. Not with blocked_domains.' }),
		),
		blocked_domains: Type.Optional(
			Type.Array(Type.String(), { description: "Never use results from these domains. Not with allowed_domains." }),
		),
	}),
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const query = params.query.trim();
		if (!query) throw new Error("A search query is required.");
		const tool = webSearchTool({ allowedDomains: params.allowed_domains, blockedDomains: params.blocked_domains });
		const { text, usage } = await ask(ctx, SEARCH_SYSTEM, searchRequest(query), tool, signal);
		return { content: [{ type: "text", text }], details: { query }, usage };
	},
});

const webFetch = defineTool({
	name: "web_fetch",
	label: "Web fetch",
	description:
		"Read one web page or PDF through Claude and get back an answer to your question about it. Give the URL and say what you need from the page (a summary, one section, the code example, the options of a flag). Public pages only; no sign-in.",
	promptSnippet: "Read a web page or PDF through Claude and answer a question about it",
	promptGuidelines: [
		"Use web_fetch when you have a URL (from the user, a web_search answer or a file) and need what the page says; ask a precise prompt rather than for the whole page.",
	],
	parameters: Type.Object({
		url: Type.String({ description: "The page to read, e.g. https://vitejs.dev/guide/migration" }),
		prompt: Type.String({ description: 'What you need from the page, e.g. "List every breaking change with its migration step".' }),
	}),
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const url = normalizeUrl(params.url);
		const prompt = params.prompt.trim() || "Summarise the page.";
		const { text, usage } = await ask(ctx, FETCH_SYSTEM, fetchRequest(url, prompt), webFetchTool(), signal);
		return { content: [{ type: "text", text }], details: { url }, usage };
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(webSearch);
	pi.registerTool(webFetch);
}

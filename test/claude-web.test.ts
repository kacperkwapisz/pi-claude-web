import assert from "node:assert/strict";
import { test } from "node:test";
import {
	addServerTool,
	answerText,
	capAnswer,
	fetchRequest,
	MAX_ANSWER_CHARS,
	normalizeUrl,
	webFetchTool,
	webSearchTool,
} from "../src/claude-web.ts";

test("search tool is the latest version, called directly, capped", () => {
	assert.deepEqual(webSearchTool(), {
		type: "web_search_20260318",
		name: "web_search",
		max_uses: 5,
		allowed_callers: ["direct"],
	});
});

test("search tool takes one domain list, never both", () => {
	assert.deepEqual(webSearchTool({ allowedDomains: [" react.dev ", ""] }).allowed_domains, ["react.dev"]);
	assert.deepEqual(webSearchTool({ blockedDomains: ["w3schools.com"] }).blocked_domains, ["w3schools.com"]);
	assert.equal("allowed_domains" in webSearchTool({ allowedDomains: [] }), false);
	assert.throws(() => webSearchTool({ allowedDomains: ["a.com"], blockedDomains: ["b.com"] }), /not both/);
});

test("fetch tool is the latest version, called directly, with page and use caps", () => {
	assert.deepEqual(webFetchTool(), {
		type: "web_fetch_20260318",
		name: "web_fetch",
		max_uses: 3,
		max_content_tokens: 50_000,
		allowed_callers: ["direct"],
	});
});

test("addServerTool appends once and leaves other payloads alone", () => {
	const tool = webSearchTool();
	const out = addServerTool({ model: "m", tools: [{ name: "x" }] }, tool) as { tools: unknown[] };
	assert.deepEqual(out.tools, [{ name: "x" }, tool]);
	assert.equal(addServerTool(out, tool), out);
	assert.deepEqual(addServerTool({ model: "m" }, tool), { model: "m", tools: [tool] });
	assert.equal(addServerTool("raw", tool), "raw");
});

test("the fetched URL is in the user message", () => {
	assert.match(fetchRequest("https://example.com/a", "what is it"), /https:\/\/example\.com\/a/);
});

test("normalizeUrl adds https and refuses other schemes", () => {
	assert.equal(normalizeUrl("docs.python.org/3/"), "https://docs.python.org/3/");
	assert.equal(normalizeUrl(" http://localhost:3000/x "), "http://localhost:3000/x");
	assert.throws(() => normalizeUrl("file:///etc/passwd"), /Only http and https/);
	assert.throws(() => normalizeUrl("  "), /required/);
});

test("answerText joins text blocks only", () => {
	assert.equal(
		answerText([
			{ type: "thinking" },
			{ type: "text", text: "Node 26.12.1 " },
			{ type: "toolCall" },
			{ type: "text", text: "([blog](https://nodejs.org))" },
		]),
		"Node 26.12.1 ([blog](https://nodejs.org))",
	);
});

test("capAnswer truncates with a note", () => {
	assert.equal(capAnswer("short"), "short");
	const long = capAnswer("x".repeat(MAX_ANSWER_CHARS + 10));
	assert.match(long, /\[Answer truncated/);
	assert.ok(long.length < MAX_ANSWER_CHARS + 60);
});

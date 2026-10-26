# pi-claude-web

Web search and web fetch for Pi through your Claude account. Each call is a short request to
Claude Haiku 5.5 with one of Anthropic's server-side tools turned on, so Anthropic runs the search
or reads the page and your model gets back a short written answer with source links, not raw
search results or a whole page.

## Install

```bash
pi install git:github.com/kacperkwapisz/pi-claude-web
```

Requires Pi 1.4 or later, signed in to Anthropic (`/login`, a Claude subscription or an API key).
Pi handles the sign-in and refreshes it; this extension never reads a token.

## Use

Ask in plain words ("check what changed in Vite 7", "read this migration guide and update the
config"). The model gets two tools:

- `web_search` takes a `query`, plus optional `allowed_domains` or `blocked_domains` (not both),
  and returns an answer with Markdown links to its sources.
- `web_fetch` takes a `url` and a `prompt` saying what to get from the page, and returns the answer.
  It reads public pages and PDFs, not pages behind a sign-in.

Each call reports its tokens, so Pi's session totals include them.

## How it works

| | `web_search` | `web_fetch` |
|---|---|---|
| Anthropic tool | `web_search_20260318` | `web_fetch_20260318` |
| Uses per call | up to 5 searches | up to 3 pages |
| Limits | | about 50,000 tokens of text per page |

Answers are cut at 12,000 characters.

Both tools are called with `allowed_callers: ["direct"]`, which turns off Anthropic's dynamic
filtering. With filtering on, Anthropic runs the tool from its own code execution, and on a Claude
subscription that failed with `too_many_requests` every time we tried (October 2026), so the answer
came back without results.

Anthropic's fetch tool only opens URLs that are already in the conversation, so the URL goes in the
side request's own message. It refuses URLs that look like they contain a password or key.

## Development

```bash
npm install
npm run check
npm test
pi -e ./src/index.ts   # try it without installing
```

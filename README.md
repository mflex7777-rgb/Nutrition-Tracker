# Nutrition Tracker

A small tool that estimates calories, protein, and fiber for a list of foods, using Claude.

## Files

- `index.html`, `style.css`, `script.js` — the page you see in your browser.
- `api/nutrition.js` — runs on Vercel's servers (not in the browser). It receives your food list, asks Claude for nutrition estimates, and sends the answer back. Your Anthropic API key lives here, on the server, never in the browser.

## Why this version won't break like the old one did

The old app had a specific model name (like `claude-sonnet-4-20250514`) typed directly into the code. When Anthropic retires that exact model, the app breaks, because it's still asking for something that no longer exists.

This version asks Anthropic's API "what's the current Sonnet model?" every time someone uses the tool, and uses whatever the answer is. So when Anthropic ships a new model, you don't need to change anything — the app picks it up automatically on the next lookup.

## Environment variable you must set in Vercel

| Name | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | Your API key from [console.anthropic.com](https://console.anthropic.com/settings/keys) |

See the deployment steps for exactly where to enter this.

# Skillcanon

A public studio that turns a Visitor's Description into a portable Agent Skill.

**Live:** https://skillcanon.vercel.app

Pick an Example (PR review, DB migration, or release notes) or type a Description. Compile returns a Skill Spec, a Canon `SKILL.md`, a Compatibility Report for Cursor vs Claude Code, one Bundle zip (Cursor Projection, Claude Code Projection, `INSTALL.md`, `evals/cases.json`), and Check.

Check always runs Lint. When the model is up it also runs the Judge. If the model returns 429, Check still shows Lint and "Judge unavailable". The screencast for that case will live in [`docs/screencast`](docs/screencast).

No accounts. The Canon is one portable `SKILL.md`; Projections differ only by path. Chrome is English; the Canon follows the Description's language.

This is not a marketplace, a Skill pack, a plugin, MCP generation, a chat playground, or a saved library of Skills. Codex, Gemini CLI, and Copilot get the same Canon in a different directory, not separate generators.

Local dogfood: copy `.env.example` to `.env.local`, point at OpenCode Zen, then `npm install && npm run dev`. Tests use a fake adapter: `npm test`.

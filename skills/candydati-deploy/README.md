# Candydati deploy skill

An agent skill that lets an AI coding agent (Claude Code, Codex, Cursor and others) deploy Candydati on the user's own
server: through Dokploy's API, or on a fresh server with the one-command installer. The user gives a server with
Dokploy and an API key; the agent does the rest and hands back the link to create the first account. Email is
configured afterwards from the app (Settings, Email).

What is here:

- `SKILL.md`: the instructions the agent follows, with the exact Dokploy API calls.
- `scripts/dokploy-template.mjs`: prints the Dokploy template of the latest release (or `--ref`) as the base64 that
  Dokploy imports; an optional name and own domain can be filled in. Secrets stay Dokploy helpers,
  generated on import; passwords and API keys are refused. Node 24 or newer, no dependencies.

The template itself is `deploy/dokploy/` in the repository, generated from `docker-compose.prod.yml`.

## Install

The skill is a folder: copy `skills/candydati-deploy/` (with `scripts/`).

- **Claude Code**: put it in `.claude/skills/` of a project or in `~/.claude/skills/`, then ask, for example, "deploy
  Candydati on my Dokploy at https://dokploy.example.com".
- **Codex and other agents** that follow the `AGENTS.md` convention: keep the folder and add to your `AGENTS.md`: "To
  deploy Candydati, read and follow `skills/candydati-deploy/SKILL.md`."
- **Without an agent**: follow `docs/deploy/dokploy.md` (Quick path) in Dokploy's interface.

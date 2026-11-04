# Connect Claude (custom connector, OAuth)

The MCP server at `{your site}/mcp` accepts two kinds of credentials:

- **OAuth** (this page): add the server to Claude as a *custom connector*. You sign in, pick the organization and
  approve; there is no key to copy. The connection acts as you, with your role in that organization.
- **API keys** (Settings > API and integrations): for agents and scripts that send a bearer key (Claude Code, Codex,
  Cursor...). Unchanged.

## Add the connector

You need an instance served over **https** (OAuth is off on plain http, except `localhost` for development).

**claude.ai and Claude desktop** (they share connectors):

1. Settings > Connectors > *Add custom connector*.
2. Name it as you like; URL: `https://<your site>/mcp`. Leave the OAuth client fields empty: Claude registers itself.
3. *Connect*. A window of your site opens: sign in (and pass 2FA if you use it), choose the organization, read what the
   connector can do, and *Allow*. You land back in Claude.

On Team and Enterprise plans an owner adds the connector for the workspace; each person then connects their own
account, so each acts with their own role.

**Claude Code** uses its own callback on `http://localhost`. Either use an API key
(`claude mcp add --transport http ... --header "Authorization: Bearer <key>"`), or ask the operator to set
`MCP_OAUTH_ALLOW_LOOPBACK_REDIRECTS=true` and run `claude mcp add --transport http <name> https://<your site>/mcp`.

## What the connector can do

Exactly what the MCP tools do (job ads, criteria, pipeline, searches on declared criteria, notes, tasks, reports),
limited by your role, and never what no machine may do: it cannot move, decide on, message or erase candidates, nor
manage members, keys or settings (moving a candidate is a decision about a person, so a connector never holds it even
when your role does). Candidates come with first name and id only. Every call is in the audit log as
`mcp.read` (reads) or the action itself, with actor *connected app*; connecting and revoking are logged as
`connected_app.granted` and `connected_app.revoked`.

The organization is fixed when you connect: switching organization in the web app does not move the connector. To use
it with another organization, connect again and pick that one (each connection is listed on its own).

## Revoke

Settings > Security > *Connected apps*: every connection you made, with *Revoke*. Owners and admins see and can revoke
every connection of the organization. Revoking stops the connector at its next call: access tokens are checked against
the database on every request, and its refresh token is deleted. Leaving the organization, or losing a role, takes
effect the same way. If the organization requires 2FA for owners and admins, their connections are suspended until they
enrol, like their API keys.

## How it works (for operators and reviewers)

Better Auth's MCP plugin (`@better-auth/mcp`, on `@better-auth/oauth-provider`) is the authorization server; the api is
the resource server.

| Step | Endpoint |
|---|---|
| Protected resource metadata (RFC 9728) | `GET /.well-known/oauth-protected-resource/mcp` (and the root) |
| Authorization server metadata (RFC 8414) | `GET /.well-known/oauth-authorization-server/api/auth` (and the root) |
| Dynamic client registration (RFC 7591) | `POST /api/auth/oauth2/register` |
| Authorization, PKCE S256 required | `GET /api/auth/oauth2/authorize` -> web `/oauth/authorize` (sign-in) and `/oauth/consent` |
| Token, refresh (form-encoded) | `POST /api/auth/oauth2/token` |
| Revocation (RFC 7009) | `POST /api/auth/oauth2/revoke` |

- A call to `/mcp` without valid credentials answers `401` with
  `WWW-Authenticate: Bearer resource_metadata="https://<site>/.well-known/oauth-protected-resource/mcp", scope="mcp"`.
- Tokens are **opaque**, prefixed (`candydati_oat_` access, `candydati_ort_` refresh) and stored only as SHA-256 hashes.
  Access tokens live 15 minutes by default (`MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS`), refresh tokens 30 days
  (`MCP_OAUTH_REFRESH_TOKEN_TTL_DAYS`), rotated on use.
- Every request checks: the token hash, expiry, audience (the token must have been issued for `https://<site>/mcp`,
  RFC 8707), the `mcp` scope, that the grant still exists, that the client is enabled, the person's membership and
  current role, and the organization's 2FA rule. The token is accepted only by `/mcp`, never by the REST api.
- Each connection has its own rate limit (`API_KEY_RATE_LIMIT`, one unit per tool call) and its own daily budget of
  model-backed tools, on top of the per-address limits of the api.
- Registration is open (that is how Claude registers), so **callbacks are an allowlist**: Claude's
  (`https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`), plus exact https URLs in
  `MCP_OAUTH_REDIRECT_URIS`, plus `http://localhost` / `127.0.0.1` / `[::1]` callbacks when
  `MCP_OAUTH_ALLOW_LOOPBACK_REDIRECTS=true`. A registration with any other callback is refused, and an authorization
  is checked against the same list again, so narrowing the list also stops clients registered before. The client
  credentials grant is not offered: a connection always acts for a person.
- The consent page shows the app's name **as the app declared it** and the host the browser returns to; trust the host.
  The consent page cannot be framed and sends no referrer.
- Better Auth's client and consent management endpoints, userinfo, introspection and logout are not routed: connections
  are managed only through `/api/v1/connected-apps` (session only, audited).

Other MCP clients that support OAuth with dynamic registration (MCP Inspector, Cursor, VS Code) work the same way once
their callback is allowed: add it to `MCP_OAUTH_REDIRECT_URIS` (https) or turn on loopback callbacks. Clients that need
the Client ID Metadata Document flow (CIMD) without registration are not supported yet.

Turn OAuth off with `MCP_OAUTH_ENABLED=off`: discovery disappears, `/api/auth/oauth2/*` answers 404 and `/mcp`
accepts API keys only. Existing connections stay listed and revocable.

# API, webhooks and MCP

Everything that can be done in the interface can be done through the API and through MCP. All three surfaces call the
same services as the interface, with the same permissions and the same audit log.

## API keys

Owners and admins create keys in the app under **Settings, API and integrations**. A key:

- looks like `candydati_<8 characters>_<32 characters>`; the first part is shown in the list to recognise it, the
  secret is shown **once**, at creation;
- acts on behalf of the person who created it and never has more permissions than they do; it stops working if that
  person leaves the organization;
- carries explicit scopes: pick only what the integration needs;
- always expires: after 90 days by default (`API_KEY_DEFAULT_TTL_DAYS`), at most after a year;
- is rate limited per minute (`API_KEY_RATE_LIMIT`);
- is suspended while the organization requires two-factor authentication and its owner or admin has not enrolled.

Send it as a bearer token:

```bash
curl -H "Authorization: Bearer candydati_..." https://ats.example.com/api/v1/...
```

Closing jobs, deciding about candidates and administration cannot be granted to a key.

## REST API and OpenAPI

The OpenAPI document is served by every instance at `/api/v1/openapi.json`. The same page in the app
(**Settings, API and integrations**) renders the reference: every route usable with a key, with parameters, body and
responses.

Responses use one envelope:

```json
{ "success": true, "data": { }, "error": null }
```

Files (CVs, exports, CSV reports) and the OpenAPI document itself are returned as they are.

Public, read-only data needs no key: the careers pages, the XML jobs feed and `/api/v1/public/**`.

## Webhooks

Webhooks tell your systems when something happens. Create endpoints in the app under **Settings, Webhooks** (https
only). Events:

| Event | When |
|---|---|
| `application.received` | a new application |
| `application.moved` | an application moved to another stage |
| `application.decided` | an outcome was recorded |
| `job.published` | a job ad was published |
| `job.updated` | a published ad was edited |
| `job.closed` | a job was closed |
| `candidate.erased` | a candidate's data was erased |

The payload carries ids only, never names or emails: read the details through the API. Each delivery is a JSON `POST`
with these headers:

| Header | Content |
|---|---|
| `x-candydati-event` | the event type (`ping` for the test button) |
| `x-candydati-delivery` | the delivery id |
| `x-candydati-timestamp` | unix time in seconds |
| `x-candydati-signature` | `sha256=` and the hex HMAC-SHA256 of `<timestamp>.<body>`, keyed with the endpoint's secret |

The signing secret (`whsec_...`) is shown once, when the endpoint is created. Verify the signature on the raw body and
refuse old timestamps. A delivery is tried up to 5 times, waiting up to 10 seconds for an answer; the app lists every
attempt. Events are written together with the change that caused them and sent by the worker afterwards, so none is
lost when your endpoint is down.

Verification in Node.js:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function isValid(secret, timestamp, rawBody, signature) {
  const expected = `sha256=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}
```

## MCP server

An agent that speaks MCP (Model Context Protocol) can work on job ads and read the pipeline. The server is at
`https://<your domain>/mcp` (Streamable HTTP, stateless, `POST` only) and authenticates with an API key only. The app
shows the address and a ready client configuration under **Settings, API and integrations**.

Tools:

| Tool | What it does |
|---|---|
| `list_jobs` | lists job ads, filterable by status |
| `get_job` | reads a job ad with its content and status |
| `create_job` | creates a draft job ad |
| `update_job` | edits the content of a job ad |
| `analyze_job_ad` | analyses the quality of the text and points out vague phrases |
| `check_publishable` | tells what is missing for the ad to be publishable |
| `publish_job` | publishes a complete job ad (needs the publish permission) |
| `get_pipeline` | stages with counts and cards, without CV text |
| `list_attention` | applications waiting for a reply or close to their deadline |
| `add_candidate_note` | adds an internal note to a candidate |
| `create_task` | creates a task on a candidate or a job ad |
| `list_job_templates` | lists job ad templates |
| `get_job_stats` | job ad figures for the overview |
| `get_reports` | aggregated figures of a period, with no personal data |

There are no tools to move, assess, reject or write to candidates: those stay a person's decision. Each tool call counts
against the key's rate limit, a batch holds at most 20 messages, and reads are audited. Model-backed tools
(`analyze_job_ad`, and `publish_job` when `FAST_MODEL` is set) have daily budgets, see [AI assistant](./ai).

import { defineEventHandler, setResponseHeader, setResponseStatus } from 'h3'
import { isOAuthDiscoveryPath, isReadMethod } from '../../lib/api-proxy'
import { forwardToApi } from '../../lib/forward'

/**
 * The OAuth discovery documents of the MCP server (`/.well-known/oauth-protected-resource[/mcp]`,
 * `/.well-known/oauth-authorization-server[/api/auth]`), served by the api and published on the public origin so an
 * MCP client finds them next to `{siteUrl}/mcp`. Anything else under `/.well-known` is not ours: 404.
 */
const forward = forwardToApi(isOAuthDiscoveryPath)

export default defineEventHandler((event) => {
  if (!isReadMethod(event.method)) {
    setResponseStatus(event, 405)
    setResponseHeader(event, 'allow', 'GET, HEAD')
    return ''
  }
  return forward(event)
})

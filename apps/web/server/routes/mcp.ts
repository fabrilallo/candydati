import { isMcpPath } from '../lib/api-proxy'
import { forwardToApi } from '../lib/forward'

/** `{siteUrl}/mcp`, the address shown in "API e integrazioni", forwarded to the api's MCP server. */
export default forwardToApi(isMcpPath)

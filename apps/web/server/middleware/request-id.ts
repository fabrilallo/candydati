import { acceptRequestId, REQUEST_ID_HEADER } from '@tt/domain'
import { defineEventHandler, getRequestHeader, setResponseHeader } from 'h3'

/**
 * Every request has an id: the caller's (a reverse proxy may set `x-request-id`) when well formed, a new one otherwise.
 * It goes to the api in the forwarded headers (the proxy copies them), comes back in the response and is what the
 * api and the worker log as `reqId`. Free-form values are replaced, never copied into a log line.
 */
export default defineEventHandler((event) => {
  const requestId = acceptRequestId(getRequestHeader(event, REQUEST_ID_HEADER))
  event.node.req.headers[REQUEST_ID_HEADER] = requestId
  event.context.requestId = requestId
  setResponseHeader(event, REQUEST_ID_HEADER, requestId)
})

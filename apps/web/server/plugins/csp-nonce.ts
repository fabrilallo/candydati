import { addNonceToScripts } from '../lib/security-headers'

/** Stamps the response nonce on every inline and external script Nuxt renders into the page. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const nonce: unknown = event.context.cspNonce
    if (typeof nonce !== 'string') return
    html.head = html.head.map((part) => addNonceToScripts(part, nonce))
    html.bodyPrepend = html.bodyPrepend.map((part) => addNonceToScripts(part, nonce))
    html.body = html.body.map((part) => addNonceToScripts(part, nonce))
    html.bodyAppend = html.bodyAppend.map((part) => addNonceToScripts(part, nonce))
  })
})

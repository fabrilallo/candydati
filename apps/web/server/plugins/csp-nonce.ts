import { stampNuxtScripts } from '../lib/security-headers'

/** Stamps the response nonce on the scripts Nuxt emits (head and closing tags), never on the rendered app body. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const nonce: unknown = event.context.cspNonce
    if (typeof nonce !== 'string') return
    const stamped = stampNuxtScripts(html, nonce)
    // The hook hands over a mutable context: its parts are replaced with the stamped copies.
    html.head = [...stamped.head]
    html.bodyAppend = [...stamped.bodyAppend]
  })
})

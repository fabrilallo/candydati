<script setup lang="ts">
/**
 * Optional Cloudflare Turnstile check on the public application form. Rendered only when `NUXT_PUBLIC_TURNSTILE_SITE_KEY`
 * is set; the api checks the answer when `TURNSTILE_SECRET_KEY` is set. The script comes from Cloudflare, which the page
 * policy allows only in this case.
 */
interface TurnstileApi {
  render: (element: HTMLElement, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string
  remove: (id: string) => void
}
const props = defineProps<{ siteKey: string }>()
const emit = defineEmits<{ token: [token: string] }>()
const host = ref<HTMLElement | null>(null)
let widgetId: string | null = null
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

const loadScript = (): Promise<TurnstileApi> =>
  new Promise((resolve, reject) => {
    const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile
    if (api) return resolve(api)
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => resolve((window as unknown as { turnstile: TurnstileApi }).turnstile)
    script.onerror = () => reject(new Error('turnstile script failed to load'))
    document.head.append(script)
  })

onMounted(async () => {
  try {
    const api = await loadScript()
    if (host.value) widgetId = api.render(host.value, { sitekey: props.siteKey, callback: (token) => emit('token', token), 'expired-callback': () => emit('token', ''), 'error-callback': () => emit('token', '') })
  } catch {
    emit('token', '')
  }
})
onBeforeUnmount(() => {
  if (widgetId !== null) (window as unknown as { turnstile?: TurnstileApi }).turnstile?.remove(widgetId)
})
</script>

<template>
  <div ref="host" data-testid="turnstile" />
</template>

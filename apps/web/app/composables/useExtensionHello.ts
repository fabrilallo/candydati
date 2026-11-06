import { chromeRuntime } from '@/lib/extension-bridge'
import { helloExtension } from '@/lib/extension-save'

/**
 * Tells the Candydati extension, once the app is open in the browser, that this Candydati lives at this address: its
 * "Save to Candydati" button on LinkedIn then knows where to open the save page. Nothing happens without the extension
 * or without `NUXT_PUBLIC_EXTENSION_ID`.
 */
export const useExtensionHello = (): void => {
  const extensionId = useRuntimeConfig().public.extensionId
  onMounted(() => {
    if (extensionId) void helloExtension(chromeRuntime(), extensionId)
  })
}

import type { Ref } from 'vue'

/** Asks before leaving with unsaved changes: in-app navigation and closing/reloading the tab. */
export const useUnsavedGuard = (dirty: Ref<boolean>): void => {
  const { t } = useI18n()
  // Route guards exist only inside a routed component (a page and its children).
  if (useRoute().matched.length > 0) onBeforeRouteLeave(() => (dirty.value ? window.confirm(t('job.editor.leave')) : true))
  if (import.meta.client) {
    useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
      if (!dirty.value) return
      event.preventDefault()
      event.returnValue = ''
    })
  }
}

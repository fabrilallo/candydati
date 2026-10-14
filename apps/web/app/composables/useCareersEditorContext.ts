import type { CareersMediaAssetDto, Locale, MediaKind } from '@tt/domain'
import type { ComputedRef, InjectionKey } from 'vue'

/**
 * What every section form needs without passing it through each level: the editing language, the page's default
 * language (fallback placeholders), the media library and a way to open the media picker for a field.
 */
export interface CareersEditorContext {
  readonly locale: Locale
  readonly fallback: Locale
  readonly assets: Readonly<Record<string, CareersMediaAssetDto>>
  /** Opens the picker for `kind`; `onPicked` receives the chosen (or just uploaded) asset. */
  readonly pick: (kind: MediaKind, onPicked: (asset: CareersMediaAssetDto) => void) => void
}

const KEY: InjectionKey<ComputedRef<CareersEditorContext>> = Symbol('careers-editor')

export const provideCareersEditor = (context: ComputedRef<CareersEditorContext>): void => provide(KEY, context)

export const useCareersEditor = (): ComputedRef<CareersEditorContext> => {
  const context = inject(KEY)
  if (!context) throw new Error('useCareersEditor outside the careers page editor')
  return context
}

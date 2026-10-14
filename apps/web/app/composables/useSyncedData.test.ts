import { nextTick, ref, type Ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useSyncedData } from './useSyncedData'

type Box = { readonly data: { readonly n: number } | null } | null

describe('useSyncedData', () => {
  it('reads the loaded payload as it is at render time, not as it was at setup (server and browser render the same)', () => {
    const source = ref<Box>(null)
    const synced = useSyncedData<{ readonly n: number }>(source)
    expect(synced.value).toBeNull()
    // The server resolves the fetch after setup and before it renders.
    source.value = { data: { n: 1 } }
    expect(synced.value).toEqual({ n: 1 })
  })

  it('keeps a local edit until the next load replaces it', async () => {
    const source = ref<Box>({ data: { n: 1 } })
    const synced: Ref<{ readonly n: number } | null> = useSyncedData(source)
    synced.value = { n: 2 }
    expect(synced.value).toEqual({ n: 2 })
    source.value = { data: { n: 3 } }
    await nextTick()
    expect(synced.value).toEqual({ n: 3 })
  })
})

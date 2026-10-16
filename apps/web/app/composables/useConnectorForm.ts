import type { MigrationConnectorDto } from '@candydati/domain'
import { connectorFailure, startConnectorMigration } from '@/lib/migration-connector-api'

const blank = (connector: MigrationConnectorDto): Record<string, string> => Object.fromEntries(connector.fields.map((field) => [field.name, '']))

/**
 * The credentials form of one connector. The values live only in this form: never in a store, the URL or the browser's
 * storage, and they are cleared after every submit, whether the api took them or not. A refusal names the fields only.
 */
export const useConnectorForm = (connector: MigrationConnectorDto) => {
  const request = useJobsApi()
  const values = ref<Record<string, string>>(blank(connector))
  const missing = ref<readonly string[]>([])
  const refusedFields = ref<readonly string[]>([])
  const errorKey = ref<string | null>(null)
  const pending = ref(false)

  const setValue = (name: string, value: string): void => {
    values.value = { ...values.value, [name]: value }
    missing.value = missing.value.filter((field) => field !== name)
  }

  const submit = async (): Promise<string | null> => {
    if (pending.value) return null
    const empty = connector.fields.filter((field) => (values.value[field.name] ?? '').trim() === '').map((field) => field.name)
    missing.value = empty
    if (empty.length > 0) return null
    const credentials = Object.fromEntries(connector.fields.map((field) => [field.name, (values.value[field.name] ?? '').trim()]))
    values.value = blank(connector)
    pending.value = true
    errorKey.value = null
    refusedFields.value = []
    try {
      return (await startConnectorMigration(request, connector.id, credentials)).id
    } catch (error) {
      const failure = connectorFailure(error)
      errorKey.value = failure.key
      refusedFields.value = failure.fields
      return null
    } finally {
      pending.value = false
    }
  }

  onBeforeUnmount(() => {
    values.value = blank(connector)
  })

  return {
    values: computed(() => values.value),
    missing: computed(() => missing.value),
    refusedFields: computed(() => refusedFields.value),
    errorKey: computed(() => errorKey.value),
    pending: computed(() => pending.value),
    setValue,
    submit,
  }
}

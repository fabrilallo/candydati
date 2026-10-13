import { z } from 'zod'

/**
 * A readable API reference from the OpenAPI 3.1 document served by the api: operations grouped by tag, each with its
 * parameters, request body and responses as small schema trees. Pure; rendered by `ApiReference`, no third-party
 * script. Only the parts of OpenAPI the api uses are read; anything else is ignored, never trusted.
 */
const record = z.record(z.string(), z.unknown())

export const openApiDocumentSchema = z.object({
  openapi: z.string(),
  info: z.object({ title: z.string().default(''), version: z.string().default('') }).default({ title: '', version: '' }),
  tags: z.array(z.object({ name: z.string(), description: z.string().optional() })).default([]),
  paths: z.record(z.string(), record),
  security: z.array(record).optional(),
  components: z.object({ schemas: record.default({}) }).default({ schemas: {} }),
})
export type OpenApiDocument = z.output<typeof openApiDocumentSchema>

export interface SchemaField {
  readonly name: string
  readonly required: boolean
  readonly node: SchemaNode
}

export interface SchemaNode {
  /** `string`, `Job`, `Job[]`, `string | null`. */
  readonly label: string
  readonly refName: string | null
  readonly description: string | null
  readonly enumValues: readonly string[]
  readonly fields: readonly SchemaField[]
}

export interface Parameter {
  readonly name: string
  readonly in: string
  readonly required: boolean
  readonly node: SchemaNode
}

export interface ResponseRef {
  readonly status: string
  readonly description: string
  readonly node: SchemaNode | null
}

export interface Operation {
  readonly id: string
  readonly method: string
  readonly path: string
  readonly summary: string
  readonly description: string
  /** False only when the operation says `security: []` (public). */
  readonly auth: boolean
  readonly parameters: readonly Parameter[]
  readonly request: SchemaNode | null
  readonly responses: readonly ResponseRef[]
}

export interface ReferenceGroup {
  /** null = operations without a tag. */
  readonly tag: string | null
  readonly description: string | null
  readonly operations: readonly Operation[]
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const
const MAX_DEPTH = 4
type Json = Readonly<Record<string, unknown>>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const refName = (ref: string): string => ref.split('/').pop() ?? ref

const resolve = (ref: string, doc: OpenApiDocument): Json | null => {
  const target = doc.components.schemas[refName(ref)]
  return ref.startsWith('#/components/schemas/') && isObject(target) ? target : null
}

const leaf = (label: string, schema: Json, ref: string | null = null): SchemaNode => ({
  label,
  refName: ref,
  description: str(schema.description),
  enumValues: Array.isArray(schema.enum) ? schema.enum.map(String) : [],
  fields: [],
})

const mergeAllOf = (schema: Json, doc: OpenApiDocument): Json => {
  const parts = (schema.allOf as unknown[]).filter(isObject).map((part) => (typeof part.$ref === 'string' ? (resolve(part.$ref, doc) ?? {}) : part))
  const properties = Object.assign({}, ...parts.map((part) => (isObject(part.properties) ? part.properties : {}))) as Json
  const required = parts.flatMap((part) => (Array.isArray(part.required) ? part.required : []))
  return { ...schema, allOf: undefined, type: 'object', properties, required }
}

const unionLabel = (options: unknown[], doc: OpenApiDocument, depth: number, seen: ReadonlySet<string>): string =>
  options.filter(isObject).map((option) => node(option, doc, depth, seen).label).join(' | ')

const typeLabel = (schema: Json): string => {
  if ('const' in schema) return JSON.stringify(schema.const)
  if (Array.isArray(schema.type)) return schema.type.map(String).join(' | ')
  return str(schema.type) ?? (isObject(schema.properties) ? 'object' : 'any')
}

const objectFields = (schema: Json, doc: OpenApiDocument, depth: number, seen: ReadonlySet<string>): readonly SchemaField[] => {
  if (depth >= MAX_DEPTH || !isObject(schema.properties)) return []
  const required = Array.isArray(schema.required) ? schema.required : []
  return Object.entries(schema.properties)
    .filter((entry): entry is [string, Json] => isObject(entry[1]))
    .map(([name, child]) => ({ name, required: required.includes(name), node: node(child, doc, depth + 1, seen) }))
}

const node = (schema: Json, doc: OpenApiDocument, depth: number, seen: ReadonlySet<string>): SchemaNode => {
  if (typeof schema.$ref === 'string') {
    const name = refName(schema.$ref)
    const target = resolve(schema.$ref, doc)
    if (!target || seen.has(name)) return leaf(name, schema, name)
    const inner = node(target, doc, depth, new Set([...seen, name]))
    const label = inner.label === 'object' || inner.label === 'any' ? name : inner.label.endsWith('[]') ? inner.label : name
    return { ...inner, label, refName: name, description: str(schema.description) ?? inner.description }
  }
  if (Array.isArray(schema.allOf)) return node(mergeAllOf(schema, doc), doc, depth, seen)
  const union = Array.isArray(schema.anyOf) ? schema.anyOf : Array.isArray(schema.oneOf) ? schema.oneOf : null
  if (union) return leaf(unionLabel(union, doc, depth, seen), schema)
  if (schema.type === 'array' && isObject(schema.items)) {
    const items = node(schema.items, doc, depth, seen)
    return { ...items, label: `${items.label}[]`, description: str(schema.description) ?? items.description }
  }
  return { ...leaf(typeLabel(schema), schema), fields: objectFields(schema, doc, depth, seen) }
}

/** A JSON Schema as a tree of at most four levels; references resolved once per branch (cycles stop). */
export const schemaNode = (schema: Json, doc: OpenApiDocument): SchemaNode => node(schema, doc, 0, new Set())

const jsonSchemaOf = (content: unknown): Json | null => {
  if (!isObject(content)) return null
  const media = content['application/json'] ?? Object.values(content)[0]
  return isObject(media) && isObject(media.schema) ? media.schema : null
}

const parametersOf = (raw: unknown, doc: OpenApiDocument): readonly Parameter[] =>
  (Array.isArray(raw) ? raw : []).filter(isObject).map((param) => ({
    name: str(param.name) ?? '',
    in: str(param.in) ?? 'query',
    required: param.required === true,
    node: schemaNode(isObject(param.schema) ? param.schema : {}, doc),
  }))

const responsesOf = (raw: unknown, doc: OpenApiDocument): readonly ResponseRef[] =>
  Object.entries(isObject(raw) ? raw : {})
    .filter((entry): entry is [string, Json] => isObject(entry[1]))
    .map(([status, response]) => {
      const schema = jsonSchemaOf(response.content)
      return { status, description: str(response.description) ?? '', node: schema ? schemaNode(schema, doc) : null }
    })

const operationOf = (path: string, method: string, op: Json, pathItem: Json, doc: OpenApiDocument): Operation => {
  const body = isObject(op.requestBody) ? jsonSchemaOf(op.requestBody.content) : null
  const shared = parametersOf(pathItem.parameters, doc)
  const own = parametersOf(op.parameters, doc)
  return {
    id: `${method}-${path}`,
    method: method.toUpperCase(),
    path,
    summary: str(op.summary) ?? '',
    description: str(op.description) ?? '',
    auth: !(Array.isArray(op.security) && op.security.length === 0),
    parameters: [...shared.filter((param) => !own.some((mine) => mine.name === param.name)), ...own],
    request: body ? schemaNode(body, doc) : null,
    responses: responsesOf(op.responses, doc),
  }
}

/** Operations grouped by their first tag: declared tags first, in order, then the others, untagged last. */
export const referenceGroups = (doc: OpenApiDocument): readonly ReferenceGroup[] => {
  const operations = Object.entries(doc.paths)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .flatMap(([path, item]) =>
      METHODS.filter((method) => isObject(item[method])).map((method) => {
        const op = item[method] as Json
        const tags = Array.isArray(op.tags) ? op.tags.map(String) : []
        return { tag: tags[0] ?? null, operation: operationOf(path, method, op, item, doc) }
      }),
    )
  const declared = doc.tags.map((tag) => tag.name)
  const extra = [...new Set(operations.map((entry) => entry.tag).filter((tag): tag is string => tag !== null && !declared.includes(tag)))].toSorted()
  return [...declared, ...extra, null]
    .map((tag) => ({
      tag,
      description: doc.tags.find((item) => item.name === tag)?.description ?? null,
      operations: operations.filter((entry) => entry.tag === tag).map((entry) => entry.operation),
    }))
    .filter((group) => group.operations.length > 0)
}

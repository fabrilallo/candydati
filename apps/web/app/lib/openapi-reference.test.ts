import { describe, expect, it } from 'vitest'
import { openApiSpec } from '~~/test/fixtures/phase6-fixtures'
import { openApiDocumentSchema, referenceGroups, schemaNode, type OpenApiDocument } from './openapi-reference'

const doc: OpenApiDocument = openApiDocumentSchema.parse(openApiSpec)

describe('referenceGroups', () => {
  it('groups operations by tag in the declared order, untagged last', () => {
    const groups = referenceGroups(doc)
    expect(groups.map((group) => group.tag)).toEqual(['jobs', 'pipeline', null])
    expect(groups[0]?.description).toBe('Annunci')
    expect(groups[0]?.operations.map((op) => `${op.method} ${op.path}`)).toEqual(['GET /api/v1/jobs', 'POST /api/v1/jobs'])
  })

  it('reads summary, parameters (path level too), body and responses', () => {
    const [jobs, pipeline, other] = referenceGroups(doc)
    const list = jobs?.operations[0]
    expect(list).toMatchObject({ id: 'get-/api/v1/jobs', summary: 'List jobs', auth: true, request: null })
    expect(list?.parameters).toEqual([{ name: 'status', in: 'query', required: false, node: expect.objectContaining({ label: 'string', enumValues: ['draft', 'published', 'closed'] }) }])
    expect(list?.responses[0]).toMatchObject({ status: '200', description: 'OK', node: { label: 'Job[]' } })
    const create = jobs?.operations[1]
    expect(create?.request).toMatchObject({ label: 'JobContent', refName: 'JobContent' })
    expect(pipeline?.operations[0]?.parameters.map((p) => p.name)).toEqual(['id'])
    expect(other?.operations[0]).toMatchObject({ path: '/api/v1/careers/{org}', auth: false })
  })

  it('returns nothing for an empty spec', () => {
    expect(referenceGroups(openApiDocumentSchema.parse({ openapi: '3.1.0', paths: {} }))).toEqual([])
  })
})

describe('schemaNode', () => {
  it('resolves references into fields with required flags', () => {
    const node = schemaNode({ $ref: '#/components/schemas/Job' }, doc)
    expect(node.label).toBe('Job')
    expect(node.fields.map((field) => [field.name, field.required])).toEqual([
      ['id', true],
      ['content', false],
    ])
    const content = node.fields[1]?.node
    expect(content?.fields.map((field) => field.name)).toEqual(['title', 'salary', 'responsibilities'])
    expect(content?.fields[0]?.node).toMatchObject({ label: 'string', description: 'Titolo' })
    expect(content?.fields[2]?.node.label).toBe('string[]')
  })

  it('stops on cycles and unknown references', () => {
    const cyclic = openApiDocumentSchema.parse({
      openapi: '3.1.0',
      paths: {},
      components: { schemas: { Node: { type: 'object', properties: { child: { $ref: '#/components/schemas/Node' } } } } },
    })
    const node = schemaNode({ $ref: '#/components/schemas/Node' }, cyclic)
    expect(node.fields[0]?.node).toMatchObject({ label: 'Node', fields: [] })
    expect(schemaNode({ $ref: '#/components/schemas/Missing' }, cyclic)).toMatchObject({ label: 'Missing', fields: [] })
  })

  it('labels unions, nullables, consts and merges allOf', () => {
    expect(schemaNode({ anyOf: [{ type: 'string' }, { type: 'null' }] }, doc).label).toBe('string | null')
    expect(schemaNode({ type: ['integer', 'null'] }, doc).label).toBe('integer | null')
    expect(schemaNode({ const: true }, doc).label).toBe('true')
    expect(schemaNode({}, doc).label).toBe('any')
    const merged = schemaNode({ allOf: [{ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] }, { properties: { b: { type: 'number' } } }] }, doc)
    expect(merged.fields.map((field) => [field.name, field.required])).toEqual([
      ['a', true],
      ['b', false],
    ])
  })

  it('stops at a maximum depth', () => {
    const deep = { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'object', properties: { c: { type: 'object', properties: { d: { type: 'object', properties: { e: { type: 'string' } } } } } } } } } } }
    const a = schemaNode(deep, doc).fields[0]?.node
    const d = a?.fields[0]?.node.fields[0]?.node.fields[0]?.node
    expect(d).toMatchObject({ label: 'object', fields: [] })
  })
})

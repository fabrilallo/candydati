/**
 * A tiny JSON Schema validator: only the keywords that `migration-package.v1.json` uses, nothing else. An unknown
 * keyword throws instead of being ignored, so a schema that grows past this subset cannot be silently under-checked.
 */

const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'default', 'format']);
const KNOWN = new Set([
  ...ANNOTATIONS,
  'type', 'const', 'enum', 'required', 'properties', 'additionalProperties', 'items',
  'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
]);

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const TYPES = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  object: isObject,
  array: Array.isArray,
};

const describe = (value) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

/** Formats a path as `applications[3].stageRef`. */
export function formatPath(path) {
  return path.reduce((text, part) => (typeof part === 'number' ? `${text}[${part}]` : text === '' ? part : `${text}.${part}`), '') || '(root)';
}

const patternCache = new Map();
function regex(pattern) {
  if (!patternCache.has(pattern)) patternCache.set(pattern, new RegExp(pattern, 'u'));
  return patternCache.get(pattern);
}

function checkString(schema, value, fail) {
  if (schema.minLength !== undefined && value.length < schema.minLength) fail(`must have at least ${schema.minLength} character(s)`);
  if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(`must have at most ${schema.maxLength} characters`);
  if (schema.pattern !== undefined && !regex(schema.pattern).test(value)) {
    fail(schema.format === 'date-time' ? 'must be an ISO 8601 date and time with a time zone, e.g. 2024-03-01T09:30:00Z' : `must match the pattern ${schema.pattern}`);
  }
  if (schema.format === 'uri') {
    try {
      new URL(value);
    } catch {
      fail('must be a valid URL');
    }
  }
}

function checkNumber(schema, value, fail) {
  if (schema.minimum !== undefined && value < schema.minimum) fail(`must be at least ${schema.minimum}`);
  if (schema.maximum !== undefined && value > schema.maximum) fail(`must be at most ${schema.maximum}`);
  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) fail(`must be greater than ${schema.exclusiveMinimum}`);
  if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) fail(`must be less than ${schema.exclusiveMaximum}`);
}

function walk(schema, value, path, issues) {
  for (const key of Object.keys(schema)) {
    if (!KNOWN.has(key)) throw new Error(`Unsupported JSON Schema keyword "${key}" at ${formatPath(path)}: update the validator.`);
  }
  const fail = (message) => issues.push({ path, message });
  if (schema.type !== undefined && !TYPES[schema.type](value)) {
    fail(`must be of type ${schema.type}, found ${describe(value)}`);
    return;
  }
  if ('const' in schema && value !== schema.const) fail(`must be ${JSON.stringify(schema.const)}`);
  if (schema.enum !== undefined && !schema.enum.includes(value)) fail(`must be one of: ${schema.enum.join(', ')}`);
  if (typeof value === 'string') checkString(schema, value, fail);
  if (typeof value === 'number') checkNumber(schema, value, fail);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`must have at least ${schema.minItems} item(s)`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`must have at most ${schema.maxItems} items`);
    if (schema.items !== undefined) value.forEach((item, index) => walk(schema.items, item, [...path, index], issues));
  }
  if (isObject(value)) walkObject(schema, value, path, issues);
}

function walkObject(schema, value, path, issues) {
  const properties = schema.properties ?? {};
  for (const name of schema.required ?? []) {
    if (!(name in value)) issues.push({ path: [...path, name], message: 'is required' });
  }
  for (const [name, child] of Object.entries(value)) {
    if (name in properties) walk(properties[name], child, [...path, name], issues);
    else if (schema.additionalProperties === false) {
      issues.push({ path: [...path, name], message: 'is not allowed: the format has no such field (unknown fields are refused, never ignored)' });
    }
  }
}

/** Validates `value` against `schema`; returns a list of `{ path, message }` (empty when valid). */
export function validateSchema(schema, value) {
  const issues = [];
  walk(schema, value, [], issues);
  return issues;
}

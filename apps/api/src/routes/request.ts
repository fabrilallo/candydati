import type { FastifyRequest } from 'fastify';

type Fields = Readonly<Record<string, unknown>>;

const asFields = (value: unknown): Fields => (typeof value === 'object' && value !== null ? (value as Fields) : {});

export const paramsOf = (request: FastifyRequest): Fields => asFields(request.params);
export const bodyOf = (request: FastifyRequest): Fields => asFields(request.body);
export const queryOf = (request: FastifyRequest): Fields => asFields(request.query);

/** A path parameter as a string, so the use case validates the rest. */
export const paramOf = (request: FastifyRequest, name: string): string => String(paramsOf(request)[name] ?? '');

/** Query strings are text: numbers and booleans are converted here, anything else stays text and fails validation. */
export const asNumber = (value: unknown): unknown => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value);
export const asBoolean = (value: unknown): unknown => (value === 'true' ? true : value === 'false' ? false : value);

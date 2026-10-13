import { describe, expect, it } from 'vitest';
import { bearerOf, hasBearer } from './bearer.js';

describe('bearerOf', () => {
  it.each([
    ['Bearer abc', 'abc'],
    ['bearer abc', 'abc'],
    ['Bearer   abc  ', 'abc'],
    ['Bearer ', ''],
    ['Bearer', ''],
    ['Bearer a b', ''],
  ])('reads %o as %o', (header, expected) => {
    expect(bearerOf({ authorization: header })).toBe(expected);
  });

  it.each([[undefined], ['Basic abc'], ['Token abc']])('is null (not a bearer attempt) for %o', (header) => {
    expect(bearerOf(header === undefined ? {} : { authorization: header })).toBeNull();
    expect(hasBearer(header === undefined ? {} : { authorization: header })).toBe(false);
  });
});

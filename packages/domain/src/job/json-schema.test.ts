import { describe, expect, it } from 'vitest';
import { jobContentJsonSchema, JOB_CONTENT_SCHEMA_ID } from './json-schema.js';

describe('jobContentJsonSchema', () => {
  it('is the versioned job-content schema with an id and a title', () => {
    const schema = jobContentJsonSchema();
    expect(schema.$id).toBe('job-content.v1');
    expect(JOB_CONTENT_SCHEMA_ID).toBe('job-content.v1');
    expect(typeof schema.title).toBe('string');
    expect(schema.$schema).toEqual(expect.stringContaining('json-schema.org'));
  });

  it('describes the input shape: only the title is required', () => {
    const schema = jobContentJsonSchema() as { required?: string[]; properties: Record<string, unknown> };
    expect(schema.required).toEqual(['title']);
    expect(schema.properties).toHaveProperty('role');
    expect(schema.properties).toHaveProperty('process');
  });

  it('describes the optional stage id and title', () => {
    const schema = jobContentJsonSchema() as { properties: { process: { items: { properties: Record<string, unknown>; required: string[] } } } };
    const stage = schema.properties.process.items;
    expect(stage.properties).toHaveProperty('id');
    expect(stage.properties).toHaveProperty('title');
    expect(stage.required).not.toContain('id');
    expect(stage.required).not.toContain('title');
  });

  it('is deterministic across calls', () => {
    expect(JSON.stringify(jobContentJsonSchema())).toBe(JSON.stringify(jobContentJsonSchema()));
  });

  it('describes the optional employment terms and the protected-categories flag', () => {
    const schema = jobContentJsonSchema() as { required?: string[]; properties: Record<string, { properties?: Record<string, unknown> }> };
    expect(schema.required).toEqual(['title']);
    expect(Object.keys(schema.properties.employment?.properties ?? {})).toEqual(
      expect.arrayContaining(['ccnl', 'level', 'monthlyPayments', 'mealVoucher', 'welfareAnnual', 'bonus', 'extraBenefits']),
    );
    expect(schema.properties).toHaveProperty('protectedCategories');
  });
});

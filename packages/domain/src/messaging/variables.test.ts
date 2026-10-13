import { describe, expect, it } from 'vitest';
import { findUnknownVariables, renderTemplate, TEMPLATE_VARIABLES, type TemplateValues } from './variables.js';

const values: TemplateValues = {
  'candidate.firstName': 'Ada',
  'candidate.lastName': 'Lovelace',
  'job.title': 'Backend Developer',
  'organization.name': 'Acme',
  'stage.name': 'Colloquio',
  'job.responseDays': '5',
  'job.url': 'https://example.com/careers/acme/backend',
};

describe('renderTemplate', () => {
  it('replaces every known variable, with or without spaces', () => {
    const text = TEMPLATE_VARIABLES.map((name) => `{{ ${name} }}|{{${name}}}`).join('\n');
    const { text: out, unknownVariables } = renderTemplate(text, values);
    expect(unknownVariables).toEqual([]);
    expect(out).not.toContain('{{');
    expect(out).toContain('Ada|Ada');
    expect(out).toContain('5|5');
  });

  it('leaves unknown variables visible and reports them once', () => {
    const result = renderTemplate('Hi {{ candidate.firstName }} {{ candidate.email }} {{candidate.email}} {{ constructor }}', values);
    expect(result.text).toBe('Hi Ada {{ candidate.email }} {{candidate.email}} {{ constructor }}');
    expect(result.unknownVariables).toEqual(['candidate.email', 'constructor']);
  });

  it('never evaluates anything', () => {
    const result = renderTemplate('{{ 1 + 1 }} {{ job.title.toUpperCase() }} ${job.title} {{{ job.title }}}', values);
    expect(result.text).toContain('{{ 1 + 1 }}');
    expect(result.text).toContain('${job.title}');
    expect(result.unknownVariables).toContain('1 + 1');
    expect(result.unknownVariables).toContain('job.title.toUpperCase()');
  });

  it('inserts values literally, even when they look like placeholders or replacement patterns', () => {
    const tricky = { ...values, 'candidate.firstName': '$& {{ job.title }} $1' };
    const result = renderTemplate('Hi {{ candidate.firstName }}', tricky);
    expect(result.text).toBe('Hi $& {{ job.title }} $1');
    expect(result.unknownVariables).toEqual([]);
  });

  it('findUnknownVariables merges several texts', () => {
    expect(findUnknownVariables('{{ a }} {{ job.title }}', '{{ a }} {{ b }}')).toEqual(['a', 'b']);
  });
});

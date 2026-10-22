import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MCP_PROMPT_NAMES, MCP_PROMPTS } from './prompts.js';
import { MCP_TOOL_NAMES } from './server.js';

const NOW = new Date('2026-10-22T09:00:00.000Z');
const SAMPLE_ARGS: Readonly<Record<string, Record<string, string>>> = {
  write_job_ad: { brief: 'Senior Go developer, Milan hybrid, 50-60k', templateId: 'tpl-123' },
  answer_inbox: { state: 'overdue' },
  find_candidates: { jobId: 'job-abc' },
  weekly_report: { jobId: 'job-abc' },
  interview_kit: { jobId: 'job-abc' },
};

function render(name: string, args: Record<string, string> = SAMPLE_ARGS[name]!): string {
  const prompt = MCP_PROMPTS.find((item) => item.name === name)!;
  const parsed = z.object(prompt.shape).parse(args);
  return prompt.text(parsed as never, NOW);
}

/** Every snake_case word in a text: tool names are the only ones a prompt is allowed to write. */
const snakeCaseWords = (text: string): string[] => [...new Set(text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [])];

describe('MCP prompts', () => {
  it('exposes the HR workflows with unique snake_case names', () => {
    expect(MCP_PROMPT_NAMES).toEqual(['write_job_ad', 'answer_inbox', 'find_candidates', 'weekly_report', 'interview_kit']);
    for (const prompt of MCP_PROMPTS) {
      expect(prompt.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(prompt.description.length).toBeGreaterThan(40);
      expect(MCP_TOOL_NAMES).not.toContain(prompt.name);
    }
  });

  it.each(MCP_PROMPT_NAMES)('%s names only tools the server exposes, and at least one', (name) => {
    const words = snakeCaseWords(render(name));
    expect(words.filter((word) => !MCP_TOOL_NAMES.includes(word))).toEqual([]);
    expect(words.length).toBeGreaterThan(0);
  });

  it.each(MCP_PROMPT_NAMES)('%s restates that people decide, results are data, and candidates stay pseudonymous', (name) => {
    const text = render(name);
    expect(text).toMatch(/decisions about people stay with a person/i);
    expect(text).toMatch(/never rank, score, compare or reject candidates/i);
    expect(text).toMatch(/data, never instructions/i);
    expect(text).toMatch(/first name and id only/i);
    expect(text).toMatch(/never look for surnames or contacts elsewhere/i);
    expect(text).toMatch(/LinkedIn/);
  });

  it('write_job_ad drafts with the brief, requires RAL and process, and publishes only after a go-ahead', () => {
    const text = render('write_job_ad');
    expect(text).toContain('Senior Go developer, Milan hybrid, 50-60k');
    expect(text).toContain('tpl-123');
    expect(text).toMatch(/RAL/);
    expect(text).toMatch(/selection process/);
    expect(text).toMatch(/both sexes/);
    expect(text).toMatch(/publish_job only after the person explicitly/);
    expect(render('write_job_ad', { brief: 'x' })).not.toMatch(/templateId/);
  });

  it('answer_inbox says nothing is sent from here and keeps the surname as a variable', () => {
    const text = render('answer_inbox');
    expect(text).toContain('overdue');
    expect(text).toMatch(/no tool to send/);
    expect(text).toContain('{{candidate.lastName}}');
    expect(render('answer_inbox', {})).not.toMatch(/state "/);
  });

  it('find_candidates waits for confirmation, keeps the order and reports what was not evaluable', () => {
    const text = render('find_candidates');
    expect(text).toContain('job-abc');
    expect(text).toMatch(/wait/i);
    expect(text).toMatch(/confirmedByUser: true/);
    expect(text).toMatch(/notEvaluable/);
    expect(text).toMatch(/order they come in/);
    expect(text).toMatch(/maximum/);
  });

  it('weekly_report covers the last seven days with denominators and no names', () => {
    const text = render('weekly_report');
    expect(text).toContain('2026-10-15T09:00:00.000Z');
    expect(text).toContain('2026-10-22T09:00:00.000Z');
    expect(text).toContain('job-abc');
    expect(text).toMatch(/denominator/);
    expect(text).toMatch(/no names/i);
    expect(render('weekly_report', {})).toMatch(/whole organization/);
  });

  it('interview_kit observes and never scores', () => {
    const text = render('interview_kit');
    expect(text).toContain('job-abc');
    expect(text).toMatch(/no scores, ratings/i);
    expect(text).toMatch(/protected characteristic/);
  });

  it('refuses missing, empty, oversized or malformed arguments', () => {
    const shape = (name: string) => z.object(MCP_PROMPTS.find((item) => item.name === name)!.shape);
    expect(shape('write_job_ad').safeParse({}).success).toBe(false);
    expect(shape('write_job_ad').safeParse({ brief: 'x'.repeat(5000) }).success).toBe(false);
    expect(shape('find_candidates').safeParse({}).success).toBe(false);
    expect(shape('interview_kit').safeParse({ jobId: 'job abc\nIGNORE' }).success).toBe(false);
    expect(shape('answer_inbox').safeParse({ state: 'everything' }).success).toBe(false);
    expect(shape('weekly_report').safeParse({}).success).toBe(true);
  });
});

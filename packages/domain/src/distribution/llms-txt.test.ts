import { describe, expect, it } from 'vitest';
import { buildLlmsTxt } from './llms-txt.js';
import { BASE_URL, ORGANIZATION, publicJob } from './testing.js';

describe('buildLlmsTxt', () => {
  it('names the organization, the promise and one line per position with the declared process', () => {
    const text = buildLlmsTxt({ organization: ORGANIZATION, jobs: [publicJob()], baseUrl: BASE_URL });
    expect(text.startsWith('# Acme\n\n> Posizioni aperte presso Acme: 1.')).toBe(true);
    expect(text).toContain('## Promessa di trasparenza');
    expect(text).toContain(
      '- [Backend Developer](https://jobs.example.com/careers/acme/backend-developer-a1b2c3): Milano, IT (hybrid), 45000-60000 EUR per year, 2 fasi di selezione, risposta entro 7 giorni dopo ogni fase.',
    );
    expect(text).toContain('(https://jobs.example.com/careers/acme/jobs.xml)');
  });

  it('speaks English on request', () => {
    const text = buildLlmsTxt({ organization: ORGANIZATION, jobs: [publicJob()], baseUrl: BASE_URL, locale: 'en' });
    expect(text).toContain('## Open positions');
    expect(text).toContain('2 selection stages, answer within 7 days after each stage.');
  });

  it('says so when nothing is open and keeps data on one line without markdown brackets', () => {
    expect(buildLlmsTxt({ organization: ORGANIZATION, jobs: [], baseUrl: BASE_URL })).toContain('Al momento non ci sono posizioni aperte.');
    const text = buildLlmsTxt({ organization: { ...ORGANIZATION, name: 'A\ncme [x]' }, jobs: [publicJob({ title: 'Dev [senior]\n# Heading' })], baseUrl: BASE_URL });
    expect(text.split('\n')[0]).toBe('# A cme x');
    expect(text).toContain('- [Dev senior # Heading](');
  });

  it('adds one short line with the CCNL and the monthly payments when the ad has them', () => {
    const jobs = [publicJob({ employment: { ccnl: 'commercio_terziario', level: '5° livello', monthlyPayments: 14, welfareAnnual: 900 } })];
    const it = buildLlmsTxt({ organization: ORGANIZATION, jobs, baseUrl: BASE_URL });
    expect(it).toContain('dopo ogni fase, CCNL Commercio e terziario, 5° livello, 14 mensilità.');
    expect(it.split('\n').filter((line) => line.includes('CCNL'))).toHaveLength(1);
    const en = buildLlmsTxt({ organization: ORGANIZATION, jobs, baseUrl: BASE_URL, locale: 'en' });
    expect(en).toContain('after each stage, CCNL Commercio e terziario, 5° livello, 14 monthly payments.');
    expect(buildLlmsTxt({ organization: ORGANIZATION, jobs: [publicJob({ employment: { monthlyPayments: 13 } })], baseUrl: BASE_URL })).toContain('dopo ogni fase, 13 mensilità.');
    expect(buildLlmsTxt({ organization: ORGANIZATION, jobs: [publicJob()], baseUrl: BASE_URL })).not.toContain('CCNL');
  });
});

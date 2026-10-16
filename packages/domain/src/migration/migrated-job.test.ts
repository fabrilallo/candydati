import { describe, expect, it } from 'vitest';
import { migratedJobContent } from './migrated-job.js';

describe('migratedJobContent', () => {
  it('builds a valid job content from the package, with the merged stages and their usual length and conductor', () => {
    const content = migratedJobContent({ title: 'Backend Developer', content: { summary: 'APIs', language: 'en' } }, [
      { type: 'screening_call', title: 'Screening', stageRefs: ['s1', 's2'] },
      { type: 'technical_interview', title: 'Tech', stageRefs: ['s3'] },
    ]);
    expect(content).toMatchObject({ title: 'Backend Developer', summary: 'APIs', language: 'en' });
    expect(content.process).toEqual([
      { type: 'screening_call', title: 'Screening', durationMinutes: 30, conductedBy: 'recruiter' },
      { type: 'technical_interview', title: 'Tech', durationMinutes: 60, conductedBy: 'technical_lead' },
    ]);
  });

  it('defaults what the package leaves out', () => {
    expect(migratedJobContent({ title: 'Designer' }, [])).toMatchObject({ title: 'Designer', language: 'it', process: [], summary: '' });
  });
});

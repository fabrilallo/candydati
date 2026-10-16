import { describe, expect, it } from 'vitest';
import { proposeStageMapping, stageTypeFromName } from './stage-mapping.js';

describe('stageTypeFromName', () => {
  it.each([
    ['Colloquio HR', 'hr_interview'],
    ['HR interview', 'hr_interview'],
    ['Phone screen', 'screening_call'],
    ['Chiamata conoscitiva', 'screening_call'],
    ['Colloquio tecnico', 'technical_interview'],
    ['Technical Interview #2', 'technical_interview'],
    ['Take-home assignment', 'take_home_assignment'],
    ['Esercizio da svolgere a casa', 'take_home_assignment'],
    ['Live coding', 'live_exercise'],
    ['Case study', 'case_study'],
    ['Incontro con il team', 'team_interview'],
    ['Hiring manager interview', 'manager_interview'],
    ['Colloquio finale', 'final_interview'],
    ['Final technical round', 'final_interview'],
    ['Offerta', 'offer'],
    ['  OFFER sent ', 'offer'],
  ] as const)('reads %s as %s', (name, type) => {
    expect(stageTypeFromName(name)).toBe(type);
  });

  it.each(['Applied', 'Nuovi', 'Sourced', 'Assunto'])('finds no type for %s', (name) => {
    expect(stageTypeFromName(name)).toBeNull();
  });

  it('ignores accents and punctuation', () => {
    expect(stageTypeFromName('Colloquio-finále!')).toBe('final_interview');
  });
});

describe('proposeStageMapping', () => {
  it('takes the declared type first, then the name, else other; the title is always the original name', () => {
    const jobs = [
      {
        ref: 'j1',
        stages: [
          { ref: 's1', name: 'Chiacchierata', type: 'screening_call' as const },
          { ref: 's2', name: 'Colloquio tecnico' },
          { ref: 's3', name: 'Applied' },
        ],
      },
    ];
    expect(proposeStageMapping(jobs)).toEqual([
      { jobRef: 'j1', stageRef: 's1', type: 'screening_call', title: 'Chiacchierata' },
      { jobRef: 'j1', stageRef: 's2', type: 'technical_interview', title: 'Colloquio tecnico' },
      { jobRef: 'j1', stageRef: 's3', type: 'other', title: 'Applied' },
    ]);
  });
});

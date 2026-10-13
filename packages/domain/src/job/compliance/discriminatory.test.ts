import { describe, expect, it } from 'vitest';
import { checkCompliance } from './index.js';
import { adContent } from './testing.js';

const blockingRules = (overrides: Record<string, unknown>) => checkCompliance(adContent(overrides)).blocking.map((i) => `${i.path}:${i.rule}`);
const warningRules = (overrides: Record<string, unknown>) => checkCompliance(adContent(overrides)).warnings.map((i) => `${i.path}:${i.rule}`);

describe('discriminatory_requirement: age', () => {
  it.each([
    'Età massima 35 anni',
    'Età compresa tra 25 e 35 anni',
    'Under 30',
    'under30',
    'Max 30 anni',
    'Massimo 28 anni',
    'Entro i 35 anni',
    'Fino a 30 anni',
    'Non oltre i 40 anni',
    'Dai 25 ai 35 anni',
    '25-35 anni',
    '35enne',
    'Nati dopo il 1990',
    'Classe 1995',
    'Over 50, astenersi',
    'Età: 30',
  ])('blocks "%s" in the requirements', (text) => {
    expect(blockingRules({ requirements: { mustHave: [text], niceToHave: [] } })).toContain('requirements.mustHave.0:discriminatory_requirement');
  });

  it('blocks it in the title and the summary too', () => {
    expect(blockingRules({ title: 'Commesso/a Under 30' })).toContain('title:discriminatory_requirement');
    expect(blockingRules({ summary: 'Cerchiamo persone di età massima 35 anni.' })).toContain('summary:discriminatory_requirement');
  });

  it('blocks "giovane" as a must-have only; elsewhere it warns', () => {
    expect(blockingRules({ requirements: { mustHave: ['Giovane e dinamico'], niceToHave: [] } })).toContain('requirements.mustHave.0:discriminatory_requirement');
    expect(blockingRules({ summary: 'Un team giovane.' })).toEqual([]);
    expect(warningRules({ summary: 'Un team giovane.' })).toEqual(['summary:age_proxy']);
    expect(blockingRules({ requirements: { mustHave: ['Go'], niceToHave: ['Giovane'] } })).toEqual([]);
  });

  it.each([
    '3-5 anni di esperienza',
    '10-15 anni di esperienza come project manager',
    'Almeno 5 anni di esperienza',
    'Massimo 10 anni di esperienza',
    'Fino a 15 anni di esperienza',
    'Meno di 30 minuti da Milano',
    'Under 30 minuti di tragitto',
    'Over 100 dipendenti',
    'Oltre i 20 anni di storia',
    'Azienda con 25 anni di storia',
    "Max 40 anni d'esperienza",
    'Una squadra di 15 persone',
    'Retribuzione max 30 mila euro',
    'Età media del team: ottima',
  ])('does not block "%s"', (text) => {
    expect(blockingRules({ requirements: { mustHave: [text], niceToHave: [] } })).toEqual([]);
  });

  it('warns on "neolaureato" and other age proxies, without blocking', () => {
    const overrides = { requirements: { mustHave: ['Neolaureato in informatica'], niceToHave: [] } };
    expect(blockingRules(overrides)).toEqual([]);
    expect(warningRules(overrides)).toEqual(['requirements.mustHave.0:age_proxy']);
    expect(warningRules({ summary: 'Siamo militesenti? No: cerchiamo persone militesenti.' })).toEqual(['summary:age_proxy']);
    expect(warningRules({ summary: 'Cerchiamo nativi digitali.' })).toEqual(['summary:age_proxy']);
    expect(warningRules({ title: 'Junior', summary: 'Anche appena laureati.' })).toEqual(['summary:age_proxy']);
  });

  it('gives an actionable suggestion', () => {
    const [issue] = checkCompliance(adContent({ title: 'Commesso/a Under 30' })).blocking;
    expect(issue?.detail.match).toBe('Under 30');
    expect(issue?.detail.suggestion).toMatch(/età/i);
  });

  it('knows English age limits', () => {
    expect(blockingRules({ language: 'en', summary: 'Maximum age 35.' })).toEqual(['summary:discriminatory_requirement']);
    expect(blockingRules({ language: 'en', title: 'Sales Under 30' })).toEqual(['title:discriminatory_requirement']);
    expect(blockingRules({ language: 'en', requirements: { mustHave: ['Young and dynamic'], niceToHave: [] } })).toEqual(['requirements.mustHave.0:discriminatory_requirement']);
    expect(blockingRules({ language: 'en', summary: '5-10 years of experience, under 30 minutes away.' })).toEqual([]);
    expect(warningRules({ language: 'en', summary: 'Fresh graduates welcome.' })).toEqual(['summary:age_proxy']);
  });
});

describe('discriminatory_requirement: other grounds', () => {
  const blocked = (text: string) => blockingRules({ summary: text }).includes('summary:discriminatory_requirement');

  it.each([
    'Bella presenza',
    'Richiesta buona presenza',
    'Ottima presenza e bell\'aspetto',
    'Aspetto curato',
    'Altezza minima 170 cm',
    'Cittadinanza italiana',
    'Solo italiani',
    'Di razza bianca',
    'Stranieri esclusi',
    'Nubile',
    'Celibe o nubile',
    'Stato civile libero',
    'Senza figli',
    'Libera da impegni familiari',
    'Non in gravidanza',
    'Foto obbligatoria',
    'Allegare foto al CV',
    'CV con foto',
    'Di fede cattolica',
    'Praticante cattolico',
    'Non iscritto ai sindacati',
    'Opinioni politiche allineate',
    'Sana e robusta costituzione',
    'Ottime condizioni di salute',
    'Esente da malattie',
  ])('blocks "%s"', (text) => {
    expect(blocked(text)).toBe(true);
  });

  it.each([
    'Presenza in sede 3 giorni a settimana',
    'Ottima presenza online',
    'Buona presenza sui social',
    'Laureato presso l\'Università Cattolica',
    'Insegnante di religione cattolica',
    'Autorizzazione a lavorare in Italia',
    'Cittadinanza UE o permesso di soggiorno',
    'Single page application in React',
    'Conoscenza delle foto digitali e del ritocco foto',
    'Salute finanziaria dell\'azienda ottima',
    'Altezza dei carichi da sollevare: 2 metri',
    'Razza canina: nessuna',
    'Fede nel progetto',
  ])('does not block "%s"', (text) => {
    expect(blocked(text)).toBe(false);
  });

  it('warns on "madrelingua italiana" without blocking', () => {
    expect(blockingRules({ summary: 'Madrelingua italiana.' })).toEqual([]);
    expect(warningRules({ summary: 'Madrelingua italiana.' })).toEqual(['summary:nationality_proxy']);
    expect(warningRules({ summary: 'Madrelingua inglese.' })).toEqual([]);
  });

  it('checks every free-text field', () => {
    expect(blockingRules({ culture: 'Bella presenza' })).toContain('culture:discriminatory_requirement');
    expect(blockingRules({ benefits: ['Foto obbligatoria'] })).toContain('benefits.0:discriminatory_requirement');
    expect(
      blockingRules({ process: [{ type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter', note: 'Cittadinanza italiana' }] }),
    ).toContain('process.0.note:discriminatory_requirement');
  });

  it('reports each distinct match once and several fields separately', () => {
    const issues = checkCompliance(adContent({ summary: 'Bella presenza. Bella presenza. Under 30.', culture: 'Nubile' })).blocking;
    expect(issues.map((i) => i.detail.match).sort()).toEqual(['Bella presenza', 'Nubile', 'Under 30']);
    expect(issues.filter((i) => i.detail.match === 'Bella presenza')).toHaveLength(1);
    expect(issues.map((i) => i.path)).toContain('culture');
  });

  it('knows English wording', () => {
    expect(blockingRules({ language: 'en', summary: 'Good-looking candidates only.' })).toEqual(['summary:discriminatory_requirement']);
    expect(blockingRules({ language: 'en', summary: 'Photo required. Unmarried.' })).toEqual(['summary:discriminatory_requirement', 'summary:discriminatory_requirement']);
    expect(blockingRules({ language: 'en', summary: 'Single page app. Photo editing skills.' })).toEqual([]);
  });
});

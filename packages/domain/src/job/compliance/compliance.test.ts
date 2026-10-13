import { describe, expect, it } from 'vitest';
import { checkCompliance, complianceWarnings } from './index.js';
import { adContent } from './testing.js';

const blockingRules = (overrides: Record<string, unknown>) => checkCompliance(adContent(overrides)).blocking.map((i) => `${i.path}:${i.rule}`);
const warningRules = (overrides: Record<string, unknown>) => checkCompliance(adContent(overrides)).warnings.map((i) => `${i.path}:${i.rule}`);
const titleBlocks = (title: string) => blockingRules({ title }).includes('title:gender_exclusive_title');

describe('checkCompliance: a clean ad', () => {
  it('has no findings', () => {
    expect(checkCompliance(adContent())).toEqual({ blocking: [], warnings: [] });
    expect(complianceWarnings(adContent())).toEqual([]);
  });
});

describe('gender_exclusive_title', () => {
  it.each([
    'Sviluppatore Backend',
    'Programmatore PHP',
    'Impiegata amministrativa',
    'Impiegato amministrativo',
    'Addetto vendite',
    'Operaio specializzato',
    'Magazziniere',
    'Cameriere di sala',
    'Cuoco',
    'Infermiere professionale',
    'Ingegnere meccanico',
    'Direttore commerciale',
    'Segretaria di direzione',
    'Sviluppatori Java',
    'Tecnico informatico',
    'Senior Tecnico di laboratorio',
    'SVILUPPATORE FRONTEND',
    'Sviluppatrice Frontend',
    'Addetti alle vendite',
  ])('blocks %s', (title) => {
    expect(titleBlocks(title)).toBe(true);
  });

  it.each([
    'Sviluppatore/trice Backend',
    'Sviluppatore/Sviluppatrice Backend',
    'Sviluppatore (m/f)',
    'Sviluppatore (M/F)',
    'Sviluppatore m/f/x',
    'Sviluppatore F/M',
    'Sviluppatore (f/m/d)',
    'Sviluppatore M/F/D',
    'Addetto/a vendite',
    'Addetto/a alle vendite',
    'Impiegato/a amministrativo/a',
    'Impiegata/o amministrativa',
    'Operaio (a)',
    'Direttore/Direttrice commerciale',
    'Direttore/trice commerciale',
    'Cuoco/a',
    'Sviluppator* Backend',
    'Sviluppatore o sviluppatrice',
    'Magazziniere - uomo/donna',
    'Operaio ambosessi',
    'Operaio, entrambi i sessi',
    'Infermiere L. 903/77',
  ])('accepts %s', (title) => {
    expect(titleBlocks(title)).toBe(false);
  });

  it.each([
    'Backend Developer',
    'Analista funzionale',
    'Consulente SAP',
    'Responsabile acquisti',
    'Specialista SEO',
    'Project Manager',
    'UX Designer',
    'Assistente alla direzione',
    'Docente di matematica',
    'Insegnante di sostegno',
    'Giornalista freelance',
    'Farmacista senior',
    'Dentista',
    'Receptionist',
    'Progettista meccanico',
    'Sviluppo software',
    'Persona dedicata al magazzino',
  ])('lets neutral wording pass: %s', (title) => {
    expect(titleBlocks(title)).toBe(false);
  });

  it('does not match inside longer words', () => {
    expect(titleBlocks('Operaiolo')).toBe(false);
    expect(titleBlocks('Magazzinieristica')).toBe(false);
    expect(titleBlocks('Cuocolo')).toBe(false);
  });

  it('skips a noun that is not the role (department, preposition)', () => {
    expect(titleBlocks('Responsabile ufficio tecnico')).toBe(false);
    expect(titleBlocks('Responsabile supporto tecnico')).toBe(false);
    expect(titleBlocks('Responsabile degli addetti')).toBe(false);
    expect(titleBlocks('Gestione commesse clienti')).toBe(false);
    expect(titleBlocks('Specialista tecnica di prodotto')).toBe(false);
  });

  it('quotes the offending noun and suggests the slash form', () => {
    const [issue] = checkCompliance(adContent({ title: 'Sviluppatore Backend' })).blocking;
    expect(issue).toEqual({
      path: 'title',
      rule: 'gender_exclusive_title',
      detail: { match: 'Sviluppatore', suggestion: 'Sviluppatore/trice Backend' },
    });
    expect(checkCompliance(adContent({ title: 'Addetto vendite' })).blocking[0]?.detail.suggestion).toBe('Addetto/a vendite');
    expect(checkCompliance(adContent({ title: 'Direttore commerciale' })).blocking[0]?.detail.suggestion).toBe('Direttore/trice commerciale');
  });

  it('suggests (m/f) for feminine-only and plural titles', () => {
    expect(checkCompliance(adContent({ title: 'Impiegata amministrativa' })).blocking[0]?.detail).toEqual({
      match: 'Impiegata',
      suggestion: 'Impiegata amministrativa (m/f)',
    });
    expect(checkCompliance(adContent({ title: 'Sviluppatori Java' })).blocking[0]?.detail.suggestion).toBe('Sviluppatori Java (m/f)');
  });

  it('applies the suggestion: the fixed title passes', () => {
    for (const title of ['Sviluppatore Backend', 'Impiegata amministrativa', 'Addetto vendite', 'Sviluppatori Java']) {
      const fixed = checkCompliance(adContent({ title })).blocking[0]?.detail.suggestion ?? '';
      expect(titleBlocks(fixed)).toBe(false);
    }
  });

  it('is accent and case insensitive', () => {
    expect(titleBlocks('SEGRETARIO')).toBe(true);
    expect(titleBlocks('ÍMPIEGATO')).toBe(true);
    expect(titleBlocks('impiegato')).toBe(true);
  });

  it('does not apply to English ads', () => {
    expect(blockingRules({ language: 'en', title: 'Sviluppatore Backend' })).toEqual([]);
  });

  it('is only about the title: a masculine noun in the body is a warning at most', () => {
    expect(blockingRules({ summary: 'Cerchiamo uno sviluppatore esperto.' })).toEqual([]);
  });

  it('blocks publication through checkPublishable', async () => {
    const { checkPublishable } = await import('../content.js');
    const issues = checkPublishable(adContent({ title: 'Sviluppatore Backend' })).filter((i) => i.rule === 'gender_exclusive_title');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.detail?.match).toBe('Sviluppatore');
  });
});

describe('gender_requirement', () => {
  it.each([
    ['title', 'Cercasi ragazza per reception'],
    ['title', 'Ragazza per reception (m/f)'],
    ['summary', 'Cerchiamo una ragazza dinamica per il nostro negozio.'],
    ['summary', 'Cerchiamo un ragazzo con voglia di imparare.'],
    ['summary', 'Cercasi signorina per segreteria.'],
    ['summary', 'Posizione riservata a donne.'],
    ['summary', 'Solo uomini.'],
    ['summary', 'Selezioniamo esclusivamente donne.'],
    ['summary', 'Sesso: femminile'],
    ['summary', 'Candidato di sesso maschile'],
    ['summary', 'Preferibilmente donna.'],
    ['summary', 'Figura femminile'],
    ['summary', 'Candidata donna'],
  ])('blocks "%s": %s', (path, text) => {
    expect(blockingRules({ [path]: text }).some((r) => r === `${path}:gender_requirement`)).toBe(true);
  });

  it('checks requirements and responsibilities with their index', () => {
    expect(blockingRules({ requirements: { mustHave: ['Patente B', 'Solo donne'], niceToHave: [] } })).toContain('requirements.mustHave.1:gender_requirement');
    expect(blockingRules({ responsibilities: ['a', 'b', 'Cercasi ragazza'] })).toContain('responsibilities.2:gender_requirement');
  });

  it.each(['Cerchiamo uomini e donne motivati.', 'Cercasi uomo/donna.', 'Cerchiamo ragazzi e ragazze.', 'Cerchiamo una donna o un uomo.'])(
    'does not block an inclusive request: %s',
    (summary) => {
      expect(blockingRules({ summary })).toEqual([]);
    },
  );

  it('does not trip on "donna" or "uomo" as part of other words', () => {
    expect(blockingRules({ summary: 'Il nostro uomo-macchina non esiste. Madonna di Campiglio.' })).toEqual([]);
  });

  it('blocks English explicit gender requests', () => {
    expect(blockingRules({ language: 'en', summary: 'Females only.' })).toEqual(['summary:gender_requirement']);
    expect(blockingRules({ language: 'en', title: 'Receptionist', summary: 'We are looking for a young girl.' })).toContain('summary:gender_requirement');
  });
});

describe('protected_categories_wording', () => {
  it('warns on the loose wording and offers the correct sentence', () => {
    const [issue] = checkCompliance(adContent({ title: 'Impiegato/a. Categorie protette L.68' })).warnings;
    expect(issue?.rule).toBe('protected_categories_wording');
    expect(issue?.detail.match.toLowerCase()).toBe('categorie protette');
    expect(issue?.detail.suggestion).toContain('collocamento mirato ai sensi della L. 68/99');
  });

  it.each(['Categorie protette', 'Riservato a invalidi', 'Persone con handicap', 'Legge 68', 'Appartenenti alle categorie protette L.68', 'Collocamento mirato'])(
    'warns on "%s"',
    (summary) => {
      expect(warningRules({ summary })).toEqual(['summary:protected_categories_wording']);
    },
  );

  it.each([
    'Iscritti alle liste del collocamento mirato ai sensi della L. 68/99',
    'Aperto anche agli iscritti al collocamento mirato (legge 68/1999)',
    'Persone iscritte alle liste di cui alla L. 68/99, collocamento mirato',
  ])('accepts the correct wording: %s', (summary) => {
    expect(warningRules({ summary })).toEqual([]);
  });

  it('is silent when protected categories are not mentioned, and never blocks', () => {
    expect(warningRules({ summary: 'Sconto del 68% sul listino. La 68 è una strada.' })).toEqual([]);
    expect(blockingRules({ summary: 'Categorie protette' })).toEqual([]);
  });

  it('is accepted with the structured flag and no free text', () => {
    expect(checkCompliance(adContent({ protectedCategories: 'also' }))).toEqual({ blocking: [], warnings: [] });
  });
});

describe('gender_masculine_phrasing', () => {
  it.each(['Il candidato ideale ha esperienza.', 'Sarà inserito in un team di cinque persone.', 'Cerchiamo uno sviluppatore esperto.', 'Il nuovo collega lavorerà da remoto.'])(
    'warns on "%s"',
    (summary) => {
      expect(warningRules({ summary })).toEqual(['summary:gender_masculine_phrasing']);
      expect(blockingRules({ summary })).toEqual([]);
    },
  );

  it.each(['Il/la candidato/a ideale ha esperienza.', 'Il candidato/la candidata ideale.', 'Sarà inserito/a in un team.', 'Cerchiamo uno sviluppatore/trice esperto/a.', 'La persona selezionata sarà inserita nel team.'])(
    'accepts inclusive phrasing: %s',
    (summary) => {
      expect(warningRules({ summary })).toEqual([]);
    },
  );

  it('stays quiet when the ad carries an inclusive marker anywhere', () => {
    expect(warningRules({ title: 'Sviluppatore (m/f)', summary: 'Il candidato ideale ha esperienza.' })).toEqual([]);
  });

  it('applies to Italian ads only', () => {
    expect(warningRules({ language: 'en', summary: 'Il candidato ideale.' })).toEqual([]);
  });
});

describe('realistic ads', () => {
  it('passes a well-written Italian ad', () => {
    const content = adContent({
      title: 'Sviluppatore/trice Backend Senior (m/f)',
      summary: 'Siamo una software house di Milano. Lavorerai con persone esperte in un team di otto colleghi.',
      responsibilities: ['Progettare e mantenere le API', 'Scrivere test automatici', 'Partecipare alle code review'],
      requirements: { mustHave: ['5 anni con Node.js', 'Inglese B2'], niceToHave: ['Esperienza con Go'] },
      culture: 'Feedback ogni due settimane.',
      protectedCategories: 'also',
    });
    expect(checkCompliance(content)).toEqual({ blocking: [], warnings: [] });
  });

  it('collects everything wrong with a bad ad in one pass', () => {
    const content = adContent({
      title: 'Cercasi ragazza per reception',
      summary: 'Il candidato ideale è di bella presenza, età massima 30 anni. Categorie protette L.68.',
      requirements: { mustHave: ['Neolaureato in lingue'], niceToHave: [] },
    });
    const { blocking, warnings } = checkCompliance(content);
    expect(blocking.map((i) => i.rule)).toEqual(['gender_requirement', 'discriminatory_requirement', 'discriminatory_requirement']);
    expect(warnings.map((i) => i.rule).sort()).toEqual(['age_proxy', 'gender_masculine_phrasing', 'protected_categories_wording']);
  });

  it('never mutates the content', () => {
    const content = adContent({ title: 'Sviluppatore Backend' });
    const before = structuredClone(content);
    checkCompliance(content);
    expect(content).toEqual(before);
  });
});

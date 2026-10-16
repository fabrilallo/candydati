import { autoMapColumns, normalizeText, type ImportMapping } from '@candydati/domain';

/** The columns this connector reads beyond the ones the import already knows (names, email, phone, notes, tags, file). */
export const INRECRUITING_FIELDS = ['job', 'jobCode', 'stage', 'appliedAt', 'outcome', 'source'] as const;
export type InrecruitingField = (typeof INRECRUITING_FIELDS)[number];

/**
 * ASSUMED header names (Italian and English), compared without case, accents or punctuation. InRecruiting publishes no
 * export format: these are the names an export is most likely to use, and a column can be renamed before upload.
 */
export const INRECRUITING_ALIASES: Readonly<Record<InrecruitingField, readonly string[]>> = {
  job: ['annuncio', 'posizione', 'posizione lavorativa', 'posizione aperta', 'job', 'job title', 'vacancy', 'ricerca', 'offerta', 'offerta di lavoro', 'ruolo', 'titolo annuncio', 'annuncio di lavoro', 'requisition', 'titolo posizione'],
  jobCode: ['codice annuncio', 'codice posizione', 'codice ricerca', 'job code', 'job id', 'job reference', 'requisition id', 'riferimento', 'rif annuncio', 'codice'],
  stage: ['stato', 'fase', 'stage', 'status', 'fase selezione', 'stato candidatura', 'fase candidatura', 'stato selezione', 'step'],
  appliedAt: ['data candidatura', 'data di candidatura', 'applied at', 'application date', 'date applied', 'data', 'data invio', 'data di invio', 'data inserimento', 'data iscrizione'],
  outcome: ['esito', 'esito finale', 'esito selezione', 'outcome', 'final outcome', 'risultato', 'result', 'disposition'],
  source: ['fonte', 'source', 'origine', 'canale', 'provenienza', 'channel', 'origin'],
};

/** A header that looks like a score or a rating: never imported (ADR 0009, decision 3), and reported. */
const SCORE_LIKE = /\b(scores?|scoring|punteggi[oa]?|ratings?|valutazion[ei]|voti?|giudizi[oa]?|ranking|rank|stell[ae]|stars?|grade|gradi?|punti|points?)\b/;

export interface InrecruitingColumns extends Pick<ImportMapping, 'firstName' | 'lastName' | 'fullName' | 'email' | 'phone' | 'notes' | 'tags' | 'file'> {
  readonly job: string | null;
  readonly jobCode: string | null;
  readonly stage: string | null;
  readonly appliedAt: string | null;
  readonly outcome: string | null;
  readonly source: string | null;
}

export interface ColumnDetection {
  readonly columns: InrecruitingColumns;
  /** Headers of score or rating columns, left out on purpose. */
  readonly ignored: readonly string[];
  /** Headers that are neither recognised nor score-like. */
  readonly unrecognized: readonly string[];
  /** What a usable export still lacks: `name` (a full name, or first and last name) and `job`. */
  readonly missing: readonly ('name' | 'job')[];
}

/** The headers a person can rename a column to, for the error and the guide. */
export const EXPECTED_HEADERS = {
  name: ['Nome e cognome', 'Nome + Cognome', 'Full name', 'First name + Last name'],
  job: ['Annuncio', 'Posizione', 'Job', 'Vacancy'],
} as const;

function extraColumns(headers: readonly string[]): Readonly<Record<InrecruitingField, string | null>> {
  const taken = new Set<string>();
  const find = (field: InrecruitingField): string | null => {
    const hit = headers.find((header) => !taken.has(header) && INRECRUITING_ALIASES[field].includes(normalizeText(header)));
    if (hit !== undefined) taken.add(hit);
    return hit ?? null;
  };
  // Order matters: a specific name wins a generic one ("codice annuncio" is the code, not the job).
  const jobCode = find('jobCode');
  const job = find('job');
  const outcome = find('outcome');
  const stage = find('stage');
  return { job, jobCode, stage, appliedAt: find('appliedAt'), outcome, source: find('source') };
}

/** Maps the sheet's headers to the fields above. Pure: only headers are looked at, never a value. */
export function detectColumns(headers: readonly string[]): ColumnDetection {
  const base = autoMapColumns(headers);
  const known = new Set<string>(Object.values(base).filter((value): value is string => value !== null));
  const extra = extraColumns(headers.filter((header) => !known.has(header)));
  for (const value of Object.values(extra)) if (value !== null) known.add(value);
  const rest = headers.filter((header) => !known.has(header));
  const ignored = rest.filter((header) => SCORE_LIKE.test(normalizeText(header)));
  const { linkedin: _linkedin, ...shared } = base;
  const columns: InrecruitingColumns = { ...shared, ...extra };
  const hasName = columns.fullName !== null || (columns.firstName !== null && columns.lastName !== null);
  return {
    columns,
    ignored,
    unrecognized: rest.filter((header) => !ignored.includes(header)),
    missing: [...(hasName ? [] : (['name'] as const)), ...(columns.job === null ? (['job'] as const) : [])],
  };
}

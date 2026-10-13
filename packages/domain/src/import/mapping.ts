import { z } from 'zod';
import { normalizeText } from './names.js';

/** The fields an import can read, each pointing to a column header of the sheet (null: not present). */
export const IMPORT_FIELDS = ['firstName', 'lastName', 'fullName', 'email', 'phone', 'linkedin', 'notes', 'tags', 'file'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

const header = z.string().max(300).nullable();
export const importMappingSchema = z.object({
  firstName: header,
  lastName: header,
  fullName: header,
  email: header,
  phone: header,
  linkedin: header,
  notes: header,
  tags: header,
  /** Column with the name of the CV file the row belongs to. */
  file: header,
});
export type ImportMapping = z.infer<typeof importMappingSchema>;

export const emptyImportMapping = (): ImportMapping => ({
  firstName: null,
  lastName: null,
  fullName: null,
  email: null,
  phone: null,
  linkedin: null,
  notes: null,
  tags: null,
  file: null,
});

/** Normalised header aliases (Italian and English), strongest first. */
const ALIASES: Readonly<Record<Exclude<ImportField, 'firstName'>, readonly string[]>> & { readonly firstName: readonly string[] } = {
  firstName: ['nome', 'first name', 'firstname', 'given name', 'prenome'],
  lastName: ['cognome', 'last name', 'lastname', 'surname', 'family name', 'second name'],
  fullName: ['nome completo', 'nome e cognome', 'cognome e nome', 'full name', 'fullname', 'name', 'candidato', 'candidate', 'nominativo', 'candidate name', 'nome candidato'],
  email: ['email', 'e mail', 'mail', 'posta elettronica', 'indirizzo email', 'email address', 'indirizzo mail', 'email personale', 'email principale'],
  phone: ['telefono', 'tel', 'cellulare', 'cell', 'mobile', 'phone', 'numero di telefono', 'phone number', 'telefono cellulare', 'recapito telefonico', 'numero cellulare'],
  linkedin: ['linkedin', 'profilo linkedin', 'linkedin url', 'linkedin profile', 'url linkedin', 'link linkedin'],
  notes: ['note', 'notes', 'commenti', 'commento', 'comments', 'osservazioni', 'annotazioni', 'feedback', 'note recruiter'],
  tags: ['tag', 'tags', 'etichette', 'etichetta', 'label', 'labels', 'competenze', 'skills', 'categorie'],
  file: ['cv', 'file', 'file cv', 'curriculum', 'allegato', 'allegati', 'attachment', 'attachments', 'resume', 'nome file', 'filename', 'file name', 'files media', 'files and media', 'documento', 'curriculum vitae', 'cv file'],
};

const ORDER: readonly ImportField[] = ['email', 'fullName', 'firstName', 'lastName', 'phone', 'linkedin', 'file', 'tags', 'notes'];

/**
 * Proposes the mapping from the sheet's headers. Each header is used once. A column called just "nome" is the first
 * name when a surname column exists, and the full name otherwise.
 */
export function autoMapColumns(headers: readonly string[]): ImportMapping {
  const normalized = headers.map((original) => ({ original, key: normalizeText(original) }));
  const used = new Set<string>();
  const found: Record<string, string | null> = {};
  for (const field of ORDER) {
    const hit = normalized.find((h) => !used.has(h.original) && ALIASES[field].includes(h.key));
    found[field] = hit?.original ?? null;
    if (hit) used.add(hit.original);
  }
  const mapping: ImportMapping = { ...emptyImportMapping(), ...found };
  if (mapping.firstName !== null && mapping.lastName === null && mapping.fullName === null) {
    // "Nome" alone with no surname column holds the whole name.
    const alone = normalized.find((h) => h.original === mapping.firstName)?.key;
    if (alone === 'nome' || alone === 'name' || alone === 'prenome') return { ...mapping, firstName: null, fullName: mapping.firstName };
  }
  return mapping;
}

/** Headers of the mapping that are not in the sheet: the mapping the user typed is checked against reality. */
export const unknownMappingHeaders = (mapping: ImportMapping, headers: readonly string[]): readonly string[] =>
  IMPORT_FIELDS.flatMap((field) => {
    const value = mapping[field];
    return value !== null && !headers.includes(value) ? [value] : [];
  });

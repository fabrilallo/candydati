import type { PersonIdentifiers } from '../../privacy/pseudonymize.js';

export type CorpusLanguage = 'it' | 'en' | 'fr' | 'de' | 'es';

/** A string that should disappear but still reaches the model today, and why it cannot be removed safely. */
export interface KnownGap {
  readonly text: string;
  readonly reason: string;
}

/**
 * One synthetic CV: invented people, reserved or invented domains and numbers, documented example IBANs.
 * `mustRemove` and `knownGaps` are distinct strings that should not reach a model (for a third party, the surname:
 * the part that identifies them); `mustKeep` must survive pseudonymization.
 */
export interface CorpusCv {
  readonly id: string;
  readonly language: CorpusLanguage;
  readonly firstName: string;
  readonly person: PersonIdentifiers;
  readonly text: string;
  readonly mustRemove: readonly string[];
  readonly mustKeep: readonly string[];
  readonly knownGaps: readonly KnownGap[];
}

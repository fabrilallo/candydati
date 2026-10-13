import type { Locale } from '../../platform/config.js';
import type { SuggestionKind } from './suggestions.js';
import type { ComplianceBlockingRule, ComplianceWarningRule } from './types.js';

export interface Pattern {
  readonly rule: ComplianceBlockingRule | ComplianceWarningRule;
  readonly kind: SuggestionKind;
  readonly locale: Locale;
  /** Matched on folded text (lower-case, no accents). Global. */
  readonly regex: RegExp;
  /** `mustHave`: only in "requirements.mustHave"; `other`: everywhere else. Default: everywhere. */
  readonly scope?: 'mustHave' | 'other';
  /** Text right after a match that cancels it ("uomini e donne" is inclusive). */
  readonly unless?: RegExp;
}

const NOT_EXPERIENCE = String.raw`(?!\s+(?:di|d')\b)`;
const NOT_ONLINE = String.raw`(?!\s+(?:online|sul|sui|in\s+sede|digitale|web|social|in\s+ufficio|fisica))`;
const AND_OTHER_SEX = /^\s*(?:e|ed|o|\/|-)\s*(?:una?\s+)?(?:donn|uomo|uomin|ragazz|signorin|maschi|femmin)/;

const g = (regex: RegExp): RegExp => new RegExp(regex.source, 'g');

const GENDER_WORDS = String.raw`(?:ragazza|ragazzo|ragazze|ragazzi|signorina|signorine|donna|donne|uomo|uomini|maschi|maschio|femmine|femmina)`;

const it = (rule: Pattern['rule'], kind: SuggestionKind, regex: RegExp, extra: Partial<Pattern> = {}): Pattern => ({ rule, kind, locale: 'it', regex: g(regex), ...extra });
const en = (rule: Pattern['rule'], kind: SuggestionKind, regex: RegExp, extra: Partial<Pattern> = {}): Pattern => ({ rule, kind, locale: 'en', regex: g(regex), ...extra });

const GR = 'gender_requirement';
const DR = 'discriminatory_requirement';

export const PATTERNS: readonly Pattern[] = [
  // Explicit gender requirements.
  it(GR, 'gender', new RegExp(String.raw`\b(?:solo|soltanto|esclusivamente|unicamente|riservato\s+(?:a|ai|alle)|riservata\s+(?:a|ai|alle))\s+(?:per\s+)?(?:(?:candidat[oaie]|person[ae])\s+)?(?:di\s+sesso\s+)?${GENDER_WORDS}\b`), { unless: AND_OTHER_SEX }),
  it(GR, 'gender', /\b(?:di\s+)?sesso\s*:?\s*(?:maschile|femminile)\b/),
  it(GR, 'gender', new RegExp(String.raw`\b(?:cercasi|cercansi|cerchiamo|cerco|ricerchiamo|ricerca|selezioniamo|assumiamo|vogliamo|inseriremo)\s+(?:urgentemente\s+)?(?:una?\s+|un'\s*|uno\s+)?(?:giovane\s+)?${GENDER_WORDS}\b`), { unless: AND_OTHER_SEX }),
  it(GR, 'gender', new RegExp(String.raw`\b(?:preferibilmente|possibilmente|preferenza|preferita|preferito)\s+(?:di\s+sesso\s+)?(?:donna|uomo|donne|uomini|femminile|maschile|ragazza|ragazzo)\b`), { unless: AND_OTHER_SEX }),
  it(GR, 'gender', /\bfigura\s+(?:esclusivamente\s+)?(?:femminile|maschile)\b/),
  it(GR, 'gender', /\bcandidat[aoie]\s+(?:donne|donna|uomini|uomo)\b/, { unless: AND_OTHER_SEX }),
  it(GR, 'gender', /(?:^|[.;:\n]\s*)(?:ragazza|ragazzo|signorina)\s+(?:per|di|da|alla|al|addett)/),
  en(GR, 'gender', /\b(?:males?|females?|men|women|girls?|boys?)\s+only\b/),
  en(GR, 'gender', /\bmust\s+be\s+(?:a\s+)?(?:male|female|man|woman)\b/),
  en(GR, 'gender', /\blooking\s+for\s+(?:a\s+)?(?:young\s+)?(?:girl|boy|lady|gentleman)\b/),

  // Age.
  it(DR, 'age', new RegExp(String.raw`\b(?:max|massimo)\.?\s*\d{2}\s*(?:anni|enni)\b${NOT_EXPERIENCE}`)),
  it(DR, 'age', /\beta\s*(?:massima|minima|max|min|compresa|inferiore|superiore|ideale|preferibile|preferibilmente|indicativa|non\s+superiore|tra|:?\s*\d)/),
  it(DR, 'age', new RegExp(String.raw`\b(?:under|over)\s*\d{2}(?:\s*anni${NOT_EXPERIENCE}|\s*years\s*old|(?=\s*(?:[,.;:)]|$)))`)),
  it(DR, 'age', new RegExp(String.raw`\b(?:sotto|entro|oltre)\s+i\s+\d{2}\s+anni\b${NOT_EXPERIENCE}`)),
  it(DR, 'age', new RegExp(String.raw`\bnon\s+(?:oltre|superiore\s+a|piu\s+di)\s+(?:i\s+)?\d{2}\s+anni\b${NOT_EXPERIENCE}`)),
  it(DR, 'age', new RegExp(String.raw`\bfino\s+a\s+\d{2}\s+anni\b${NOT_EXPERIENCE}`)),
  it(DR, 'age', new RegExp(String.raw`\b\d{2}\s*(?:-|a|e)\s*\d{2}\s*anni\b${NOT_EXPERIENCE}`)),
  it(DR, 'age', new RegExp(String.raw`\bdai?\s*\d{2}\s*(?:ai|a)\s*\d{2}\s*anni\b${NOT_EXPERIENCE}`)),
  it(DR, 'age', /\b\d{2}\s*enn[ei]\b/),
  it(DR, 'age', /\bnat[oaie]\s+(?:dopo|prima|nel)\s+(?:il\s+)?(?:19|20)\d{2}\b/),
  it(DR, 'age', /\bclasse\s+(?:19|20)\d{2}\b/),
  it(DR, 'age', /\bgiovan(?:e|i|issim[aeio])\b/, { scope: 'mustHave' }),
  it('age_proxy', 'young', /\bgiovan(?:e|i|issim[aeio])\b/, { scope: 'other' }),
  it('age_proxy', 'recent_graduate', /\bneo(?:laureat|diplomat)\w*|\bappena\s+(?:laureat|diplomat)\w*|\brecent[ei]\s+(?:laurea|diploma)\b|\bnativ[oi]\s+digital\w*/),
  it('age_proxy', 'military', /\bmilitesent\w*|\bassolt\w+\s+(?:gli\s+)?obblighi\s+(?:di\s+)?leva\b/),
  en(DR, 'age', /\b(?:max(?:imum)?\s+age|age\s+(?:limit|range|between|under|over)|aged?\s+(?:between\s+)?\d{2}|\d{2}\s*(?:-|to)\s*\d{2}\s*years\s+old)\b/),
  en(DR, 'age', /\b(?:under|over)\s*\d{2}(?:\s*years\s*old|(?=\s*(?:[,.;:)]|$)))/),
  en(DR, 'age', /\byoung\b/, { scope: 'mustHave' }),
  en('age_proxy', 'young', /\byoung\b/, { scope: 'other' }),
  en('age_proxy', 'recent_graduate', /\b(?:recent|fresh)\s+graduates?\b|\bdigital\s+natives?\b/),

  // Nationality.
  it(DR, 'nationality', /\bcittadinanza\s+italiana\b|\bsolo\s+(?:cittadin[ie]\s+)?(?:italian[oiae]|europe[oiae])\b|\bitalian[oiae]\s+di\s+nascita\b|\borigine\s+italiana\b/),
  it(DR, 'nationality', /\bnazionalita\s+(?:italiana|europea)\b|\b(?:di\s+razza|etnia\s+\w+|razza\s+(?:bianca|caucasica))\b|\bnon\s+stranier[oie]\b|\bstranieri\s+esclusi\b|\bno\s+stranieri\b/),
  it('nationality_proxy', 'native_speaker', /\bmadrelingua\s+italian[oa]\b|\bitalian[oa]\s+madrelingua\b|\bparlante\s+nativ[oa]\s+(?:di\s+)?italian\w*/),
  en(DR, 'nationality', /\b(?:italian|eu)\s+(?:citizens?|nationals?)\s+only\b|\bmust\s+be\s+(?:an?\s+)?italian\s+(?:citizen|national)\b/),

  // Appearance.
  it(DR, 'appearance', new RegExp(String.raw`\b(?:bella|buona|ottima)\s+presenza\b${NOT_ONLINE}`)),
  it(DR, 'appearance', /\bpresenza\s+(?:curata|gradevole|piacevole)\b|\b(?:piacevole|gradevole|bel|bell')\s*aspetto\b|\baspetto\s+(?:curato|gradevole|piacevole)\b|\bavvenent\w+/),
  it(DR, 'appearance', /\baltezza\s+(?:minima|min|superiore|\d)|\bstatura\b|\bpeso\s+forma\b|\bbell[ae]\s+ragazz[ae]\b/),
  en(DR, 'appearance', /\b(?:good|nice)[-\s]?looking\b|\battractive\s+(?:appearance|candidate)\b|\bpleasant\s+appearance\b/),

  // Family and marital status.
  it(DR, 'family', /\bnubile\b|\bcelibe\b|\bstato\s+civile\b|\b(?:non\s+)?sposat[oaie]\b|\b(?:con|senza|no|niente)\s+figli\b/),
  it(DR, 'family', /\bsenza\s+(?:vincoli|impegni|carichi)\s+familiari\b|\bliber[oa]\s+da\s+(?:impegni|vincoli|carichi)\s+familiari\b|\bnessun\s+(?:impegno|vincolo)\s+familiare\b|\bnon\s+(?:in\s+)?(?:gravidanza|incinta)\b/),
  en(DR, 'family', /\b(?:unmarried|married)\b|\bmarital\s+status\b|\bno\s+children\b|\bwithout\s+children\b/),

  // Photo.
  it(DR, 'photo', /\bfoto(?:grafia)?\s+(?:obbligatoria|richiesta|allegata|in\s+allegato|recente|tessera)\b|\b(?:allegare|inviare|con|allegata)\s+(?:una\s+)?foto(?:grafia)?\b|\bcv\s+con\s+foto\b/),
  en(DR, 'photo', /\b(?:photo|picture)\s+(?:required|mandatory)\b|\b(?:attach|include|send)\s+(?:a\s+)?(?:recent\s+)?(?:photo|picture)\b/),

  // Religion, political and union views, orientation.
  it(DR, 'beliefs', /\bdi\s+fede\s+\w+|\bfede\s+(?:cattolica|cristiana|musulmana|ebraica|religiosa|politica)\b|\bpraticante\s+(?:cattolic|musulman|ebre|cristian)\w*|\bopinioni\s+politiche\b|\bappartenenza\s+(?:politica|sindacale|religiosa)\b/),
  it(DR, 'beliefs', /\bnon\s+iscritt[oaie]\s+(?:a|ad|ai|al)\s+sindacat\w*|\bnon\s+sindacalizzat\w*|\borientamento\s+(?:sessuale|politico|religioso)\b/),
  en(DR, 'beliefs', /\b(?:christian|catholic|muslim|jewish)\s+(?:only|candidates?)\b|\bpolitical\s+(?:views|opinions|affiliation)\b|\bnon-?union\b/),

  // Health beyond the role.
  it(DR, 'health', new RegExp(String.raw`\bsana\s+e\s+robusta\s+costituzione\b|\b(?:ottim[ae]|perfett[ae]|buon[ae])\s+(?:condizioni\s+di\s+)?salute\b(?!\s+(?:finanziari|aziendal|del|dell))|\besente\s+da\s+(?:malattie|patologie|disabilita)\b`)),
  en(DR, 'health', /\bperfect\s+health\b|\bhealthy\s+and\s+strong\b|\bfree\s+from\s+(?:illness|disabilit\w+)\b/),
];

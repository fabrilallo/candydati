/** Text written by a candidate (CV, cover letter, emails, even their name) reaches the model only inside these tags. */
export const CANDIDATE_DATA_OPEN = '<candidate_data>';
export const CANDIDATE_DATA_CLOSE = '</candidate_data>';

/** Any spelling of the tag a candidate could type to close the block early and speak as the system. */
const DELIMITER = /<\s*\/?\s*candidate[\s_-]*data\b[^>]*>/gi;

/** Removes our delimiters from candidate text, so the data block cannot be closed from the inside. */
export const neutraliseDelimiters = (text: string): string => text.replace(DELIMITER, '[tag removed]');

/** One block of candidate-authored text, marked as data. Objects are serialised as JSON first. */
export function wrapCandidateData(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 1);
  return `${CANDIDATE_DATA_OPEN}\n${neutraliseDelimiters(text)}\n${CANDIDATE_DATA_CLOSE}`;
}

/** Long CVs and threads are cut: the assistant drafts from them, it does not need every page. */
export const truncate = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max)}… [truncated]`);

import { EMAIL_NOT_CONFIGURED } from '@candydati/domain';
import { ValidationError, type ValidationIssue } from './errors.js';
import type { EmailReadiness } from './instance-email-ports.js';

/** The issue of an action that must wait until the instance can send email (every application gets an answer). */
export const EMAIL_NOT_CONFIGURED_ISSUE: ValidationIssue = { path: 'email', message: EMAIL_NOT_CONFIGURED };

/** The issues an action gets from the instance email: none when it can send, or when nothing tells (unit tests). */
export const emailReadinessIssues = (ready: EmailReadiness | undefined): ValidationIssue[] => (ready === undefined || ready() ? [] : [EMAIL_NOT_CONFIGURED_ISSUE]);

export const assertEmailReady = (ready: EmailReadiness | undefined): void => {
  const issues = emailReadinessIssues(ready);
  if (issues.length > 0) throw new ValidationError(issues);
};

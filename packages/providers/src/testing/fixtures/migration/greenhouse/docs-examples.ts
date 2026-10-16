/**
 * Harvest v3 example responses, copied from the public documentation (each export names its page). Nothing here comes
 * from a real account. Where a page has no example, the export says so and the values are invented from its schema.
 * The docs' ids do not always agree with each other (the job example is id 4 and a template, the stages belong to
 * job 1): the tests adapt them locally and say how.
 */

/** https://harvestdocs.greenhouse.io/reference/get_v3-users.md (first two items) */
export const docsUsers = [
  { id: 1, first_name: 'Admin', last_name: 'User', job_title: null, agency_id: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z', primary_email: 'bob_johnson734@localhost.com', name: 'Admin User', deactivated: false, site_admin: true, employee_id: null, linked_candidate_ids: [], office_ids: [], department_ids: [], external_office_ids: [], external_department_ids: [], interviewer_tags: [], custom_fields: { select_custom_field: { name: 'Select custom field', type: 'single_select', value: null } } },
  { id: 2, first_name: 'Admin', last_name: 'Sample', job_title: null, agency_id: 1, created_at: '2023-12-30T12:30:30.000Z', updated_at: '2023-12-30T12:30:30.000Z', primary_email: 'sample@example.com', name: 'Admin Sample', deactivated: false, site_admin: true, employee_id: 'current_emp1', linked_candidate_ids: [1], office_ids: [1], department_ids: [1], external_office_ids: ['off2'], external_department_ids: ['dep1'], interviewer_tags: [{ id: 3, name: 'Tag1' }], custom_fields: { select_custom_field: { name: 'Select custom field', type: 'single_select', value: 'first' } } },
] as const;

/** https://harvestdocs.greenhouse.io/reference/get_v3-jobs.md (the one item, a template with id 4) */
export const docsJob = { id: 4, name: 'My Hiring Plan', requisition_id: 'req-1', notes: 'notes', confidential: true, created_at: '2024-01-08T00:00:00.000Z', updated_at: '2024-01-08T00:00:00.000Z', is_template: true, copied_from_id: 1, opened_at: '2024-01-08T00:00:00.000Z', closed_at: null, status: 'open', office_ids: [1], department_id: 1, external_department_id: null, external_office_ids: [], custom_fields: { custom_field_13: { name: 'Custom Field 13', type: 'short_text', value: 'text' }, multi_select: { name: 'Multi-Select', type: 'multi_select', value: null } } } as const;

/** https://harvestdocs.greenhouse.io/reference/get_v3-job-interview-stages.md (all four items, job 1) */
export const docsStages = [
  { id: 1, created_at: '2024-01-01T12:30:30.000Z', updated_at: '2024-01-01T12:30:30.000Z', name: 'Interview Stage', active: true, job_id: 1, sort_order: 0 },
  { id: 2, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z', name: 'Take Home Test', active: true, job_id: 1, sort_order: 3 },
  { id: 3, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z', name: 'Phone Interview', active: true, job_id: 1, sort_order: 1 },
  { id: 4, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z', name: 'Application Review', active: true, job_id: 1, sort_order: 0 },
] as const;

/** https://harvestdocs.greenhouse.io/reference/get_v3-candidates.md (the one item) */
export const docsCandidate = { id: 1, first_name: 'Pete', last_name: 'Current Person', preferred_name: null, company: 'Ghbili Studio', title: 'Producer', created_at: '2024-01-01T12:30:30.000Z', updated_at: '2024-01-01T12:30:30.000Z', can_email: true, time_zone: 'Eastern Time (US & Canada)', last_activity_at: '2024-01-01T12:30:30.000Z', private: false, tags: ['current', 'tagged'], linked_user_ids: [1], phone_numbers: [{ value: '999-555-1212', type: 'mobile' }], addresses: [{ value: '123 Main St\nHoldmel, NJ', type: 'home' }], email_addresses: [{ value: 'current@example.com', type: 'personal' }], website_addresses: [{ value: 'somewebsite.com', type: 'other' }], social_media_addresses: [{ value: 'linkedin.com/some_user' }], custom_fields: { select_custom_field: { name: 'Select custom field', type: 'single_select', value: 'first' } } } as const;

/** https://harvestdocs.greenhouse.io/reference/get_v3-applications.md (the one item) */
export const docsApplication = { id: 1, referrer_id: 1, source_id: 1, agency_note_id: 1, recruiter_id: 1, coordinator_id: 1, needs_decision: false, prospect: false, rejected_at: null, created_at: '2024-01-01T12:30:30.000Z', updated_at: '2024-01-01T00:00:00.000Z', last_activity_at: '2024-01-01T00:00:00.000Z', stage_id: 1, job_interview_stage_id: 1, candidate_id: 1, rejection_reason_id: 1, job_id: 1, job_post_id: null, status: 'in_process', stage_name: 'Application Review', custom_fields: { custom_field_1: { name: 'Custom Field 1', type: 'short_text', value: 'some value' } }, location_address: '455 Broadway St., New York, NY', answers: [{ question: 'Simple question', answer: 'some answer' }], prospective_job_ids: [] } as const;

/** https://harvestdocs.greenhouse.io/reference/get_v3-application-stages.md (the two items of its abbreviated example) */
export const docsApplicationStages = [
  { id: 1, application_id: 1, created_at: '2024-01-01T12:30:30.000Z', updated_at: '2024-01-01T12:30:30.000Z', job_interview_stage_id: 1, entered_at: null, exited_at: null, days_in_stage: 0, current: false },
  { id: 5, application_id: 1, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z', job_interview_stage_id: 4, entered_at: '2024-01-01T00:00:00.000Z', exited_at: null, days_in_stage: 0, current: true },
] as const;

/** https://harvestdocs.greenhouse.io/reference/get_v3-notes.md (its NOTE example) */
export const docsNote = { id: 1, body: 'Admin-only note', created_at: '2024-01-01T12:30:30.000Z', updated_at: '2024-01-01T12:30:30.000Z', subject: null, user_id: 1, visibility: 'admin_only_visible', email_from: null, email_to: null, email_cc: null, import_hash: null, body_with_tags: null, email_attachment_file_names: null, candidate_id: 1, type: 'NOTE', application_id: null } as const;

/**
 * NO EXAMPLE IN THE DOCS: the notes page has none for EMAIL. Built from that page's schema (email_from, email_to and
 * email_cc are described as EMAIL-only fields); every value is invented.
 */
export const schemaEmailNote = { id: 2, body: 'Following up on next steps.', created_at: '2024-02-05T09:15:00.000Z', updated_at: '2024-02-05T09:15:00.000Z', subject: 'Next steps for the role', user_id: 1, visibility: 'publicly_visible', email_from: 'recruiter@example.com', email_to: 'current@example.com', email_cc: ['hiring-manager@example.com'], import_hash: null, body_with_tags: null, email_attachment_file_names: 'resume.pdf', candidate_id: 1, type: 'EMAIL', application_id: 1 } as const;

/** https://harvestdocs.greenhouse.io/reference/get_v3-attachments.md (the one item; its url is a placeholder) */
export const docsAttachment = { id: 1, application_id: 1, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z', type: 'resume', candidate_id: 1, filename: 'Oldest Attachments', url: 'https://example.com/signed-resource' } as const;

/** https://harvestdocs.greenhouse.io/reference/get_v3-sources.md (both items). Not in the docs' llms.txt index. */
export const docsSources = [
  { id: 1, created_at: '2024-01-01T12:30:30.000Z', updated_at: '2024-01-01T12:30:30.000Z', name: 'Former Colleagues', type: { id: 2, name: 'Referral' } },
  { id: 14, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z', name: 'LinkedIn', type: { id: 8, name: 'Third-party boards' } },
] as const;

/**
 * https://harvestdocs.greenhouse.io/docs/authentication.md describes the response as token_type, access_token and an
 * integer expires_in, without an example: values invented.
 */
export const schemaToken = { token_type: 'Bearer', access_token: 'test-access-token', expires_in: 3600 } as const;

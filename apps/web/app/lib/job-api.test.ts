import { describe, expect, it, vi } from 'vitest'
import { AppError } from './auth-errors'
import {
  analyzeQuality,
  closeJob,
  createJob,
  createTemplate,
  deleteTemplate,
  fetchCareers,
  fetchPublicJob,
  getJob,
  jobErrorKey,
  jobsUrl,
  loaded,
  listJobs,
  listTemplates,
  publishJob,
  toJobRequest,
  updateJob,
  type JobApiRequest,
} from './job-api'

const NOW = '2026-10-13T10:00:00.000Z'
const content = { title: 'Dev', language: 'it', salary: { currency: 'EUR', period: 'year' }, location: {}, process: [], summary: '', responsibilities: [], requirements: { mustHave: [], niceToHave: [] }, technologies: [], benefits: [], growth: '', workLifeBalance: '', culture: '' }
const job = { id: 'j1', slug: 'dev-abc', status: 'draft', content, quality: null, publishIssues: [{ path: 'role', rule: 'required' }], createdAt: NOW, updatedAt: NOW, publishedAt: null, closedAt: null }
const scores = Object.fromEntries(['selection_process', 'role_requirements', 'work_mode', 'salary_transparency', 'benefits', 'growth', 'work_life_balance', 'responsibilities_clarity', 'culture', 'technologies'].map((k) => [k, 0.5]))
const assessment = { report: { scores, total: 5, vaguePhrases: [], improvements: ['x'], source: 'rules' }, threshold: 6, belowThreshold: true }

const ok = (data: unknown, meta?: unknown) => ({ status: 200, body: { success: true, data, error: null, ...(meta ? { meta } : {}) } })
const fail = (status: number, code: string) => ({ status, body: { success: false, data: null, error: { code, message: 'x' } } })
const send = (response: { status: number; body: unknown }) => vi.fn<JobApiRequest>(async () => response)

describe('listJobs', () => {
  it('builds the url and returns summaries with the page meta', async () => {
    const summary = { id: 'j1', slug: 's', status: 'draft', title: 'Dev', role: null, publishable: false, publishIssueCount: 4, salary: { currency: 'EUR', period: 'year' }, workMode: null, qualityTotal: null, belowThreshold: false, updatedAt: NOW, publishedAt: null }
    const request = send(ok([summary], { total: 1, page: 2, limit: 20 }))
    const page = await listJobs(request, 'draft', 2)
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/jobs?status=draft&page=2&limit=20')
    expect(page.jobs).toHaveLength(1)
    expect(page.meta).toEqual({ total: 1, page: 2, limit: 20 })
    expect(jobsUrl(null, 1, 5)).toBe('/api/v1/jobs?page=1&limit=5')
  })

  it('rejects a list without meta', async () => {
    await expect(listJobs(send(ok([])), null, 1)).rejects.toMatchObject({ key: 'errors.generic' })
  })
})

describe('job calls', () => {
  it('gets, creates, updates and closes a job', async () => {
    expect((await getJob(send(ok(job)), 'j1')).id).toBe('j1')
    const create = send(ok(job))
    await createJob(create, content as never, 't1')
    expect(create.mock.calls[0]).toEqual(['/api/v1/jobs', { method: 'POST', body: { content, templateId: 't1' } }])
    const withoutTemplate = send(ok(job))
    await createJob(withoutTemplate, content as never)
    expect(withoutTemplate.mock.calls[0]?.[1]).toEqual({ method: 'POST', body: { content } })
    const update = send(ok(job))
    await updateJob(update, 'j 1', content as never)
    expect(update.mock.calls[0]).toEqual(['/api/v1/jobs/j%201', { method: 'PUT', body: { content } }])
    const close = send(ok({ ...job, status: 'closed' }))
    expect((await closeJob(close, 'j1')).status).toBe('closed')
    expect(close.mock.calls[0]?.[0]).toBe('/api/v1/jobs/j1/close')
  })

  it('publishes and returns the optional assessment', async () => {
    const result = await publishJob(send(ok({ job, quality: assessment })), 'j1')
    expect(result.quality?.belowThreshold).toBe(true)
    expect((await publishJob(send(ok({ job, quality: null })), 'j1')).quality).toBeNull()
  })

  it('analyses quality on demand', async () => {
    const request = send(ok({ assessment, publishIssues: [{ path: 'role', rule: 'required' }] }))
    const result = await analyzeQuality(request, content as never)
    expect(result.assessment.report.total).toBe(5)
    expect(result.publishIssues).toEqual([{ path: 'role', rule: 'required' }])
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/jobs/quality')
  })

  it('refuses a body that does not match the contract', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(getJob(send(ok({ id: 1 })), 'j1')).rejects.toMatchObject({ key: 'errors.generic', code: 'invalid_response' })
    await expect(getJob(send({ status: 200, body: 'nope' }), 'j1')).rejects.toBeInstanceOf(AppError)
    spy.mockRestore()
  })
})

describe('templates', () => {
  const template = { id: 't1', name: 'Dev', content, updatedAt: NOW }
  it('lists, creates and deletes', async () => {
    expect(await listTemplates(send(ok([template])))).toHaveLength(1)
    const create = send(ok(template))
    await createTemplate(create, 'Dev', content as never)
    expect(create.mock.calls[0]?.[1]).toEqual({ method: 'POST', body: { name: 'Dev', content } })
    const del = send(ok({ id: 't1' }))
    await deleteTemplate(del, 't1')
    expect(del.mock.calls[0]).toEqual(['/api/v1/job-templates/t1', { method: 'DELETE' }])
  })
})

describe('error mapping', () => {
  it('maps api codes and statuses to translation keys', async () => {
    expect(jobErrorKey('conflict', 409)).toBe('job.errors.conflict')
    expect(jobErrorKey('validation_failed', 422)).toBe('job.errors.validationFailed')
    expect(jobErrorKey(null, 403)).toBe('errors.forbidden')
    expect(jobErrorKey('weird', 500)).toBe('errors.unreachable')
    await expect(publishJob(send(fail(422, 'validation_failed')), 'j1')).rejects.toMatchObject({ key: 'job.errors.validationFailed', code: 'validation_failed' })
    const missingNotice = { status: 422, body: { success: false, data: null, error: { code: 'validation_failed', message: 'x', issues: [{ path: 'organization.privacyNotice', message: 'privacy_notice_required' }] } } }
    await expect(publishJob(send(missingNotice), 'j1')).rejects.toMatchObject({ key: 'job.errors.privacyNoticeRequired', code: 'privacy_notice_required' })
    await expect(getJob(send(fail(404, 'not_found')), 'j1')).rejects.toMatchObject({ key: 'errors.notFound' })
    await expect(publishJob(send(fail(422, 'approval_required')), 'j1')).rejects.toMatchObject({ key: 'job.approval.errors.required' })
  })

  it('turns a transport failure into the unreachable error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const broken: JobApiRequest = async () => {
      throw new Error('boom')
    }
    await expect(getJob(broken, 'j1')).rejects.toMatchObject({ key: 'errors.unreachable' })
    spy.mockRestore()
  })

  it('keeps a status error with a body that is not an envelope', async () => {
    await expect(getJob(send({ status: 502, body: '<html>' }), 'j1')).rejects.toMatchObject({ key: 'errors.unreachable' })
  })
})

describe('public pages', () => {
  const organization = { name: 'Acme', slug: 'acme', logo: null }
  const published = {
    ...content,
    role: 'backend_developer',
    seniority: 'senior',
    contractType: 'permanent',
    workMode: 'remote',
    responseDays: 5,
    salary: { min: 40000, max: 50000, currency: 'EUR', period: 'year' },
    location: { country: 'IT' },
    process: [{ type: 'screening_call', durationMinutes: 30, conductedBy: 'recruiter' }],
    responsibilities: ['a', 'b', 'c'],
    requirements: { mustHave: ['x'], niceToHave: [] },
  }
  it('validates the careers page', async () => {
    const summary = { slug: 'dev', title: 'Dev', role: 'backend_developer', seniority: 'senior', contractType: 'permanent', workMode: 'remote', location: { country: 'IT' }, salary: published.salary, stageCount: 2, responseDays: 5, publishedAt: NOW, updatedAt: NOW }
    const request = send(ok({ organization, jobs: [summary] }))
    const careers = await fetchCareers(request, 'acme')
    expect(careers.jobs[0]?.slug).toBe('dev')
    expect(request.mock.calls[0]?.[0]).toBe('/api/v1/public/organizations/acme/jobs')
  })

  it('validates the job page and refuses content that is not publishable', async () => {
    const page = await fetchPublicJob(send(ok({ organization, job: { slug: 'dev', content: published, publishedAt: NOW, updatedAt: NOW } })), 'acme', 'dev')
    expect(page.job.content.salary.min).toBe(40000)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(fetchPublicJob(send(ok({ organization, job: { slug: 'dev', content, publishedAt: NOW, updatedAt: NOW } })), 'acme', 'dev')).rejects.toMatchObject({ code: 'invalid_response' })
    spy.mockRestore()
  })

  it('reports a missing organization as not found', async () => {
    await expect(fetchCareers(send(fail(404, 'not_found')), 'nope')).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('toJobRequest', () => {
  it('forwards method and body and returns status and body', async () => {
    const raw = vi.fn(async () => ({ status: 201, _data: { a: 1 } }))
    const request = toJobRequest(raw)
    expect(await request('/x', { method: 'POST', body: { b: 2 } })).toEqual({ status: 201, body: { a: 1 } })
    expect(raw).toHaveBeenCalledWith('/x', { ignoreResponseError: true, headers: { accept: 'application/json' }, method: 'POST', body: { b: 2 } })
    await request('/y')
    expect(raw).toHaveBeenLastCalledWith('/y', { ignoreResponseError: true, headers: { accept: 'application/json' } })
  })
})

describe('loaded', () => {
  it('wraps data or the translation key of the failure', async () => {
    expect(await loaded(async () => 1)).toEqual({ data: 1, errorKey: null })
    expect(await loaded(async () => getJob(send(fail(403, 'forbidden')), 'j1'))).toEqual({ data: null, errorKey: 'errors.forbidden' })
    expect(await loaded(async () => Promise.reject(new Error('x')))).toEqual({ data: null, errorKey: 'errors.generic' })
  })
})

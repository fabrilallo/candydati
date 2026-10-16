import type { ApiError, PageMeta } from '@candydati/domain';
import type { FastifyInstance } from 'fastify';
import { mailboxOf, pathOf } from './mailbox.js';
import { PASSWORD, WEB_ORIGIN } from './test-app.js';

export interface Reply<T = unknown> {
  readonly status: number;
  readonly body: {
    readonly success: boolean;
    readonly data: T | null;
    readonly error: ApiError | null;
    readonly meta?: PageMeta;
  };
  readonly cookie: string | null;
}

const cookieFrom = (setCookie: string | string[] | undefined): string | null => {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const pairs = list.map((c) => c.split(';')[0]!).filter((c) => !c.endsWith('='));
  return pairs.length > 0 ? pairs.join('; ') : null;
};

/** JSON bodies are parsed; a redirect or an HTML body becomes null. */
const parseBody = (text: string): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** A browser-like client: keeps one session cookie and sends the web Origin as the web app's proxy does. */
export class TestUser {
  private cookie: string | null = null;
  /** Set by `createOrganization`: the public slug of the organization this user created. */
  organizationSlug = '';

  constructor(
    private readonly app: FastifyInstance,
    readonly email: string,
    readonly name: string,
  ) {}

  async request<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<Reply<T>> {
    const response = await this.app.inject({
      method,
      url,
      headers: { origin: WEB_ORIGIN, ...(this.cookie ? { cookie: this.cookie } : {}) },
      ...(body === undefined ? {} : { payload: body as object }),
    });
    const next = cookieFrom(response.headers['set-cookie']);
    if (next) this.cookie = next;
    const text = response.body;
    return { status: response.statusCode, body: parseBody(text) as Reply<T>['body'], cookie: next };
  }

  /** The raw response (headers and bytes), for downloads. */
  download(url: string) {
    return this.app.inject({ method: 'GET', url, headers: { origin: WEB_ORIGIN, ...(this.cookie ? { cookie: this.cookie } : {}) } });
  }

  cookieHeader(): string {
    if (!this.cookie) throw new Error('not signed in');
    return this.cookie;
  }

  get = <T = unknown>(url: string) => this.request<T>('GET', url);
  post = <T = unknown>(url: string, body: unknown = {}) => this.request<T>('POST', url, body);
  patch = <T = unknown>(url: string, body: unknown = {}) => this.request<T>('PATCH', url, body);
  put = <T = unknown>(url: string, body: unknown = {}) => this.request<T>('PUT', url, body);
  delete = <T = unknown>(url: string) => this.request<T>('DELETE', url);

  /** Signs up, then opens the verification link from the email (as the person would): that link signs in. */
  async signUp(): Promise<this> {
    const reply = await this.post('/api/auth/sign-up/email', { email: this.email, password: PASSWORD, name: this.name });
    if (reply.status !== 200) throw new Error(`sign-up failed: ${reply.status} ${JSON.stringify(reply.body)}`);
    return this.verifyEmail();
  }

  /** Opens the newest verification link sent to this user; the redirect it answers carries the session cookie. */
  async verifyEmail(): Promise<this> {
    const mailbox = mailboxOf(this.app);
    if (!mailbox) throw new Error('this app has no recording mailbox (createTestApp registers one)');
    const verified = await this.get(pathOf(mailbox.linkFor(this.email, 'verify_email')));
    if (verified.status !== 302 || !this.cookie) throw new Error(`email verification failed: ${verified.status}`);
    return this;
  }

  /** Joins `organization` with `role` through an invitation sent by `inviter`. */
  async joinAs(inviter: TestUser, role: string): Promise<this> {
    const invite = await inviter.post('/api/auth/organization/invite-member', { email: this.email, role });
    const invitationId = (invite.body as unknown as { id: string }).id;
    const accepted = await this.post('/api/auth/organization/accept-invitation', { invitationId });
    if (accepted.status !== 200) throw new Error(`accept failed: ${accepted.status}`);
    return this;
  }

  async createOrganization(name: string): Promise<string> {
    const slug = `${name.toLowerCase().replace(/\W+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
    this.organizationSlug = slug;
    const reply = await this.post<{ id: string }>('/api/auth/organization/create', { name, slug });
    if (reply.status !== 200) throw new Error(`create organization failed: ${reply.status} ${JSON.stringify(reply.body)}`);
    return (reply.body as unknown as { id: string }).id;
  }
}

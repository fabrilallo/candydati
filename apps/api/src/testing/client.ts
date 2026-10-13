import type { ApiError, PageMeta } from '@tt/domain';
import type { FastifyInstance } from 'fastify';
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

/** A browser-like client: keeps one session cookie and sends the web Origin as the web app's proxy does. */
export class TestUser {
  private cookie: string | null = null;

  constructor(
    private readonly app: FastifyInstance,
    readonly email: string,
    readonly name: string,
  ) {}

  async request<T = unknown>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<Reply<T>> {
    const response = await this.app.inject({
      method,
      url,
      headers: { origin: WEB_ORIGIN, ...(this.cookie ? { cookie: this.cookie } : {}) },
      ...(body === undefined ? {} : { payload: body as object }),
    });
    const next = cookieFrom(response.headers['set-cookie']);
    if (next) this.cookie = next;
    const text = response.body;
    return { status: response.statusCode, body: (text ? JSON.parse(text) : null) as Reply<T>['body'], cookie: next };
  }

  cookieHeader(): string {
    if (!this.cookie) throw new Error('not signed in');
    return this.cookie;
  }

  get = <T = unknown>(url: string) => this.request<T>('GET', url);
  post = <T = unknown>(url: string, body: unknown = {}) => this.request<T>('POST', url, body);

  async signUp(): Promise<this> {
    const reply = await this.post('/api/auth/sign-up/email', { email: this.email, password: PASSWORD, name: this.name });
    if (reply.status !== 200) throw new Error(`sign-up failed: ${reply.status} ${JSON.stringify(reply.body)}`);
    return this;
  }

  async createOrganization(name: string): Promise<string> {
    const slug = `${name.toLowerCase().replace(/\W+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
    const reply = await this.post<{ id: string }>('/api/auth/organization/create', { name, slug });
    if (reply.status !== 200) throw new Error(`create organization failed: ${reply.status} ${JSON.stringify(reply.body)}`);
    return (reply.body as unknown as { id: string }).id;
  }
}

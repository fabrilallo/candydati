/** A production environment that passes every rule: each test breaks one thing. */
export const PRODUCTION_ENV = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://candydati:r7Kp2XwN9vLq4TsB@postgres:5432/candydati',
  BETTER_AUTH_SECRET: 'Zq8vN3kR7wLp2XsT9bYc4HdM6fJg1Ae5',
  BETTER_AUTH_URL: 'https://ats.example.org',
  WEB_ORIGIN: 'https://ats.example.org',
  PLATFORM_URL: 'https://ats.example.org',
  S3_ENDPOINT: 'http://minio:9000',
  S3_BUCKET: 'candydati',
  S3_ACCESS_KEY: 'candydati',
  S3_SECRET_KEY: 'u5Hq9ZpW3kXv7NcR',
  INBOUND_WEBHOOK_SECRET: 'Pw4nX8qT2vZk6RbM9sLc3HyJ7dGf5Ae1',
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'smtp.example.org',
  SMTP_PORT: '587',
} as const;

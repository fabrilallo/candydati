#!/usr/bin/env node
// Prints the Candydati Dokploy template (base64, what Dokploy's Compose Import and the compose.import API take) with
// the operator's domain, name and email settings filled in. Every secret stays a Dokploy helper (${password:N}), so
// Dokploy generates it on import and it never passes through the agent. Passwords and API keys are refused here: the
// operator pastes them in Dokploy's Environment tab.
//
//   node dokploy-template.mjs --domain jobs.example.com --support-email hr@example.com \
//     --email-provider smtp --smtp-host smtp.example.com [--smtp-port 587] [--smtp-user user] \
//     [--name "Acme"] [--email-domain mail.example.com] [--ref v0.2.0 | --from <folder>]
//
// Node 24 or newer, no dependencies. Without --from it downloads deploy/dokploy/ of the latest release.
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const REPOSITORY = 'fabrilallo/candydati';
const SECRET_FLAGS = ['--smtp-password', '--resend-api-key'];
const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMAIL = /^[^\s@"\\]+@[a-z0-9.-]+\.[a-z]{2,63}$/i;
const PLAIN = /^[^"\\\n]{1,100}$/;

const fail = (message) => {
  throw new Error(message);
};

/** Replaces the value of `NAME = "..."` (first match, a whole line) in the TOML. */
const setLine = (config, name, value) => config.replace(new RegExp(`^${name} = ".*"$`, 'm'), `${name} = "${value}"`);

/** The answers checked and turned into the lines of template.toml they set. */
const lines = (answers) => {
  const domain = String(answers.domain ?? '').toLowerCase();
  if (!DOMAIN.test(domain)) fail(`not a domain name: ${answers.domain}`);
  const name = answers.name ?? 'Candydati';
  if (!PLAIN.test(name)) fail('the name must be plain text, without quotes or backslashes');
  if (!EMAIL.test(answers.supportEmail ?? '')) fail(`not a support email address: ${answers.supportEmail}`);
  const emailDomain = String(answers.emailDomain ?? domain).toLowerCase();
  if (!DOMAIN.test(emailDomain)) fail(`not a mail domain: ${answers.emailDomain}`);
  const set = { main_domain: domain, PLATFORM_NAME: name, PLATFORM_SUPPORT_EMAIL: answers.supportEmail, EMAIL_DOMAIN: emailDomain };
  if (answers.emailProvider === 'resend') return { ...set, EMAIL_PROVIDER: 'resend' };
  if (answers.emailProvider !== 'smtp') fail('the email provider must be smtp or resend');
  if (!PLAIN.test(answers.smtpHost ?? '')) fail('an SMTP host is required with --email-provider smtp');
  const port = answers.smtpPort ?? '587';
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) fail(`not an SMTP port: ${port}`);
  if (answers.smtpUser !== undefined && !PLAIN.test(answers.smtpUser)) fail('the SMTP user must be plain text');
  return { ...set, EMAIL_PROVIDER: 'smtp', SMTP_HOST: answers.smtpHost, SMTP_PORT: port, SMTP_SECURE: port === '465' ? 'true' : 'false', SMTP_USER: answers.smtpUser ?? '' };
};

/** template.toml with the operator's answers; the secrets stay Dokploy helpers. */
export const customizeConfig = (config, answers) => Object.entries(lines(answers)).reduce((toml, [name, value]) => setLine(toml, name, value), config);

const download = async (url) => {
  const response = await fetch(url, { headers: { 'user-agent': 'candydati-deploy-skill' } });
  if (!response.ok) fail(`cannot download ${url}: HTTP ${response.status}`);
  return response.text();
};

const latestRelease = async () => JSON.parse(await download(`https://api.github.com/repos/${REPOSITORY}/releases/latest`)).tag_name;

const templateFiles = async ({ from, ref }) => {
  if (from) return { compose: readFileSync(join(from, 'docker-compose.yml'), 'utf8'), config: readFileSync(join(from, 'template.toml'), 'utf8') };
  const base = `https://raw.githubusercontent.com/${REPOSITORY}/${ref ?? (await latestRelease())}/deploy/dokploy`;
  return { compose: await download(`${base}/docker-compose.yml`), config: await download(`${base}/template.toml`) };
};

const main = async (argv) => {
  if (argv.some((arg) => SECRET_FLAGS.includes(arg.split('=')[0]))) {
    fail('passwords and API keys are not taken here: paste it in Dokploy, Environment tab, after the import');
  }
  const { values } = parseArgs({
    args: argv,
    options: {
      domain: { type: 'string' }, name: { type: 'string' }, 'support-email': { type: 'string' }, 'email-provider': { type: 'string' },
      'smtp-host': { type: 'string' }, 'smtp-port': { type: 'string' }, 'smtp-user': { type: 'string' }, 'email-domain': { type: 'string' },
      ref: { type: 'string' }, from: { type: 'string' },
    },
  });
  const files = await templateFiles(values);
  const config = customizeConfig(files.config, {
    domain: values.domain, name: values.name, supportEmail: values['support-email'], emailProvider: values['email-provider'],
    smtpHost: values['smtp-host'], smtpPort: values['smtp-port'], smtpUser: values['smtp-user'], emailDomain: values['email-domain'],
  });
  const json = JSON.stringify({ compose: files.compose, config }, null, 2);
  process.stdout.write(`${Buffer.from(json, 'utf8').toString('base64')}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`dokploy-template: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

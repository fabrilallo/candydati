#!/usr/bin/env node
// Prints the Candydati Dokploy template (base64, what Dokploy's Compose Import and the compose.import API take) with
// the operator's name, support email and, optionally, own domain filled in. Every secret stays a Dokploy helper
// (${password:N}), so Dokploy generates it on import and it never passes through the agent. No email settings: the
// first owner configures email from the app. Passwords and API keys are refused here.
//
//   node dokploy-template.mjs [--name "Acme"] [--support-email hr@example.com] [--domain jobs.example.com] \
//     [--ref v0.2.0 | --from <folder>]
//
// Node 24 or newer, no dependencies. Without --from it downloads deploy/dokploy/ of the latest release.
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const REPOSITORY = 'fabrilallo/candydati';
const SECRET_FLAGS = ['--smtp-password', '--resend-api-key', '--password', '--api-key'];
const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMAIL = /^[^\s@"\\]+@[a-z0-9.-]+\.[a-z]{2,63}$/i;
const PLAIN = /^[^"\\\n]{1,100}$/;

const fail = (message) => {
  throw new Error(message);
};

/** Replaces the value of `NAME = "..."` (first match, a whole line) in the TOML. */
const setLine = (config, name, value) => config.replace(new RegExp(`^${name} = ".*"$`, 'm'), `${name} = "${value}"`);

/** The answers checked and turned into the lines of template.toml they set (none: Dokploy's generated domain stays). */
const lines = (answers) => {
  const set = {};
  if (answers.domain !== undefined) {
    const domain = String(answers.domain).toLowerCase();
    if (!DOMAIN.test(domain)) fail(`not a domain name: ${answers.domain}`);
    set.main_domain = domain;
  }
  if (answers.name !== undefined) {
    if (!PLAIN.test(answers.name)) fail('the name must be plain text, without quotes or backslashes');
    set.PLATFORM_NAME = answers.name;
  }
  if (answers.supportEmail !== undefined) {
    if (!EMAIL.test(answers.supportEmail)) fail(`not a support email address: ${answers.supportEmail}`);
    set.PLATFORM_SUPPORT_EMAIL = answers.supportEmail;
  }
  return set;
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
    fail('passwords and API keys are not taken here: email is configured from the app after the first sign-in');
  }
  const { values } = parseArgs({
    args: argv,
    options: {
      domain: { type: 'string' }, name: { type: 'string' }, 'support-email': { type: 'string' }, ref: { type: 'string' }, from: { type: 'string' },
    },
  });
  const files = await templateFiles(values);
  const config = customizeConfig(files.config, { domain: values.domain, name: values.name, supportEmail: values['support-email'] });
  const json = JSON.stringify({ compose: files.compose, config }, null, 2);
  process.stdout.write(`${Buffer.from(json, 'utf8').toString('base64')}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`dokploy-template: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}

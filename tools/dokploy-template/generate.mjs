import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { ROOT } from '../env-docs/generate.mjs';

/** Where the template lives: Dokploy's Compose Import takes `template.base64`, its catalogue the other two files. */
export const TEMPLATE_DIR = join('deploy', 'dokploy');

/** Not in the template: HTTPS and the mail catcher come from Dokploy, config-check needs a file of the repository. */
const DROPPED_SERVICES = ['config-check', 'caddy', 'mailpit'];
const DROPPED_VOLUMES = ['caddydata', 'caddyconfig'];
const IMAGE = /^\$\{CANDYDATI_IMAGE_PREFIX:-([^}]+)\}-([a-z]+):\$\{CANDYDATI_VERSION:-local\}$/;

const HEADER = `# Candydati for Dokploy, generated from docker-compose.prod.yml: do not edit, run
# \`pnpm --filter @candydati/tools dokploy-template\`. Guide: docs/deploy/dokploy.md.
`;

/**
 * Secrets Dokploy generates when the template is used (\`\${password:N}\` is letters and digits). No email settings:
 * the first owner configures email from the app (Settings, Email), and the instance stays closed until it works.
 */
const CONFIG = `[variables]
main_domain = "\${domain}"
better_auth_secret = "\${password:64}"
inbound_webhook_secret = "\${password:64}"
postgres_password = "\${password:32}"
s3_secret_key = "\${password:32}"

[config]
[[config.domains]]
serviceName = "web"
port = 3000
host = "\${main_domain}"

[config.env]
PLATFORM_URL = "https://\${main_domain}"
PLATFORM_NAME = "Candydati"
PLATFORM_SUPPORT_EMAIL = ""
BETTER_AUTH_SECRET = "\${better_auth_secret}"
INBOUND_WEBHOOK_SECRET = "\${inbound_webhook_secret}"
POSTGRES_PASSWORD = "\${postgres_password}"
S3_ACCESS_KEY = "candydati"
S3_SECRET_KEY = "\${s3_secret_key}"
`;

const version = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const without = (record, keys) => Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));

/** A service of the production file as the template runs it: the published image, no build, no host port. */
const templateService = (service, release) => {
  const image = IMAGE.exec(service.image ?? '');
  const dependsOn = service.depends_on ? without(service.depends_on, ['config-check']) : undefined;
  return {
    // An upgrade is CANDYDATI_VERSION in the Environment tab and a redeploy: importing again would generate new secrets.
    image: image ? `${image[1]}-${image[2]}:\${CANDYDATI_VERSION:-${release}}` : service.image,
    ...without(service, ['build', 'ports', 'profiles', 'depends_on', 'image']),
    ...(dependsOn && Object.keys(dependsOn).length > 0 ? { depends_on: dependsOn } : {}),
  };
};

export const renderCompose = () => {
  const prod = parse(readFileSync(join(ROOT, 'docker-compose.prod.yml'), 'utf8'), { merge: true });
  const release = version();
  const services = Object.fromEntries(
    Object.entries(without(prod.services, DROPPED_SERVICES)).map(([name, service]) => [name, templateService(service, release)]),
  );
  const { name: _name, ...rest } = without(prod, Object.keys(prod).filter((key) => key.startsWith('x-')));
  return HEADER + stringify({ ...rest, services, volumes: without(prod.volumes, DROPPED_VOLUMES) }, { lineWidth: 0 });
};

export const renderTemplate = () => {
  const compose = renderCompose();
  const json = JSON.stringify({ compose, config: CONFIG }, null, 2);
  return { compose, config: CONFIG, base64: `${Buffer.from(json, 'utf8').toString('base64')}\n` };
};

export function assertSafeAsaasWebhookTestTarget(environment: string, webhookUrl: string, allowedHosts: string[]) {
  if (environment.trim().toUpperCase() !== 'SANDBOX') {
    throw new Error('Synthetic Asaas webhook tests require ASAAS_ENV=SANDBOX.');
  }
  let target: URL;
  try {
    target = new URL(webhookUrl);
  } catch {
    throw new Error('Synthetic Asaas webhook target must be a valid HTTPS URL.');
  }
  if (target.protocol !== 'https:') throw new Error('Synthetic Asaas webhook target must use HTTPS.');
  if (/(^|[.-])(prod|production)([.-]|$)/i.test(target.hostname)) {
    throw new Error('Synthetic Asaas webhook tests cannot target a production hostname.');
  }
  const allowlist = new Set(allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean));
  if (allowlist.size === 0 || !allowlist.has(target.hostname.toLowerCase())) {
    throw new Error('Synthetic Asaas webhook target hostname is not in the staging allowlist.');
  }
}

export function assertSandboxTestDatabase(databaseUrl: string) {
  let target: URL;
  try {
    target = new URL(databaseUrl);
  } catch {
    throw new Error('Asaas Sandbox end-to-end tests require a local test database.');
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  const databaseName = target.pathname.replace(/^\//, '');
  if (!localHosts.has(target.hostname) || databaseName !== 'asaas_sandbox_test') {
    throw new Error('Asaas Sandbox end-to-end tests require a local test database named asaas_sandbox_test.');
  }
}

export function assertNgrokSandboxWebhookTarget(environment: string, webhookUrl: string) {
  let target: URL;
  try {
    target = new URL(webhookUrl);
  } catch {
    throw new Error('Asaas Sandbox webhook must use a valid ngrok HTTPS URL.');
  }
  const isNgrokHost = /(^|\.)ngrok(-free)?\.(app|dev)$/i.test(target.hostname);
  if (environment.trim().toUpperCase() !== 'SANDBOX') throw new Error('Temporary Asaas webhooks require ASAAS_ENV=SANDBOX.');
  if (target.protocol !== 'https:' || !isNgrokHost || /(^|[.-])(prod|production)([.-]|$)/i.test(target.hostname)) {
    throw new Error('Temporary Asaas webhook must target an HTTPS ngrok host, never production.');
  }
}

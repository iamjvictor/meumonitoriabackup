import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { expectedTargetDatabaseName, validateLocalTargetUrl } from './baseline-transfer.mjs';

export const LOCAL_SUPABASE_ADMIN_URL = 'postgresql://postgres:postgres@127.0.0.1:56322/postgres';

function quoteIdentifier(identifier) {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(identifier)) throw new Error('Identificador de banco local inválido.');
  return `"${identifier.replaceAll('"', '""')}"`;
}

function run(command, args, { cwd, timeout = 120_000, spawn = spawnSync } = {}) {
  const result = spawn(command, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    // CLI stderr can contain connection strings, storage paths or environment data.
    throw new Error(`${command} falhou (${result.status ?? 'sem status'}); detalhes locais foram omitidos para evitar vazamento de credenciais.`);
  }
  return result.stdout;
}

function targetUrl(databaseName) {
  const url = new URL(LOCAL_SUPABASE_ADMIN_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export function sanitizeSchemaDump(sql) {
  const removed = { ownership: 0, grants: 0, roleSwitches: 0 };
  const kept = [];
  const privilegedRoles = '"?(?:supabase_admin|supabase_auth_admin)"?(?=\\s|;|$)';
  for (const line of String(sql).split(/(?<=\n)/u)) {
    const statement = line.trimStart();
    const adminOwner = new RegExp(`\\bOWNER\\s+TO\\s+${privilegedRoles}`, 'iu');
    const adminDefaultPrivilege = new RegExp(`^ALTER\\s+DEFAULT\\s+PRIVILEGES\\s+FOR\\s+ROLE\\s+${privilegedRoles}`, 'iu');
    const adminRoleSwitch = new RegExp(`^SET\\s+(?:ROLE\\s+|SESSION\\s+AUTHORIZATION\\s+)${privilegedRoles}`, 'iu');
    if (/^ALTER\b/iu.test(statement) && adminOwner.test(statement)) {
      removed.ownership += 1;
    } else if (adminDefaultPrivilege.test(statement)) {
      removed.grants += 1;
    } else if (adminRoleSwitch.test(statement)) {
      removed.roleSwitches += 1;
    } else {
      kept.push(line);
    }
  }
  const sanitizedSql = kept.join('');
  if (!/\bCREATE\s+(?:TABLE|SCHEMA|FUNCTION|TYPE)\b/iu.test(sanitizedSql)) {
    throw new Error('Dump do schema ficou vazio após remover ownership/privileges.');
  }
  return { sql: sanitizedSql, removed, removedTotal: Object.values(removed).reduce((sum, count) => sum + count, 0) };
}

async function databaseExists(databaseName) {
  const require = createRequire(new URL('../../../backend/package.json', import.meta.url));
  const { Client } = require('pg');
  const client = new Client({ connectionString: LOCAL_SUPABASE_ADMIN_URL, application_name: 'model-comparison-local-preflight' });
  await client.connect();
  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    return result.rowCount > 0;
  } finally {
    await client.end();
  }
}

export async function provisionIsolatedDatabase({ testName, round, runId, workdir, dependencies = {} }) {
  const execute = dependencies.run ?? run;
  const exists = dependencies.databaseExists ?? databaseExists;
  const temporaryDirectory = dependencies.mkdtemp ?? mkdtemp;
  const remove = dependencies.rm ?? rm;
  const read = dependencies.readFile ?? readFile;
  const databaseName = expectedTargetDatabaseName(testName, round, runId);
  const connectionUrl = targetUrl(databaseName);
  validateLocalTargetUrl(connectionUrl, testName, round, runId);
  if (await exists(databaseName)) {
    throw new Error(`Banco de teste já existe; não será reutilizado: ${databaseName}`);
  }

  execute('psql', [LOCAL_SUPABASE_ADMIN_URL, '-X', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${quoteIdentifier(databaseName)} WITH TEMPLATE template0`], { cwd: workdir });
  const tempDirectory = await temporaryDirectory(join(tmpdir(), 'model-comparison-schema-'));
  const schemaPath = join(tempDirectory, 'schema.sql');
  try {
    execute('supabase', ['db', 'dump', '--workdir', 'dbtemp', '--local', '--schema', 'public,auth', '-f', schemaPath], { cwd: workdir, timeout: 180_000 });
    const dump = await read(schemaPath, 'utf8');
    const sanitizedDump = sanitizeSchemaDump(dump);
    await writeFile(schemaPath, sanitizedDump.sql, { mode: 0o600 });
    execute('psql', [connectionUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;'], { cwd: workdir });
    execute('psql', [connectionUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-f', schemaPath], { cwd: workdir, timeout: 180_000 });
    const require = createRequire(new URL('../../../backend/package.json', import.meta.url));
    const { Client } = require('pg');
    const target = new Client({ connectionString: connectionUrl, application_name: 'model-comparison-schema-preflight' });
    await target.connect();
    try {
      const result = await target.query("SELECT count(*)::int AS table_count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'");
      if (!result.rows[0]?.table_count) throw new Error('Schema local foi carregado sem tabelas public.');
      return { databaseName, connectionUrl, tableCount: result.rows[0].table_count, schemaSha256: createHash('sha256').update(await read(schemaPath)).digest('hex'), schemaSource: 'supabase db dump --local --schema public,auth; ownership and privilege statements removed so objects are owned by local postgres', removedSupabasePrivilegeStatements: sanitizedDump.removed, dataRowsCopied: 0 };
    } finally {
      await target.end();
    }
  } catch (error) {
    throw new Error(`Provisionamento local incompleto em ${databaseName}. O banco vazio pode permanecer para inspeção. Causa: ${error instanceof Error ? error.message : 'falha desconhecida'}`);
  } finally {
    await remove(tempDirectory, { recursive: true, force: true });
  }
}

export async function assertDatabaseDoesNotExist({ testName, round, runId }) {
  const databaseName = expectedTargetDatabaseName(testName, round, runId);
  validateLocalTargetUrl(targetUrl(databaseName), testName, round, runId);
  if (await databaseExists(databaseName)) throw new Error(`Database already exists and will not be reused: ${databaseName}`);
  return databaseName;
}

export function safeTargetUrl(databaseName, { testName, round, runId }) {
  const expected = expectedTargetDatabaseName(testName, round, runId);
  if (databaseName !== expected) throw new Error('Banco de destino diverge do runId allowlisted.');
  return targetUrl(databaseName);
}

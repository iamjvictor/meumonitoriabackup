import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

type Entry = { matrix: string; subject: string; topic: string; code: string; description: string };
const entries = JSON.parse(await readFile(new URL('../modules/question-bank/review/iff-competencies.json', import.meta.url), 'utf8')) as Entry[];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`INSERT INTO iff_competencies (id, matrix, subject, topic, code, description)
    SELECT x.id::uuid, x.matrix, x.subject, x.topic, x.code, x.description
    FROM jsonb_to_recordset($1::jsonb) AS x(id text, matrix text, subject text, topic text, code text, description text)
    ON CONFLICT (matrix, subject, code) DO UPDATE SET topic = EXCLUDED.topic, description = EXCLUDED.description`,
    [JSON.stringify(entries.map(e => ({ ...e, id: randomUUID() })))]);
  await client.query('COMMIT');
  console.log(`Importados ${entries.length} descritores.`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally { await client.end(); }

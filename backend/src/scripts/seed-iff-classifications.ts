import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

type Classification = {id: string; competenceCodes: string[]};
const names = ['portugues', 'matematica', 'humanas', 'ciencias'];
const entries = (await Promise.all(names.map(async name => JSON.parse(await readFile(new URL(`../modules/question-bank/review/iff-classification-${name}.json`, import.meta.url), 'utf8')) as Classification[]))).flat();
if (new Set(entries.map(e => e.id)).size !== entries.length) throw new Error('Questões duplicadas');
const pairs = entries.flatMap(e => e.competenceCodes.map(code => ({id: e.id, code})));
const client = new pg.Client({connectionString: process.env.DATABASE_URL});
await client.connect();
try {
 await client.query('BEGIN');
 const check = await client.query(`SELECT count(*)::int AS n FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, code text)
 JOIN question_bank_items q ON q.id=x.id
 JOIN iff_competencies c ON c.matrix='INTEGRADO' AND c.subject=q.subject AND c.code=x.code`, [JSON.stringify(pairs)]);
 if (check.rows[0].n !== pairs.length) throw new Error(`Referências inválidas: ${check.rows[0].n}/${pairs.length}`);
 const result = await client.query(`INSERT INTO iff_question_competencies(question_id, competency_id)
 SELECT q.id, c.id FROM jsonb_to_recordset($1::jsonb) AS x(id uuid, code text)
 JOIN question_bank_items q ON q.id=x.id
 JOIN iff_competencies c ON c.matrix='INTEGRADO' AND c.subject=q.subject AND c.code=x.code
 ON CONFLICT DO NOTHING`, [JSON.stringify(pairs)]);
 await client.query('COMMIT');
 console.log(`${entries.length} questões analisadas; ${entries.filter(e=>e.competenceCodes.length).length} com sugestões; ${result.rowCount} vínculos inseridos.`);
} catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }

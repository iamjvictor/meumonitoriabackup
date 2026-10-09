/**
 * Analisa o dataset da execução que você já abriu no Console da Apify.
 * Não inicia uma nova execução do Actor nem baixa questões adicionais.
 *
 * Cole um token novo da Apify em APIFY_API_TOKEN após revogar o token que
 * estava neste arquivo. Execute com: npx tsx TetseAPIFY.ts
 */
const API_TOKEN = "qk_bf0499525b37fc76ebf98c29797feefa22008ff49831915e";
const RUN_ID = "1PId451v7EHkvWDf2";
const API = "https://api.apify.com/v2";
const PAGE_SIZE = 1_000;

type Question = {
  institution?: string;
  question_id?: string | number;
  price_usd?: number;
};

type ActorRun = {
  defaultDatasetId?: string;
  status?: string;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Apify respondeu ${response.status}: ${body}`);
  }
  return response.json() as Promise<T>;
}

async function getAllQuestions(datasetId: string): Promise<Question[]> {
  const questions: Question[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(`${API}/datasets/${datasetId}/items`);
    url.searchParams.set("token", APIFY_API_TOKEN);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(offset));

    const page = await getJson<Question[]>(url.toString());
    questions.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return questions;
}

function printCostEstimates(questionCount: number) {
  // Preços publicados pelo Actor: evento de questão + item no Dataset.
  const tiers = [
    ["Sem desconto", 101],
    ["Bronze", 69.33],
    ["Silver", 37.67],
    ["Gold", 6],
  ] as const;

  console.log("\nEstimativa para essas questões (USD):");
  for (const [tier, pricePerThousand] of tiers) {
    const total = (questionCount * pricePerThousand) / 1_000;
    console.log(`  ${tier}: US$ ${total.toFixed(2)}`);
  }
  console.log("  O uso da plataforma e a cobrança da busca por instituições podem ser adicionais.");
}

async function main() {
  if (APIFY_API_TOKEN === "COLE_AQUI_SEU_TOKEN_APIFY") {
    throw new Error("Cole um token novo da Apify na constante APIFY_API_TOKEN.");
  }

  const runUrl = new URL(`${API}/actor-runs/${RUN_ID}`);
  runUrl.searchParams.set("token", APIFY_API_TOKEN);
  const runResponse = await getJson<{ data: ActorRun }>(runUrl.toString());
  const datasetId = runResponse.data.defaultDatasetId;

  if (!datasetId) {
    throw new Error(`A execução ${RUN_ID} ainda não tem um Dataset de saída.`);
  }

  const questions = await getAllQuestions(datasetId);
  const counts = new Map<string, number>();
  for (const question of questions) {
    const institution = question.institution?.trim() || "Instituição não informada";
    counts.set(institution, (counts.get(institution) ?? 0) + 1);
  }

  console.log(`Execução: ${RUN_ID} (${runResponse.data.status ?? "status indisponível"})`);
  console.log(`Questões no Dataset: ${questions.length}\n`);
  console.log("Instituição / vestibular | Questões");
  console.log("-------------------------|---------");
  for (const [institution, count] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${institution} | ${count}`);
  }

  printCostEstimates(questions.length);
  console.log("\nA tabela reflete somente as questões presentes no Dataset desta execução.");
  console.log("Para estimar o catálogo inteiro, será preciso consultar todas as instituições e páginas; isso gera cobranças por questão retornada.");
}

main().catch((error: unknown) => {
  console.error("Falha ao consultar a execução da Apify:", error);
  process.exitCode = 1;
});

export type GranQuestion = {
  id: string | number;
  hashId?: string | null;
  hash?: string | null;
  slug?: string | null;
  dificuldade?: number | string | null;
  enunciado?: string | null;
  resposta?: string | number | null;
  anulada?: boolean;
  desatualizada?: boolean;
  hasImageItens?: boolean;
  itens?: Array<{
    id: string | number;
    rotulo?: string | null;
    corpo?: string | null;
    corpo_clean?: string | null;
    ordem?: number;
  }>;
  assuntos?: Array<{
    id: string | number;
    nome?: string | null;
    nome_clean?: string | null;
    pai?: string | number | null;
    assunto_raiz?: string | number | null;
    materia?: boolean;
  }>;
  bancas?: Array<{ nome?: string | null; sigla?: string | null }>;
  orgaos?: Array<{ nome?: string | null; sigla?: string | null }>;
  cargos?: Array<{ descricao?: string | null }>;
  anos?: number[];
  provas?: Array<{
    nome?: string | null;
    ano?: number | null;
    nivel?: string | null;
    banca?: { nome?: string | null; sigla?: string | null };
    orgao?: { nome?: string | null; sigla?: string | null };
    cargo?: { descricao?: string | null };
  }>;
  [key: string]: unknown;
};

export type GranQuestionPage = {
  message?: { slug?: string; text?: string };
  pagination?: boolean;
  data?: {
    total?: number;
    perPage?: number;
    pages?: number;
    page?: number;
    rows?: GranQuestion[];
  };
};

export type GranQuestionClientOptions = {
  token: string;
  clientId: string;
  baseUrl?: string;
  timeoutMs?: number;
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
  onEvent?: (event: Record<string, unknown>) => void;
};

export const GRAN_DEFAULT_FILTERS = {
  subjects: ['403825', '404257', '43', '403794'],
  boards: ['26'],
  perPage: 100,
  marcarResolvidas: '1',
  resolucao: 'TODAS',
  anulada: '0',
  desatualizada: '0',
  sort: [{ anos: 'desc' }, { _score: 'desc' }],
} as const;

export class GranQuestionClient {
  private lastRequestAt = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: GranQuestionClientOptions) {
    options.token = options.token.trim().replace(/^Bearer\s+/i, '');
    try {
      const payload = JSON.parse(Buffer.from(options.token.split('.')[1] ?? '', 'base64url').toString());
      if (payload.id !== options.clientId.trim()) throw new Error();
      if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) throw new Error();
    } catch {
      throw new Error('Token Gran inválido, expirado ou incompatível com x-client-id. Copie novamente do navegador.');
    }
    options.clientId = options.clientId.trim();
    this.fetchImpl = options.fetchImpl ?? curlFetch;
    this.baseUrl = options.baseUrl ?? 'https://rota-api.grancursosonline.com.br/v1/elastic/questao';
  }

  async listQuestions(page: number, perPage: number = GRAN_DEFAULT_FILTERS.perPage): Promise<GranQuestionPage> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('perPage', String(perPage));
    url.searchParams.set('page', String(page));
    url.searchParams.set('marcarResolvidas', GRAN_DEFAULT_FILTERS.marcarResolvidas);
    for (const subjectId of GRAN_DEFAULT_FILTERS.subjects) url.searchParams.append('assunto[]', subjectId);
    for (const boardId of GRAN_DEFAULT_FILTERS.boards) url.searchParams.append('banca[]', boardId);
    url.searchParams.set('resolucao', GRAN_DEFAULT_FILTERS.resolucao);
    url.searchParams.set('anulada', GRAN_DEFAULT_FILTERS.anulada);
    url.searchParams.set('desatualizada', GRAN_DEFAULT_FILTERS.desatualizada);
    url.searchParams.set('sort', JSON.stringify(GRAN_DEFAULT_FILTERS.sort));

    const timeoutMs = this.options.timeoutMs ?? 45_000;
    let response: Response | undefined;
    let serverErrors = 0;
    let rateLimitRetries = 0;
    let transportErrors = 0;
    while (true) {
      await this.waitForRateLimit();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let requestError: unknown;
      response = undefined;
      this.options.onEvent?.({ event: "gran_request", page, perPage });
      try {
        response = await this.fetchImpl(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            Authorization: this.options.token.startsWith('Bearer ')
              ? this.options.token
              : `Bearer ${this.options.token}`,
            Origin: 'https://questoes.grancursosonline.com.br',
            Priority: 'u=1, i',
            Referer: 'https://questoes.grancursosonline.com.br/',
            'Sec-CH-UA': '"Brave";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
            'Sec-CH-UA-Mobile': '?1',
            'Sec-CH-UA-Platform': '"Android"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'Sec-GPC': '1',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
            'x-client-id': this.options.clientId,
          },
          signal: controller.signal,
        });
      } catch (error) {
        requestError = error;
      } finally {
        clearTimeout(timeout);
      }
      this.lastRequestAt = Date.now();
      if (requestError) {
        this.options.onEvent?.({ event: "gran_transport_error", page, attempt: transportErrors + 1 });
        if (transportErrors++ >= 3) throw requestError;
        continue;
      }
      if (!response) throw new Error(`Gran API não respondeu na página ${page}.`);
      this.options.onEvent?.({ event: "gran_response", page, status: response.status });
      transportErrors = 0;
      if (response.status === 429) {
        if (rateLimitRetries >= 3) throw new Error(`Gran HTTP 429 persistente na página ${page}; coleta interrompida para retomada.`);
        const minimum = this.options.minIntervalMs ?? 1_500;
        const delayMs = retryDelayMs(response.headers.get('retry-after'), rateLimitRetries++);
        if (delayMs > minimum) await new Promise((resolve) => setTimeout(resolve, delayMs - minimum));
        continue;
      }
      if (![500, 502, 503, 504].includes(response.status) || serverErrors >= 3) break;
      const delayMs = retryDelayMs(response.headers.get('retry-after'), serverErrors++);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (!response?.ok) {
      throw new Error(`Gran API respondeu HTTP ${response?.status ?? 'sem resposta'} na página ${page}.`);
    }

    let payload: GranQuestionPage;
    try {
      payload = await response.json() as GranQuestionPage;
    } catch {
      throw new Error(`Gran API retornou JSON inválido na página ${page}.`);
    }
    if (payload.message?.slug !== 'OK' || !payload.data || !Array.isArray(payload.data.rows)) {
      throw new Error(`Gran API retornou uma estrutura inesperada na página ${page}.`);
    }
    if (!Number.isInteger(payload.data.total) || !Number.isInteger(payload.data.pages)) {
      throw new Error(`Gran API não informou total/páginas válidos na página ${page}.`);
    }
    if (payload.data.page !== undefined && payload.data.page !== page) {
      throw new Error(`Gran API retornou página ${payload.data.page} quando foi solicitada ${page}.`);
    }
    return payload;
  }

  private async waitForRateLimit() {
    const minimum = this.options.minIntervalMs ?? 1_500;
    const wait = minimum - (Date.now() - this.lastRequestAt);
    if (wait > 0) {
      this.options.onEvent?.({ event: 'gran_wait', seconds: Math.ceil(wait / 1000) });
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
import { spawn } from 'node:child_process';


/** Credentials reach curl through stdin, never command-line arguments. */
const curlFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  const cookieHeader = Array.from(granCookies, ([name, value]) => `${name}=${value}`).join('; ');
  const config = [
    `url = ${curlConfigQuote(String(input))}`,
    'request = "GET"',
    ...Array.from(headers.entries(), ([name, value]) => `header = ${curlConfigQuote(`${name}: ${value}`)}`),
    ...(cookieHeader ? [`cookie = ${curlConfigQuote(cookieHeader)}`] : []),
  ].join('\n');
  const child = spawn('curl', [
    '--silent', '--show-error', '--compressed', '--globoff', '--suppress-connect-headers', '--dump-header', '-', '--config', '-',
    '--write-out', '\n__GRAN_HTTP_STATUS__%{http_code}',
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

  const abort = () => child.kill('SIGTERM');
  if (init?.signal?.aborted) abort();
  else init?.signal?.addEventListener('abort', abort, { once: true });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code ?? 1));
    child.stdin.end(config);
  }).finally(() => init?.signal?.removeEventListener('abort', abort));

  if (init?.signal?.aborted) throw new Error('Gran: tempo limite da requisição excedido.');
  if (exitCode !== 0) throw new Error(`Gran curl encerrou com código ${exitCode}.`);
  const output = Buffer.concat(stdout).toString('utf8');
  const match = output.match(/\n__GRAN_HTTP_STATUS__(\d{3})$/);
  if (!match) {
    const detail = Buffer.concat(stderr).toString('utf8').trim();
    throw new Error(`Gran curl falhou${detail ? `: ${detail}` : ` (código ${exitCode})`}.`);
  }
  const status = Number(match[1]);
  const responseBlock = output.slice(0, match.index);
  const separator = responseBlock.indexOf('\r\n\r\n');
  const headerBlock = separator >= 0 ? responseBlock.slice(0, separator) : '';
  const body = separator >= 0 ? responseBlock.slice(separator + 4) : responseBlock;
  const responseHeaders = new Headers();
  for (const line of headerBlock.split(/\r?\n/).slice(1)) {
    const colon = line.indexOf(':');
    if (colon > 0) responseHeaders.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  for (const setCookie of responseHeaders.getSetCookie()) {
    const pair = setCookie.split(';', 1)[0];
    if (!pair) continue;
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex > 0) {
      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (value) granCookies.set(name, value);
      else granCookies.delete(name);
    }
  }
  return new Response(body, { status, headers: responseHeaders });
};

const granCookies = new Map<string, string>();

function curlConfigQuote(value: string) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function retryDelayMs(value: string | null, attempt: number) {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return Math.max(60_000, Math.min(seconds * 1_000, 300_000));
    const dateDelay = Date.parse(value) - Date.now();
    if (Number.isFinite(dateDelay) && dateDelay > 0) return Math.max(60_000, Math.min(dateDelay, 300_000));
  }
  return 60_000;
}

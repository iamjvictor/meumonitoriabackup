export type ResendEmailInput = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  idempotencyKey: string;
};

export type ResendEmailResult = { id: string };

export class ResendEmailError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'ResendEmailError';
  }
}

export class ResendEmailProvider {
  private static readonly REQUEST_TIMEOUT_MS = 30_000;
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly endpoint = 'https://api.resend.com/emails',
    private readonly timeoutMs = ResendEmailProvider.REQUEST_TIMEOUT_MS,
  ) {
    if (!apiKey.trim()) throw new Error('Resend API key is required');
  }

  async send(input: ResendEmailInput): Promise<ResendEmailResult> {
    if (!input.idempotencyKey.trim()) throw new ResendEmailError('Email idempotency key is required');
    if (!input.from.trim() || !input.subject.trim() || !input.html.trim()) {
      throw new ResendEmailError('Email from, subject and html are required');
    }

    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      response = await this.fetcher(this.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({
          from: input.from,
          to: Array.isArray(input.to) ? input.to : [input.to],
          subject: input.subject,
          html: input.html,
          ...(input.text ? { text: input.text } : {}),
        }),
      });
    } catch {
      throw new ResendEmailError('Resend request failed before a response was received');
    } finally {
      clearTimeout(timeout);
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
      const message = typeof record.message === 'string' ? record.message : 'Resend rejected the email request';
      throw new ResendEmailError(message, response.status);
    }

    const id = body && typeof body === 'object' ? (body as Record<string, unknown>).id : undefined;
    if (typeof id !== 'string' || !id) throw new ResendEmailError('Resend response did not include an email ID', response.status);
    return { id };
  }
}

export type ApiFieldErrors = Record<string, string[]>;

export type ApiErrorDetails = {
  code: string;
  message: string;
  statusCode: number | null;
  fieldErrors: ApiFieldErrors;
};

const genericMessages: Record<string, string> = {
  VALIDATION_ERROR: 'Confira os dados do cadastro e corrija os campos indicados.',
  UNAUTHENTICATED: 'Sua sessão expirou. Entre novamente para continuar o cadastro.',
  FORBIDDEN: 'Esta conta não tem permissão para concluir o cadastro de professor.',
  EMAIL_PROVIDER_DISABLED: 'O cadastro por e-mail está temporariamente indisponível. Tente novamente mais tarde.',
  EMAIL_ALREADY_REGISTERED: 'Já existe uma conta com este e-mail. Entre ou use a recuperação de senha.',
  SIGNUP_UNAVAILABLE: 'Não foi possível concluir o cadastro. Se este e-mail já tiver uma conta, entre ou recupere sua senha; caso contrário, tente novamente.',
  PROFILE_REGISTRATION_FAILED: 'Não foi possível salvar seu perfil. Seus dados continuam preenchidos; tente novamente.',
  INTERNAL_SERVER_ERROR: 'Ocorreu um erro no servidor. Tente novamente em alguns instantes.',
  RATE_LIMIT_EXCEEDED: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
  TOO_MANY_REQUESTS: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
};

const fieldMessages: Record<string, string> = {
  email: 'Informe um e-mail válido.',
  password: 'A senha deve ter pelo menos 8 caracteres, com maiúscula, minúscula, número e símbolo.',
  fullName: 'Informe seu nome completo ou razão social.',
  name: 'Informe seu nome completo ou razão social.',
  phone: 'Informe um telefone ou WhatsApp válido.',
  whatsapp: 'Informe um telefone ou WhatsApp válido.',
  documentNumber: 'Confira o CPF ou CNPJ informado.',
  cpf: 'Confira o CPF ou CNPJ informado.',
  docType: 'Selecione CPF ou CNPJ.',
  username: 'Escolha um nome de usuário com 3 a 60 caracteres, usando letras, números e hífens.',
  pageSlug: 'O endereço da página deve ter de 3 a 60 caracteres, usando letras, números e hífens.',
  area: 'Selecione sua área de atuação.',
  customArea: 'Informe sua área de atuação.',
  bio: 'A biografia excede o tamanho permitido.',
  agreedTerms: 'É necessário aceitar os termos para concluir o cadastro.',
  avatarUrl: 'Não foi possível salvar a imagem. Tente enviar outra foto.',
  instagram: 'Confira o nome informado para o Instagram.',
  tiktok: 'Confira o nome informado para o TikTok.',
  youtube: 'Confira o canal informado para o YouTube.',
};

const fieldLabels: Record<string, string> = {
  email: 'E-mail',
  password: 'Senha',
  fullName: 'Nome',
  name: 'Nome',
  phone: 'Telefone',
  whatsapp: 'WhatsApp',
  documentNumber: 'CPF/CNPJ',
  cpf: 'CPF/CNPJ',
  docType: 'Tipo de documento',
  username: 'Nome de usuário',
  pageSlug: 'Endereço da página',
  area: 'Área de atuação',
  customArea: 'Área personalizada',
  bio: 'Biografia',
  agreedTerms: 'Termos',
  avatarUrl: 'Foto de perfil',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

export class ApiError extends Error implements ApiErrorDetails {
  readonly code: string;
  readonly statusCode: number | null;
  readonly fieldErrors: ApiFieldErrors;

  constructor(details: ApiErrorDetails) {
    super(details.message);
    this.name = 'ApiError';
    this.code = details.code;
    this.statusCode = details.statusCode;
    this.fieldErrors = details.fieldErrors;
  }
}

export function createApiError(code: string, message: string, fieldErrors: ApiFieldErrors = {}): ApiError {
  return new ApiError({ code, message, statusCode: null, fieldErrors });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function localizedFieldMessage(field: string, value: unknown): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate === 'string' && candidate.trim()) {
    const message = candidate.trim();
    if (/[áàâãéêíóôõúç]/i.test(message) && !/too (small|big)|invalid input|expected string|must be/i.test(message)) {
      return message;
    }
  }
  return fieldMessages[field] ?? 'Confira este campo.';
}

function extractFieldErrors(details: unknown): ApiFieldErrors {
  const record = asRecord(details);
  if (!record) return {};

  const nested = asRecord(record.fieldErrors);
  const source = nested ?? record;
  const errors: ApiFieldErrors = {};

  for (const [field, value] of Object.entries(source)) {
    if (field === 'formErrors' || field === 'fieldErrors' || field === 'issues') continue;
    const message = localizedFieldMessage(field, value);
    if (Array.isArray(value) || typeof value === 'string') errors[field] = [message];
  }

  if (Array.isArray(record.issues)) {
    for (const issue of record.issues) {
      const issueRecord = asRecord(issue);
      const path = issueRecord?.path;
      const field = Array.isArray(path) ? path.map(String).join('.') : '';
      if (!field) continue;
      errors[field] = [localizedFieldMessage(field, issueRecord?.message)];
    }
  }

  return errors;
}

function messageFor(code: string, statusCode: number, apiMessage: unknown, fallback: string): string {
  if (genericMessages[code]) return genericMessages[code];
  if (statusCode === 429) return genericMessages.RATE_LIMIT_EXCEEDED!;
  if (statusCode >= 500) return genericMessages.INTERNAL_SERVER_ERROR!;
  if (typeof apiMessage === 'string' && apiMessage.trim() && apiMessage !== code) return apiMessage.trim();
  if (statusCode === 401) return genericMessages.UNAUTHENTICATED!;
  if (statusCode === 403) return genericMessages.FORBIDDEN!;
  return fallback;
}

export async function apiErrorFromResponse(response: Response, fallback: string): Promise<ApiError> {
  const payload = await response.json().catch(() => null) as unknown;
  const root = asRecord(payload) ?? {};
  const nestedError = asRecord(root.error);
  const errorString = typeof root.error === 'string' ? root.error : undefined;
  const code = String(nestedError?.code ?? root.code ?? errorString ?? 'REQUEST_FAILED');
  const apiMessage = nestedError?.message ?? root.message;
  const details = nestedError?.details ?? root.details;

  return new ApiError({
    code,
    statusCode: response.status,
    message: messageFor(code, response.status, apiMessage, fallback),
    fieldErrors: extractFieldErrors(details),
  });
}

export function normalizeApiError(error: unknown, fallback: string): ApiError {
  if (error instanceof ApiError) return error;

  const candidate = asRecord(error);
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  if (code && typeof candidate?.message === 'string') {
    const statusCode = typeof candidate.statusCode === 'number' ? candidate.statusCode : null;
    return new ApiError({
      code,
      statusCode,
      message: genericMessages[code] ?? candidate.message,
      fieldErrors: extractFieldErrors(candidate.fieldErrors),
    });
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return new ApiError({ code: 'REQUEST_ABORTED', statusCode: null, message: 'A solicitação foi interrompida. Tente novamente.', fieldErrors: {} });
  }
  if (error instanceof TypeError) {
    return new ApiError({ code: 'NETWORK_ERROR', statusCode: null, message: 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.', fieldErrors: {} });
  }

  return new ApiError({ code: 'UNEXPECTED_ERROR', statusCode: null, message: fallback, fieldErrors: {} });
}

export function getApiFieldLabel(field: string): string {
  const rootField = field.split('.')[0] ?? field;
  return fieldLabels[rootField] ?? rootField;
}

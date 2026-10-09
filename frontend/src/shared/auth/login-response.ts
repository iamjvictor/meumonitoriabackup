type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function readToken(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function extractAccessToken(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  const data = isRecord(payload.data) ? payload.data : null;
  return (
    readToken(data?.accessToken) ||
    readToken(isRecord(data?.session) ? data.session.accessToken : null) ||
    readToken(payload.token)
  );
}

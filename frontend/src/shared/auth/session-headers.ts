export function buildStudentAuthHeaders(
  token: string | null,
  initial: Record<string, string> = {},
): Record<string, string> {
  if (!token || initial.Authorization) return initial;
  return { ...initial, Authorization: `Bearer ${token}` };
}

type AccountStatusMirror = {
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  generalStatus?: string;
  commercialInfoStatus?: string;
  bankAccountStatus?: string;
  documentationStatus?: string;
  verified?: boolean;
};

const DIMENSIONS = [
  ['GENERAL_APPROVAL', 'generalStatus'],
  ['COMMERCIAL_INFO', 'commercialInfoStatus'],
  ['BANK_ACCOUNT_INFO', 'bankAccountStatus'],
  ['DOCUMENT', 'documentationStatus'],
] as const;

export function mapAsaasAccountStatusEvent(eventType: string): AccountStatusMirror | null {
  const normalized = eventType.trim().toUpperCase();
  const dimension = DIMENSIONS.find(([fragment]) => normalized.includes(fragment));
  if (!dimension) return null;

  const value = normalized.endsWith('_APPROVED')
    ? 'APPROVED'
    : normalized.endsWith('_REJECTED')
      ? 'REJECTED'
      : normalized.endsWith('_AWAITING_APPROVAL')
        ? 'AWAITING_APPROVAL'
        : normalized.endsWith('_PENDING')
          ? 'PENDING'
        : normalized.endsWith('_EXPIRED')
          ? 'EXPIRED'
          : normalized.endsWith('_EXPIRING_SOON')
            ? 'EXPIRING_SOON'
          : null;
  if (!value) return null;

  const [fragment, field] = dimension;
  const mirrored: AccountStatusMirror = { [field]: value };
  if (fragment === 'GENERAL_APPROVAL') {
    mirrored.status = value === 'APPROVED' ? 'APPROVED' : value === 'REJECTED' ? 'REJECTED' : 'PENDING';
    mirrored.verified = value === 'APPROVED';
  }
  return mirrored;
}

const STATUS_VALUES = new Set(['APPROVED', 'REJECTED', 'PENDING', 'AWAITING_APPROVAL', 'EXPIRED', 'EXPIRING_SOON']);
type AccountStatusDimensionField = 'generalStatus' | 'commercialInfoStatus' | 'bankAccountStatus' | 'documentationStatus';

export function mapAsaasAccountStatusSnapshot(eventType: string, snapshot: unknown): AccountStatusMirror | null {
  const normalized = eventType.trim().toUpperCase();
  const eventMirror = mapAsaasAccountStatusEvent(normalized);
  if (!eventMirror) return null;
  const record = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot as Record<string, unknown> : {};
  const values: Array<[string, AccountStatusDimensionField]> = [
    ['general', 'generalStatus'],
    ['commercialInfo', 'commercialInfoStatus'],
    ['bankAccountInfo', 'bankAccountStatus'],
    ['documentation', 'documentationStatus'],
  ];
  const mirror: AccountStatusMirror = {};
  for (const [source, target] of values) {
    const value = record[source];
    if (typeof value === 'string' && STATUS_VALUES.has(value.toUpperCase())) mirror[target] = value.toUpperCase();
  }
  // The event is authoritative for its own dimension if an older provider payload omits it.
  Object.assign(mirror, eventMirror);
  // Snapshot dimensions do not independently confirm overall approval; require the general event.
  if (!normalized.includes('GENERAL_APPROVAL')) {
    delete mirror.status;
    delete mirror.verified;
  }
  return mirror;
}

export function getAsaasAccountStatusTimestampField(eventType: string) {
  const normalized = eventType.trim().toUpperCase();
  const dimension = DIMENSIONS.find(([fragment]) => normalized.includes(fragment));
  if (!dimension) return null;
  switch (dimension[1]) {
    case 'generalStatus': return 'generalStatusEventAt' as const;
    case 'commercialInfoStatus': return 'commercialInfoStatusEventAt' as const;
    case 'bankAccountStatus': return 'bankAccountStatusEventAt' as const;
    case 'documentationStatus': return 'documentationStatusEventAt' as const;
  }
}

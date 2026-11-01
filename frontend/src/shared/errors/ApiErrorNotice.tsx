'use client';

import { AlertCircle } from 'lucide-react';
import type { ApiError } from './api-error';
import { getApiFieldLabel } from './api-error';

export function ApiErrorNotice({ error }: { error: ApiError }) {
  const entries = Object.entries(error.fieldErrors);

  return (
    <div role="alert" aria-live="polite" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold">{error.message}</p>
          {entries.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-1 text-rose-800">
              {entries.map(([field, messages]) => (
                <li key={field}>
                  <span className="font-semibold">{getApiFieldLabel(field)}:</span> {messages.join(' ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

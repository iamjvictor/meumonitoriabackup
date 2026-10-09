import type { ReactNode } from 'react';
export function MonitorFlashcardsTab({ children }: { children?: ReactNode }) { return <section aria-label="Flashcards" className="mx-auto grid max-w-5xl gap-4">{children}</section>; }

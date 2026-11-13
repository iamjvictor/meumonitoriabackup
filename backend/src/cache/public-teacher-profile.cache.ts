export const PUBLIC_TEACHER_PROFILE_CACHE_TTL_MS = 60_000;
export const PUBLIC_TEACHER_PROFILE_CACHE_MAX_ENTRIES = 1_000;

type Entry = { value: unknown; expiresAt: number; generation: number };

export class PublicTeacherProfileCache {
  private readonly entries = new Map<string, Entry>();
  private readonly generations = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = PUBLIC_TEACHER_PROFILE_CACHE_TTL_MS,
    private readonly maxEntries = PUBLIC_TEACHER_PROFILE_CACHE_MAX_ENTRIES,
  ) {}

  async get<T>(pageSlug: string): Promise<T | null> {
    const entry = this.entries.get(pageSlug);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(pageSlug);
      return null;
    }
    this.entries.delete(pageSlug);
    this.entries.set(pageSlug, entry);
    return entry.value as T;
  }

  async set(pageSlug: string, profile: unknown, expectedGeneration = this.generation(pageSlug)): Promise<void> {
    if (this.generation(pageSlug) !== expectedGeneration) return;
    this.entries.delete(pageSlug);
    this.entries.set(pageSlug, { value: profile, expiresAt: this.now() + this.ttlMs, generation: expectedGeneration });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  async invalidate(pageSlug: string): Promise<void> {
    this.entries.delete(pageSlug);
    this.generations.set(pageSlug, this.generation(pageSlug) + 1);
  }

  generation(pageSlug: string) { return this.generations.get(pageSlug) ?? 0; }
}

export const publicTeacherProfileCache = new PublicTeacherProfileCache();

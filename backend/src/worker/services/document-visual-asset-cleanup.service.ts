import { prisma } from '../../lib/prisma.js';
import { supabaseAdmin } from '../../lib/supabase.js';

const BUCKET = 'document-parser-artifacts';

type CleanupDatabase = {
  documentVisualAsset: {
    findMany(args: unknown): Promise<Array<{ id: string; storagePath: string }>>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
};
type CleanupStorage = { remove(paths: string[]): Promise<{ error: unknown | null }> };

/** Remove private files before their rows so a failed Storage call never leaves a valid DB reference to missing bytes. */
export class DocumentVisualAssetCleanupService {
  constructor(
    private readonly database: CleanupDatabase = prisma as unknown as CleanupDatabase,
    private readonly storage: CleanupStorage = supabaseAdmin.storage.from(BUCKET) as unknown as CleanupStorage,
  ) {}

  async cleanupParseRun(documentId: string, parseRunId: string): Promise<{ removedCount: number; retainedCount: number }> {
    const rows = await this.database.documentVisualAsset.findMany({
      where: { documentId, parseRunId }, select: { id: true, storagePath: true },
    });
    let removedCount = 0;
    for (const row of rows) {
      const { error } = await this.storage.remove([row.storagePath]);
      if (error) continue;
      await this.database.documentVisualAsset.deleteMany({ where: { id: row.id, documentId, parseRunId } });
      removedCount++;
    }
    return { removedCount, retainedCount: rows.length - removedCount };
  }
}

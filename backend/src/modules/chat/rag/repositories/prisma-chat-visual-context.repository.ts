import { Prisma } from '@prisma/client';
import { prisma } from '../../../../lib/prisma.js';
import type { ChatVisualAssetReference, VisualContextScope } from '../services/chat-visual-context.service.js';

export class PrismaChatVisualContextRepository {
  async questionAssets(questionId: string, scope: VisualContextScope): Promise<ChatVisualAssetReference[]> {
    return prisma.$queryRaw<ChatVisualAssetReference[]>(Prisma.sql`
      SELECT dva.id::text AS "assetId", dva.page_number AS page, dva.checksum,
        dvi.description
      FROM questions q
      JOIN question_visual_assets qva ON qva.question_id = q.id
      JOIN document_visual_assets dva ON dva.id = qva.visual_asset_id
      LEFT JOIN document_visual_asset_indexes dvi ON dvi.visual_asset_id = dva.id
      WHERE q.id = ${questionId}::uuid
        AND q.teacher_id = ${scope.teacherId}::uuid
        AND q.monitor_id = ${scope.monitorId}::uuid
        AND q.subject_id = ${scope.subjectId}::uuid
        AND qva.association_method <> 'PAGE_CANDIDATE'
      ORDER BY qva.confidence DESC NULLS LAST, dva.page_number, dva.created_at
      LIMIT 4
    `);
  }

  async knowledgeAssets(assetIds: string[], scope: VisualContextScope): Promise<ChatVisualAssetReference[]> {
    if (assetIds.length === 0) return [];
    return prisma.$queryRaw<ChatVisualAssetReference[]>(Prisma.sql`
      SELECT dva.id::text AS "assetId", dva.page_number AS page, dva.checksum, dvi.description
      FROM document_visual_assets dva
      JOIN monitor_documents d ON d.id = dva.document_id
      LEFT JOIN document_visual_asset_indexes dvi ON dvi.visual_asset_id = dva.id
      WHERE dva.id IN (${Prisma.join(assetIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND d.teacher_id = ${scope.teacherId}::uuid
        AND d.monitor_id = ${scope.monitorId}::uuid
        AND d.subject_id = ${scope.subjectId}::uuid
      ORDER BY dva.page_number, dva.created_at
      LIMIT 4
    `);
  }

  async studentAssets(_assetIds: string[], _scope: VisualContextScope): Promise<ChatVisualAssetReference[]> {
    if (_assetIds.length === 0) return [];
    return prisma.$queryRaw<ChatVisualAssetReference[]>(Prisma.sql`
      SELECT a.id::text AS "assetId", NULL::integer AS page, a.checksum, NULL::text AS description
      FROM chat_image_attachments a
      WHERE a.id IN (${Prisma.join(_assetIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND a.student_id = ${_scope.studentId}::uuid
        AND a.monitor_id = ${_scope.monitorId}::uuid
        AND a.subject_id = ${_scope.subjectId}::uuid
        AND a.expires_at > NOW()
      ORDER BY a.created_at
      LIMIT 1
    `);
  }
}

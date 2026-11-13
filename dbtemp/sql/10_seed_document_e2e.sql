BEGIN;

INSERT INTO teachers (
  id, user_id, full_name, email, username, area, page_slug, role, status,
  terms_accepted_at, created_at, updated_at
) VALUES (
  'e2000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000002',
  'Professor Avaliação OCR', 'ocr-e2e@local.test', 'ocr-e2e', 'Química', 'ocr-e2e',
  'teacher', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT (id) DO NOTHING;

INSERT INTO monitors (id, teacher_id, name, description, status, created_at, updated_at)
VALUES (
  'e2000000-0000-4000-8000-000000000003',
  'e2000000-0000-4000-8000-000000000001',
  'Avaliação OCR de Química', 'Ambiente local dbtemp para teste de documentos.',
  'DRAFT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT (id) DO NOTHING;

INSERT INTO monitor_subjects (id, monitor_id, name, position, created_at, updated_at)
VALUES (
  'e2000000-0000-4000-8000-000000000004',
  'e2000000-0000-4000-8000-000000000003',
  'Química', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT (id) DO NOTHING;

INSERT INTO monitor_topics (id, subject_id, name, position, created_at, updated_at)
VALUES (
  'e2000000-0000-4000-8000-000000000005',
  'e2000000-0000-4000-8000-000000000004',
  'Estequiometria e soluções', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT (id) DO NOTHING;

INSERT INTO monitor_documents (
  id, teacher_id, monitor_id, subject_id, topic_id, tag, original_name,
  storage_path, mime_type, size_bytes, status, processing_version, created_at, updated_at
) VALUES
  ('e2000000-0000-4000-8000-000000000010', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000005', 'KNOWLEDGE_BASE', 'Estequiometria.pdf', 'Estequiometria.pdf', 'application/pdf', 3374776, 'QUEUED', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('e2000000-0000-4000-8000-000000000011', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000005', 'KNOWLEDGE_BASE', 'pH e pOH.pdf', 'pH e pOH.pdf', 'application/pdf', 640413, 'QUEUED', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('e2000000-0000-4000-8000-000000000012', 'e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000005', 'QUESTIONS', 'Quimica-3.pdf', 'Quimica-3.pdf', 'application/pdf', 599300, 'QUEUED', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET size_bytes = EXCLUDED.size_bytes, updated_at = CURRENT_TIMESTAMP;

-- Documents carry topicId for filtering; the extraction agent reads the
-- explicit document-topic join, so seed that link for all three fixtures.
INSERT INTO monitor_document_topics (document_id, topic_id)
VALUES
  ('e2000000-0000-4000-8000-000000000010', 'e2000000-0000-4000-8000-000000000005'),
  ('e2000000-0000-4000-8000-000000000011', 'e2000000-0000-4000-8000-000000000005'),
  ('e2000000-0000-4000-8000-000000000012', 'e2000000-0000-4000-8000-000000000005')
ON CONFLICT DO NOTHING;

COMMIT;

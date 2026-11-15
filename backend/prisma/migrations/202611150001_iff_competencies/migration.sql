CREATE TABLE "iff_competencies" (
  "id" UUID NOT NULL,
  "matrix" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  CONSTRAINT "iff_competencies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "iff_competencies_matrix_subject_code_key" ON "iff_competencies"("matrix", "subject", "code");
CREATE INDEX "iff_competencies_subject_topic_idx" ON "iff_competencies"("subject", "topic");
CREATE TABLE "iff_question_competencies" (
  "question_id" UUID NOT NULL,
  "competency_id" UUID NOT NULL,
  CONSTRAINT "iff_question_competencies_pkey" PRIMARY KEY ("question_id", "competency_id"),
  CONSTRAINT "iff_question_competencies_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question_bank_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "iff_question_competencies_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "iff_competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "iff_question_competencies_competency_id_idx" ON "iff_question_competencies"("competency_id");

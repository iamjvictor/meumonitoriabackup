BEGIN;
CREATE TABLE public.question_bank_item_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_bank_item_id uuid NOT NULL REFERENCES public.question_bank_items(id) ON DELETE CASCADE,
  public_url text NOT NULL CHECK (public_url ~ '^https?://'),
  position integer NOT NULL CHECK (position > 0),
  source_page integer CHECK (source_page > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_bank_item_id, position)
);
ALTER TABLE public.question_bank_item_images ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.question_bank_item_images FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.question_bank_item_images TO service_role;
COMMIT;

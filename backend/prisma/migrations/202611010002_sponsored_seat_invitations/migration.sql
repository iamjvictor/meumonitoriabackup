CREATE TABLE "sponsored_seat_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "seat_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsored_seat_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sponsored_seat_invitations_seat_id_key" ON "sponsored_seat_invitations"("seat_id");
CREATE UNIQUE INDEX "sponsored_seat_invitations_token_hash_key" ON "sponsored_seat_invitations"("token_hash");
CREATE INDEX "sponsored_seat_invitations_expires_at_idx" ON "sponsored_seat_invitations"("expires_at");

ALTER TABLE "sponsored_seat_invitations"
ADD CONSTRAINT "sponsored_seat_invitations_seat_id_fkey"
FOREIGN KEY ("seat_id") REFERENCES "sponsored_seats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sponsored_seat_invitations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "sponsored_seat_invitations" FROM anon, authenticated;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "is_service_account" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "users_is_service_account_idx" ON "users"("is_service_account");

-- Data migration: flag existing claude-agent user as service account
UPDATE "users" SET "is_service_account" = true WHERE "username" = 'claude-agent';

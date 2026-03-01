-- AlterTable: make email optional (nullable)
-- PostgreSQL allows multiple NULLs in a UNIQUE column, so no constraint changes needed.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- Clear email for existing service accounts (they don't need it)
UPDATE "users" SET "email" = NULL WHERE "is_service_account" = true;

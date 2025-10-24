-- Add soft delete columns to notes table
ALTER TABLE "notes" ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notes" ADD COLUMN "deleted_at" TIMESTAMP;
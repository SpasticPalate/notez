-- Add case-insensitive unique index on username
-- The existing @unique on username is case-sensitive in PostgreSQL.
-- This functional index enforces uniqueness regardless of case,
-- preventing "Admin" and "admin" from coexisting.
CREATE UNIQUE INDEX "users_username_lower_key" ON "users" (LOWER("username"));

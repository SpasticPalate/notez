-- Nullify passwords for existing service accounts.
-- The '!service-account-no-password:' prefix ensures bcrypt.compare() always fails,
-- effectively blocking password-based login for these accounts.
UPDATE "users"
SET "password_hash" = '!service-account-no-password:' || encode(gen_random_bytes(16), 'hex'),
    "must_change_password" = false
WHERE "is_service_account" = true;

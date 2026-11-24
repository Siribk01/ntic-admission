-- Up Migration

-- One-time links sent by email: "verify your email" and "reset your password".
-- Only a hash of each token is stored. The token itself exists only in the email, so a copy of this table
-- cannot be used to take over an account.
CREATE TABLE account_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose    text NOT NULL,
  token_hash text NOT NULL,
  email      text NOT NULL,          -- the address this token was sent to; if the account email changes, the token stops working
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_tokens_hash_uq UNIQUE (token_hash),
  CONSTRAINT account_tokens_purpose_valid CHECK (purpose IN ('verify_email', 'reset_password'))
);
-- "How many links did this user ask for recently?" and "is there an open link?"
CREATE INDEX account_tokens_user_idx ON account_tokens (user_id, purpose, created_at DESC);

-- Staff accounts are created by an administrator, so their email counts as verified.
-- (Parents verify through the link we email them.)
UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL AND role <> 'applicant';

-- Down Migration

DROP TABLE IF EXISTS account_tokens;

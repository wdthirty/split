-- Splitwise clone schema. Money stored as integer cents to avoid float drift.
-- There are no groups: every member shares one global ledger.

CREATE TABLE IF NOT EXISTS members (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  -- case-insensitive uniqueness on name (name is the identity / recovery key)
  name_key    TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  -- total amount in cents
  amount      BIGINT NOT NULL CHECK (amount > 0),
  -- who fronted the money
  paid_by     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- 'equal' | 'exact' | 'percent' (informational; shares hold the truth)
  split_type  TEXT NOT NULL DEFAULT 'equal',
  created_by  TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- How much of an expense each member is responsible for (in cents).
-- Sum of shares for an expense must equal the expense amount.
CREATE TABLE IF NOT EXISTS expense_shares (
  expense_id  TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- owed amount in cents for this member on this expense
  share       BIGINT NOT NULL CHECK (share >= 0),
  PRIMARY KEY (expense_id, member_id)
);

-- A repayment from one member to another. Reduces debt.
CREATE TABLE IF NOT EXISTS settlements (
  id          TEXT PRIMARY KEY,
  from_member TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_member   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount      BIGINT NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shares_expense ON expense_shares(expense_id);

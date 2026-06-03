-- Splitwise clone schema. Money stored as integer cents to avoid float drift.

CREATE TABLE IF NOT EXISTS members (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  -- case-insensitive uniqueness on name (name is the identity / recovery key)
  name_key    TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  emoji       TEXT NOT NULL DEFAULT '👥',
  created_by  TEXT REFERENCES members(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Membership of members in groups (many-to-many).
CREATE TABLE IF NOT EXISTS group_members (
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_id   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, member_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  -- total amount in cents
  amount      BIGINT NOT NULL CHECK (amount > 0),
  -- who fronted the money
  paid_by     TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- 'equal' | 'exact' | 'percent' (informational; shares hold the truth)
  split_type  TEXT NOT NULL DEFAULT 'equal',
  -- a settlement is a special expense; we keep them in their own table below
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

-- A repayment from one member to another within a group. Reduces debt.
CREATE TABLE IF NOT EXISTS settlements (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_member TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  to_member   TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount      BIGINT NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_shares_expense ON expense_shares(expense_id);
CREATE INDEX IF NOT EXISTS idx_settlements_group ON settlements(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_member ON group_members(member_id);

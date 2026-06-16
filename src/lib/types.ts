// Shared types between API and UI.

export type Member = {
  id: string;
  name: string;
};

// "percent" is legacy (kept so old expenses still load); new expenses use
// "parts" instead — proportional ratio shares, no math required.
export type SplitType = "equal" | "exact" | "percent" | "parts";

export type ExpenseShare = {
  memberId: string;
  name: string;
  share: number; // cents
};

export type Expense = {
  id: string;
  description: string;
  amount: number; // cents
  paidBy: string;
  paidByName: string;
  splitType: SplitType;
  createdAt: string;
  shares: ExpenseShare[];
};

export type Settlement = {
  id: string;
  fromMember: string;
  fromName: string;
  toMember: string;
  toName: string;
  amount: number; // cents
  createdAt: string;
};

// Net position of a member across the ledger: positive = others owe them.
export type MemberBalance = {
  memberId: string;
  name: string;
  net: number; // cents; +ve => is owed, -ve => owes
};

// A simplified "who pays whom" transfer.
export type Transfer = {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number; // cents
};

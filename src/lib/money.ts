// Money helpers. We store cents as integers everywhere.

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

// Parse a user-entered dollar string ("12.5", "12", "12.50") into integer cents.
// Returns null if it isn't a valid positive-ish number.
export function parseDollarsToCents(input: string): number | null {
  const trimmed = input.trim().replace(/[$,]/g, "");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export function centsToDollarString(cents: number): string {
  return (cents / 100).toFixed(2);
}

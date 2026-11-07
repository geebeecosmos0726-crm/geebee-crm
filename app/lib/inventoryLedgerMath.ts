export type LedgerMathEntry = {
  id: number;
  sku: string;
  occurredAt: string;
  signedQuantity: number;
};

export type LedgerBalance = LedgerMathEntry & {
  previousAvailable: number;
  newAvailable: number;
};

// Mirrors the SQL ledger ordering: timestamp first, immutable sequence ID
// second. Each SKU has an entirely independent running balance.
export function calculateSkuLedger(openingBySku: Record<string, number>, entries: readonly LedgerMathEntry[]) {
  const balances = new Map<string, number>(Object.entries(openingBySku));
  return [...entries]
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.occurredAt.localeCompare(b.occurredAt) || a.id - b.id)
    .map((entry): LedgerBalance => {
      const previousAvailable = balances.get(entry.sku) ?? 0;
      const newAvailable = previousAvailable + entry.signedQuantity;
      balances.set(entry.sku, newAvailable);
      return { ...entry, previousAvailable, newAvailable };
    });
}

type Movement = {
  direction: "Dispatch" | "Return";
  quantity: number;
  before: number;
  createdAt: string;
  auditId?: number;
  derivedFromOrder?: boolean;
};

// Grouping orders is only a presentation concern: stock changes follow event time.
export function stockMovementBalances<T extends Movement>(movements: readonly T[]) {
  const chronological = movements.filter(movement => Number.isFinite(Date.parse(movement.createdAt)))
    .map((movement, index) => ({ movement, index }))
    .sort((a, b) => Date.parse(a.movement.createdAt) - Date.parse(b.movement.createdAt)
      || (a.movement.auditId ?? Infinity) - (b.movement.auditId ?? Infinity)
      || a.index - b.index);
  const anchor = chronological.findIndex(({ movement }) => !movement.derivedFromOrder && Number.isFinite(movement.before));
  const startingBalance = anchor < 0 ? undefined : chronological[anchor].movement.before;
  let runningBalance = startingBalance;
  const balances = new Map<T, number>();
  if (anchor >= 0) {
    for (const { movement } of chronological.slice(anchor)) {
      if (!Number.isFinite(movement.quantity) || movement.quantity < 0) {
        runningBalance = undefined;
        break;
      }
      runningBalance = runningBalance! + (movement.direction === "Dispatch" ? -movement.quantity : movement.quantity);
      balances.set(movement, runningBalance);
    }
  }
  return { startingBalance, runningBalance, balances };
}

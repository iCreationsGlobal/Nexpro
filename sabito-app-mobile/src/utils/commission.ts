/** Match the backend's marketer share and collected-funds cashout rules. */
export function commissionAmount(row: Record<string, unknown>): number {
  return Number(row.marketerShareAmount ?? row.amount ?? 0);
}

export function canCashout(row: Record<string, unknown>): boolean {
  return row.status === 'due' && row.remittanceStatus === 'collected' && !row.cashoutRequestId;
}

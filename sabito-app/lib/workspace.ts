/** Accept only same-site navigation targets after authentication. */
export function accountDestination(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) return "/dashboard";
  try {
    const url = new URL(value, "https://sabito.local");
    return url.origin === "https://sabito.local" ? `${url.pathname}${url.search}${url.hash}` : "/dashboard";
  } catch { return "/dashboard"; }
}

export function commissionAmount(row: Record<string, unknown>): number {
  return Number(row.marketerShareAmount ?? row.amount ?? 0);
}

export function canCashout(row: Record<string, unknown>): boolean {
  return row.status === "due" && row.remittanceStatus === "collected" && !row.cashoutRequestId;
}

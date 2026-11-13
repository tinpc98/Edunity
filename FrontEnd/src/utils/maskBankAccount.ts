export function maskBankAccountNumber(accountNumber?: string | null): string {
  const normalized = accountNumber?.replace(/[^a-zA-Z0-9]/g, "") ?? "";
  if (!normalized) return "Không có dữ liệu";
  if (normalized.length <= 4) return "••••";
  return `•••• ${normalized.slice(-4)}`;
}

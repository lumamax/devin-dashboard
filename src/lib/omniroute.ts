export type { AccountSummary, PreparedRepoSummary } from "@/lib/accountSummary";
export { listDevinAccounts } from "@/lib/accountSummary";

/**
 * @deprecated kept for the v0.1 page.tsx import path. Use AccountSummary going forward.
 */
import type { AccountSummary } from "@/lib/accountSummary";

export type DevinAccount = AccountSummary & {
  provider?: string;
  alias?: string | null;
  hasCookie?: boolean | undefined;
};

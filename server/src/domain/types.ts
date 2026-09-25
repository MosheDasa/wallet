import type { PolicyType } from "./policies";

export type WalletState = "ACTIVE" | "EXPIRED" | "INACTIVE" | "COMPLETED";

export interface IssuedCard {
  objectId: string;
  classId: string;
  customerId: string;
  policyId: string;
  policyType: PolicyType;
  policyName: string;
  policyNumber: string;
  description: string;
  issuedAt: string;
  state: WalletState;
  /** Display marker stored on the pass while keeping Google Wallet state ACTIVE. */
  isMarkedInvalid?: boolean;
  provider: "google";
}

export interface SavePassResult {
  saveUrl: string;
  cards: IssuedCard[];
}

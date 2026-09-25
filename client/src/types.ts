export type PolicyType = "auto" | "home" | "mortgage" | "savings" | "health" | "life";
export type WalletState = "ACTIVE" | "EXPIRED" | "INACTIVE" | "COMPLETED";

export interface WalletTextField {
  id: string;
  header: string;
  body: string;
}

export type WalletLinkType = "website" | "phone" | "email" | "navigation";

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  policyCount: number;
  walletCardCount: number;
}

export interface Policy {
  id: string;
  type: PolicyType;
  label: string;
  policyNumber: string;
  status: "active" | "pending";
  validUntil: string;
  description: string;
  accent: string;
}

export interface WalletCard {
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
  isMarkedInvalid?: boolean;
  provider: "google";
}

export interface IssueResult {
  saveUrl: string;
  cards: WalletCard[];
}

export interface ApiHealth {
  ok: boolean;
  walletReady: boolean;
  walletMessage?: string;
  policyTypes: number;
}

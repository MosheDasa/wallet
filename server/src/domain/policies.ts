export const POLICY_TYPES = [
  "auto",
  "home",
  "mortgage",
  "savings",
  "health",
  "life",
] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];

export interface PolicyTypeDefinition {
  type: PolicyType;
  label: string;
  genericType: string;
  classSuffix: string;
  accent: string;
}

export const POLICY_TYPE_DEFINITIONS: Record<PolicyType, PolicyTypeDefinition> = {
  auto: { type: "auto", label: "ביטוח רכב", genericType: "GENERIC_AUTO_INSURANCE", classSuffix: "auto_insurance", accent: "#e76c40" },
  home: { type: "home", label: "ביטוח דירה", genericType: "GENERIC_HOME_INSURANCE", classSuffix: "home_insurance", accent: "#3a8c86" },
  mortgage: { type: "mortgage", label: "ביטוח משכנתא", genericType: "GENERIC_OTHER", classSuffix: "mortgage_insurance", accent: "#6778ad" },
  savings: { type: "savings", label: "חיסכון ישיר", genericType: "GENERIC_OTHER", classSuffix: "direct_savings", accent: "#3f9270" },
  health: { type: "health", label: "ביטוח בריאות", genericType: "GENERIC_OTHER", classSuffix: "health_insurance", accent: "#8e6bb1" },
  life: { type: "life", label: "ביטוח חיים", genericType: "GENERIC_OTHER", classSuffix: "life_insurance", accent: "#4388a6" },
};

export interface Policy {
  id: string;
  type: PolicyType;
  policyNumber: string;
  status: "active" | "pending";
  validUntil: string;
  description: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  policies: Policy[];
}

export const CUSTOMERS: Customer[] = [
  {
    id: "customer-1001", name: "נועה לוי", email: "noa.levi@example.com", phone: "050-555-0142",
    policies: [
      { id: "policy-auto-1001", type: "auto", policyNumber: "רכב · 4582107", status: "active", validUntil: "2026-12-31", description: "טויוטה קורולה · 2022" },
      { id: "policy-home-1001", type: "home", policyNumber: "דירה · 7710942", status: "active", validUntil: "2027-03-15", description: "דירת 4 חדרים · תל אביב" },
      { id: "policy-health-1001", type: "health", policyNumber: "בריאות · 3205841", status: "active", validUntil: "2027-01-01", description: "כיסוי בריאות פרטי" },
    ],
  },
  {
    id: "customer-1002", name: "איתי כהן", email: "itai.cohen@example.com", phone: "052-555-0197",
    policies: [
      { id: "policy-auto-1002", type: "auto", policyNumber: "רכב · 2196430", status: "active", validUntil: "2026-11-20", description: "יונדאי איוניק · 2023" },
      { id: "policy-mortgage-1002", type: "mortgage", policyNumber: "משכנתא · 6823410", status: "active", validUntil: "2032-08-01", description: "ביטוח חיים למשכנתא" },
      { id: "policy-life-1002", type: "life", policyNumber: "חיים · 9071532", status: "pending", validUntil: "2027-06-30", description: "ביטוח חיים למשפחה" },
    ],
  },
  {
    id: "customer-1003", name: "מיה ישראלי", email: "maya.israeli@example.com", phone: "054-555-0138",
    policies: [
      { id: "policy-savings-1003", type: "savings", policyNumber: "חיסכון · 1558294", status: "active", validUntil: "2030-01-01", description: "תוכנית חיסכון ישיר" },
      { id: "policy-home-1003", type: "home", policyNumber: "דירה · 6392051", status: "active", validUntil: "2027-05-12", description: "דירת 5 חדרים · חיפה" },
    ],
  },
];

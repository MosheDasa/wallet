import type { ApiHealth, Customer, IssueResult, Policy, WalletCard } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "הבקשה נכשלה.");
  return data as T;
}

export const api = {
  health: () => request<ApiHealth>("/api/health"),
  customers: () => request<Customer[]>("/api/customers"),
  policies: (customerId: string) => request<Policy[]>("/api/customers/" + encodeURIComponent(customerId) + "/policies"),
  cards: (customerId: string) => request<WalletCard[]>("/api/wallet/customers/" + encodeURIComponent(customerId) + "/cards"),
  issue: (customerId: string, policyIds: string[]) =>
    request<IssueResult>("/api/wallet/issue", { method: "POST", body: JSON.stringify({ customerId, policyIds }) }),
  sendMessage: (objectId: string, body: string) =>
    request<{ ok: true }>("/api/wallet/objects/" + encodeURIComponent(objectId) + "/messages", {
      method: "POST", body: JSON.stringify({ body }),
    }),
  updateCard: (objectId: string, header: string, subheader: string) =>
    request<{ ok: true }>("/api/wallet/objects/" + encodeURIComponent(objectId), {
      method: "PATCH", body: JSON.stringify({ header, subheader }),
    }),
  markCardNotValid: (objectId: string) =>
    request<{ ok: true; state: "ACTIVE"; isMarkedInvalid: true }>("/api/wallet/objects/" + encodeURIComponent(objectId) + "/mark-invalid", {
      method: "POST",
    }),
  renewCar: (objectId: string) =>
    request<{ ok: true; message: string; renewalUrl: string; linkText: string }>(
      "/api/wallet/objects/" + encodeURIComponent(objectId) + "/car-renewal",
      { method: "POST" },
    ),
};

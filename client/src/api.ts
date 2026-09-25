import type { ApiHealth, Customer, IssueResult, Policy, WalletCard, WalletTextField } from "./types";

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
  fields: (objectId: string) =>
    request<{ fields: WalletTextField[] }>("/api/wallet/objects/" + encodeURIComponent(objectId) + "/fields"),
  updateFields: (objectId: string, fields: WalletTextField[]) =>
    request<{ ok: true; fields: WalletTextField[] }>("/api/wallet/objects/" + encodeURIComponent(objectId) + "/fields", {
      method: "PATCH", body: JSON.stringify({ fields }),
    }),
  issue: (customerId: string, policyIds: string[]) =>
    request<IssueResult>("/api/wallet/issue", { method: "POST", body: JSON.stringify({ customerId, policyIds }) }),
  sendMessage: (objectId: string, header: string, body: string) =>
    request<{ ok: true }>("/api/wallet/objects/" + encodeURIComponent(objectId) + "/messages", {
      method: "POST", body: JSON.stringify({ header, body }),
    }),
  updateCard: (objectId: string, header: string, subheader: string) =>
    request<{ ok: true }>("/api/wallet/objects/" + encodeURIComponent(objectId), {
      method: "PATCH", body: JSON.stringify({ header, subheader }),
    }),
  markCardNotValid: (objectId: string) =>
    request<{ ok: true; state: "ACTIVE"; isMarkedInvalid: true }>("/api/wallet/objects/" + encodeURIComponent(objectId) + "/mark-invalid", {
      method: "POST",
    }),
  markCardValid: (objectId: string) =>
    request<{ ok: true; state: "ACTIVE"; isMarkedInvalid: false }>("/api/wallet/objects/" + encodeURIComponent(objectId) + "/mark-valid", {
      method: "POST",
    }),
  renewCar: (objectId: string, header: string) =>
    request<{ ok: true; message: string; renewalUrl: string; linkText: string }>(
      "/api/wallet/objects/" + encodeURIComponent(objectId) + "/car-renewal",
      { method: "POST", body: JSON.stringify({ header }) },
    ),
};

import type { ApiHealth, Customer, IssueResult, Policy, WalletCard, WalletLinkType, WalletTextField } from "./types";

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
  googleObject: (objectId: string) =>
    request<{ object: Record<string, unknown> }>("/api/wallet/objects/" + encodeURIComponent(objectId) + "/google"),
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
  deleteMessage: (objectId: string, messageIndex: number) =>
    request<{ ok: true; deletedIndex: number }>(
      "/api/wallet/objects/" + encodeURIComponent(objectId) + "/messages/" + messageIndex,
      { method: "DELETE" },
    ),
  addWalletLink: (objectId: string, description: string, linkType: WalletLinkType, value: string) =>
    request<{ ok: true; objectId: string; description: string; uri: string }>(
      "/api/wallet/objects/" + encodeURIComponent(objectId) + "/links",
      { method: "POST", body: JSON.stringify({ description, linkType, value }) },
    ),
  deleteWalletLink: (objectId: string, linkIndex: number) =>
    request<{ ok: true; objectId: string; deletedIndex: number }>(
      "/api/wallet/objects/" + encodeURIComponent(objectId) + "/links/" + linkIndex,
      { method: "DELETE" },
    ),
  deleteAllWalletLinks: (objectId: string) =>
    request<{ ok: true; objectId: string; deletedAll: true }>(
      "/api/wallet/objects/" + encodeURIComponent(objectId) + "/links",
      { method: "DELETE" },
    ),
  moveWalletLink: (objectId: string, fromIndex: number, toIndex: number) =>
    request<{ ok: true; objectId: string; fromIndex: number; toIndex: number }>(
      "/api/wallet/objects/" + encodeURIComponent(objectId) + "/links/reorder",
      { method: "PATCH", body: JSON.stringify({ fromIndex, toIndex }) },
    ),
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

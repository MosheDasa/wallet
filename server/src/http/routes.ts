import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { CUSTOMERS, POLICY_TYPE_DEFINITIONS, POLICY_TYPES } from "../domain/policies";
import type { WalletTextField } from "../domain/types";
import { IssuedCardRepository } from "../services/issuedCardRepository";
import { WalletService } from "../services/walletService";

function asyncRoute(handler: (request: Request, response: Response) => Promise<unknown>) {
  return (request: Request, response: Response, next: (error?: unknown) => void) => {
    handler(request, response).catch(next);
  };
}

function requireObjectId(request: Request, response: Response): string | undefined {
  const rawObjectId = request.params.objectId;
  const objectId = Array.isArray(rawObjectId) ? rawObjectId[0] : rawObjectId;
  if (typeof objectId !== "string" || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+$/.test(objectId)) {
    response.status(400).json({ error: "מזהה כרטיס לא תקין." });
    return undefined;
  }
  return objectId;
}

function normalizeWalletLinkUri(linkType: unknown, rawValue: unknown): { uri?: string; error?: string } {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value || value.length > 1500) return { error: "יש להזין ערך קישור תקין." };

  if (linkType === "website") {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { error: "כתובת אתר חייבת להתחיל ב־http:// או https://." };
      return { uri: parsed.toString() };
    } catch {
      return { error: "יש להזין כתובת אתר מלאה, כולל https://." };
    }
  }

  if (linkType === "phone") {
    const phone = value.replace(/[\s().-]/g, "");
    if (!/^(?:\+?\d{5,15}|\*[0-9]{3,15})$/.test(phone)) return { error: "יש להזין מספר טלפון או קוד חיוג כמו ‎*5555‎." };
    return { uri: "tel:" + phone };
  }

  if (linkType === "email") {
    if (value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { error: "יש להזין כתובת אימייל תקינה." };
    return { uri: "mailto:" + value };
  }

  if (linkType === "navigation") {
    if (/^https?:\/\//i.test(value)) {
      try {
        const parsed = new URL(value);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") return { uri: parsed.toString() };
      } catch { /* Treat non-URL input as a destination address below. */ }
    }
    return { uri: "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(value) };
  }

  return { error: "יש לבחור סוג קישור: אתר, טלפון, אימייל או ניווט." };
}

export function createApiRouter(repository: IssuedCardRepository, wallet: WalletService) {
  const router = Router();

  router.get("/health", asyncRoute(async (_request, response) => {
    const connection = await wallet.checkConnection();
    response.json({
      ok: true,
      walletReady: connection.ready,
      walletMessage: connection.message,
      policyTypes: POLICY_TYPES.length,
    });
  }));

  router.get("/customers", (_request, response) => {
    response.json(CUSTOMERS.map(({ policies, ...customer }) => ({
      ...customer,
      policyCount: policies.length,
      walletCardCount: repository.listForCustomer(customer.id).filter((card) => card.provider === "google").length,
    })));
  });

  router.get("/customers/:customerId/policies", (request, response) => {
    const customer = CUSTOMERS.find((entry) => entry.id === request.params.customerId);
    if (!customer) return response.status(404).json({ error: "הלקוח לא נמצא." });
    return response.json(customer.policies.map((policy) => ({
      ...policy,
      ...POLICY_TYPE_DEFINITIONS[policy.type],
    })));
  });

  router.get("/customers/:customerId/object-id-number", (request, response) => {
    const customer = CUSTOMERS.find((entry) => entry.id === request.params.customerId);
    if (!customer) return response.status(404).json({ error: "הלקוח לא נמצא." });
    return response.json({ objectIdNumber: repository.getCustomerObjectIdNumber(customer.id) ?? "" });
  });

  router.put("/customers/:customerId/object-id-number", asyncRoute(async (request, response) => {
    const customer = CUSTOMERS.find((entry) => entry.id === request.params.customerId);
    if (!customer) return response.status(404).json({ error: "הלקוח לא נמצא." });
    const { objectIdNumber: rawValue } = request.body as { objectIdNumber?: unknown };
    if (typeof rawValue !== "string" || (rawValue !== "" && !/^\d{1,20}$/.test(rawValue))) {
      return response.status(400).json({ error: "המספר חייב להכיל 1–20 ספרות, או להיות ריק להסרתו." });
    }
    await repository.setCustomerObjectIdNumber(customer.id, rawValue);
    return response.json({ ok: true, customerId: customer.id, objectIdNumber: rawValue });
  }));

  router.get("/wallet/customers/:customerId/cards", (request, response) => {
    if (!CUSTOMERS.some((entry) => entry.id === request.params.customerId)) {
      return response.status(404).json({ error: "הלקוח לא נמצא." });
    }
    return response.json(repository.listForCustomer(request.params.customerId).filter((card) => card.provider === "google"));
  });

  router.delete("/wallet/customers/:customerId/cards", asyncRoute(async (request, response) => {
    const customer = CUSTOMERS.find((entry) => entry.id === request.params.customerId);
    if (!customer) return response.status(404).json({ error: "הלקוח לא נמצא." });
    const removedLocally = await repository.removeForCustomer(customer.id);
    return response.json({ ok: true, customerId: customer.id, removedLocally });
  }));

  router.post("/wallet/branding/apply", asyncRoute(async (_request, response) => {
    const cards = repository.listAll().filter((card) => card.provider === "google");
    const updated = await wallet.applyLogo(cards);
    return response.json({ ok: true, updated, logoUrl: "https://i.ibb.co/rRmZ8swb/yashir-log.png" });
  }));

  router.post("/wallet/issue", asyncRoute(async (request, response) => {
    const { customerId, policyIds } = request.body as { customerId?: unknown; policyIds?: unknown };
    if (typeof customerId !== "string" || !Array.isArray(policyIds) || policyIds.some((id) => typeof id !== "string")) {
      return response.status(400).json({ error: "יש לשלוח customerId ורשימת policyIds." });
    }
    if (new Set(policyIds).size !== policyIds.length) {
      return response.status(400).json({ error: "רשימת הפוליסות מכילה בחירה כפולה." });
    }
    const customer = CUSTOMERS.find((entry) => entry.id === customerId);
    if (!customer) return response.status(404).json({ error: "הלקוח לא נמצא." });
    const selectedPolicies = customer.policies.filter((policy) => policyIds.includes(policy.id));
    if (selectedPolicies.length !== policyIds.length || selectedPolicies.length === 0) {
      return response.status(400).json({ error: "יש לבחור פוליסות קיימות של הלקוח." });
    }

    const result = await wallet.issueGroupedPasses(
      customer,
      selectedPolicies,
      repository.getCustomerObjectIdNumber(customer.id),
    );
    await repository.addMany(result.cards);
    return response.status(201).json({
      saveUrl: result.saveUrl,
      grouping: "grouped-by-customer",
      cards: result.cards,
    });
  }));

  router.post("/wallet/objects/:objectId/messages", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    const { header: rawHeader, body } = request.body as { header?: unknown; body?: unknown };
    const header = rawHeader === undefined ? "ביטוח ישיר" : rawHeader;
    if (typeof header !== "string" || !header.trim() || header.length > 60) {
      return response.status(400).json({ error: "נדרשת כותרת באורך 1–60 תווים." });
    }
    if (typeof body !== "string" || !body.trim() || body.length > 500) {
      return response.status(400).json({ error: "נדרשת הודעה באורך של 1–500 תווים." });
    }
    await wallet.addMessage(objectId, header.trim(), body.trim());
    return response.json({ ok: true, objectId, header: header.trim(), messageType: "TEXT_AND_NOTIFY" });
  }));

  router.delete("/wallet/objects/:objectId/messages/:messageIndex", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const rawIndex = request.params.messageIndex;
    if (typeof rawIndex !== "string" || !/^\d+$/.test(rawIndex)) {
      return response.status(400).json({ error: "מזהה הודעה לא תקין." });
    }
    const messageIndex = Number(rawIndex);
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    await wallet.removeMessage(objectId, messageIndex);
    return response.json({ ok: true, objectId, deletedIndex: messageIndex });
  }));

  router.post("/wallet/objects/:objectId/links", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    const { description: rawDescription, linkType, value } = request.body as { description?: unknown; linkType?: unknown; value?: unknown };
    const description = typeof rawDescription === "string" ? rawDescription.trim() : "";
    if (!description || description.length > 20) {
      return response.status(400).json({ error: "יש להזין טקסט קישור באורך 1–20 תווים." });
    }
    const normalized = normalizeWalletLinkUri(linkType, value);
    if (!normalized.uri || normalized.uri.length > 2048) {
      return response.status(400).json({ error: normalized.error ?? "כתובת הקישור ארוכה מדי." });
    }
    const updated = await wallet.addLink(objectId, description, normalized.uri);
    return response.json({ ok: true, objectId, description, uri: normalized.uri, updated });
  }));

  router.delete("/wallet/objects/:objectId/links", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    await wallet.removeAllLinks(objectId);
    return response.json({ ok: true, objectId, deletedAll: true });
  }));

  router.delete("/wallet/objects/:objectId/links/:linkIndex", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const rawIndex = request.params.linkIndex;
    if (typeof rawIndex !== "string" || !/^\d+$/.test(rawIndex)) {
      return response.status(400).json({ error: "מזהה קישור לא תקין." });
    }
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    const linkIndex = Number(rawIndex);
    await wallet.removeLink(objectId, linkIndex);
    return response.json({ ok: true, objectId, deletedIndex: linkIndex });
  }));

  router.patch("/wallet/objects/:objectId/links/reorder", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const { fromIndex, toIndex } = request.body as { fromIndex?: unknown; toIndex?: unknown };
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
      return response.status(400).json({ error: "יש לשלוח את מיקום הקישור הנוכחי והחדש." });
    }
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    await wallet.moveLink(objectId, fromIndex as number, toIndex as number);
    return response.json({ ok: true, objectId, fromIndex, toIndex });
  }));

  router.patch("/wallet/objects/:objectId", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    const { header, subheader, hexBackgroundColor } = request.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof header === "string" && header.trim()) {
      patch.header = { defaultValue: { language: "he", value: header.trim() } };
    }
    if (typeof subheader === "string" && subheader.trim()) {
      patch.subheader = { defaultValue: { language: "he", value: subheader.trim() } };
    }
    if (typeof hexBackgroundColor === "string" && /^#[0-9a-fA-F]{6}$/.test(hexBackgroundColor)) {
      patch.hexBackgroundColor = hexBackgroundColor;
    }
    if (!Object.keys(patch).length) {
      return response.status(400).json({ error: "יש לשלוח שדה נתמך אחד לפחות: header, subheader או hexBackgroundColor." });
    }
    const updated = await wallet.patchObject(objectId, patch);
    return response.json({ ok: true, objectId, updated });
  }));

  router.get("/wallet/objects/:objectId/fields", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    return response.json({ fields: await wallet.getTextFields(objectId) });
  }));

  router.get("/wallet/objects/:objectId/google", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    return response.json({ object: await wallet.getWalletObject(objectId) });
  }));

  router.patch("/wallet/objects/:objectId/fields", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    const input = (request.body as { fields?: unknown }).fields;
    if (!Array.isArray(input) || input.length > 10) {
      return response.status(400).json({ error: "יש לשלוח עד 10 שדות בכרטיס." });
    }
    const fields: WalletTextField[] = [];
    for (const value of input) {
      if (!value || typeof value !== "object") {
        return response.status(400).json({ error: "מבנה השדות אינו תקין." });
      }
      const field = value as Record<string, unknown>;
      const header = typeof field.header === "string" ? field.header.trim() : "";
      const body = typeof field.body === "string" ? field.body.trim() : "";
      const id = typeof field.id === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(field.id)
        ? field.id
        : "custom_" + randomUUID().replaceAll("-", "").slice(0, 16);
      if (!header || !body || header.length > 60 || body.length > 500) {
        return response.status(400).json({ error: "לכל שדה נדרשים שם (עד 60 תווים) וערך (עד 500 תווים)." });
      }
      fields.push({ id, header, body });
    }
    if (new Set(fields.map((field) => field.id)).size !== fields.length) {
      return response.status(400).json({ error: "מזהי השדות חייבים להיות ייחודיים." });
    }
    await wallet.updateTextFields(objectId, fields);
    return response.json({ ok: true, objectId, fields });
  }));

  router.post("/wallet/objects/:objectId/mark-invalid", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    await wallet.markObjectNotValid(card);
    await repository.markNotValid(objectId);
    return response.json({ ok: true, objectId, state: "ACTIVE", isMarkedInvalid: true });
  }));

  router.post("/wallet/objects/:objectId/mark-valid", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    await wallet.markObjectValid(card);
    await repository.markValid(objectId);
    return response.json({ ok: true, objectId, state: "ACTIVE", isMarkedInvalid: false });
  }));

  router.post("/wallet/objects/:objectId/car-renewal", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    if (card.policyType !== "auto") {
      return response.status(400).json({ error: "פעולת חידוש הרכב זמינה לפוליסת רכב בלבד." });
    }
    const rawHeader = (request.body as { header?: unknown } | undefined)?.header;
    const header = rawHeader === undefined ? "ביטוח ישיר" : rawHeader;
    if (typeof header !== "string" || !header.trim() || header.length > 60) {
      return response.status(400).json({ error: "נדרשת כותרת לתזכורת באורך 1–60 תווים." });
    }
    const result = await wallet.sendCarRenewal(objectId, header.trim());
    return response.json({
      ok: true,
      objectId,
      header: header.trim(),
      message: "זמן לחדש את הרכב",
      linkText: "לחץ כאן",
      renewalUrl: result.renewalUrl,
    });
  }));

  return router;
}

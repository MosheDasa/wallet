import { Router, type Request, type Response } from "express";
import { CUSTOMERS, POLICY_TYPE_DEFINITIONS, POLICY_TYPES } from "../domain/policies";
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

  router.get("/wallet/customers/:customerId/cards", (request, response) => {
    if (!CUSTOMERS.some((entry) => entry.id === request.params.customerId)) {
      return response.status(404).json({ error: "הלקוח לא נמצא." });
    }
    return response.json(repository.listForCustomer(request.params.customerId).filter((card) => card.provider === "google"));
  });

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

    const result = await wallet.issueGroupedPasses(customer, selectedPolicies);
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
    const body = (request.body as { body?: unknown }).body;
    if (typeof body !== "string" || !body.trim() || body.length > 500) {
      return response.status(400).json({ error: "נדרשת הודעה באורך של 1–500 תווים." });
    }
    await wallet.addMessage(objectId, body.trim());
    return response.json({ ok: true, objectId, messageType: "TEXT_AND_NOTIFY" });
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

  router.post("/wallet/objects/:objectId/mark-invalid", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    await wallet.markObjectNotValid(card);
    await repository.markNotValid(objectId);
    return response.json({ ok: true, objectId, state: "ACTIVE", isMarkedInvalid: true });
  }));

  router.post("/wallet/objects/:objectId/car-renewal", asyncRoute(async (request, response) => {
    const objectId = requireObjectId(request, response);
    if (!objectId) return;
    const card = repository.get(objectId);
    if (!card || card.provider !== "google") return response.status(404).json({ error: "הכרטיס לא קיים ב-Google Wallet." });
    if (card.policyType !== "auto") {
      return response.status(400).json({ error: "פעולת חידוש הרכב זמינה לפוליסת רכב בלבד." });
    }
    const result = await wallet.sendCarRenewal(objectId);
    return response.json({
      ok: true,
      objectId,
      message: "זמן לחדש את הרכב",
      linkText: "לחץ כאן",
      renewalUrl: result.renewalUrl,
    });
  }));

  return router;
}

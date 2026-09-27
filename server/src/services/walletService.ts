import { createHash, randomUUID } from "node:crypto";
import { GoogleAuth, type OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { POLICY_TYPE_DEFINITIONS, type Customer, type Policy, type PolicyType } from "../domain/policies";
import type { IssuedCard, SavePassResult, WalletState, WalletTextField } from "../domain/types";

const WALLET_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
const WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";
export const WALLET_LOGO_URL = "https://i.ibb.co/rRmZ8swb/yashir-log.png";
const ACTIVE_CARD_COLOR = "#1769AA";
const INVALID_CARD_COLOR = "#858B93";

function localized(value: string) {
  return { defaultValue: { language: "he", value } };
}

function safeSuffix(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 64);
}

export class WalletService {
  private authClient?: Promise<OAuth2Client>;

  constructor(private readonly issuerId: string) {}

  get isConfigured(): boolean {
    return /^\d+$/.test(this.issuerId) && Boolean(config.serviceAccount);
  }

  async checkConnection(): Promise<{ ready: boolean; message?: string }> {
    if (!this.isConfigured) {
      return {
        ready: false,
        message: "יש להגדיר Issuer ID וקובץ מפתח של חשבון שירות ב־.env.",
      };
    }
    const classId = this.issuerId + "." + POLICY_TYPE_DEFINITIONS.auto.classSuffix;
    try {
      await this.walletRequest("GET", "/genericClass/" + encodeURIComponent(classId));
      return { ready: true };
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 404) return { ready: true };
      const rawMessage = (error as Error).message;
      return {
        ready: false,
        message: this.userFacingGoogleError(rawMessage),
      };
    }
  }

  async issueGroupedPasses(customer: Customer, policies: Policy[], customerObjectIdNumber?: string): Promise<SavePassResult> {
    this.assertReady();
    if (!policies.length) throw new Error("יש לבחור לפחות פוליסה אחת להנפקה.");
    if (customerObjectIdNumber && !/^\d{1,20}$/.test(customerObjectIdNumber)) {
      throw new Error("מספר ה־objectId של הלקוח אינו תקין.");
    }

    const groupingId = this.customerGroupingId(customer.id);
    const cards: IssuedCard[] = policies.map((policy) => {
      const definition = POLICY_TYPE_DEFINITIONS[policy.type];
      const suffix = [customerObjectIdNumber, safeSuffix(policy.id), randomUUID().replaceAll("-", "").slice(0, 12)]
        .filter(Boolean)
        .join("_");
      return {
        objectId: this.issuerId + "." + suffix,
        classId: this.issuerId + "." + definition.classSuffix,
        customerId: customer.id,
        policyId: policy.id,
        policyType: policy.type,
        policyName: definition.label,
        policyNumber: policy.policyNumber,
        description: policy.description,
        issuedAt: new Date().toISOString(),
        state: "ACTIVE",
        provider: "google",
      };
    });

    for (const policy of policies) await this.ensureClass(policy.type);
    for (const [index, card] of cards.entries()) {
      await this.walletRequest("POST", "/genericObject", this.buildObject(card, groupingId, index));
    }

    const payload = {
      iss: config.serviceAccount!.client_email,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      origins: [config.clientOrigin],
      payload: {
        genericObjects: cards.map(({ objectId, classId }) => ({ id: objectId, classId })),
      },
    };
    const signedJwt = jwt.sign(payload, config.serviceAccount!.private_key, { algorithm: "RS256" });
    if (signedJwt.length > 1800) {
      throw new Error("קישור Google Wallet חורג ממגבלת האורך הבטוח (1,800 תווים). יש לצמצם את נתוני הכרטיסים.");
    }

    return { saveUrl: "https://pay.google.com/gp/v/save/" + signedJwt, cards };
  }

  async patchObject(objectId: string, patch: Record<string, unknown>): Promise<unknown> {
    this.assertObjectId(objectId);
    return (await this.walletRequest("PATCH", "/genericObject/" + encodeURIComponent(objectId), patch)).data;
  }

  async getTextFields(objectId: string): Promise<WalletTextField[]> {
    this.assertObjectId(objectId);
    const response = await this.walletRequest("GET", "/genericObject/" + encodeURIComponent(objectId));
    const object = response.data as { textModulesData?: Array<{ id?: string; header?: string; body?: string }> };
    return (object.textModulesData ?? []).map((field, index) => ({
      id: field.id || "field_" + index,
      header: field.header ?? "",
      body: field.body ?? "",
    }));
  }

  async getWalletObject(objectId: string): Promise<Record<string, unknown>> {
    this.assertObjectId(objectId);
    const response = await this.walletRequest("GET", "/genericObject/" + encodeURIComponent(objectId));
    return response.data as Record<string, unknown>;
  }

  async updateTextFields(objectId: string, fields: WalletTextField[]): Promise<unknown> {
    return this.patchObject(objectId, { textModulesData: fields });
  }

  async applyLogo(cards: IssuedCard[]): Promise<number> {
    let updated = 0;
    for (const card of cards) {
      await this.patchObject(card.objectId, {
        logo: this.logoImage(),
        hexBackgroundColor: card.isMarkedInvalid || card.state !== "ACTIVE" ? INVALID_CARD_COLOR : ACTIVE_CARD_COLOR,
      });
      updated += 1;
    }
    return updated;
  }

  async addMessage(objectId: string, header: string, body: string): Promise<unknown> {
    this.assertObjectId(objectId);
    // Google Wallet's push-triggering message flow is Add Message + TEXT_AND_NOTIFY.
    // PATCH is used to edit/remove message data; it is not the documented push trigger.
    const message = {
      header,
      body,
      messageType: "TEXT_AND_NOTIFY",
      id: "msg_" + randomUUID().replaceAll("-", ""),
    };
    const response = await this.walletRequest(
      "POST",
      "/genericObject/" + encodeURIComponent(objectId) + "/addMessage",
      { message },
    );
    return response.data;
  }

  async removeMessage(objectId: string, messageIndex: number): Promise<unknown> {
    const current = await this.getWalletObject(objectId);
    const messages = Array.isArray(current.messages) ? current.messages : [];
    if (!Number.isInteger(messageIndex) || messageIndex < 0 || messageIndex >= messages.length) {
      const error = new Error("ההודעה כבר לא קיימת בכרטיס.") as Error & { status?: number };
      error.status = 404;
      throw error;
    }
    const updatedMessages = messages.filter((_, index) => index !== messageIndex);
    return this.patchObject(objectId, { messages: updatedMessages });
  }

  async addLink(objectId: string, description: string, uri: string): Promise<unknown> {
    const current = await this.getWalletObject(objectId);
    const existingModule = current.linksModuleData && typeof current.linksModuleData === "object"
      ? current.linksModuleData as Record<string, unknown>
      : {};
    const existingUris = Array.isArray(existingModule.uris) ? existingModule.uris : [];
    if (existingUris.length >= 10) {
      const error = new Error("ניתן להוסיף עד 10 קישורים לכרטיס.") as Error & { status?: number };
      error.status = 400;
      throw error;
    }
    const newLink = {
      id: "link_" + randomUUID().replaceAll("-", ""),
      description,
      uri,
    };
    return this.patchObject(objectId, {
      linksModuleData: { ...existingModule, uris: [...existingUris, newLink] },
    });
  }

  async removeLink(objectId: string, linkIndex: number): Promise<unknown> {
    const current = await this.getWalletObject(objectId);
    const existingModule = current.linksModuleData && typeof current.linksModuleData === "object"
      ? current.linksModuleData as Record<string, unknown>
      : {};
    const existingUris = Array.isArray(existingModule.uris) ? existingModule.uris : [];
    if (!Number.isInteger(linkIndex) || linkIndex < 0 || linkIndex >= existingUris.length) {
      const error = new Error("הקישור כבר לא קיים בכרטיס.") as Error & { status?: number };
      error.status = 404;
      throw error;
    }
    const uris = existingUris.filter((_, index) => index !== linkIndex);
    return this.patchObject(objectId, { linksModuleData: { ...existingModule, uris } });
  }

  async removeAllLinks(objectId: string): Promise<unknown> {
    const current = await this.getWalletObject(objectId);
    const existingModule = current.linksModuleData && typeof current.linksModuleData === "object"
      ? current.linksModuleData as Record<string, unknown>
      : {};
    return this.patchObject(objectId, { linksModuleData: { ...existingModule, uris: [] } });
  }

  async moveLink(objectId: string, fromIndex: number, toIndex: number): Promise<unknown> {
    const current = await this.getWalletObject(objectId);
    const existingModule = current.linksModuleData && typeof current.linksModuleData === "object"
      ? current.linksModuleData as Record<string, unknown>
      : {};
    const existingUris = Array.isArray(existingModule.uris) ? [...existingModule.uris] : [];
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
      || fromIndex < 0 || fromIndex >= existingUris.length
      || toIndex < 0 || toIndex >= existingUris.length) {
      const error = new Error("מיקום הקישור אינו תקין.") as Error & { status?: number };
      error.status = 400;
      throw error;
    }
    const [link] = existingUris.splice(fromIndex, 1);
    existingUris.splice(toIndex, 0, link);
    return this.patchObject(objectId, { linksModuleData: { ...existingModule, uris: existingUris } });
  }

  async markObjectNotValid(card: IssuedCard): Promise<unknown> {
    this.assertObjectId(card.objectId);
    const objectPath = "/genericObject/" + encodeURIComponent(card.objectId);
    const current = (await this.walletRequest("GET", objectPath)).data as {
      textModulesData?: Array<Record<string, unknown>>;
    };
    const modules = [...(current.textModulesData ?? [])];
    const statusModule = {
      id: "policy-status",
      header: "סטטוס הפוליסה",
      body: "לא בתוקף",
    };
    const statusIndex = modules.findIndex((module) => module.id === statusModule.id);
    if (statusIndex >= 0) modules[statusIndex] = statusModule;
    else modules.push(statusModule);

    // EXPIRED archives the pass in Google Wallet. Keep it ACTIVE so it stays
    // in the customer's regular wallet view, and show the invalid status on it.
    return this.patchObject(card.objectId, {
      state: "ACTIVE",
      header: localized(card.policyName + " · לא בתוקף"),
      hexBackgroundColor: INVALID_CARD_COLOR,
      textModulesData: modules,
    });
  }

  async markObjectValid(card: IssuedCard): Promise<unknown> {
    this.assertObjectId(card.objectId);
    const objectPath = "/genericObject/" + encodeURIComponent(card.objectId);
    const current = (await this.walletRequest("GET", objectPath)).data as {
      textModulesData?: Array<Record<string, unknown>>;
    };
    const modules = (current.textModulesData ?? []).filter((module) => module.id !== "policy-status");
    return this.patchObject(card.objectId, {
      state: "ACTIVE",
      header: localized(card.policyName),
      hexBackgroundColor: ACTIVE_CARD_COLOR,
      textModulesData: modules,
    });
  }

  async sendCarRenewal(objectId: string, header: string): Promise<{ object: unknown; renewalUrl: string }> {
    this.assertObjectId(objectId);
    const current = await this.getWalletObject(objectId);
    const existingModule = current.linksModuleData && typeof current.linksModuleData === "object"
      ? current.linksModuleData as Record<string, unknown>
      : {};
    const existingUris = Array.isArray(existingModule.uris) ? existingModule.uris : [];
    const renewalLinkIndex = existingUris.findIndex((item) =>
      Boolean(item && typeof item === "object" && "uri" in item && item.uri === config.renewalUrl),
    );
    if (renewalLinkIndex < 0 && existingUris.length >= 10) {
      const error = new Error("לא ניתן להוסיף קישור חידוש: הכרטיס כבר מכיל 10 קישורים.") as Error & { status?: number };
      error.status = 400;
      throw error;
    }
    const renewalLink = { id: "car-renewal", uri: config.renewalUrl, description: "לחץ כאן" };
    const renewalUris = [...existingUris];
    if (renewalLinkIndex >= 0) renewalUris[renewalLinkIndex] = { ...renewalUris[renewalLinkIndex], ...renewalLink };
    else renewalUris.push(renewalLink);
    const objectPatch = {
      linksModuleData: { ...existingModule, uris: renewalUris },
    };
    const [object] = await Promise.all([
      this.patchObject(objectId, objectPatch),
      this.addMessage(objectId, header, "זמן לחדש את הרכב"),
    ]);
    return { object, renewalUrl: config.renewalUrl };
  }

  private assertReady(): void {
    if (!/^\d+$/.test(this.issuerId)) {
      throw new Error("יש להגדיר GOOGLE_WALLET_ISSUER_ID כמזהה מנפיק מספרי.");
    }
    if (!config.serviceAccount) {
      throw new Error("נדרשים פרטי חשבון שירות ב-GOOGLE_APPLICATION_CREDENTIALS או GOOGLE_SERVICE_ACCOUNT_JSON.");
    }
  }

  private assertObjectId(objectId: string): void {
    this.assertReady();
    const suffix = objectId.startsWith(this.issuerId + ".") ? objectId.slice(this.issuerId.length + 1) : "";
    if (!/^[A-Za-z0-9._-]+$/.test(suffix)) {
      throw new Error("מזהה הכרטיס אינו שייך למנפיק Google Wallet המוגדר.");
    }
  }

  private customerGroupingId(customerId: string): string {
    return "customer_" + createHash("sha256").update(customerId).digest("hex").slice(0, 32);
  }

  private buildObject(card: IssuedCard, groupingId: string, sortIndex: number): Record<string, unknown> {
    const definition = POLICY_TYPE_DEFINITIONS[card.policyType];
    return {
      id: card.objectId,
      classId: card.classId,
      genericType: definition.genericType,
      cardTitle: localized("ביטוח ישיר"),
      header: localized(definition.label),
      subheader: localized(card.policyNumber),
      logo: this.logoImage(),
      hexBackgroundColor: definition.accent,
      state: "ACTIVE" satisfies WalletState,
      groupingInfo: { groupingId, sortIndex },
      textModulesData: [{ id: "policy-details", header: "פרטי הפוליסה", body: card.description }],
      barcode: { type: "QR_CODE", value: card.policyNumber, alternateText: card.policyNumber },
      ...(card.policyType === "auto"
        ? { linksModuleData: { uris: [{ uri: config.renewalUrl, description: "חידוש ביטוח רכב" }] } }
        : {}),
    };
  }

  private logoImage() {
    return {
      sourceUri: { uri: WALLET_LOGO_URL },
      contentDescription: localized("ביטוח ישיר"),
    };
  }

  private async ensureClass(type: PolicyType): Promise<void> {
    const definition = POLICY_TYPE_DEFINITIONS[type];
    const classId = this.issuerId + "." + definition.classSuffix;
    try {
      await this.walletRequest("GET", "/genericClass/" + encodeURIComponent(classId));
      return;
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
    try {
      await this.walletRequest("POST", "/genericClass", {
        id: classId,
        issuerName: "ביטוח ישיר",
        hexBackgroundColor: definition.accent,
      });
    } catch (error) {
      if ((error as { status?: number }).status !== 409) throw error;
      await this.walletRequest("GET", "/genericClass/" + encodeURIComponent(classId));
    }
  }

  private async getAuthClient(): Promise<OAuth2Client> {
    if (!this.authClient) {
      this.authClient = (async () => {
        this.assertReady();
        const auth = new GoogleAuth({
          credentials: config.serviceAccount,
          scopes: [WALLET_SCOPE],
        });
        return (await auth.getClient()) as OAuth2Client;
      })();
    }
    return this.authClient;
  }

  private async walletRequest(method: "GET" | "POST" | "PATCH", resource: string, data?: unknown) {
    const client = await this.getAuthClient();
    try {
      return await client.request({ method, url: WALLET_API + resource, data });
    } catch (error) {
      const responseError = error as {
        response?: {
          status?: number;
          data?: {
            error?: string | { message?: string };
            error_description?: string;
          };
        };
      };
      const status = responseError.response?.status;
      const data = responseError.response?.data;
      const googleError = data?.error;
      const message = typeof googleError === "string"
        ? data?.error_description ?? googleError
        : googleError?.message ?? data?.error_description;
      const wrapped = new Error(this.userFacingGoogleError(message ?? "בקשת Google Wallet נכשלה.")) as Error & { status?: number };
      wrapped.status = status;
      throw wrapped;
    }
  }

  private userFacingGoogleError(message: string): string {
    if (/invalid_grant|invalid jwt signature/i.test(message)) {
      return "Google דחה את מפתח חשבון השירות (Invalid JWT Signature). יש להחליף מקומית את service-account.json במפתח פעיל של חשבון שירות שקיבל הרשאת Developer ב־Google Wallet Console.";
    }
    return message;
  }
}

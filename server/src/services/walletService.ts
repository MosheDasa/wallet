import { createHash, randomUUID } from "node:crypto";
import { GoogleAuth, type OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { POLICY_TYPE_DEFINITIONS, type Customer, type Policy, type PolicyType } from "../domain/policies";
import type { IssuedCard, SavePassResult, WalletState } from "../domain/types";

const WALLET_SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";
const WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";

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

  async issueGroupedPasses(customer: Customer, policies: Policy[]): Promise<SavePassResult> {
    this.assertReady();
    if (!policies.length) throw new Error("יש לבחור לפחות פוליסה אחת להנפקה.");

    const groupingId = this.customerGroupingId(customer.id);
    const cards: IssuedCard[] = policies.map((policy) => {
      const definition = POLICY_TYPE_DEFINITIONS[policy.type];
      const suffix = safeSuffix(policy.id) + "_" + randomUUID().replaceAll("-", "").slice(0, 12);
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

  async addMessage(objectId: string, body: string): Promise<unknown> {
    this.assertObjectId(objectId);
    const message = {
      header: "ביטוח ישיר",
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
      textModulesData: modules,
    });
  }

  async sendCarRenewal(objectId: string): Promise<{ object: unknown; renewalUrl: string }> {
    this.assertObjectId(objectId);
    const objectPatch = {
      linksModuleData: {
        uris: [{ uri: config.renewalUrl, description: "לחץ כאן" }],
      },
    };
    const [object] = await Promise.all([
      this.patchObject(objectId, objectPatch),
      this.addMessage(objectId, "זמן לחדש את הרכב"),
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

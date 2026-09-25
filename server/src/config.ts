import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
dotenv.config();

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

function loadServiceAccount(): ServiceAccountCredentials | undefined {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  try {
    const credentialCandidates = keyPath
      ? [path.resolve(keyPath), path.resolve(process.cwd(), keyPath), path.resolve(process.cwd(), "..", keyPath)]
      : [];
    const resolvedKeyPath = credentialCandidates.find((candidate) => fs.existsSync(candidate));
    const parsed = rawJson
      ? JSON.parse(rawJson)
      : resolvedKeyPath
        ? JSON.parse(fs.readFileSync(resolvedKeyPath, "utf8"))
        : undefined;
    if (!parsed || typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") return undefined;
    return parsed as ServiceAccountCredentials;
  } catch {
    return undefined;
  }
}

const dataFile = process.env.DATA_FILE ?? "./data/issued-cards.json";
const port = process.env.PORT ?? "4000";

export const config = {
  port: Number(port),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  publicApiOrigin: process.env.PUBLIC_API_ORIGIN ?? "http://localhost:" + port,
  issuerId: process.env.GOOGLE_WALLET_ISSUER_ID ?? "",
  serviceAccount: loadServiceAccount(),
  renewalUrl: process.env.CAR_RENEWAL_URL ?? "https://www.555.co.il/",
  dataFile: path.resolve(process.cwd(), dataFile),
};

import cors from "cors";
import express from "express";
import { config } from "./config";
import { createApiRouter } from "./http/routes";
import { IssuedCardRepository } from "./services/issuedCardRepository";
import { WalletService } from "./services/walletService";

async function start() {
  const app = express();
  const repository = new IssuedCardRepository(config.dataFile);
  await repository.initialize();
  const wallet = new WalletService(config.issuerId);

  app.disable("x-powered-by");
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", createApiRouter(repository, wallet));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const err = error as { message?: string; status?: number };
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    response.status(status).json({ error: err.message ?? "שגיאת שרת." });
  });

  app.listen(config.port, () => {
    console.log(
      "Direct Insurance Wallet API listening on http://localhost:" + config.port +
      (wallet.isConfigured ? " (Google Wallet configured)" : " (Google Wallet credentials missing)"),
    );
  });
}

start().catch((error: unknown) => {
  console.error("Could not start Wallet API", error);
  process.exitCode = 1;
});

import fs from "node:fs/promises";
import path from "node:path";
import type { IssuedCard, WalletState } from "../domain/types";

/** A small JSON-backed registry; replace with the CRM/database adapter in production. */
export class IssuedCardRepository {
  private cards = new Map<string, IssuedCard>();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async initialize(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const cards = JSON.parse(raw) as IssuedCard[];
      // Old local demo records were never created in Google and cannot be managed through its API.
      for (const card of cards) {
        if (card.provider === "google") this.cards.set(card.objectId, card);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  listForCustomer(customerId: string): IssuedCard[] {
    return [...this.cards.values()]
      .filter((card) => card.provider === "google" && card.customerId === customerId)
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }

  listAll(): IssuedCard[] {
    return [...this.cards.values()];
  }

  get(objectId: string): IssuedCard | undefined {
    const card = this.cards.get(objectId);
    return card?.provider === "google" ? card : undefined;
  }

  async addMany(cards: IssuedCard[]): Promise<void> {
    for (const card of cards) this.cards.set(card.objectId, card);
    await this.persist();
  }

  async updateState(objectId: string, state: WalletState): Promise<IssuedCard | undefined> {
    const card = this.cards.get(objectId);
    if (!card) return undefined;
    card.state = state;
    await this.persist();
    return card;
  }

  async markNotValid(objectId: string): Promise<IssuedCard | undefined> {
    const card = this.cards.get(objectId);
    if (!card) return undefined;
    card.state = "ACTIVE";
    card.isMarkedInvalid = true;
    await this.persist();
    return card;
  }

  private persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = this.filePath + ".tmp";
      await fs.writeFile(temporaryPath, JSON.stringify([...this.cards.values()], null, 2), "utf8");
      await fs.rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
  }
}

import fs from "node:fs/promises";
import path from "node:path";
import type { IssuedCard, WalletState } from "../domain/types";

interface CustomerCardIndex {
  customerId: string;
  file: string;
  cardCount: number;
  cards: Array<Omit<IssuedCard, "classId" | "provider">>;
}

interface IssuedCardsIndex {
  schemaVersion: 1;
  generatedAt: string;
  customers: CustomerCardIndex[];
}

/**
 * JSON-backed registry. issued-cards.json is a human-readable index, while each
 * customer's full Wallet records live in a separate file under issued-cards-data/.
 * A legacy array in issued-cards.json is migrated on the first startup.
 */
export class IssuedCardRepository {
  private cards = new Map<string, IssuedCard>();
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly customerDataDirectory: string;

  constructor(private readonly filePath: string) {
    this.customerDataDirectory = path.join(path.dirname(filePath), "issued-cards-data");
  }

  async initialize(): Promise<void> {
    let index: unknown;
    let hasIndex = false;
    try {
      index = JSON.parse(await fs.readFile(this.filePath, "utf8")) as unknown;
      hasIndex = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    let isLegacyArray = false;
    if (Array.isArray(index)) {
      // Earlier releases stored full records directly in issued-cards.json.
      isLegacyArray = true;
      this.addGoogleCards(index as IssuedCard[]);
    } else if (hasIndex && !this.isCurrentIndex(index)) {
      throw new Error("מבנה issued-cards.json אינו מוכר; קובץ הנתונים לא שונה.");
    }

    const customerFiles = await this.readCustomerFiles();
    for (const card of customerFiles.cards) this.addGoogleCards([card]);

    if (!isLegacyArray && this.isCurrentIndex(index)) {
      const missingCustomerFiles = index.customers.filter((customer) =>
        customer.cardCount > 0 && !customerFiles.names.has(this.customerFileName(customer.customerId)));
      if (missingCustomerFiles.length > 0) {
        throw new Error("חסרים קובצי לקוח בתיקיית issued-cards-data; קובץ האינדקס נשמר ללא שינוי.");
      }
    }

    // Creates a readable index for fresh installations and completes legacy migration.
    await this.persist();
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

  async markValid(objectId: string): Promise<IssuedCard | undefined> {
    const card = this.cards.get(objectId);
    if (!card) return undefined;
    card.state = "ACTIVE";
    card.isMarkedInvalid = false;
    await this.persist();
    return card;
  }

  private addGoogleCards(cards: IssuedCard[]): void {
    for (const card of cards) {
      if (card?.provider === "google" && typeof card.objectId === "string" && typeof card.customerId === "string") {
        this.cards.set(card.objectId, card);
      }
    }
  }

  private isCurrentIndex(value: unknown): value is IssuedCardsIndex {
    return Boolean(
      value &&
      typeof value === "object" &&
      "schemaVersion" in value && value.schemaVersion === 1 &&
      "customers" in value && Array.isArray(value.customers),
    );
  }

  private async readCustomerFiles(): Promise<{ cards: IssuedCard[]; names: Set<string> }> {
    let fileNames: string[];
    try {
      fileNames = await fs.readdir(this.customerDataDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { cards: [], names: new Set() };
      throw error;
    }

    const records: IssuedCard[] = [];
    const dataFiles = fileNames.filter((file) => file.endsWith(".json"));
    for (const name of dataFiles) {
      const parsed = JSON.parse(await fs.readFile(path.join(this.customerDataDirectory, name), "utf8")) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error(`קובץ נתונים לא תקין עבור לקוח: ${name}`);
      }
      records.push(...parsed as IssuedCard[]);
    }
    return { cards: records, names: new Set(dataFiles) };
  }

  private customerFileName(customerId: string): string {
    // Keep generated customer IDs recognizable while preventing path traversal.
    const safeId = encodeURIComponent(customerId).replaceAll(".", "%2E");
    return `${safeId}.json`;
  }

  private makeIndex(groups: Map<string, IssuedCard[]>): IssuedCardsIndex {
    const customers = [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([customerId, cards]) => ({
        customerId,
        file: path.posix.join("issued-cards-data", this.customerFileName(customerId)),
        cardCount: cards.length,
        cards: cards.map(({ classId: _classId, provider: _provider, ...visibleFields }) => visibleFields),
      }));
    return { schemaVersion: 1, generatedAt: new Date().toISOString(), customers };
  }

  private async writeAtomically(filePath: string, content: string): Promise<void> {
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, content, "utf8");
    await fs.rename(temporaryPath, filePath);
  }

  private persist(): Promise<void> {
    const nextWrite = this.writeQueue.catch(() => undefined).then(async () => {
      const groups = new Map<string, IssuedCard[]>();
      for (const card of this.cards.values()) {
        const customerCards = groups.get(card.customerId) ?? [];
        customerCards.push(card);
        groups.set(card.customerId, customerCards);
      }

      await fs.mkdir(this.customerDataDirectory, { recursive: true });
      for (const [customerId, cards] of groups) {
        const customerFile = path.join(this.customerDataDirectory, this.customerFileName(customerId));
        await this.writeAtomically(customerFile, JSON.stringify(cards, null, 2));
      }

      // The index is committed last, after all referenced customer files are durable.
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await this.writeAtomically(this.filePath, JSON.stringify(this.makeIndex(groups), null, 2));
    });
    this.writeQueue = nextWrite;
    return nextWrite;
  }
}

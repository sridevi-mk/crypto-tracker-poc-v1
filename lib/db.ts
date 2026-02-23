import { promises as fs } from "fs";
import path from "path";

export type UserPreferences = {
  selectedCurrency: string;
  watchlist: string[];
  updatedAt: string;
};

export type AlertCondition = "price_above" | "price_below" | "change_24h_above" | "change_24h_below";

export type AlertRule = {
  id: string;
  symbol: string;
  condition: AlertCondition;
  threshold: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastEvaluatedAt?: string;
  lastTriggeredAt?: string;
  lastDeliveryStatus?: "sent" | "failed" | "skipped";
  lastDeliveryMessage?: string;
};

export type UserAuth = {
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
};

export type UserRecord = {
  username: string;
  auth?: UserAuth;
  wallets: string[];
  preferences: UserPreferences;
  alerts: AlertRule[];
  updatedAt: string;
};

type AppDb = {
  users: Record<string, UserRecord>;
};

const DEFAULT_DB: AppDb = {
  users: {},
};

let writeLock: Promise<void> = Promise.resolve();

function resolveDbPath() {
  const cwd = process.cwd();
  if (path.basename(cwd) === "crptotracker-workspace") {
    return path.join(cwd, "data", "appdb.json");
  }
  return path.join(cwd, "crptotracker-workspace", "data", "appdb.json");
}

function nowIso() {
  return new Date().toISOString();
}

function createDefaultUser(username: string): UserRecord {
  const now = nowIso();
  return {
    username,
    wallets: [],
    preferences: {
      selectedCurrency: "USD",
      watchlist: [],
      updatedAt: now,
    },
    alerts: [],
    updatedAt: now,
  };
}

async function ensureDbFile() {
  const dbPath = resolveDbPath();
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify(DEFAULT_DB, null, 2), "utf8");
  }
  return dbPath;
}

export async function readDb(): Promise<AppDb> {
  const dbPath = await ensureDbFile();
  const raw = await fs.readFile(dbPath, "utf8");
  try {
    const parsed = JSON.parse(raw) as AppDb;
    if (!parsed || typeof parsed !== "object" || !parsed.users) {
      return { ...DEFAULT_DB };
    }
    return parsed;
  } catch {
    return { ...DEFAULT_DB };
  }
}

export async function listUsers(): Promise<UserRecord[]> {
  const db = await readDb();
  return Object.values(db.users || {});
}

export async function writeDb(db: AppDb): Promise<void> {
  const dbPath = await ensureDbFile();
  writeLock = writeLock.then(async () => {
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
  });
  await writeLock;
}

export async function getOrCreateUser(username: string): Promise<UserRecord> {
  const db = await readDb();
  const existing = db.users[username];
  if (existing) return existing;

  const next = createDefaultUser(username);
  db.users[username] = next;
  await writeDb(db);
  return next;
}

export async function getUser(username: string): Promise<UserRecord | undefined> {
  const db = await readDb();
  return db.users[username];
}

export async function updateUser(
  username: string,
  updater: (user: UserRecord) => UserRecord
): Promise<UserRecord> {
  const db = await readDb();
  const current = db.users[username] || createDefaultUser(username);
  const next = updater({
    ...current,
    wallets: [...current.wallets],
    preferences: {
      ...current.preferences,
      watchlist: [...current.preferences.watchlist],
    },
    alerts: [...(current.alerts || [])],
  });
  next.updatedAt = nowIso();
  db.users[username] = next;
  await writeDb(db);
  return next;
}

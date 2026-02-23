import { getOrCreateUser, getUser, updateUser } from "@/lib/db";
import { logger } from "@/lib/logger";

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function usePostgres() {
  return Boolean(process.env.DATABASE_URL) && process.env.USER_STORE_BACKEND !== "file";
}

async function withPgFallback<T>(op: string, pgFn: () => Promise<T>, fallbackFn: () => Promise<T>): Promise<T> {
  if (!usePostgres()) return fallbackFn();
  try {
    return await pgFn();
  } catch (err) {
    logger.warn("user_store.pg_fallback", { op, reason: err instanceof Error ? err.message : "unknown" });
    return fallbackFn();
  }
}

async function pgRepo() {
  return import("@/lib/user-repo-postgres");
}

export async function getUserPreferences(username: string) {
  return withPgFallback(
    "getUserPreferences",
    async () => {
      const repo = await pgRepo();
      const pref = await repo.pgGetPreferencesByUsername(username);
      if (pref) return pref;
      await repo.pgSavePreferencesByUsername(username, { selectedCurrency: "USD", watchlist: [] });
      return (
        (await repo.pgGetPreferencesByUsername(username)) || {
          selectedCurrency: "USD",
          watchlist: [],
          updatedAt: new Date().toISOString(),
        }
      );
    },
    async () => {
      const user = await getOrCreateUser(username);
      return user.preferences;
    }
  );
}

export async function saveUserPreferences(
  username: string,
  patch: { selectedCurrency?: string; watchlist?: string[] }
) {
  return withPgFallback(
    "saveUserPreferences",
    async () => {
      const repo = await pgRepo();
      const saved = await repo.pgSavePreferencesByUsername(username, patch);
      return (
        saved || {
          selectedCurrency: patch.selectedCurrency || "USD",
          watchlist: patch.watchlist || [],
          updatedAt: new Date().toISOString(),
        }
      );
    },
    async () => {
      const next = await updateUser(username, (user) => {
        const selectedCurrency = patch.selectedCurrency ?? user.preferences.selectedCurrency;
        const watchlist = patch.watchlist ?? user.preferences.watchlist;
        return {
          ...user,
          preferences: {
            ...user.preferences,
            selectedCurrency,
            watchlist,
            updatedAt: new Date().toISOString(),
          },
        };
      });
      return next.preferences;
    }
  );
}

export async function getUserWallets(username: string) {
  return withPgFallback(
    "getUserWallets",
    async () => {
      const repo = await pgRepo();
      return repo.pgListWalletsByUsername(username);
    },
    async () => {
      const user = await getOrCreateUser(username);
      return user.wallets;
    }
  );
}

export async function addUserWallet(username: string, address: string) {
  return withPgFallback(
    "addUserWallet",
    async () => {
      const repo = await pgRepo();
      return repo.pgAddWalletByUsername(username, address);
    },
    async () => {
      const normalized = normalizeAddress(address);
      const next = await updateUser(username, (user) => {
        const hasWallet = user.wallets.some((w) => normalizeAddress(w) === normalized);
        if (hasWallet) return user;
        return { ...user, wallets: [...user.wallets, address] };
      });
      return next.wallets;
    }
  );
}

export async function removeUserWallet(username: string, address: string) {
  return withPgFallback(
    "removeUserWallet",
    async () => {
      const repo = await pgRepo();
      return repo.pgRemoveWalletByUsername(username, address);
    },
    async () => {
      const normalized = normalizeAddress(address);
      const next = await updateUser(username, (user) => ({
        ...user,
        wallets: user.wallets.filter((w) => normalizeAddress(w) !== normalized),
      }));
      return next.wallets;
    }
  );
}

export async function userExists(username: string) {
  return withPgFallback(
    "userExists",
    async () => {
      const repo = await pgRepo();
      return repo.pgUserExists(username);
    },
    async () => Boolean(await getUser(username))
  );
}

export async function getUserAuthCredentials(username: string) {
  return withPgFallback(
    "getUserAuthCredentials",
    async () => {
      const repo = await pgRepo();
      return repo.pgGetAuthCredentialsByUsername(username);
    },
    async () => {
      const user = await getUser(username);
      return user?.auth || null;
    }
  );
}

export async function createUserWithPassword(username: string, passwordHash: string, passwordSalt: string) {
  return withPgFallback(
    "createUserWithPassword",
    async () => {
      const repo = await pgRepo();
      const existing = await repo.pgUserExists(username);
      if (existing) return null;
      return repo.pgCreateUser({ username, passwordHash, passwordSalt });
    },
    async () => {
      const existing = await getUser(username);
      if (existing) return null;
      const now = new Date().toISOString();
      const user = await updateUser(username, (next) => ({
        ...next,
        auth: {
          passwordHash,
          passwordSalt,
          createdAt: now,
        },
      }));
      return user;
    }
  );
}

export async function getUserWatchlist(username: string) {
  return withPgFallback(
    "getUserWatchlist",
    async () => {
      const repo = await pgRepo();
      return repo.pgGetWatchlistByUsername(username);
    },
    async () => {
      const user = await getOrCreateUser(username);
      return user.preferences.watchlist || [];
    }
  );
}

export async function addUserWatchlistSymbol(username: string, symbol: string) {
  return withPgFallback(
    "addUserWatchlistSymbol",
    async () => {
      const repo = await pgRepo();
      return repo.pgAddWatchlistByUsername(username, symbol);
    },
    async () => {
      const normalized = symbol.trim().toUpperCase();
      const next = await updateUser(username, (user) => {
        const existing = new Set((user.preferences.watchlist || []).map((s) => s.toUpperCase()));
        existing.add(normalized);
        return {
          ...user,
          preferences: {
            ...user.preferences,
            watchlist: Array.from(existing),
            updatedAt: new Date().toISOString(),
          },
        };
      });
      return next.preferences.watchlist;
    }
  );
}

export async function removeUserWatchlistSymbol(username: string, symbol: string) {
  return withPgFallback(
    "removeUserWatchlistSymbol",
    async () => {
      const repo = await pgRepo();
      return repo.pgRemoveWatchlistByUsername(username, symbol);
    },
    async () => {
      const normalized = symbol.trim().toUpperCase();
      const next = await updateUser(username, (user) => ({
        ...user,
        preferences: {
          ...user.preferences,
          watchlist: (user.preferences.watchlist || []).filter((s) => s.toUpperCase() !== normalized),
          updatedAt: new Date().toISOString(),
        },
      }));
      return next.preferences.watchlist;
    }
  );
}

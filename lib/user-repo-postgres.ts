import { prisma } from "@/lib/prisma";

export async function pgFindUserByUsername(username: string) {
  return prisma.user.findUnique({
    where: { username },
    include: { preference: true, wallets: true },
  });
}

export async function pgCreateUser(input: {
  username: string;
  passwordHash: string;
  passwordSalt: string;
}) {
  return prisma.user.create({
    data: {
      username: input.username,
      passwordHash: input.passwordHash,
      passwordSalt: input.passwordSalt,
      preference: {
        create: {
          selectedCurrency: "USD",
          watchlist: [],
        },
      },
    },
  });
}

export async function pgUserExists(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  return Boolean(user);
}

export async function pgGetAuthCredentialsByUsername(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      passwordHash: true,
      passwordSalt: true,
      createdAt: true,
    },
  });
  if (!user) return null;
  return {
    passwordHash: user.passwordHash,
    passwordSalt: user.passwordSalt,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function pgCreateSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  return prisma.session.create({
    data: {
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    },
  });
}

export async function pgUpsertWallet(input: {
  userId: string;
  address: string;
  chain?: string;
}) {
  const chain = input.chain || "ethereum";
  return prisma.wallet.upsert({
    where: {
      userId_address_chain: {
        userId: input.userId,
        address: input.address,
        chain,
      },
    },
    create: {
      userId: input.userId,
      address: input.address,
      chain,
    },
    update: {},
  });
}

export async function pgListWalletsByUsername(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      wallets: {
        select: { address: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  return user?.wallets?.map((w) => w.address) || [];
}

export async function pgAddWalletByUsername(username: string, address: string, chain = "ethereum") {
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return [];
  await pgUpsertWallet({ userId: user.id, address, chain });
  return pgListWalletsByUsername(username);
}

export async function pgRemoveWalletByUsername(username: string, address: string, chain = "ethereum") {
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return [];
  await prisma.wallet.deleteMany({
    where: {
      userId: user.id,
      address,
      chain,
    },
  });
  return pgListWalletsByUsername(username);
}

export async function pgUpdatePreferences(input: {
  userId: string;
  selectedCurrency?: string;
  watchlist?: string[];
}) {
  return prisma.preference.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      selectedCurrency: input.selectedCurrency || "USD",
      watchlist: input.watchlist || [],
    },
    update: {
      selectedCurrency: input.selectedCurrency,
      watchlist: input.watchlist,
    },
  });
}

export async function pgGetPreferencesByUsername(username: string) {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      preference: true,
    },
  });
  if (!user?.preference) return null;
  return {
    selectedCurrency: user.preference.selectedCurrency,
    watchlist: Array.isArray(user.preference.watchlist) ? (user.preference.watchlist as string[]) : [],
    updatedAt: user.preference.updatedAt.toISOString(),
  };
}

export async function pgSavePreferencesByUsername(
  username: string,
  patch: { selectedCurrency?: string; watchlist?: string[] }
) {
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) return null;
  const pref = await pgUpdatePreferences({
    userId: user.id,
    selectedCurrency: patch.selectedCurrency,
    watchlist: patch.watchlist,
  });
  return {
    selectedCurrency: pref.selectedCurrency,
    watchlist: Array.isArray(pref.watchlist) ? (pref.watchlist as string[]) : [],
    updatedAt: pref.updatedAt.toISOString(),
  };
}

export async function pgGetWatchlistByUsername(username: string) {
  const pref = await pgGetPreferencesByUsername(username);
  return pref?.watchlist || [];
}

export async function pgAddWatchlistByUsername(username: string, symbol: string) {
  const current = await pgGetWatchlistByUsername(username);
  const next = Array.from(new Set([...current.map((s) => s.toUpperCase()), symbol.toUpperCase()]));
  await pgSavePreferencesByUsername(username, { watchlist: next });
  return next;
}

export async function pgRemoveWatchlistByUsername(username: string, symbol: string) {
  const current = await pgGetWatchlistByUsername(username);
  const next = current.filter((s) => s.toUpperCase() !== symbol.toUpperCase());
  await pgSavePreferencesByUsername(username, { watchlist: next });
  return next;
}

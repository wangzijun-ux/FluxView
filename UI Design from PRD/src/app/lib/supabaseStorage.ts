import { supabase, isSupabaseConfigured } from "./supabaseClient";

const APP_STORAGE_TABLE = "app_storage";
const APP_KEY_PREFIX = "fluxview-";
const EXCLUDED_KEYS = new Set(["fluxview-theme"]);
const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;

let patchInstalled = false;
let isHydrating = false;
let flushTimer: number | null = null;
const pendingChanges = new Map<string, string | null>();

function shouldSyncKey(key: string) {
  return key.startsWith(APP_KEY_PREFIX) && !EXCLUDED_KEYS.has(key);
}

function readLocalEntries() {
  if (typeof window === "undefined") return [] as Array<{ storage_key: string; storage_value: string }>;
  const entries: Array<{ storage_key: string; storage_value: string }> = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !shouldSyncKey(key)) continue;
    const value = window.localStorage.getItem(key);
    if (value == null) continue;
    entries.push({ storage_key: key, storage_value: value });
  }
  return entries;
}

async function flushPendingChanges() {
  flushTimer = null;
  if (!supabase || pendingChanges.size === 0) return;

  const changes = Array.from(pendingChanges.entries());
  pendingChanges.clear();

  const upserts = changes
    .filter(([, value]) => value !== null)
    .map(([storage_key, storage_value]) => ({
      storage_key,
      storage_value: storage_value ?? "",
      updated_at: new Date().toISOString(),
    }));
  const deletes = changes.filter(([, value]) => value === null).map(([key]) => key);

  if (upserts.length > 0) {
    const { error } = await supabase.from(APP_STORAGE_TABLE).upsert(upserts, { onConflict: "storage_key" });
    if (error) console.error("Failed to sync app storage to Supabase:", error);
  }

  if (deletes.length > 0) {
    const { error } = await supabase.from(APP_STORAGE_TABLE).delete().in("storage_key", deletes);
    if (error) console.error("Failed to delete app storage from Supabase:", error);
  }
}

function enqueueChange(key: string, value: string | null) {
  if (!isSupabaseConfigured) return;
  pendingChanges.set(key, value);
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    void flushPendingChanges();
  }, 300);
}

async function seedRemoteFromLocal() {
  if (!supabase) return;
  const entries = readLocalEntries();
  if (entries.length === 0) return;
  const payload = entries.map((entry) => ({
    ...entry,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from(APP_STORAGE_TABLE).upsert(payload, { onConflict: "storage_key" });
  if (error) console.error("Failed to seed Supabase app storage from localStorage:", error);
}

export function isSupabaseStorageEnabled() {
  return isSupabaseConfigured;
}

export function installSupabaseStorageSync() {
  if (patchInstalled || typeof window === "undefined") return;
  patchInstalled = true;

  Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (this === window.localStorage && shouldSyncKey(key) && !isHydrating) {
      enqueueChange(key, value);
    }
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key: string) {
    originalRemoveItem.call(this, key);
    if (this === window.localStorage && shouldSyncKey(key) && !isHydrating) {
      enqueueChange(key, null);
    }
  };
}

export async function hydrateSupabaseStorageToLocalStorage() {
  if (!supabase || typeof window === "undefined") return;

  isHydrating = true;
  try {
    const { data, error } = await supabase
      .from(APP_STORAGE_TABLE)
      .select("storage_key, storage_value")
      .like("storage_key", `${APP_KEY_PREFIX}%`);

    if (error) {
      console.error("Failed to read app storage from Supabase:", error);
      return;
    }

    const remoteEntries = data ?? [];
    if (remoteEntries.length === 0) {
      await seedRemoteFromLocal();
      return;
    }

    const remoteKeys = new Set(remoteEntries.map((entry) => entry.storage_key));
    const localKeys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => Boolean(key))
      .filter((key) => shouldSyncKey(key));

    localKeys.forEach((key) => {
      if (!remoteKeys.has(key)) {
        originalRemoveItem.call(window.localStorage, key);
      }
    });

    remoteEntries.forEach((entry) => {
      originalSetItem.call(window.localStorage, entry.storage_key, entry.storage_value);
    });
  } finally {
    isHydrating = false;
  }
}

export async function flushSupabaseStorageSync() {
  await flushPendingChanges();
}

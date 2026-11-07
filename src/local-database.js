const DATABASE_NAME = "haohao-local";
const DATABASE_VERSION = 1;
let databasePromise;

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  databasePromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("profiles"))
          database.createObjectStore("profiles", { keyPath: "key" });
        if (!database.objectStoreNames.contains("trips"))
          database.createObjectStore("trips", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return databasePromise;
}

function readFallback(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeFallback(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

async function readRecord(storeName, key) {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const request = database
        .transaction(storeName)
        .objectStore(storeName)
        .get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeRecord(storeName, key, value) {
  const database = await openDatabase();
  if (!database) return false;
  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put({ key, value });
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function loadProfile(key) {
  const stored = await readRecord("profiles", key);
  if (stored) return stored;
  const fallback = readFallback(key, null);
  if (fallback) await writeRecord("profiles", key, fallback);
  return fallback;
}

export async function saveProfile(key, profile) {
  const fallbackSaved = writeFallback(key, profile);
  const databaseSaved = await writeRecord("profiles", key, profile);
  return fallbackSaved || databaseSaved;
}

export async function loadTrips(profileKey) {
  const key = `trips-${profileKey}`;
  const stored = await readRecord("trips", key);
  if (Array.isArray(stored)) return stored;
  const fallbackKey =
    profileKey === "hhz-profile-local"
      ? "hhz-trips"
      : `hhz-trips-${profileKey.replace("hhz-profile-", "")}`;
  const fallback = readFallback(fallbackKey, []);
  if (fallback.length) await writeRecord("trips", key, fallback);
  return fallback;
}

export async function saveTrips(profileKey, trips) {
  const key = `trips-${profileKey}`;
  const fallbackKey =
    profileKey === "hhz-profile-local"
      ? "hhz-trips"
      : `hhz-trips-${profileKey.replace("hhz-profile-", "")}`;
  const fallbackSaved = writeFallback(fallbackKey, trips);
  const databaseSaved = await writeRecord("trips", key, trips);
  return fallbackSaved || databaseSaved;
}

export async function clearLocalData() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("hhz-")) localStorage.removeItem(key);
    }
  } catch {
    // 無法存取本機儲存空間時略過。
  }
  try {
    const database = await databasePromise;
    database?.close();
  } catch {
    // 資料庫尚未開啟。
  }
  databasePromise = undefined;
  if (!globalThis.indexedDB) return true;
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(DATABASE_NAME);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      request.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

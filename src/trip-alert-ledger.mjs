// Keep the last sent fingerprints per profile for the current page lifetime,
// even when browser storage is unavailable. Unsent alerts are not recorded.
export function createTripAlertLedger(read, write) {
  const profiles = new Map();
  return {
    get(key) {
      if (!profiles.has(key)) profiles.set(key, { ...read(key, {}) });
      return { ...profiles.get(key) };
    },
    save(key, fingerprints) {
      const copy = { ...fingerprints };
      profiles.set(key, copy);
      return write(key, copy);
    },
  };
}

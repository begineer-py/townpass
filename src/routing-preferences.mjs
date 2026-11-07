// Retired slope controls must not keep filtering routes through saved profiles.
export function normalizeRoutingPreferences(prefs = {}) {
 return {...prefs, maxSlope: 1000000, knownOnly: false, mode: prefs.mode === 'gentle' ? 'balanced' : prefs.mode};
}

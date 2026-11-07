// Retired slope controls must not keep filtering routes through saved profiles.
export function normalizeRoutingPreferences(prefs = {}) {
 return {...prefs, identity: 'wheelchair', minWidth: 0.9, maxSlope: 1000000, knownOnly: false, mode: prefs.mode === 'gentle' ? 'balanced' : prefs.mode};
}

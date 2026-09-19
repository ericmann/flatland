/**
 * The web implementation of Flatland's native-API adapter (SPEC §10):
 * share sheet, screen wake lock, haptics. Every caller goes through this
 * module rather than touching `navigator.*` directly, so a Capacitor
 * adapter can replace it later with no changes to `core`, `sim` or
 * `render`, and so a TWA/WebView missing one of these APIs degrades
 * gracefully instead of throwing.
 */

/**
 * Share a URL via the OS share sheet when available, else copy it to the
 * clipboard.
 * @param {{ url: string, title?: string }} opts
 * @returns {Promise<'shared'|'copied'|'unavailable'>}
 */
export async function share({ url, title }) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ url, title });
      return 'shared';
    } catch {
      return 'unavailable'; // includes the user cancelling the share sheet.
    }
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      return 'unavailable';
    }
  }
  return 'unavailable';
}

/**
 * Request a screen wake lock (used while idle, so the display doesn't
 * sleep mid-simulation) when the API exists. Resolves `null` rather than
 * throwing when it doesn't, or when the request is refused (e.g. a
 * backgrounded tab) — callers hold onto the sentinel and release it
 * themselves; a `null` sentinel's `release()` is a safe no-op.
 * @returns {Promise<{ release: () => Promise<void> } | null>}
 */
export async function wakeLock() {
  if (typeof navigator === 'undefined' || !navigator.wakeLock) return null;
  try {
    return await navigator.wakeLock.request('screen');
  } catch {
    return null;
  }
}

/**
 * Haptic feedback: a no-op on the web (SPEC §10 — Capacitor's Haptics
 * plugin fills this in later; no web API is worth wiring for a single
 * buzz).
 * @returns {void}
 */
export function haptic() {}

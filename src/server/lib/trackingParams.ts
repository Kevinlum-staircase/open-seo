const TRACKING_PARAMS = new Set([
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "yclid",
  "igshid",
  "srsltid",
  "mc_cid",
  "mc_eid",
  "_ga",
]);

/** Drops tracking parameters so the lookup targets the page, not a campaign link. */
export function stripTrackingParams(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const kept = new URLSearchParams();
    for (const [name, value] of url.searchParams) {
      if (!name.startsWith("utm_") && !TRACKING_PARAMS.has(name)) {
        kept.append(name, value);
      }
    }
    url.search = kept.toString();
    return url.toString();
  } catch {
    return rawUrl;
  }
}

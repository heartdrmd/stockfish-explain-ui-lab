// Render injects this public-only catalog before the module scripts. Other
// hosts and local file:// launches continue using their original URLs.
let catalog;
export function assetUrl(input) {
  if (typeof document === 'undefined') return input;
  if (!catalog) {
    try { catalog = JSON.parse(document.getElementById('asset-catalog')?.textContent || '{}'); }
    catch { catalog = {}; }
  }
  const url = new URL(input, document.baseURI);
  return url.origin === new URL(document.baseURI).origin && catalog[url.pathname] || input;
}

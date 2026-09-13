# Asset caching

The server hashes the public model and engine files once at startup and injects
their versioned URLs into the main and embedded-board HTML. These pages remain
`no-cache`, so a normal reload discovers the current files. Native app modules,
private APIs, and the cleanup service worker keep their existing policies.

`/asset-cache/<sha256>/<original-path>` serves only files in the public asset
catalog, with a one-year immutable policy and a content-derived ETag. Models and
NNUE files have independent versions. Each engine's scripts and WASM have a shared
versioned directory so relative worker imports resolve to compatible files.
Timestamps do not determine the version. Editing file contents changes its URL;
editing an unrelated button or redeploying unchanged files does not.

The alias route verifies a file if its timestamp or size changes while the server
is running. It never serves altered bytes at an old fingerprint. Restart the
server after replacing assets. Old open pages may need a normal reload when their
referenced engine/model version has been replaced. Previously published hashed
JavaScript bundles are retained during this release for already-open tabs.

The standalone viewer falls back to its original URLs when the host does not
provide a catalog. This preserves portable and Sites hosting. In the renderer,
studio-detail meshes load when Piece Studio is opened, rather than invisibly
preloading during normal board play. No model or engine binaries were modified.

The speculative inline engine preloader was removed: its flavor map could fetch
a lite engine before the app selected Lichess Full. The actual selected engine
loads normally. The explicit Preload engines button now uses the same versioned
URLs and includes the real Lichess dependencies instead of `lichess-shim.wasm`.

## Verification, 2026-09-13

- Five HTTP/catalog tests cover stable versions across timestamp changes, new
  URLs for corrected models, matching worker/WASM directories, revalidation,
  range requests, missing/stale versions, and unchanged private API policy.
- Chrome rendered the existing board, then the rebuilt board: all eight normal
  board models used versioned URLs; the repeat load transferred zero model bytes.
- The isolated fresh-context comparison measured 18.31 MB of model responses
  before versus 9.70 MB after on the first load (the removed hidden detail mesh
  accounts for the difference). Its repeat loads measured 8.62 MB versus zero.
  These figures describe that controlled test, not every browser cache state.
- A separate fresh **persistent Chrome profile with default cache settings**
  downloaded the 108,919,594-byte NNUE once and transferred zero bytes when it
  requested it again. Private/ephemeral contexts can have different cache limits.
- Lichess Full booted with `activeNet: big`; the embedded lite engine returned a
  legal best move. Piece Studio still requested and displayed its detailed knight.
- All 76 GLB files retained their SHA-256 checksums; TypeScript and portable build
  passed. The existing general test suite has one unrelated outdated assertion
  about the notation wheel handler; it also fails against the unchanged parent
  commit (`48e959b`).
- The viewer's general lint task also reports existing findings. Focused lint
  reported only the unchanged synchronous-effect warning in watch analysis and
  an unchanged redundant array spread in the scene; the new URL helper passed.

After deployment, inspect a normal reload with DevTools **Disable cache off**.
Models should use `/asset-cache/` URLs and show disk/memory cache on reuse.
Verify `/api/whoami`, a model response, and a WASM response. A browser can still
evict cached files; first visits, new devices, and genuinely updated assets still
download data. Monthly savings require comparison with actual Render metrics.

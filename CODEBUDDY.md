# CODEBUDDY.md

This file provides guidance to CodeBuddy Code when working with code in this repository.

## Overview

DTV is a cross-platform desktop live-streaming client (斗鱼 / 虎牙 / 抖音 / bilibili) built with
**Wails v3**: a Go backend + a React 19 / TypeScript / Vite frontend bundled into
`frontend/dist` and embedded into the binary via `//go:embed all:frontend/dist` (`main.go:25`).
It is a port of an older Tauri/Rust project; many files document deliberate divergences from the
old implementation, so read the file-header comments before changing platform logic.

README notes: platform APIs have rate limits (excessive requests trigger captchas — use search
sparingly); the project is for learning purposes only; stream copyright belongs to each platform.

## Prerequisites

- Go 1.26+ (`go.mod`)
- Node 20+ / 22, pnpm (`.npmrc` sets `minimum-release-age=10080`)
- Wails v3 CLI: `go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0`
- On Linux, Wails v3 needs GTK4 / WebKitGTK 6.0 dev packages (`webkitgtk-6.0.pc`) to compile the
  main app and `internal/services`.

## Commands

### Setup / dev / build (repo root)

```bash
cd frontend && pnpm install && cd ..     # install frontend deps
wails3 dev                              # dev mode; Taskfile dev task uses -config ./build/config.yml -port 2896
wails3 build                            # production build
wails3 package                          # create installable package
```

`wails3 dev` runs the Vite dev server on port 2896 (`WAILS_VITE_PORT`, see `frontend/vite.config.ts`).
The root `Taskfile.yml` dispatches `build` / `package` / `run` / `dev` to the matching platform
Taskfile by `GOOS`. Other tasks: `build:server`, `run:server` (HTTP-server-only, `-tags server`),
`build:docker`, `run:docker`, `setup:docker` (cross-compile image), `install:msix:tools`.

### Go

```bash
go mod tidy
go test ./internal/platforms/...                                  # pure-Go packages, always works
go test ./internal/platforms/douyu -run TestNormalizeSearchLive  # single test
go test ./internal/services -run TestFlvDemuxerParsesHeaderAndTags
```

Only two Go test files exist: `internal/platforms/douyu/search_test.go` (search `isLive`
normalization) and `internal/services/flv_relay_test.go` (FLV demuxer / timeline / A/V normalizer).

**Do not expect `go test ./...` to pass on a bare checkout.** It fails for two reasons:
1. `main.go:25` embeds `frontend/dist`, which is generated (absent on fresh clone) — build the
   frontend first.
2. `internal/services` imports `wailsapp/wails/v3/pkg/application`, which needs WebKitGTK 6.0 on
   Linux (`pkg-config --cflags webkitgtk-6.0`). Platform packages, `jssign`, `appdirs`, `logging`
   are Wails-free and testable in isolation by design.

### Frontend (`cd frontend`)

```bash
pnpm dev          # vite (browser preview; no Go backend)
pnpm build        # tsc --noEmit && vite build --mode production
pnpm build:dev    # unminified development build
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm format       # prettier --write .
pnpm test         # vitest run  (no *.test.* files currently exist)
pnpm preview
```

`VITE_DTV_MOCK=1` forces the whole `DtvApi` to use `src/api/mock` fake data, letting you debug UI
in a plain browser with no Go backend.

### Generated bindings (critical)

`frontend/bindings/` is **generated, gitignored and not committed** (absent on fresh clone).
Frontend adapters import e.g. `../../bindings/dtv/internal/services/douyuservice`, so
`pnpm typecheck` and `pnpm build` require bindings to exist first (eslint ignores the dir, so
`pnpm lint` is unaffected). Generate them via:

```bash
wails3 generate bindings -clean=true -ts -i     # or via: wails3 task common:generate:bindings
```

`wails3 build` / `wails3 dev` run this automatically through the Taskfile
(`build/Taskfile.yml`, `generate:bindings`, with `-f '{{.BUILD_FLAGS}}'`). Never hand-edit
`frontend/bindings/`; it is wiped with `-clean=true`. `eslint.config.js` ignores it.

### Version & build assets

`build/config.yml` `info.version` is the **single source of version truth** (currently 4.1.0) —
`frontend/vite.config.ts` reads it into `__APP_VERSION__`, and the macOS CI syncs it into
`Info.plist`. After changing `info` / `fileAssociations`, run
`wails3 task common:update:build-assets`. Icons: `wails3 generate icons` (task
`common:generate:icons`). macOS signing: `wails3 tool sign`.

### Packaging (from README)

```bash
# macOS — arm64 / Intel
wails3 task darwin:package ARCH=arm64 && wails3 task darwin:create:dmg
wails3 task darwin:package ARCH=amd64 && wails3 task darwin:create:dmg

# Windows — exe then WiX v3 MSI
wails3 build SIGN_ENABLED=false
wails3 task windows:msi WIX_BIN="C:\path\to\wix314"
```

`.github/workflows/macos.yml` builds both macOS DMGs on `v*` tags or manual dispatch (optional
Developer ID signing / notarization via secrets). Windows builds are done locally.

### Linux (deb)

One command from the repo root, after the prerequisites below:

```bash
wails3 task linux:create:deb        # -> bin/dtv-go.deb
wails3 task linux:package           # same thing (currently deb only)
```

Prerequisites on Ubuntu 24.04+ / Debian 13+ (GTK4 stack, CGO required):

```bash
sudo apt install -y build-essential pkg-config libgtk-4-dev libwebkitgtk-6.0-dev
go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0
cd frontend && pnpm install && cd ..
```

The chain is `build/linux/Taskfile.yml`: `build` (generate bindings → `pnpm build` →
`go build -tags production` with `CGO_ENABLED=1`) → `generate:dotdesktop` → `create:deb`
(`wails3 tool package -format deb`, which uses Wails' embedded nfpm — no external
`fpm`/`dpkg-deb`/`nfpm` binary needed). `build/linux/nfpm/nfpm.yaml` holds the package
metadata, file list and `depends`; `version` there must track `build/config.yml`
`info.version`.

**Why the Linux package is named `dtv-go`, not `dtv`:** the old Tauri build is commonly
installed as a dpkg package literally named `dtv` (owning `/usr/bin/dtv`). A deb named `dtv`
would be treated as an *upgrade* and overwrite it. So the Linux package name, binary path,
`.desktop` and icon all use the `dtv-go` prefix. If you rename it, update all of:
`LINUX_NAME` in `build/linux/Taskfile.yml`, `name` + `contents` paths in
`build/linux/nfpm/nfpm.yaml`, and the generated `build/linux/dtv-go.desktop`.

The deb depends on `libgtk-4-1` + `libwebkitgtk-6.0-4` + `libc6` (binary dynamically links
`libwebkitgtk-6.0.so.4`, `libgtk-4.so.1`, `libsoup-3.0.so.0`,
`libjavascriptcoregtk-6.0.so.1`). `nfpm.yaml` deliberately omits `license` because the repo
has no LICENSE file and README declares no license — don't invent one. `lintian` will still
report `no-changelog` / `no-copyright-file` (Debian archive policy) plus `hardening-no-pie` /
`no-manual-page`; these don't affect local `dpkg -i` installs.

Wails v3.0.0 also supports a legacy GTK3 stack via `-tags gtk3` using `webkit2gtk-4.1`
(`libwebkit2gtk-4.1-dev`), which needs different deb deps; that path is removed in Wails v3.1.

**Do not re-enable `document.startViewTransition()` on Linux.** Wails v3.0.0's Linux
`init()` (`pkg/application/application_linux.go`) sets `WEBKIT_DISABLE_DMABUF_RENDERER=1`
when it detects an NVIDIA GPU, which leaves WebKitGTK 6.0's `AcceleratedBackingStore` null.
`startViewTransition()` forces accelerated compositing and dereferences that null pointer,
crashing the UI process with `SIGSEGV addr=0x48` (`signal arrived during cgo execution` — no Go
panic, so `PanicHandler` logs nothing). See https://bugs.webkit.org/show_bug.cgi?id=324730
(2.48/2.50/2.52 series). `frontend/src/components/shell/PlatformTabs.tsx` therefore skips View
Transitions when `isWailsRuntime() && detectDesktopOS() === "linux"`; macOS / Windows keep the
180ms fade. Remove that guard only after upgrading to a WebKitGTK with the fix.

**`/usr/bin/dtv-go` is a shell wrapper, not the ELF binary.** The real binary lives at
`/usr/lib/dtv-go/dtv-go`. Wails v3.0.0's Linux `init()` (`pkg/application/application_linux.go`)
sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on X11 whenever the nvidia module is loaded. That value
makes WebKitGTK 6.0's `rendererBufferTransportMode()` return without adding *either* Hardware or
SharedMemory transport — the same root cause as the View Transitions crash above — and shows up as
live-video-only flicker plus UI hangs when launched on the dGPU via switcheroo ("Launch using
Discrete Graphics Card"). `build/linux/dtv-go.sh` presets `WEBKIT_DISABLE_DMABUF_RENDERER=0`
(non-empty stops Wails overriding it; WebKit treats `0` as "not disabled") and
`__NV_DISABLE_EXPLICIT_SYNC=1` (Tauri's preferred NVIDIA workaround, no rendering-path cost),
then execs the real binary. `${VAR:-default}` keeps external overrides working. Wrapping the
launcher instead of only editing the `.desktop` `Exec` covers command-line, icon and switcheroo
launches alike; keep `contents` paths in `build/linux/nfpm/nfpm.yaml` in sync if you change it.

## Architecture

### Three-layer Go backend + IPC boundary

- **`main.go`** — Wails app bootstrap: frameless window (frontend draws Navbar/WindowControls via
  `--wails-draggable`), single instance (`com.dtv.app`), panic handler, window geometry persisted
  to `window.json` in `appdirs.ConfigDir()` with 400ms debounce, and **all service registration**.
- **`internal/services/*_service.go`** — the Wails IPC boundary. Every exported method becomes a
  frontend-callable TS binding (PascalCase names, JSON-serializable returns). Services only do
  param validation + error conversion; business logic lives in `internal/platforms`. `emit` is
  injected from `main.go` (`app.Event.Emit`) so platform code never imports Wails and stays
  `go test`-able. `ServiceShutdown()` cleans up danmaku websockets / local servers.
  - Four platform services (douyu / huya / douyin / bilibili), plus `StreamRelayService`,
    `ImageProxyService`, `LanSyncService`, `DataTransferService`.
- **`internal/platforms/<platform>/`** — one package per platform (client.go, categories.go,
  livelist.go, room_info.go, stream_url.go, danmaku.go, search.go, qrlogin.go, etc.). Ports of the
  old Rust implementation; file headers list intentional API changes (e.g. douyu danmaku moved from
  `wss://...:8506` to plaintext TCP 8601-8603 STT, douyu directory API swap).
  - `internal/platforms/common/types.go` — normalized types (`Streamer`, `StreamerPage`,
    `StreamInfo`, `DanmakuEvent`, QR-login structs...). **The `json` tags are the TS contract**:
    Wails' binding generator uses json tags as TS field names, so they must stay in sync with
    `frontend/src/api/types.ts`. `common/http.go` provides the shared `HttpClient` (direct
    connection, `Proxy: nil` — no system proxy).

### Local HTTP services (separate from Wails IPC)

- **`StreamRelayService`** (`stream_relay_service.go` + `flv_relay.go`) — douyu FLV direct links
  expire after 300s; a `127.0.0.1` `/stream` proxy re-resolves and splices a new FLV segment at a
  tag boundary. Frontend calls `PrepareDouyu` (`frontend/src/lib/streamRelay.ts`) and plays the
  local URL. **Only douyu is relayed** (`RELAY_PLATFORMS`); other platforms' direct links have no
  such deadline. It shares the same `*douyu.Client` as `DouyuService` so login cookies/quality are
  consistent.
- **`ImageProxyService`** — `127.0.0.1` `/image?url=&t=&w=` with a per-launch random token,
  CDN-specific Referer/UA, host allowlist, and a 300MB / 7-day LRU disk cache. Started at app
  boot from `main.tsx` (`ensureImageProxy`); also has `Prefetch`. Needed because B站/斗鱼 image
  CDNs reject WebView requests without a Referer.
- **`LanSyncService`** — LAN config sync: TCP 38999 (`/dtv-sync` manifest, `/dtv-sync/payload`)
  + UDP 38998 discovery, private-network-only, fixed token `dtv` (override with
  `DTV_LAN_SYNC_TOKEN`). Custom protocol compatible with the old Tauri version.
- **`DataTransferService`** — native file dialogs + disk IO only; JSON serialization/merge logic is
  in `frontend/src/lib/configTransfer.ts` so LAN sync and file sync share one merge rule.

### Event bus (danmaku)

Danmaku flows Go → frontend over the Wails event bus, not through return values: events
`danmaku-message` (global) and `danmaku-<roomId>` carry `common.DanmakuEvent` (payload includes
`roomId`). `DanmakuManager` listens to exactly one room at a time; `frontend/src/api/douyu.ts`
(`createDanmakuSubscription`, shared with huya) calls `StartDanmaku`, filters events by
`payload.roomId` to discard leftovers from a previous room, and `StopDanmaku` on unsubscribe.

### Support packages

- `internal/jssign/` — goja (pure Go, no cgo) runtime executing platform JS signing algorithms:
  embedded `cryptojs.min.js` and douyin `sign.js`; 3s script timeout, mutex-serialized runtime,
  `RunScriptThenCall` for douyu's per-request obfuscated `ub98484234` script.
- `internal/appdirs/` — OS config / cache / logs / WebView2 / image-cache directories.
- `internal/logging/` — slog to rotating files + stderr (10MB/day rotation).

### Frontend

- `src/api/index.ts` — the single `DtvApi` facade. Per-platform adapters in
  `src/api/{douyu,huya,douyin,bilibili}.ts` translate generated bindings → domain types via
  `src/api/mappers.ts`; `src/api/types.ts` holds the domain contract. `src/api/mock/` is the fake
  fallback (`VITE_DTV_MOCK=1`). Only douyu has third-level categories (三级分区,
  `listSubCategories` / `FetchThreeCate`).
- `src/main.tsx` — entry: `migrateStorageKeys()` (keeps localStorage keys compatible with the old
  Tauri app, see `src/lib/storage.ts`), startup landing, non-blocking image proxy start, and
  **no `React.StrictMode`** (imperative player/danmaku effects would double-run).
- `src/App.tsx` — `HashRouter` (Wails `AssetFileServerFS` has no SPA fallback; `/player` refresh
  would 404) + provider stack (`Theme → Toast → Follow → BilibiliAuth → DouyuAuth → PlayerUi →
  Subscription`). `src/routes.tsx` — home per platform, `/subscribe`, `/custom` redirect, lazy
  `PlayerPage`; `PlayerRoute` keys the page by `platform:roomId` to force a full remount on room
  switch (prevents stale player/danmaku instances).
- `src/features/player/useXgPlayer.ts` — xgplayer-flv / xgplayer-hls.js playback with disconnect
  retry; `src/state/*Provider.tsx` — React context state; `src/lib/window.ts` — Wails window
  control + `isWailsRuntime()` (checks `_wails.environment`, since browser preview also loads the
  runtime JS).
- Styling: CSS Modules + Tailwind v4 + HeroUI v3; `vite.config.ts` splits xgplayer/danmaku/UI
  into lazy chunks.

### Build system

Taskfile v3: root `Taskfile.yml` includes `build/Taskfile.yml` (common) +
`build/windows/Taskfile.yml` + `build/darwin/Taskfile.yml` + `build/linux/Taskfile.yml`,
dispatching by `GOOS` (overridable via `wails3 build GOOS=...`). `build/Taskfile.yml` owns
`generate:bindings`, `build:frontend`, `generate:icons`, server/docker tasks. Several tasks use `run: once` to avoid races with parallel
universal builds regenerating `frontend/bindings`. `build/config.yml` holds Wails `info` +
`dev_mode` config.

## Constraints worth preserving

- Keep `internal/platforms/**` free of Wails imports (testability); push IPC concerns into
  `internal/services`.
- When changing Go structs in `internal/platforms/common/types.go`, update
  `frontend/src/api/types.ts` and `mappers.ts` — json tags are the generated TS field names.
- Regenerate bindings after changing service method signatures; never commit generated files.
- Only douyu needs the stream relay; only douyu has cate3; QR login exists for douyu + bilibili.
- localStorage key names must stay compatible with the old Tauri app (`migrateStorageKeys`).
- All Go HTTP clients use `Proxy: nil`; don't route CDN/LAN traffic through a system proxy.

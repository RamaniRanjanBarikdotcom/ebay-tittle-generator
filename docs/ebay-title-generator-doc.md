# eBay Title Generator – Product & Technical Documentation

_Last updated: 2026-02-02_

## 1. Purpose
A desktop Electron app that ingests product catalogs (primarily printer consumables), generates eBay-compliant titles (71–79 chars, German-focused), lets users review/edit them, and exports results to Excel. Optional AI-assisted extraction via OpenAI improves component detection when enabled.

## 2. Tech Stack
- **Platform**: Electron 35 + electron-vite (Vite 6) + React 18
- **UI**: Ant Design 5, Space Grotesk font, custom light/dark theme toggles
- **Data grid**: ag-Grid Community
- **Charts**: Recharts (planned/unused in current UI)
- **State**: Local React state + lightweight Zustand stores (not heavily used yet)
- **Backend (local)**: Node/Electron main process with Better-SQLite3 (WAL mode) for persistence
- **File I/O**: ExcelJS import/export; fs-extra for filesystem helpers
- **AI integration**: OpenAI (GPT-4o-mini) via `OpenAIService` when Web Access enabled
- **Packaging**: electron-builder (win/mac/linux targets)
- **Testing & Quality**: Vitest, Playwright, ESLint 9, Prettier 3

## 3. High-Level Architecture
- **Electron Main (src/main)**
  - App bootstrap (`index.js`): creates BrowserWindow, wires preload, dev/packaged loading, devtools, crash logging.
  - Database layer (`database/sqlite.js`): initializes DB in `app.getPath('userData')`, runs migrations from `database/schema.sql`, enforces indexes, and exposes CRUD helpers.
  - IPC layer (`ipc-handlers.js`): renderer API surface (import, generate, review/update titles, export, stats, settings, OpenAI calls).
  - Title engine (`title-engine/*`): deterministic, offline generator that sanitizes, extracts components, and builds up to 3 compliant titles per product.
  - Import/Export: `ExcelImporter` maps flexible headers → products; `ExcelExporter` outputs generated titles with status per SKU.
  - AI service: `OpenAIService` wrapper and AI-assisted generation path (`data:generateTitlesWithAI`).

- **Preload (src/preload/index.js)**
  - Exposes safe `window.api` bridge: dialogs, import/export, generate (local/AI), settings CRUD, stats, progress events.

- **Renderer (src/renderer/src)**
  - Single-page React UI with tabs: Import, Generate, Review, Export, History, Settings.
  - Styling via `styles.css` (Space Grotesk, gradient sider, card-based panels, dark-mode variants).

- **Database schema (database/schema.sql)**
  - Tables: `products`, `generated_titles`, `title_history`, `language_settings`, `app_settings`.
  - Key settings: `default_language`, `max_title_length`, `variations_per_product`, `web_access_enabled`, `openai_api_key`.

## 4. Core Features & Flows
### Import
- Open Excel (.xlsx/.xls) via system dialog; flexible headers (item number, SKU, title, category, qty, price aliases).
- Rows persisted to `products` with session id; import progress emitted for UI.
- Preview table shows ingested products; “Reset session” clears working data.

### Title Generation
- Two modes:
  1) **Local** (offline): uses TitleEngine to sanitize, detect category/brand/models/variants, build 1–3 title variations within 71–79 chars, deduplicate vs original and per-product hashes.
  2) **AI-assisted** (when Web Access enabled): OpenAI extracts components first; falls back to local extraction on failure. Tracks AI success/fallback counts.
- Progress events keep UI responsive; history rows recorded for auditing.

### Review & Edit
- Editable table of generated titles with live length badge; per-row or “Save All” writes back via IPC. Duplicate/length validation enforced client-side.

### Export
- Saves Excel with columns: timestamp, sku, item_number, old_title, new_title, status; one row per product; language selectable.
- History entry recorded on export.

### History
- Aggregated view (last 500 actions) combining product, generated title, action, destination, filename, timestamps.

### Settings
- Language preference (de/en) affects UI strings; default generation language stored.
- Theme toggle (light/dark).
- Web Access toggle; OpenAI API key save/test; cost notice.

## 5. Title Engine (offline path)
- **Sanitization**: removes disallowed chars, trims, normalizes spaces, title-cases output; validation via `TitleSanitizer`.
- **Extraction**: CategoryDetector (toner/ink/drum), BrandExtractor, ModelExtractor (printer models), VariantExtractor (qty/color/capacity), CartridgeModels lookup (known prefixes & IDs).
- **Composition**: Templates enforce eBay.de ordering: `[Cartridge][Type] Kompatibel Für [Brand/Series/Printers] [Qty] [Color] [Capacity]`, tries variants (including reversed cartridge order).
- **Length control**: Smart truncation; padding with safe German filler words to reach 71–79 chars.
- **Deduplication**: Hashing with per-session salt; DuplicateChecker ensures unique variants and avoids originals.

## 6. Frontend UX & Visual System
- **Layout**: Left gradient sider (nav), top header with active section label, right controls (language switch, theme toggle).
- **Components**: AntD Cards for panels, Space/Tag/Alert for affordances, Tables with sticky scroll for datasets.
- **Typography & Color**: Space Grotesk font; light mode uses white cards + slate borders/shadows; dark mode swaps to deep navy backgrounds with elevated shadows.
- **Feedback**: Progress bars for import/generate/export; inline empty states; summary chips for generation rules; warnings for AI costs.
- **Responsive**: `grid-two` auto-fit cards; sider collapses below lg breakpoint.

## 7. Settings & Configuration
- Persistent in SQLite `app_settings` via IPC `data:updateSetting` / `data:getSettings`.
- Web Access (AI) off by default; requires user API key; tested via `openai:testConnection`.
- Session handling: each import assigns `current_session_id`; working tables cleared on app start to avoid stale mixes.

## 8. Build, Run, Test
- **Dev**: `npm run dev` (starts electron-vite + renderer at :5173); devtools auto-open; preload isolation enforced.
- **Build**: `npm run build`; platform-specific: `build:win|mac|linux` (electron-builder targets).
- **Tests**: `npm test` (Vitest unit), `npm run test:e2e` (Playwright). ESLint via `npm run lint`; formatting via `npm run format`.

## 9. Data & Security Notes
- DB stored under Electron userData; WAL mode for speed; foreign_keys on; history retained while working tables cleared each launch.
- API keys stored as plain text in settings table (consider encryption at rest); OpenAI calls gated by explicit toggle.
- No network access unless AI mode enabled by user.

## 10. Known Gaps / Future Enhancements
- JTL/Google Sheets import/export placeholders only (UI stub in Import tab, schema fields present).
- Language coverage beyond de/en not wired in renderer despite language table.
- No pagination/filters on history; no role-based access (single-user desktop assumption).
- OpenAI key not masked in DB; no rate-limit backoff beyond simple delay.

## 11. Quick Start (Happy Path)
1. Import Excel with columns: Item Number, SKU, Title (others optional).
2. Go to Generate → choose AI mode (toggle) if configured; click Generate.
3. Review tab → adjust titles; save per row or Save All.
4. Export tab → save Excel (`Generated_Titles.xlsx`).
5. (Optional) Settings → toggle Web Access, set API key, test connection.


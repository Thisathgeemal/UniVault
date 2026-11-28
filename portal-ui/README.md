# @univault/portal-ui

Shared, app-agnostic layout and building blocks for the UniVault web portals:

- **Issuer portal** uses it now.
- **Verifier portal** will use it in Sprint 3.

It is built like `@univault/crypto-core`: compiled with `tsc` to `dist/` (JS and `.d.ts`). The
portals depend on it through `file:../portal-ui`, and a `pre…` script builds it first (Decision
015).

## What is inside

| Export                                                      | Purpose                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell`                                                  | The "Navy and azure" frame: navy top bar on top, navy 240 px sidebar on the left (a toggled drawer below the `md` breakpoint), the content on `bg`. It also gives a skip link, a menu button with `aria-expanded`/`aria-controls`, Escape to close (focus returns to the button), and closes the drawer when a link is chosen                                                      |
| `Sidebar`, `visibleSidebarItems`, `isSidebarItemActive`     | Items with icon, label, active state (`aria-current="page"`; brand-hover fill, on-brand label, 3 px on-brand left bar), optional section label (on-brand-muted) and **role filtering** (`roles` per item, `currentRole`). Focus ring `focus-ring-on-brand`. The link component is pluggable, so it works with any router                                                           |
| `Header`, `RoleTag`                                         | The navy top bar: "UniVault" + the **role tag** pill (`roleTag: { label, icon }`, passed in: "Issuer portal" + certificate, "Verifier portal" + shield-check), organisation, user name with a role badge, a language-switcher slot and a logout button (on-brand controls)                                                                                                         |
| `PageHeader`                                                | The page's single `<h1>`, a description and actions                                                                                                                                                                                                                                                                                                                                |
| `EmptyState`, `ComingSoon`                                  | Empty lists and placeholder pages                                                                                                                                                                                                                                                                                                                                                  |
| `ErrorBoundary`, `ErrorFallback`                            | Render-error boundary and the fallback shown for errors (never a stack trace)                                                                                                                                                                                                                                                                                                      |
| `FullPageSpinner`                                           | Loading state (`role="status"`, `aria-live="polite"`)                                                                                                                                                                                                                                                                                                                              |
| `Button`, `Input`, `Label`, `Badge`, `Card…`, `Alert`, `cn` | shadcn/ui-style primitives (class-variance-authority and tailwind-merge), copied and trimmed by hand. `Button` kinds `primary` (azure, one per page), `secondary`, `text`, `destructive`, `onBrand` (min 40 px, radius-md); inputs radius-sm with a border-strong edge and 16 px text                                                                                              |
| `DataTable`, `Pagination`                                   | Table with sortable headings (`aria-sort`), row click and loading rows; previous / next paging with a live summary and a page-size choice. Sorting and paging stay with the parent (server-side lists)                                                                                                                                                                             |
| `SearchInput`                                               | Search box that reports the trimmed text after a pause (debounced, 300 ms), at once on Enter or clear; an outside value change replaces the text                                                                                                                                                                                                                                   |
| `FormField`, `ErrorSummary`, `Select`                       | Label + hint + control + error wired with `aria-invalid`, `aria-required`, `aria-describedby`; the problem list at the top of a form (takes focus, links to fields); a styled native select                                                                                                                                                                                        |
| `StatusBadge`, `STATUS_SET_CLASSES`, `Tooltip`              | A status as icon + word in one of the four status colour sets (`status`: valid, expired, revoked, pending; the icon passed in); a description shown on hover and focus and linked with `aria-describedby`                                                                                                                                                                          |
| `Stepper`, `CredentialCardPreview`                          | Numbered steps (`aria-current="step"`, the state in words for screen readers, completed steps selectable); a credential drawn like a wallet card with sections and items passed in (e.g. always shown vs holder chooses)                                                                                                                                                           |
| `QrCode`, `Countdown`, `FullscreenOverlay`                  | A QR code drawn as SVG in the browser (`qrcode` matrix, error correction M, 4-module quiet zone, whole pixels per module, alt text passed in, no inline styles); a mm:ss countdown (`role="timer"`, amber warning, a separate polite live text the caller changes when it should be read); a full-window dialog (focus on Close, Tab trap, Escape)                                 |
| `Dialog`, `ActionMenu`, `FilterTabs`, `CopyButton`          | A modal with content such as a form (`role="dialog"`, focus inside, Tab trap, Escape unless busy, focus returned); a button opening a list of actions (`aria-expanded`, Escape / outside click closes, a disabled item keeps its visible reason via `aria-describedby`); filter toggle buttons with counts (`aria-pressed`); copy-to-clipboard with a polite "Copied" announcement |
| `ToastProvider`, `useToast`, `ConfirmDialog`                | Short confirmations in a polite live region; a modal confirmation (`role="alertdialog"`, focus on the safe choice, Tab trap, Escape)                                                                                                                                                                                                                                               |
| `theme.css`                                                 | GENERATED from `src/tokens.ts`: every colour as a CSS variable with its design-system name (`--brand`, `--text-muted`) on `:root` and as a Tailwind utility with the same name (`bg-brand`, `text-text-muted`), plus fonts, the type scale (`text-display` … `text-caption`), radii and layout lengths. Never edit by hand                                                         |

**Design tokens (`src/tokens.ts`, exported as `@univault/portal-ui/tokens`):** the single
source of UniVault's "Navy and azure" values ([design-system.md](../docs/design/design-system.md),
Decision 024): light and dark colours with the design-system names, the usage tokens
`focusRingOnBrand` and `accentTextOnSoft`, the four status sets, component token sets, font
families, type scale, spacing and radii, as plain data (no imports, no DOM), so the React Native
wallet uses the same values. It is the only file with hex colours: `test/tokens.test.ts` fails on
a hex colour anywhere else in the apps' source. `npm run build` regenerates
`theme.css` from it (`src/theme-css.ts`, `scripts/generate-theme-css.mjs`) and
`test/tokens.test.ts` fails if the committed `theme.css` differs. To change a colour: edit
`src/tokens.ts`, run `npm run build`, commit both files. The wallet maps the import to the
source file `src/tokens.ts` itself (see `wallet/metro.config.js`), so keep that file
import-free plain TypeScript: Metro, Jest, Expo's config loader and Node load it unbuilt.

**Rules:**

- **No routes, API calls or text strings.** Every label (navigation, buttons, ARIA labels) is
  passed in already translated, so each portal keeps its own i18n.
- **No icon library dependency.** Icons are passed in as components.
- **React is a peer dependency.** The portal's Vite config dedupes `react`/`react-dom` because
  this package has its own copy for its tests.

## Using it in a portal

```css
/* src/index.css */
@import 'tailwindcss';
@import '@univault/portal-ui/theme.css';
@source '../../portal-ui/src'; /* Tailwind must scan the package's class names */
@source not '../../portal-ui/src/tokens.ts'; /* ...but not the token data (words like */
@source not '../../portal-ui/src/theme-css.ts'; /* "ring" would become utilities) */
```

```json
// package.json
"dependencies": { "@univault/portal-ui": "file:../portal-ui" },
"scripts": { "build:deps": "npm --prefix ../portal-ui run build", "predev": "npm run build:deps" }
```

**Fonts:** nothing is loaded from a CDN, because the portals' CSP allows `font-src 'self'`.
Self-host Noto Sans, Noto Sans Sinhala and JetBrains Mono in the portal (`@fontsource/noto-sans`,
`@fontsource/noto-sans-sinhala`, `@fontsource/jetbrains-mono`); the stacks are `--font-sans`
and `--font-mono`.

## Scripts

```
npm run build       # tsc -> dist/, then regenerates theme.css from src/tokens.ts
npm run typecheck
npm test            # Vitest + Testing Library (jsdom)
npm run test:coverage
```

Run the tests from PowerShell or cmd, not Git Bash (see CLAUDE.md, Sprint 1 Issue 6).

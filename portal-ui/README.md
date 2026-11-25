# @univault/portal-ui

Shared, app-agnostic layout and building blocks for the UniVault web portals:

- **Issuer portal** uses it now.
- **Verifier portal** will use it in Sprint 3.

It is built like `@univault/crypto-core`: compiled with `tsc` to `dist/` (JS and `.d.ts`). The
portals depend on it through `file:../portal-ui`, and a `pre…` script builds it first (Decision
015).

## What is inside

| Export                                                      | Purpose                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell`                                                  | Header on top, sidebar on the left (a toggled drawer below the `md` breakpoint) and the content. It also gives a skip link, a menu button with `aria-expanded`/`aria-controls`, Escape to close (focus returns to the button), and closes the drawer when a link is chosen |
| `Sidebar`, `visibleSidebarItems`, `isSidebarItemActive`     | Items with icon, label, active state (`aria-current="page"`) and **role filtering** (`roles` per item, `currentRole`). The link component is pluggable, so it works with any router                                                                                        |
| `Header`                                                    | Organisation name, user name with a role badge, a language-switcher slot and a logout button                                                                                                                                                                               |
| `PageHeader`                                                | The page's single `<h1>`, a description and actions                                                                                                                                                                                                                        |
| `EmptyState`, `ComingSoon`                                  | Empty lists and placeholder pages                                                                                                                                                                                                                                          |
| `ErrorBoundary`, `ErrorFallback`                            | Render-error boundary and the fallback shown for errors (never a stack trace)                                                                                                                                                                                              |
| `FullPageSpinner`                                           | Loading state (`role="status"`, `aria-live="polite"`)                                                                                                                                                                                                                      |
| `Button`, `Input`, `Label`, `Badge`, `Card…`, `Alert`, `cn` | shadcn/ui-style primitives (class-variance-authority and tailwind-merge), copied and trimmed by hand, only the ones in use                                                                                                                                                 |
| `theme.css`                                                 | Design tokens as Tailwind v4 theme variables: colours, typography (a Sinhala-capable font stack), layout spacing                                                                                                                                                           |

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
```

```json
// package.json
"dependencies": { "@univault/portal-ui": "file:../portal-ui" },
"scripts": { "build:deps": "npm --prefix ../portal-ui run build", "predev": "npm run build:deps" }
```

**Fonts:** nothing is loaded from a CDN, because the portals' CSP allows `font-src 'self'`.
Self-host Noto Sans Sinhala in the portal (e.g. `@fontsource/noto-sans-sinhala`). The token
stack falls back to the Sinhala fonts that ship with Windows (Nirmala UI, Iskoola Pota).

## Scripts

```
npm run build       # tsc -> dist/
npm run typecheck
npm test            # Vitest + Testing Library (jsdom)
npm run test:coverage
```

Run the tests from PowerShell or cmd, not Git Bash (see CLAUDE.md, Sprint 1 Issue 6).

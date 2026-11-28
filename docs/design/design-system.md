# UniVault design system

UniVault is a digital identity wallet for Sri Lanka, with three apps: the issuer portal, the verifier portal and the holder wallet. All three share one palette, called "Navy and azure", so a person who uses one of them recognises the others. The look should feel official, calm and secure, like a bank or a government service, because people trust UniVault most when it looks like it comes from a legitimate issuer.

## Principles

- **Trust first.** Navy carries the identity. Nothing on screen should look playful or promotional.
- **One clear next step.** Each screen has one primary action in azure. Users with lower digital literacy should always see where to tap.
- **Status is sacred.** Green, amber, red and slate mean valid, expired, revoked and pending, and nothing else.
- **Readable in two scripts.** Every screen has to work in English and Sinhala at the same sizes.

## The 60-30-10 rule

| Share | Role           | Tokens                                | What it covers                                                       |
| ----- | -------------- | ------------------------------------- | -------------------------------------------------------------------- |
| 60%   | Neutral ground | `bg`, `surface`, `surface-sunken`     | Page backgrounds, cards, tables, forms, the space around everything  |
| 30%   | Brand navy     | `brand`, `brand-soft`, `on-brand`     | Sidebar, top bar, wallet header, credential cards, headings          |
| 10%   | Azure accent   | `accent`, `accent-text`, `focus-ring` | The primary button, links, active nav item, selected tab, focus ring |

The status colours (`status-*`) sit outside the 60-30-10 split. They appear only where a status is being shown, so they never count towards the budget.

A quick test: blur your eyes at any screen. You should see mostly light grey and white, a solid navy frame, and one or two small spots of azure. If the azure reads as a large area, there is too much of it.

## How each app uses it

### Issuer portal and verifier portal (light theme only)

- **60%:** `bg` page, with `surface` cards and tables. Table header rows and read-only fields use `surface-sunken`.
- **30%:** a `brand` left sidebar (240px) and a `brand` top bar. Sidebar labels are `on-brand`, section labels are `on-brand-muted`, and a hovered row is `brand-hover`. Page titles are in `text` on `bg`, not navy, so the navy frame stays the only large block of navy.
- **10%:** one `accent` primary button per page ("Issue credential", "Create request"). Links in tables and text buttons use `accent-text`. The active sidebar item is not azure: it uses a `brand-hover` fill with an `on-brand` label and a 3px `on-brand` bar on its left edge, because azure on navy is only 3:1 contrast.
- **Role tag:** the top bar shows a pill tag next to the UniVault name: "Issuer portal" with a certificate icon, or "Verifier portal" with a shield-check icon. The pill is `role-tag-bg` with `on-brand` text and `radius-pill`. This is the only difference between the two portals. They do not get different colours (see "Why one palette").
- **Destructive actions:** "Revoke credential" is a solid `status-revoked` button with `on-status-revoked` text, and it always asks for confirmation.
- **Verification result (verifier portal):** a large result panel on `surface`. Use a `status-valid` icon with the heading "Verified" for a pass, and a `status-revoked` icon with "Not verified" for a failure or anomaly. Show the reason in `text` below, and the disclosed attributes in a plain table.

### Holder wallet (light and dark themes)

- **60%:** `bg` screens, a `surface` bottom tab bar with a `border` top edge, and `surface` list rows.
- **30%:** a `brand` header on every tab screen and every screen inside a tab (compact header with back arrow); full-screen flows (onboarding, setup, lock) are the exceptions. Credential cards in `brand` with `radius-lg`. On a card, the credential title is `on-brand`, and the issuer and expiry are `on-brand-muted`. The status badge sits on the card in its own `status-*-bg` badge (`radius-sm`).
- **10%:** the primary action on each screen ("Scan QR", "Accept credential", "Share"), and the active tab icon and label in the bottom bar.
- **Disclosure screen:** show the verifier's name and logo in a `brand-soft` panel at the top, the attribute checkboxes on `surface`, and one `accent` "Share" button at the bottom. Biometric or PIN confirmation follows.
- **Offline notice:** a `status-expired-bg` banner with `status-expired-text`, saying when the status was last checked ("Status last checked 2 hours ago").
- **Onboarding illustrations:** simple original flat drawings (no stock art, no logos, no gradients, no text inside) on a `brand-soft` panel with `radius-lg`, the same size on every step: `text` outlines on every shape (navy on brand-soft is only 1.08:1 in dark, so shapes are drawn by their outline), `surface` fills, small `brand` details with `on-brand` marks, `accent` arrows and ticks (`on-accent` inside accent circles), `text-muted` secondary lines; never a status colour. One `accent` button per step ("Next", last: "Set up security"); Back and Skip are secondary and text buttons. See "Onboarding visual pattern" below.

### Dark theme (wallet only)

The portals stay light, because they run on office desktops. The wallet follows the phone's system setting by default; its Appearance setting (wallet only) can fix it to light or dark instead ("Automatic", "Light", "Dark"). Use the `dark` value of every token. The same names work in both themes, so components don't change.

- In dark theme, `brand` (#16335C) is lighter than `bg` (#0A1628), so credential cards still stand out.
- In dark theme, `accent` becomes a lighter azure (#60A5FA) with a deep navy label (`on-accent`). This is the one place azure may sit on navy.

## Why one palette, with role tags

All three apps share the palette, and the two portals differ only by their role tag. Three reasons:

1. **Consistency (NFR-05).** People learn one set of colours and patterns. A user who meets the verifier portal after the wallet should know where to look.
2. **No colour clashes.** Giving the issuer a green or the verifier an orange would collide with the status colours. A green portal would make every page look "valid".
3. **The portals rarely meet.** An issuer staff member and a verifier staff member each work in one portal. The tag, the icon and the page title make it clear which one is open, and colour isn't needed for that.

## Status colours

| Status  | Icon colour      | Badge background    | Badge text            | Icon         |
| ------- | ---------------- | ------------------- | --------------------- | ------------ |
| Valid   | `status-valid`   | `status-valid-bg`   | `status-valid-text`   | circle-check |
| Expired | `status-expired` | `status-expired-bg` | `status-expired-text` | clock        |
| Revoked | `status-revoked` | `status-revoked-bg` | `status-revoked-text` | ban          |
| Pending | `status-pending` | `status-pending-bg` | `status-pending-text` | hourglass    |

Rules:

- Always show the icon and the word together ("Valid", "වලංගුයි"). Never rely on colour alone, so colour-blind users can still read the status.
- Never use a status colour for decoration, a chart series or a brand moment.
- Status colours (`status-valid`, `-expired`, `-revoked`, `-pending` and their `-bg` / `-text`) mean ONLY a credential's or a verification's status. A confirmation that an action worked ("PIN set", "Saved", "Accepted by the holder's wallet") is not a status: accent, `brand-soft` and `text-muted`. Allowed uses: the status badge, credential and verification results, the offline notice (expired colours for a stale status), an offer running out or expired, error and failure messages and destructive actions (revoked colours), the dashboard status breakdown, and Diagnostics pass / fail (development builds only). `wallet/test/status-colours.test.ts` and `portal-ui/test/tokens.test.ts` fail when any other file uses a status colour.
- Verification failures and anomalies use the revoked colours. Stale or offline status uses the expired colours.
- A status icon never sits directly on navy (`brand`, `brand-hover`): on a credential card or in the top bar it is always inside its own `status-*-bg` badge (`radius-sm`). Several status colours are below 3:1 on navy (revoked 2.38:1 and pending 2.03:1 on light `brand`), but every one passes inside its badge.

## Buttons

| Kind          | Fill                                | Label               | When                                                                         |
| ------------- | ----------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| Primary       | `accent` (hover `accent-hover`)     | `on-accent`         | The one main action on the screen                                            |
| Secondary     | `surface`, 1px `border-strong` edge | `text`              | Every other action                                                           |
| Text button   | none                                | `accent-text`       | Low-weight actions such as "View details"                                    |
| Destructive   | `status-revoked`                    | `on-status-revoked` | Revoke, deactivate device, delete                                            |
| On brand      | `role-tag-bg`                       | `on-brand`          | Actions inside the navy top bar or a credential card                         |
| Inverse       | `on-brand`                          | `brand`             | Primary on navy – only on full-navy screens such as the lock screen          |
| Text on brand | none                                | `on-brand`          | A secondary text button on a full-navy screen ("Use PIN" on the lock screen) |

Buttons use `radius-md` and a minimum height of 44px in the wallet (touch targets) and 40px in the portals. Labels are verb first and in sentence case: "Issue credential", not "Submit".

The focus ring (keyboard or switch access) is 2px, 2px outside the button's edge: `focus-ring`, or `focus-ring-on-brand` for the three navy kinds (On brand, Inverse, Text on brand). Contrast (28 Nov 2026): the inverse label `brand` on `on-brand` is 15.39:1 in light and 10.83:1 in dark, the inverse fill against the navy screen the same (3:1 needed for its edge), Text on brand (`on-brand` on `brand`) 15.39:1 / 10.83:1, `focus-ring-on-brand` on `brand` 15.39:1 / 10.83:1. An inverse button counts as the screen's one primary action.

## Typography

- **Family:** Noto Sans for English and Noto Sans Sinhala for Sinhala, both free on Google Fonts. They are designed to match, so a screen that mixes both scripts still looks even. In Expo, load them with `@expo-google-fonts/noto-sans` and `@expo-google-fonts/noto-sans-sinhala`.
- **Scale:** `display` 32, `h1` 24, `h2` 20, `h3` 16, `body` 16, `body-sm` 14, `label` 14, `caption` 12.
- **Line height:** generous on purpose (26px for 16px body). Sinhala letters have tall vowel signs above and below the line, which get clipped or crowded at tighter spacing.
- **Body size:** 16px in the wallet. The portals may use `body-sm` 14px inside dense tables, but forms stay at 16px.
- **Mono:** use `mono` only for DIDs, credential IDs and JWT snippets on developer or audit screens.

## Spacing and radius

Spacing runs on a 4px base: `space-1` 4, `space-2` 8, `space-3` 12, `space-4` 16, `space-6` 24, `space-8` 32. Radius: `radius-sm` 6 for inputs and badges, `radius-md` 10 for buttons and portal cards, `radius-lg` 16 for wallet credential cards, `radius-pill` for tags.

## Wallet typography and layout

Every wallet screen follows these rules (values from `portal-ui/src/tokens.ts`; the wallet's
`src/theme` constants and `wallet/test/design-system.test.tsx` check them on every route):

- **Type:** body 16 / 26 for what people read; secondary text (hints, subtitles, field names,
  trailing values) `body-sm` 14 in `text-muted`; `caption` 12 only for metadata (dates, versions,
  "Step 2 of 6", durations). Text-muted is never larger than 14. `mono` 13 only on developer
  screens.
- **Headings (final sizes, 28 Nov 2026):** only `h2` 20 and `h3` 16, weight 600 (Noto Sans
  Sinhala SemiBold in Sinhala). `h2`: the title in the header of a tab's root screen, screen
  titles, and every onboarding and setup hero heading (including "PIN set"). `h3`: the header
  title of a detail screen (a screen with Back), section headings, card titles, empty / error
  state titles and dialog titles. `display` 32 and `h1` 24 are not used for headings in the
  wallet (the PIN keypad's digits use the 24 size; they are not headings).
- **Top header:** a taller bar: `space-4` above and `space-3` below the title on root screens,
  `space-2` above and below on detail screens, plus the safe-area inset; the title starts at
  `space-4` like the screen content (after the Back button on detail screens), wraps at large
  text sizes, and keeps the status-bar rule (light content on the navy home header).
- **Alignment:** body text, lists and forms are left-aligned. Centre only: the hero heading of
  an onboarding or setup screen and the short supporting text under it on onboarding screens
  (at most 320 pt wide, so centred lines stay short), illustrations and the labels under them,
  and the PIN dots and keypad. Empty, error and loading states are left-aligned.
- **Spacing:** `space-4` at the sides (and top) of every phone screen, `space-6` between
  sections and at the bottom; a section's heading (`h3`) sits `space-2` above its content; inside
  a card `space-2` between lines and `space-3` between groups. List rows are at least 56 pt high.
  Text and forms stop at 560 pt wide and centre on tablets.
- **Buttons:** label 16, weight 600. On onboarding and setup screens the buttons are full width,
  stacked at the bottom in one `surface` footer (border top, `space-4` padding plus the safe-area
  inset), the primary first and Back or another secondary below it. One primary per screen.
- **PIN entry:** six dots (filled = entered, outlined = empty: shape, not only colour) and a
  0–9 pad in the phone layout with Delete, keys at least 56 pt, centred, at most 360 pt wide. The
  position left of 0 is empty space: no border, no fill, not focusable, not announced.

### Onboarding visual pattern

Every onboarding step has the same structure, so the six screens feel like one flow:

1. Skip (text button, top right; explanation steps only).
2. ONE illustration in a `brand-soft` area with `radius-lg`, the same height on every step
   (palette under "Holder wallet" above).
3. The hero heading, `h2`, centred; under it one or two short sentences, centred, at most 320 pt
   wide (the language step's note is 14 `text-muted`).
4. List-like content as rows, left-aligned: **numbered rows** for a sequence (a small `accent`
   circle with the `on-accent` number, a bold one-line title 16 / 600, one short `text-muted`
   sentence 14) or **icon rows** for points (the icon in a small `brand-soft` circle in
   `accent-text-on-soft`, one sentence in body text).
5. The footer: progress dots ("Step X of 6") and the full-width buttons.

The content fades in briefly (220 ms) only while the phone's reduce-motion setting is off.

### Processing state

When the holder waits for slow work they started, show an indeterminate spinner with what is
happening in plain words ("Securing your PIN…", "Checking your PIN…"; never "key" or "hash") as
one busy progress element announced to screen readers. Keep it up for at least 600 ms so it never
flickers, let the UI draw before the work starts, and move on only when the work has finished.

- **Inline** (`ProcessingState`): under the content it belongs to, the controls disabled.
- **Full screen** (`ProcessingState fullScreen`): a step of its own, a large spinner and the
  message centred, nothing else on the screen (so nothing can be typed): after the new PIN is
  confirmed ("Securing your PIN…"), while a PIN is checked ("Checking your PIN…", see "PIN
  checking pattern"; at least 400 ms there) and while fingerprint unlock is turned on in setup
  ("Turning on unlock with fingerprint…", the OS prompt on top). A failure never shows the success state: the
  PIN goes back to Create PIN with "Something went wrong. Please create your PIN again.", the
  fingerprint step back to its question with a short message.

### PIN checking pattern

Every time a PIN is entered to verify it (the lock screen's PIN path, the PIN prompt of every
approval: Test unlock, turning biometric unlock off, later shares) the same flow runs (wallet
`src/security/PinCheck.tsx`):

1. The title, the reason and the keypad. After a wrong PIN, a plain message ABOVE the keypad:
   "That PIN isn't right. Try again.", plus "2 attempts left before a short wait." (then "1
   attempt left…") when that few remain before the next lockout.
2. The 6th digit replaces the keypad and dots with the full-screen progress state "Checking your
   PIN…" (announced), at least 400 ms. Nothing else is on screen: no status text, no Cancel, and
   Back is ignored.
3. Correct: straight on to where the holder was going (the unlocked app, the action that asked):
   no success screen. Screen readers hear "PIN correct".
4. Wrong: back to step 1 with the digits cleared and a short shake (none with reduce motion); the
   message is announced.
5. The limit reached: straight from checking to the lockout countdown, no keypad, until it runs
   out.

Creating a PIN keeps its own "Securing your PIN…" step with the same progress component.

### Success state

After a setup step succeeds (`SuccessState`): a large circle-check in `accent` inside a 96 pt
`brand-soft` circle (dark theme: the dark values of the same tokens), the `h2` heading in `text`
("PIN set", "Unlock with fingerprint is on") and one line under it, centred as one group (at most
320 pt wide), Continue full width in the footer. A confirmation is not a status, so never a status
colour. The heading is announced to screen readers. The check mark scales in briefly (from 0.6,
250 ms); with reduce motion on it is simply there.

### Headers

Every tab screen (Credentials, Scan, History, Settings) has the `brand` navy header: the title in
`on-brand` (`h2`, the taller bar), any header actions as `on-brand` icons or text buttons (never
azure on navy), focus ring `focus-ring-on-brand`. Every screen inside a tab (credential detail,
history detail, every Settings screen, Diagnostics, UI kit) has the compact navy header: an
`on-brand` back arrow and the title (`h3`). So moving around the app never switches between navy
and white headers. Light status-bar icons on all of them in both themes. Implemented once, in the
tab stacks' shared options (`useStackScreenOptions('brand')`, one `Header`). The full-screen flows
keep their own layouts: onboarding, `/setup/*` and the lock screen; the only surface headers are
outside the tabs (onboarding's Privacy details, "not found").

### Lock screen pattern

The lock screen is ONE navy surface, the same `brand` as the privacy cover, so leaving the app
and coming back look seamless: the UniVault mark (shield + name), "UniVault is locked" in
`on-brand` and "Unlock to continue" in `on-brand-muted`, centred vertically as one group; the
lockout countdown under them in `on-brand`; the buttons at the bottom with `space-4` padding plus
the bottom safe-area inset, on the navy itself (no `surface` footer, no border): **Unlock** in
the Inverse kind, **Use PIN** as Text on brand. Light status-bar icons in both themes. In dark
mode the same names give the dark `brand` (#16335C) with the dark `on-brand`, still one surface.
This and the privacy cover are the only full-navy screens.

### Toast

Toasts appear at the top below the safe area, one at a time (inverted: `text` as the fill, `bg`
as the text). They dismiss themselves after 4 s, with the visible close (×) button, by swiping
left or right, or with the screen reader's "dismiss" action (screen-reader users cannot swipe).
The toast follows the finger horizontally; released past 35% of its width, or flicked faster than
800 pt/s in the drag's direction, it slides out; otherwise it springs back. The timer pauses while
the finger is on the toast and resumes with the time that was left. With reduce motion on it is
dismissed (or put back) without the slide or the spring. Never put credential data or error
details in a toast.

## Do and don't

| Do                                                                                            | Don't                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| One azure button per screen                                                                   | Two primary buttons side by side                                                        |
| Navy for the frame and the credential cards                                                   | Navy as a page background in the light theme (except the lock screen and privacy cover) |
| Icon and word for every status                                                                | A coloured dot alone                                                                    |
| White or soft tags inside the navy top bar; the Inverse kind as primary on a full-navy screen | Azure text or buttons on navy in the light theme (only 3:1 contrast)                    |
| `text-muted` for helper text                                                                  | `text-subtle` for anything the user must read to act                                    |
| `accent-text-on-soft` for links on `brand-soft` (selected rows, soft panels)                  | `accent-text` on `brand-soft` (4.35:1, below AA)                                        |
| `focus-ring-on-brand` for focus inside navy areas                                             | The azure `focus-ring` on navy (below 3:1)                                              |
| Success confirmations: an accent check in a `brand-soft` circle                               | Status green for "saved" or "done"                                                      |
| The navy header on every tab screen and every screen inside a tab                             | A white header on one tab screen and a navy one on the next                             |
| Flat colours                                                                                  | Gradients, glows or a blue-to-purple fade                                               |

## Accessibility

Every text pairing in this system meets WCAG AA (4.5:1) in both themes. Input borders and the focus ring meet 3:1. If a new pairing is added, check it before using it. Body text on `bg` is 16.6:1 in light and 15.5:1 in dark.

The wallet's contrast test (`wallet/test/contrast.test.ts`, pair list in `wallet/src/theme/contrast.ts`) checks every pairing below in both themes: text, text-muted, text-subtle, links and the focus ring on `bg`, `surface` and `surface-sunken`; text on `brand-soft`; on-brand text on `brand`, `brand-hover` and the role tag; the primary, destructive and on-brand button labels; every status badge text and icon (in its badge and on `surface` / `bg`); input borders; the offline notice and the disclosure panel.

### Contrast fixes (27 Nov 2026)

The first version of the palette had light-theme pairings below AA. Three fixes, measured with the WCAG 2.2 formula:

| Fix                                                                                                                                                                                                | Pairing                                                         | Before                 | After   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------- | ------- |
| 1. `focus-ring-on-brand` (= `on-brand`): the focus ring colour inside navy areas (sidebar, top bar, credential cards, any `brand` or `brand-hover` background). Everywhere else `focus-ring` stays | focus ring on `brand`                                           | 2.98:1 (azure)         | 15.39:1 |
|                                                                                                                                                                                                    | focus ring on `brand-hover` (focused active sidebar item)       | 2.23:1 (azure)         | 11.51:1 |
| 2. `text-subtle` darkened from `#64748B` to `#5B6B80` (light theme only; dark unchanged)                                                                                                           | `text-subtle` on `bg`                                           | 4.43:1                 | 5.07:1  |
|                                                                                                                                                                                                    | `text-subtle` on `surface-sunken` (placeholders in input fills) | 4.23:1                 | 4.84:1  |
|                                                                                                                                                                                                    | `text-subtle` on `brand-soft` (timestamps in a selected row)    | 4.01:1                 | 4.58:1  |
|                                                                                                                                                                                                    | `text-subtle` on `surface`                                      | 4.76:1                 | 5.44:1  |
| 3. `accent-text-on-soft` (= `accent-hover`, `#1D4ED8` in light): links on `brand-soft` (selected table rows and any brand-soft panel)                                                              | link on `brand-soft`                                            | 4.35:1 (`accent-text`) | 5.64:1  |

`text-subtle` stays visibly lighter than `text-muted` (light: 5.07:1 against 7.06:1 on `bg`). The two usage tokens are defined as other tokens in `portal-ui/src/tokens.ts`, so components never pick these colours ad hoc.

**Dark theme, one restriction:** `text-subtle` on `brand-soft` is 4.04:1 in dark. The portals (light only) may use it in selected table rows; in the wallet, text on a `brand-soft` panel (the disclosure panel, info banners) uses `text-muted` (5.77:1) instead. Every other pairing passes in both themes. Lowest pairs after the fixes (83 pairs checked in light, 82 in dark since the onboarding pairs were added on 28 Nov 2026): text 4.58:1 light (`text-subtle` on `brand-soft`) and 4.90:1 dark (`text-subtle` on `surface`); borders, icons and focus 3.08:1 light (`border-strong` on `surface-sunken`) and 3.24:1 dark (`border-strong` on `surface`).

## Using the tokens in code

Use the token names as CSS variables in the portals (`var(--brand)`, `var(--accent)`) and as keys of one shared theme object in the Expo wallet, with a `light` and a `dark` set. Keep that theme in one package that all three apps import, so a colour is only ever changed in one place. Never write a hex value directly in a component.

**Where the values live:** every value (colours light and dark, the usage tokens, type scale and line heights, font families, spacing, radius) is in **`portal-ui/src/tokens.ts`**, the single source of truth. The portals get it as `portal-ui/theme.css` (generated by `npm run build` in portal-ui; CSS variables such as `var(--brand)` and Tailwind utilities with the same names, such as `bg-brand` and `text-text-muted`); the wallet imports it as `@univault/portal-ui/tokens` (camelCase keys: `surface-sunken` is `surfaceSunken`). This document holds the rules, not the values. A test fails on any hex colour outside `tokens.ts` and the generated `theme.css`.

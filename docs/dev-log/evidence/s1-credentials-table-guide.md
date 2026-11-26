# Evidence guide: credentials table, revoke and reissue (S2, Sprint 1 carry-over)

What to open and click for each screenshot of the credentials table, the credential page and the
revoke / reissue flows ([docs/frontend/issuer-portal.md](../../frontend/issuer-portal.md) §12,
[docs/api/credentials-api.md](../../api/credentials-api.md) §3 and §6, Decision 012). Save each
one in this folder under the file name given.

## Before you start

1. **Demo data** (development database only). In PowerShell, with the backend **stopped**:

   ```powershell
   cd backend
   npm run db:seed          # if not done yet
   npm run keys:init        # if not done yet
   npm run db:seed:demo     # Serendib Trading: credentials of every status (skips if present)
   ```

   `db:seed:demo` gives the first free Serendib Trading employees (by reference) an **active**
   credential each: `STC-00001`, `STC-00003`, `STC-00005`, `STC-00007`. The rest of the demo set
   covers expiring-soon, replaced, expired, revoked and pending credentials. To start again:
   `npm run db:seed:demo -- --reset`, then `npm run db:seed:demo`.

2. **Change one holder record for the reissue difference.** There is no holder edit page yet
   (backlog), so use the development-only command. It refuses production, changes one existing
   text claim, re-validates the record against its schema, and prints the claim **name** only:

   ```powershell
   npm run db:holder:set -- STC-00003 designation "Senior HR Executive"
   ```

   Run it while the backend is **stopped**: the embedded PGlite database allows one process at a
   time. Malith Wijesinghe (`STC-00003`) was "HR Executive" when the demo credential was
   created, so the reissue preview will highlight **Designation**. To undo it later:
   `npm run db:holder:set -- STC-00003 designation "HR Executive"`.

3. Two PowerShell terminals:
   - `cd backend; npm run dev`: API on http://localhost:4000;
   - `cd issuer-portal; npm run dev`: portal on http://localhost:5173.

4. Sign in as the **admin** `admin@serendib-trading.example`, and later as the **officer**
   `officer@serendib-trading.example` (the development seed password that `npm run db:seed`
   prints). Use a **private window** for the officer, so both sessions stay open.

5. Use Chrome or Edge, a normal window of about 1280 × 800, zoom 100%.

## Screenshots

| #   | File name                                               | What to do                                                                                                                                     | What must be visible                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `s1-2026-11-26-credentials-table.png`                   | Admin: **Credentials** in the sidebar                                                                                                          | "Issue credential" in the header; the tabs with counts (All, Active, Awaiting wallet, Expired, Revoked, Replaced); columns ID (8 characters + copy icon), Holder (name + reference), Type, Status, Issued, Expires, Actions                                                               |
| 2   | `s1-2026-11-26-credentials-expiring-soon.png`           | Dashboard → **Expiring in 30 days**                                                                                                            | URL `/credentials?effectiveStatus=valid&sort=expires`; the Active tab selected; the first rows show "Expires in n days"                                                                                                                                                                   |
| 3   | `s1-2026-11-26-credentials-dashboard-tab.png`           | Dashboard → **Expired**                                                                                                                        | URL `/credentials?effectiveStatus=expired`; the Expired tab selected; its count equals the dashboard card                                                                                                                                                                                 |
| 4   | `s1-2026-11-26-credentials-search-url.png`              | All tab, type `STC-0000` in the search box, click the **Holder** header                                                                        | URL with `q=STC-0000&sort=holder`; matching rows only, sorted by name; the tab counts follow the search                                                                                                                                                                                   |
| 5   | `s1-2026-11-26-credentials-no-id-numbers.png`           | F12 → **Network**, reload, select the `credentials?…` request → **Response**                                                                   | Each row has `holder { id, externalRef, fullName }`, `hasActiveOffer`, and `counts`; **no** `claims`, NIC or passport numbers                                                                                                                                                             |
| 6   | `s1-2026-11-26-credentials-empty-tab.png`               | Search `zzz`                                                                                                                                   | "No credentials match "zzz"" with **Clear search**                                                                                                                                                                                                                                        |
| 7   | `s1-2026-11-26-credentials-officer-revoke-disabled.png` | Officer window: **Credentials** → Active tab → **Actions** on `STC-00005`                                                                      | **Reissue** enabled, **Revoke** greyed with "Only administrators can revoke credentials"                                                                                                                                                                                                  |
| 8   | `s1-2026-11-26-credentials-revoke-dialog.png`           | Admin: Active tab → **Actions** on `STC-00005` (Hafsa Mohamed) → **Revoke**, choose **Other**, click the red button                            | "Revoke credential", reason list in plain words, "Enter a note when the reason is "Other"." under Note, the warning "This cannot be undone…", the button "Revoke Hafsa Mohamed's credential"                                                                                              |
| 9   | `s1-2026-11-26-credentials-revoked-badge.png`           | Choose **Employment ended** instead (or type a note) and confirm                                                                               | Toast "Hafsa Mohamed's credential was revoked."; the Revoked count +1 and the Active count −1 on the tabs; in the Revoked tab the row has the **Revoked** badge                                                                                                                           |
| 10  | `s1-2026-11-26-credentials-dashboard-after-revoke.png`  | **Dashboard**                                                                                                                                  | Revoked +1 and Active −1 compared with before the revoke (take shot 1's counts first if you want a before/after pair)                                                                                                                                                                     |
| 11  | `s1-2026-11-26-credentials-pending-revoke.png`          | Awaiting wallet tab → **Actions** → **Revoke** on a pending credential (do not confirm; Cancel afterwards)                                     | The extra warning "The wallet offer will stop working."                                                                                                                                                                                                                                   |
| 12  | `s1-2026-11-26-reissue-preview-diff.png`                | Officer: Active tab → **Actions** on `STC-00003` (Malith Wijesinghe) → **Reissue**, reason **The holder's details changed**                    | "Current and replacement", "1 changed", the **Designation** row highlighted with "Changed": HR Executive → Senior HR Executive; the expiry row and "Expiry moves from … to …"                                                                                                             |
| 13  | `s1-2026-11-26-reissue-no-changes.png`                  | Open **Reissue** on `STC-00007`, reason **The holder's wallet was lost or compromised** (then leave the page)                                  | "No details changed. You can still reissue…", no highlighted row                                                                                                                                                                                                                          |
| 14  | `s1-2026-11-26-reissue-to-offer.png`                    | Back on `STC-00003`'s reissue page: tick the confirmation and click **Reissue credential**                                                     | Toast "Replacement created…"; URL `/credentials/<new id>/offer`; the wallet offer for the replacement (cancel the offer afterwards)                                                                                                                                                       |
| 15  | `s1-2026-11-26-credential-replaced-timeline.png`        | Credentials → Replaced tab → open `STC-00003`'s old credential (the ID link)                                                                   | Badge **Replaced**; "Replaced by" with the new id as a link; Status history: "Created – awaiting the wallet", "Accepted by the holder's wallet", "Replaced by a reissued credential · by <officer>" with "Reason: The holder's details changed" and Asia/Colombo times; no action buttons |
| 16  | `s1-2026-11-26-credential-replaces-link.png`            | Click the **Replaced by** link                                                                                                                 | The replacement: Awaiting wallet, "Replaces" with the old id, the wallet offer card                                                                                                                                                                                                       |
| 17  | `s1-2026-11-26-credential-renew-expired.png`            | Expired tab → **Actions** → **Renew**                                                                                                          | Title "Renew credential"; after choosing **Extend the validity**: the preview with the new expiry (do not confirm unless you want to renew it)                                                                                                                                            |
| 18  | `s1-2026-11-26-credentials-409-conflict.png`            | Admin and officer windows on the same Active credential page: admin revokes it; officer then clicks **Reissue**, chooses a reason and confirms | "Another staff member already revoked this credential. The page has been refreshed." (or the preview shows it at once)                                                                                                                                                                    |
| 19  | `s1-2026-11-26-credentials-sinhala.png`                 | Credentials page, choose **සිංහල** in the header                                                                                                | Title, tabs, column headings and badges in Sinhala                                                                                                                                                                                                                                        |
| 20  | `s1-2026-11-26-credentials-not-found.png`               | Open `/credentials/00000000-0000-4000-8000-000000000000`                                                                                       | "Credential not found" with a link back to Credentials                                                                                                                                                                                                                                    |
| 21  | `s1-2026-11-26-credentials-portal-tests.png`            | PowerShell: `cd issuer-portal; npm run test:coverage`                                                                                          | `Tests 392 passed (392)` and the coverage table                                                                                                                                                                                                                                           |
| 22  | `s1-2026-11-26-credentials-backend-tests.png`           | PowerShell: `cd backend; npm run test:coverage`                                                                                                | All backend tests passed and the coverage table above the thresholds                                                                                                                                                                                                                      |
| 23  | `s1-2026-11-26-credentials-e2e-pass.png`                | PowerShell: `cd issuer-portal; npm run test:e2e`                                                                                               | `ok … e2e\credentials.spec.ts … admin revokes…`, `ok … officer sees Revoke disabled, reissues…` and `10 passed`                                                                                                                                                                           |

**Afterwards** (backend stopped): put STC-00003's designation back with the command in step 2,
then `npm run db:seed:demo -- --reset` and `npm run db:seed:demo`. The reset removes the demo
credentials and everything chained to them, including the replacement the officer created in
shot 14 (with its offer and history) and the admin's revoke in shot 9. It prints "removed 15 demo
credentials and n replacement(s) made from them". Credentials that staff created for other holders
are not touched.

# Evidence guide: holder management in the issuer portal (S2)

What to run, open and click for each screenshot of holder management
([docs/frontend/issuer-portal.md](../../frontend/issuer-portal.md) §9,
[docs/api/holders-api.md](../../api/holders-api.md), Decision 018). Save each one in this folder
under the file name given (`s1-2026-11-26-holders-<what>.png` would also follow the naming rule
in CLAUDE.md; the short names below match the other guides).

## Before you start

1. **Check `backend/.env`:** `JWT_EXPIRES_IN_SECONDS` at least 300 (3600 as in `.env.example`)
   and `ISSUER_KEY_PASSPHRASE` set.
2. PowerShell, in `backend/`:
   ```
   npm run db:seed
   npm run keys:init        # skip if the issuers already have keys
   npm run db:seed:demo     # credentials for some Serendib Trading holders (screenshot 14)
   npm run dev              # API on http://localhost:4000
   ```
3. Second PowerShell, in `issuer-portal/`: `npm run dev` (portal on http://localhost:5173).
4. **Seed logins** (synthetic, **development only**; password = the development seed password
   that `npm run db:seed` prints). Never show the password or a token in a screenshot.

   | Login                              | Organisation                        | Issuer type  | Form shown                   |
   | ---------------------------------- | ----------------------------------- | ------------ | ---------------------------- |
   | `admin@serendib-trading.example`   | Serendib Trading Company (Demo)     | **employer** | Employee (Employment fields) |
   | `officer@serendib-trading.example` | Serendib Trading Company (Demo)     | **employer** | Employee                     |
   | `admin@lanka-agro-tools.example`   | Lanka Agro Tools Enterprises (Demo) | **employer** | Employee                     |
   | `officer@lanka-agro-tools.example` | Lanka Agro Tools Enterprises (Demo) | **employer** | Employee                     |
   | `admin@bank-a.example`             | UniVault Demo Bank                  | **bank**     | Customer (KYC fields)        |
   | `officer@bank-a.example`           | UniVault Demo Bank                  | **bank**     | Customer                     |

5. Chrome or Edge, about 1440 × 900, zoom 100%. Keep the address bar visible where the URL
   matters (list state).

## Screenshots

| #   | File name                           | What to do                                                                                                       | What must be visible                                                                                                                  |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `s1-holders-list.png`               | Sign in as `admin@serendib-trading.example`, click **Holders**                                                   | Table (Name, Employee ID, ID number, Date added, Credentials), ID numbers as `•••• 1234`, **Register holder** button, paging summary  |
| 2   | `s1-holders-search.png`             | Type `silva` in the search box and wait a moment                                                                 | Only matching rows; the address bar shows `/holders?q=silva`                                                                          |
| 3   | `s1-holders-sort-page.png`          | Clear the search, click the **Name** heading, then **Next**                                                      | Rows sorted by name, the Name heading's arrow, `…?page=2&sort=name` in the address bar, "21–… of …"                                   |
| 4   | `s1-holders-no-match.png`           | Search `zzzz`                                                                                                    | "No holders match “zzzz”" and **Clear search**                                                                                        |
| 5   | `s1-holders-employee-form.png`      | **Register holder**                                                                                              | "Register employee", the groups (Personal, Employment, Contact), required `*`, the Employee ID hint ("also the holder's reference")   |
| 6   | `s1-holders-form-errors.png`        | Click **Register holder** with the form empty                                                                    | "There is a problem" summary at the top (focused) with links, red messages under each required field                                  |
| 7   | `s1-holders-blur-error.png`         | Reload, type `12345` in **NIC number**, press Tab                                                                | Only that field marked: "Enter 9 digits followed by V or X, or 12 digits."                                                            |
| 8   | `s1-holders-unsaved-prompt.png`     | Type a name, then click **Dashboard** in the menu                                                                | "Leave without saving?" dialog with **Stay on this page** and **Leave page** (choose Stay)                                            |
| 9   | `s1-holders-duplicate-409.png`      | Fill the form validly with Employee ID `STC-00001` (a seeded employee) and submit                                | "A holder with this reference is already registered." with **Open the existing record**                                               |
| 10  | `s1-holders-created-toast.png`      | Change the Employee ID to `STC-90001`, submit                                                                    | The new holder's page and the toast "… was registered."                                                                               |
| 11  | `s1-holders-customer-nic.png`       | Sign out; sign in as `admin@bank-a.example`; **Holders → Register holder**                                       | "Register customer": Customer number, Identity document with **NIC** and no expiry field, Permanent address, the residential checkbox |
| 12  | `s1-holders-customer-passport.png`  | Choose **Passport**; type `199012345678` in ID document number, press Tab; tick the residential-address checkbox | Expiry date field now required, the passport hint and error ("one capital letter followed by 7 digits"), residential fields and proof |
| 13  | `s1-holders-pobox.png`              | In Permanent address, Address line 1 = `P.O. Box 45`, press Tab                                                  | "Enter a street address. P.O. Box addresses are not accepted."                                                                        |
| 14  | `s1-holders-detail-customer.png`    | Complete the customer (passport `N1234567`, expiry in the future, a 5-digit postal code) and submit              | Detail page: grouped fields, **full** ID number, "Over 18: Yes" with "Calculated by the server", Added by, "No credentials … yet"     |
| 15  | `s1-holders-detail-credentials.png` | Sign in as `admin@serendib-trading.example`, open a holder that has demo credentials (Credentials column > 0)    | Credential counts by status (badges) and the list with status badges; **Issue credential** greyed, with its tooltip on hover          |
| 16  | `s1-holders-not-found.png`          | Copy that holder's URL, sign in as `admin@bank-a.example`, paste it                                              | "Holder not found" (another issuer's holder looks like an unknown one)                                                                |
| 17  | `s1-holders-sinhala.png`            | On the customer form, switch the language to **සිංහල**                                                            | Labels, groups, options and the submit button in Sinhala                                                                              |
| 18  | `s1-holders-portal-tests.png`       | In `issuer-portal/`: `npm run test:coverage`                                                                     | 267 tests passed, coverage above 96 / 91 / 97 / 98                                                                                    |
| 19  | `s1-holders-agreement-test.png`     | In `issuer-portal/`: `npx vitest run test/holders-validation.test.ts`                                            | All passing: seed records valid on both sides, 28 invalid samples with identical issues (Decision 018)                                |
| 20  | `s1-holders-e2e-pass.png`           | In `issuer-portal/`: `npm run test:e2e`                                                                          | 4 passed (3 holder tests and the sign-in test)                                                                                        |
| 21  | `s1-holders-backend-tests.png`      | In `backend/`: `npm run test:coverage`                                                                           | 505 tests passed, coverage above 90 / 86 / 93 / 90                                                                                    |

Run the test commands from PowerShell, not Git Bash (CLAUDE.md, Sprint 1 Issue 6).

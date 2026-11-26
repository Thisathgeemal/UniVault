# Evidence guide: Employment and KYC credential issuance (S2)

What to run, open and click for each screenshot of credential issuance
([docs/frontend/issuer-portal.md](../../frontend/issuer-portal.md) §10,
[docs/api/credentials-api.md](../../api/credentials-api.md) (preview),
[docs/api/credential-schemas-api.md](../../api/credential-schemas-api.md), Decision 019). Save
each one in this folder under the file name given.

## Before you start

1. **Check `backend/.env`:** `JWT_EXPIRES_IN_SECONDS` at least 300 and `ISSUER_KEY_PASSPHRASE`
   set.
2. PowerShell, in `backend/`:
   ```
   npm run db:seed
   npm run keys:init        # skip if the issuers already have keys
   npm run db:seed:demo     # dashboard demo data (gives some employees credentials already)
   npm run dev              # API on http://localhost:4000
   ```
3. Second PowerShell, in `issuer-portal/`: `npm run dev` (portal on http://localhost:5173).
4. **Seed logins** (synthetic, development only; the development seed password `db:seed`
   prints): `admin@serendib-trading.example` (**employer**) and `admin@bank-a.example`
   (**bank**, "UniVault Demo Bank"). Never show the password or a token.
5. **Seed holders to use** (none has an active credential after `db:seed` and `db:seed:demo`):

   | Purpose                     | Reference      | Name                        | Why                                                                             |
   | --------------------------- | -------------- | --------------------------- | ------------------------------------------------------------------------------- |
   | Employee to issue to        | `STC-00047`    | Shafna Ayesha Marikar       | Serendib Trading employee outside the 14 the demo data uses                     |
   | Bank customer to issue to   | `KYC-REC-0002` | Keerthana Janani Navaratnam | Adult, NIC, with a different residential address (shows the address grouping)   |
   | **Cap: 18th birthday**      | `KYC-REC-0012` | Nuwan Herath                | Born 2009-10-12: under 18, so the 2-year KYC credential ends on **12 Oct 2027** |
   | **Cap: ID document expiry** | `KYC-REC-0033` | Pasindu Wickramaratne       | **Driving licence** expiring 2027-11-22, before the 2-year default              |

   The seed data has **no** customer with a soon-expiring **passport**. The driving-licence
   customer shows the same rule ("Limited to the driving licence's expiry date"). For the
   passport wording, register a customer with a passport expiring within two years (holder
   registration form) and use it instead.

6. Chrome or Edge, about 1440 × 900, zoom 100%; keep the address bar visible for 6 and 13.

## Screenshots

| #   | File name                            | What to do                                                                           | What must be visible                                                                                                                                       |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `s1-issuance-picker.png`             | As the employer admin, click **Credentials** in the menu, type `STC-00047`           | "Issue a credential" card with the matching holder (reference, masked ID number)                                                                           |
| 2   | `s1-issuance-step1-employment.png`   | Click the holder                                                                     | Stepper on step 1; holder card (name, reference, `•••• …`); **Employment credential** pre-selected; "Your organisation issues Employment credentials."     |
| 3   | `s1-issuance-step2-details.png`      | **Next**                                                                             | Grouped read-only details (no inputs), "Wrong details? Update the holder record", Validity: expires on, default expiry, the **Valid until** field          |
| 4   | `s1-issuance-valid-until.png`        | Choose a Valid until date about 3 months ahead, wait a moment                        | "Expires on" changed to that date and "Ends on the date you chose."                                                                                        |
| 5   | `s1-issuance-step3-card.png`         | **Next**                                                                             | The wallet card: "Always shown to verifiers" (issuer, type, issued on, expires on, "Assigned on issue") and "Holder chooses what to share" with badges     |
| 6   | `s1-issuance-tooltip.png`            | Hover (or Tab to) the info icon next to a "Selectively disclosable" badge            | The tooltip explaining selective disclosure in plain words                                                                                                 |
| 7   | `s1-issuance-step4-confirm.png`      | **Next**, then click **Issue credential** without ticking the box                    | The summary line and "Tick the box to confirm that the details were checked."                                                                              |
| 8   | `s1-issuance-success.png`            | Tick the box, **Issue credential**                                                   | "Credential created", **Awaiting wallet** badge, credential id, type, expiry, holder, "Wallet offer (QR code) – next step", Back to holder / Issue another |
| 9   | `s1-issuance-dashboard-plus-one.png` | Open the **Dashboard** (note its "Awaiting wallet" number before screenshot 1)       | "Awaiting wallet" one higher than before                                                                                                                   |
| 10  | `s1-issuance-active-exists.png`      | **Back to holder** → **Issue credential** again                                      | "This holder already has an active or pending credential…", "Revoke or reissue it first.", **Open the existing credential**; **Next** disabled             |
| 11  | `s1-issuance-kyc-card.png`           | Sign in as `admin@bank-a.example`; **Credentials**, `KYC-REC-0002`; go to step 3     | KYC card: "Over 18: Yes" with "Calculated by UniVault", badges, permanent and residential addresses                                                        |
| 12  | `s1-issuance-cap-18th-birthday.png`  | Start again for `KYC-REC-0012` (Nuwan Herath), step 2                                | Expires on 12 Oct 2027 and "Limited to the holder's 18th birthday…"; in step 3 "Over 18: No"                                                               |
| 13  | `s1-issuance-cap-document.png`       | Start again for `KYC-REC-0033` (Pasindu Wickramaratne), step 2                       | Expires on 22 Nov 2027 and "Limited to the driving licence's expiry date."; Valid until `max` = 2027-11-22                                                 |
| 14  | `s1-issuance-sinhala.png`            | On the step 3 card, switch the language to **සිංහල**                                  | Steps, section titles, badges and "UniVault විසින් ගණනය කරයි" in Sinhala                                                                                       |
| 15  | `s1-issuance-preview-api.png`        | DevTools → Network: the `preview` request of step 2 (Response and Headers)           | The response shape (`alwaysVisible` with `jti: null`, `disclosable`, `derived`, `expiry.cappedBy`) and `Cache-Control: no-store`. Crop out the token       |
| 16  | `s1-issuance-tests.png`              | In `backend/`: `npm run test:coverage`; in `issuer-portal/`: `npm run test:coverage` | 522 and 299 tests passed, coverage above the thresholds                                                                                                    |
| 17  | `s1-issuance-e2e-pass.png`           | In `issuer-portal/`: `npm run test:e2e`                                              | 6 passed (2 issuance tests among them)                                                                                                                     |

Run the test commands from PowerShell, not Git Bash (CLAUDE.md, Sprint 1 Issue 6).

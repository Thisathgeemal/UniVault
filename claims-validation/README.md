# @univault/claims-validation

The **one** place that decides how holder claims are checked against the credential JSON
Schemas in [`docs/schemas`](../docs/schemas/credential-schemas.md) (Decision 018):

- the Ajv configuration (Draft 2020-12, `allErrors`, `strict`, ajv-formats, the custom
  `x-univault` keyword);
- the error mapping: each Ajv error becomes `{ path, code, message }` (the backend's friendly
  English messages plus a stable `code` the issuer portal translates);
- the holder reference rule (`checkExternalRef`, `CUSTOMER_REF_PATTERN`).

It is built like `@univault/portal-ui` and `@univault/crypto-core`: compiled with `tsc` to
`dist/`, linked through `file:../claims-validation`, and built by the `build:deps` scripts of
the backend and the issuer portal.

## Who uses it

| Consumer      | How                                                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend       | `services/credential-schemas.ts` reads the schema files at start-up and compiles them with `createClaimsAjv()`; `POST /holders` and issuance validate with it                                                                                 |
| Issuer portal | `claims-validators-plugin.ts` (Vite) compiles the **same files** at build time into standalone validator code (`standaloneValidatorsModule()`), because the production CSP forbids `eval` / `new Function`; the holder form validates with it |

## Entries

| Import                                | Runs in        | Contents                                                                                                                   |
| ------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@univault/claims-validation`         | browser + Node | Types, `SCHEMA_FILES`, `AJV_OPTIONS`, `toClaimIssues()`, `checkExternalRef()`, `CUSTOMER_REF_PATTERN` (no runtime imports) |
| `@univault/claims-validation/node`    | Node           | `readCredentialSchemas(dir)`, `createClaimsAjv()`, `standaloneValidatorsModule(schemas)`                                   |
| `@univault/claims-validation/runtime` | browser + Node | The helpers the generated code imports: ajv-formats' format functions, Ajv's Unicode string length                         |

## Rule

**Never duplicate a schema rule** in the UI or the backend. Change the schema file; both sides
follow. `issuer-portal/test/holders-validation.test.ts` runs the backend's seed data and
invalid samples through the portal and the backend validators and expects identical issues;
`test/claims-validation.test.ts` here compares the standalone code with runtime compilation.

## Scripts

```
npm run build          # tsc → dist/
npm test               # builds, then Vitest (20 tests)
npm run test:coverage  # thresholds 98 / 89 / 100 / 98
npm run typecheck
```

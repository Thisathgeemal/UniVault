# Development Setup

How to get a UniVault development environment running and which shared tooling the repository
uses. Each package has its own README with app-specific steps:
[crypto-core](../crypto-core/README.md), [backend](../backend/README.md),
[portal-ui](../portal-ui/README.md), [issuer-portal](../issuer-portal/README.md) and the
mobile [wallet](../wallet/README.md) (Expo). The verifier portal and AI service are scaffolded
in later sprints.

## Prerequisites

| Tool               | Version        | Used for                                                                                                         |
| ------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Node.js            | 22.22 or newer | Backend, crypto core, portals, wallet, tooling (the portals' React Router 8 needs 22.22+; the repo uses Node 26) |
| npm                | 10 or newer    | Package management (ships with Node.js)                                                                          |
| Git                | Any recent     | Version control                                                                                                  |
| Python             | 3.10 or newer  | AI anomaly detection service                                                                                     |
| Expo Go            | Latest (phone) | Running the wallet on a physical device; must support Expo SDK 58 (Expo Go runs only the current SDK)            |
| VS Code (optional) | Latest         | Install the ESLint, Prettier and EditorConfig extensions                                                         |

For wallet testing on a phone, the phone and the laptop must be on the same Wi-Fi network
(Windows network profile **Private**), and Windows Firewall must allow inbound TCP **4000**
(backend) and **8081** (Metro); see [wallet/README.md](../wallet/README.md). On networks that
block device-to-device traffic, use `npm run start:tunnel` in `wallet/` (ngrok).

## Ports

| Service         | Port | URL                     |
| --------------- | ---- | ----------------------- |
| Backend API     | 4000 | <http://localhost:4000> |
| Issuer portal   | 5173 | <http://localhost:5173> |
| Verifier portal | 5174 | <http://localhost:5174> |
| AI service      | 5001 | <http://localhost:5001> |
| Expo dev server | 8081 | <http://localhost:8081> |

## First-time setup

1. Clone the repository and install the shared tooling from the repository root:

   ```bash
   npm install
   ```

2. Create a local `.env` file for each component from its template:

   | Template                       | Copy to                                                             |
   | ------------------------------ | ------------------------------------------------------------------- |
   | `backend/.env.example`         | `backend/.env`                                                      |
   | `issuer-portal/.env.example`   | `issuer-portal/.env` (optional: only to change `VITE_API_BASE_URL`) |
   | `verifier-portal/.env.example` | `verifier-portal/.env`                                              |
   | `wallet/.env.example`          | `wallet/.env`                                                       |
   | `ai-service/.env.example`      | `ai-service/.env`                                                   |

   macOS/Linux: `cp backend/.env.example backend/.env`
   Windows (PowerShell): `Copy-Item backend/.env.example backend/.env`

3. Fill in the values. Every variable is documented by a comment in its template. In particular:
   - `backend/.env`: generate a random `JWT_SECRET`. `ISSUER_KEY_PASSPHRASE` comes with a
     development-only value (needed by `npm run keys:init` and for signing credentials);
     production refuses that value and needs at least 20 characters. Keep
     `ISSUER_KEY_SOURCE=file` locally (`env` is for cloud hosts, see
     `docs/security/issuer-key-management.md`). Leave
     `DATABASE_URL` empty to use the embedded development database (PGlite in
     `backend/.data/`); set a `postgres://` URL only for a real PostgreSQL server.
   - `wallet/.env`: set `EXPO_PUBLIC_API_BASE_URL` to the laptop's **LAN IP** including
     `/api/v1` (e.g. `http://192.168.1.20:4000/api/v1`), not `localhost`. On a phone,
     `localhost` is the phone. Find the IP with `ipconfig` (Windows) or
     `ipconfig getifaddr en0` (macOS). The backend already listens on all network interfaces.
     Once offers are redeemed from the phone, set the backend's `PUBLIC_BASE_URL` to the same
     address (e.g. `http://192.168.1.20:4000`) so QR codes point to it.

4. Set up the Python environment for the AI service (inside `ai-service/`):

   ```bash
   python -m venv .venv
   # Windows:      .venv\Scripts\activate
   # macOS/Linux:  source .venv/bin/activate
   python -m pip install ruff
   ```

5. Set up the backend database and issuer signing keys (inside `backend/`):

   ```bash
   npm install
   npm run db:seed     # migrations + synthetic issuers, staff and holders
   npm run keys:init   # one signing key per issuer
   npm run dev         # http://localhost:4000/api/v1/health
   ```

6. Set up and run the issuer portal (needs the backend from step 5 running):

   ```bash
   cd portal-ui && npm install
   cd ../issuer-portal && npm install
   npm run dev         # http://localhost:5173 (builds portal-ui first)
   ```

   Run the backend and the portal in two terminals (`backend: npm run dev`, `issuer-portal:
npm run dev`). The backend's `CORS_ORIGINS` must include `http://localhost:5173` (it does
   by default and in `backend/.env.example`). Sign in with a seeded account, e.g.
   `admin@serendib-trading.example` or `officer@serendib-trading.example`, with the
   development seed password printed by `npm run db:seed` (development only). For the
   Playwright e2e test, install its browser once: `npx playwright install chromium`.

7. Check that no secrets are tracked before your first commit:

   ```bash
   npm run check:secrets
   ```

## Public environment variables (important)

Variables prefixed with `VITE_` (issuer and verifier portals) or `EXPO_PUBLIC_` (wallet) are
embedded into the JavaScript bundle at build time. Anyone who opens the portal or installs the
app can read them.

**Never put secrets in `VITE_*` or `EXPO_PUBLIC_*` variables:** no JWT secrets, API keys,
database URLs or private keys. Secrets belong only in `backend/.env` or `ai-service/.env`, which
run on the server side.

## Secrets and keys

- `.env` and `.env.*` files are gitignored; only `.env.example` templates are committed.
- `*.pem`, `*.key` and `keys/` directories are gitignored. The issuer's RS256 signing keys live
  in `backend/keys/` (see `ISSUER_KEYS_DIR`) and must never be committed.
- `npm run check:secrets` fails if a tracked or staged file is a `.env`, `.pem`, `.key` or
  `*.bundle.b64` file, or contains a PEM private key (also base64-encoded). If it
  fails, run `git rm --cached <file>` and rotate the leaked secret.

## Scripts

Run these from the repository root.

| Command                 | What it does                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`          | Lints all JS/TS code with ESLint 9 (flat config)                                                                                    |
| `npm run lint:fix`      | Lints and auto-fixes what ESLint can fix                                                                                            |
| `npm run format`        | Formats all supported files with Prettier                                                                                           |
| `npm run format:check`  | Checks formatting without changing files (use before committing)                                                                    |
| `npm run check:secrets` | Fails if a tracked or staged file is a `.env` (except `.env.example`), `.pem`, `.key` or key-bundle file, or contains a private key |
| `npm run seed:generate` | Regenerates the synthetic data in `backend/seed-data/` and formats it                                                               |

Package tests run inside each package: `cd crypto-core && npm test`,
`cd backend && npm test`, `cd portal-ui && npm test`, `cd issuer-portal && npm test`
(the portal's Playwright test: `npm run test:e2e`, not part of `npm test`) and
`cd wallet && npm test` (Jest; also `npm run doctor` for expo-doctor). **On Windows, run them
from PowerShell or cmd, not Git Bash**: under Git Bash, Vitest fails in every test file because
of how the drive path is reported.

**TypeScript versions:** 5.9.3 in every package except `wallet/`, which uses 6.0.3 because
Expo SDK 58 requires it (Decision 022). Never TypeScript 7.

Python (run inside `ai-service/` with the virtual environment active):

| Command              | What it does            |
| -------------------- | ----------------------- |
| `ruff check .`       | Lints the Python code   |
| `ruff check . --fix` | Lints and auto-fixes    |
| `ruff format .`      | Formats the Python code |

## Shared configuration files

| File                        | Purpose                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint.config.js`          | ESLint rules: Node globals for `backend/`, `crypto-core/`; browser + React rules for the portals; React Native, react-hooks and Expo rules for `wallet/` |
| `.prettierrc`               | Prettier style: single quotes, semicolons, 100 columns, trailing commas                                                                                  |
| `.prettierignore`           | Files Prettier skips (build output, `ai-service/`, lock files)                                                                                           |
| `.editorconfig`             | Editor defaults: UTF-8, LF, 2-space indent (4 for Python)                                                                                                |
| `.gitattributes`            | Forces LF line endings in Git on every OS                                                                                                                |
| `ai-service/pyproject.toml` | Ruff config: line length 100, rule sets E, F, I, B                                                                                                       |
| `scripts/check-secrets.js`  | Cross-platform secrets check used by `npm run check:secrets`                                                                                             |

# Development Setup

How to get a UniVault development environment running and which shared tooling the repository
uses. The individual apps are scaffolded in later sprints; each app's own README will add
app-specific steps.

## Prerequisites

| Tool               | Version         | Used for                                                 |
| ------------------ | --------------- | -------------------------------------------------------- |
| Node.js            | 20 LTS or newer | Backend, crypto core, portals, wallet, tooling           |
| npm                | 10 or newer     | Package management (ships with Node.js)                  |
| Git                | Any recent      | Version control                                          |
| Python             | 3.10 or newer   | AI anomaly detection service                             |
| Expo Go            | Latest (phone)  | Running the wallet on a physical device                  |
| VS Code (optional) | Latest          | Install the ESLint, Prettier and EditorConfig extensions |

For wallet testing on a phone, the phone and the laptop must be on the same Wi-Fi network.

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

   | Template                       | Copy to                |
   | ------------------------------ | ---------------------- |
   | `backend/.env.example`         | `backend/.env`         |
   | `issuer-portal/.env.example`   | `issuer-portal/.env`   |
   | `verifier-portal/.env.example` | `verifier-portal/.env` |
   | `wallet/.env.example`          | `wallet/.env`          |
   | `ai-service/.env.example`      | `ai-service/.env`      |

   macOS/Linux: `cp backend/.env.example backend/.env`
   Windows (PowerShell): `Copy-Item backend/.env.example backend/.env`

3. Fill in the values. Every variable is documented by a comment in its template. In particular:
   - `backend/.env`: set `DATABASE_URL` and generate a random `JWT_SECRET`.
   - `wallet/.env`: set `EXPO_PUBLIC_API_BASE_URL` to the laptop's **LAN IP**
     (e.g. `http://192.168.1.20:4000`), not `localhost`. On a phone, `localhost` is the phone.
     Find the IP with `ipconfig` (Windows) or `ipconfig getifaddr en0` (macOS).
     Set the backend's `PUBLIC_BASE_URL` to the same address so QR codes point to it.

4. Set up the Python environment for the AI service (inside `ai-service/`):

   ```bash
   python -m venv .venv
   # Windows:      .venv\Scripts\activate
   # macOS/Linux:  source .venv/bin/activate
   python -m pip install ruff
   ```

5. Check that no secrets are tracked before your first commit:

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
- `npm run check:secrets` fails if any `.env`, `.pem` or `.key` file is tracked by Git. If it
  fails, run `git rm --cached <file>` and rotate the leaked secret.

## Scripts

Run these from the repository root.

| Command                 | What it does                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `npm run lint`          | Lints all JS/TS code with ESLint 9 (flat config)                                     |
| `npm run lint:fix`      | Lints and auto-fixes what ESLint can fix                                             |
| `npm run format`        | Formats all supported files with Prettier                                            |
| `npm run format:check`  | Checks formatting without changing files (use before committing)                     |
| `npm run check:secrets` | Fails if any `.env` (except `.env.example`), `.pem` or `.key` file is tracked by Git |

Python (run inside `ai-service/` with the virtual environment active):

| Command              | What it does            |
| -------------------- | ----------------------- |
| `ruff check .`       | Lints the Python code   |
| `ruff check . --fix` | Lints and auto-fixes    |
| `ruff format .`      | Formats the Python code |

## Shared configuration files

| File                        | Purpose                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `eslint.config.js`          | ESLint rules: Node globals for `backend/`, `crypto-core/`; browser globals for the portals; wallet rules to be added |
| `.prettierrc`               | Prettier style: single quotes, semicolons, 100 columns, trailing commas                                              |
| `.prettierignore`           | Files Prettier skips (build output, `ai-service/`, lock files)                                                       |
| `.editorconfig`             | Editor defaults: UTF-8, LF, 2-space indent (4 for Python)                                                            |
| `.gitattributes`            | Forces LF line endings in Git on every OS                                                                            |
| `ai-service/pyproject.toml` | Ruff config: line length 100, rule sets E, F, I, B                                                                   |
| `scripts/check-secrets.js`  | Cross-platform secrets check used by `npm run check:secrets`                                                         |

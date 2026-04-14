# YC Lockbox UI

Web UI for managing [Yandex Cloud Lockbox](https://yandex.cloud/ru-kz/docs/lockbox/) secrets in the Kazakhstan region.

## Features

- Browse secrets by folder with cloud/folder selector
- View keys and values (hidden by default), table/JSON view
- Create secrets via form fields or JSON paste
- Version management: create, rollback, schedule destruction
- KMS key picker (falls back to manual input if no access)
- Dark theme (toggle + system preference auto-detect)
- Dual authentication: Yandex OAuth token + Keycloak OIDC (optional)
- Per-folder RBAC via Keycloak roles

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS 4** + **shadcn/ui**
- **next-auth v5** (Keycloak OIDC, optional)
- **Docker** (standalone build, Alpine)

---

## Authentication

### Mode 1 — Yandex OAuth (always available)

1. Click **"Open Yandex OAuth"** on the login page
2. Authorize in Yandex, copy the token
3. Paste the token and click **"Sign in"**

The OAuth token is exchanged for an IAM token (12 h) with auto-refresh. Tokens are stored in httpOnly cookies and never exposed to the browser.

### Mode 2 — Keycloak OIDC (optional)

Enabled when `KEYCLOAK_ISSUER` env variable is set. A **"Sign in via Keycloak"** button appears on the login page.

IAM tokens are obtained via a **YC Service Account** authorized key (`YC_SA_AUTHORIZED_KEY_JSON`). The SA key is only used server-side; user credentials are never sent to YC.

#### Keycloak Role Format

Roles are assigned in Keycloak and control which folders a user can see:

| Role | Access |
|------|--------|
| `lockbox:admin` | Read-write access to **all** folders |
| `lockbox:<folderName>:rw` | Read-write access to the specified folder |
| `lockbox:<folderName>:ro` | Read-only access to the specified folder |

`<folderName>` must match the YC folder name **exactly** (case-sensitive).  
Users with no matching role see no folders.

---

## Service Account Permissions

The SA used for Keycloak mode (`YC_SA_AUTHORIZED_KEY_JSON`) must have the following roles **on the cloud** (or on each managed folder):

| Role | Purpose |
|------|---------|
| `resource-manager.viewer` | List clouds and folders (required for the folder selector) |
| `lockbox.editor` | Create, update, delete secrets and versions |
| `lockbox.payloadViewer` | Read secret values (payload) |
| `kms.keys.encrypterDecrypter` | Encrypt/decrypt secrets protected by a KMS key |

> Without `resource-manager.viewer` at cloud level the folder selector will be empty for all users.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LOG_LEVEL` | No | Server log level: `debug`, `info`, `warn`, `error` (default: `info`) |
| `KEYCLOAK_ISSUER` | No | Keycloak realm URL, e.g. `https://keycloak.example.com/realms/myrealm`. Enables Keycloak mode. |
| `KEYCLOAK_CLIENT_ID` | If Keycloak | OIDC client ID |
| `KEYCLOAK_CLIENT_SECRET` | If Keycloak | OIDC client secret |
| `NEXTAUTH_URL` | If Keycloak | Public URL of the app, e.g. `https://lockbox.example.com` |
| `NEXTAUTH_SECRET` | If Keycloak | Random secret for next-auth session signing |
| `YC_SA_AUTHORIZED_KEY_JSON` | If Keycloak | SA authorized key JSON (raw or base64). Generate with: `yc iam key create --service-account-id <id> --output key.json` |

See `.env.example` for a full template.

---

## Quick Start

### Local

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in.

### Docker

```bash
docker build -t lbox-ui .
docker run -p 3000:3000 --env-file .env lbox-ui
```

Or with compose:

```bash
docker compose up -d
```

---

## API Endpoints (KZ region)

| Service | URL |
|---------|-----|
| Lockbox (secrets) | `https://cpl.lockbox.api.yandexcloud.kz` |
| Lockbox (payload) | `https://dpl.lockbox.api.yandexcloud.kz` |
| KMS | `https://cpl.kms.api.yandexcloud.kz` |
| IAM | `https://iam.api.yandexcloud.kz` |
| Resource Manager | `https://resource-manager.api.yandexcloud.kz` |

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/oauth/         # Yandex OAuth login/logout/check
│   │   ├── auth/[...nextauth]/ # Keycloak OIDC handlers (next-auth)
│   │   ├── config/             # Feature flags (keycloakEnabled)
│   │   ├── clouds/             # List clouds
│   │   ├── folders/            # List folders (RBAC-filtered for Keycloak)
│   │   ├── my-folders/         # Flat folder list with role filtering
│   │   ├── kms/keys/           # List KMS keys
│   │   └── secrets/            # Secrets CRUD, versions, payload
│   ├── login/                  # Login page
│   └── secrets/                # Secrets list and detail pages
├── components/
│   ├── ui/                     # shadcn/ui primitives
│   ├── folder-selector         # Cloud → folder picker
│   ├── header                  # Navbar with auth mode badge
│   ├── page-loader             # Full-page skeleton loader
│   ├── secret-create-dialog
│   ├── secret-detail           # Secret detail + versions
│   ├── secrets-table           # Secrets list table
│   ├── session-provider        # Unified auth context (OAuth + Keycloak)
│   ├── theme-toggle
│   └── value-cell              # Show/hide secret value
├── hooks/
│   ├── useFolderAccess         # Access level for current folder
│   ├── useFolderStorage        # localStorage persistence
│   └── useRequireAuth          # Redirect if not authenticated
└── lib/
    ├── api-rbac.ts             # Server-side RBAC helpers
    ├── auth.ts                 # IAM token (OAuth cookie or SA key)
    ├── rbac.ts                 # Role parsing utilities
    ├── types.ts                # Lockbox API types
    ├── validation.ts           # Input validation
    ├── yc-api.ts               # YC API HTTP client
    └── logger.ts               # Server-side logger
```

---

## Docker Image

Multi-stage build on `node:20-alpine`. The final image has npm, yarn, and corepack removed.

```bash
# Build
docker build -t lbox-ui .

# Scan for vulnerabilities
trivy image lbox-ui --severity HIGH,CRITICAL
```

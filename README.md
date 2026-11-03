# YC Lockbox UI

Web UI for managing [Yandex Cloud Lockbox](https://yandex.cloud/ru-kz/docs/lockbox/) secrets in the Kazakhstan region.

## Features

- Browse secrets by folder with cloud/folder selector
- View keys and values (hidden by default), table/JSON view
- Create secrets via form fields or JSON paste
- Version management: create, rollback, schedule destruction
- KMS key picker (falls back to manual input if no access)
- Dark theme (toggle + system preference auto-detect)
- Secrets grouped into per-project tabs (by `project` label)
- Keycloak OIDC authentication for all providers
- Per-folder **and per-project** RBAC via Keycloak roles

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS 4** + **shadcn/ui**
- **next-auth v5** (Keycloak OIDC)
- **Docker** (standalone build, Alpine)

---

## Authentication

### Keycloak OIDC (required)

Configure `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` and `NEXTAUTH_SECRET`.
Users sign in via Keycloak; folder/project access is enforced by the application.
Yandex Cloud calls use `YC_SA_AUTHORIZED_KEY_JSON` on the server. Huawei uses its configured AK/SK or OIDC federation credentials.
Yandex OAuth token login is disabled, including for existing token cookies.

#### Keycloak Role Format

Roles are assigned in Keycloak (as **client roles** on the app's client, or realm roles) and control which folders/projects a user can see:

| Role | Access |
|------|--------|
| `lockbox:admin` | Read-write to **all** folders and projects |
| `lockbox:<folder>:rw` | Read-write to a whole folder (all projects + unlabeled secrets) |
| `lockbox:<folder>:ro` | Read-only to a whole folder |
| `lockbox:<folder>:<project>:rw` | Read-write to a single project inside a folder |
| `lockbox:<folder>:<project>:ro` | Read-only to a single project inside a folder |

`<folder>` must match the YC folder name **exactly** (case-sensitive). Effective access for a secret is the **max** of the folder-wide and matching project roles. A user with no matching role sees a clear "No access" message.

See `keycloak-roles.json` for an importable example (client roles, folders `dev/stage/prod`, projects `sample-app/demo-app`).

#### Projects (intra-folder grouping)

A single folder can hold secrets for several projects, grouped by a `project` label (e.g. `project=sample-app`) and surfaced as tabs in the UI. Valid project names come from the `LOCKBOX_PROJECTS` env registry; a label not in the registry — or missing — is treated as "no project" and is visible only to folder-wide / admin users. Enforcement is **server-side**; tabs are cosmetic.

- A project tab is shown even when empty so a user with `rw` on it can create the first secret.
- Creating a secret injects the active tab's `project` label; moving a secret between projects (changing the label) re-checks `rw` on the destination.
- **`LOCKBOX_PROJECTS` unset = feature off** — access falls back to folder-wide roles, no project label required (preserves pre-projects behavior).

---

## Service Account Permissions

### Automatic Yandex version retention

After a version is successfully added through this application, old ACTIVE
versions are scheduled for destruction. Folders whose names contain `prod`
(case-insensitive, matching the UI environment marker) retain the current and
one newest other active version; older active versions are destroyed after
30 days. Other folders retain only the current version and schedule all other
active versions for destruction after 5 days. Existing destruction schedules
are not extended. The current version is always protected, including rollbacks.
This is triggered by version creation in the application, not a periodic cloud
job; versions created outside the application are processed on the next such
creation. Cleanup failures are logged and returned as warnings without undoing
the successfully created version.

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
| `LOCKBOX_PROJECTS` | No | Comma-separated registry of project names (lowercase), e.g. `sample-app,demo-app`. Enables per-project tabs and RBAC. Unset = feature off (folder-wide RBAC only). |
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
│   │   ├── auth/oauth/         # Retired token login; cookie cleanup
│   │   ├── auth/[...nextauth]/ # Keycloak OIDC handlers (next-auth)
│   │   ├── config/             # Feature flags (keycloakEnabled, projects registry)
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
│   ├── session-provider        # Keycloak session context
│   ├── theme-toggle
│   └── value-cell              # Show/hide secret value
├── hooks/
│   ├── useFolderAccess         # Folder/project access level + writable projects
│   ├── useFolderStorage        # localStorage persistence
│   └── useRequireAuth          # Redirect if not authenticated
└── lib/
    ├── api-rbac.ts             # Server-side RBAC helpers (folder + project)
    ├── auth.ts                 # IAM token via SA key
    ├── rbac.ts                 # Role parsing, project resolution, tab computation
    ├── projects.ts             # Project registry (LOCKBOX_PROJECTS)
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

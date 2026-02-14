# YC Lockbox UI

Web UI for managing [Yandex Cloud Lockbox](https://yandex.cloud/ru-kz/docs/lockbox/) secrets in the Kazakhstan region.

## Features

- Browse secrets by folder (auto-selects first folder alphabetically)
- View keys and values (hidden by default), switch between table/JSON view
- Create secrets via form fields or JSON paste
- Version management: create, rollback to previous, schedule destruction
- KMS key picker dropdown (falls back to manual input if no access)
- Validation: names and keys must be latin characters, digits, `_`, `-`, `.`
- Delete confirmation requires typing `delete`
- Dark theme (toggle + auto-detect from system preference)
- OAuth Yandex ID authentication

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS 4** + **shadcn/ui**
- **Docker** (standalone build, Alpine)

## Quick Start

### Local

```bash
npm install
npm run dev
```

Open http://localhost:3000 and paste your Yandex OAuth token.

### Docker

```bash
docker build -t lbox-ui .
docker run -p 3000:3000 lbox-ui
```

Or with compose:

```bash
docker compose up -d
```

## Authentication

1. Click "Open Yandex OAuth" on the login page
2. Authorize in Yandex, copy the token
3. Paste the token and click "Sign in"

The OAuth token (1 year) is exchanged for an IAM token (12 hours) with auto-refresh. All tokens are stored in httpOnly cookies and are never exposed to the browser.

## API Endpoints (KZ)

| Service | URL |
|---------|-----|
| Lockbox (secrets) | `https://cpl.lockbox.api.yandexcloud.kz` |
| Lockbox (payload) | `https://dpl.lockbox.api.yandexcloud.kz` |
| KMS | `https://cpl.kms.api.yandexcloud.kz` |
| IAM | `https://iam.api.yandexcloud.kz` |
| Resource Manager | `https://resource-manager.api.yandexcloud.kz` |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Server-side log level: `debug`, `info`, `warn`, `error` |

Set `LOG_LEVEL=debug` to see all YC API requests in pod logs.

## Project Structure

```
src/
├── app/
│   ├── api/               # API routes (proxy to YC API)
│   │   ├── auth/           # OAuth → IAM exchange, logout, status check
│   │   ├── clouds/         # List clouds
│   │   ├── folders/        # List folders
│   │   ├── kms/keys/       # List KMS keys
│   │   └── secrets/        # Secrets CRUD, versions, payload
│   ├── login/              # Login page
│   └── secrets/            # Secrets list and detail pages
├── components/
│   ├── ui/                 # shadcn/ui components
│   ├── folder-selector     # Cloud → folder picker
│   ├── header              # Navbar
│   ├── secret-create-dialog
│   ├── secret-detail       # Secret detail with versions
│   ├── secrets-table       # Secrets list table
│   ├── session-provider    # Custom AuthProvider
│   ├── theme-toggle        # Dark/light theme toggle
│   ├── value-cell          # Value cell with show/hide toggle
│   └── version-create-dialog
└── lib/
    ├── auth.ts             # IAM token management
    ├── logger.ts           # Server-side logger with LOG_LEVEL
    ├── types.ts            # Lockbox API TypeScript types
    ├── utils.ts            # cn() utility
    └── yc-api.ts           # YC API HTTP client
```

## Docker Image

Multi-stage build based on `node:20-alpine`. The final image has npm, yarn, and corepack removed — only the Node.js runtime remains.

```bash
# Build
docker build -t lbox-ui .

# Scan for vulnerabilities
trivy image lbox-ui --severity HIGH,CRITICAL
```

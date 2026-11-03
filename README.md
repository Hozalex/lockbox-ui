# Lockbox UI

Web UI for managing secrets in **Yandex Cloud Lockbox (Kazakhstan)** or
**Huawei Cloud CSMS (DEW)**. Each deployment uses one backend, selected with
`SECRETS_PROVIDER=yandex|huawei` (default: `yandex`).

## Provider comparison

| Capability | Yandex Cloud Lockbox | Huawei Cloud CSMS |
|---|---|---|
| Top-level scope | Clouds and folders | One configured regional project |
| Environments | Cloud folders | Configured values of the `environment` tag |
| Projects in an environment | `project` label | `project` tag |
| Payload | Key/value entries | JSON key/value entries or plain text |
| Rename a secret | Supported | Not supported |
| Deletion protection | Supported | Not supported |
| Delete a secret | Delete through the provider API | Scheduled deletion with recovery window |
| Restore a pending secret deletion | Not supported | Supported |
| Remove a version | Scheduled destruction, cancellable | Set `expire_time`; no cancellation in this UI |
| Automatic old-version retention | Applied after adding a version through the app | No automatic cleanup on version creation |

Huawei version expiration is not physical deletion: expired versions remain in
CSMS and are displayed as `EXPIRED`.

## Features

- Browse and search secrets by environment, with project tabs.
- Create secrets from form fields or JSON; Huawei also supports plain text.
- View and copy values, hidden by default, in table or JSON view.
- Create versions, roll back and schedule version removal.
- Select KMS keys, including per-environment Huawei defaults.
- Sign in through Keycloak with server-side folder/project RBAC.
- Light/dark themes and environment colour markers.

## Authentication and access

**Keycloak is required for both providers.** Configure the issuer, client ID,
client secret, application URL and session secret. Add the application's
`/api/auth/callback/keycloak` URL to the client's allowed redirect URIs.

The app uses standard OIDC through the Keycloak provider. Role extraction expects
Keycloak's `realm_access.roles` and `resource_access.<clientId>.roles`; an arbitrary
OIDC provider requires adapting this mapping.

Browser authentication and cloud credentials are separate:

- **Yandex:** cloud calls use a server-side service-account authorized key.
- **Huawei:** cloud calls use application AK/SK credentials or a federated token
  obtained using Keycloak client credentials and Huawei IAM.
- Yandex OAuth token login is disabled; old OAuth cookies do not grant access.

### Keycloak roles

Assign realm roles or client roles on the app's Keycloak client:

| Role | Access |
|---|---|
| `lockbox:admin` | Read/write across all environments and projects |
| `lockbox:<folder>:ro` | Read-only across an environment |
| `lockbox:<folder>:rw` | Read/write across an environment |
| `lockbox:<folder>:<project>:ro` | Read-only in one project |
| `lockbox:<folder>:<project>:rw` | Read/write in one project |

For Yandex, `<folder>` is the exact cloud folder name. For Huawei, it is the
configured environment name. Folder names are case-sensitive; project names
are normalized to lowercase. The strongest matching permission wins.

`LOCKBOX_PROJECTS` is the comma-separated registry of project names, for example
`sample-app,demo-app`. Missing or unknown project labels are treated as
unassigned and are visible only to folder-wide users or administrators.
Project tabs do not replace server-side access checks. Empty writable project
tabs allow creating the first secret.

When `LOCKBOX_PROJECTS` is unset, project grouping/access is disabled and only
folder-wide roles or administrator access apply.

## Configuration

Start with [.env.example](.env.example). Example values are placeholders;
replace them with your own configuration. Do not commit cloud credentials.

### Common settings

| Variable | Required | Purpose |
|---|---|---|
| `SECRETS_PROVIDER` | No | `yandex` (default) or `huawei` |
| `KEYCLOAK_ISSUER` | Yes | Keycloak realm URL |
| `KEYCLOAK_CLIENT_ID` | Yes | Application OIDC client ID |
| `KEYCLOAK_CLIENT_SECRET` | Yes | Application OIDC client secret |
| `NEXTAUTH_URL` | Yes | Public application URL |
| `NEXTAUTH_SECRET` | Yes | Random session-signing secret |
| `LOCKBOX_PROJECTS` | No | Comma-separated project registry |
| `LOG_LEVEL` | No | `debug`, `info` (default), `warn`, `error` |

Generate a session secret with `openssl rand -base64 32`.

### Yandex Cloud Lockbox

Set `SECRETS_PROVIDER=yandex` and `YC_SA_AUTHORIZED_KEY_JSON`. The key accepts
raw JSON or base64-encoded JSON from a service-account authorized-key file.

The adapter currently uses Kazakhstan API endpoints; this is not a runtime
region selector.

| Service-account role | Purpose |
|---|---|
| `resource-manager.viewer` | Discover clouds and folders |
| `lockbox.editor` | Manage secrets and versions |
| `lockbox.payloadViewer` | Read secret values |
| `kms.keys.encrypterDecrypter` | Work with KMS-protected secrets |

Grant these roles at the managed cloud/folder scope. Cloud-level discovery
permissions are needed to populate the normal cloud/folder selector.

#### Automatic version retention

After a version is successfully added through this application:

| Folder | Active versions retained | Destruction delay for older active versions |
|---|---|---|
| Name contains `prod`, case-insensitive | Current + newest other active version | 30 days |
| Other folders | Current only | 5 days |

The current version is protected, including after rollback. Already scheduled
versions are not rescheduled. This is triggered by the app's version-creation
flow, not a periodic cloud job. Versions added outside the application are
processed on the next version creation through the app. Cleanup failure returns
a warning without undoing the newly created version.

### Huawei Cloud CSMS

Set `SECRETS_PROVIDER=huawei` and the following settings:

| Variable | Required | Purpose/default |
|---|---|---|
| `HUAWEI_REGION` | Yes | Actual Huawei region identifier |
| `HUAWEI_PROJECT_ID` | Yes | Regional project ID |
| `HUAWEI_ENVIRONMENTS` | Yes | Environment registry, e.g. `dev,stage,prod` |
| `HUAWEI_ENTERPRISE_PROJECT_ID` | No | Restrict listing and creation to one enterprise project |
| `HUAWEI_AUTH` | Recommended | `aksk` or `oidc`; inferred from presence of access key if unset |
| `HUAWEI_KMS_DEFAULTS` | No | Environment-to-key-alias map; fallback `csms/default` |
| `HUAWEI_FREE_NAMING_ENVS` | No | Environments exempt from automatic name prefixes |
| `HUAWEI_SECRET_DELETION_DAYS` | No | Recovery window: default `prod:30,*:7`, validated range 7–30 days |
| `HUAWEI_VERSION_RETENTION_DAYS` | No | Expiration delay when a version is marked for removal: default `prod:30,*:10` |

Maps use `environment:value` pairs separated by commas, with `*` as fallback.
For example: `HUAWEI_KMS_DEFAULTS=prod:example-prod-key,*:csms/default`.

**Environments are configured, not discovered from tags.** Adding a secret
tagged `environment=test` requires adding `test` to `HUAWEI_ENVIRONMENTS` and
granting the corresponding Keycloak role. Restart the application after changing
Huawei configuration, which is read once per process.

New secrets receive `environment` and `created_by` tags. Names normally receive
an `<environment>-<project>-` prefix (or `<environment>-` without a project).
Environment and creator tags are managed by the adapter.

#### Cloud authentication

For **AK/SK**, set:

```dotenv
HUAWEI_AUTH=aksk
HUAWEI_ACCESS_KEY=<access-key>
HUAWEI_SECRET_KEY=<secret-key>
```

For **OIDC federation**, configure a trusted identity provider and mapping in
Huawei IAM, then set:

```dotenv
HUAWEI_AUTH=oidc
HUAWEI_IDP_ID=<identity-provider-id>
# Optional overrides; otherwise the app's KEYCLOAK_CLIENT_ID/SECRET are used:
HUAWEI_OIDC_CLIENT_ID=<federation-client-id>
HUAWEI_OIDC_CLIENT_SECRET=<federation-client-secret>
```

The federation client must issue an `id_token` for the application's
`client_credentials` request with `scope=openid`. The adapter exchanges it for
a Huawei project-scoped token. This server-to-server flow is distinct from the
user's browser login.

The Huawei identity needs CSMS/KMS permissions for the operations exposed by the
UI. For fast environment listing, enable `csms:secret:getSecretsByTag`
(alias `csms:tag:getSecretByTag`). A 403 on that endpoint triggers the fallback
described below.

## Loading, caching and diagnostics

Secret lists contain metadata and tags/labels; they do not read payload values.
Opening a secret loads its values and versions.

Both providers cache payloads by concrete secret/version in server memory for
5 minutes, with a capacity of 100 versions per provider. Concurrent reads of the
same cache key share a load. Authorization still runs before cached values are
returned. Payload responses use `Cache-Control: private, no-store`; the cache is
not persisted to disk or shared across replicas.

For Huawei:

- The preferred list API filters by environment tag and returns metadata/tags
  per page.
- If tag filtering returns 403, the fallback lists all visible secrets and reads
  each secret's tags. A cold scan can be slow.
- Concurrent fallback requests share one scan across environments. List metadata
  is cached for 15 seconds after completion; app writes invalidate it. External
  changes may take up to 15 seconds to appear.
- The client maintains a sliding budget of 240 CSMS requests/minute per process.
  Calls wait only when the budget is exhausted. Multiple replicas and other
  clients using the same cloud identity share cloud quotas, not this local budget.
- The table does not bulk-load version counts for Huawei; versions are available
  in the secret detail view.

`GET /api/secrets` returns `Server-Timing` fields `access`, `provider` and
`filter`. Use them in browser Network diagnostics alongside server logs.
`?_rsc=...` requests are Next.js page prefetches and do not themselves load
cloud secret payloads.

## Run locally

Requires Node.js 20 or later with support for the installed Next.js version.

```bash
cp .env.example .env
# Configure Keycloak and the selected provider in .env first.
npm ci
npm run dev
```

Open http://localhost:3000 and sign in through Keycloak.

```bash
npm test
npm run build
npm start
```

## Docker and GitHub Actions

```bash
docker build -t lockbox-ui .
docker run --rm -p 3000:3000 --env-file .env lockbox-ui
```

Or build and run using the supplied Compose file:

```bash
docker compose up -d --build
```

The Dockerfile produces a standalone Next.js image using Node 20 Alpine and a
non-root runtime user. Package managers are removed from the final image.
Set `BUILD_VERSION` as a Docker build argument to override the version shown
in the UI; otherwise it uses the package version.

The [GitHub Actions workflow](.github/workflows/build.yml) builds and publishes
to `ghcr.io/<owner>/<repository>` (lowercase), using `GITHUB_TOKEN`:

- Push a Git tag to publish an image with that tag.
- Run the workflow manually on `main` to publish `main` and `sha-<commit>` tags.
- Ordinary branch pushes and pull requests do not trigger image builds.

Use your repository's Packages page to locate the published image.
Runtime configuration and cloud credentials must be supplied when starting the
container.

## Project structure

```text
.github/workflows/build.yml       # Docker build and GHCR publishing
src/auth.ts                       # Keycloak OIDC and role extraction
src/proxy.ts                      # Session protection and CSP
src/app/api/                      # Provider-neutral API routes and access gates
src/app/login/                    # Keycloak login
src/app/secrets/                  # Secret list/detail pages
src/components/                   # Forms, tables, selectors and UI primitives
src/hooks/                        # Client authentication and access helpers
src/lib/api-rbac.ts               # Server-side folder/project RBAC
src/lib/rbac.ts                   # Pure role resolution
src/lib/projects.ts               # Project registry
src/lib/payload-cache.ts          # Bounded in-memory version cache
src/lib/yc-api.ts                 # Yandex Cloud HTTP client
src/lib/providers/yandex.ts       # Yandex adapter
src/lib/providers/yandex-retention.ts # Yandex old-version cleanup
src/lib/providers/huawei/         # Huawei config, auth, mapping and HTTP client
```

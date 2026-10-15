# Security review — October 15, 2026

This is a source and dependency review of the local repository, with automated regression checks. It is not a penetration test of the deployed service or a guarantee against compromise. The live Render account, MongoDB permissions/network rules, production secrets, and repository history were not inspected.

## Dependency findings

The initial npm audit reported 38 affected server dependency entries (including development tools) and one affected client dependency entry. Many server entries were propagated from the same vulnerable transitive packages, rather than separate application vulnerabilities.

Compatible updates patched the production dependency tree, including Morgan and proxy-addr. The client source-map-js dependency was patched. Jest was upgraded to 30.5.2. Nodemon was replaced with Node's built-in `--watch` mode. A scoped override moves `@istanbuljs/load-nyc-config` to js-yaml 4, removing its vulnerable argparse/sprintf-js chain; that caller uses the supported `load()` API. This override should be revisited when the upstream dependency is updated.

Both installations reported **zero known npm audit vulnerabilities** after these changes, including development dependencies. Audit results are time-dependent and do not detect all vulnerabilities.

## Application changes

| Finding | Resolution |
| --- | --- |
| Concurrent failed logins could overwrite each other's lockout counters | Atomic database updates enforce the account limit; successful login also verifies the password hash, status, token version, and lock state still match |
| Concurrent reset guesses could bypass the five-attempt limit; a reset code could be reused concurrently | Atomic attempt reservation and single-use code consumption; one-minute per-account reset email cooldown |
| Outstanding reset codes survived password changes | Password changes, administrator resets, and access revocation clear pending reset credentials |
| Clearing the browser cookie left copied session tokens usable | Logout increments the server-side token version, invalidating all sessions for that account |
| Explicitly selected reset secrets could be serialized | User JSON serialization always removes reset hashes, expiry, and attempt counts |
| CSRF protection accepted arbitrary matching cookie/header values | Server-signed tokens and an origin check on every unsafe request, including public reset endpoints |
| Nested query parameters could reach database filter construction | Query parameters must be single strings; existing Mongo operator sanitization remains enabled |
| Private API responses could be cached | API responses use `Cache-Control: no-store` |
| Backup decompression had no output limit | Uploads capped at 32 MiB, expanded output capped at 64 MiB, transport decompression disabled, inspection rate limited; empty and malformed collection payloads rejected |
| Restoring a backup could resurrect old JWT sessions and reset codes | Successful restores randomize the authentication token version and clear reset codes for every restored account |
| Production could start with an insecure client URL or invalid proxy setting | Exact HTTPS origin required; proxy hop count validated |
| Admin seeding accepted short or bcrypt-truncated passwords | Seed password must be at least 8 characters and at most 72 UTF-8 bytes; production default password remains blocked |

Existing protections reviewed include server-side roles and teacher assignment scoping, password hashing, JWT algorithm restrictions and token revocation, HTTP-only production session cookies, Helmet headers, JSON size limits, escaped search expressions, and CSV formula escaping. The working-tree scan found no matching private key or credential patterns in the searched source files; local `.env` files are ignored by Git. This was a pattern scan, not proof that secrets have never been exposed.

## Render deployment requirements

Use the committed lockfiles with `npm ci`. For a single Render web service with this repository as its root:

```sh
# Build command
npm ci --prefix client --include=dev && npm run build --prefix client && npm ci --prefix server --omit=dev
# Start command
npm start --prefix server
```

Set `NODE_ENV=production`, `CLIENT_URL` to the exact public HTTPS origin without a trailing slash, and `JWT_SECRET` to a unique cryptographically random secret of at least 32 characters. Keep the client and API on the same origin with `VITE_API_URL=/api` for the existing cookie/CSRF design. A separate unrelated frontend domain requires additional cookie and CSRF design work.

Set `TRUST_PROXY` to the actual trusted proxy hop count (0–5). For a single reverse proxy this is `1`; verify the topology in Render, including any additional CDN. Incorrect proxy trust can break IP limits or permit spoofing. See the [Express proxy configuration documentation](https://expressjs.com/en/guide/behind-proxies/).

Keep database and email credentials only in Render's private environment settings. Use a database account restricted to this application's database and restrict database network access where practical. If any credential was previously shared or committed, rotate it; this review did not change live credentials.

Protect downloaded backups with access controls and encryption: they contain student/staff information and password hashes. The current file format is gzip, not encryption or proof of authenticity. Restore only trusted backups. Successful restores invalidate sessions and reset codes, but replace account passwords/status with the backed-up values, so review restored account access and change passwords when needed. Server-side convenience copies on ephemeral storage are not durable backups.

The current rate limiter is per process and resets at restart. Multiple server instances need a shared limiter store. MFA, external DDoS protection, audit monitoring, encrypted backup management, and an independent live penetration test remain operational improvements outside this patch.

## Verification

Results: the full server suite passed 113 tests; after the final query/restore/logout changes, the affected authentication, security, and backup suites passed all 23 tests. All 77 client tests passed. All six production smoke checks passed, including the real production login rate limit. Client production build, JavaScript syntax checks, and Git whitespace checks passed. Client lint completed with existing React warnings. Final npm audits reported zero vulnerabilities for both projects.

```sh
npm audit --prefix server
npm audit --prefix client
npm test --prefix server
npm test --prefix client
npm run lint --prefix client
npm run build --prefix client
npm run check:syntax --prefix server
node --test server/tests/productionSmoke.mjs
```

The new security regression tests exercise parallel login/reset attacks, reset replay, session revocation, reset credential serialization, forged CSRF tokens, untrusted origins, query selector rejection, caching, decompression limits, and malformed backup payloads. The existing database integration suite exercises role boundaries, teacher access restrictions, financial records, and backup round trips using an isolated temporary MongoDB replica set.

After redeployment, verify login, logout, password reset, staff access boundaries, and backups on the real HTTPS service. This review did not deploy changes or test the live Render service.

## Parent and guardian portal addition

Guardian accounts use a separate role, explicitly assigned student IDs, and email/phone sign-in. Authentication denies guardian requests to all academy APIs except their own read-only portal and account authentication/password endpoints. Each child endpoint checks the current account's assignment and the student's archive state before reading records. Finalized test results and fee records use explicit field projections to exclude other students, internal financial notes and staff audit data. Matching contact information never grants child access.

Account creation, child assignment changes, password resets and revocation are admin-only. Guardians change their own passwords using their current password; forgotten passwords go through the administrator. Changed assignments and credentials invalidate prior sessions. Phone-only accounts use a sparse unique email index; startup builds the replacement before dropping the known legacy email index, preserving uniqueness throughout.

Verification for this addition: all 136 server tests, all 90 client tests, the 13 final targeted UI tests, all six production smoke checks, syntax checks and the production build passed. Lint completed with existing warnings; the new guardian pages have no lint warnings. Database integration tests include cross-family access attempts, management API denial, phone-only accounts, password workflows, archive handling and legacy index migration.

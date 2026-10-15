# Academy Management

This project supports both a local Windows installation and a hosted production deployment. The local setup keeps the React interface, Express API and MongoDB database on the same computer.

## Requirements

- Node.js 22.12 or newer
- MongoDB running locally
- The already-installed `client` and `server` dependencies

Keep `server/.env` private. Its database setting must point to the local machine, for example:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/academy_management?replicaSet=academy-rs
```

Double-click `start-local.cmd` to build and launch the app. It opens at `http://127.0.0.1:5000`. The optimized build uses one server instead of keeping separate development servers running.

The database uses a one-machine replica set so student enrollment, payments and other multi-record operations remain transaction-safe. On a new administrator laptop, run `configure-local-mongodb.ps1` once as Administrator before starting the app.

## Hosted deployment

See [SECURITY-REVIEW.md](SECURITY-REVIEW.md) for the security review, deployment requirements, and verification commands.

For a live deployment, use a Node.js host that supports Node.js 22.12 or newer and a hosted MongoDB provider. Build the client with `npm.cmd --prefix client run build`, then start the server with `npm.cmd --prefix server start`. Production reads the hosting platform's `PORT` and listens on `0.0.0.0` by default.

Set these private production environment variables on the host:

```dotenv
NODE_ENV=production
MONGO_URI=<hosted MongoDB connection string>
JWT_SECRET=<long random secret of at least 32 characters>
CLIENT_URL=https://<your-live-domain>
SEED_ADMIN_USERNAME=<initial admin username>
SEED_ADMIN_EMAIL=<initial admin email>
SEED_ADMIN_PASSWORD=<initial admin password>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<full Gmail address>
SMTP_PASS=<16-character Google app password>
SMTP_FROM=<full Gmail address>
RESEND_API_KEY=<Resend API key>
RESEND_FROM=Insights Academy <no-reply@your-verified-domain.example>
```

Gmail password-reset email requires 2-Step Verification and a Google app
password. Keep the app password only in the hosting provider's environment
settings; never commit it to this repository. On Render, save the variables
with **Save and deploy**, and set `CLIENT_URL` to the exact public HTTPS origin
without a trailing slash.

Free Render services block Gmail's SMTP ports. For a free Render deployment,
set `RESEND_API_KEY` and `RESEND_FROM`; the application will prefer Resend's
HTTPS API and will use SMTP only when no Resend key is configured. The address
in `RESEND_FROM` must use a domain verified in the Resend dashboard. For an
initial same-account test only, Resend's onboarding sender can be used as
`Academy Management <onboarding@resend.dev>`.

The administrator's **Create & download backup** action downloads the complete `.academy-backup` file to the administrator's computer. Keep that downloaded file on a separate device or cloud drive. The server-side `local-backups` copy is only an extra convenience and must not be treated as durable storage on free or ephemeral hosting.

## Academy details, receipts and backups

Sign in as an administrator and open **My account**. There you can:

- edit the academy name and phone number;
- edit the name, phone and footer printed on payment receipts;
- create and download a complete `.academy-backup` database backup;
- inspect and restore a selected backup file.

Every created backup is also saved in `local-backups` beside this README. Copy downloaded backups to a USB drive or another physical device; a backup left only on the laptop will be lost if the drive fails.

Restore replaces the current database. The app validates the file, requires the word `RESTORE`, and creates an automatic pre-restore safety backup in `local-backups` first.

Backup uploads are limited to 32 MiB compressed and 64 MiB expanded. Larger databases need a database-native backup tool. Backup files contain private records and password hashes; store them with restricted access and encryption at rest.

## Parent and guardian portal

Register students normally under **Students**. Saving a new student automatically creates a parent login from the guardian name, primary phone and optional email, in the same transaction as enrollment. Parents sign in with their guardian name, primary phone or email. Their default password is the primary phone number exactly as entered during registration, including any spaces, hyphens or explicitly entered prefix. No country code is added to the password or the displayed login phone. Names are case-insensitive; if a name matches multiple accounts, use a unique phone or email instead. Share these instructions privately. Parents can keep using the default password for portal access. Changing it is optional through My account; a chosen new password must have at least 8 characters.

Siblings with matching parent name and contact details share one account automatically; enrolling another child never resets an existing password or reactivates disabled access. Conflicting names, phone numbers or emails block enrollment with a message so the administrator can correct the details. Parent contact edits on the student's record update the matching linked login and sign out existing sessions. If the phone changes while the parent still uses the default phone password, the default password changes to the new phone; a password already chosen by the parent stays unchanged.

Guardians use the normal sign-in page with their email or phone and password. Their dashboard shows only their selected children, current class placement, finalized test reports, fee invoices, payment history and outstanding fees. Reports still in draft are hidden. Portal access is read-only; internal financial notes, staff details, other students and management screens are excluded.

Guardians change their own passwords in **My account**. For a forgotten password, open **Students → student details → Parent portal login → Reset parent password**. This resets it to the account's phone number, signs out existing sessions and allows immediate portal access without a mandatory password change. The same panel can disable parent access. Resetting or disabling an account affects all children linked to it. Public email reset codes are for administrator/staff accounts.

For students registered before this feature, open their student details and select **Enable parent login**. Existing records are not converted in bulk. Phone-only guardian accounts are supported. At backend startup, the application builds a sparse unique email index before removing the known legacy non-sparse email index; existing email uniqueness is preserved. This requires MongoDB 5.0 or newer and permission to manage indexes. `db:prepare` also includes this migration.

## Development and checks

Staff can sign in with their login username, account email (including Gmail), or the phone number saved on their linked staff profile, using the same password. Phone matching ignores spaces, hyphens and parentheses; Pakistani mobile numbers accept both `03...` and `+923...` formats. Shared phone numbers or identifiers matching multiple accounts cannot be used to sign in; use a unique username or email instead.

```powershell
npm.cmd --prefix server test
npm.cmd --prefix client test
npm.cmd --prefix client run lint
npm.cmd --prefix client run build
```

Automated server tests use an isolated temporary MongoDB and never target the academy database.

## Sub-admin accounts

The main administrator can open **Sub-admins → New sub-admin** to create a separate username, email and password. Select **Sub-admin** on the sign-in page to use that account. **Manage account** lets the main admin reset its password, change its details or deactivate it; saving invalidates existing sessions.

Sub-admins can register and update students, manage enrollment, create tests, enter/finalize/amend marks, and view student and test reports. Invoices and fee reports are read-only and require selecting one student. Financial CSV exports use the same student restriction. Academy-wide financial totals, unfiltered invoice lists, salaries, expenses, backups, account administration and academic setup changes are denied by the server, including direct API requests. Bulk student lists and student reports omit fee structures. Individual student profiles retain the fee details needed for registration.

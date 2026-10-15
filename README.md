# STYLE E-Fashion House

STYLE E-Fashion House is a mobile-first fashion e-commerce platform built to deliver a seamless online shopping experience. The platform features curated fashion collections for women, mothers, and children, with product variants, shopping cart management, guest checkout, and Paystack payment integration.

The application uses a React storefront and an Express API backed by PostgreSQL. It supports server-calculated order totals, product inventory checks, payment verification, signed Paystack webhook handling, and token-protected administrative endpoints.

## Repository Structure

This repository contains the frontend storefront and backend API.

* `client/`: React and Vite storefront. Provides the responsive shopping interface, product collections, product variants, shopping cart, and checkout experience.
* `server/`: Express backend API. Handles product retrieval, PostgreSQL database operations, order creation, checkout, payment verification, and basic administrative operations.

The backend initializes the required database tables and seeds demo products when the application starts.

## Environment Variables Configuration

STYLE E-Fashion House uses environment variables to configure database access, frontend-backend communication, payment processing, and administrative authorization.

The backend environment variable template is provided in:

* `server/.env.example`

### 1. Configure the backend environment

Copy the example file to create your local environment configuration.

```bash
cp server/.env.example server/.env
```

On Windows Command Prompt, use:

```cmd
copy server\.env.example server\.env
```

### 2. Configure the required variables

Set the following variables in `server/.env`:

| Variable              | Purpose                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection URL used by the backend.                                                                       |
| `PAYSTACK_SECRET_KEY` | Paystack secret key used for server-side payment initialization and verification. Use a test key during development. |
| `CLIENT_URL`          | The frontend's origin, such as `http://localhost:5173` during local development.                                     |
| `ADMIN_TOKEN`         | A long, random token used to protect administrative API endpoints.                                                   |
| `PORT`                | Optional local API port. Defaults to `4000` when not provided.                                                       |
| `PGSSL`               | Controls PostgreSQL SSL configuration when set to `true`.                                                            |

For local development, the frontend normally runs at `http://localhost:5173` and the backend at `http://localhost:4000`.

**Security requirements:**

* Never commit `.env` files, database credentials, or API secret keys to GitHub.
* Keep `PAYSTACK_SECRET_KEY`, `DATABASE_URL`, and `ADMIN_TOKEN` on the backend.
* Do not expose private credentials through frontend variables prefixed with `VITE_`.
* Use Paystack test credentials while testing the checkout flow.

### 3. Configure the frontend

The frontend uses the `VITE_API_URL` environment variable to locate the backend API.

For local development, the API base URL is:

```env
VITE_API_URL=http://localhost:4000/api
```

For production, configure `VITE_API_URL` in Vercel to point to the public HTTPS URL of the deployed Render API, including the `/api` prefix.

Example:

```env
VITE_API_URL=https://YOUR-API.onrender.com/api
```

Replace `YOUR-API` with the actual Render Web Service hostname.

Because Vite exposes variables prefixed with `VITE_` to browser code, `VITE_API_URL` should contain only the public API address, never a database connection string or secret key.

## Scripts

Run the commands below from the repository root unless otherwise specified. The available scripts depend on the project's `package.json` files.

### Development

| Command               | Use case                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm install`         | Installs the root project dependencies.                                                                          |
| `npm run install:all` | Installs dependencies for the project components as configured by the root package scripts.                      |
| `npm run dev`         | Starts the local development environment as configured by the root package scripts.                              |
| `npm run start`       | Starts the backend when run from the `server/` directory, provided its package script is configured accordingly. |

### Backend API

The backend exposes endpoints for the storefront, checkout, payments, orders, and administration.

| Endpoint                              | Purpose                                                               |
| ------------------------------------- | --------------------------------------------------------------------- |
| `GET /api/health`                     | Checks backend health.                                                |
| `GET /api/products`                   | Retrieves active products, with optional category and search filters. |
| `GET /api/products/:id`               | Retrieves an individual active product.                               |
| `POST /api/checkout`                  | Validates checkout details, calculates totals, and creates an order.  |
| `GET /api/paystack/verify/:reference` | Verifies a transaction with Paystack.                                 |
| `POST /api/paystack/webhook`          | Receives signed Paystack webhook events.                              |
| `GET /api/orders/:reference`          | Retrieves the public order status for a reference.                    |
| `GET /api/admin/orders`               | Retrieves recent orders with administrative authorization.            |
| `PATCH /api/admin/orders/:id`         | Updates an order's status with administrative authorization.          |
| `POST /api/admin/products`            | Creates a product with administrative authorization.                  |
| `PATCH /api/admin/products/:id`       | Updates a product's image path with administrative authorization.     |

Administrative endpoints require the `ADMIN_TOKEN` to be supplied as a Bearer token.

## Setup Instructions

### 1. Install dependencies

From the repository root, run:

```bash
npm install
npm run install:all
```

### 2. Configure environment variables

Create `server/.env` from `server/.env.example` and configure the database connection, Paystack test key, local frontend URL, and administrative token.

If the frontend requires a local API URL environment file, configure `VITE_API_URL` in the client environment using the local API address:

```env
VITE_API_URL=http://localhost:4000/api
```

### 3. Start the application

From the repository root, run:

```bash
npm run dev
```

The expected local addresses are:

* **Storefront:** `http://localhost:5173`
* **Backend API:** `http://localhost:4000`
* **Health check:** `http://localhost:4000/api/health`

The backend creates the database tables and seeds the initial demo products on startup. Ensure that PostgreSQL is running and `DATABASE_URL` is configured correctly.

Product images currently use demo Unsplash image URLs. Replace them with owned or properly licensed product photographs before commercial launch.

## Deployment

The recommended deployment architecture uses Render for the backend and PostgreSQL database, and Vercel for the frontend.

### Render API and PostgreSQL

1. Push the repository to GitHub.

2. Create a PostgreSQL database on Render.

3. Copy the appropriate PostgreSQL connection URL from Render and configure it as the backend's `DATABASE_URL`. Use the internal connection URL when the API and database are in the same Render region and service environment.

4. Create a Render Web Service connected to the GitHub repository.

5. Configure the service as follows:

   | Setting           | Value         |
   | ----------------- | ------------- |
   | Root Directory    | `server`      |
   | Build Command     | `npm install` |
   | Start Command     | `npm start`   |
   | Health Check Path | `/api/health` |

6. Add the required environment variables in the Render Web Service settings:

   * `DATABASE_URL`
   * `PAYSTACK_SECRET_KEY`
   * `CLIENT_URL`
   * `ADMIN_TOKEN`
   * `NODE_ENV=production`

   Configure `PGSSL=true` only if required by the database connection setup.

7. Deploy the service and verify that the health check responds successfully.

### Vercel Frontend

1. Import the same GitHub repository into Vercel.

2. Configure the project:

   | Setting          | Value           |
   | ---------------- | --------------- |
   | Root Directory   | `client`        |
   | Framework Preset | Vite            |
   | Build Command    | `npm run build` |
   | Output Directory | `dist`          |

3. Add the frontend environment variable:

   ```env
   VITE_API_URL=https://YOUR-API.onrender.com/api
   ```

   Replace the example hostname with the actual public URL of the Render Web Service.

4. Select the appropriate deployment environments, including Production and Preview as needed.

5. Save the variable and deploy the frontend.

6. Update `CLIENT_URL` in Render to match the deployed frontend's exact origin, including the `https://` scheme and any deployment-specific hostname.

7. Redeploy the API after changing its environment variables.

The frontend must call the backend over HTTPS. It must never call PostgreSQL directly from the browser.

### Paystack Configuration

1. Configure `PAYSTACK_SECRET_KEY` in the Render backend environment.

2. Use Paystack test credentials for development and end-to-end checkout tests.

3. Configure the Paystack webhook URL to point to the deployed API:

   ```text
   https://YOUR-API.onrender.com/api/paystack/webhook
   ```

4. Replace the example hostname with the actual Render API hostname.

5. Test successful payments, failed payments, repeated webhook delivery, and payment verification before enabling live payments.

The backend verifies transaction status, amount, currency, and reference before marking an order as paid. The payment return URL alone must never be treated as proof of payment.

## Tech Stack

* **Frontend:** React, Vite, responsive CSS.
* **Backend:** Node.js, Express.
* **Database:** PostgreSQL, accessed by the Express backend through the Node.js `pg` package.
* **Database administration tool:** pgAdmin 4, used to connect to and manage the PostgreSQL database hosted on Render; pgAdmin 4 is not the database host itself.
* **Security:** CORS, Helmet, token-protected administrative endpoints, and signed Paystack webhook verification.
* **Payments:** Paystack transaction initialization and server-side transaction verification.
* **Hosting documented in this repository:** Vercel for the frontend and Render for the backend API and PostgreSQL database. Confirm the actual deployed service URLs and settings before migration.

## Important Before Production

STYLE E-Fashion House is an MVP starter and requires additional operational work before being treated as a complete production commerce platform.

Before launch, review and test:

* Delivery regions, charges, and fulfilment procedures.
* Inventory reservation and stock consistency during concurrent checkouts.
* Administrative access controls and secure handling of admin tokens.
* Customer order notifications through email or SMS.
* Refunds, cancellations, and payment reconciliation.
* Database backups, restore procedures, logging, and monitoring.
* Rate limiting and additional API security measures.
* Privacy policy, terms of service, returns policy, and customer data handling.
* Successful, failed, duplicated, abandoned, and delayed payment scenarios.

Confirm Paystack merchant eligibility and the payment channels available to your account before going live.


## Admin dashboard

The initial responsive admin dashboard and additive schema migration are documented in [ADMIN_SETUP.md](./ADMIN_SETUP.md). Review the documented production limitations before deployment; the existing checkout still needs discount, coupon, configurable-delivery, and variant-inventory integration before those features should be used for live orders.

## Multi-vendor marketplace foundation

The multi-vendor feature branch adds a separate role-aware API and additive PostgreSQL migration. Existing products and orders are preserved; products without a vendor owner continue to behave as platform-owned products.

### Marketplace environment variable

Set `MARKETPLACE_AUTH_SECRET` in the backend environment to a cryptographically random value with at least 32 characters. Keep it on the server only. Buyer/vendor registration and marketplace login return a bearer token with a seven-day expiry; client applications must keep it private and should not commit it to source control.

### Marketplace API routes

| Method | Endpoint | Access |
| --- | --- | --- |
| POST | `/api/marketplace/register` | Public buyer registration; seller applications use `role: "vendor"` plus store fields |
| POST | `/api/marketplace/login` | Public login |
| GET | `/api/marketplace/me` | Signed-in buyer or vendor |
| GET | `/api/marketplace/stores` | Public list of approved vendor stores |
| GET | `/api/marketplace/stores/:slug` | Public vendor store and its products |
| GET | `/api/marketplace/stores/:slug/reviews` | Public published reviews |
| GET/POST/PATCH | `/api/marketplace/vendor/products` | Approved vendor's own products |
| POST | `/api/marketplace/vendor/products/:id/archive` | Archive an approved vendor's own product |
| GET | `/api/marketplace/vendor/dashboard` | Approved vendor's summary and earnings |
| GET | `/api/marketplace/vendor/orders` | Approved vendor's order lines only |
| GET/POST | `/api/marketplace/vendor/payouts` | Approved vendor payout requests |
| POST | `/api/marketplace/reviews` | Signed-in buyer, verified against a paid order and account email |
| POST | `/api/marketplace/admin/bootstrap-super-admin` | One-time super-admin bootstrap; requires the existing server `ADMIN_TOKEN` |
| GET/PATCH | `/api/marketplace/admin/vendors`, `/api/marketplace/admin/vendors/:id/status` | Super admin |
| GET/POST/PATCH | `/api/marketplace/admin/commissions`, `/api/marketplace/admin/commissions/:id` | Super admin |
| GET/PATCH | `/api/marketplace/admin/payouts`, `/api/marketplace/admin/payouts/:id/status` | Super admin |

Registration accepts JSON such as `{"fullName":"Seller Name","email":"seller@example.com","password":"at-least-12-characters","role":"vendor","storeName":"Seller Boutique"}`. Seller applications are created in pending status and must be approved before the vendor can list products. Never accept a role value of `super_admin` from public registration.

The marketplace bootstrap endpoint accepts the existing admin token in the `Authorization: Bearer …` header and creates a super-admin account only if none exists. After the first super admin is created, that endpoint returns a conflict rather than allowing another bootstrap.

### Commission and earnings rules

Commission rules support percentage, flat fee per product line, and tiered percentage configurations. At checkout, each vendor-owned line snapshots the selected active rule and its commission/net amounts. Those amounts remain pending until server-side Paystack verification marks the order paid; then the ledger becomes eligible for payout. Legacy products without a vendor store are not included in seller earnings.

Payout requests reserve a specific amount against ledger lines to prevent the same earnings from being requested twice. Super-admins can reconcile the request with a real external transfer reference and then mark it paid. **This branch does not initiate a transfer or split the original Paystack charge automatically.** Before enabling live payouts, confirm supported Paystack transfer/subaccount capabilities for the merchant account and implement/test the provider transfer flow, recipient onboarding, webhook handling, refund reversals, and reconciliation.

### Database migration

On backend startup, `server/migrations/002_multi_vendor_foundation.sql` runs after the existing admin migration. It adds marketplace accounts, vendor stores, commission rules, vendor order lines, payout records/allocations, review records, and a nullable vendor owner on products. Take a production database backup before deploying any schema change and test this branch against a staging database first.


## Automatic Paystack split settlement

- Keep \`PAYSTACK_SECRET_KEY\`, \`MARKETPLACE_AUTH_SECRET\`, and \`ADMIN_TOKEN\` in Render only. \`MARKETPLACE_AUTH_SECRET\` must be at least 32 random characters. Never put these secrets in Vercel or a \`VITE_*\` variable.
- Set Vercel's \`VITE_API_URL\` to the public Render API base URL ending in \`/api\`, for example \`https://YOUR-API.onrender.com/api\`.
- Set Render's \`CLIENT_URL\` to the exact public Vercel frontend origin (scheme and hostname, no \`/api\`). Redeploy the backend after changing environment variables. Render also needs the existing \`DATABASE_URL\` and appropriate \`PGSSL\` setting.
- Every approved seller needs a Paystack subaccount created and verified in the same Paystack environment (Test or Live) as \`PAYSTACK_SECRET_KEY\`. Save the exact \`ACCT_...\` code in Marketplace Admin → Vendors. Dynamic splitting does not require one shared \`SPL_...\` split group.
- At checkout, the API calculates each seller's net order-line amount after the saved platform commission and passes a dynamic flat split to Paystack. Each seller receives that calculated amount; STYLE retains the platform commission, delivery fee, and any STYLE-owned product amounts. Paystack's transaction fees are borne by the main account in this configuration.
- Paystack settlement follows Paystack's settlement schedule; this is not an instant bank transfer created by the app. Verify seller/subaccount ownership and test successful, failed, refunded and multi-vendor transactions in Test mode before enabling Live payments.
- Keep the existing webhook configured to \`https://YOUR-API.onrender.com/api/paystack/webhook\` so successful transactions continue to be verified/reconciled server-side. Use a consistent mode: Test secret with Test subaccounts, and Live secret with Live subaccounts.
- The Vercel project should use root directory \`client\`, build command \`npm run build\`, output directory \`dist\`, and the existing catch-all rewrite in \`client/vercel.json\`. The client now derives its first view from \`/vendor\`, \`/sell\`, or \`/marketplace-admin\` and handles browser back/forward events.
- If the frontend builds but \`/vendor\` still shows the old landing page, check that Vercel's production deployment was built from the commit containing these routing changes rather than a previous deployment.

## Hosting migration and database management

This section is the provider-independent checklist for moving STYLE E-Fashion House to a different host. The deployment instructions above document the Vercel frontend + Render Express API + Render PostgreSQL setup. pgAdmin 4 is the administration client used to connect to the Render PostgreSQL database; it is not a separate hosting service. Before migration, the developer should verify the live service URLs and configuration in the hosting dashboards.

### Current architecture (important)

- **Frontend:** React + Vite in `client/`; build output is `client/dist/`.
- **Backend:** Node.js + Express in `server/`; entry point is `server/index.js`; start command is `npm start`.
- **Database:** **PostgreSQL**, accessed through the Node.js `pg` package using `DATABASE_URL`.
- **Database administration:** The PostgreSQL database is hosted on Render and is managed using **pgAdmin 4**, connected to the Render PostgreSQL instance. pgAdmin 4 is a database administration client; Render hosts the database itself. **phpMyAdmin is for MySQL/MariaDB and is not interchangeable with pgAdmin 4.** When migrating, the developer should configure pgAdmin 4 to connect to the destination PostgreSQL database using that provider's connection details, if external connections are permitted.
- **Payments:** Paystack integration is handled by the backend; keep secret credentials server-side.
- **Image uploads:** Cloudinary credentials are supported by the backend environment template. Confirm how the deployed code stores and retrieves image URLs before migration.

### Before changing hosting

1. Identify the current frontend URL, API URL, PostgreSQL database, domain/DNS provider, and any image storage account.
2. Review `server/.env.example` and the actual backend code to inventory required environment variables. The example file documents the expected names; configure real values in the hosting dashboard, not in Git.
3. Make a database backup and verify that the backup file is non-empty and can be read. Keep it in a private, access-controlled location because it may contain customer information, order records, and password hashes.
4. Record the current production schema/migration state and take note of any recent orders or account changes. Avoid making the old and new production systems writable at the same time unless you have a plan to keep their data consistent.
5. Do not delete the old host, database, or backups until the new deployment has passed the acceptance tests below.

### Back up and restore PostgreSQL

Use the current provider's PostgreSQL export/backup feature or PostgreSQL tools. If command-line access is available, a custom-format backup can be created with:

```bash
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file=style-fashion-backup.dump
```

Restore to a newly created, compatible PostgreSQL database with:

```bash
pg_restore --no-owner --no-acl --dbname="$NEW_DATABASE_URL" style-fashion-backup.dump
```

These commands are examples; check the source and destination PostgreSQL versions and provider requirements first. Keep connection strings private, do not paste them into public logs or commit them to Git, and do not restore over production data without confirming the target database. If using a provider's built-in backup/export tools, follow that provider's instructions instead.

The backend contains startup database initialization and migrations. Review the current migration files before deploying to a destination and test schema changes on a staging database first. A successful deployment is not proof that all production records were copied.

### Hosting-neutral migration sequence

1. **Provision PostgreSQL** on the destination host, or choose a compatible managed PostgreSQL service. Create the database/user and configure private or otherwise appropriately restricted access.
2. **Restore the database backup** and verify the expected tables and records are present.
3. **Deploy the API** from `server/` using Node.js, install dependencies, and run `npm start`. Configure the service's port according to the host and the application's `PORT` handling.
4. **Set backend environment variables** in the destination's secret/environment settings. At minimum, review `DATABASE_URL`, `CLIENT_URL`, `PAYSTACK_SECRET_KEY`, `ADMIN_TOKEN`, `MARKETPLACE_AUTH_SECRET`, and `PGSSL`. Configure Cloudinary variables if the deployed image-upload flow uses them. Only set `PGSSL=true` when it matches the destination database's TLS requirements.
5. **Verify the API** at `/api/health` and confirm that it can reach PostgreSQL. Also test `/api/products` and the implemented marketplace routes.
6. **Deploy the frontend** from `client/` with build command `npm run build` and output directory `dist`. Set `VITE_API_URL` to the public API base URL ending in `/api` (for example, `https://api.example.com/api`). Rebuild the frontend after changing this variable.
7. **Configure CORS** by setting the backend's `CLIENT_URL` to the exact deployed frontend origin, including the scheme and hostname and excluding a trailing API path. If preview domains are used, handle them intentionally rather than opening CORS to every origin.
8. **Configure SPA routing** so direct navigation and refreshes on client routes (including vendor routes) serve the frontend's `index.html`. The existing `client/vercel.json` is Vercel-specific; configure equivalent rewrites if the new frontend host requires them.
9. **Configure Paystack** with the correct webhook URL and the same Test or Live environment across the secret key and seller subaccounts. Verify callback/webhook behavior on the new API domain.
10. **Switch traffic only after testing**. Update the domain/DNS records if needed, verify HTTPS, and keep the previous deployment available for rollback until the new one is stable.

### Environment variable checklist

Use the actual `server/.env.example` and source code as the source of truth; hosting dashboards should contain the real values.

| Variable | Where | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Backend only | PostgreSQL connection string for the destination database. |
| `PGSSL` | Backend only | Set according to the destination PostgreSQL provider's TLS requirements. |
| `PORT` | Backend | Optional local port; many hosts inject this automatically. |
| `CLIENT_URL` | Backend only | Exact public frontend origin used for browser/API configuration. |
| `PAYSTACK_SECRET_KEY` | Backend only | Keep secret; use a Test key in testing and a Live key only for production. |
| `ADMIN_TOKEN` | Backend only | Long, random secret used by administrative endpoints and the one-time super-admin bootstrap flow. |
| `MARKETPLACE_AUTH_SECRET` | Backend only | Random secret of at least 32 characters for marketplace authentication. |
| `VITE_API_URL` | Frontend build environment | Public API base URL ending in `/api`; never place secrets here. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Backend only | Configure if Cloudinary uploads are used; never expose the API secret to the browser. |

Do not assume all hosts use the same variable names or that every variable is required by every code path. Check the source before removing or renaming variables.

### Migration acceptance checklist

Before declaring the move complete, verify all implemented features in the new environment:

- [ ] Frontend homepage, product detail pages, and direct client-side routes load and refresh.
- [ ] `GET /api/health` succeeds and reports a healthy database connection.
- [ ] `GET /api/products` returns the expected product records and images.
- [ ] Existing buyer/vendor/admin accounts and relevant records are preserved.
- [ ] Login, role checks, vendor approval, and vendor-specific data access work.
- [ ] Vendor dashboards show only the authenticated vendor's permitted data.
- [ ] Product create/update/archive and image upload work where implemented.
- [ ] Checkout validates prices and stock on the server and creates the expected order records.
- [ ] Paystack transaction verification and signed webhook processing work on the new API URL.
- [ ] For marketplace split settlement, approved vendors have valid Paystack subaccounts in the same Test/Live environment as the configured secret key, and multi-vendor checkout has been tested.
- [ ] Failed, cancelled, duplicated, delayed, and refunded-payment cases are handled and reconciled as supported by the current implementation.
- [ ] CORS, HTTPS, secrets, logs, database backups, and a restore/rollback path have been checked.

### Important payment distinction

A **Paystack split transaction at checkout** and a **later payout/transfer to a seller** are different flows. The current marketplace documentation describes split configuration using seller Paystack subaccounts, while payout requests/ledger records alone do not mean the application has initiated a separate bank transfer. Confirm the actual deployed code and Paystack account configuration before advertising automatic seller settlement as operational. Test the entire payment and reconciliation path in Paystack Test mode before enabling Live transactions.


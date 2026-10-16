# STYLE E-Fashion House

STYLE E-Fashion House is a fashion e-commerce and multi-vendor marketplace for women’s, maternity, and children’s fashion. Customers can browse products, choose available variants, manage a cart, and check out using Paystack. The platform includes buyer and vendor accounts, seller-store pages, vendor product and order management, marketplace administration, commission tracking, and Paystack subaccount split-payment support.

The project is a JavaScript monorepo with a React/Vite storefront, an Express API, and a PostgreSQL database. The intended deployment architecture is Vercel for the frontend and Render for the backend API and PostgreSQL.

## Repository Structure

- `client/`: React 18 + Vite storefront and client-side routes. Includes product browsing, cart and checkout UI, and buyer/vendor marketplace interfaces.
- `server/`: Node.js + Express API. Handles product and order operations, marketplace authentication and authorization, Paystack checkout and verification, webhook processing, and administrative endpoints.
- `server/migrations/`: SQL migrations for administrative and multi-vendor marketplace features.
- `server/.env.example`: Backend environment-variable template.
- `client/.env.example`: Frontend API URL template.
- `client/vercel.json`: Vercel single-page-app rewrite configuration.
- `ADMIN_SETUP.md`: Additional setup notes for the admin dashboard and related schema.

## Tech Stack

- **Frontend:** React 18, Vite 6, JavaScript/TypeScript source, CSS, Lucide React.
- **Backend:** Node.js, Express 4.
- **Database:** PostgreSQL, accessed through the Node.js `pg` driver.
- **Database administration:** pgAdmin 4, used as a client to connect to and manage the PostgreSQL database hosted on Render. pgAdmin 4 is not the database host.
- **Payments:** Paystack transaction initialization, server-side verification, signed webhooks, and dynamic split configuration for approved vendor subaccounts.
- **Security:** CORS, Helmet, bearer-token-protected admin routes, marketplace authentication, and Paystack webhook signature validation.
- **Image storage:** Cloudinary environment variables are provided for upload-related configuration; confirm the deployed upload flow and stored image URLs when migrating.
- **Hosting:** Vercel frontend; Render Express API and PostgreSQL.

## Environment Variables

Create local environment files from the templates. Do not commit real credentials.

### Backend

Copy the template:

```bash
cp server/.env.example server/.env
```

On Windows Command Prompt:

```cmd
copy server\\.env.example server\\.env
```

Configure the values in `server/.env`:

| Variable | Purpose |
| --- | --- |
| `PORT` | Optional server port; defaults to `4000` locally. The hosting provider may supply this automatically. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `PGSSL` | Set to `true` when required by the database provider's TLS configuration. |
| `CLIENT_URL` | Exact public frontend origin used by CORS and the Paystack return URL, without an `/api` suffix. |
| `PAYSTACK_SECRET_KEY` | Server-side Paystack secret key. Use a Test key for testing. |
| `ADMIN_TOKEN` | Long, random secret for protected administrative endpoints and the one-time super-admin bootstrap flow. |
| `MARKETPLACE_AUTH_SECRET` | Random secret of at least 32 characters for marketplace authentication. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name, if image uploads use Cloudinary. |
| `CLOUDINARY_API_KEY` | Cloudinary API key, if required by the upload flow. |
| `CLOUDINARY_API_SECRET` | Private Cloudinary API secret; backend only. |

Use the actual provider connection URL for `DATABASE_URL`. Never commit `.env` files or share database credentials, tokens, or secret keys in logs or public issues.

### Frontend

The frontend uses `VITE_API_URL` as its API base URL. Copy `client/.env.example` to `client/.env` if needed and set:

```env
VITE_API_URL=http://localhost:4000/api
```

For production, set `VITE_API_URL` in Vercel to the public HTTPS Render API URL **including the `/api` suffix**, for example:

```env
VITE_API_URL=https://YOUR-API.onrender.com/api
```

Replace the example hostname with the actual Render Web Service URL. Vite exposes `VITE_*` variables to browser code, so this variable must contain only a public API address—not secret keys or database credentials. Rebuild/redeploy the frontend after changing it.

## Scripts

Run commands from the repository root unless stated otherwise.

| Command | Purpose |
| --- | --- |
| `npm install` | Installs root development dependencies, including the `concurrently` runner. |
| `npm run install:all` | Installs backend and frontend dependencies. |
| `npm run dev` | Starts the backend and frontend development servers concurrently. |
| `npm run build` | Builds the Vite frontend. |
| `npm run start` | Starts the backend using the root script. |
| `npm run dev --prefix server` | Starts the backend in watch mode. |
| `npm run dev --prefix client` | Starts the Vite frontend. |
| `npm start --prefix server` | Starts the production Express API. |
| `npm run build --prefix client` | Builds the frontend directly from the client workspace. |

The expected local URLs are:

- Storefront: `http://localhost:5173`
- API: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`

## Setup Instructions

1. Install dependencies:

   ```bash
   npm install
   npm run install:all
   ```

2. Create `server/.env` from `server/.env.example` and set `DATABASE_URL`, `PGSSL`, `CLIENT_URL`, `ADMIN_TOKEN`, and `MARKETPLACE_AUTH_SECRET`. Add a Paystack Test secret key when testing payments.

3. Create `client/.env` with the local API URL:

   ```env
   VITE_API_URL=http://localhost:4000/api
   ```

4. Ensure the PostgreSQL database exists and the connection string is correct. The backend applies its SQL migrations during startup and seeds demo products when the products table is empty.

5. Start both applications:

   ```bash
   npm run dev
   ```

6. Verify the API health check at `http://localhost:4000/api/health` and confirm that `http://localhost:4000/api/products` returns product data.

Product seed data currently uses demo Unsplash image URLs. Replace them with owned or appropriately licensed product photography before commercial launch.

## Main API Routes

All routes below are relative to the API base path `/api`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | API health check. |
| GET | `/products` | Lists active products; supports category and search filters. |
| GET | `/products/:id` | Retrieves an active product. |
| POST | `/checkout` | Validates customer/cart details, calculates the order total on the server, creates an order, and initializes Paystack when configured. |
| GET | `/paystack/verify/:reference` | Verifies a Paystack transaction server-side. |
| POST | `/paystack/webhook` | Receives and validates signed Paystack webhook events. |
| GET | `/orders/:reference` | Retrieves order status for a reference. |
| GET | `/admin/orders` | Lists recent orders; requires admin authorization. |
| PATCH | `/admin/orders/:id` | Updates an order status; requires admin authorization. |
| POST | `/admin/products` | Creates a product; requires admin authorization. |
| PATCH | `/admin/products/:id` | Updates a product image path; requires admin authorization. |

Marketplace routes are grouped under `/api/marketplace` and include registration/login, current-user lookup, public vendor stores, vendor product and order management, dashboard/earnings, payout requests, reviews, vendor approval, commission rules, payout administration, and one-time super-admin bootstrap. See `server/marketplace.js` for the implemented route definitions and authorization checks.

Administrative API calls use an `Authorization: Bearer <ADMIN_TOKEN>` header where required. Keep the token private.

## Multi-Vendor Marketplace

The marketplace migration adds buyer accounts, vendor stores, commission rules, vendor order lines, payout records/allocations, reviews, and a nullable vendor owner on products. Existing platform-owned products remain supported.

- New seller applications start in a pending state and require approval before the seller can list products.
- Vendors manage their own products and access their permitted order data.
- Commission rules support percentage, flat-fee, and tiered calculations. Commission and vendor net amounts are recorded against vendor-owned order lines.
- Earnings become eligible after the backend verifies that the order was paid.
- Payout requests and ledger records do not, by themselves, mean a separate bank transfer has been sent.

The backend applies `server/migrations/001_admin_features.sql` and `server/migrations/002_multi_vendor_foundation.sql` during startup. Back up the database and test migrations on staging before deploying schema changes to production.

## Paystack and Split Payments

The backend initializes Paystack transactions through the Paystack API and verifies payment status, reference, amount, and currency before marking an order as paid. It also validates the signature of incoming Paystack webhook requests.

For multi-vendor checkout:

1. Each seller must be approved and have a valid Paystack subaccount code stored in marketplace administration.
2. The seller subaccounts and `PAYSTACK_SECRET_KEY` must belong to the same Paystack environment—Test with Test, or Live with Live.
3. The backend calculates seller net shares after applying commission rules and submits a dynamic flat split to Paystack.
4. The webhook endpoint must be configured to the deployed API URL:

   ```text
   https://YOUR-API.onrender.com/api/paystack/webhook
   ```

5. Test successful, failed, abandoned, delayed, duplicated, and multi-vendor payment scenarios before accepting live payments.

Paystack settlement follows the provider's settlement schedule; a split transaction is not necessarily an instant bank transfer. Refund handling, reversals, transfer workflows, and financial reconciliation must be reviewed against the current implementation and the merchant account's Paystack capabilities before production launch.

Never mark an order as paid based only on the browser returning to the payment page. Keep `PAYSTACK_SECRET_KEY` on the backend only.

## Deployment

### Render: Express API and PostgreSQL

1. Create or select a PostgreSQL database in Render.
2. Use the database's appropriate connection URL for the backend's `DATABASE_URL`.
3. Create a Render Web Service connected to this repository, using these settings:

   | Setting | Value |
   | --- | --- |
   | Root Directory | `server` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Health Check Path | `/api/health` |

4. Configure the backend environment variables in Render: `DATABASE_URL`, `PGSSL`, `CLIENT_URL`, `PAYSTACK_SECRET_KEY`, `ADMIN_TOKEN`, and `MARKETPLACE_AUTH_SECRET`. Configure Cloudinary values if the deployed image-upload flow requires them.
5. Deploy and test `/api/health` and `/api/products`. Review Render logs if the service fails to start or database access fails.

### Vercel: React/Vite Frontend

1. Import `OliveAlila/style-e-fashion-house` into Vercel.
2. Configure the project:

   | Setting | Value |
   | --- | --- |
   | Root Directory | `client` |
   | Framework Preset | Vite |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

3. Add `VITE_API_URL=https://YOUR-API.onrender.com/api` to the Vercel environment variables for Production and Preview as required.
4. Set Render's `CLIENT_URL` to the exact deployed Vercel frontend origin, including `https://` and the hostname, but without `/api`.
5. Redeploy the frontend after changing `VITE_API_URL`, and redeploy the backend after changing its environment variables.
6. Verify direct navigation and refresh on routes such as `/vendor`, `/sell`, and `/marketplace-admin`. The client uses the SPA rewrite in `client/vercel.json`.

The frontend must call the API over HTTPS and must never connect directly to PostgreSQL.

## Database Management and Migration

The production database is PostgreSQL hosted on Render and managed through pgAdmin 4. To connect pgAdmin 4, use the Render database connection details and ensure external connections are permitted by the database configuration. Protect the database credentials.

Before moving hosting providers:

1. Record the current frontend, API, database, domain, and image-storage configuration.
2. Back up PostgreSQL and verify the backup is readable before changing production.
3. Restore the backup into a compatible PostgreSQL database at the destination and verify tables and records.
4. Configure the new API's environment variables, run and verify migrations, and test the API against the restored database.
5. Configure the frontend's `VITE_API_URL`, CORS/`CLIENT_URL`, SPA rewrites, and Paystack webhook URL.
6. Test authentication, vendor permissions, products, checkout, payment verification, webhooks, and seller split behavior.
7. Switch production traffic only after acceptance tests pass. Keep the old deployment and backup available for rollback until the new setup is stable.

Use the hosting provider's backup tools or PostgreSQL utilities such as `pg_dump` and `pg_restore` when appropriate. Never paste connection strings into public logs or commit them to GitHub. Do not restore over production data without verifying the target database.

## Production Readiness Checklist

Before treating the marketplace as production-ready, verify:

- [ ] Database backup and restore procedure.
- [ ] Buyer/vendor/admin authentication, authorization, and vendor data isolation.
- [ ] Product availability, variant validation, stock consistency, and concurrent checkout behavior.
- [ ] Successful, failed, duplicated, delayed, and refunded payment scenarios.
- [ ] Correct Paystack Test/Live credentials and seller subaccounts.
- [ ] Webhook signature validation and order/payment reconciliation.
- [ ] Seller payout and refund/reversal processes.
- [ ] HTTPS, CORS, secret management, logging, and monitoring.
- [ ] Customer privacy policy, terms, delivery, returns, and support procedures.

This README describes the repository's intended architecture and current code paths. Always verify deployed environment settings, provider capabilities, and production behavior before migration or enabling live payments.

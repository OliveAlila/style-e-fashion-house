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
* **Database:** PostgreSQL, accessed through the `pg` package.
* **Security:** CORS, Helmet, token-protected administrative endpoints, and signed Paystack webhook verification.
* **Payments:** Paystack transaction initialization and server-side transaction verification.
* **Hosting:** Vercel for the frontend; Render for the backend API and PostgreSQL.

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


## Automatic Paystack settlement prerequisites

- `PAYSTACK_SECRET_KEY` remains on Render only and must belong to the same Paystack merchant account that owns the vendor subaccounts/split.
- `MARKETPLACE_AUTH_SECRET` remains on Render only, at least 32 random characters.
- Each approved vendor must have a Paystack subaccount created and verified in the Paystack Dashboard/API. Save the exact `ACCT_…` code in Marketplace Admin. Configure the subaccount's platform/vendor percentage and fee bearer in Paystack.
- For orders containing multiple vendors, create a Paystack split group containing all participating subaccounts and set the split group's share formula. The app must pass that `SPL_…` split code to transaction initialization. One split group only covers the vendors included in that group; arbitrary carts with sellers that aren't in the configured group must not proceed.
- The current fix branch safely enables a single-seller subaccount transaction. It deliberately rejects multi-seller carts until the matching split group is configured and selected. Do not enable live multi-vendor checkout until staging payment tests verify platform commission, vendor settlements, failed payments, refunds and reconciliation.
- Keep `VITE_API_URL` in Vercel pointing to the Render API URL with `/api`. Do not put `PAYSTACK_SECRET_KEY`, `ADMIN_TOKEN`, or `MARKETPLACE_AUTH_SECRET` in Vercel.

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


## Multi-vendor marketplace (feature branch)

The multi-vendor marketplace foundation is being developed separately from `main` on `feature/multi-vendor-marketplace`.

### Included in this branch
- Additive PostgreSQL migration for vendor applications, marketplace roles and store profiles, product ownership, commission rules, per-vendor order allocations, earning records, payout records, reviews, and an audit log.
- `/api/marketplace` routes for public approved-vendor directories/products/reviews, vendor applications, Super Admin vendor/application/commission/review/payout management, and vendor dashboard endpoint contracts.
- Public seller application page at `/sell`, seller workspace shell at `/vendor`, and marketplace operations page at `/marketplace-admin`.
- At checkout, products already assigned to a vendor are snapshotted into vendor-order allocation rows with the applicable commission estimate. Earnings become available only after the existing Paystack verifier marks the order paid.

### Deployment and launch limitations
- Review this branch before merging. This MVP does **not** yet provide individual vendor account creation/login, session-based RBAC, or fully enabled vendor dashboard reads/writes; seller endpoints deliberately fail closed until authenticated vendor sessions are integrated. Do not share a common token among vendors.
- Legacy products remain unassigned (their `vendor_id` is NULL) and continue to behave as existing STYLE-owned catalogue items.
- Paystack checkout remains a single collection transaction. No automatic split-transfer or payout is executed by this branch. Configure and verify a supported marketplace/transfer arrangement, recipient onboarding and reconciliation workflow before enabling seller cash-out.
- Public reviews remain pending moderation and are not automatically certified as verified purchases. End-to-end purchase proof and anti-abuse controls still need implementation before launch.
- The server applies `server/migrations/002_multi_vendor.sql` during startup by reading and running the additive migration. Back up the PostgreSQL database before deploying a reviewed build, and test on staging first.

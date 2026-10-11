# STYLE E-Fashion House — MVP starter

A mobile-first React/Vite storefront and Express/PostgreSQL API, styled with the brand brief's cream/champagne, charcoal and gold palette. Includes collections, product variants, cart, guest checkout, server-calculated totals, Paystack redirect initialization, server-side verification, signed/idempotent webhook handling, and token-protected basic admin endpoints.

## Requirements
- Node.js 20+
- PostgreSQL database (Render Postgres recommended for deployment)
- Paystack test keys to test payments; live keys only after merchant approval and end-to-end testing.

## Run locally
1. Create a PostgreSQL database and copy `server/.env.example` to `server/.env`.
2. Fill in `DATABASE_URL`, `PAYSTACK_SECRET_KEY` (use `sk_test_...`), `CLIENT_URL=http://localhost:5173`, and a long `ADMIN_TOKEN`.
3. In the project root run `npm install`, then `npm run install:all`, then `npm run dev`.
4. The API starts at `http://localhost:4000`; the storefront at `http://localhost:5173`.

The API creates its tables and seeds demo products on first start. Product images are demo Unsplash URLs; replace them with licensed product photos before launch.

## Deploy
### Render API
- Push this repository to GitHub.
- Create a Render PostgreSQL database and copy its **internal** connection URL.
- Create a Render Web Service from the repo. Root Directory: `server`; Build Command: `npm install`; Start Command: `npm start`.
- Add `DATABASE_URL`, `PAYSTACK_SECRET_KEY`, `CLIENT_URL` (your Vercel URL), `ADMIN_TOKEN`, and `NODE_ENV=production` as environment variables. Set health check path `/api/health`.
- Set Paystack's webhook URL to `https://YOUR-API.onrender.com/api/paystack/webhook`.
### Vercel frontend
- Import the same GitHub repo in Vercel. Set Root Directory to `client`, framework preset Vite, build command `npm run build`, output directory `dist`.
- Add `VITE_API_URL=https://YOUR-API.onrender.com/api` and deploy. Add the final Vercel domain to Render's `CLIENT_URL`, then redeploy the API.

## Important before production
This is a demonstrable MVP scaffold, not a completed production commerce operation. Configure and test delivery zones/fees, stock reservation and deduction, admin UI and role-based access, transactional email/SMS, refunds, backups, privacy/terms/returns policies, rate limiting, monitoring, and a full duplicate/failed/abandoned-payment test suite. Paystack's secret key must remain server-side. Verify payment status, amount, currency and reference on the server; never trust the return URL alone. Paystack merchant eligibility and Kenyan payment channels must be confirmed in your own merchant dashboard.

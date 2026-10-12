# Admin dashboard rollout

## Current scope
This branch adds a token-protected admin API router, responsive React admin screens, and an additive PostgreSQL migration. It does not automatically run migrations and does not deploy to Render or Vercel.

## Before deployment
1. Review the branch and test it against a non-production copy of the database first.
2. Back up the Render PostgreSQL database.
3. In pgAdmin, connect to the database named `style_fashion_db`, open Query Tool, load `server/migrations/001_admin_features.sql`, and execute it. Confirm the query completes and that `store_settings`, `coupons`, `refund_records`, `coupon_redemptions`, and `admin_audit_log` exist in schema `public`.
4. Do not deploy code that queries the new tables before the migration completes.
5. Configure Render environment variables: `DATABASE_URL`, `PGSSL`, `CLIENT_URL`, `PAYSTACK_SECRET_KEY`, `ADMIN_TOKEN`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`. Generate a long random ADMIN_TOKEN and never put it in Vercel variables.
6. In Cloudinary, open the Console dashboard and copy the cloud name, API key, and API secret into the three `CLOUDINARY_*` environment variables on Render. Do not add `CLOUDINARY_API_SECRET` to Vercel or any `VITE_*` variable. The admin photo uploader uses a protected server endpoint to sign each upload.
7. Configure Vercel `VITE_API_URL=https://style-e-fashion-house.onrender.com/api`. This is a public API URL, not a secret.
8. Deploy the branch only after review and staging tests; do not run a live refund to test it.

## Windows local setup
From the repository root in Command Prompt:
```cmd
copy server\.env.example server\.env
copy client\.env.example client\.env
npm install
npm run install:all
```
Edit `server\.env` with a development database URL, a long random ADMIN_TOKEN, CLIENT_URL=http://localhost:5173, PGSSL as appropriate, and Paystack test credentials. Never use production credentials in local testing. Then run the migration against a disposable development database using pgAdmin. Start the app with `npm run dev` and open `http://localhost:5173/admin`. The API defaults to `http://localhost:4000/api`.

## Admin API overview
All routes below require `Authorization: Bearer <ADMIN_TOKEN>`:
- `GET/POST /api/admin/products`
- `POST /api/admin/uploads/sign` (admin-protected Cloudinary upload signature)
- `PATCH /api/admin/products/:id`
- `POST /api/admin/products/:id/archive`
- `GET /api/admin/orders`, `GET /api/admin/orders/:id`, `PATCH /api/admin/orders/:id`
- `GET/POST /api/admin/coupons`, `PATCH /api/admin/coupons/:id`
- `GET/PATCH /api/admin/settings`
- `GET/POST /api/admin/orders/:id/refunds`

## Important remaining work before production use
This branch is an initial admin implementation, not yet a verified production-ready fulfilment and promotions release. In particular, the existing checkout currently calculates delivery using the legacy hard-coded fee constants and does not yet apply coupons or product discounts. Variant-specific inventory is stored and editable in the admin UI but checkout and payment fulfilment still use the legacy product-level stock. Refund webhook reconciliation, automated regression tests, end-to-end verification are not completed here. Cloudinary photo uploads are available after the three Cloudinary environment variables are configured on Render. Do not rely on coupon/discount/variant stock functionality for real orders until those paths are implemented and tested. Refund requests call Paystack but must be reconciled against the provider dashboard, especially for uncertain outcomes.

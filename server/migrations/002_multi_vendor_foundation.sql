BEGIN;

-- Multi-vendor marketplace foundation. All changes are additive to preserve current catalogue and orders.
CREATE TABLE IF NOT EXISTS public.marketplace_users (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 120),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('buyer','vendor','super_admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vendor_stores (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES public.marketplace_users(id) ON DELETE RESTRICT,
  store_name TEXT NOT NULL CHECK (length(trim(store_name)) BETWEEN 2 AND 120),
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  paystack_subaccount_code TEXT,
  payout_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.vendor_stores ADD COLUMN IF NOT EXISTS paystack_split_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS vendor_store_id BIGINT REFERENCES public.vendor_stores(id) ON DELETE RESTRICT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_user_id BIGINT REFERENCES public.marketplace_users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.commission_rules (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('percentage','flat','tiered')),
  percentage NUMERIC(7,4),
  flat_fee INTEGER,
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  applies_to_vendor_id BIGINT REFERENCES public.vendor_stores(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((calculation_type <> 'percentage') OR (percentage IS NOT NULL AND percentage >= 0 AND percentage <= 100)),
  CHECK ((calculation_type <> 'flat') OR (flat_fee IS NOT NULL AND flat_fee >= 0))
);

CREATE TABLE IF NOT EXISTS public.vendor_order_lines (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  vendor_store_id BIGINT NOT NULL REFERENCES public.vendor_stores(id) ON DELETE RESTRICT,
  product_id INTEGER NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  line_subtotal INTEGER NOT NULL CHECK (line_subtotal >= 0),
  commission_rule_id BIGINT REFERENCES public.commission_rules(id) ON DELETE SET NULL,
  commission_amount INTEGER NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  vendor_net_amount INTEGER NOT NULL DEFAULT 0 CHECK (vendor_net_amount >= 0),
  payout_status TEXT NOT NULL DEFAULT 'pending' CHECK (payout_status IN ('pending','eligible','processing','paid','failed','reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, product_id, variant_key)
);

CREATE TABLE IF NOT EXISTS public.vendor_payouts (
  id BIGSERIAL PRIMARY KEY,
  vendor_store_id BIGINT NOT NULL REFERENCES public.vendor_stores(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'KES' CHECK(currency = 'KES'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed','cancelled')),
  provider TEXT NOT NULL DEFAULT 'paystack',
  provider_reference TEXT UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  failure_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.vendor_payout_allocations (
  id BIGSERIAL PRIMARY KEY,
  payout_id BIGINT NOT NULL REFERENCES public.vendor_payouts(id) ON DELETE RESTRICT,
  vendor_order_line_id BIGINT NOT NULL REFERENCES public.vendor_order_lines(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(payout_id, vendor_order_line_id)
);

CREATE TABLE IF NOT EXISTS public.vendor_reviews (
  id BIGSERIAL PRIMARY KEY,
  buyer_user_id BIGINT NOT NULL REFERENCES public.marketplace_users(id) ON DELETE RESTRICT,
  vendor_store_id BIGINT NOT NULL REFERENCES public.vendor_stores(id) ON DELETE RESTRICT,
  product_id INTEGER REFERENCES public.products(id) ON DELETE RESTRICT,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','reported')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(buyer_user_id, order_id, product_id)
);

CREATE INDEX IF NOT EXISTS products_vendor_store_idx ON public.products(vendor_store_id, active);
CREATE INDEX IF NOT EXISTS vendor_stores_status_idx ON public.vendor_stores(status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_order_lines_vendor_idx ON public.vendor_order_lines(vendor_store_id, payout_status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_payouts_vendor_idx ON public.vendor_payouts(vendor_store_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS vendor_reviews_store_idx ON public.vendor_reviews(vendor_store_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_store_reviews_once_idx ON public.vendor_reviews(buyer_user_id, order_id, vendor_store_id) WHERE product_id IS NULL;

-- Default platform commission: changeable by the super admin through the API.
INSERT INTO public.commission_rules(name, calculation_type, percentage, priority, active)
SELECT 'Default platform commission', 'percentage', 10, 100, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.commission_rules WHERE applies_to_vendor_id IS NULL AND active = TRUE);

COMMIT;

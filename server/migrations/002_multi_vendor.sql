BEGIN;

-- Marketplace roles and seller profiles. Existing users/products/orders remain intact.
CREATE TABLE IF NOT EXISTS public.marketplace_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin','vendor','buyer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','suspended','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vendors (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES public.marketplace_users(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL DEFAULT '',
  payout_provider TEXT NOT NULL DEFAULT 'manual' CHECK (payout_provider IN ('manual','paystack')),
  payout_recipient_code TEXT,
  payout_currency TEXT NOT NULL DEFAULT 'KES',
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS vendor_id BIGINT REFERENCES public.vendors(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS vendor_sku TEXT;
CREATE INDEX IF NOT EXISTS products_vendor_active_idx ON public.products(vendor_id, active);

CREATE TABLE IF NOT EXISTS public.commission_rules (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'platform' CHECK (scope IN ('platform','vendor','category')),
  vendor_id BIGINT REFERENCES public.vendors(id) ON DELETE CASCADE,
  category TEXT,
  fee_type TEXT NOT NULL CHECK (fee_type IN ('percentage','flat','tiered')),
  percentage NUMERIC(7,4),
  flat_fee INTEGER,
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
  CHECK (flat_fee IS NULL OR flat_fee >= 0)
);
CREATE INDEX IF NOT EXISTS commission_rules_active_idx ON public.commission_rules(active, priority);

CREATE TABLE IF NOT EXISTS public.vendor_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id BIGINT NOT NULL REFERENCES public.vendors(id),
  product_id INTEGER NOT NULL REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  size TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  line_total INTEGER NOT NULL CHECK (line_total >= 0),
  commission_amount INTEGER NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  vendor_net_amount INTEGER NOT NULL DEFAULT 0 CHECK (vendor_net_amount >= 0),
  fulfilment_status TEXT NOT NULL DEFAULT 'awaiting_payment'
    CHECK (fulfilment_status IN ('awaiting_payment','processing','dispatched','delivered','cancelled','refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, product_id, size, color)
);
CREATE INDEX IF NOT EXISTS vendor_order_items_vendor_idx ON public.vendor_order_items(vendor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_order_items_order_idx ON public.vendor_order_items(order_id);

CREATE TABLE IF NOT EXISTS public.vendor_earnings (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL REFERENCES public.vendors(id),
  order_id BIGINT NOT NULL REFERENCES public.orders(id),
  gross_amount INTEGER NOT NULL CHECK (gross_amount >= 0),
  commission_amount INTEGER NOT NULL CHECK (commission_amount >= 0),
  net_amount INTEGER NOT NULL CHECK (net_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'KES',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','available','payout_pending','paid','reversed')),
  available_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id, order_id)
);
CREATE INDEX IF NOT EXISTS vendor_earnings_vendor_status_idx ON public.vendor_earnings(vendor_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.vendor_payouts (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL REFERENCES public.vendors(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'KES',
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','processing','paid','failed','cancelled')),
  provider TEXT NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','paystack')),
  provider_reference TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  admin_note TEXT
);
CREATE INDEX IF NOT EXISTS vendor_payouts_vendor_status_idx ON public.vendor_payouts(vendor_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.vendor_reviews (
  id BIGSERIAL PRIMARY KEY,
  vendor_id BIGINT NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES public.products(id) ON DELETE SET NULL,
  order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
  buyer_email TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','hidden','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_reviews_buyer_order_product_uq
  ON public.vendor_reviews(buyer_email, order_id, product_id)
  WHERE order_id IS NOT NULL AND product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vendor_reviews_vendor_status_idx ON public.vendor_reviews(vendor_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_role TEXT NOT NULL,
  actor_id BIGINT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS public.vendor_applications (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  store_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS vendor_applications_status_idx ON public.vendor_applications(status,created_at DESC);

COMMIT;

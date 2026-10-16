-- =====================================================
-- STYLE E-Fashion House - Complete Database Schema
-- PostgreSQL initialization script
-- =====================================================
-- This script creates all required tables for the complete
-- multi-vendor marketplace with admin features
-- =====================================================

BEGIN;

-- =====================================================
-- CORE PRODUCT CATALOG
-- =====================================================

CREATE TABLE IF NOT EXISTS public.products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  type TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price >= 0),
  images TEXT NOT NULL,
  description TEXT NOT NULL,
  sizes JSONB NOT NULL,
  colors JSONB NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Admin features
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  brand TEXT NOT NULL DEFAULT 'STYLE E-Fashion House',
  
  -- Multi-vendor marketplace
  vendor_store_id BIGINT REFERENCES public.vendor_stores(id) ON DELETE RESTRICT,
  
  CONSTRAINT products_discount_percent_range CHECK(discount_percent BETWEEN 0 AND 100)
);

-- =====================================================
-- ORDERS & PAYMENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.orders (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  town TEXT NOT NULL,
  county TEXT NOT NULL,
  delivery_method TEXT NOT NULL,
  items JSONB NOT NULL,
  subtotal INTEGER NOT NULL,
  delivery_fee INTEGER NOT NULL,
  total INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  order_status TEXT NOT NULL DEFAULT 'pending_payment',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  
  -- Admin features
  discount_amount INTEGER NOT NULL DEFAULT 0,
  coupon_code TEXT,
  refund_status TEXT NOT NULL DEFAULT 'none',
  
  -- Multi-vendor marketplace
  buyer_user_id BIGINT REFERENCES public.marketplace_users(id) ON DELETE SET NULL,
  
  CONSTRAINT orders_discount_amount_nonnegative CHECK(discount_amount >= 0)
);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  reference TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- STORE SETTINGS & CONFIGURATION
-- =====================================================

CREATE TABLE IF NOT EXISTS public.store_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings
INSERT INTO public.store_settings(key, value) 
VALUES
  ('delivery_fees', '{"standard": 250, "express": 450}'::jsonb),
  ('currency', '"KES"'::jsonb)
ON CONFLICT(key) DO NOTHING;

-- =====================================================
-- COUPONS & DISCOUNTS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK(discount_type IN('percentage', 'fixed')),
  discount_value NUMERIC(12,2) NOT NULL CHECK(discount_value > 0),
  minimum_order INTEGER NOT NULL DEFAULT 0 CHECK(minimum_order >= 0),
  expires_at TIMESTAMPTZ,
  usage_limit INTEGER CHECK(usage_limit IS NULL OR usage_limit > 0),
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK(usage_count >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CHECK(discount_type <> 'percentage' OR discount_value <= 100)
);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id BIGSERIAL PRIMARY KEY,
  coupon_id BIGINT NOT NULL REFERENCES public.coupons(id),
  order_id BIGINT NOT NULL UNIQUE REFERENCES public.orders(id),
  amount INTEGER NOT NULL CHECK(amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- REFUNDS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.refund_records (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id),
  amount INTEGER NOT NULL CHECK(amount > 0),
  reason TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  paystack_reference TEXT,
  status TEXT NOT NULL CHECK(status IN('pending', 'processing', 'success', 'failed', 'uncertain')),
  provider_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- ADMIN AUDIT LOG
-- =====================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- MULTI-VENDOR MARKETPLACE - USERS & AUTHENTICATION
-- =====================================================

CREATE TABLE IF NOT EXISTS public.marketplace_users (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 120),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'vendor', 'super_admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- VENDOR STORES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.vendor_stores (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES public.marketplace_users(id) ON DELETE RESTRICT,
  store_name TEXT NOT NULL CHECK (length(trim(store_name)) BETWEEN 2 AND 120),
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  paystack_subaccount_code TEXT,
  paystack_split_code TEXT,
  payout_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- COMMISSION RULES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.commission_rules (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('percentage', 'flat', 'tiered')),
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

-- Insert default platform commission
INSERT INTO public.commission_rules(name, calculation_type, percentage, priority, active)
SELECT 'Default platform commission', 'percentage', 10, 100, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.commission_rules 
  WHERE applies_to_vendor_id IS NULL AND active = TRUE
);

-- =====================================================
-- VENDOR ORDER LINES (Split transactions)
-- =====================================================

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
  payout_status TEXT NOT NULL DEFAULT 'pending' CHECK (payout_status IN ('pending', 'eligible', 'processing', 'paid', 'failed', 'reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(order_id, product_id, variant_key)
);

-- =====================================================
-- VENDOR PAYOUTS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.vendor_payouts (
  id BIGSERIAL PRIMARY KEY,
  vendor_store_id BIGINT NOT NULL REFERENCES public.vendor_stores(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'KES' CHECK(currency = 'KES'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
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

-- =====================================================
-- REVIEWS & RATINGS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.product_reviews (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  buyer_user_id BIGINT NOT NULL REFERENCES public.marketplace_users(id) ON DELETE RESTRICT,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(product_id, order_id)
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
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'reported')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(buyer_user_id, order_id, product_id)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Product indexes
CREATE INDEX IF NOT EXISTS products_active_category_idx ON public.products(active, category);
CREATE INDEX IF NOT EXISTS products_vendor_store_idx ON public.products(vendor_store_id, active);

-- Order indexes
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS orders_order_status_idx ON public.orders(order_status);

-- Refund indexes
CREATE INDEX IF NOT EXISTS refund_records_order_status_idx ON public.refund_records(order_id, status);

-- Vendor indexes
CREATE INDEX IF NOT EXISTS vendor_stores_status_idx ON public.vendor_stores(status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_order_lines_vendor_idx ON public.vendor_order_lines(vendor_store_id, payout_status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_payouts_vendor_idx ON public.vendor_payouts(vendor_store_id, status, requested_at DESC);

-- Review indexes
CREATE INDEX IF NOT EXISTS vendor_reviews_store_idx ON public.vendor_reviews(vendor_store_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_store_reviews_once_idx ON public.vendor_reviews(buyer_user_id, order_id, vendor_store_id) WHERE product_id IS NULL;
CREATE INDEX IF NOT EXISTS product_reviews_product_idx ON public.product_reviews(product_id, created_at DESC);

COMMIT;

-- =====================================================
-- NOTES
-- =====================================================
-- This schema supports:
-- 1. Core e-commerce (products, orders, payments)
-- 2. Admin features (coupons, refunds, discounts, audit log)
-- 3. Multi-vendor marketplace (stores, commissions, payouts)
-- 4. Reviews & ratings (product and vendor reviews)
-- 5. User authentication (buyers, vendors, super_admin)
-- =====================================================

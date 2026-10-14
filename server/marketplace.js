import crypto from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
const scrypt = promisify(crypto.scrypt);

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const json = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const safeUser = user => ({ id: user.id, fullName: user.full_name, email: user.email, role: user.role, status: user.status });

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt:${salt.toString('base64url')}:${Buffer.from(key).toString('base64url')}`;
}
async function verifyPassword(password, encoded) {
  try {
    const [scheme, saltText, keyText] = String(encoded).split(':');
    if (scheme !== 'scrypt' || !saltText || !keyText) return false;
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(keyText, 'base64url');
    const actual = Buffer.from(await scrypt(password, salt, expected.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}
function signToken(user) {
  const secret = process.env.MARKETPLACE_AUTH_SECRET || '';
  if (Buffer.byteLength(secret) < 32) throw Object.assign(new Error('Marketplace authentication is not configured. Set MARKETPLACE_AUTH_SECRET to a random value of at least 32 characters.'), { status: 503 });
  const header = json({ alg: 'HS256', typ: 'JWT' });
  const payload = json({ sub: String(user.id), role: user.role, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS });
  const input = header + '.' + payload;
  const signature = crypto.createHmac('sha256', secret).update(input).digest('base64url');
  return input + '.' + signature;
}
function verifyToken(token) {
  const secret = process.env.MARKETPLACE_AUTH_SECRET || '';
  if (Buffer.byteLength(secret) < 32) throw Object.assign(new Error('Marketplace authentication is not configured.'), { status: 503 });
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const input = parts[0] + '.' + parts[1];
  const expected = crypto.createHmac('sha256', secret).update(input).digest();
  let actual;
  try { actual = Buffer.from(parts[2], 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload.sub || !payload.role || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

export function createMarketplaceRouter({ pool, admin }) {
  const router = express.Router();
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  const auth = wrap(async (req, res, next) => {
    const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    const payload = match && verifyToken(match[1]);
    if (!payload) return res.status(401).json({ error: 'Sign in to continue.' });
    const row = (await pool.query('SELECT id, full_name, email, role, status FROM public.marketplace_users WHERE id=$1', [payload.sub])).rows[0];
    if (!row || row.status !== 'active' || row.role !== payload.role) return res.status(401).json({ error: 'Your session is no longer active. Please sign in again.' });
    req.marketUser = row;
    next();
  });
  const allow = (...roles) => (req, res, next) => {
    if (!req.marketUser || !roles.includes(req.marketUser.role)) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    next();
  };
  const approvedVendor = wrap(async (req, res, next) => {
    if (req.marketUser.role !== 'vendor') return res.status(403).json({ error: 'Vendor access required.' });
    const store = (await pool.query('SELECT * FROM public.vendor_stores WHERE user_id=$1', [req.marketUser.id])).rows[0];
    if (!store || store.status !== 'approved') return res.status(403).json({ error: 'Your seller store must be approved before you can sell. Current status: ' + (store?.status || 'not submitted') + '.' });
    req.vendorStore = store;
    next();
  });
  const money = n => Math.round(Number(n));
  const cleanProduct = b => {
    const name = String(b?.name || '').trim();
    const category = String(b?.category || '').trim();
    const type = String(b?.type || 'Clothing').trim().slice(0, 80);
    const price = Number(b?.price), stock = Number(b?.stock ?? 0);
    const images = Array.isArray(b?.image_gallery) ? b.image_gallery : (typeof b?.images === 'string' && b.images.trim() ? [b.images.trim()] : []);
    const sizes = Array.isArray(b?.sizes) ? b.sizes.map(x => String(x).trim()).filter(Boolean).slice(0, 30) : [];
    const colors = Array.isArray(b?.colors) ? b.colors.map(x => String(x).trim()).filter(Boolean).slice(0, 30) : [];
    if (!name || name.length > 180 || !category || category.length > 80) throw Object.assign(new Error('Product name and category are required.'), { status: 400 });
    if (!Number.isSafeInteger(price) || price < 1 || price > 100000000 || !Number.isSafeInteger(stock) || stock < 0 || stock > 10000000) throw Object.assign(new Error('Enter a valid whole-number price and stock quantity.'), { status: 400 });
    if (!images.length || images.length > 12 || images.some(url => typeof url !== 'string' || !/^https:\/\//i.test(url))) throw Object.assign(new Error('Provide between 1 and 12 HTTPS product image URLs.'), { status: 400 });
    if (!sizes.length || !colors.length) throw Object.assign(new Error('Add at least one size and one colour.'), { status: 400 });
    return { name, category, type, price, stock, images, sizes, colors, description: String(b?.description || '').trim().slice(0, 5000) };
  };
  const getStore = async userId => (await pool.query('SELECT * FROM public.vendor_stores WHERE user_id=$1', [userId])).rows[0];

  router.post('/register', wrap(async (req, res) => {
    if (Buffer.byteLength(process.env.MARKETPLACE_AUTH_SECRET || '') < 32) return res.status(503).json({ error: 'Marketplace authentication is not configured. Set MARKETPLACE_AUTH_SECRET to at least 32 random characters.' });
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const role = req.body?.role === 'vendor' ? 'vendor' : 'buyer';
    if (fullName.length < 2 || fullName.length > 120 || !emailPattern.test(email) || email.length > 190 || password.length < 12 || password.length > 72) return res.status(400).json({ error: 'Provide a name, valid email, and password of 12–72 characters.' });
    let storeInput = null;
    if (role === 'vendor') {
      const storeName = String(req.body?.storeName || '').trim();
      if (storeName.length < 2 || storeName.length > 120) return res.status(400).json({ error: 'Provide a store name of 2–120 characters.' });
      const slug = storeName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
      if (!slug) return res.status(400).json({ error: 'Choose a store name containing letters or numbers.' });
      storeInput = { storeName, slug, description: String(req.body?.storeDescription || '').trim().slice(0, 1500), phone: String(req.body?.phone || '').trim().slice(0, 40) };
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const passwordHash = await hashPassword(password);
      const user = (await client.query("INSERT INTO public.marketplace_users(full_name,email,password_hash,role,status) VALUES($1,$2,$3,$4,'active') RETURNING id,full_name,email,role,status", [fullName, email, passwordHash, role])).rows[0];
      let store = null;
      if (storeInput) {
        store = (await client.query("INSERT INTO public.vendor_stores(user_id,store_name,slug,description,contact_email,contact_phone,status) VALUES($1,$2,$3,$4,$5,$6,'pending') RETURNING id,store_name,slug,status", [user.id, storeInput.storeName, storeInput.slug, storeInput.description, email, storeInput.phone])).rows[0];
      }
      await client.query('COMMIT');
      const token = signToken(user);
      return res.status(201).json({ user: safeUser(user), token, store, message: store ? 'Seller application submitted. Your store must be approved before products can be listed.' : 'Buyer account created.' });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return res.status(409).json({ error: error.constraint === 'vendor_stores_slug_key' ? 'That store name is already in use. Choose a different name.' : 'An account with this email already exists.' });
      throw error;
    } finally { client.release(); }
  }));

  router.post('/login', wrap(async (req, res) => {
    if (Buffer.byteLength(process.env.MARKETPLACE_AUTH_SECRET || '') < 32) return res.status(503).json({ error: 'Marketplace authentication is not configured.' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!emailPattern.test(email) || !password || password.length > 72) return res.status(400).json({ error: 'Enter a valid email and password.' });
    const user = (await pool.query('SELECT id,full_name,email,password_hash,role,status FROM public.marketplace_users WHERE email=$1', [email])).rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Your account is not active. Contact support.' });
    const token = signToken(user);
    return res.json({ user: safeUser(user), token, store: user.role === 'vendor' ? await getStore(user.id) : null });
  }));

  router.get('/me', auth, wrap(async (req, res) => res.json({ user: safeUser(req.marketUser), store: req.marketUser.role === 'vendor' ? await getStore(req.marketUser.id) : null })));

  router.get('/stores', wrap(async (_req, res) => {
    const stores = await pool.query("SELECT s.id,s.store_name,s.slug,s.description,ROUND(AVG(r.rating)::numeric,1) AS rating,COUNT(r.id)::int AS review_count FROM public.vendor_stores s LEFT JOIN public.vendor_reviews r ON r.vendor_store_id=s.id AND r.status='published' WHERE s.status='approved' GROUP BY s.id ORDER BY s.store_name");
    res.json(stores.rows);
  }));
  router.get('/stores/:slug', wrap(async (req, res) => {
    const store = (await pool.query("SELECT s.id,s.store_name,s.slug,s.description,s.status,ROUND(AVG(r.rating)::numeric,1) AS rating,COUNT(r.id)::int AS review_count FROM public.vendor_stores s LEFT JOIN public.vendor_reviews r ON r.vendor_store_id=s.id AND r.status='published' WHERE s.slug=$1 AND s.status='approved' GROUP BY s.id", [req.params.slug])).rows[0];
    if (!store) return res.status(404).json({ error: 'Store not found.' });
    const products = (await pool.query('SELECT id,name,category,type,price,images,image_gallery,description,sizes,colors,stock FROM public.products WHERE vendor_store_id=$1 AND active=TRUE AND archived_at IS NULL ORDER BY id DESC', [store.id])).rows;
    res.json({ store, products: products.map(p => ({ ...p, price: Number(p.price), stock: Number(p.stock), image_gallery: p.image_gallery || [] })) });
  }));
  router.get('/stores/:slug/reviews', wrap(async (req, res) => {
    const store = (await pool.query("SELECT id FROM public.vendor_stores WHERE slug=$1 AND status='approved'", [req.params.slug])).rows[0];
    if (!store) return res.status(404).json({ error: 'Store not found.' });
    const reviews = (await pool.query("SELECT r.id,r.rating,r.title,r.body,r.created_at,u.full_name AS buyer_name,p.name AS product_name FROM public.vendor_reviews r JOIN public.marketplace_users u ON u.id=r.buyer_user_id LEFT JOIN public.products p ON p.id=r.product_id WHERE r.vendor_store_id=$1 AND r.status='published' ORDER BY r.created_at DESC LIMIT 100", [store.id])).rows;
    res.json(reviews);
  }));
  router.get('/products/:id/reviews', wrap(async (req, res) => {
    const product = (await pool.query("SELECT id,vendor_store_id FROM public.products WHERE id=$1 AND active=TRUE AND vendor_store_id IS NOT NULL", [req.params.id])).rows[0];
    if (!product) return res.status(404).json({error:'Marketplace product not found.'});
    const reviews = (await pool.query("SELECT r.id,r.rating,r.title,r.body,r.created_at,u.full_name AS buyer_name FROM public.vendor_reviews r JOIN public.marketplace_users u ON u.id=r.buyer_user_id WHERE r.product_id=$1 AND r.vendor_store_id=$2 AND r.status='published' ORDER BY r.created_at DESC LIMIT 100", [product.id,product.vendor_store_id])).rows;
    res.json(reviews);
  }));

  router.get('/vendor/dashboard', auth, allow('vendor'), approvedVendor, wrap(async (req, res) => {
    const storeId = req.vendorStore.id;
    const [products, lines, reviews, payouts] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM public.products WHERE vendor_store_id=$1 AND active=TRUE AND archived_at IS NULL', [storeId]),
      pool.query("SELECT COUNT(DISTINCT l.order_id) FILTER (WHERE o.payment_status='paid')::int AS orders,COALESCE(SUM(l.line_subtotal) FILTER (WHERE o.payment_status='paid'),0)::bigint AS gross,COALESCE(SUM(l.commission_amount) FILTER (WHERE o.payment_status='paid'),0)::bigint AS commission,COALESCE(SUM(l.vendor_net_amount) FILTER (WHERE o.payment_status='paid'),0)::bigint AS earnings FROM public.vendor_order_lines l JOIN public.orders o ON o.id=l.order_id WHERE l.vendor_store_id=$1", [storeId]),
      pool.query("SELECT COUNT(*)::int AS count,COALESCE(ROUND(AVG(rating)::numeric,1),0) AS rating FROM public.vendor_reviews WHERE vendor_store_id=$1 AND status='published'", [storeId]),
      pool.query("SELECT COALESCE(SUM(amount) FILTER (WHERE status IN ('pending','processing')),0)::bigint AS pending,COALESCE(SUM(amount) FILTER (WHERE status='paid'),0)::bigint AS paid FROM public.vendor_payouts WHERE vendor_store_id=$1", [storeId])
    ]);
    res.json({ store: { id:req.vendorStore.id, name:req.vendorStore.store_name, slug:req.vendorStore.slug, status:req.vendorStore.status }, products:products.rows[0].count, orders:lines.rows[0].orders, gross:Number(lines.rows[0].gross), commission:Number(lines.rows[0].commission), earnings:Number(lines.rows[0].earnings), reviewCount:reviews.rows[0].count, rating:Number(reviews.rows[0].rating), pendingPayouts:Number(payouts.rows[0].pending), paidPayouts:Number(payouts.rows[0].paid) });
  }));

  router.get('/vendor/products', auth, allow('vendor'), approvedVendor, wrap(async (req, res) => {
    const result = await pool.query('SELECT * FROM public.products WHERE vendor_store_id=$1 ORDER BY id DESC', [req.vendorStore.id]);
    res.json(result.rows.map(p => ({...p, price:Number(p.price), stock:Number(p.stock), discount_percent:Number(p.discount_percent||0), image_gallery:p.image_gallery||[], variants:p.variants||[]})));
  }));
  router.post('/vendor/products', auth, allow('vendor'), approvedVendor, wrap(async (req, res) => {
    const p = cleanProduct(req.body);
    const result = await pool.query('INSERT INTO public.products(name,category,type,price,images,description,sizes,colors,stock,active,discount_percent,variants,image_gallery,vendor_store_id) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,TRUE,0,$10::jsonb,$11::jsonb,$12) RETURNING *', [p.name,p.category,p.type,p.price,p.images[0],p.description,JSON.stringify(p.sizes),JSON.stringify(p.colors),p.stock,JSON.stringify([]),JSON.stringify(p.images),req.vendorStore.id]);
    res.status(201).json({...result.rows[0], price:Number(result.rows[0].price), stock:Number(result.rows[0].stock)});
  }));
  router.patch('/vendor/products/:id', auth, allow('vendor'), approvedVendor, wrap(async (req, res) => {
    const p = cleanProduct(req.body);
    const result = await pool.query('UPDATE public.products SET name=$1,category=$2,type=$3,price=$4,images=$5,description=$6,sizes=$7::jsonb,colors=$8::jsonb,stock=$9,image_gallery=$10::jsonb WHERE id=$11 AND vendor_store_id=$12 RETURNING *', [p.name,p.category,p.type,p.price,p.images[0],p.description,JSON.stringify(p.sizes),JSON.stringify(p.colors),p.stock,JSON.stringify(p.images),req.params.id,req.vendorStore.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Product not found in your store.' });
    res.json({...result.rows[0], price:Number(result.rows[0].price), stock:Number(result.rows[0].stock)});
  }));
  router.post('/vendor/products/:id/archive', auth, allow('vendor'), approvedVendor, wrap(async (req, res) => {
    const result = await pool.query('UPDATE public.products SET active=FALSE,archived_at=NOW() WHERE id=$1 AND vendor_store_id=$2 RETURNING id,active,archived_at', [req.params.id, req.vendorStore.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Product not found in your store.' });
    res.json(result.rows[0]);
  }));
  router.get('/vendor/orders', auth, allow('vendor'), approvedVendor, wrap(async (req, res) => {
    const result = await pool.query("SELECT l.id AS line_id,l.order_id,l.product_id,l.product_name,l.quantity,l.unit_price,l.line_subtotal,l.commission_amount,l.vendor_net_amount,l.payout_status,o.reference,o.customer_name,o.payment_status,o.order_status,o.created_at FROM public.vendor_order_lines l JOIN public.orders o ON o.id=l.order_id WHERE l.vendor_store_id=$1 ORDER BY o.created_at DESC LIMIT 200", [req.vendorStore.id]);
    res.json(result.rows.map(x=>({...x,unit_price:Number(x.unit_price),line_subtotal:Number(x.line_subtotal),commission_amount:Number(x.commission_amount),vendor_net_amount:Number(x.vendor_net_amount)})));
  }));
  router.get('/vendor/payouts', auth, allow('vendor'), approvedVendor, wrap(async (req, res) => {
    const result = await pool.query('SELECT id,amount,currency,status,provider_reference,failure_reason,requested_at,processed_at FROM public.vendor_payouts WHERE vendor_store_id=$1 ORDER BY requested_at DESC LIMIT 100', [req.vendorStore.id]);
    res.json(result.rows.map(x=>({...x,amount:Number(x.amount)})));
  }));
  router.post('/vendor/payouts', auth, allow('vendor'), approvedVendor, wrap(async (req, res) => {
    const amount = Number(req.body?.amount);
    if (!Number.isSafeInteger(amount) || amount < 1) return res.status(400).json({ error:'Enter a valid payout amount in KES.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const available = Number((await client.query("SELECT COALESCE(SUM(GREATEST(0,l.vendor_net_amount-COALESCE(a.reserved,0))),0)::bigint AS amount FROM public.vendor_order_lines l LEFT JOIN (SELECT a.vendor_order_line_id,SUM(a.amount)::bigint AS reserved FROM public.vendor_payout_allocations a JOIN public.vendor_payouts p ON p.id=a.payout_id WHERE p.status IN ('pending','processing','paid') GROUP BY a.vendor_order_line_id) a ON a.vendor_order_line_id=l.id WHERE l.vendor_store_id=$1 AND l.payout_status IN ('eligible','paid')", [req.vendorStore.id])).rows[0].amount);
      if (amount > available) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Requested payout exceeds your available balance.', available: Math.max(0, available) }); }
      const payout = (await client.query("INSERT INTO public.vendor_payouts(vendor_store_id,amount,idempotency_key,status) VALUES($1,$2,$3,'pending') RETURNING id,amount,status,requested_at", [req.vendorStore.id, amount, crypto.randomUUID()])).rows[0];
      let remaining = amount;
      const eligibleLines = (await client.query("SELECT l.id,l.vendor_net_amount,COALESCE(a.reserved,0)::bigint AS reserved FROM public.vendor_order_lines l LEFT JOIN (SELECT a.vendor_order_line_id,SUM(a.amount)::bigint AS reserved FROM public.vendor_payout_allocations a JOIN public.vendor_payouts p ON p.id=a.payout_id WHERE p.status IN ('pending','processing','paid') GROUP BY a.vendor_order_line_id) a ON a.vendor_order_line_id=l.id WHERE l.vendor_store_id=$1 AND l.payout_status IN ('eligible','paid') ORDER BY l.created_at,l.id FOR UPDATE OF l", [req.vendorStore.id])).rows;
      for (const line of eligibleLines) {
        if (remaining <= 0) break;
        const availableLineAmount = Math.max(0, Number(line.vendor_net_amount) - Number(line.reserved));
        const alloc = Math.min(remaining, availableLineAmount);
        if (alloc <= 0) continue;
        await client.query('INSERT INTO public.vendor_payout_allocations(payout_id,vendor_order_line_id,amount) VALUES($1,$2,$3)', [payout.id,line.id,alloc]);
        remaining -= alloc;
      }
      if (remaining !== 0) throw new Error('Could not allocate the payout against eligible earnings.');
      await client.query('COMMIT');
      res.status(201).json({...payout,amount:Number(payout.amount),message:'Payout request recorded. The platform must execute and reconcile the payment before marking it paid.'});
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }));

  router.post('/reviews', auth, allow('buyer'), wrap(async (req, res) => {
    const orderReference = String(req.body?.orderReference || '').trim();
    const storeId = Number(req.body?.storeId), productId = req.body?.productId == null || req.body.productId === '' ? null : Number(req.body.productId);
    const rating = Number(req.body?.rating), title = String(req.body?.title || '').trim().slice(0, 120), body = String(req.body?.body || '').trim().slice(0, 2000);
    if (!orderReference || !Number.isSafeInteger(storeId) || storeId < 1 || !Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error:'Provide a valid order reference, store, and 1–5 rating.' });
    const order = (await pool.query("SELECT id FROM public.orders WHERE reference=$1 AND payment_status='paid' AND lower(email)=lower($2)", [orderReference,req.marketUser.email])).rows[0];
    if (!order) return res.status(403).json({ error:'Reviews are limited to purchases verified against your account email.' });
    if (productId !== null) {
      const product = (await pool.query('SELECT id FROM public.products WHERE id=$1 AND vendor_store_id=$2', [productId,storeId])).rows[0];
      const line = (await pool.query('SELECT 1 FROM public.vendor_order_lines WHERE order_id=$1 AND vendor_store_id=$2 AND product_id=$3', [order.id,storeId,productId])).rows[0];
      if (!product || !line) return res.status(403).json({ error:'This order does not contain that store product.' });
    } else {
      const line = (await pool.query('SELECT 1 FROM public.vendor_order_lines WHERE order_id=$1 AND vendor_store_id=$2', [order.id,storeId])).rows[0];
      if (!line) return res.status(403).json({ error:'This order does not contain products from that store.' });
    }
    try {
      const review = (await pool.query('INSERT INTO public.vendor_reviews(buyer_user_id,vendor_store_id,product_id,order_id,rating,title,body) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,rating,title,body,status,created_at', [req.marketUser.id,storeId,productId,order.id,rating,title,body])).rows[0];
      return res.status(201).json(review);
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error:'You have already reviewed this purchase.' });
      throw error;
    }
  }));

  // Super-admin bootstrap is available only with the existing server-side ADMIN_TOKEN.
  router.post('/admin/bootstrap-super-admin', admin, wrap(async (req, res) => {
    if (Buffer.byteLength(process.env.MARKETPLACE_AUTH_SECRET || '') < 32) return res.status(503).json({ error: 'Marketplace authentication is not configured.' });
    const fullName = String(req.body?.fullName || '').trim(), email = String(req.body?.email || '').trim().toLowerCase(), password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (fullName.length < 2 || fullName.length > 120 || !emailPattern.test(email) || password.length < 14 || password.length > 72) return res.status(400).json({ error:'Provide a valid name, email and password of 14–72 characters.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('style-marketplace-super-admin-bootstrap'))");
      const exists = Number((await client.query("SELECT COUNT(*)::int AS n FROM public.marketplace_users WHERE role='super_admin'")).rows[0].n);
      if (exists) { await client.query('ROLLBACK'); return res.status(409).json({ error:'A super admin account already exists.' }); }
      const hash = await hashPassword(password);
      const user = (await client.query("INSERT INTO public.marketplace_users(full_name,email,password_hash,role,status) VALUES($1,$2,$3,'super_admin','active') RETURNING id,full_name,email,role,status", [fullName,email,hash])).rows[0];
      await client.query('COMMIT');
      res.status(201).json({ user:safeUser(user), message:'Super admin account created. Sign in through the marketplace login.' });
    } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505') return res.status(409).json({error:'An account with this email already exists.'}); throw error; }
    finally { client.release(); }
  }));

  router.get('/admin/vendors', auth, allow('super_admin'), wrap(async (_req, res) => {
    const vendors = (await pool.query("SELECT s.*,u.full_name,u.email,COALESCE(SUM(l.line_subtotal) FILTER (WHERE o.payment_status='paid'),0)::bigint AS gross_sales,COALESCE(SUM(l.commission_amount) FILTER (WHERE o.payment_status='paid'),0)::bigint AS platform_commission,COALESCE(SUM(l.vendor_net_amount) FILTER (WHERE o.payment_status='paid'),0)::bigint AS vendor_earnings FROM public.vendor_stores s JOIN public.marketplace_users u ON u.id=s.user_id LEFT JOIN public.vendor_order_lines l ON l.vendor_store_id=s.id LEFT JOIN public.orders o ON o.id=l.order_id GROUP BY s.id,u.id ORDER BY s.created_at DESC")).rows;
    res.json(vendors.map(v=>({...v,gross_sales:Number(v.gross_sales),platform_commission:Number(v.platform_commission),vendor_earnings:Number(v.vendor_earnings)})));
  }));
  router.patch('/admin/vendors/:id/paystack-subaccount', auth, allow('super_admin'), wrap(async (req, res) => {
    const code = String(req.body?.subaccountCode || '').trim();
    if (!/^ACCT_[A-Za-z0-9]+$/.test(code)) return res.status(400).json({ error: 'Provide a valid Paystack subaccount code beginning with ACCT_.' });
    const store = (await pool.query("UPDATE public.vendor_stores SET paystack_subaccount_code=$1,updated_at=NOW() WHERE id=$2 RETURNING id,store_name,status,paystack_subaccount_code", [code, req.params.id])).rows[0];
    if (!store) return res.status(404).json({ error: 'Vendor store not found.' });
    res.json({ store, message: 'Paystack subaccount code saved. Verify its owner and share percentage in Paystack before taking live orders.' });
  }));

  router.patch('/admin/vendors/:id/status', auth, allow('super_admin'), wrap(async (req, res) => {
    const status = String(req.body?.status || '');
    if (!['approved','rejected','suspended'].includes(status)) return res.status(400).json({ error:'Status must be approved, rejected, or suspended.' });
    const store = (await pool.query('UPDATE public.vendor_stores SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,store_name,slug,status', [status,req.params.id])).rows[0];
    if (!store) return res.status(404).json({ error:'Vendor store not found.' });
    res.json(store);
  }));
  router.get('/admin/payouts', auth, allow('super_admin'), wrap(async (_req, res) => {
    const rows = (await pool.query("SELECT p.*,s.store_name FROM public.vendor_payouts p JOIN public.vendor_stores s ON s.id=p.vendor_store_id ORDER BY p.requested_at DESC LIMIT 200")).rows;
    res.json(rows.map(p=>({...p,amount:Number(p.amount)})));
  }));
  router.patch('/admin/payouts/:id/status', auth, allow('super_admin'), wrap(async (req, res) => {
    const status = String(req.body?.status || '');
    if (!['processing','paid','failed','cancelled'].includes(status)) return res.status(400).json({error:'Unsupported payout status.'});
    if (status === 'paid' && !String(req.body?.providerReference || '').trim()) return res.status(400).json({error:'A confirmed external payment reference is required before marking a payout paid.'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const payout = (await client.query('SELECT * FROM public.vendor_payouts WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
      if (!payout) { await client.query('ROLLBACK'); return res.status(404).json({error:'Payout not found.'}); }
      if (payout.status === 'paid') { await client.query('ROLLBACK'); return res.status(409).json({error:'Paid payouts cannot be changed.'}); }
      if (status === 'paid') {
        await client.query("UPDATE public.vendor_payouts SET status='paid',provider_reference=$1,processed_at=NOW() WHERE id=$2", [String(req.body.providerReference).trim(), payout.id]);
        await client.query("UPDATE public.vendor_order_lines l SET payout_status='paid' WHERE l.id IN (SELECT a.vendor_order_line_id FROM public.vendor_payout_allocations a WHERE a.payout_id=$1) AND (SELECT COALESCE(SUM(a2.amount),0) FROM public.vendor_payout_allocations a2 JOIN public.vendor_payouts p2 ON p2.id=a2.payout_id WHERE a2.vendor_order_line_id=l.id AND p2.status IN ('pending','processing','paid')) >= l.vendor_net_amount", [payout.id]);
      } else {
        await client.query("UPDATE public.vendor_payouts SET status=$1,failure_reason=$2,processed_at=CASE WHEN $1 IN ('failed','cancelled') THEN NOW() ELSE processed_at END WHERE id=$3", [status, status==='failed'?String(req.body?.failureReason||'Payment failed').slice(0,500):null,payout.id]);
        if (status === 'failed' || status === 'cancelled') {
          await client.query("UPDATE public.vendor_order_lines l SET payout_status='eligible' WHERE l.id IN (SELECT a.vendor_order_line_id FROM public.vendor_payout_allocations a WHERE a.payout_id=$1) AND l.payout_status='paid' AND (SELECT COALESCE(SUM(a2.amount),0) FROM public.vendor_payout_allocations a2 JOIN public.vendor_payouts p2 ON p2.id=a2.payout_id WHERE a2.vendor_order_line_id=l.id AND p2.status IN ('pending','processing','paid')) < l.vendor_net_amount", [payout.id]);
        }
      }
      const updated=(await client.query("SELECT id,vendor_store_id,amount,status,provider_reference,failure_reason,requested_at,processed_at FROM public.vendor_payouts WHERE id=$1", [payout.id])).rows[0];
      await client.query('COMMIT');
      res.json({...updated,amount:Number(updated.amount),message:status==='paid'?'Payout marked paid using the supplied external payment reference. No transfer was initiated by this endpoint.':'Payout status updated.'});
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }));

  router.get('/admin/commissions', auth, allow('super_admin'), wrap(async (_req, res) => {
    const rules = (await pool.query('SELECT * FROM public.commission_rules ORDER BY priority, id')).rows;
    res.json(rules);
  }));
  router.post('/admin/commissions', auth, allow('super_admin'), wrap(async (req, res) => {
    const b=req.body||{}, name=String(b.name||'').trim(), type=String(b.calculationType||''), percentage=b.percentage==null?null:Number(b.percentage), flatFee=b.flatFee==null?null:Number(b.flatFee), vendorId=b.vendorStoreId==null||b.vendorStoreId===''?null:Number(b.vendorStoreId), priority=Number(b.priority??100);
    if(!name||name.length>120||!['percentage','flat','tiered'].includes(type)||!Number.isInteger(priority)||priority<1||priority>100000)return res.status(400).json({error:'Provide a name, supported commission type, and valid priority.'});
    if(type==='percentage'&&(!Number.isFinite(percentage)||percentage<0||percentage>100))return res.status(400).json({error:'Percentage must be between 0 and 100.'});
    if(type==='flat'&&(!Number.isSafeInteger(flatFee)||flatFee<0))return res.status(400).json({error:'Flat fee must be a nonnegative whole KES amount.'});
    const tiers=Array.isArray(b.tiers)?b.tiers:[];
    if(type==='tiered'&&(!tiers.length||tiers.some(t=>!Number.isFinite(Number(t.upTo))||Number(t.upTo)<=0||!Number.isFinite(Number(t.percentage))||Number(t.percentage)<0||Number(t.percentage)>100)))return res.status(400).json({error:'Tiered rules require thresholds (upTo) and percentages between 0 and 100.'});
    if(vendorId!==null&&!Number.isSafeInteger(vendorId))return res.status(400).json({error:'Invalid vendor store.'});
    const rule=(await pool.query('INSERT INTO public.commission_rules(name,calculation_type,percentage,flat_fee,tiers,applies_to_vendor_id,priority,active) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,TRUE) RETURNING *',[name,type,percentage,flatFee,JSON.stringify(tiers),vendorId,priority])).rows[0];
    res.status(201).json(rule);
  }));
  router.patch('/admin/commissions/:id', auth, allow('super_admin'), wrap(async (req, res) => {
    const active = req.body?.active;
    if (typeof active !== 'boolean') return res.status(400).json({error:'Provide active as true or false.'});
    const rule=(await pool.query('UPDATE public.commission_rules SET active=$1 WHERE id=$2 RETURNING *',[active,req.params.id])).rows[0];
    if(!rule)return res.status(404).json({error:'Commission rule not found.'});
    res.json(rule);
  }));

  return router;
}

import express from 'express';
import crypto from 'node:crypto';

const router = express.Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getActor(req) {
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  const configured = process.env.ADMIN_TOKEN || '';
  if (!configured || supplied.length !== configured.length) return null;
  const a = Buffer.from(supplied);
  const b = Buffer.from(configured);
  return crypto.timingSafeEqual(a, b)
    ? { role: 'super_admin', id: null, email: 'admin-token' }
    : null;
}

function requireSuperAdmin(req, res, next) {
  const actor = getActor(req);
  if (!actor) return res.status(401).json({ error: 'Super Admin authorization required.' });
  req.marketplaceActor = actor;
  next();
}

// Vendor access remains fail-closed until account-bound authentication is installed.
// Never accept an email or vendor ID in a request as proof of vendor identity.
function requireVendorIdentity(req, res, next) {
  const supplied = Buffer.from((req.headers.authorization || '').replace(/^Bearer\\s+/i, ''));
  const configured = Buffer.from(process.env.VENDOR_ACCESS_TOKEN || '');
  if (!configured.length || supplied.length !== configured.length || !crypto.timingSafeEqual(supplied, configured)) {
    return res.status(401).json({ error: 'Vendor authorization required.' });
  }
  return res.status(501).json({
    error: 'Individual vendor sign-in is not configured. Vendor data and write actions are disabled until account-bound authentication is installed.'
  });
}
function amountInteger(value, label, min = 0) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min) {
    const err = new Error(`${label} must be a whole number greater than or equal to ${min}.`);
    err.status = 400;
    throw err;
  }
  return n;
}

export function createMarketplaceRouter({ pool }) {
  // Public vendor directory and published reviews only.
  router.get('/vendors', wrap(async (_req, res) => {
    const result = await pool.query(`
      SELECT v.id, v.store_name, v.slug, v.description, v.logo_url,
             COALESCE(AVG(r.rating) FILTER (WHERE r.status = 'published'), 0)::numeric(3,2) AS rating,
             COUNT(r.id) FILTER (WHERE r.status = 'published')::int AS review_count
      FROM public.vendors v
      JOIN public.marketplace_users u ON u.id = v.user_id
      LEFT JOIN public.vendor_reviews r ON r.vendor_id = v.id
      WHERE u.status = 'active' AND v.verification_status = 'approved'
      GROUP BY v.id
      ORDER BY v.store_name
    `);
    res.json(result.rows);
  }));

  router.get('/vendors/:slug', wrap(async (req, res) => {
    const result = await pool.query(`
      SELECT v.id, v.store_name, v.slug, v.description, v.logo_url,
             COALESCE(AVG(r.rating) FILTER (WHERE r.status = 'published'), 0)::numeric(3,2) AS rating,
             COUNT(r.id) FILTER (WHERE r.status = 'published')::int AS review_count
      FROM public.vendors v
      JOIN public.marketplace_users u ON u.id = v.user_id
      LEFT JOIN public.vendor_reviews r ON r.vendor_id = v.id
      WHERE v.slug = $1 AND u.status = 'active' AND v.verification_status = 'approved'
      GROUP BY v.id
    `, [req.params.slug]);
    if (!result.rowCount) return res.status(404).json({ error: 'Vendor store not found.' });
    res.json(result.rows[0]);
  }));

  router.get('/vendors/:slug/products', wrap(async (req, res) => {
    const result = await pool.query(`
      SELECT p.id,p.name,p.category,p.type,p.price,p.images,p.description,p.sizes,p.colors,
             p.stock,p.variants,p.image_gallery,v.store_name,v.slug AS vendor_slug
      FROM public.products p
      JOIN public.vendors v ON v.id = p.vendor_id
      JOIN public.marketplace_users u ON u.id = v.user_id
      WHERE v.slug = $1 AND u.status = 'active' AND v.verification_status = 'approved'
        AND p.active = TRUE AND p.archived_at IS NULL
      ORDER BY p.created_at DESC
    `, [req.params.slug]);
    res.json(result.rows.map(row => ({ ...row, price: Number(row.price), stock: Number(row.stock) })));
  }));

  // Public commission summary is not exposed; amounts and recipient details are private.
  router.get('/vendors/:slug/reviews', wrap(async (req, res) => {
    const result = await pool.query(`
      SELECT reviewer_name,rating,title,body,verified_purchase,created_at
      FROM public.vendor_reviews r JOIN public.vendors v ON v.id=r.vendor_id
      WHERE v.slug=$1 AND r.status='published'
      ORDER BY r.created_at DESC LIMIT 100
    `, [req.params.slug]);
    res.json(result.rows);
  }));

  // Public review form. Reviews submitted without order proof remain pending and are not public.
  router.post('/reviews', wrap(async (req, res) => {
    const b = req.body || {};
    const vendorId = Number(b.vendor_id);
    const productId = b.product_id == null ? null : Number(b.product_id);
    const rating = Number(b.rating);
    const reviewerName = String(b.reviewer_name || '').trim().slice(0, 120);
    const buyerEmail = String(b.buyer_email || '').trim().toLowerCase();
    const title = String(b.title || '').trim().slice(0, 160);
    const body = String(b.body || '').trim().slice(0, 3000);
    if (!Number.isSafeInteger(vendorId) || vendorId < 1 ||
        (productId !== null && (!Number.isSafeInteger(productId) || productId < 1)) ||
        !Number.isInteger(rating) || rating < 1 || rating > 5 ||
        reviewerName.length < 2 || !emailPattern.test(buyerEmail)) {
      return res.status(400).json({ error: 'Provide a name, valid email, and a rating from 1 to 5.' });
    }
    const result = await pool.query(`
      INSERT INTO public.vendor_reviews(vendor_id,product_id,buyer_email,reviewer_name,rating,title,body,status,verified_purchase)
      SELECT v.id, p.id, $3, $4, $5, $6, $7, 'pending', FALSE
      FROM public.vendors v
      LEFT JOIN public.products p ON p.id=$2 AND p.vendor_id=v.id
      WHERE v.id=$1 AND ($2::int IS NULL OR p.id IS NOT NULL)
      RETURNING id,vendor_id,product_id,rating,status,created_at
    `, [vendorId, productId, buyerEmail, reviewerName, rating, title, body]);
    if (!result.rowCount) return res.status(404).json({ error: 'Vendor or product not found.' });
    res.status(201).json({ ...result.rows[0], message: 'Review submitted for moderation.' });
  }));

  // Super Admin reporting and vendor onboarding.
  router.get('/admin/vendors', requireSuperAdmin, wrap(async (_req, res) => {
    const result = await pool.query(`
      SELECT v.id,v.store_name,v.slug,v.description,v.contact_email,v.contact_phone,
             v.verification_status,u.display_name,u.email,u.role,u.status,u.created_at
      FROM public.vendors v JOIN public.marketplace_users u ON u.id=v.user_id
      ORDER BY v.created_at DESC
    `);
    res.json(result.rows);
  }));

  router.post('/admin/vendors', requireSuperAdmin, wrap(async (req, res) => {
    const b=req.body||{};
    const displayName=String(b.display_name||'').trim().slice(0,120);
    const email=String(b.email||'').trim().toLowerCase();
    const storeName=String(b.store_name||'').trim().slice(0,160);
    const description=String(b.description||'').trim().slice(0,3000);
    const phone=String(b.phone||'').trim().slice(0,40);
    if(displayName.length<2||!emailPattern.test(email)||storeName.length<2)
      return res.status(400).json({error:'Name, valid email and store name are required.'});
    const slug=storeName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
    if(!slug) return res.status(400).json({error:'Choose a store name that can form a URL slug.'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const u=await client.query(`
        INSERT INTO public.marketplace_users(email,display_name,role,status)
        VALUES($1,$2,'vendor','pending') RETURNING id,email,display_name,role,status
      `,[email,displayName]);
      const v=await client.query(`
        INSERT INTO public.vendors(user_id,store_name,slug,description,contact_email,contact_phone,verification_status)
        VALUES($1,$2,$3,$4,$5,$6,'pending')
        RETURNING id,store_name,slug,verification_status
      `,[u.rows[0].id,storeName,slug,description,email,phone]);
      await client.query(`
        INSERT INTO public.marketplace_audit_log(actor_role,action,entity_type,entity_id,details)
        VALUES('super_admin','vendor_created','vendor',$1,$2::jsonb)
      `,[String(v.rows[0].id),JSON.stringify({email,slug})]);
      await client.query('COMMIT');
      res.status(201).json({user:u.rows[0],vendor:v.rows[0],message:'Vendor profile created in pending status. Vendor login is not enabled until verified authentication is configured.'});
    }catch(error){await client.query('ROLLBACK');if(error.code==='23505')return res.status(409).json({error:'That email or store slug is already in use.'});throw error;}
    finally{client.release();}
  }));

  router.patch('/admin/vendors/:id/status',requireSuperAdmin,wrap(async(req,res)=>{
    const status=String(req.body?.status||'');
    if(!['pending','active','suspended','rejected'].includes(status))return res.status(400).json({error:'Invalid vendor account status.'});
    const result=await pool.query(`
      UPDATE public.marketplace_users u SET status=$1,updated_at=NOW()
      FROM public.vendors v WHERE v.user_id=u.id AND v.id=$2
      RETURNING v.id,v.store_name,v.slug,v.verification_status,u.status
    `,[status,req.params.id]);
    if(!result.rowCount)return res.status(404).json({error:'Vendor not found.'});
    res.json(result.rows[0]);
  }));

  router.patch('/admin/vendors/:id/verification',requireSuperAdmin,wrap(async(req,res)=>{
    const status=String(req.body?.status||'');
    if(!['pending','approved','rejected'].includes(status))return res.status(400).json({error:'Invalid verification status.'});
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const result=await c.query(\`
        UPDATE public.vendors SET verification_status=$1,updated_at=NOW()
        WHERE id=$2 RETURNING id,store_name,slug,verification_status
      \`,[status,req.params.id]);
      if(!result.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'Vendor not found.'})}
      await c.query(\`
        INSERT INTO public.marketplace_audit_log(actor_role,action,entity_type,entity_id,details)
        VALUES('super_admin','vendor_verification_changed','vendor',$1,$2::jsonb)
      \`,[String(req.params.id),JSON.stringify({status})]);
      await c.query('COMMIT');
      delete result.rows[0].user_id;
      res.json(result.rows[0]);
    }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
  }));

  router.get('/admin/commission-rules',requireSuperAdmin,wrap(async(_req,res)=>{
    const result=await pool.query('SELECT * FROM public.commission_rules ORDER BY priority,id');
    res.json(result.rows);
  }));

  router.post('/admin/commission-rules',requireSuperAdmin,wrap(async(req,res)=>{
    const b=req.body||{},name=String(b.name||'').trim().slice(0,160),scope=String(b.scope||'platform');
    const feeType=String(b.fee_type||'percentage'),percentage=b.percentage==null?null:Number(b.percentage);
    const flatFee=b.flat_fee==null?null:Number(b.flat_fee),priority=Number(b.priority??100);
    const tiers=Array.isArray(b.tiers)?b.tiers:[];
    if(!name||!['platform','vendor','category'].includes(scope)||!['percentage','flat','tiered'].includes(feeType)||
      (percentage!==null&&(!Number.isFinite(percentage)||percentage<0||percentage>100))||
      (flatFee!==null&&(!Number.isSafeInteger(flatFee)||flatFee<0))||
      !Number.isSafeInteger(priority)||priority<0||
      (scope==='vendor'&&!Number.isSafeInteger(Number(b.vendor_id)))||
      (scope==='category'&&!String(b.category||'').trim())||
      (feeType==='tiered'&&(!tiers.length||tiers.some(t=>!Number.isFinite(Number(t.up_to))||Number(t.up_to)<=0||!Number.isFinite(Number(t.percentage))||Number(t.percentage)<0||Number(t.percentage)>100)))) {
      return res.status(400).json({error:'Invalid commission rule. Check name, scope, fee type, rate, and tiers.'});
    }
    const result=await pool.query(\`
      INSERT INTO public.commission_rules(name,scope,vendor_id,category,fee_type,percentage,flat_fee,tiers,priority,active,starts_at,ends_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12) RETURNING *
    \`,[name,scope,scope==='vendor'?Number(b.vendor_id):null,scope==='category'?String(b.category).trim():null,feeType,
      feeType==='percentage'?percentage:null,feeType==='flat'?flatFee:null,JSON.stringify(tiers),priority,b.active!==false,b.starts_at||null,b.ends_at||null]);
    res.status(201).json(result.rows[0]);
  }));

  router.patch('/admin/commission-rules/:id',requireSuperAdmin,wrap(async(req,res)=>{
    const active=req.body?.active;
    if(typeof active!=='boolean')return res.status(400).json({error:'Provide active as true or false.'});
    const result=await pool.query('UPDATE public.commission_rules SET active=$1 WHERE id=$2 RETURNING *',[active,req.params.id]);
    if(!result.rowCount)return res.status(404).json({error:'Commission rule not found.'});
    res.json(result.rows[0]);
  }));

  router.get('/admin/reviews',requireSuperAdmin,wrap(async(_req,res)=>{
    const result=await pool.query(\`
      SELECT r.*,v.store_name FROM public.vendor_reviews r JOIN public.vendors v ON v.id=r.vendor_id
      ORDER BY r.created_at DESC LIMIT 300
    \`);
    res.json(result.rows);
  }));

  router.patch('/admin/reviews/:id/status',requireSuperAdmin,wrap(async(req,res)=>{
    const status=String(req.body?.status||'');
    if(!['published','hidden','rejected','pending'].includes(status))return res.status(400).json({error:'Invalid review status.'});
    const result=await pool.query('UPDATE public.vendor_reviews SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',[status,req.params.id]);
    if(!result.rowCount)return res.status(404).json({error:'Review not found.'});
    res.json(result.rows[0]);
  }));

  router.get('/admin/payouts',requireSuperAdmin,wrap(async(_req,res)=>{
    const result=await pool.query(\`
      SELECT p.*,v.store_name,v.contact_email FROM public.vendor_payouts p
      JOIN public.vendors v ON v.id=p.vendor_id ORDER BY p.requested_at DESC LIMIT 300
    \`);
    res.json(result.rows);
  }));

  router.patch('/admin/payouts/:id/status',requireSuperAdmin,wrap(async(req,res)=>{
    const status=String(req.body?.status||''),allowed=['approved','processing','paid','failed','cancelled'];
    if(!allowed.includes(status))return res.status(400).json({error:'Invalid payout status.'});
    const result=await pool.query(\`
      UPDATE public.vendor_payouts SET status=$1,processed_at=CASE WHEN $1 IN ('paid','failed','cancelled') THEN NOW() ELSE processed_at END
      WHERE id=$2 AND status IN ('requested','approved','processing') RETURNING *
    \`,[status,req.params.id]);
    if(!result.rowCount)return res.status(409).json({error:'Payout not found or is already in a final state.'});
    res.json(result.rows[0]);
  }));

  // Vendor application intake. Applicants remain pending; this does not grant access.
  router.post('/vendor-applications',wrap(async(req,res)=>{
    const b=req.body||{};
    const name=String(b.name||'').trim().slice(0,120),email=String(b.email||'').trim().toLowerCase();
    const store=String(b.store_name||'').trim().slice(0,160),phone=String(b.phone||'').trim().slice(0,40);
    const description=String(b.description||'').trim().slice(0,3000);
    if(name.length<2||!emailPattern.test(email)||store.length<2)return res.status(400).json({error:'Name, valid email and store name are required.'});
    try {
      const r=await pool.query(\`
        INSERT INTO public.vendor_applications(name,email,store_name,phone,description)
        VALUES($1,$2,$3,$4,$5) RETURNING id,status,created_at
      \`,[name,email,store,phone,description]);
      res.status(201).json({...r.rows[0],message:'Application received. The team will review it before seller access is enabled.'});
    } catch(error) {
      if(error.code==='23505') return res.status(409).json({error:'An application for this email is already on file.'});
      throw error;
    }
  }));

  router.get('/admin/vendor-applications',requireSuperAdmin,wrap(async(_req,res)=>{
    const r=await pool.query('SELECT * FROM public.vendor_applications ORDER BY created_at DESC LIMIT 500');
    res.json(r.rows);
  }));

  router.patch('/admin/vendor-applications/:id',requireSuperAdmin,wrap(async(req,res)=>{
    const status=String(req.body?.status||'');
    if(!['pending','approved','rejected'].includes(status))return res.status(400).json({error:'Invalid application status.'});
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const app=await c.query('UPDATE public.vendor_applications SET status=$1,reviewed_at=NOW() WHERE id=$2 RETURNING *',[status,req.params.id]);
      if(!app.rowCount){await c.query('ROLLBACK');return res.status(404).json({error:'Vendor application not found.'})}
      if(status==='approved'){
        const a=app.rows[0];
        const base=a.store_name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
        const slug=base+'-'+a.id;
        const u=await c.query(\`
          INSERT INTO public.marketplace_users(email,display_name,role,status)
          VALUES($1,$2,'vendor','pending')
          ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name
          RETURNING id
        \`,[a.email,a.name]);
        const vendor=await c.query(\`
          INSERT INTO public.vendors(user_id,store_name,slug,description,contact_email,contact_phone,verification_status)
          VALUES($1,$2,$3,$4,$5,$6,'pending')
          ON CONFLICT(user_id) DO UPDATE SET store_name=EXCLUDED.store_name
          RETURNING id,store_name,slug,verification_status
        \`,[u.rows[0].id,a.store_name,slug,a.description,a.email,a.phone]);
        await c.query("INSERT INTO public.marketplace_audit_log(actor_role,action,entity_type,entity_id,details) VALUES('super_admin','application_approved','vendor',$1,$2::jsonb)",[String(vendor.rows[0].id),JSON.stringify({application_id:a.id,email:a.email})]);
      }
      await c.query('COMMIT');
      res.json(app.rows[0]);
    }catch(error){await c.query('ROLLBACK');if(error.code==='23505')return res.status(409).json({error:'A vendor or store with this email/slug already exists.'});throw error}finally{c.release()}
  }));

  router.get('/admin/earnings',requireSuperAdmin,wrap(async(_req,res)=>{
    const result=await pool.query(`
      SELECT e.*,o.reference AS order_reference,v.store_name
      FROM public.vendor_earnings e
      JOIN public.orders o ON o.id=e.order_id
      JOIN public.vendors v ON v.id=e.vendor_id
      ORDER BY e.created_at DESC LIMIT 500
    `);
    res.json(result.rows.map(row=>({...row,gross_amount:Number(row.gross_amount),commission_amount:Number(row.commission_amount),net_amount:Number(row.net_amount)})));
  }));

  router.get('/admin/summary',requireSuperAdmin,wrap(async(_req,res)=>{
    const [vendors,products,orders,earnings,payouts,reviews]=await Promise.all([
      pool.query("SELECT COUNT(*)::int AS n FROM public.vendors"),
      pool.query("SELECT COUNT(*)::int AS n FROM public.products WHERE vendor_id IS NOT NULL"),
      pool.query("SELECT COUNT(DISTINCT order_id)::int AS n FROM public.vendor_order_items"),
      pool.query("SELECT COALESCE(SUM(net_amount),0)::bigint AS n FROM public.vendor_earnings"),
      pool.query("SELECT COUNT(*)::int AS n FROM public.vendor_payouts WHERE status='requested'"),
      pool.query("SELECT COUNT(*)::int AS n FROM public.vendor_reviews WHERE status='pending'")
    ]);
    res.json({vendors:vendors.rows[0].n,vendorProducts:products.rows[0].n,vendorOrders:orders.rows[0].n,recordedVendorNet:Number(earnings.rows[0].n),pendingPayouts:payouts.rows[0].n,pendingReviews:reviews.rows[0].n});
  }));

  router.get('/vendor/summary', requireVendorIdentity, wrap(async(req,res)=>{
    const vendorId=req.vendor.id;
    const [products,orders,sales,fees,net,available]=await Promise.all([
      pool.query('SELECT COUNT(*)::int AS n FROM public.products WHERE vendor_id=$1 AND archived_at IS NULL',[vendorId]),
      pool.query('SELECT COUNT(DISTINCT order_id)::int AS n FROM public.vendor_order_items WHERE vendor_id=$1',[vendorId]),
      pool.query('SELECT COALESCE(SUM(gross_amount),0)::bigint AS n FROM public.vendor_earnings WHERE vendor_id=$1',[vendorId]),
      pool.query('SELECT COALESCE(SUM(commission_amount),0)::bigint AS n FROM public.vendor_earnings WHERE vendor_id=$1',[vendorId]),
      pool.query("SELECT COALESCE(SUM(net_amount),0)::bigint AS n FROM public.vendor_earnings WHERE vendor_id=$1 AND status IN ('available','payout_pending','paid')",[vendorId]),
      pool.query("SELECT COALESCE(SUM(net_amount),0)::bigint AS n FROM public.vendor_earnings WHERE vendor_id=$1 AND status='available'",[vendorId])
    ]);
    res.json({products:products.rows[0].n,orders:orders.rows[0].n,gross_sales:Number(sales.rows[0].n),commission:Number(fees.rows[0].n),net_earnings:Number(net.rows[0].n),available_balance:Number(available.rows[0].n)});
  }));

  router.get('/vendor/products', requireVendorIdentity, wrap(async(req,res)=>{
    const rows=await pool.query('SELECT id,name,category,type,price,images,image_gallery,description,sizes,colors,stock,active,discount_percent,variants,created_at FROM public.products WHERE vendor_id=$1 ORDER BY created_at DESC',[req.vendor.id]);
    res.json(rows.rows.map(row=>({...row,price:Number(row.price),stock:Number(row.stock),discount_percent:Number(row.discount_percent||0)})));
  }));

  router.post('/vendor/products', requireVendorIdentity, wrap(async(req,res)=>{
    const b=req.body||{},name=String(b.name||'').trim().slice(0,180),category=String(b.category||'').trim();
    const type=String(b.type||'Clothing').trim().slice(0,80),description=String(b.description||'').trim().slice(0,5000);
    const price=amountInteger(b.price,'Price'),stock=amountInteger(b.stock??0,'Stock');
    const sizes=Array.isArray(b.sizes)?b.sizes.map(x=>String(x).trim()).filter(Boolean):[];
    const colors=Array.isArray(b.colors)?b.colors.map(x=>String(x).trim()).filter(Boolean):[];
    const gallery=Array.isArray(b.image_gallery)?b.image_gallery:[];
    if(!name||!category||!gallery.length||gallery.length>12||gallery.some(x=>typeof x!=='string'||!/^https?:\/\//i.test(x)))
      return res.status(400).json({error:'Product name, category, and 1–12 valid HTTP(S) image URLs are required.'});
    if(!sizes.length||!colors.length)return res.status(400).json({error:'At least one size and one colour are required.'});
    const allowedCategories=['STYLE WOMAN','STYLE MAMA','STYLE KIDS','SETS & GIFTS'];
    if(!allowedCategories.includes(category))return res.status(400).json({error:'Choose a valid STYLE product category.'});
    const result=await pool.query(`
      INSERT INTO public.products(name,category,type,price,images,description,sizes,colors,stock,active,vendor_id,image_gallery)
      SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,TRUE,v.id,$10::jsonb
      FROM public.vendors v JOIN public.marketplace_users u ON u.id=v.user_id
      WHERE v.id=$11 AND u.status='active' AND v.verification_status='approved'
      RETURNING id,name,category,type,price,images,description,sizes,colors,stock,active,vendor_id,image_gallery
    `,[name,category,type,price,gallery[0],description,JSON.stringify(sizes),JSON.stringify(colors),stock,JSON.stringify(gallery),req.vendor.id]);
    if(!result.rowCount)return res.status(403).json({error:'Your vendor store must be approved before listing products.'});
    res.status(201).json({...result.rows[0],price:Number(result.rows[0].price),stock:Number(result.rows[0].stock)});
  }));

  router.patch('/vendor/products/:id', requireVendorIdentity, wrap(async(req,res)=>{
    const b=req.body||{};
    const current=await pool.query('SELECT * FROM public.products WHERE id=$1 AND vendor_id=$2',[req.params.id,req.vendor.id]);
    if(!current.rowCount)return res.status(404).json({error:'Product not found in your store.'});
    const old=current.rows[0];
    const name=String(b.name??old.name).trim().slice(0,180),category=String(b.category??old.category).trim();
    const price=amountInteger(b.price??old.price,'Price'),stock=amountInteger(b.stock??old.stock,'Stock');
    const gallery=b.image_gallery??old.image_gallery??[];
    if(!name||!['STYLE WOMAN','STYLE MAMA','STYLE KIDS','SETS & GIFTS'].includes(category)||!Array.isArray(gallery)||gallery.length>12||gallery.some(x=>typeof x!=='string'||!/^https?:\/\//i.test(x)))
      return res.status(400).json({error:'Invalid product details or image URLs.'});
    const sizes=b.sizes??old.sizes,colors=b.colors??old.colors,variants=b.variants??old.variants??[];
    const active=typeof b.active==='boolean'?b.active:old.active;
    const description=String(b.description??old.description??'').slice(0,5000);
    const discount=Number(b.discount_percent??old.discount_percent??0);
    if(!Number.isFinite(discount)||discount<0||discount>100)return res.status(400).json({error:'Discount must be between 0 and 100.'});
    const result=await pool.query(`
      UPDATE public.products SET name=$1,category=$2,type=$3,price=$4,images=$5,description=$6,
        sizes=$7::jsonb,colors=$8::jsonb,stock=$9,active=$10,discount_percent=$11,
        variants=$12::jsonb,image_gallery=$13::jsonb
      WHERE id=$14 AND vendor_id=$15 RETURNING *
    `,[name,category,String(b.type??old.type),price,gallery[0]||'',description,JSON.stringify(sizes),JSON.stringify(colors),stock,active,discount,JSON.stringify(variants),JSON.stringify(gallery),req.params.id,req.vendor.id]);
    res.json({...result.rows[0],price:Number(result.rows[0].price),stock:Number(result.rows[0].stock)});
  }));

  router.get('/vendor/orders', requireVendorIdentity, wrap(async(req,res)=>{
    const rows=await pool.query(`
      SELECT vi.id, o.reference AS order_reference, o.payment_status, vi.product_id,vi.product_name,
             vi.quantity,vi.unit_price,vi.line_total,vi.commission_amount,vi.vendor_net_amount,
             vi.fulfilment_status,o.created_at
      FROM public.vendor_order_items vi JOIN public.orders o ON o.id=vi.order_id
      WHERE vi.vendor_id=$1 ORDER BY o.created_at DESC LIMIT 500
    `,[req.vendor.id]);
    res.json(rows.rows.map(row=>({...row,unit_price:Number(row.unit_price),line_total:Number(row.line_total),commission_amount:Number(row.commission_amount),vendor_net_amount:Number(row.vendor_net_amount)})));
  }));

  router.patch('/vendor/orders/:id', requireVendorIdentity, wrap(async(req,res)=>{
    const status=String(req.body?.fulfilment_status||'');
    if(!['processing','dispatched','delivered','cancelled'].includes(status))return res.status(400).json({error:'Invalid fulfilment status.'});
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const found=await client.query(`
        SELECT vi.*,o.payment_status FROM public.vendor_order_items vi JOIN public.orders o ON o.id=vi.order_id
        WHERE vi.id=$1 AND vi.vendor_id=$2 FOR UPDATE
      `,[req.params.id,req.vendor.id]);
      if(!found.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Order line not found in your store.'})}
      if(found.rows[0].payment_status!=='paid'&&['processing','dispatched','delivered'].includes(status)){await client.query('ROLLBACK');return res.status(409).json({error:'Unpaid orders cannot be fulfilled.'})}
      const transitions={awaiting_payment:['awaiting_payment','cancelled'],processing:['processing','dispatched','cancelled'],dispatched:['dispatched','delivered'],delivered:['delivered'],cancelled:['cancelled'],refunded:['refunded']};
      if(!(transitions[found.rows[0].fulfilment_status]||[]).includes(status)){await client.query('ROLLBACK');return res.status(409).json({error:'Invalid fulfilment status transition.'})}
      const updated=await client.query('UPDATE public.vendor_order_items SET fulfilment_status=$1 WHERE id=$2 RETURNING *',[status,req.params.id]);
      await client.query('COMMIT');res.json(updated.rows[0]);
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  }));

  router.get('/vendor/earnings', requireVendorIdentity, wrap(async(req,res)=>{
    const rows=await pool.query(`
      SELECT e.*,o.reference AS order_reference FROM public.vendor_earnings e
      JOIN public.orders o ON o.id=e.order_id WHERE e.vendor_id=$1 ORDER BY e.created_at DESC LIMIT 500
    `,[req.vendor.id]);
    res.json(rows.rows.map(row=>({...row,gross_amount:Number(row.gross_amount),commission_amount:Number(row.commission_amount),net_amount:Number(row.net_amount)})));
  }));

  router.get('/vendor/payouts', requireVendorIdentity, wrap(async(req,res)=>{
    const rows=await pool.query('SELECT id,amount,currency,status,provider,provider_reference,requested_at,processed_at FROM public.vendor_payouts WHERE vendor_id=$1 ORDER BY requested_at DESC LIMIT 200',[req.vendor.id]);
    res.json(rows.rows.map(row=>({...row,amount:Number(row.amount)})));
  }));

  router.post('/vendor/payouts', requireVendorIdentity, wrap(async(req,res)=>{
    amountInteger(req.body?.amount,'Payout amount',1);
    return res.status(503).json({error:'Payout provider is not configured. No funds were transferred.'});
  }));

  return router;
}

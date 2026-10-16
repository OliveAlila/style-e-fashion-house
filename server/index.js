import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createAdminRouter } from './admin.js';
import { createMarketplaceRouter } from './marketplace.js';
const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 4000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
app.use(helmet());
const allowedOrigins = [
  process.env.CLIENT_URL,
  'https://style-e-fashion-house-v8va-lime.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://172.20.48.1:5173',
].filter(Boolean);

// Allow this project's Vercel production and deployment URLs. Vercel creates
// a different origin for preview/deployment URLs, so exact-only matching can
// break admin requests when a deployment URL changes.
const isAllowedOrigin = (origin) =>
  !origin ||
  allowedOrigins.includes(origin) ||
  /^https:\/\/style-e-fashion-house(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Capture raw bytes for Paystack's HMAC signature check.
app.use(express.json({ limit:'8mb', verify:(req,res,buf)=>{req.rawBody=Buffer.from(buf);} }));

const seed = [
 {name:'The Sunday Linen Set',category:'STYLE WOMAN',type:'Co-ord Set',price:4800,images:'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=85',description:'An easy, elevated set for slow mornings and city afternoons.',sizes:['S','M','L','XL'],colors:['Sand','Black'],stock:12},
 {name:'The Everyday Midi',category:'STYLE WOMAN',type:'Dress',price:3900,images:'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=85',description:'A timeless silhouette made for everyday plans.',sizes:['S','M','L'],colors:['Cream','Olive'],stock:8},
 {name:'Soft Knit Nursing Top',category:'STYLE MAMA',type:'Tops',price:2600,images:'https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?auto=format&fit=crop&w=900&q=85',description:'A soft, comfortable wardrobe staple for busy days.',sizes:['S','M','L','XL'],colors:['Oat','Black'],stock:10},
 {name:'Little Daydream Romper',category:'STYLE KIDS',type:'Kidswear',price:1850,images:'https://images.unsplash.com/photo-1519238263530-99f7f0a4c8a6?auto=format&fit=crop&w=900&q=85',description:'A sweet and practical piece for little adventures.',sizes:['0-6M','6-12M','1-2Y','3-4Y'],colors:['Butter','Sage'],stock:15},
 {name:'Mama & Mini Matching Set',category:'SETS & GIFTS',type:'Matching Set',price:6200,images:'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=900&q=85',description:'A coordinated look made for memories together.',sizes:['S/M','L/XL'],colors:['Cream','Terracotta'],stock:5},
 {name:'The City Tailored Trouser',category:'STYLE WOMAN',type:'Trousers',price:3400,images:'https://images.unsplash.com/photo-1506629905607-d9b9b3e1e0b5?auto=format&fit=crop&w=900&q=85',description:'Clean lines and a comfortable fit for work and beyond.',sizes:['S','M','L','XL'],colors:['Charcoal','Sand'],stock:7},
 {name:'Weekend Cotton Dress',category:'STYLE MAMA',type:'Dress',price:3200,images:'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=85',description:'Breathable cotton comfort with a polished finish.',sizes:['S','M','L'],colors:['Clay','Black'],stock:9},
 {name:'Little Occasion Set',category:'STYLE KIDS',type:'Occasion Wear',price:2900,images:'https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=900&q=85',description:'A special little look for family celebrations.',sizes:['1-2Y','3-4Y','5-6Y'],colors:['Ivory','Blue'],stock:6}
];
async function init(){
 await pool.query(`CREATE TABLE IF NOT EXISTS products(id SERIAL PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,type TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),images TEXT NOT NULL,description TEXT NOT NULL,sizes JSONB NOT NULL,colors JSONB NOT NULL,stock INTEGER NOT NULL DEFAULT 0,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT NOW())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS orders(id BIGSERIAL PRIMARY KEY,reference TEXT UNIQUE NOT NULL,customer_name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL,town TEXT NOT NULL,county TEXT NOT NULL,delivery_method TEXT NOT NULL,items JSONB NOT NULL,subtotal INTEGER NOT NULL,delivery_fee INTEGER NOT NULL,total INTEGER NOT NULL,currency TEXT NOT NULL DEFAULT 'KES',payment_status TEXT NOT NULL DEFAULT 'pending',order_status TEXT NOT NULL DEFAULT 'pending_payment',created_at TIMESTAMPTZ DEFAULT NOW(),paid_at TIMESTAMPTZ)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS payment_events(id BIGSERIAL PRIMARY KEY,event_id TEXT UNIQUE NOT NULL,reference TEXT NOT NULL,event_type TEXT NOT NULL,received_at TIMESTAMPTZ DEFAULT NOW())`);
 // Apply additive admin schema changes before the API starts accepting requests.
 // This keeps existing product/order data and makes new admin tables available.
 const adminMigration = await readFile(new URL('./migrations/001_admin_features.sql', import.meta.url), 'utf8');
 await pool.query(adminMigration);
 console.log('Admin database migration applied.');
 const marketplaceMigration = await readFile(new URL('./migrations/002_multi_vendor_foundation.sql', import.meta.url), 'utf8');
 await pool.query(marketplaceMigration);
 console.log('Multi-vendor marketplace migration applied.');
 await pool.query(`ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'STYLE E-Fashion House'`);
 await pool.query(`CREATE TABLE IF NOT EXISTS public.product_reviews (id BIGSERIAL PRIMARY KEY, product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE, order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT, buyer_user_id BIGINT NOT NULL REFERENCES public.marketplace_users(id) ON DELETE RESTRICT, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), body TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(product_id,order_id))`);
 const count=(await pool.query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n;
 if(!count) for(const p of seed) await pool.query('INSERT INTO products(name,category,type,price,images,description,sizes,colors,stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[p.name,p.category,p.type,p.price,p.images,p.description,JSON.stringify(p.sizes),JSON.stringify(p.colors),p.stock]);
}
const safeProduct = r => ({...r, sizes:r.sizes, colors:r.colors, price:Number(r.price), stock:Number(r.stock)});
app.get('/api/health',(req,res)=>res.json({ok:true,service:'STYLE E-Fashion API'}));
app.get('/api/promotions',async(req,res,next)=>{try{const result=await pool.query("SELECT value FROM public.store_settings WHERE key='promotion'");res.json(result.rows[0]?.value||{active:false,title:'STYLE SALE',subtitle:'A little something lovely, for less.',discount_percent:0,starts_at:null,ends_at:null})}catch(error){next(error)}});
app.get('/api/products',async(req,res,next)=>{try{const {category,search}=req.query;const vals=[];let where='p.active=TRUE';if(category&&category!=='All'){vals.push(category);where+=' AND p.category=$'+vals.length;}if(search){vals.push('%'+String(search).slice(0,80)+'%');where+=' AND (p.name ILIKE $'+vals.length+' OR p.description ILIKE $'+vals.length+')';}const r=await pool.query(`SELECT p.*,COALESCE(NULLIF(s.store_name,''),NULLIF(p.brand,''),'STYLE E-Fashion House') AS brand,COALESCE(rv.rating,0)::numeric AS rating,COALESCE(rv.rating_count,0)::int AS rating_count FROM public.products p LEFT JOIN public.vendor_stores s ON s.id=p.vendor_store_id LEFT JOIN (SELECT product_id,ROUND(AVG(rating)::numeric,1) AS rating,COUNT(*) AS rating_count FROM public.product_reviews GROUP BY product_id) rv ON rv.product_id=p.id WHERE ${where} ORDER BY p.id`,vals);res.json(r.rows.map(safeProduct));}catch(e){next(e)}});
app.get('/api/products/:id',async(req,res,next)=>{try{const r=await pool.query(`SELECT p.*,COALESCE(NULLIF(s.store_name,''),NULLIF(p.brand,''),'STYLE E-Fashion House') AS brand,COALESCE(rv.rating,0)::numeric AS rating,COALESCE(rv.rating_count,0)::int AS rating_count FROM products p LEFT JOIN public.vendor_stores s ON s.id=p.vendor_store_id LEFT JOIN (SELECT product_id,ROUND(AVG(rating)::numeric,1) rating,COUNT(*) rating_count FROM public.product_reviews GROUP BY product_id) rv ON rv.product_id=p.id WHERE p.id=$1 AND p.active=TRUE`,[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Product not found'});res.json(safeProduct(r.rows[0]));}catch(e){next(e)}});
app.get('/api/products/:id/reviews',async(req,res,next)=>{try{const r=await pool.query(`SELECT pr.rating,pr.body,pr.created_at,u.full_name AS buyer_name FROM public.product_reviews pr JOIN public.marketplace_users u ON u.id=pr.buyer_user_id WHERE pr.product_id=$1 ORDER BY pr.created_at DESC LIMIT 100`,[req.params.id]);res.json(r.rows)}catch(e){next(e)}});
function admin(req,res,next){const supplied=Buffer.from((req.headers.authorization||'').replace(/^Bearer\s+/i,''));const configured=Buffer.from(process.env.ADMIN_TOKEN||'');if(!configured.length||supplied.length!==configured.length||!crypto.timingSafeEqual(supplied,configured))return res.status(401).json({error:'Admin authorization required'});next();}
app.use('/api/marketplace', createMarketplaceRouter({ pool, admin }));
app.use('/api/admin', createAdminRouter({ pool, admin, paystackSecret: process.env.PAYSTACK_SECRET_KEY }));
app.get('/api/admin/orders',admin,async(req,res,next)=>{try{const r=await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200');res.json(r.rows)}catch(e){next(e)}});
app.patch('/api/admin/orders/:id',admin,async(req,res,next)=>{try{const allowed=['processing','dispatched','delivered','cancelled','refunded'];if(!allowed.includes(req.body.order_status))return res.status(400).json({error:'Invalid order status'});const r=await pool.query('UPDATE orders SET order_status=$1 WHERE id=$2 RETURNING *',[req.body.order_status,req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Order not found'});res.json(r.rows[0])}catch(e){next(e)}});
app.post('/api/admin/products',admin,async(req,res,next)=>{try{const p=req.body;if(!p.name||!p.category||!Number.isInteger(Number(p.price))||Number(p.price)<0)return res.status(400).json({error:'Name, category and valid KES price are required'});const r=await pool.query('INSERT INTO products(name,category,type,price,images,description,sizes,colors,stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[p.name,p.category,p.type||'Clothing',Number(p.price),p.images||'',p.description||'',JSON.stringify(p.sizes||[]),JSON.stringify(p.colors||[]),Math.max(0,Number(p.stock)||0)]);res.status(201).json(safeProduct(r.rows[0]))}catch(e){next(e)}});
app.patch('/api/admin/products/:id', admin, async (req, res, next) => {
  try {
    const { images } = req.body || {};

    if (typeof images !== 'string' || !images.trim()) {
      return res.status(400).json({
        error: 'A valid image path is required.'
      });
    }

    const result = await pool.query(
      'UPDATE products SET images = $1 WHERE id = $2 RETURNING *',
      [images.trim(), req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(safeProduct(result.rows[0]));
  } catch (error) {
    next(error);
  }
});
const deliveryFees={standard:250,express:450};
app.post('/api/checkout',async(req,res,next)=>{try{
 const {customer,items,deliveryMethod='standard'}=req.body||{};
 if(!customer?.name||!/^\S+@\S+\.\S+$/.test(customer.email||'')||!customer.phone||!customer.address||!customer.town||!customer.county)return res.status(400).json({error:'Complete all delivery and contact fields with a valid email.'});
 if(!Array.isArray(items)||!items.length||items.length>30)return res.status(400).json({error:'Your cart is empty or too large.'});
 if(!deliveryFees[deliveryMethod])return res.status(400).json({error:'Invalid delivery method.'});
 const ids=[...new Set(items.map(i=>Number(i.productId)))];if(ids.some(i=>!Number.isInteger(i)||i<1))return res.status(400).json({error:'Invalid product in cart.'});
 const products=(await pool.query('SELECT * FROM products WHERE id=ANY($1::int[]) AND active=TRUE', [ids])).rows;const byId=new Map(products.map(p=>[p.id,p]));
 const lines=items.map(i=>{const p=byId.get(Number(i.productId));const qty=Number(i.quantity);if(!p||!Number.isInteger(qty)||qty<1||qty>10)throw new Error('A product or quantity in your cart is invalid.');if(p.stock<qty)throw new Error(`${p.name} does not have enough stock.`);const size=String(i.size||'');const color=String(i.color||'');if(!p.sizes.includes(size)||!p.colors.includes(color))throw new Error(`Choose a valid size and colour for ${p.name}.`);return {productId:p.id,name:p.name,unitPrice:Number(p.price),quantity:qty,size,color,vendorStoreId:p.vendor_store_id == null ? null : Number(p.vendor_store_id),fulfilment:'stock-check-required',lineTotal:Number(p.price)*qty};});
 const subtotal=lines.reduce((s,i)=>s+i.lineTotal,0),fee=deliveryFees[deliveryMethod],total=subtotal+fee;
 const reference='STYLE-'+crypto.randomBytes(10).toString('hex').toUpperCase();
 const order=(await pool.query(`INSERT INTO orders(reference,customer_name,email,phone,address,town,county,delivery_method,items,subtotal,delivery_fee,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,reference,total,payment_status`,[reference,String(customer.name).slice(0,120),customer.email, String(customer.phone).slice(0,40),String(customer.address).slice(0,250),String(customer.town).slice(0,100),String(customer.county).slice(0,100),deliveryMethod,JSON.stringify(lines),subtotal,fee,total])).rows[0];
 // Snapshot each vendor's earnings against the order. Products without a vendor remain platform-owned.
 for (const line of lines.filter(item => item.vendorStoreId !== null)) {
   const rule = (await pool.query(
     "SELECT * FROM public.commission_rules WHERE active=TRUE AND (applies_to_vendor_id=$1 OR applies_to_vendor_id IS NULL) AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>=NOW()) ORDER BY (applies_to_vendor_id IS NOT NULL) DESC, priority ASC, id DESC LIMIT 1",
     [line.vendorStoreId]
   )).rows[0];
   let commission = 0;
   if (rule?.calculation_type === 'percentage') commission = Math.round(line.lineTotal * Number(rule.percentage) / 100);
   else if (rule?.calculation_type === 'flat') commission = Number(rule.flat_fee);
   else if (rule?.calculation_type === 'tiered') {
     const tiers = Array.isArray(rule.tiers) ? [...rule.tiers].sort((a,b)=>Number(a.upTo)-Number(b.upTo)) : [];
     const tier = tiers.find(t => line.lineTotal <= Number(t.upTo)) || tiers[tiers.length-1];
     commission = tier ? Math.round(line.lineTotal * Number(tier.percentage) / 100) : 0;
   }
   commission = Math.max(0, Math.min(line.lineTotal, Math.round(commission)));
   await pool.query(
     "INSERT INTO public.vendor_order_lines(order_id,vendor_store_id,product_id,product_name,variant_key,quantity,unit_price,line_subtotal,commission_rule_id,commission_amount,vendor_net_amount,payout_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending') ON CONFLICT(order_id,product_id,variant_key) DO NOTHING",
     [order.id,line.vendorStoreId,line.productId,line.name,`${line.size} / ${line.color}`,line.quantity,line.unitPrice,line.lineTotal,rule?.id || null,commission,line.lineTotal-commission]
   );
 }
 if(!process.env.PAYSTACK_SECRET_KEY){return res.status(201).json({order,subtotal,deliveryFee:fee,total,checkoutUrl:null,message:'Order created in demo mode. Configure PAYSTACK_SECRET_KEY to enable payments.'});}
 const vendorIds=[...new Set(lines.map(line=>line.vendorStoreId).filter(id=>id!==null))];
 let splitPayload={};
 if(vendorIds.length){
   // Split this transaction dynamically for the exact vendors in the cart. Each
   // seller receives the post-commission line amount; the platform retains its
   // commission plus delivery and any STYLE-owned product amounts.
   const shareRows=(await pool.query(`
     SELECT l.vendor_store_id,
            SUM(l.vendor_net_amount)::bigint AS vendor_share,
            s.paystack_subaccount_code
     FROM public.vendor_order_lines l
     JOIN public.vendor_stores s ON s.id=l.vendor_store_id
     WHERE l.order_id=$1 AND l.vendor_store_id=ANY($2::bigint[])
       AND s.status='approved'
     GROUP BY l.vendor_store_id,s.paystack_subaccount_code
     ORDER BY l.vendor_store_id
   `,[order.id,vendorIds])).rows;
   if(shareRows.length!==vendorIds.length||shareRows.some(row=>!/^ACCT_[A-Za-z0-9]+$/.test(row.paystack_subaccount_code||''))){
     await pool.query("UPDATE orders SET order_status='cancelled' WHERE id=$1 AND payment_status<>'paid'",[order.id]);
     await pool.query("UPDATE public.vendor_order_lines SET payout_status='failed' WHERE order_id=$1 AND payout_status='pending'",[order.id]);
     return res.status(503).json({error:'Automatic Paystack settlement is not configured for every approved seller in this cart. Add and verify each seller Paystack subaccount, then place the order again.'});
   }
   const shares=shareRows.map(row=>({subaccount:row.paystack_subaccount_code,share:Number(row.vendor_share)*100}));
   if(shares.some(row=>!Number.isSafeInteger(row.share)||row.share<0)||shares.reduce((sum,row)=>sum+row.share,0)>total*100){
     await pool.query("UPDATE orders SET order_status='cancelled' WHERE id=$1 AND payment_status<>'paid'",[order.id]);
     await pool.query("UPDATE public.vendor_order_lines SET payout_status='failed' WHERE order_id=$1 AND payout_status='pending'",[order.id]);
     return res.status(409).json({error:'The seller split amounts exceed the checkout total. Check commission and delivery settings.'});
   }
   splitPayload.split={type:'flat',bearer_type:'account',subaccounts:shares};
 }
 const response=await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({email:customer.email,amount:total*100,currency:'KES',reference,callback_url:`${process.env.CLIENT_URL}/payment-return`,metadata:{order_reference:reference,customer_name:customer.name},...splitPayload})});
 const payload=await response.json();if(!response.ok||!payload.status)throw new Error(payload.message||'Could not initialize Paystack checkout.');res.status(201).json({order,subtotal,deliveryFee:fee,total,checkoutUrl:payload.data.authorization_url});
 }catch(e){if(e.message?.includes('stock')||e.message?.includes('cart')||e.message?.includes('Choose a valid'))return res.status(400).json({error:e.message});next(e)}});
async function verifyAndMarkPaid(reference,expectedAmount=null){
 const found=await pool.query('SELECT * FROM orders WHERE reference=$1',[reference]);if(!found.rowCount)return {ok:false,error:'Order reference not found'};const order=found.rows[0];if(order.payment_status==='paid')return {ok:true,alreadyPaid:true,order};
 const response=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`}});const payload=await response.json();const t=payload.data;
 if(!response.ok||!payload.status||!t||t.status!=='success'||t.reference!==reference||t.currency!=='KES'||Number(t.amount)!==Number(order.total)*100||(expectedAmount!==null&&Number(t.amount)!==Number(expectedAmount)))return {ok:false,error:'Payment could not be verified.'};
 const client=await pool.connect();try{await client.query('BEGIN');const latest=(await client.query('SELECT * FROM orders WHERE reference=$1 FOR UPDATE',[reference])).rows[0];if(latest.payment_status!=='paid'){for(const item of latest.items){const updated=await client.query('UPDATE products SET stock=stock-$1 WHERE id=$2 AND stock >= $1 RETURNING id',[item.quantity,item.productId]);if(!updated.rowCount)throw new Error(`Verified order ${reference} cannot be fulfilled: stock changed for product ${item.productId}. Admin reconciliation required.`);}await client.query("UPDATE orders SET payment_status='paid',order_status='processing',paid_at=NOW() WHERE reference=$1",[reference]);
 await client.query("UPDATE public.vendor_order_lines SET payout_status='eligible' WHERE order_id=$1 AND payout_status='pending'",[latest.id]);}await client.query('COMMIT');return {ok:true,order:latest};}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
app.get('/api/paystack/verify/:reference',async(req,res,next)=>{try{const result=await verifyAndMarkPaid(req.params.reference);if(!result.ok)return res.status(400).json({paid:false,error:result.error});res.json({paid:true,reference:result.order.reference,orderStatus:result.order.order_status})}catch(e){next(e)}});
app.post('/api/paystack/webhook',async(req,res,next)=>{try{const signature=req.get('x-paystack-signature');if(!process.env.PAYSTACK_SECRET_KEY||!signature||!req.rawBody)return res.status(401).send('Invalid signature');const expected=crypto.createHmac('sha512',process.env.PAYSTACK_SECRET_KEY).update(req.rawBody).digest('hex');const a=Buffer.from(signature,'hex'),b=Buffer.from(expected,'hex');if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).send('Invalid signature');const event=req.body;if(event?.event!=='charge.success')return res.sendStatus(200);const reference=event?.data?.reference;if(!reference)return res.sendStatus(200);const eventId=`${event.event}:${reference}:${event.data.id||event.data.transaction_date||''}`;const inserted=await pool.query('INSERT INTO payment_events(event_id,reference,event_type) VALUES($1,$2,$3) ON CONFLICT(event_id) DO NOTHING RETURNING id',[eventId,reference,event.event]);if(!inserted.rowCount)return res.sendStatus(200);const result=await verifyAndMarkPaid(reference,event.data.amount);if(!result.ok)console.error('Webhook payment verification failed:',reference,result.error);res.sendStatus(200)}catch(e){next(e)}});
app.get('/api/orders/:reference',async(req,res,next)=>{try{const r=await pool.query('SELECT reference,total,currency,payment_status,order_status,created_at FROM orders WHERE reference=$1',[req.params.reference]);if(!r.rowCount)return res.status(404).json({error:'Order not found'});res.json(r.rows[0])}catch(e){next(e)}});
app.use((err,req,res,next)=>{console.error(err);const status=Number.isInteger(err.status)&&err.status>=400&&err.status<500?err.status:500;res.status(status).json({error:status===500&&process.env.NODE_ENV==='production'?'Something went wrong. Please try again.':err.message||'Server error'})});
init().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`STYLE API listening on ${PORT}`))).catch(e=>{console.error('Startup failed',e);process.exit(1)});
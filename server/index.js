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
app.use(express.json({ limit:'1mb', verify:(req,res,buf)=>{req.rawBody=Buffer.from(buf);} }));

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
 const count=(await pool.query('SELECT COUNT(*)::int AS n FROM products')).rows[0].n;
 if(!count) for(const p of seed) await pool.query('INSERT INTO products(name,category,type,price,images,description,sizes,colors,stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[p.name,p.category,p.type,p.price,p.images,p.description,JSON.stringify(p.sizes),JSON.stringify(p.colors),p.stock]);
}
const safeProduct = r => ({...r, sizes:r.sizes, colors:r.colors, price:Number(r.price), stock:Number(r.stock)});
app.get('/api/health',(req,res)=>res.json({ok:true,service:'STYLE E-Fashion API'}));
app.get('/api/products',async(req,res,next)=>{try{const {category,search}=req.query;const vals=[];let where='active=TRUE';if(category&&category!=='All'){vals.push(category);where+=' AND category=$'+vals.length;}if(search){vals.push('%'+String(search).slice(0,80)+'%');where+=' AND (name ILIKE $'+vals.length+' OR description ILIKE $'+vals.length+')';}const r=await pool.query(`SELECT * FROM products WHERE ${where} ORDER BY id`,vals);res.json(r.rows.map(safeProduct));}catch(e){next(e)}});
app.get('/api/products/:id',async(req,res,next)=>{try{const r=await pool.query('SELECT * FROM products WHERE id=$1 AND active=TRUE',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Product not found'});res.json(safeProduct(r.rows[0]));}catch(e){next(e)}});
function admin(req,res,next){const supplied=Buffer.from((req.headers.authorization||'').replace(/^Bearer\s+/i,''));const configured=Buffer.from(process.env.ADMIN_TOKEN||'');if(!configured.length||supplied.length!==configured.length||!crypto.timingSafeEqual(supplied,configured))return res.status(401).json({error:'Admin authorization required'});next();}
app.use('/api/marketplace', createMarketplaceRouter({ pool }));
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
 const lines=items.map(i=>{const p=byId.get(Number(i.productId));const qty=Number(i.quantity);if(!p||!Number.isInteger(qty)||qty<1||qty>10)throw new Error('A product or quantity in your cart is invalid.');if(p.stock<qty)throw new Error(`${p.name} does not have enough stock.`);const size=String(i.size||'');const color=String(i.color||'');if(!p.sizes.includes(size)||!p.colors.includes(color))throw new Error(`Choose a valid size and colour for ${p.name}.`);return {productId:p.id,name:p.name,unitPrice:Number(p.price),quantity:qty,size,color,fulfilment:'stock-check-required',lineTotal:Number(p.price)*qty};});
 const subtotal=lines.reduce((s,i)=>s+i.lineTotal,0),fee=deliveryFees[deliveryMethod],total=subtotal+fee;
 const reference='STYLE-'+crypto.randomBytes(10).toString('hex').toUpperCase();
 const order=(await pool.query(`INSERT INTO orders(reference,customer_name,email,phone,address,town,county,delivery_method,items,subtotal,delivery_fee,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,reference,total,payment_status`,[reference,String(customer.name).slice(0,120),customer.email, String(customer.phone).slice(0,40),String(customer.address).slice(0,250),String(customer.town).slice(0,100),String(customer.county).slice(0,100),deliveryMethod,JSON.stringify(lines),subtotal,fee,total])).rows[0];
 if(!process.env.PAYSTACK_SECRET_KEY){return res.status(201).json({order,subtotal,deliveryFee:fee,total,checkoutUrl:null,message:'Order created in demo mode. Configure PAYSTACK_SECRET_KEY to enable payments.'});}
 const response=await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({email:customer.email,amount:total*100,currency:'KES',reference,callback_url:`${process.env.CLIENT_URL}/payment-return`,metadata:{order_reference:reference,customer_name:customer.name}})});
 const payload=await response.json();if(!response.ok||!payload.status)throw new Error(payload.message||'Could not initialize Paystack checkout.');res.status(201).json({order,subtotal,deliveryFee:fee,total,checkoutUrl:payload.data.authorization_url});
 }catch(e){if(e.message?.includes('stock')||e.message?.includes('cart')||e.message?.includes('Choose a valid'))return res.status(400).json({error:e.message});next(e)}});
async function verifyAndMarkPaid(reference,expectedAmount=null){
 const found=await pool.query('SELECT * FROM orders WHERE reference=$1',[reference]);if(!found.rowCount)return {ok:false,error:'Order reference not found'};const order=found.rows[0];if(order.payment_status==='paid')return {ok:true,alreadyPaid:true,order};
 const response=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,{headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`}});const payload=await response.json();const t=payload.data;
 if(!response.ok||!payload.status||!t||t.status!=='success'||t.reference!==reference||t.currency!=='KES'||Number(t.amount)!==Number(order.total)*100||(expectedAmount!==null&&Number(t.amount)!==Number(expectedAmount)))return {ok:false,error:'Payment could not be verified.'};
 const client=await pool.connect();try{await client.query('BEGIN');const latest=(await client.query('SELECT * FROM orders WHERE reference=$1 FOR UPDATE',[reference])).rows[0];if(latest.payment_status!=='paid'){for(const item of latest.items){const updated=await client.query('UPDATE products SET stock=stock-$1 WHERE id=$2 AND stock >= $1 RETURNING id',[item.quantity,item.productId]);if(!updated.rowCount)throw new Error(`Verified order ${reference} cannot be fulfilled: stock changed for product ${item.productId}. Admin reconciliation required.`);}await client.query("UPDATE orders SET payment_status='paid',order_status='processing',paid_at=NOW() WHERE reference=$1",[reference]);}await client.query('COMMIT');return {ok:true,order:latest};}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
app.get('/api/paystack/verify/:reference',async(req,res,next)=>{try{const result=await verifyAndMarkPaid(req.params.reference);if(!result.ok)return res.status(400).json({paid:false,error:result.error});res.json({paid:true,reference:result.order.reference,orderStatus:result.order.order_status})}catch(e){next(e)}});
app.post('/api/paystack/webhook',async(req,res,next)=>{try{const signature=req.get('x-paystack-signature');if(!process.env.PAYSTACK_SECRET_KEY||!signature||!req.rawBody)return res.status(401).send('Invalid signature');const expected=crypto.createHmac('sha512',process.env.PAYSTACK_SECRET_KEY).update(req.rawBody).digest('hex');const a=Buffer.from(signature,'hex'),b=Buffer.from(expected,'hex');if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).send('Invalid signature');const event=req.body;if(event?.event!=='charge.success')return res.sendStatus(200);const reference=event?.data?.reference;if(!reference)return res.sendStatus(200);const eventId=`${event.event}:${reference}:${event.data.id||event.data.transaction_date||''}`;const inserted=await pool.query('INSERT INTO payment_events(event_id,reference,event_type) VALUES($1,$2,$3) ON CONFLICT(event_id) DO NOTHING RETURNING id',[eventId,reference,event.event]);if(!inserted.rowCount)return res.sendStatus(200);const result=await verifyAndMarkPaid(reference,event.data.amount);if(!result.ok)console.error('Webhook payment verification failed:',reference,result.error);res.sendStatus(200)}catch(e){next(e)}});
app.get('/api/orders/:reference',async(req,res,next)=>{try{const r=await pool.query('SELECT reference,total,currency,payment_status,order_status,created_at FROM orders WHERE reference=$1',[req.params.reference]);if(!r.rowCount)return res.status(404).json({error:'Order not found'});res.json(r.rows[0])}catch(e){next(e)}});
app.use((err,req,res,next)=>{console.error(err);const status=Number.isInteger(err.status)&&err.status>=400&&err.status<500?err.status:500;res.status(status).json({error:status===500&&process.env.NODE_ENV==='production'?'Something went wrong. Please try again.':err.message||'Server error'})});
init().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`STYLE API listening on ${PORT}`))).catch(e=>{console.error('Startup failed',e);process.exit(1)});

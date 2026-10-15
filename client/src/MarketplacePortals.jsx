import React, { useEffect, useState } from 'react';

export function VendorPortal({ API, money }) {
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(() => window.sessionStorage.getItem('style-marketplace-token') || '');
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [tab, setTab] = useState('Dashboard');
  const [data, setData] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState({name:'',category:'STYLE WOMAN',type:'Clothing',price:'',stock:'0',description:'',sizes:'S, M, L',colors:'Black, Cream',images:''});
  const [payoutAmount, setPayoutAmount] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [review, setReview] = useState({orderReference:'',storeId:'',productId:'',rating:'5',title:'',body:''});
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  async function api(path, options = {}) {
    const response = await fetch(API + '/marketplace' + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Marketplace request failed.');
    return result;
  }

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(API + '/marketplace/me', { headers: { Authorization: 'Bearer ' + token } });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Your session expired. Please sign in again.');
        if (!cancelled) { setUser(result.user); setStore(result.store || null); }
      } catch (error) {
        if (!cancelled) { window.sessionStorage.removeItem('style-marketplace-token'); setToken(''); setUser(null); setStore(null); setMessage(error.message); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (token) window.sessionStorage.setItem('style-marketplace-token', token); else window.sessionStorage.removeItem('style-marketplace-token'); }, [token]);

  useEffect(() => {
    if (!imageFile) { setImagePreview(''); return undefined; }
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  async function authenticate(event) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const registering = mode === 'vendor' || mode === 'buyer';
      const body = registering
        ? { fullName, email, password, role: mode === 'vendor' ? 'vendor' : 'buyer', ...(mode === 'vendor' ? { storeName, phone, storeDescription: description } : {}) }
        : { email, password };
      const result = await api(registering ? '/register' : '/login', { method:'POST', body:JSON.stringify(body) });
      setToken(result.token); setUser(result.user); setStore(result.store || null);
      setTab(result.user.role === 'buyer' ? 'Reviews' : 'Dashboard');
      setMessage(result.message || 'Signed in successfully.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function load() {
    if (!token || !user) return;
    setBusy(true); setMessage('');
    try {
      if (user.role === 'vendor') {
        if (tab === 'Dashboard') setDashboard(await api('/vendor/dashboard'));
        if (tab === 'Products') setData(await api('/vendor/products'));
        if (tab === 'Orders') setData(await api('/vendor/orders'));
        if (tab === 'Payouts') setData(await api('/vendor/payouts'));
      } else if (user.role === 'buyer' && tab === 'Reviews') setData(await api('/stores'));
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (token && user) load(); }, [token, user, tab]);

  async function saveProduct(event) {
    event.preventDefault();
    setMessage('');

    // Validate here so a missing field always produces visible feedback.
    const price = Number(product.price);
    const stock = Number(product.stock);
    const sizes = product.sizes.split(',').map(x => x.trim()).filter(Boolean);
    const colors = product.colors.split(',').map(x => x.trim()).filter(Boolean);
    if (!product.name.trim()) { setMessage('Enter a product name.'); return; }
    if (!Number.isSafeInteger(price) || price < 1) { setMessage('Enter a valid whole-number price greater than zero.'); return; }
    if (!Number.isSafeInteger(stock) || stock < 0) { setMessage('Enter a valid stock quantity.'); return; }
    if (!sizes.length) { setMessage('Enter at least one size.'); return; }
    if (!colors.length) { setMessage('Enter at least one colour.'); return; }
    if (!imageFile && !product.images.trim()) { setMessage('Choose an image file or enter an HTTPS image URL.'); return; }
    if (imageFile && product.images.trim()) { setMessage('Choose either a device upload or an image URL, not both.'); return; }
    if (imageFile && imageFile.size > 5 * 1024 * 1024) { setMessage('Choose an image smaller than 5 MB.'); return; }

    if (imageFile && !['image/jpeg','image/png','image/webp'].includes(imageFile.type)) { setMessage('Choose a JPG, PNG, or WebP image file.'); return; }

    setSavingProduct(true);
    setUploadStatus(imageFile ? 'Preparing secure image upload…' : 'Validating image URL…');
    try {
      let imageUrls;
      if (imageFile) {
        const signed = await api('/vendor/uploads/sign', { method:'POST', body:JSON.stringify({}) });
        if (!signed.cloud_name || !signed.api_key || !signed.timestamp || !signed.folder || !signed.signature) {
          throw new Error('The server returned incomplete Cloudinary upload details. Check the backend configuration.');
        }
        const payload = new FormData();
        payload.append('file', imageFile);
        payload.append('api_key', signed.api_key);
        payload.append('timestamp', String(signed.timestamp));
        payload.append('folder', signed.folder);
        payload.append('signature', signed.signature);
        setUploadStatus('Uploading image to Cloudinary…');
        let response, result;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        try {
          response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloud_name)}/image/upload`, {
            method:'POST', body:payload, signal:controller.signal
          });
          result = await response.json().catch(() => ({}));
        } catch (error) {
          if (error?.name === 'AbortError') throw new Error('Cloudinary did not finish the upload within 45 seconds. Try a smaller image or check your connection.');
          throw new Error('Could not reach Cloudinary. Check your internet connection and try again.');
        } finally { clearTimeout(timeoutId); }
        if (!response.ok || !result.secure_url) {
          throw new Error(result.error?.message || `Cloudinary upload failed (HTTP ${response.status}).`);
        }
        imageUrls = [result.secure_url];
      } else {
        imageUrls = product.images.split(',').map(x => x.trim()).filter(Boolean);
        if (imageUrls.some(url => !/^https:\/\//i.test(url))) throw new Error('Use HTTPS image URLs only.');
      }

      setUploadStatus('Image uploaded. Saving product details…');
      const body = {
        ...product,
        name: product.name.trim(),
        price,
        stock,
        sizes,
        colors,
        image_gallery: imageUrls
      };
      delete body.images;
      await api(editingProductId ? `/vendor/products/${editingProductId}` : '/vendor/products', { method: editingProductId ? 'PATCH' : 'POST', body:JSON.stringify(body) });
      setProduct({name:'',category:'STYLE WOMAN',type:'Clothing',price:'',stock:'0',description:'',sizes:'S, M, L',colors:'Black, Cream',images:''});
      setEditingProductId(null);
      setImageFile(null);
      setUploadStatus('');
      const fileInput = document.getElementById('vendor-product-image');
      if (fileInput) fileInput.value = '';
      await load();
      setMessage(editingProductId ? 'Product updated successfully.' : 'Product added successfully. It is now listed in your seller products.');
    } catch (error) {
      setMessage(error.message || 'Could not add the product. Please try again.');
    } finally {
      setSavingProduct(false);
      setUploadStatus('');
    }
  }

  function editProduct(p) {
    setEditingProductId(p.id);
    setImageFile(null);
    setProduct({name:p.name||'',category:p.category||'STYLE WOMAN',type:p.type||'Clothing',price:String(p.price??''),stock:String(p.stock??0),description:p.description||'',sizes:Array.isArray(p.sizes)?p.sizes.join(', '):'S, M, L',colors:Array.isArray(p.colors)?p.colors.join(', '):'Black, Cream',images:(Array.isArray(p.image_gallery)&&p.image_gallery.length?p.image_gallery:[p.images]).filter(Boolean).join(', ')});
    setMessage('Editing product. Save your changes when finished.');
    document.getElementById('vendor-product-form')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function deleteProduct(p) {
    if (!window.confirm(`Delete “${p.name}” from your storefront? This hides it from shoppers while preserving order history.`)) return;
    try {
      await api(`/vendor/products/${p.id}/archive`, {method:'POST'});
      setData(current=>current.filter(item=>item.id!==p.id));
      if (editingProductId===p.id) { setEditingProductId(null); setProduct({name:'',category:'STYLE WOMAN',type:'Clothing',price:'',stock:'0',description:'',sizes:'S, M, L',colors:'Black, Cream',images:''}); setImageFile(null); }
      setMessage('Product removed from your storefront.');
    } catch(error) { setMessage(error.message || 'Could not delete this product.'); }
  }

  function cancelProductEdit() {
    setEditingProductId(null);
    setImageFile(null);
    setProduct({name:'',category:'STYLE WOMAN',type:'Clothing',price:'',stock:'0',description:'',sizes:'S, M, L',colors:'Black, Cream',images:''});
    setMessage('Product editing cancelled.');
  }

  async function requestPayout(event) {
    event.preventDefault(); setBusy(true);
    try { const result = await api('/vendor/payouts', { method:'POST', body:JSON.stringify({amount:Number(payoutAmount)}) }); setMessage(result.message); setPayoutAmount(''); await load(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function submitReview(event) {
    event.preventDefault(); setBusy(true);
    try {
      await api('/reviews', { method:'POST', body:JSON.stringify({...review,storeId:Number(review.storeId),productId:review.productId ? Number(review.productId) : null,rating:Number(review.rating)}) });
      setMessage('Thank you. Your verified-purchase review was submitted.');
      setReview({...review,orderReference:'',title:'',body:''});
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  const logout = () => { window.sessionStorage.removeItem('style-marketplace-token'); setToken(''); setUser(null); setStore(null); setData([]); setDashboard(null); setMode('login'); setFullName(''); setStoreName(''); setPhone(''); setDescription(''); setEmail(''); setPassword(''); setMessage('Signed out.'); };

  return <main className="admin-page section-wrap">
    <p className="eyebrow">THE STYLE MARKETPLACE</p><h1>Seller <em>studio.</em></h1>
    <p>Manage a fashion store, products, orders and earnings. New stores are reviewed before selling is enabled.</p>
    {!user ? <>
      <div className="admin-toolbar"><div className="admin-tabs">
        <button className={mode==='login'?'active':''} onClick={()=>setMode('login')}>Sign in</button>
        <button className={mode==='buyer'?'active':''} onClick={()=>setMode('buyer')}>Buyer account</button>
        <button className={mode==='vendor'?'active':''} onClick={()=>setMode('vendor')}>Apply to sell</button>
      </div></div>
      <form className="admin-form" onSubmit={authenticate}>
        <h2>{mode==='vendor'?'Create seller account':mode==='buyer'?'Create buyer account':'Welcome back'}</h2>
        <div className="admin-fields">
          {mode!=='login' && <input required placeholder="Full name" value={fullName} onChange={e=>setFullName(e.target.value)}/>}
          <input required type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)}/>
          <input required type="password" minLength={mode==='login'?1:12} placeholder={mode==='login'?'Password':'Password (at least 12 characters)'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'}/>
          {mode==='vendor' && <>
            <input required placeholder="Store name" value={storeName} onChange={e=>setStoreName(e.target.value)}/>
            <input placeholder="Phone number (optional)" value={phone} onChange={e=>setPhone(e.target.value)}/>
            <textarea className="wide" placeholder="Tell buyers about your store" value={description} onChange={e=>setDescription(e.target.value)}/>
          </>}
        </div>
        <button className="btn btn-dark" disabled={busy}>{busy?'PLEASE WAIT…':mode==='login'?'SIGN IN':mode==='vendor'?'SUBMIT SELLER APPLICATION':'CREATE BUYER ACCOUNT'}</button>
        {message && <p className="admin-message" role="status">{message}</p>}
      </form>
    </> : <>
      <div className="admin-toolbar"><div className="admin-tabs">
        {(user.role==='vendor'?['Dashboard','Products','Orders','Payouts']:user.role==='buyer'?['Reviews']:[]).map(item=><button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{item}</button>)}
      </div><button className="admin-signout" onClick={logout}>Sign out</button></div>
      {message && <p className="admin-message" role="status">{message}</p>}{busy && <p>Loading…</p>}
      {user.role==='vendor' && store?.status!=='approved' && <div className="admin-form"><h2>Store application: {store?.status || 'pending'}</h2><p>Your application is saved. The seller tools unlock after platform approval.</p></div>}
      {user.role==='vendor' && store?.status==='approved' && tab==='Dashboard' && dashboard && <>
        <div className="admin-stat-grid">{[['Products',dashboard.products],['Orders',dashboard.orders],['Gross sales',money(dashboard.gross)],['Platform commission',money(dashboard.commission)],['Vendor earnings',money(dashboard.earnings)],['Store rating',dashboard.rating+' / 5'],['Payout requests pending',money(dashboard.pendingPayouts)],['Payouts marked paid',money(dashboard.paidPayouts)]].map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
        <p>Your store: <b>{dashboard.store?.name}</b> · Public store slug: <code>{dashboard.store?.slug}</code></p>
      </>}
      {user.role==='vendor' && store?.status==='approved' && tab==='Products' && <>
        <form id="vendor-product-form" className="admin-form" onSubmit={saveProduct} onInvalidCapture={e=>{const field=e.target;if(field?.validity?.valueMissing)setMessage(field.placeholder?`Please complete: ${field.placeholder}.`:'Please complete the required fields.');else if(field?.validity?.badInput)setMessage('Enter a valid value in the highlighted field.');}}><h2>{editingProductId ? "Edit product" : "Add a product"}</h2><div className="admin-fields">
          <input required placeholder="Product name" value={product.name} onChange={e=>setProduct({...product,name:e.target.value})}/>
          <select value={product.category} onChange={e=>setProduct({...product,category:e.target.value})}>{['STYLE WOMAN','STYLE MAMA','STYLE KIDS','SETS & GIFTS'].map(x=><option key={x}>{x}</option>)}</select>
          <input placeholder="Type" value={product.type} onChange={e=>setProduct({...product,type:e.target.value})}/>
          <input required type="number" min="1" step="1" placeholder="Price (KES)" value={product.price} onChange={e=>setProduct({...product,price:e.target.value})}/>
          <input required type="number" min="0" step="1" placeholder="Stock quantity" value={product.stock} onChange={e=>setProduct({...product,stock:e.target.value})}/>
          <input required placeholder="Sizes, separated by commas" value={product.sizes} onChange={e=>setProduct({...product,sizes:e.target.value})}/>
          <input required placeholder="Colours, separated by commas" value={product.colors} onChange={e=>setProduct({...product,colors:e.target.value})}/>
          <div className="wide vendor-upload-control">
            <label className="vendor-upload-heading" htmlFor="vendor-product-image">Product photo <span>JPG, PNG or WebP · maximum 5 MB</span></label>
            <div className="vendor-upload-dropzone">
              <input className="vendor-product-file-input" id="vendor-product-image" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0]||null;setImageFile(file);if(file)setProduct({...product,images:''});}} />
              <p className="vendor-upload-help">Choose a photo from your computer. The preview appears here before you save.</p>
            </div>
            {imageFile && <p className="admin-message">Selected file: {imageFile.name} ({(imageFile.size / 1024 / 1024).toFixed(2)} MB)</p>}
            {(imagePreview || product.images.trim()) && <div className="vendor-image-preview" style={{marginTop:12,display:'flex',flexDirection:'column',alignItems:'flex-start',gap:8}}><span>Image preview</span><img src={imagePreview || product.images.trim().split(',')[0].trim()} alt="Product preview" onError={e=>{e.currentTarget.style.display='none';setMessage('The image preview could not load. Check the image URL or choose another file.');}} onLoad={e=>{e.currentTarget.style.display='block';}} style={{display:'block',width:'min(100%, 260px)',maxHeight:260,objectFit:'contain',border:'1px solid #ddd',borderRadius:8,background:'#fff'}} /></div>}
            {uploadStatus && <p className="admin-message" role="status">{uploadStatus}</p>}
            <label className="vendor-upload-heading vendor-upload-url-heading" htmlFor="vendor-product-image-url">Or use an image URL <span>HTTPS only; separate multiple URLs with commas</span></label>
            <input id="vendor-product-image-url" placeholder="https://example.com/product.jpg" value={product.images} onChange={e=>{setProduct({...product,images:e.target.value});if(e.target.value.trim())setImageFile(null);}} />
            <p className="admin-message">Required: choose a file from your device OR enter an image URL. Use only one method.</p>
          </div>
          <textarea className="wide" placeholder="Product description" value={product.description} onChange={e=>setProduct({...product,description:e.target.value})}/>
        </div><button type="submit" className="btn btn-dark" disabled={savingProduct}>{savingProduct?(imageFile?'UPLOADING…':'SAVING…'):editingProductId?'SAVE CHANGES':'ADD PRODUCT'}</button>{editingProductId && <button type="button" className="admin-signout" onClick={cancelProductEdit} disabled={savingProduct}>CANCEL EDIT</button>}</form>
        <div className="admin-table-wrap"><table><thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>{data.map(p=><tr key={p.id}><td>{p.name}</td><td>{money(p.price)}</td><td>{p.stock}</td><td>{p.active?'Active':'Archived'}</td><td><button type="button" className="vendor-product-action" onClick={()=>editProduct(p)}>Edit</button> <button type="button" className="vendor-product-action vendor-delete-action" onClick={()=>deleteProduct(p)}>Delete</button></td></tr>)}</tbody></table></div>
      </>}
      {user.role==='vendor' && store?.status==='approved' && tab==='Orders' && <div className="admin-table-wrap"><table><thead><tr><th>Order</th><th>Product</th><th>Qty</th><th>Gross</th><th>Commission</th><th>Your net</th><th>Payment</th><th>Payout</th></tr></thead><tbody>{data.map(o=><tr key={o.line_id}><td>{o.reference}<small>{o.customer_name}</small></td><td>{o.product_name}</td><td>{o.quantity}</td><td>{money(o.line_subtotal)}</td><td>{money(o.commission_amount)}</td><td>{money(o.vendor_net_amount)}</td><td>{o.payment_status}</td><td>{o.payout_status}</td></tr>)}</tbody></table></div>}
      {user.role==='vendor' && store?.status==='approved' && tab==='Payouts' && <>
        <form className="admin-form" onSubmit={requestPayout}><h2>Request a payout</h2><p>Requests are reviewed and paid by the platform. This form does not transfer funds automatically.</p><div className="admin-fields"><input required type="number" min="1" step="1" placeholder="Amount in KES" value={payoutAmount} onChange={e=>setPayoutAmount(e.target.value)}/></div><button className="btn btn-dark" disabled={busy}>REQUEST PAYOUT</button></form>
        <div className="admin-table-wrap"><table><thead><tr><th>Requested</th><th>Amount</th><th>Status</th><th>Payment reference</th></tr></thead><tbody>{data.map(p=><tr key={p.id}><td>{new Date(p.requested_at).toLocaleString()}</td><td>{money(p.amount)}</td><td>{p.status}</td><td>{p.provider_reference||'—'}</td></tr>)}</tbody></table></div>
      </>}
      {user.role==='buyer' && tab==='Reviews' && <form className="admin-form" onSubmit={submitReview}><h2>Review a store or product</h2><p>Reviews are accepted only if your paid order matches your account email and contains products from the selected store.</p><div className="admin-fields">
        <input required placeholder="Paid order reference" value={review.orderReference} onChange={e=>setReview({...review,orderReference:e.target.value})}/>
        <select required value={review.storeId} onChange={e=>setReview({...review,storeId:e.target.value})}><option value="">Choose store</option>{data.map(s=><option key={s.id} value={s.id}>{s.store_name}</option>)}</select>
        <input type="number" min="1" max="5" value={review.rating} onChange={e=>setReview({...review,rating:e.target.value})} aria-label="Rating out of five"/>
        <input placeholder="Product ID (optional; blank reviews store)" value={review.productId} onChange={e=>setReview({...review,productId:e.target.value})} />
        <input className="wide" placeholder="Review title" value={review.title} onChange={e=>setReview({...review,title:e.target.value})}/>
        <textarea className="wide" placeholder="Your review" value={review.body} onChange={e=>setReview({...review,body:e.target.value})}/>
      </div><button className="btn btn-dark" disabled={busy}>SUBMIT REVIEW</button></form>}
    </>}
  </main>;
}

export function MarketplaceAdmin({ API, money }) {
  const [mode,setMode]=useState('login'),[adminToken,setAdminToken]=useState(''),[fullName,setFullName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[token,setToken]=useState(''),[user,setUser]=useState(null),[tab,setTab]=useState('Vendors'),[data,setData]=useState([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[subaccount,setSubaccount]=useState({vendorId:'',subaccountCode:'',splitCode:''});
  const [rule,setRule]=useState({name:'Default percentage',calculationType:'percentage',percentage:'10',flatFee:'0',vendorStoreId:'',priority:'100',tiers:'[{"upTo":5000,"percentage":10},{"upTo":20000,"percentage":8}]'});
  const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  async function api(path,options={}){const r=await fetch(API+'/marketplace'+path,{...options,headers:{...headers,...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Marketplace admin request failed.');return d}
  async function bootstrap(e){e.preventDefault();setBusy(true);try{const r=await fetch(API+'/marketplace/admin/bootstrap-super-admin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminToken},body:JSON.stringify({fullName,email,password})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not create super admin.');setMessage(d.message);setMode('login')}catch(e){setMessage(e.message)}finally{setBusy(false)}}
  async function login(e){e.preventDefault();setBusy(true);try{const d=await api('/login',{method:'POST',body:JSON.stringify({email,password})});if(d.user.role!=='super_admin')throw new Error('This account is not a super admin.');setToken(d.token);setUser(d.user);setMessage('Super admin access verified.')}catch(e){setMessage(e.message)}finally{setBusy(false)}}
  async function load(){if(!user)return;setBusy(true);try{if(tab==='Vendors')setData(await api('/admin/vendors'));if(tab==='Commissions')setData(await api('/admin/commissions'));if(tab==='Payouts')setData(await api('/admin/payouts'))}catch(e){setMessage(e.message)}finally{setBusy(false)}}
  useEffect(()=>{if(token&&user)load()},[tab,token,user]);
  async function vendorStatus(id,status){try{await api('/admin/vendors/'+id+'/status',{method:'PATCH',body:JSON.stringify({status})});setMessage('Vendor status updated.');await load()}catch(e){setMessage(e.message)}}
  async function saveRule(e){e.preventDefault();try{const body={...rule,percentage:rule.calculationType==='percentage'?Number(rule.percentage):null,flatFee:rule.calculationType==='flat'?Number(rule.flatFee):null,vendorStoreId:rule.vendorStoreId?Number(rule.vendorStoreId):null,priority:Number(rule.priority),tiers:rule.calculationType==='tiered'?JSON.parse(rule.tiers):[]};await api('/admin/commissions',{method:'POST',body:JSON.stringify(body)});setMessage('Commission rule created.');await load()}catch(e){setMessage(e.message||'Check the tiered JSON format.')}}
  async function payoutAction(p,status){try{const body={status};if(status==='paid'){const ref=window.prompt('Enter confirmed external transfer reference. This action does not move money.');if(!ref)return;body.providerReference=ref}if(status==='failed')body.failureReason=window.prompt('Reason (optional)')||'Payment failed';await api('/admin/payouts/'+p.id+'/status',{method:'PATCH',body:JSON.stringify(body)});setMessage('Payout record updated.');await load()}catch(e){setMessage(e.message)}}
  return <main className="admin-page section-wrap"><p className="eyebrow">PLATFORM OPERATIONS</p><h1>Marketplace <em>control.</em></h1><p>Approve sellers, configure commissions, and reconcile payout requests. The current payout flow records requests but does not execute money transfers automatically.</p>
    {!user ? <>
      <div className="admin-toolbar"><div className="admin-tabs"><button className={mode==='login'?'active':''} onClick={()=>setMode('login')}>Sign in</button><button className={mode==='bootstrap'?'active':''} onClick={()=>setMode('bootstrap')}>Initial setup</button></div></div>
      {mode==='bootstrap' ? <form className="admin-form" onSubmit={bootstrap}><h2>Create the first super admin</h2><p>Use the existing backend ADMIN_TOKEN once. This setup endpoint is disabled after the first super-admin account exists.</p><div className="admin-fields"><input required type="password" placeholder="ADMIN_TOKEN" value={adminToken} onChange={e=>setAdminToken(e.target.value)}/><input required placeholder="Full name" value={fullName} onChange={e=>setFullName(e.target.value)}/><input required type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)}/><input required type="password" minLength="14" placeholder="Password (at least 14 characters)" value={password} onChange={e=>setPassword(e.target.value)}/></div><button className="btn btn-dark" disabled={busy}>CREATE SUPER ADMIN</button></form> : <form className="admin-form" onSubmit={login}><h2>Super admin sign in</h2><div className="admin-fields"><input required type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)}/><input required type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}/></div><button className="btn btn-dark" disabled={busy}>SIGN IN</button></form>}
      {message && <p className="admin-message" role="status">{message}</p>}
    </> : <>
      <div className="admin-toolbar"><div className="admin-tabs">{['Vendors','Commissions','Payouts'].map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</div><button className="admin-signout" onClick={()=>{setUser(null);setToken('');setData([]);setMessage('Signed out.')}}>Sign out</button></div>
      {message && <p className="admin-message" role="status">{message}</p>}{busy && <p>Loading…</p>}
      {tab==='Vendors' && <section>
        <div className="admin-table-wrap"><table><thead><tr><th>Store</th><th>Owner</th><th>Status</th><th>Paystack Subaccount</th><th>Gross sales</th><th>Commission</th><th>Vendor net</th><th>Review</th></tr></thead><tbody>{data.map(v=><tr key={v.id}><td>{v.store_name}<small>{v.slug}</small></td><td>{v.full_name}<small>{v.email}</small></td><td>{v.status}</td><td>{v.paystack_subaccount_code||'Not configured'}</td><td>{money(v.gross_sales)}</td><td>{money(v.platform_commission)}</td><td>{money(v.vendor_earnings)}</td><td><button onClick={()=>vendorStatus(v.id,'approved')}>Approve</button> <button onClick={()=>vendorStatus(v.id,'rejected')}>Reject</button> <button onClick={()=>vendorStatus(v.id,'suspended')}>Suspend</button></td></tr>)}</tbody></table></div>
        <form className="admin-form" onSubmit={async e=>{e.preventDefault();try{await api('/admin/vendors/'+subaccount.vendorId+'/paystack-subaccount',{method:'PATCH',body:JSON.stringify({subaccountCode:subaccount.subaccountCode})});setMessage('Verified Paystack subaccount code saved.');setSubaccount(old=>({...old,subaccountCode:''}));await load()}catch(error){setMessage(error.message)}}}>
          <h2>Connect seller Paystack subaccount</h2><p>Create and verify this vendor’s Paystack subaccount first, then save its exact ACCT code here. Checkout calculates each seller’s net share from the saved commission rule and sends a dynamic split to Paystack. Keep this code in the same Test or Live Paystack environment as the server secret.</p>
          <div className="admin-fields"><select required value={subaccount.vendorId} onChange={e=>setSubaccount({...subaccount,vendorId:e.target.value})}><option value="">Select vendor</option>{data.map(v=><option key={v.id} value={v.id}>{v.store_name} — {v.email}</option>)}</select><input required placeholder="Paystack ACCT_ subaccount code" value={subaccount.subaccountCode} onChange={e=>setSubaccount({...subaccount,subaccountCode:e.target.value})}/></div>
          <button className="btn btn-dark">Save subaccount</button>
        </form>
        <p className="admin-message">Dynamic multi-seller checkout no longer requires one shared SPL_ split group. Each approved seller must have a verified ACCT_ subaccount code saved above.</p>

      </section>}
      {tab==='Commissions' && <section>
        <form className="admin-form" onSubmit={saveRule}>
          <h2>New commission rule</h2>
          <div className="admin-fields">
            <input required placeholder="Rule name" value={rule.name} onChange={e=>setRule({...rule,name:e.target.value})}/>
            <select value={rule.calculationType} onChange={e=>setRule({...rule,calculationType:e.target.value})}>
              <option value="percentage">Percentage</option>
              <option value="flat">Flat fee per product line</option>
              <option value="tiered">Tiered percentage</option>
            </select>
            {rule.calculationType==='percentage' ? <input required type="number" min="0" max="100" step="0.01" placeholder="Percentage" value={rule.percentage} onChange={e=>setRule({...rule,percentage:e.target.value})}/> : null}
            {rule.calculationType==='flat' ? <input required type="number" min="0" step="1" placeholder="Flat fee (KES)" value={rule.flatFee} onChange={e=>setRule({...rule,flatFee:e.target.value})}/> : null}
            <input required type="number" min="1" step="1" placeholder="Priority (lower first)" value={rule.priority} onChange={e=>setRule({...rule,priority:e.target.value})}/>
            <input type="number" min="1" placeholder="Vendor store ID (blank = all)" value={rule.vendorStoreId} onChange={e=>setRule({...rule,vendorStoreId:e.target.value})}/>
            {rule.calculationType==='tiered' ? <textarea className="wide" value={rule.tiers} onChange={e=>setRule({...rule,tiers:e.target.value})} placeholder="Tier JSON"/> : null}
          </div>
          <button className="btn btn-dark">CREATE RULE</button>
        </form>
        <div className="admin-table-wrap">
          <table><thead><tr><th>Name</th><th>Type</th><th>Rate / fee</th><th>Vendor ID</th><th>Priority</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{data.map(ruleRow=><tr key={ruleRow.id}>
            <td>{ruleRow.name}</td><td>{ruleRow.calculation_type}</td>
            <td>{ruleRow.calculation_type==='percentage' ? ruleRow.percentage+'%' : ruleRow.calculation_type==='flat' ? money(ruleRow.flat_fee) : 'Tiered'}</td>
            <td>{ruleRow.applies_to_vendor_id || 'All'}</td><td>{ruleRow.priority}</td><td>{ruleRow.active?'Active':'Inactive'}</td>
            <td><button onClick={async()=>{try{await api('/admin/commissions/'+ruleRow.id,{method:'PATCH',body:JSON.stringify({active:!ruleRow.active})});await load()}catch(error){setMessage(error.message)}}}>{ruleRow.active?'Deactivate':'Activate'}</button></td>
          </tr>)}</tbody></table>
        </div>
      </section>}
      {tab==='Payouts' && <div className="admin-table-wrap"><table><thead><tr><th>Store</th><th>Amount</th><th>Status</th><th>Requested</th><th>Reference</th><th>Actions</th></tr></thead><tbody>{data.map(p=><tr key={p.id}><td>{p.store_name}</td><td>{money(p.amount)}</td><td>{p.status}</td><td>{new Date(p.requested_at).toLocaleString()}</td><td>{p.provider_reference||'—'}</td><td><button onClick={()=>payoutAction(p,'processing')}>Processing</button> <button onClick={()=>payoutAction(p,'paid')}>Mark paid</button> <button onClick={()=>payoutAction(p,'failed')}>Failed</button></td></tr>)}</tbody></table></div>}
    </>}
  </main>;
}

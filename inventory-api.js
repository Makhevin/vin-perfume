// Combined with telegram-order-worker.js by build-inventory-worker.cjs.
// Binding: DB (D1). Secrets: ADMIN_PASSWORD, ADMIN_SESSION_SECRET.
const encoder = new TextEncoder();
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
function encoded(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  return encoded(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
async function equal(a,b) {
  const [x,y] = await Promise.all([a,b].map(v => crypto.subtle.digest('SHA-256', encoder.encode(v))));
  return new Uint8Array(x).reduce((n,v,i) => n | (v ^ new Uint8Array(y)[i]),0) === 0;
}
async function authorized(request,env) {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split(';').map(p=>p.trim()).find(p=>p.startsWith('vin_admin='))?.slice(10);
  if (!token) return false;
  const [expires, nonce, signature] = token.split('.');
  if (!signature || !/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return equal(signature, await sign(expires+'.'+nonce,env.ADMIN_SESSION_SECRET));
}
async function readCatalog(env) {
  await env.DB.prepare('INSERT OR IGNORE INTO shop_catalog (id, revision, data) VALUES (1,1,?)').bind(JSON.stringify(INITIAL_CATALOG)).run();
  return env.DB.prepare('SELECT revision, data FROM shop_catalog WHERE id=1').first();
}
function validateCatalog(products) {
  if (!Array.isArray(products) || !products.length || products.length > 300) throw Error('Use between 1 and 300 products.');
  const ids = new Set();
  const titles = new Set();
  for (const p of products) {
    if (!/^[a-z0-9-]{1,80}$/.test(p.id) || ids.has(p.id)) throw Error('Each product needs a unique lowercase ID.');
    ids.add(p.id);
    if (titles.has(p.title)) throw Error('Each product needs a distinct full name.');
    titles.add(p.title);
    for (const field of ['brand','name','title','notes','conc','line']) if (typeof p[field] !== 'string' || p[field].length > 1000) throw Error('Invalid product text.');
    if (!p.brand.trim() || !p.name.trim()) throw Error('Brand and name are required.');
    if (!['Him','Her','Unisex'].includes(p.who) || !['fresh','floral','woody','warm'].includes(p.shape) || !/^#[0-9a-f]{6}$/i.test(p.juice)) throw Error('Invalid product appearance.');
    if (typeof p.img !== 'string' || !(/^(img\/[a-z0-9_.-]+|https:\/\/[^\s<>"']+)$/i.test(p.img))) throw Error('Use an img/ filename or HTTPS image URL.');
    const sizes = Object.keys(p.prices || {});
    if (!sizes.length || sizes.length > 10 || !sizes.includes(String(p.def))) throw Error('Set sizes and a default size.');
    for (const size of sizes) {
      if (!/^\d+$/.test(size) || Number(size) < 1 || Number(size) > 2000 || !Number.isFinite(p.prices[size]) || p.prices[size] <= 0 || p.prices[size] > 100000) throw Error('Sizes and prices must be positive numbers.');
      const stock = p.stock?.[size];
      if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 100000)) throw Error('Stock must be a whole number, or blank for unconfirmed stock.');
    }
    if (!Number.isFinite(p.discountPercent) || p.discountPercent < 0 || p.discountPercent > 90) throw Error('Discount must be between 0 and 90%.');
    for (const key of ['promotionStart','promotionEnd']) if (p[key] && !Number.isFinite(Date.parse(p[key]))) throw Error('Invalid promotion date.');
    if (p.promotionStart && p.promotionEnd && Date.parse(p.promotionEnd) <= Date.parse(p.promotionStart)) throw Error('Promotion end must be after its start.');
  }
}
async function inventoryRoute(request,env) {
  const url = new URL(request.url);
  if (url.pathname === '/admin' || url.pathname === '/admin/') return new Response(ADMIN_HTML, { headers: { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Frame-Options':'DENY', 'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src https: data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'", 'Referrer-Policy':'no-referrer' } });
  if (!url.pathname.startsWith('/api/')) return null;
  if (!env.DB) return json(503,{ok:false,error:'Connect the DB database binding first.'});
  try {
    if (url.pathname === '/api/catalog' && request.method === 'GET') {
      const row = await readCatalog(env);
      return json(200,{ok:true,revision:row.revision,products:JSON.parse(row.data)},{'Access-Control-Allow-Origin':'*'});
    }
    const origin = request.headers.get('Origin');
    if (request.method !== 'GET' && origin !== url.origin) return json(403,{ok:false,error:'Open the admin page directly to make changes.'});
    if (url.pathname === '/api/login' && request.method === 'POST') {
      if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12 || !env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET.length < 32) return json(503,{ok:false,error:'Set ADMIN_PASSWORD (12+ characters) and ADMIN_SESSION_SECRET (32+ characters).'});
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const key = await sign(ip,env.ADMIN_SESSION_SECRET);
      const now = Date.now();
      await env.DB.prepare('INSERT INTO admin_login_attempts (key,attempts,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END').bind(key,now+900000,now,now).run();
      const attempts = await env.DB.prepare('SELECT attempts FROM admin_login_attempts WHERE key=?').bind(key).first();
      if (attempts.attempts > 10) return json(429,{ok:false,error:'Too many attempts. Try again in 15 minutes.'});
      const body = await request.json();
      if (typeof body.password !== 'string' || !await equal(body.password,env.ADMIN_PASSWORD)) return json(401,{ok:false,error:'Incorrect password.'});
      await env.DB.prepare('DELETE FROM admin_login_attempts WHERE key=?').bind(key).run();
      const payload = (Date.now()+28800000)+'.'+crypto.randomUUID();
      const token = payload+'.'+await sign(payload,env.ADMIN_SESSION_SECRET);
      return json(200,{ok:true},{'Set-Cookie':`vin_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`});
    }
    if (!await authorized(request,env)) return json(401,{ok:false,error:'Please sign in.'});
    if (url.pathname === '/api/logout' && request.method === 'POST') return json(200,{ok:true},{'Set-Cookie':'vin_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
    if (url.pathname === '/api/admin/catalog' && request.method === 'GET') {
      const row = await readCatalog(env);
      return json(200,{ok:true,revision:row.revision,products:JSON.parse(row.data)});
    }
    if (url.pathname === '/api/admin/catalog' && request.method === 'PUT') {
      const body = await request.json();
      validateCatalog(body.products);
      const data = JSON.stringify(body.products);
      if (data.length > 900000) return json(400,{ok:false,error:'Catalog is too large. Use hosted image URLs.'});
      const row = await env.DB.prepare('UPDATE shop_catalog SET data=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING revision').bind(data,body.revision).first();
      if (!row) return json(409,{ok:false,error:'Catalog changed in another tab. Reload before editing again.'});
      return json(200,{ok:true,revision:row.revision});
    }
    return json(404,{ok:false,error:'Not found.'});
  } catch(e) { return json(400,{ok:false,error:e.message?.startsWith('D1') ? 'Database not initialized. Run inventory-schema.sql first.' : String(e.message || 'Invalid request')}); }
}

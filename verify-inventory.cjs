const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
async function main(){
 const rulesContext={};vm.runInNewContext(fs.readFileSync('catalog-rules.js','utf8'),rulesContext);const rules=rulesContext.VinCatalogRules;
 const p={prices:{100:125},stock:{100:3},discountPercent:15};assert.equal(rules.price(p,100),106.25);assert.equal(rules.stock(p,100),3);assert.equal(rules.stock(p,50),null);assert.equal(rules.price({...p,promotionStart:'2030-01-01T00:00:00Z'},100,0),125);assert.equal(rules.price({...p,promotionEnd:'2020-01-01T00:00:00Z'},100,Date.now()),125);
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('inventory-schema.sql','utf8'));
 const DB={prepare(sql){return{bind(...values){return{async run(){return db.prepare(sql).run(...values)},async first(){return db.prepare(sql).get(...values)||null}}},async first(){return db.prepare(sql).get()||null}}}};
 const env={DB,ADMIN_PASSWORD:'test-password-only-123',ADMIN_SESSION_SECRET:'test-session-secret-only-at-least-32-characters',TELEGRAM_BOT_TOKEN:'test',TELEGRAM_CHAT_ID:'test'};
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('cloudflare-inventory-worker.js','utf8')).toString('base64'));
 const base='https://shop-service.example';
 async function req(path,method='GET',data,cookie){return worker.fetch(new Request(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);}
 assert.equal((await req('/api/admin/catalog')).status,401);
 assert.equal((await req('/api/login','POST',{password:'wrong'})).status,401);
 const login=await req('/api/login','POST',{password:env.ADMIN_PASSWORD});assert.equal(login.status,200);const cookie=login.headers.get('Set-Cookie').split(';')[0];assert.match(login.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Strict/);
 const catalog=await(await req('/api/catalog')).json();assert.equal(catalog.products.length,56);const edited=catalog.products;edited[0].stock['100']=4;edited[0].discountPercent=10;
 assert.equal((await req('/api/admin/catalog','PUT',{revision:catalog.revision,products:edited},cookie)).status,200);
 assert.equal((await req('/api/admin/catalog','PUT',{revision:catalog.revision,products:edited},cookie)).status,409);
 const saved=await(await req('/api/catalog')).json();assert.equal(saved.products[0].stock['100'],4);assert.equal(saved.products[0].discountPercent,10);
 const extra=structuredClone(saved.products[0]);extra.id='new-test-product';extra.title='Test New Product';extra.name='New Product';extra.stock['100']=0;saved.products.push(extra);
 assert.equal((await req('/api/admin/catalog','PUT',{revision:saved.revision,products:saved.products},cookie)).status,200);
 const latest=await(await req('/api/catalog')).json();assert.equal(latest.products.length,57);
 const soldOut=new FormData();soldOut.set('order',JSON.stringify({items:[{name:extra.title,size:100,unit:Math.round(extra.prices[100]*0.9*100)/100,qty:1}]}));
 assert.equal((await worker.fetch(new Request(base+'/',{method:'POST',headers:{Origin:'https://vperfume.sengmakhevin.workers.dev'},body:soldOut}),env)).status,409);
 edited[0].stock['100']=-1;assert.equal((await req('/api/admin/catalog','PUT',{revision:latest.revision,products:edited},cookie)).status,400);
 const cross=await worker.fetch(new Request(base+'/api/login',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({password:env.ADMIN_PASSWORD})}),env);assert.equal(cross.status,403);
 const tampered=cookie.slice(0,-1)+'x';assert.equal((await req('/api/admin/catalog','GET',undefined,tampered)).status,401);
 const invalid=new FormData();invalid.set('order',JSON.stringify({items:[{name:saved.products[0].title,size:100,unit:1,qty:1}]}));const order=await worker.fetch(new Request(base+'/',{method:'POST',headers:{Origin:'https://vperfume.sengmakhevin.workers.dev'},body:invalid}),env);assert.equal(order.status,409);
 assert.equal((await req('/api/admin/payway-test','POST',{productId:'sauvage',size:100,quantity:1})).status,401);
 assert.equal((await req('/api/admin/payway-test','POST',{productId:'sauvage',size:100,quantity:1},cookie)).status,503);
 env.PAYWAY_MERCHANT_ID='test-sandbox-merchant';env.PAYWAY_API_KEY='fake-sandbox-key-for-tests-only';
 const realFetch=globalThis.fetch;let calls=0;
 try {
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/generate-qr');const body=JSON.parse(options.body);assert.equal(body.amount,128);assert.equal(body.currency,'USD');assert.equal(body.tran_id.length,20);assert.equal(body.phone,'');assert.equal(body.email,'');const canonical=body.req_time+body.merchant_id+body.tran_id+'128'+body.items+'Sandbox'+'Test'+'purchase'+'abapay_khqr'+'USD'+'6'+'template3_color';assert.equal(body.hash,require('node:crypto').createHmac('sha512',env.PAYWAY_API_KEY).update(canonical).digest('base64'));return new Response(JSON.stringify({status:{code:'0'},amount:128,currency:'USD',qrString:'test-qr',abapay_deeplink:'abamobilebank://ababank.com?type=payway&qrcode=test-qr',qrImage:'data:image/png;base64,test'}));};
  const response=await req('/api/admin/payway-test','POST',{productId:'sauvage',size:100,quantity:1,amount:0.01},cookie);assert.equal(response.status,200);const result=await response.json();assert.equal(result.amount,128);assert.equal(result.mode,'sandbox');assert.ok(!JSON.stringify(result).includes(env.PAYWAY_API_KEY));assert.equal(calls,1);
  assert.equal((await req('/api/admin/payway-test','POST',{productId:'sauvage',size:100,quantity:99},cookie)).status,409);assert.equal(calls,1);
  globalThis.fetch=async()=>new Response(JSON.stringify({status:{code:'12',message:'not exposed'}}));assert.equal((await req('/api/admin/payway-test','POST',{productId:'sauvage',size:100,quantity:1},cookie)).status,502);
  globalThis.fetch=async()=>new Response(JSON.stringify({status:{code:'0'},amount:1,currency:'USD',qrString:'test',abapay_deeplink:'abamobilebank://ababank.com?type=payway&qrcode=test'}));assert.equal((await req('/api/admin/payway-test','POST',{productId:'sauvage',size:100,quantity:1},cookie)).status,502);
 }finally{globalThis.fetch=realFetch;}
 for(const m of fs.readFileSync('admin.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(m[1]);
 console.log('Passed: catalog seed, stock and discounts, date boundaries, login, session tampering, CSRF, catalog updates, revision conflicts, invalid stock, and server-side price validation.');
 console.log('Passed: sandbox-only PayWay URL, admin access, secret configuration, server-calculated amount, HMAC-SHA512 signature, stock limits, secret redaction and provider error handling. No real PayWay requests made.');
 db.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});

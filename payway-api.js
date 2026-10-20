// Sandbox only. This endpoint requires an existing admin session.
// Real customer payment buttons remain unchanged until production is configured.
async function paywayRoute(request,env) {
  const url=new URL(request.url);
  if(url.pathname!=='/api/admin/payway-test')return null;
  if(request.method!=='POST')return json(405,{ok:false,error:'Use POST.'});
  if(request.headers.get('Origin')!==url.origin)return json(403,{ok:false,error:'Open the admin page directly.'});
  if(!await authorized(request,env))return json(401,{ok:false,error:'Please sign in.'});
  if(!env.PAYWAY_MERCHANT_ID||!env.PAYWAY_API_KEY)return json(503,{ok:false,error:'Set PAYWAY_MERCHANT_ID and PAYWAY_API_KEY as sandbox secrets.'});
  if(!env.DB)return json(503,{ok:false,error:'Database binding is missing.'});
  try {
    const input=await request.json();
    if(!Number.isInteger(input.quantity)||input.quantity<1||input.quantity>99||!Number.isInteger(input.size))return json(400,{ok:false,error:'Choose a size and a quantity from 1 to 99.'});
    const row=await readCatalog(env),products=JSON.parse(row.data);
    const product=products.find(p=>p.id===input.productId);
    if(!product||!Object.hasOwn(product.prices,input.size))return json(400,{ok:false,error:'Publish the product and size before testing.'});
    const stock=product.stock?.[input.size];
    if(Number.isInteger(stock)&&input.quantity>stock)return json(409,{ok:false,error:'The published stock is too low for this quantity.'});
    const now=Date.now();
    const discount=(!product.promotionStart||now>=Date.parse(product.promotionStart))&&(!product.promotionEnd||now<Date.parse(product.promotionEnd))?product.discountPercent||0:0;
    const unitCents=Math.round(product.prices[input.size]*(1-discount/100)*100);
    const amount=(unitCents*input.quantity+200)/100;
    // Only data from the published catalog and synthetic test-customer names is sent.
    const txn='VPT'+crypto.randomUUID().replaceAll('-','').slice(0,17);
    const body={req_time:new Date().toISOString().replace(/\D/g,'').slice(0,14),merchant_id:env.PAYWAY_MERCHANT_ID,tran_id:txn,
      amount,items:btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify([{name:'SANDBOX TEST '+product.title,quantity:input.quantity,price:unitCents/100},{name:'Delivery',quantity:1,price:2}])))),
      first_name:'Sandbox',last_name:'Test',email:'',phone:'',purchase_type:'purchase',payment_option:'abapay_khqr',callback_url:'',return_deeplink:'',currency:'USD',custom_fields:'',return_params:'',payout:'',lifetime:6,qr_image_template:'template3_color'};
    const order=['req_time','merchant_id','tran_id','amount','items','first_name','last_name','email','phone','purchase_type','payment_option','callback_url','return_deeplink','currency','custom_fields','return_params','payout','lifetime','qr_image_template'];
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.PAYWAY_API_KEY),{name:'HMAC',hash:'SHA-512'},false,['sign']);
    body.hash=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(order.map(k=>String(body[k]??'')).join(''))))));
    // Fixed sandbox URL: no user input or environment flag can select production.
    const upstream=await fetch('https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/generate-qr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    const result=await upstream.json().catch(()=>null);
    if(!upstream.ok||!result||String(result.status?.code)!=='0') {
      const code=String(result?.status?.code??upstream.status).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,20);
      return json(502,{ok:false,error:'PayWay sandbox rejected the request (code '+code+'). Check that both credentials are from the same sandbox account.',providerCode:code});
    }
    if(result.currency!=='USD'||Math.abs(Number(result.amount)-amount)>0.001||typeof result.qrString!=='string'||!/^abamobilebank:\/\/ababank\.com\?/.test(result.abapay_deeplink||''))return json(502,{ok:false,error:'PayWay returned an unexpected currency, amount or payment link.'});
    return json(200,{ok:true,mode:'sandbox',transactionId:txn,amount,currency:'USD',qrString:result.qrString,deeplink:result.abapay_deeplink,qrImage:typeof result.qrImage==='string'&&result.qrImage.startsWith('data:image/png;base64,')?result.qrImage:null});
  }catch{return json(502,{ok:false,error:'Sandbox request could not complete. No payment has been confirmed. Try again later.'});}
}

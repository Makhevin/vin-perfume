// Small catalog photos live in the existing D1 database.
const photoTable = 'CREATE TABLE IF NOT EXISTS product_photos (id TEXT PRIMARY KEY, content_type TEXT NOT NULL, data BLOB NOT NULL)';
async function photoRoute(request,env){
 const url=new URL(request.url);
 const match=/^\/images\/([a-f0-9-]{36})\.jpg$/.exec(url.pathname);
 if(match&&['GET','HEAD'].includes(request.method)){
  if(!env.DB)return new Response('Not found',{status:404});
  try{const row=await env.DB.prepare('SELECT content_type,data FROM product_photos WHERE id=?').bind(match[1]).first();
   if(!row)return new Response('Not found',{status:404});
   return new Response(request.method==='HEAD'?null:new Uint8Array(row.data),{headers:{'Content-Type':row.content_type,'Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':'*'}});
  }catch{return new Response('Not found',{status:404});}
 }
 if(url.pathname!=='/api/admin/photos')return null;
 if(request.method!=='POST')return json(405,{ok:false,error:'Use POST.'});
 if(request.headers.get('Origin')!==url.origin)return json(403,{ok:false,error:'Open the admin page directly.'});
 if(!await authorized(request,env))return json(401,{ok:false,error:'Please sign in.'});
 if(!env.DB)return json(503,{ok:false,error:'Database is not connected.'});
 if(Number(request.headers.get('Content-Length'))>900000)return json(413,{ok:false,error:'Choose a smaller photo.'});
 try{
  const form=await request.formData(),file=form.get('photo');
  if(!(file instanceof File)||file.type!=='image/jpeg'||file.size<4||file.size>800000)return json(400,{ok:false,error:'Upload a JPEG under 800 KB.'});
  const bytes=await file.arrayBuffer(),signature=new Uint8Array(bytes);
  if(signature[0]!==255||signature[1]!==216||signature[2]!==255)return json(400,{ok:false,error:'Invalid JPEG image.'});
  await env.DB.prepare(photoTable).run();
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT INTO product_photos (id,content_type,data) VALUES (?,?,?)').bind(id,'image/jpeg',bytes).run();
  return json(201,{ok:true,url:url.origin+'/images/'+id+'.jpg'});
 }catch{return json(500,{ok:false,error:'Photo upload failed. Please try again.'});}
}

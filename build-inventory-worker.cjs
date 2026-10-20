const fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),context);
const order=fs.readFileSync('telegram-order-worker.js','utf8').replace('export default {','const orderService = {');
const api=fs.readFileSync('inventory-api.js','utf8');
const photos=fs.readFileSync('photo-api.js','utf8');
const admin=fs.readFileSync('admin.html','utf8').replace('</html>','<script>'+fs.readFileSync('admin-photo.js','utf8')+'</script></html>');
fs.writeFileSync('cloudflare-inventory-worker.js',`const INITIAL_CATALOG = ${JSON.stringify(context.window.VIN_CATALOG)};\nconst ADMIN_HTML = ${JSON.stringify(admin)};\n${api}\n${photos}\n${order}\nexport default { async fetch(request,env) { const photo=await photoRoute(request,env); if(photo)return photo; const response=await inventoryRoute(request,env); return response || orderService.fetch(request,env); } };\n`);

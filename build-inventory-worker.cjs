const fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync('catalog.js','utf8'),context);
const order=fs.readFileSync('telegram-order-worker.js','utf8').replace('export default {','const orderService = {');
const api=fs.readFileSync('inventory-api.js','utf8');
fs.writeFileSync('cloudflare-inventory-worker.js',`const INITIAL_CATALOG = ${JSON.stringify(context.window.VIN_CATALOG)};\nconst ADMIN_HTML = ${JSON.stringify(fs.readFileSync('admin.html','utf8'))};\n${api}\n${order}\nexport default { async fetch(request,env) { const response=await inventoryRoute(request,env); return response || orderService.fetch(request,env); } };\n`);

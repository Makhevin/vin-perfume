// Cloudflare secrets: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.
// Accepts the storefront's multipart order + receipt. Never confirms bank payment.
export default {
  async fetch(request, env) {
    const allowed = new Set(['https://vperfume.sengmakhevin.workers.dev', 'https://vin-perfume.pages.dev']);
    const origin = request.headers.get('Origin');
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
      'Cache-Control': 'no-store'
    };
    if (allowed.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowed.has(origin)) return reply(403, { ok: false, error: 'Origin not allowed' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method === 'GET') return reply(200, { ok: true, service: 'VR Scent order receiver' });
    if (request.method !== 'POST') return reply(405, { ok: false, error: 'Method not allowed' });
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return reply(503, { ok: false, error: 'Order service is not configured' });
    if (!request.headers.get('Content-Type')?.includes('multipart/form-data')) return reply(415, { ok: false, error: 'Expected order and receipt form data' });
    if (Number(request.headers.get('Content-Length')) > 9 * 1024 * 1024) return reply(413, { ok: false, error: 'Upload too large' });
    try {
      const form = await request.formData();
      const raw = form.get('order');
      const receipt = form.get('receipt');
      if (typeof raw !== 'string' || raw.length > 50000) return reply(400, { ok: false, error: 'Invalid order' });
      const order = JSON.parse(raw);
      if (env.DB) {
        const catalogRow = await readCatalog(env);
        const catalog = JSON.parse(catalogRow.data);
        const requested = new Map();
        for (const item of order.items || []) {
          const product = catalog.find(p => p.title === item.name && Object.prototype.hasOwnProperty.call(p.prices,item.size));
          if (!product) return reply(400,{ok:false,error:'A product is no longer available. Refresh your cart.'});
          const discount = (!product.promotionStart || Date.now() >= Date.parse(product.promotionStart)) && (!product.promotionEnd || Date.now() < Date.parse(product.promotionEnd)) ? product.discountPercent || 0 : 0;
          const expected = Math.round(product.prices[item.size]*(1-discount/100)*100)/100;
          if (item.unit !== expected) return reply(409,{ok:false,error:'Prices have changed. Refresh the store and check your total before paying.'});
          const key = product.id+'|'+item.size;
          requested.set(key,(requested.get(key)||0)+item.qty);
          const stock = product.stock?.[item.size];
          if (Number.isInteger(stock) && requested.get(key) > stock) return reply(409,{ok:false,error:'Not enough stock. Contact the shop before paying again.'});
        }
      }
      const c = order.customer;
      const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1000;
      if (!text(order.id) || !c || !text(c.name) || !text(c.phone) || !text(c.address) || !Array.isArray(order.items) || !order.items.length || order.items.length > 100) return reply(400, { ok: false, error: 'Incomplete order' });
      if (!(receipt instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(receipt.type) || receipt.size < 1 || receipt.size > 8 * 1024 * 1024) return reply(400, { ok: false, error: 'Receipt must be a JPG, PNG or WebP under 8 MB' });
      let subtotal = 0;
      const lines = [];
      for (const item of order.items) {
        if (!text(item.name) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99 || !Number.isFinite(item.unit) || item.unit <= 0 || !Number.isFinite(item.size) || item.size <= 0) return reply(400, { ok: false, error: 'Invalid item' });
        subtotal += item.unit * item.qty;
        lines.push(`${item.qty} x ${item.name}, ${item.size} ml: $${(item.unit * item.qty).toFixed(2)}`);
      }
      // Prices originate in the browser: owner must verify against actual catalog and bank.
      if (!Number.isFinite(order.shipping) || order.shipping !== 2 || !Number.isFinite(order.total) || Math.abs(order.total - subtotal - order.shipping) > 0.01) return reply(400, { ok: false, error: 'Invalid order totals' });
      const message = [`Order ${order.id}`, 'PAYMENT PENDING MANUAL BANK VERIFICATION', 'Verify stock, catalog prices and bank receipt before shipping.', ...lines, `Delivery: $${order.shipping.toFixed(2)}`, `Customer-reported total: $${order.total.toFixed(2)}`, `Name: ${c.name}`, `Phone: ${c.phone}`, `Address: ${c.address}`].join('\n');
      const data = new FormData();
      data.set('chat_id', env.TELEGRAM_CHAT_ID);
      data.set('document', receipt, 'payment-receipt.' + ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[receipt.type]));
      // Telegram document captions have a 1024-character limit. Refuse before sending.
      if (message.length > 1000) return reply(400, { ok: false, error: 'Order details too long; please contact us on Telegram' });
      data.set('caption', message);
      const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: data, signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok || !result.ok) return reply(502, { ok: false, error: 'Telegram could not receive the order. Contact the shop before retrying.' });
      return reply(200, { ok: true, orderId: order.id });
    } catch {
      return reply(400, { ok: false, error: 'Could not process the order. Contact the shop before retrying.' });
    }
  }
};

const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if (script[1].trim()) new Function(script[1]);
}
const start = html.indexOf('  function goToPayment()');
const end = html.indexOf('  async function confirmOrder()', start);
function run({ confirmed = true, name = 'Test Customer', phone = '012345678', address = 'Test address' } = {}) {
  const nodes = {};
  for (const [id, value] of Object.entries({ 'f-name': name, 'f-phone': phone, 'f-address': address })) nodes[id] = { value, focus() {} };
  nodes['form-error'] = { textContent: '' };
  nodes['stock-confirmed'] = { checked: confirmed, focus() {} };
  nodes['cart-body'] = { querySelector() { return { focus() {} }; } };
  const context = { $: id => nodes[id], cart: [{id:'test',size:100,qty:1}], byId:{test:{}}, stockOf:()=>5, flow: {}, buildOrder: () => ({ total: 107 }), khqrFor: amount => 'qr:' + amount, qrPng: qr => qr, renderCart() {} };
  vm.runInNewContext(html.slice(start, end) + '\ngoToPayment();', context);
  return { error: nodes['form-error'].textContent, flow: context.flow };
}
assert.match(run({ confirmed: false }).error, /confirm stock/);
assert.match(run({ name: '' }).error, /name/);
assert.match(run({ phone: '' }).error, /phone/);
assert.match(run({ phone: '123' }).error, /8 digits/);
assert.match(run({ address: '' }).error, /address/);
const valid = run();
assert.equal(valid.error, '');
assert.equal(valid.flow.step, 'pay');
assert.equal(valid.flow.khqr, 'qr:107');
const imageSources = html + (fs.existsSync('catalog.js') ? fs.readFileSync('catalog.js','utf8') : '');
const missing = [...new Set(imageSources.match(/img\/[A-Za-z0-9_.-]+/g))].filter(p => !fs.existsSync(p));
assert.deepEqual(missing, []);
console.log('Passed: script syntax, stock gate, required fields, phone validation, payment transition, and image paths.');

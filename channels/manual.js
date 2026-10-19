// Bestellingen die je zelf invoert, bijvoorbeeld van Marktplaats.
// Het adres wordt alleen bewaard tot je de bestelling als verzonden markeert; daarna wordt alles gewist.
const crypto = require('crypto');
const store = require('../store');
const products = require('../products');

// Een pakket wordt vervangen door de losse artikelen, zodat de pakbon precies zegt wat erin moet.
function expandBundles(items) {
  const out = [];
  for (const item of items) {
    const p = products.find((x) => x.ean === item.ean);
    if (p && p.bundle) {
      for (const [ean, qty] of p.bundle) {
        const part = products.find((x) => x.ean === ean);
        out.push({ ean, title: part ? part.title : ean, quantity: qty * item.quantity });
      }
    } else out.push(item);
  }
  // Dezelfde artikelen samenvoegen
  const merged = [];
  for (const item of out) {
    const same = merged.find((m) => m.ean && m.ean === item.ean);
    if (same) same.quantity += item.quantity;
    else merged.push({ ...item });
  }
  return merged;
}

const KEY = 'manual_orders';

async function list() {
  return store.get(KEY, []);
}

function text(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

async function nextOrderNumber() {
  const now = new Date();
  const day = now.toISOString().slice(2, 10).replace(/-/g, '');
  const counter = (await store.get('manual_counter', {}));
  counter[day] = (counter[day] || 0) + 1;
  await store.set('manual_counter', { [day]: counter[day] });
  return `MP-${day}-${String(counter[day]).padStart(2, '0')}`;
}

async function add(input) {
  const items = expandBundles((Array.isArray(input.items) ? input.items : [])
    .map((i) => ({ ean: text(i.ean, 20), title: text(i.title, 200), quantity: Math.max(1, Math.min(999, parseInt(i.quantity, 10) || 1)) }))
    .filter((i) => i.title));
  const order = {
    channel: 'marktplaats',
    id: crypto.randomUUID(),
    orderNumber: '',
    name: text(input.name),
    address: {
      line1: text(input.line1),
      line2: text(input.line2),
      postalCode: text(input.postalCode, 12),
      city: text(input.city, 60),
      country: text(input.country, 2).toUpperCase() || 'NL',
    },
    items,
    created: new Date().toISOString(),
  };
  if (!order.name || !order.address.line1 || !order.address.postalCode || !order.address.city) {
    throw new Error('Vul naam, straat, postcode en plaats in.');
  }
  if (!items.length) throw new Error('Kies minstens één product.');
  order.orderNumber = await nextOrderNumber();
  const orders = await list();
  orders.push(order);
  await store.set(KEY, orders);
  return order;
}

async function remove(id) {
  const orders = await list();
  await store.set(KEY, orders.filter((o) => o.id !== id));
}

module.exports = {
  name: 'marktplaats',
  configured: () => true,
  getOpenOrders: list,
  markShipped: remove, // verzonden = gegevens wissen, er is geen koppeling met Marktplaats
  add,
  remove,
};

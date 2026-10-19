// Testmodus: verzonnen bestellingen om de pakbon te controleren zonder eBay-koppeling.
const store = require('../store');

const ORDERS = [
  {
    channel: 'demo',
    id: 'DEMO-1001',
    orderNumber: 'DEMO-1001',
    name: 'Jan Testpersoon',
    address: { line1: 'Voorbeeldstraat 12', line2: '', postalCode: '1234 AB', city: 'Utrecht', country: 'NL' },
    items: [
      { ean: '8721082290449', title: 'Minifiguren wapens set 10 stuks - zwart - compatibel met bouwstenen', quantity: 1 },
    ],
    created: '2026-10-20T09:15:00Z',
  },
  {
    channel: 'demo',
    id: 'DEMO-1002',
    orderNumber: 'DEMO-1002',
    name: 'Petra de Proef-Verzinsel',
    address: { line1: 'Lange Nepweg 345', line2: 'Appartement 2b', postalCode: '9876ZX', city: 'Groot Ammers Alblasserwaard', country: 'NL' },
    items: [
      { ean: '8721082290043', title: 'Militaire body armour set 36 delig zand - voor minifiguren - bouwstenen', quantity: 2 },
      { ean: '8721082290456', title: 'Ghillie suit camouflage voor minifiguren - sniper - compatibel bouwstenen', quantity: 1 },
    ],
    created: '2026-10-20T14:40:00Z',
  },
];

async function getOpenOrders() {
  const shipped = await store.get('demo_shipped', []);
  return ORDERS.filter((o) => !shipped.includes(o.id));
}

async function markShipped(id) {
  const shipped = await store.get('demo_shipped', []);
  if (!shipped.includes(id)) shipped.push(id);
  await store.set('demo_shipped', shipped);
}

async function reset() {
  await store.del('demo_shipped');
}

module.exports = { name: 'demo', getOpenOrders, markShipped, reset };

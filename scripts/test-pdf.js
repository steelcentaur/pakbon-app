// Maakt test-pakbonnen.pdf met de verzonnen bestellingen uit de testmodus.
const fs = require('fs');
const path = require('path');
const { buildPdf } = require('../pdf');
const demo = require('../channels/demo');

(async () => {
  await demo.reset();
  const orders = await demo.getOpenOrders();
  const out = path.join(__dirname, '..', 'test-pakbonnen.pdf');
  const stream = buildPdf([...orders, ...orders]).pipe(fs.createWriteStream(out));
  stream.on('finish', () => console.log(`Klaar: ${out}`));
})();

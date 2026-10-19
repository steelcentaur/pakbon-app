// Pakbon-app: bestellingen ophalen, pakbonnen downloaden als PDF en "verzonden" melden.
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const store = require('./store');
const auth = require('./auth');
const { buildPdf } = require('./pdf');
const ebay = require('./channels/ebay');
const bol = require('./channels/bol');
const demo = require('./channels/demo');

const app = express();
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const DELETION_PATH = '/ebay/account-deletion';

function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

// ---------- Openbaar: verplichte eBay-melding "Marketplace Account Deletion" ----------
app.get(DELETION_PATH, (req, res) => {
  const challenge = req.query.challenge_code;
  const token = process.env.EBAY_VERIFICATION_TOKEN || '';
  if (!challenge || !token) return res.status(400).json({ error: 'challenge_code of EBAY_VERIFICATION_TOKEN ontbreekt' });
  const endpoint = baseUrl(req) + DELETION_PATH;
  const hash = crypto.createHash('sha256').update(challenge + token + endpoint).digest('hex');
  res.json({ challengeResponse: hash });
});

// We bewaren geen gegevens van eBay-kopers, dus er valt niets te verwijderen.
app.post(DELETION_PATH, (req, res) => res.sendStatus(200));

// ---------- Inloggen ----------
const loginAttempts = new Map();

function loginPage(error) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Inloggen - Pakbonnen</title>
<link rel="stylesheet" href="/style.css"></head><body class="login">
<form method="post" action="/login" class="card">
<h1>📦 Pakbonnen</h1>
${error ? `<p class="error">${error}</p>` : ''}
${process.env.APP_PASSWORD ? '' : '<p class="error">Er is nog geen wachtwoord ingesteld. Vul in Replit bij Secrets de sleutel APP_PASSWORD in.</p>'}
<label>Wachtwoord<input type="password" name="password" autocomplete="current-password" autofocus required></label>
<button type="submit" class="primary">Inloggen</button>
</form></body></html>`;
}

app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'public', 'style.css')));

app.get('/login', (req, res) => {
  if (auth.isLoggedIn(req)) return res.redirect('/');
  res.send(loginPage());
});

app.post('/login', (req, res) => {
  const key = req.ip;
  const attempt = loginAttempts.get(key) || { count: 0, until: 0 };
  if (attempt.until > Date.now()) return res.status(429).send(loginPage('Te veel pogingen. Wacht een paar minuten.'));
  if (auth.passwordMatches(req.body.password)) {
    loginAttempts.delete(key);
    auth.setSession(res, req);
    return res.redirect('/');
  }
  attempt.count += 1;
  if (attempt.count >= 5) {
    attempt.until = Date.now() + 5 * 60 * 1000;
    attempt.count = 0;
  }
  loginAttempts.set(key, attempt);
  res.status(401).send(loginPage('Verkeerd wachtwoord.'));
});

app.get('/logout', (req, res) => {
  auth.clearSession(res);
  res.redirect('/login');
});

// ---------- Alles hieronder alleen na inloggen ----------
app.use(auth.requireLogin([DELETION_PATH, '/login', '/style.css']));
app.use(express.static(path.join(__dirname, 'public')));

async function demoMode() {
  return Boolean(await store.get('demo_mode', !ebay.configured() && !bol.configured()));
}

async function activeChannels() {
  if (await demoMode()) return [demo];
  return [bol, ebay].filter((c) => c.configured());
}

// Haalt alle kanalen op; als er één niet werkt, krijg je de rest wel en een waarschuwing.
async function allOpenOrders() {
  const orders = [];
  const warnings = [];
  const channels = await activeChannels();
  if (!channels.length) warnings.push('Er is nog geen verkoopkanaal ingesteld. Kijk bij Instellingen wat je nog moet invullen.');
  const results = await Promise.allSettled(channels.map((c) => c.getOpenOrders()));
  for (const r of results) {
    if (r.status === 'fulfilled') orders.push(...r.value);
    else {
      console.error(r.reason.message);
      warnings.push(r.reason.message);
    }
  }
  orders.sort((a, b) => String(a.created).localeCompare(String(b.created)));
  return { orders, warnings };
}

async function printedMap() {
  const printed = await store.get('printed', {});
  const cutoff = Date.now() - 120 * 24 * 60 * 60 * 1000;
  for (const [id, when] of Object.entries(printed)) if (Date.parse(when) < cutoff) delete printed[id];
  return printed;
}

const orderKey = (o) => `${o.channel}:${o.id}`;

const wrapAsync = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  });

app.get('/api/status', wrapAsync(async (req, res) => {
  res.json({
    demo: await demoMode(),
    ebay: await ebay.status(),
    bol: await bol.status(),
    deletionUrl: baseUrl(req) + DELETION_PATH,
    callbackUrl: baseUrl(req) + '/auth/ebay/callback',
    verificationTokenSet: Boolean(process.env.EBAY_VERIFICATION_TOKEN),
  });
}));

app.post('/api/demo', wrapAsync(async (req, res) => {
  await store.set('demo_mode', Boolean(req.body.on));
  if (req.body.on) await demo.reset();
  res.json({ ok: true });
}));

app.get('/api/orders', wrapAsync(async (req, res) => {
  const printed = await printedMap();
  const { orders: open, warnings } = await allOpenOrders();
  const orders = open.map((o) => ({
    key: orderKey(o),
    channel: o.channel,
    id: o.id,
    orderNumber: o.orderNumber,
    name: o.name,
    city: o.address.city,
    created: o.created,
    items: o.items.map((i) => ({ title: i.title, quantity: i.quantity, ean: i.ean })),
    printedAt: printed[orderKey(o)] || null,
  }));
  res.json({ orders, warnings });
}));

// ?keys=ebay:123,ebay:456 voor bepaalde bestellingen, anders alle nog niet geprinte.
app.get('/api/pdf', wrapAsync(async (req, res) => {
  const printed = await printedMap();
  const wanted = req.query.keys ? String(req.query.keys).split(',') : null;
  const { orders: open } = await allOpenOrders();
  const orders = open.filter((o) =>
    wanted ? wanted.includes(orderKey(o)) : req.query.all === '1' || !printed[orderKey(o)]
  );
  const now = new Date().toISOString();
  for (const o of orders) printed[orderKey(o)] = now;
  await store.set('printed', printed);
  const date = now.slice(0, 10);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="pakbonnen-${date}.pdf"`);
  buildPdf(orders).pipe(res);
}));

app.post('/api/orders/:channel/:id/shipped', wrapAsync(async (req, res) => {
  const channel = (await activeChannels()).find((c) => c.name === req.params.channel);
  if (!channel) return res.status(400).json({ error: 'Onbekend verkoopkanaal' });
  await channel.markShipped(req.params.id);
  res.json({ ok: true });
}));

// ---------- eBay koppelen ----------
app.get('/auth/ebay/start', wrapAsync(async (req, res) => {
  if (!ebay.configured()) return res.status(400).send('Vul eerst EBAY_CLIENT_ID, EBAY_CLIENT_SECRET en EBAY_RUNAME in bij Secrets.');
  res.redirect(await ebay.authorizeUrl());
}));

app.get('/auth/ebay/callback', async (req, res) => {
  try {
    if (!req.query.code) throw new Error('eBay heeft geen toestemming gegeven.');
    await ebay.handleCallback(req.query.code, req.query.state);
    await store.set('demo_mode', false);
    res.redirect('/#instellingen');
  } catch (err) {
    console.error(err.message);
    res.status(400).send(`<p>${err.message}</p><p><a href="/#instellingen">Terug</a></p>`);
  }
});

app.post('/api/ebay/disconnect', wrapAsync(async (req, res) => {
  await ebay.disconnect();
  res.json({ ok: true });
}));

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`Pakbon-app draait op poort ${port}`));

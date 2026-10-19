// eBay-koppeling: inloggen (OAuth), openstaande bestellingen ophalen en "verzonden" melden.
const crypto = require('crypto');
const store = require('../store');

const SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
].join(' ');

function env() {
  return (process.env.EBAY_ENV || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
}

function hosts() {
  return env() === 'production'
    ? { auth: 'https://auth.ebay.com', api: 'https://api.ebay.com' }
    : { auth: 'https://auth.sandbox.ebay.com', api: 'https://api.sandbox.ebay.com' };
}

function configured() {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET && process.env.EBAY_RUNAME);
}

const tokenKey = () => `ebay_token_${env()}`;

function basicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64');
}

async function tokenRequest(params) {
  const res = await fetch(`${hosts().api}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basicAuth() },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`eBay-login mislukt: ${data.error_description || data.error || res.status}`);
  return data;
}

// Stap 1: de link waarmee je in eBay toestemming geeft.
async function authorizeUrl() {
  const state = crypto.randomBytes(16).toString('hex');
  await store.set('ebay_oauth_state', state);
  const params = new URLSearchParams({
    client_id: process.env.EBAY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.EBAY_RUNAME,
    scope: SCOPES,
    state,
  });
  return `${hosts().auth}/oauth2/authorize?${params}`;
}

// Stap 2: eBay stuurt je terug met een code; die ruilen we om voor sleutels.
async function handleCallback(code, state) {
  const expected = await store.get('ebay_oauth_state');
  if (!expected || state !== expected) throw new Error('Ongeldige terugkeer van eBay (state klopt niet). Probeer opnieuw te koppelen.');
  await store.del('ebay_oauth_state');
  const data = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: process.env.EBAY_RUNAME });
  const now = Date.now();
  await store.set(tokenKey(), {
    accessToken: data.access_token,
    accessExpires: now + (data.expires_in - 120) * 1000,
    refreshToken: data.refresh_token,
    refreshExpires: now + (data.refresh_token_expires_in || 0) * 1000,
    connectedAt: new Date(now).toISOString(),
  });
}

async function accessToken() {
  const t = await store.get(tokenKey());
  if (!t || !t.refreshToken) throw new Error('eBay is nog niet gekoppeld. Ga naar Instellingen en klik op "Koppel eBay-account".');
  if (t.accessToken && t.accessExpires > Date.now()) return t.accessToken;
  const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refreshToken, scope: SCOPES });
  t.accessToken = data.access_token;
  t.accessExpires = Date.now() + (data.expires_in - 120) * 1000;
  await store.set(tokenKey(), t);
  return t.accessToken;
}

async function status() {
  const t = await store.get(tokenKey());
  return {
    env: env(),
    configured: configured(),
    connected: Boolean(t && t.refreshToken),
    connectedAt: t ? t.connectedAt : null,
    refreshExpires: t && t.refreshExpires ? new Date(t.refreshExpires).toISOString() : null,
  };
}

async function disconnect() {
  await store.del(tokenKey());
}

function toOrder(o) {
  const step = (o.fulfillmentStartInstructions || [])[0] || {};
  const shipTo = (step.shippingStep || {}).shipTo || {};
  const a = shipTo.contactAddress || {};
  return {
    channel: 'ebay',
    id: o.orderId,
    orderNumber: o.orderId,
    name: shipTo.fullName || (o.buyer && o.buyer.username) || '',
    address: {
      line1: a.addressLine1 || '',
      line2: a.addressLine2 || '',
      postalCode: a.postalCode || '',
      city: a.city || '',
      country: a.countryCode || '',
    },
    items: (o.lineItems || []).map((li) => ({
      // Zet in je eBay-advertentie het "Aangepast label (SKU)" op de EAN, dan komt die hier op de pakbon.
      ean: li.sku || '',
      sku: li.sku || '',
      itemId: li.legacyItemId || li.lineItemId,
      title: li.title,
      quantity: li.quantity,
    })),
    created: o.creationDate,
  };
}

async function getOpenOrders() {
  const token = await accessToken();
  const orders = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      filter: 'orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}',
      limit: '200',
      offset: String(offset),
    });
    const res = await fetch(`${hosts().api}/sell/fulfillment/v1/order?${params}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data.errors && data.errors[0] && data.errors[0].message) || res.status;
      throw new Error(`Bestellingen ophalen bij eBay mislukt: ${msg}`);
    }
    for (const o of data.orders || []) {
      const cancelled = o.cancelStatus && o.cancelStatus.cancelState === 'CANCELED';
      const paid = ['PAID', 'PARTIALLY_REFUNDED'].includes(o.orderPaymentStatus);
      if (paid && !cancelled) orders.push(toOrder(o));
    }
    offset += 200;
    if (!data.total || offset >= data.total) break;
  }
  return orders.sort((a, b) => String(a.created).localeCompare(String(b.created)));
}

// Verzonden melden zonder track & trace (brievenbuspost met postzegel).
// De Fulfillment API wil altijd een trackingnummer, daarom gebruiken we CompleteSale uit de Trading API.
async function markShipped(orderId) {
  const token = await accessToken();
  const body = `<?xml version="1.0" encoding="utf-8"?>
<CompleteSaleRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <OrderID>${String(orderId).replace(/[^A-Za-z0-9-]/g, '')}</OrderID>
  <Shipped>true</Shipped>
</CompleteSaleRequest>`;
  const res = await fetch(`${hosts().api}/ws/api.dll`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'X-EBAY-API-CALL-NAME': 'CompleteSale',
      'X-EBAY-API-SITEID': '146',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1193',
      'X-EBAY-API-IAF-TOKEN': token,
    },
    body,
  });
  const xml = await res.text();
  const ack = (xml.match(/<Ack>([^<]+)<\/Ack>/) || [])[1];
  if (!res.ok || !['Success', 'Warning'].includes(ack)) {
    const msg = (xml.match(/<LongMessage>([^<]+)<\/LongMessage>/) || [])[1] || `status ${res.status}`;
    throw new Error(`Verzonden melden bij eBay mislukt: ${msg}`);
  }
}

module.exports = { name: 'ebay', env, configured, status, authorizeUrl, handleCallback, disconnect, getOpenOrders, markShipped };

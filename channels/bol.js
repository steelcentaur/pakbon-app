// bol.com-koppeling (Retailer API v10), net als in de Mendix-app:
// inloggen met Client ID/Secret, open bestellingen ophalen en verzending melden.
const API = 'https://api.bol.com';
const TOKEN_URL = 'https://login.bol.com/token?grant_type=client_credentials';
const MEDIA_TYPE = 'application/vnd.retailer.v10+json';

let cachedToken = null; // { token, expires }

function configured() {
  return Boolean(process.env.BOL_CLIENT_ID && process.env.BOL_CLIENT_SECRET);
}

// PostNL (TNT) zonder track & trace, zoals je in het bol-portaal kiest voor brievenbuspost met postzegel.
// Pakketten mét track & trace meld je gewoon zelf in het bol-portaal.
function transporterCode() {
  return process.env.BOL_TRANSPORTER_CODE || 'TNT';
}

async function token() {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.token;
  const basic = Buffer.from(`${process.env.BOL_CLIENT_ID}:${process.env.BOL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Inloggen bij bol mislukt: ${data.error_description || data.error || res.status}`);
  cachedToken = { token: data.access_token, expires: Date.now() + ((data.expires_in || 299) - 30) * 1000 };
  return cachedToken.token;
}

async function call(method, path, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${await token()}`,
        Accept: MEDIA_TYPE,
        ...(body ? { 'Content-Type': MEDIA_TYPE } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      // Te veel verzoeken: even wachten zoals bol aangeeft.
      const wait = Number(res.headers.get('retry-after') || 2);
      await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
      continue;
    }
    if (res.status === 401) cachedToken = null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.detail || data.title || (data.violations && data.violations.map((v) => v.reason).join(', ')) || res.status;
      throw new Error(`bol: ${detail}`);
    }
    return data;
  }
  throw new Error('bol: te veel verzoeken, probeer het zo opnieuw.');
}

function openItems(order) {
  return (order.orderItems || [])
    .map((it) => ({ ...it, open: (it.quantity || 0) - (it.quantityShipped || 0) - (it.quantityCancelled || 0) }))
    .filter((it) => it.open > 0 && !it.cancellationRequest && (!it.fulfilment || it.fulfilment.method === 'FBR'));
}

function toOrder(o) {
  const s = o.shipmentDetails || {};
  const ext = s.houseNumberExtension ? String(s.houseNumberExtension).trim() : '';
  const number = [s.houseNumber, ext].filter(Boolean).join(/^[A-Za-z]{1,2}$/.test(ext) ? '' : ' ');
  const street = [s.streetName, number].filter(Boolean).join(' ');
  return {
    channel: 'bol',
    id: o.orderId,
    orderNumber: o.orderId,
    name: [s.firstName, s.surname].filter(Boolean).join(' ') || s.company || '',
    address: {
      line1: street,
      line2: s.extraAddressInformation || '',
      postalCode: s.zipCode || '',
      city: s.city || '',
      country: s.countryCode || '',
    },
    items: openItems(o).map((it) => ({
      orderItemId: it.orderItemId,
      ean: (it.product && it.product.ean) || '',
      title: (it.product && it.product.title) || '',
      quantity: it.open,
    })),
    created: o.orderPlacedDateTime,
  };
}

async function getOpenOrders() {
  const summaries = [];
  for (let page = 1; page <= 20; page++) {
    const data = await call('GET', `/retailer/orders?page=${page}&fulfilment-method=FBR&status=OPEN`);
    const list = data.orders || [];
    summaries.push(...list);
    if (list.length < 50) break;
  }
  const orders = [];
  for (const s of summaries) {
    const full = await call('GET', `/retailer/orders/${encodeURIComponent(s.orderId)}`);
    const order = toOrder(full);
    if (order.items.length) orders.push(order);
  }
  return orders.sort((a, b) => String(a.created).localeCompare(String(b.created)));
}

async function waitForProcess(processStatusId) {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const st = await call('GET', `/shared/process-status/${encodeURIComponent(processStatusId)}`);
    if (st.status === 'SUCCESS') return;
    if (st.status === 'FAILURE' || st.status === 'TIMEOUT') throw new Error(`bol weigerde de verzending: ${st.errorMessage || st.status}`);
  }
  // Nog bezig: bol verwerkt het meestal binnen een minuut.
}

async function markShipped(orderId) {
  const full = await call('GET', `/retailer/orders/${encodeURIComponent(orderId)}`);
  const items = openItems(full);
  if (!items.length) return;
  const result = await call('POST', '/retailer/shipments', {
    orderItems: items.map((it) => ({ orderItemId: it.orderItemId, quantity: it.open })),
    transport: { transporterCode: transporterCode() },
  });
  if (result.processStatusId) await waitForProcess(result.processStatusId);
}

async function status() {
  if (!configured()) return { configured: false, ok: false };
  try {
    await token();
    return { configured: true, ok: true, transporterCode: transporterCode() };
  } catch (err) {
    return { configured: true, ok: false, error: err.message, transporterCode: transporterCode() };
  }
}

module.exports = { name: 'bol', configured, status, getOpenOrders, markShipped };

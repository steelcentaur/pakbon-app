const $ = (id) => document.getElementById(id);
const CHANNEL_NAMES = { bol: 'bol', ebay: 'eBay', marktplaats: 'Marktplaats', demo: 'test' };
let orders = [];
let products = [];

function toast(message, isError) {
  const t = $('toast');
  t.textContent = message;
  t.classList.toggle('error-toast', Boolean(isError));
  t.style.display = 'block';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.style.display = 'none'), isError ? 6000 : 3000);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Niet ingelogd');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fout ${res.status}`);
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function renderOrders() {
  const box = $('orders');
  box.replaceChildren();
  const fresh = orders.filter((o) => !o.printedAt);
  const printed = orders.filter((o) => o.printedAt);

  $('count').textContent = fresh.length ? plural(fresh.length, 'nieuwe bestelling', 'nieuwe bestellingen') : 'Geen nieuwe bestellingen';
  $('summary').textContent = orders.length
    ? `${plural(orders.length, 'bestelling', 'bestellingen')} nog te verzenden · bijgewerkt om ${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
    : 'Alles is verzonden. 🎉';

  const dl = $('download');
  dl.hidden = !orders.length;
  dl.textContent = fresh.length ? `🖨️ Pakbonnen downloaden (${fresh.length})` : '🖨️ Alle pakbonnen opnieuw downloaden';
  dl.href = fresh.length ? '/api/pdf' : '/api/pdf?all=1';
  dl.classList.toggle('primary', fresh.length > 0);

  $('ship-all').hidden = printed.length === 0;
  $('ship-all').textContent = `✅ Geprinte als verzonden melden (${printed.length})`;

  for (const o of orders) {
    const status = o.printedAt
      ? el('span', { class: 'badge printed' }, 'geprint')
      : el('span', { class: 'badge new' }, 'nieuw');
    const channel = el('span', { class: `badge channel-${o.channel}` }, CHANNEL_NAMES[o.channel] || o.channel);
    const items = el('ul', {}, ...o.items.map((i) => el('li', {}, el('strong', {}, `${i.quantity}×`), ` ${i.title}`)));
    box.append(
      el('div', { class: `card order${o.printedAt ? ' is-printed' : ''}` },
        el('div', { class: 'order-head' }, el('h3', {}, o.name), el('div', {}, channel, ' ', status)),
        el('div', { class: 'meta' }, `${o.city} · ${formatDate(o.created)}`),
        items,
        el('div', { class: 'actions' },
          el('a', { class: 'button small', href: `/api/pdf?keys=${encodeURIComponent(o.key)}`, onclick: () => setTimeout(loadOrders, 2500) }, '🖨️ Pakbon'),
          el('button', { class: 'small success', onclick: () => ship([o]) }, '✅ Verzonden')
        ),
        el('div', { class: 'meta small-text' }, `Bestelnummer ${o.orderNumber}`)
      )
    );
  }
}

async function loadOrders() {
  $('refresh').disabled = true;
  $('refresh').textContent = '⏳ Bezig met ophalen…';
  try {
    const data = await api('/api/orders');
    orders = data.orders;
    $('warnings').replaceChildren(...(data.warnings || []).map((w) => el('p', { class: 'notice error' }, `⚠️ ${w}`)));
    renderOrders();
  } catch (err) {
    $('warnings').replaceChildren(el('p', { class: 'notice error' }, `⚠️ ${err.message}`));
  } finally {
    $('refresh').disabled = false;
    $('refresh').textContent = '🔄 Vernieuwen';
  }
}

async function ship(list) {
  const names = list.map((o) => `• ${o.name} (${CHANNEL_NAMES[o.channel] || o.channel})`).join('\n');
  if (!confirm(`${plural(list.length, 'bestelling', 'bestellingen')} als verzonden melden?\n\n${names}`)) return;
  let ok = 0;
  for (const o of list) {
    try {
      await api(`/api/orders/${encodeURIComponent(o.channel)}/${encodeURIComponent(o.id)}/shipped`, { method: 'POST' });
      ok++;
    } catch (err) {
      toast(`${o.name}: ${err.message}`, true);
    }
  }
  if (ok) toast(`✅ ${plural(ok, 'bestelling', 'bestellingen')} gemeld als verzonden.`);
  loadOrders();
}

function setStatus(iconId, textId, ok, text) {
  $(iconId).textContent = ok === true ? '✅' : ok === false ? '⚠️' : '⚪';
  $(textId).textContent = text;
}

async function loadStatus() {
  const status = await api('/api/status');
  $('demo-banner').hidden = !status.demo;
  $('demo-toggle').checked = status.demo;
  $('callback-url').textContent = status.callbackUrl;
  $('deletion-url').textContent = status.deletionUrl;
  $('verification-hint').textContent = status.verificationTokenSet
    ? '✅ Verificatietoken is ingesteld.'
    : '⚠️ EBAY_VERIFICATION_TOKEN is nog niet ingesteld.';

  const b = status.bol;
  if (!b.configured) setStatus('bol-icon', 'bol-status', null, 'Nog niet ingesteld (vul de bol-secrets in).');
  else if (b.ok) setStatus('bol-icon', 'bol-status', true, `Gekoppeld · verzenden als ${b.transporterCode}`);
  else setStatus('bol-icon', 'bol-status', false, `Inloggen lukt niet: ${b.error}`);

  const e = status.ebay;
  const envText = e.env === 'production' ? '' : ' (testomgeving)';
  if (!e.configured) setStatus('ebay-icon', 'ebay-status', null, `Nog niet ingesteld${envText} (vul de eBay-secrets in).`);
  else if (e.connected) setStatus('ebay-icon', 'ebay-status', true, `Gekoppeld${envText} sinds ${formatDate(e.connectedAt)}` +
    (e.refreshExpires ? ` · opnieuw koppelen rond ${new Date(e.refreshExpires).toLocaleDateString('nl-NL')}` : ''));
  else setStatus('ebay-icon', 'ebay-status', false, `Nog niet gekoppeld${envText}. Tik op de knop hieronder.`);
  $('ebay-connect').hidden = !e.configured;
  $('ebay-connect').textContent = e.connected ? 'eBay opnieuw koppelen' : 'Koppel eBay-account';
  $('ebay-disconnect').hidden = !e.connected;
}

// ---------- Marktplaats-bestelling invoeren ----------

// Haalt naam, straat, postcode en plaats uit geplakte tekst zoals "Jan Jansen\nDorpsstraat 12\n1234 AB Utrecht".
function parseAddress(raw) {
  const lines = raw.split(/\r?\n|,/).map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/^(nederland|netherlands|the netherlands|belgi[eë]|belgium)$/i.test(l));
  const result = { name: '', line1: '', line2: '', postalCode: '', city: '', country: /belgi|belgium/i.test(raw) ? 'BE' : 'NL' };
  let pcIndex = -1;
  lines.forEach((line, i) => {
    if (pcIndex >= 0) return;
    const nl = line.match(/^(\d{4})\s*([A-Za-z]{2})\b\s*(.*)$/);
    const be = line.match(/^(?:B-)?(\d{4})\s+([A-Za-zÀ-ÿ' .-]{2,})$/);
    if (nl) {
      result.postalCode = `${nl[1]} ${nl[2].toUpperCase()}`;
      result.city = nl[3] || lines[i + 1] || '';
      pcIndex = i;
    } else if (be) {
      result.postalCode = be[1];
      result.city = be[2];
      result.country = 'BE';
      pcIndex = i;
    }
  });
  const before = pcIndex >= 0 ? lines.slice(0, pcIndex) : lines;
  const streetIdx = before.findIndex((l, i) => i > 0 && /\d/.test(l));
  result.name = before[0] || '';
  if (streetIdx > 0) {
    result.line1 = before[streetIdx];
    result.line2 = before.filter((_, i) => i !== 0 && i !== streetIdx).join(', ');
  } else {
    result.line1 = before[1] || '';
    result.line2 = before.slice(2).join(', ');
  }
  return result;
}

function itemRow(selected) {
  const select = el('select', {}, ...products.map((p) => el('option', { value: p.ean }, p.title)));
  if (selected) select.value = selected;
  const qty = el('input', { type: 'number', min: '1', max: '999', value: '1', inputmode: 'numeric' });
  const row = el('div', { class: 'item-row' }, select, qty,
    el('button', { type: 'button', title: 'Verwijderen', onclick: () => { if ($('m-items').children.length > 1) row.remove(); } }, '✕'));
  return row;
}

function resetManualForm() {
  for (const id of ['m-paste', 'm-name', 'm-line1', 'm-line2', 'm-postcode', 'm-city']) $(id).value = '';
  $('m-country').value = 'NL';
  $('m-items').replaceChildren(itemRow());
}

async function openManualForm() {
  if (!products.length) products = (await api('/api/products')).products;
  resetManualForm();
  $('manual-form').hidden = false;
  $('manual-open').hidden = true;
  $('manual-form').scrollIntoView({ behavior: 'smooth' });
  $('m-paste').focus();
}

function closeManualForm() {
  $('manual-form').hidden = true;
  $('manual-open').hidden = false;
}

async function saveManualOrder() {
  const items = [...$('m-items').children].map((row) => {
    const ean = row.querySelector('select').value;
    const p = products.find((x) => x.ean === ean) || {};
    return { ean, title: p.title, quantity: row.querySelector('input').value };
  });
  $('m-save').disabled = true;
  try {
    const res = await api('/api/manual-orders', {
      method: 'POST',
      body: JSON.stringify({
        name: $('m-name').value, line1: $('m-line1').value, line2: $('m-line2').value,
        postalCode: $('m-postcode').value, city: $('m-city').value, country: $('m-country').value, items,
      }),
    });
    toast(`✅ Bestelling ${res.orderNumber} toegevoegd.`);
    closeManualForm();
    loadOrders();
  } catch (err) {
    toast(err.message, true);
  } finally {
    $('m-save').disabled = false;
  }
}

$('manual-open').addEventListener('click', () => openManualForm().catch((err) => toast(err.message, true)));
$('m-cancel').addEventListener('click', closeManualForm);
$('m-save').addEventListener('click', saveManualOrder);
$('m-add-item').addEventListener('click', () => $('m-items').append(itemRow()));
$('m-paste').addEventListener('input', () => {
  const a = parseAddress($('m-paste').value);
  $('m-name').value = a.name;
  $('m-line1').value = a.line1;
  $('m-line2').value = a.line2;
  $('m-postcode').value = a.postalCode;
  $('m-city').value = a.city;
  $('m-country').value = a.country;
});

function showPage() {
  const page = location.hash === '#instellingen' ? 'instellingen' : 'bestellingen';
  $('page-bestellingen').hidden = page !== 'bestellingen';
  $('page-instellingen').hidden = page !== 'instellingen';
  $('tab-bestellingen').classList.toggle('active', page === 'bestellingen');
  $('tab-instellingen').classList.toggle('active', page === 'instellingen');
}

$('refresh').addEventListener('click', loadOrders);
$('ship-all').addEventListener('click', () => ship(orders.filter((o) => o.printedAt)));
$('download').addEventListener('click', () => setTimeout(loadOrders, 2500));
$('demo-toggle').addEventListener('change', async (e) => {
  await api('/api/demo', { method: 'POST', body: JSON.stringify({ on: e.target.checked }) });
  await loadStatus();
  loadOrders();
});
$('ebay-disconnect').addEventListener('click', async () => {
  if (!confirm('Koppeling met eBay verbreken?')) return;
  await api('/api/ebay/disconnect', { method: 'POST' });
  loadStatus();
});
window.addEventListener('hashchange', showPage);

showPage();
loadStatus().catch((err) => toast(err.message, true));
loadOrders();

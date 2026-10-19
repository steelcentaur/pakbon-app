// Maakt de pakbon-PDF, met dezelfde maten als de pakbon uit de bol-app:
// A4, marges 36pt, Helvetica, en alle bestellingen lopen door over de pagina's heen.
const path = require('path');
const PDFDocument = require('pdfkit');

const PAGE_W = 595.296;
const PAGE_H = 841.896;
const MARGIN = 36;
const WIDTH = PAGE_W - 2 * MARGIN; // 523.296
const BOTTOM = PAGE_H - MARGIN;
const ICON = path.join(__dirname, 'assets', 'ce-0-3.png');

// Kolommen van de artikeltabel (posities uit de originele pakbon)
const QTY_X = 418.636;
const LOC_X = 470.965;
const QTY_W = LOC_X - QTY_X;
const TITLE_W = QTY_X - 8;

const NOTICE = 'Let op: De CE-markering en leeftijdsbeperking zijn van toepassing op alle bestelde producten.';

// Regelhoogte is overal 1,2 x de lettergrootte; de tekst staat net als in het origineel
// 0,1375 x de lettergrootte onder de bovenkant van de regel.
const lineHeight = (size) => size * 1.2;
const textOffset = (size) => size * 0.1375;

// Helvetica in PDFKit kent alleen West-Europese tekens; de rest maken we leesbaar.
function clean(text) {
  return String(text || '')
    .normalize('NFC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E -ÿ]/g, (ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?'));
}

function wrap(doc, text, size, width) {
  doc.font('Helvetica').fontSize(size);
  const lines = [];
  for (const paragraph of clean(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (doc.widthOfString(candidate) <= width || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function postcode(code, country) {
  const c = clean(code).toUpperCase().trim();
  return country === 'NL' ? c.replace(/\s+/g, '') : c;
}

function addressLines(o) {
  const a = o.address;
  const lines = [o.name, a.line1];
  if (a.line2) lines.push(a.line2);
  lines.push(`${postcode(a.postalCode, a.country)} ${clean(a.city).toUpperCase()}`.trim());
  lines.push(a.country);
  return lines.filter((l) => l && String(l).trim());
}

function buildPdf(orders) {
  const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: true, info: { Title: 'Pakbonnen' } });
  let y = MARGIN;

  const ensure = (h) => {
    if (y + h > BOTTOM + 0.01) {
      doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
      y = MARGIN;
    }
  };

  const text = (str, x, top, size) => {
    doc.font('Helvetica').fontSize(size).fillColor('black').text(str, MARGIN + x, top + textOffset(size), {
      lineBreak: false,
    });
  };

  const hline = (top, dash, cap) => {
    doc.save().lineWidth(1.2).strokeColor('black').lineCap(cap || 'butt');
    if (dash) doc.dash(dash[0], { space: dash[1] });
    doc.moveTo(MARGIN, top + 0.6).lineTo(MARGIN + WIDTH, top + 0.6).stroke();
    doc.undash().restore();
  };

  orders.forEach((o, index) => {
    if (index > 0) y += 3;

    // 1. Adres, heel groot
    for (const line of addressLines(o)) {
      for (const part of wrap(doc, line, 50, WIDTH)) {
        ensure(lineHeight(50));
        text(part, 0, y, 50);
        y += lineHeight(50);
      }
    }

    // 2. Stippellijn + bestelnummer
    ensure(1.2 + lineHeight(26));
    hline(y, [0.001, 2.389], 'round');
    y += 1.2;
    text('Bestelnummer:', 0, y, 26);
    text(clean(o.orderNumber), 193.619, y, 26);
    y += lineHeight(26);

    // 3. Artikelen
    o.items.forEach((item, i) => {
      ensure(lineHeight(24) * 2);
      text(clean(item.ean || item.sku || item.itemId || ''), 0, y, 24);
      if (i === 0) {
        text('Qty', QTY_X, y, 24);
        text('Loc', LOC_X, y, 24);
      }
      y += lineHeight(24);
      wrap(doc, item.title, 24, TITLE_W).forEach((part, j) => {
        ensure(lineHeight(24));
        text(part, 0, y, 24);
        if (j === 0) {
          const qty = String(item.quantity || 1);
          doc.font('Helvetica').fontSize(24);
          text(qty, QTY_X + (QTY_W - doc.widthOfString(qty)) / 2, y, 24);
        }
        y += lineHeight(24);
      });
    });

    // 4. Doorgetrokken lijn
    ensure(1.2);
    hline(y);
    y += 1.2;

    // 5. CE + 0-3 met de waarschuwing, daarna de knipstreep
    const noticeLines = wrap(doc, NOTICE, 20, WIDTH - 115.125);
    const blockH = Math.max(72, noticeLines.length * lineHeight(20)) + 1.2;
    ensure(blockH);
    doc.image(ICON, MARGIN + 18.562, y + 13.809, { width: 78, height: 39 });
    noticeLines.forEach((line, j) => text(line, 115.125, y + j * lineHeight(20), 20));
    hline(y + blockH - 1.2, [7.319, 3.659]);
    y += blockH;
  });

  if (!orders.length) text('Geen bestellingen om te printen.', 0, y, 26);
  doc.end();
  return doc;
}

module.exports = { buildPdf };

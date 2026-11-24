// src/modules/printables/printables.pdf.js
// Draws the PDFs. Takes plain, already-formatted text (no database, no dates to work out) and returns a Buffer.
// Uses DejaVu Sans, which is bundled in src/assets/fonts, so the Naira sign and accented names (Ọlá, Ẹbun, Chukwuemeka) print correctly.
// The built-in PDF fonts cannot do that.

const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_DIR = path.join(__dirname, '../../assets/fonts');
const INK = '#1a1a1a';
const MUTED = '#666666';
const RULE = '#bbbbbb';
const RED = '#b00020';
const LEFT = 50;
const WIDTH = 495; // A4 is 595 wide; 50 margin each side

// Collects the document in memory, so a drawing error becomes a normal error response instead of a half-sent file
function build(title, draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, compress: true, info: { Title: title, Author: 'NTIC Admissions', Creator: 'NTIC Admission System', Producer: 'NTIC Admission System' } });
    doc.registerFont('R', path.join(FONT_DIR, 'DejaVuSans.ttf'));
    doc.registerFont('B', path.join(FONT_DIR, 'DejaVuSans-Bold.ttf'));
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try { draw(doc); doc.end(); } catch (err) { reject(err); }
  });
}

function rule(doc, y = doc.y, color = RULE) {
  doc.save().moveTo(LEFT, y).lineTo(LEFT + WIDTH, y).lineWidth(0.8).strokeColor(color).stroke().restore();
}

function letterhead(doc, lines) {
  const [name, ...rest] = lines;
  doc.font('B').fontSize(16).fillColor(INK).text(name || '', LEFT, 50, { width: WIDTH, align: 'center' });
  for (const l of rest) doc.font('R').fontSize(9.5).fillColor(MUTED).text(l, LEFT, doc.y, { width: WIDTH, align: 'center' });
  const y = doc.y + 8;
  doc.save().moveTo(LEFT, y).lineTo(LEFT + WIDTH, y).lineWidth(1.4).strokeColor(INK).stroke().restore();
  doc.y = y + 18;
}

function heading(doc, text) {
  doc.font('B').fontSize(10).fillColor(MUTED).text(text.toUpperCase(), LEFT, doc.y, { width: WIDTH, characterSpacing: 0.8 });
  rule(doc, doc.y + 2);
  doc.y += 9;
}

// Label on the left, value on the right; the row is as tall as its value needs
function rows(doc, list, { x = LEFT, width = WIDTH, labelWidth = 150 } = {}) {
  for (const [label, value] of list) {
    if (value === undefined || value === null || value === '') continue;
    const valueWidth = width - labelWidth;
    doc.font('B').fontSize(10.5);
    const h = Math.max(doc.heightOfString(String(value), { width: valueWidth }), 13);
    const y = doc.y;
    doc.font('R').fontSize(9).fillColor(MUTED).text(label, x, y + 1.5, { width: labelWidth - 8 });
    doc.font('B').fontSize(10.5).fillColor(INK).text(String(value), x + labelWidth, y, { width: valueWidth });
    doc.y = y + h + 6;
  }
}

// ---------------------------------------------------------------- receipt

function renderReceipt(d) {
  return build(`Receipt ${d.receiptNumber}`, (doc) => {
    letterhead(doc, d.letterhead);
    doc.font('B').fontSize(15).fillColor(INK).text(d.isWaiver ? 'FEE WAIVER CONFIRMATION' : 'PAYMENT RECEIPT', LEFT, doc.y, { width: WIDTH, align: 'center' });
    doc.moveDown(0.3);
    doc.font('R').fontSize(11).fillColor(MUTED).text(`No. ${d.receiptNumber}`, LEFT, doc.y, { width: WIDTH, align: 'center' });
    doc.moveDown(1);

    if (d.voidedOn) {
      const y = doc.y;
      doc.save().roundedRect(LEFT, y, WIDTH, 30, 4).lineWidth(1.5).strokeColor(RED).stroke().restore();
      doc.font('B').fontSize(11).fillColor(RED).text(`VOID. This payment was reversed on ${d.voidedOn}. It is not proof of payment.`, LEFT + 10, y + 9, { width: WIDTH - 20, align: 'center' });
      doc.y = y + 44;
    }

    heading(doc, 'Candidate');
    rows(doc, [
      ['Candidate', d.candidate],
      ['Application number', d.applicationNumber],
      ['Campus', d.campus],
      ['Class / category', d.category],
      ['Admission session', d.session],
    ]);
    doc.moveDown(0.6);
    heading(doc, 'Payment');
    rows(doc, [
      ['Date', d.paidOn],
      ['Method', d.method],
      [d.referenceLabel, d.reference],
    ]);

    doc.moveDown(0.4);
    const y = doc.y;
    doc.save().roundedRect(LEFT, y, WIDTH, 52, 4).fillColor('#f3f3f3').fill().restore();
    doc.font('R').fontSize(9).fillColor(MUTED).text(d.isWaiver ? 'AMOUNT WAIVED' : 'AMOUNT RECEIVED', LEFT + 14, y + 9, { width: 200 });
    doc.font('B').fontSize(20).fillColor(d.voidedOn ? MUTED : INK).text(d.amount, LEFT + 14, y + 23, { width: WIDTH - 28 });
    doc.y = y + 68;

    heading(doc, 'Fee position (as at ' + d.generatedOn + ')');
    rows(doc, [
      ['Application fee', d.fee],
      ['Total paid so far', d.paidToDate],
      ['Balance', d.balance],
    ]);

    doc.moveDown(1.2);
    doc.font('R').fontSize(8.5).fillColor(MUTED).text(
      d.isWaiver
        ? 'This confirms that the application fee amount shown above was waived by the school. No money was received.'
        : 'Please keep this receipt as your proof of payment. Quote the receipt number if you contact the school about this payment.',
      LEFT, doc.y, { width: WIDTH }
    );
    doc.text(`Generated on ${d.generatedOn} by the NTIC admission system.`, LEFT, doc.y + 4, { width: WIDTH });
  });
}

// ---------------------------------------------------------------- exam card

function renderExamCard(d) {
  return build(`Exam card ${d.examNumber}`, (doc) => {
    letterhead(doc, d.letterhead);
    doc.font('B').fontSize(15).fillColor(INK).text('EXAMINATION CARD', LEFT, doc.y, { width: WIDTH, align: 'center' });
    doc.moveDown(0.8);

    const top = doc.y;
    // photo box on the right
    doc.save().rect(LEFT + WIDTH - 110, top, 110, 130).lineWidth(0.8).strokeColor(MUTED).stroke().restore();
    doc.font('R').fontSize(8).fillColor(MUTED).text('Affix a recent passport photograph here', LEFT + WIDTH - 104, top + 52, { width: 98, align: 'center' });

    // exam number in a box on the left
    doc.save().roundedRect(LEFT, top, 340, 46, 4).fillColor('#f3f3f3').fill().restore();
    doc.font('R').fontSize(9).fillColor(MUTED).text('EXAM NUMBER', LEFT + 14, top + 8, { width: 300 });
    doc.font('B').fontSize(20).fillColor(INK).text(d.examNumber, LEFT + 14, top + 20, { width: 320 });
    doc.y = top + 58;
    rows(doc, [
      ['Candidate', d.candidate],
      ['Application number', d.applicationNumber],
      ['Date of birth', d.dateOfBirth],
      ['Class / category', d.category],
    ], { width: 360, labelWidth: 120 });
    doc.y = Math.max(doc.y, top + 140) + 6;

    heading(doc, 'Examination');
    rows(doc, [
      ['Date', d.date],
      ['Time', d.time],
      ['Duration', d.duration],
      ['Mode', d.mode],
      [d.mode === 'Online' ? 'Where' : 'Venue', d.venue],
      ['Campus', d.campus],
    ]);

    doc.moveDown(0.6);
    heading(doc, 'Instructions');
    doc.font('R').fontSize(10).fillColor(INK);
    for (const line of d.instructions) {
      const y = doc.y;
      doc.text('•', LEFT + 4, y, { width: 12 });
      doc.text(line, LEFT + 20, y, { width: WIDTH - 20 });
      doc.y += 4;
    }
    doc.moveDown(1);
    doc.font('R').fontSize(8.5).fillColor(MUTED).text(`Generated on ${d.generatedOn}. If the date or venue changes, a new card must be printed.`, LEFT, doc.y, { width: WIDTH });
  });
}

// ---------------------------------------------------------------- offer letter

// `c` is the stored snapshot: { letterhead[], issuedOn, reference, title, paragraphs[], signatoryName, signatoryTitle }
function renderOfferLetter(c) {
  return build(`${c.title} ${c.reference}`, (doc) => {
    letterhead(doc, c.letterhead);
    doc.font('R').fontSize(10).fillColor(INK).text(`Date: ${c.issuedOn}`, LEFT, doc.y, { width: WIDTH, align: 'right' });
    doc.text(`Ref: ${c.reference}`, LEFT, doc.y, { width: WIDTH, align: 'right' });
    doc.moveDown(1.4);
    doc.font('B').fontSize(13).fillColor(INK).text(c.title.toUpperCase(), LEFT, doc.y, { width: WIDTH, align: 'center' });
    doc.moveDown(1.2);
    doc.font('R').fontSize(11).fillColor(INK);
    for (const p of c.paragraphs) {
      doc.text(p, LEFT, doc.y, { width: WIDTH, align: 'left', lineGap: 3 });
      doc.moveDown(0.9);
    }
    if (c.signatoryName || c.signatoryTitle) {
      doc.moveDown(2.2);
      if (doc.y > 700) doc.addPage();
      doc.save().moveTo(LEFT, doc.y).lineTo(LEFT + 220, doc.y).lineWidth(0.8).strokeColor(INK).stroke().restore();
      doc.y += 6;
      if (c.signatoryName) doc.font('B').fontSize(11).text(c.signatoryName, LEFT, doc.y, { width: 260 });
      if (c.signatoryTitle) doc.font('R').fontSize(10).fillColor(MUTED).text(c.signatoryTitle, LEFT, doc.y, { width: 260 });
    }
  });
}

module.exports = { renderReceipt, renderExamCard, renderOfferLetter };

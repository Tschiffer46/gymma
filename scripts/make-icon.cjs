/**
 * Genererar en platshållarikon (mörk platta + hantel) utan bildbibliotek.
 *
 * Skriver rå PNG med Nodes inbyggda zlib. Ikonen är avsiktligt enkel och utan
 * alfakanal — Apple avvisar app-ikoner med transparens. Byt ut assets/images/
 * mot en riktig ikon när du har en; det här är bara för att bygget ska gå
 * igenom och appen ska gå att hitta på hemskärmen.
 *
 * Körs med `node scripts/make-icon.cjs`.
 */
const zlib = require("node:zlib");
const fs = require("node:fs");
const path = require("node:path");

const SIZE = 1024;
const BG = [0x13, 0x13, 0x16]; // colors.bg
const FG = [0xf0, 0x60, 0x3c]; // colors.accent

/** Punkt inuti en rektangel med rundade hörn. */
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// Hantel, symmetrisk kring mitten: stång + inre och yttre viktskivor.
// SCALE fyller ut ikonrutan — iOS lägger på en rundad mask, så motivet ska
// nästan nå kanten men inte röra den.
const SCALE = 1.3;
const SHAPES = [
  [380, 482, 644, 542, 16], // stång
  [300, 392, 380, 632, 26], // inre skiva, vänster
  [644, 392, 724, 632, 26], // inre skiva, höger
  [228, 432, 300, 592, 24], // yttre skiva, vänster
  [724, 432, 796, 592, 24], // yttre skiva, höger
].map(([x0, y0, x1, y1, r]) => {
  const s = (v) => SIZE / 2 + (v - SIZE / 2) * SCALE;
  return [s(x0), s(y0), s(x1), s(y1), r * SCALE];
});

function crcTable() {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}
const CRC = crcTable();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function render() {
  // Varje scanline föregås av en filterbyte (0 = ingen filtrering).
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
  let p = 0;
  for (let y = 0; y < SIZE; y++) {
    raw[p++] = 0;
    for (let x = 0; x < SIZE; x++) {
      const on = SHAPES.some((s) => inRoundRect(x, y, s[0], s[1], s[2], s[3], s[4]));
      const c = on ? FG : BG;
      raw[p++] = c[0];
      raw[p++] = c[1];
      raw[p++] = c[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bitdjup
  ihdr[9] = 2; // färgtyp 2 = RGB, ingen alfa
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const png = render();
const dir = path.join(__dirname, "..", "assets", "images");
fs.mkdirSync(dir, { recursive: true });
for (const name of ["icon.png", "adaptive-icon.png"]) {
  fs.writeFileSync(path.join(dir, name), png);
  console.log(`skrev ${path.relative(process.cwd(), path.join(dir, name))} (${png.length} byte)`);
}

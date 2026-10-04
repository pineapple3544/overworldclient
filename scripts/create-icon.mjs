import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
// Rasterize the launcher's own geometric cube mark for Windows app resources.
const size = 256;
const rows = Buffer.alloc((size * 4 + 1) * size);
const faces = [
  {
    points: [
      [128, 48],
      [211, 96],
      [128, 145],
      [45, 96],
    ],
    color: [225, 243, 195, 255],
  },
  {
    points: [
      [45, 96],
      [128, 145],
      [128, 231],
      [45, 182],
    ],
    color: [197, 232, 150, 255],
  },
  {
    points: [
      [128, 145],
      [211, 96],
      [211, 182],
      [128, 231],
    ],
    color: [127, 164, 96, 255],
  },
];
function inside(x, y, points) {
  let found = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0])
      found = !found;
  }
  return found;
}
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    let color = [20, 28, 23, 255];
    const cx = Math.max(35, Math.min(220, x)),
      cy = Math.max(35, Math.min(220, y));
    if ((x - cx) ** 2 + (y - cy) ** 2 > 35 ** 2) color = [0, 0, 0, 0];
    for (const face of faces) if (inside(x + 0.5, y + 0.5, face.points)) color = face.color;
    rows.set(color, y * (size * 4 + 1) + 1 + x * 4);
  }
function crc(buffer) {
  let n = 0xffffffff;
  for (const byte of buffer) {
    n ^= byte;
    for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name),
    length = Buffer.alloc(4),
    sum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, sum]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(rows)),
  chunk('IEND', Buffer.alloc(0)),
]);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await mkdir('build', { recursive: true });
await writeFile('build/icon.png', png);
await writeFile('build/icon.ico', Buffer.concat([header, png]));

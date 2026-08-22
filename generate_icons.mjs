import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(size) {
  // Create uncompressed RGBA pixel data
  const width = size;
  const height = size;
  const buffer = Buffer.alloc((width * 4 + 1) * height);

  const radius = size * 0.22;
  const cx = size / 2;
  const cy = size / 2;

  // Background colors: Warm terracotta/coral to soft amber pastel gradient
  // #c25e36 -> #d97706
  const c1 = [194, 94, 54];
  const c2 = [217, 119, 6];

  let offset = 0;
  for (let y = 0; y < height; y++) {
    buffer[offset++] = 0; // Filter byte: None (0)
    for (let x = 0; x < width; x++) {
      // Rounded squircle mask
      const dx = Math.abs(x + 0.5 - cx);
      const dy = Math.abs(y + 0.5 - cy);
      const half = size / 2;
      const cornerR = size * 0.25;

      let inBounds = true;
      if (dx > half - cornerR && dy > half - cornerR) {
        const cdx = dx - (half - cornerR);
        const cdy = dy - (half - cornerR);
        if (cdx * cdx + cdy * cdy > cornerR * cornerR) {
          inBounds = false;
        }
      }

      if (!inBounds) {
        buffer[offset++] = 0;
        buffer[offset++] = 0;
        buffer[offset++] = 0;
        buffer[offset++] = 0;
        continue;
      }

      // Gradient background
      const t = (x + y) / (width + height);
      let r = Math.round(c1[0] * (1 - t) + c2[0] * t);
      let g = Math.round(c1[1] * (1 - t) + c2[1] * t);
      let b = Math.round(c1[2] * (1 - t) + c2[2] * t);
      let a = 255;

      // Draw rotating tab icon: circular arrows / tab shape
      const distFromCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const ringOuter = size * 0.34;
      const ringInner = size * 0.20;

      // Draw circular tab arrows in white
      if (distFromCenter <= ringOuter && distFromCenter >= ringInner) {
        const angle = Math.atan2(y - cy, x - cx); // -PI to PI
        // create two arcs with gaps
        const normalizedAngle = angle >= 0 ? angle : angle + 2 * Math.PI;
        const inArc1 = normalizedAngle > 0.3 && normalizedAngle < 2.8;
        const inArc2 = normalizedAngle > 3.44 && normalizedAngle < 5.94;

        if (inArc1 || inArc2) {
          r = 255;
          g = 255;
          b = 255;
        }
      }

      // Draw arrowhead 1 & 2
      const arrow1Dist = Math.sqrt((x - (cx + ringOuter * 0.8)) ** 2 + (y - (cy - size * 0.08)) ** 2);
      const arrow2Dist = Math.sqrt((x - (cx - ringOuter * 0.8)) ** 2 + (y - (cy + size * 0.08)) ** 2);
      if (arrow1Dist < size * 0.1 || arrow2Dist < size * 0.1) {
        r = 255;
        g = 255;
        b = 255;
      }

      buffer[offset++] = r;
      buffer[offset++] = g;
      buffer[offset++] = b;
      buffer[offset++] = a;
    }
  }

  // Compress using DEFLATE
  const compressed = zlib.deflateSync(buffer);

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(len + 12);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4);
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, len + 8));
  chunk.writeUInt32BE(crc, len + 8);
  return chunk;
}

// CRC32 table & calculation
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const iconsDir = path.join(process.cwd(), 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const png = createPNG(size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated: ${filePath}`);
});

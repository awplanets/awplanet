import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const projectRoot = path.resolve(import.meta.dirname, "..");
const iconsetDir = path.join(projectRoot, "build", "Awplanet.iconset");
const circleRadiusRatio = 470 / 1024;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function makeIcnsChunk(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, "ascii");
  header.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([header, data]);
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodeRgbaPng(filePath) {
  const png = readFileSync(filePath);
  const signature = png.subarray(0, 8);
  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`${filePath} is not a PNG file.`);
  }

  let offset = 8;
  let header;
  const imageDataChunks = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") header = data;
    if (type === "IDAT") imageDataChunks.push(data);
    offset += 12 + length;
    if (type === "IEND") break;
  }

  if (!header) throw new Error(`${filePath} has no IHDR chunk.`);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colorType = header[9];
  const interlace = header[12];
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`${filePath} must be a non-interlaced 8-bit RGBA PNG.`);
  }

  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(imageDataChunks));
  const pixels = Buffer.alloc(width * height * bytesPerPixel);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const rowOffset = y * rowLength;
    for (let x = 0; x < rowLength; x += 1) {
      const source = inflated[inputOffset + x];
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[rowOffset + x - rowLength] : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel
          ? pixels[rowOffset + x - rowLength - bytesPerPixel]
          : 0;
      let value;
      if (filter === 0) value = source;
      else if (filter === 1) value = source + left;
      else if (filter === 2) value = source + above;
      else if (filter === 3) value = source + Math.floor((left + above) / 2);
      else if (filter === 4) value = source + paethPredictor(left, above, upperLeft);
      else throw new Error(`${filePath} uses unsupported PNG filter ${filter}.`);
      pixels[rowOffset + x] = value & 0xff;
    }
    inputOffset += rowLength;
  }

  return { width, height, pixels };
}

function encodeRgbaPng({ width, height, pixels }) {
  const rowLength = width * 4;
  const raw = Buffer.alloc((rowLength + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const targetOffset = y * (rowLength + 1);
    raw[targetOffset] = 0;
    pixels.copy(raw, targetOffset + 1, y * rowLength, (y + 1) * rowLength);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk("IHDR", header),
    makeChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function applyCircleAlpha(image) {
  const centerX = image.width / 2;
  const centerY = image.height / 2;
  const radius = Math.min(image.width, image.height) * circleRadiusRatio;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      const edgeCoverage = Math.max(0, Math.min(1, radius + 0.5 - distance));
      const alphaOffset = (y * image.width + x) * 4 + 3;
      image.pixels[alphaOffset] = Math.min(
        image.pixels[alphaOffset],
        Math.round(255 * edgeCoverage),
      );
    }
  }
}

const iconFiles = readdirSync(iconsetDir)
  .filter((fileName) => fileName.endsWith(".png"))
  .map((fileName) => path.join(iconsetDir, fileName));

for (const iconFile of iconFiles) {
  const image = decodeRgbaPng(iconFile);
  applyCircleAlpha(image);
  if (image.pixels[3] !== 0) {
    throw new Error(`${iconFile} still has an opaque outer corner.`);
  }
  writeFileSync(iconFile, encodeRgbaPng(image));
}

const icnsPath = path.join(projectRoot, "build", "awplanet.icns");
const icoPath = path.join(projectRoot, "build", "awplanet.ico");
const icnsRepresentations = [
  ["icp4", "icon_16x16.png"],
  ["icp5", "icon_32x32.png"],
  ["ic11", "icon_16x16@2x.png"],
  ["icp6", "icon_32x32@2x.png"],
  ["ic12", "icon_32x32@2x.png"],
  ["ic07", "icon_128x128.png"],
  ["ic13", "icon_128x128@2x.png"],
  ["ic08", "icon_256x256.png"],
  ["ic14", "icon_256x256@2x.png"],
  ["ic09", "icon_512x512.png"],
  ["ic10", "icon_512x512@2x.png"],
];
const icnsChunks = icnsRepresentations.map(([type, fileName]) =>
  makeIcnsChunk(type, readFileSync(path.join(iconsetDir, fileName))),
);
const icnsHeader = Buffer.alloc(8);
icnsHeader.write("icns", 0, 4, "ascii");
icnsHeader.writeUInt32BE(
  8 + icnsChunks.reduce((total, chunk) => total + chunk.length, 0),
  4,
);
writeFileSync(icnsPath, Buffer.concat([icnsHeader, ...icnsChunks]));
execFileSync(
  "sips",
  [
    "-s",
    "format",
    "ico",
    path.join(iconsetDir, "icon_256x256.png"),
    "--out",
    icoPath,
  ],
  { stdio: "ignore" },
);

const publicBrandDir = path.join(projectRoot, "public", "brand");
mkdirSync(publicBrandDir, { recursive: true });
copyFileSync(
  path.join(iconsetDir, "icon_256x256.png"),
  path.join(publicBrandDir, "awplanet-app-icon.png"),
);

console.log(`Updated ${iconFiles.length} transparent app icon sizes.`);

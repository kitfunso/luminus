const zlib = require('zlib');

const PSR_TYPE_TO_FUEL = {
  B01: 'Biomass',
  B02: 'Lignite',
  B03: 'Coal Gas',
  B04: 'Gas',
  B05: 'Hard Coal',
  B06: 'Oil',
  B07: 'Oil Shale',
  B08: 'Peat',
  B09: 'Geothermal',
  B10: 'Hydro Pumped',
  B11: 'Hydro Run-of-river',
  B12: 'Hydro Reservoir',
  B13: 'Marine',
  B14: 'Nuclear',
  B15: 'Other Renewables',
  B16: 'Solar',
  B17: 'Waste',
  B18: 'Wind Offshore',
  B19: 'Wind Onshore',
  B20: 'Other',
};

function parseResolutionMs(resolution) {
  const match = resolution.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  const totalMs =
    (Number(days || 0) * 24 * 60 * 60 * 1000) +
    (Number(hours || 0) * 60 * 60 * 1000) +
    (Number(minutes || 0) * 60 * 1000) +
    (Number(seconds || 0) * 1000);
  return totalMs > 0 ? totalMs : null;
}

function findEocdOffset(buf) {
  const minOffset = Math.max(0, buf.length - 0xffff - 22);
  for (let offset = buf.length - 22; offset >= minOffset; offset--) {
    if (buf.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function extractZipEntries(buf) {
  const eocdOffset = findEocdOffset(buf);
  if (eocdOffset === -1) {
    throw new Error('ZIP end-of-central-directory record not found');
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let offset = centralDirectoryOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('ZIP central-directory entry not found');
    }

    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const fileNameLength = buf.readUInt16LE(offset + 28);
    const extraFieldLength = buf.readUInt16LE(offset + 30);
    const fileCommentLength = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const fileName = buf.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    if (buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error('ZIP local-file header not found');
    }

    const localFileNameLength = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraFieldLength = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
    const compressed = buf.subarray(dataStart, dataStart + compressedSize);

    let content;
    if (compressionMethod === 0) {
      content = compressed;
    } else if (compressionMethod === 8) {
      content = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
    }

    entries.push({ name: fileName, content });
    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

function extractXmlDocumentsFromZipBuffer(buf) {
  return extractZipEntries(buf)
    .filter((entry) => entry.name.toLowerCase().endsWith('.xml'))
    .map((entry) => entry.content.toString('utf8'));
}

function matchText(xml, regex) {
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function parsePoints(periodXml) {
  return [...periodXml.matchAll(/<Point>[\s\S]*?<position>(\d+)<\/position>[\s\S]*?<quantity>([\d.]+)<\/quantity>[\s\S]*?<\/Point>/g)]
    .map((match) => ({
      position: Number(match[1]),
      quantity: Number(match[2]),
    }))
    .sort((a, b) => a.position - b.position);
}

function quantityAtTime(startAt, resolutionMs, points, now) {
  if (points.length === 0) return 0;
  if (!resolutionMs) return points[points.length - 1].quantity;

  const elapsedMs = Math.max(0, now.getTime() - startAt.getTime());
  const targetPosition = Math.floor(elapsedMs / resolutionMs) + 1;

  let current = points[0].quantity;
  for (const point of points) {
    if (point.position > targetPosition) break;
    current = point.quantity;
  }
  return current;
}

function parseCurrentGenerationOutage(xml, now = new Date()) {
  const name = matchText(xml, /<production_RegisteredResource\.name>([^<]+)<\/production_RegisteredResource\.name>/);
  const fuelCode = matchText(xml, /<production_RegisteredResource\.pSRType\.psrType>([^<]+)<\/production_RegisteredResource\.pSRType\.psrType>/);
  const nominalText = matchText(xml, /<production_RegisteredResource\.pSRType\.powerSystemResources\.nominalP[^>]*>([^<]+)<\/production_RegisteredResource\.pSRType\.powerSystemResources\.nominalP>/);
  const typeCode = matchText(xml, /<businessType>([^<]+)<\/businessType>/);
  const periodXml = matchText(xml, /<Available_Period>([\s\S]*?)<\/Available_Period>/);

  if (!name || !nominalText || !periodXml) return null;

  const nominalMW = Number(nominalText);
  if (!Number.isFinite(nominalMW) || nominalMW <= 0) return null;

  const startText = matchText(periodXml, /<start>([^<]+)<\/start>/);
  const endText = matchText(periodXml, /<end>([^<]+)<\/end>/);
  if (!startText || !endText) return null;

  const startAt = new Date(startText);
  const endAt = new Date(endText);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null;
  if (now < startAt || now >= endAt) return null;

  const resolutionText = matchText(periodXml, /<resolution>([^<]+)<\/resolution>/) || 'PT1H';
  const resolutionMs = parseResolutionMs(resolutionText);
  const points = parsePoints(periodXml);
  const availableMW = quantityAtTime(startAt, resolutionMs, points, now);
  const unavailableMW = Math.max(0, nominalMW - availableMW);

  if (unavailableMW <= 0) return null;

  return {
    name,
    fuel: PSR_TYPE_TO_FUEL[fuelCode] || fuelCode || 'Other',
    unavailableMW: Math.round(unavailableMW),
    type: typeCode === 'A54' ? 'unplanned' : 'planned',
    start: startAt.toISOString(),
    expectedReturn: endAt.toISOString(),
  };
}

module.exports = {
  extractXmlDocumentsFromZipBuffer,
  parseCurrentGenerationOutage,
  parseResolutionMs,
};

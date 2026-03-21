const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');

const {
  extractXmlDocumentsFromZipBuffer,
  parseCurrentGenerationOutage,
  parseResolutionMs,
} = require('./lib/entsoe-outages');
const {
  extractHourlyPrices,
} = require('./lib/entsoe-history');

function buildDataDescriptorZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, text] of Object.entries(files)) {
    const fileName = Buffer.from(name, 'utf8');
    const content = Buffer.from(text, 'utf8');
    const compressed = zlib.deflateRawSync(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0008, 6); // data descriptor present
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(0, 14); // crc32 omitted in local header
    localHeader.writeUInt32LE(0, 18); // compressed size omitted
    localHeader.writeUInt32LE(0, 22); // uncompressed size omitted
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const dataDescriptor = Buffer.alloc(16);
    dataDescriptor.writeUInt32LE(0x08074b50, 0);
    dataDescriptor.writeUInt32LE(0, 4); // crc32 not validated by our parser
    dataDescriptor.writeUInt32LE(compressed.length, 8);
    dataDescriptor.writeUInt32LE(content.length, 12);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0008, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, fileName, compressed, dataDescriptor);
    centralParts.push(centralHeader, fileName);
    offset += localHeader.length + fileName.length + compressed.length + dataDescriptor.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

test('parseResolutionMs handles common ENTSO-E intervals', () => {
  assert.equal(parseResolutionMs('PT1M'), 60_000);
  assert.equal(parseResolutionMs('PT15M'), 900_000);
  assert.equal(parseResolutionMs('PT1H'), 3_600_000);
});

test('extractXmlDocumentsFromZipBuffer reads ZIPs that use data descriptors', () => {
  const zip = buildDataDescriptorZip({
    '001.xml': '<doc>alpha</doc>',
    '002.xml': '<doc>beta</doc>',
  });

  const docs = extractXmlDocumentsFromZipBuffer(zip);
  assert.deepEqual(docs, ['<doc>alpha</doc>', '<doc>beta</doc>']);
});

test('parseCurrentGenerationOutage computes current unavailable MW from available capacity points', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Unavailability_MarketDocument>
  <TimeSeries>
    <businessType>A54</businessType>
    <production_RegisteredResource.name>Test CCGT 1</production_RegisteredResource.name>
    <production_RegisteredResource.pSRType.psrType>B04</production_RegisteredResource.pSRType.psrType>
    <production_RegisteredResource.pSRType.powerSystemResources.nominalP unit="MAW">120.0</production_RegisteredResource.pSRType.powerSystemResources.nominalP>
    <Available_Period>
      <timeInterval>
        <start>2026-03-21T10:00:00Z</start>
        <end>2026-03-21T13:00:00Z</end>
      </timeInterval>
      <resolution>PT1H</resolution>
      <Point><position>1</position><quantity>100</quantity></Point>
      <Point><position>2</position><quantity>80</quantity></Point>
      <Point><position>3</position><quantity>40</quantity></Point>
    </Available_Period>
  </TimeSeries>
</Unavailability_MarketDocument>`;

  const outage = parseCurrentGenerationOutage(xml, new Date('2026-03-21T11:30:00Z'));

  assert.deepEqual(outage, {
    name: 'Test CCGT 1',
    fuel: 'Gas',
    unavailableMW: 40,
    type: 'unplanned',
    start: '2026-03-21T10:00:00.000Z',
    expectedReturn: '2026-03-21T13:00:00.000Z',
  });
});

test('extractHourlyPrices averages duplicate time series and aggregates 15-minute points to hourly values', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Publication_MarketDocument>
  <TimeSeries>
    <Period>
      <timeInterval>
        <start>2026-03-18T23:00Z</start>
        <end>2026-03-19T01:00Z</end>
      </timeInterval>
      <resolution>PT15M</resolution>
      <Point><position>1</position><price.amount>100</price.amount></Point>
      <Point><position>2</position><price.amount>104</price.amount></Point>
      <Point><position>3</position><price.amount>108</price.amount></Point>
      <Point><position>4</position><price.amount>112</price.amount></Point>
      <Point><position>5</position><price.amount>120</price.amount></Point>
      <Point><position>6</position><price.amount>124</price.amount></Point>
      <Point><position>7</position><price.amount>128</price.amount></Point>
      <Point><position>8</position><price.amount>132</price.amount></Point>
    </Period>
  </TimeSeries>
  <TimeSeries>
    <Period>
      <timeInterval>
        <start>2026-03-18T23:00Z</start>
        <end>2026-03-19T01:00Z</end>
      </timeInterval>
      <resolution>PT15M</resolution>
      <Point><position>1</position><price.amount>110</price.amount></Point>
      <Point><position>2</position><price.amount>114</price.amount></Point>
      <Point><position>3</position><price.amount>118</price.amount></Point>
      <Point><position>4</position><price.amount>122</price.amount></Point>
      <Point><position>5</position><price.amount>130</price.amount></Point>
      <Point><position>6</position><price.amount>134</price.amount></Point>
      <Point><position>7</position><price.amount>138</price.amount></Point>
      <Point><position>8</position><price.amount>142</price.amount></Point>
    </Period>
  </TimeSeries>
</Publication_MarketDocument>`;

  const parsed = extractHourlyPrices(xml);

  assert.equal(parsed.startUtc, '2026-03-18T23:00:00.000Z');
  assert.equal(parsed.endUtc, '2026-03-19T01:00:00.000Z');
  assert.deepEqual(parsed.hourly, [111, 131]);
});

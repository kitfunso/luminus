function firstUsableIso2(...values) {
  for (const value of values) {
    if (!value) continue;
    const trimmed = String(value).trim();
    if (!trimmed || trimmed === '-99') continue;
    return trimmed;
  }
  return '';
}

function resolveIso2Code(properties = {}) {
  return firstUsableIso2(
    properties.ISO_A2,
    properties.iso_a2,
    properties.ISO_A2_EH,
  );
}

module.exports = {
  firstUsableIso2,
  resolveIso2Code,
};

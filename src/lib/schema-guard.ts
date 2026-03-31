/**
 * Defensive schema-drift guards for GIS tools that rely on external
 * ArcGIS/API field names. Validates expected fields exist in API responses
 * before parsing, so upstream renames fail loudly instead of silently
 * returning bad data.
 */

/**
 * Validate that an ArcGIS feature response contains the expected fields.
 * Checks the first feature's `attributes` object. Skips validation when
 * the features array is empty (no data is not a schema problem).
 *
 * @throws Error with provider name and missing field when validation fails.
 */
export function guardArcGisFields(
  features: Array<{ attributes: Record<string, unknown> }>,
  expectedFields: readonly string[],
  provider: string,
): void {
  if (features.length === 0) return;

  const attributes = features[0].attributes;
  if (!attributes) {
    throw new Error(
      `Schema drift detected in ${provider}: first feature has no "attributes" object. The upstream service may have changed its schema.`,
    );
  }

  for (const field of expectedFields) {
    if (!(field in attributes)) {
      throw new Error(
        `Schema drift detected in ${provider}: expected field "${field}" not found in response. The upstream service may have changed its schema.`,
      );
    }
  }
}

/**
 * Validate that a JSON object has the expected top-level keys.
 *
 * @throws Error with provider name and missing field when validation fails.
 */
export function guardJsonFields(
  data: Record<string, unknown>,
  expectedFields: readonly string[],
  provider: string,
): void {
  for (const field of expectedFields) {
    if (!(field in data)) {
      throw new Error(
        `Schema drift detected in ${provider}: expected field "${field}" not found in response. The upstream service may have changed its schema.`,
      );
    }
  }
}

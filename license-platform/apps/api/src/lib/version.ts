/**
 * Check if a version satisfies a version range pattern.
 *
 * Supported patterns:
 *   null / undefined / "*"  → always valid
 *   "2.x"                   → major must match
 *   "1.x.x"                 → major must match
 *   ">=2.0.0"               → semver gte
 *   "2.0.0-3.9.9"           → inclusive range
 *   "2.1.0"                 → exact match
 */
export function isVersionInRange(version: string, range: string | null): boolean {
  if (!range || range === '*') return true;

  const parseVer = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);

  // Pattern: "2.x" or "1.x.x"
  const wildcardMatch = range.match(/^(\d+)\.x/);
  if (wildcardMatch) {
    const [major] = parseVer(version);
    return major === parseInt(wildcardMatch[1], 10);
  }

  // Pattern: ">=2.0.0"
  const gteMatch = range.match(/^>=(.+)$/);
  if (gteMatch) {
    return compareVersions(version, gteMatch[1]) >= 0;
  }

  // Pattern: "2.0.0-3.9.9"
  const rangeMatch = range.match(/^(.+)-(.+)$/);
  if (rangeMatch) {
    return (
      compareVersions(version, rangeMatch[1]) >= 0 &&
      compareVersions(version, rangeMatch[2]) <= 0
    );
  }

  // Exact match
  return compareVersions(version, range) === 0;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

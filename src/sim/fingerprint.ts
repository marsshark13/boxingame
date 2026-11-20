// Configuration fingerprint (D42, Req 3 c8; task 4.3).
// FNV-1a 32-bit over the UTF-8 bytes of a canonical JSON serialization of the validated
// config: object keys sorted, arrays in order (attacks in registry order), numbers in their
// authored world-unit form. Key order in the authored config therefore does not matter.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Canonical JSON: like JSON.stringify for plain data, but with object keys sorted. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const s = JSON.stringify(value);
    if (s === undefined) throw new Error(`canonicalJson: unsupported value ${String(value)}`);
    return s;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec)
    .filter((k) => rec[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(',')}}`;
}

/** FNV-1a 32-bit hash of the UTF-8 encoding of `text`, as a uint32. */
export function fnv1a32(text: string): number {
  let h = FNV_OFFSET;
  const byte = (b: number) => {
    h ^= b;
    h = Math.imul(h, FNV_PRIME);
  };
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) byte(cp);
    else if (cp < 0x800) {
      byte(0xc0 | (cp >>> 6));
      byte(0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      byte(0xe0 | (cp >>> 12));
      byte(0x80 | ((cp >>> 6) & 0x3f));
      byte(0x80 | (cp & 0x3f));
    } else {
      byte(0xf0 | (cp >>> 18));
      byte(0x80 | ((cp >>> 12) & 0x3f));
      byte(0x80 | ((cp >>> 6) & 0x3f));
      byte(0x80 | (cp & 0x3f));
    }
  }
  return h >>> 0;
}

/** Fingerprint of a validated configuration object. */
export function configFingerprint(validatedConfig: unknown): number {
  return fnv1a32(canonicalJson(validatedConfig));
}

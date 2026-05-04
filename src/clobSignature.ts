import { SignatureTypeV2 } from "@polymarket/clob-client-v2";

export type ClobSignatureLabel = "EOA" | "POLY_PROXY" | "POLY_GNOSIS_SAFE" | "POLY_1271";

const ALIASES: Record<string, ClobSignatureLabel> = {
  "0": "EOA",
  EOA: "EOA",
  "1": "POLY_PROXY",
  POLY_PROXY: "POLY_PROXY",
  PROXY: "POLY_PROXY",
  "2": "POLY_GNOSIS_SAFE",
  POLY_GNOSIS_SAFE: "POLY_GNOSIS_SAFE",
  GNOSIS_SAFE: "POLY_GNOSIS_SAFE",
  SAFE: "POLY_GNOSIS_SAFE",
  "3": "POLY_1271",
  POLY_1271: "POLY_1271"
};

export function parseClobSignatureLabel(raw: string): ClobSignatureLabel {
  const v = raw.trim().toUpperCase().replace(/-/g, "_");
  const mapped = ALIASES[v];
  if (mapped) return mapped;
  throw new Error(`Invalid CLOB_SIGNATURE_TYPE "${raw}". Use EOA, POLY_PROXY, POLY_GNOSIS_SAFE, or POLY_1271.`);
}

export function tryParseClobSignatureLabel(raw: string): ClobSignatureLabel | null {
  const v = raw.trim().toUpperCase().replace(/-/g, "_");
  return ALIASES[v] ?? null;
}

export function signatureTypeV2FromLabel(l: ClobSignatureLabel): SignatureTypeV2 {
  switch (l) {
    case "EOA":
      return SignatureTypeV2.EOA;
    case "POLY_PROXY":
      return SignatureTypeV2.POLY_PROXY;
    case "POLY_GNOSIS_SAFE":
      return SignatureTypeV2.POLY_GNOSIS_SAFE;
    case "POLY_1271":
      return SignatureTypeV2.POLY_1271;
    default:
      return SignatureTypeV2.EOA;
  }
}

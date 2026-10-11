// Helper utility for HSN/SAC definition modules
export const VALID_RATES = new Set([0, 0.1, 0.25, 3, 5, 12, 18, 28]);

export function entry(code, description, gstRate) {
  const c = String(code).trim().replace(/[.\s-]/g, '');
  if (!c) throw new Error('Empty code');
  if (!VALID_RATES.has(gstRate)) {
    throw new Error(`Invalid GST rate ${gstRate} for code ${code}`);
  }
  const d = String(description).trim();
  if (!d) throw new Error(`Empty description for code ${code}`);
  return [c, d, gstRate];
}

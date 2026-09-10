/**
 * Vehicle plate utilities.
 *
 * Simplified: no RNG-based generation. Provides only plate formatting
 * and normalisation for display/search purposes.
 */

/** Characters commonly confused by OCR engines, used for fuzzy matching. */
export const OCR_CONFUSIONS: Array<[string, string]> = [
  ['0', 'O'],
  ['0', 'Q'],
  ['0', 'D'],
  ['1', 'I'],
  ['1', 'L'],
  ['2', 'Z'],
  ['5', 'S'],
  ['8', 'B'],
  ['6', 'G'],
];

/** Removes spaces and common separators, uppercases. */
export function normalisePlate(raw: string): string {
  return raw.replace(/[\s·\-_]/g, '').toUpperCase();
}

/**
 * Renders a normalised plate for display: "MH12KL4471" -> "MH 12 KL 4471".
 * Handles varying series lengths (1 or 2 letters).
 */
export function formatPlate(plate: string): string {
  const normalised = normalisePlate(plate);
  const match = normalised.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  if (!match) return normalised;
  return `${match[1]} ${match[2]} ${match[3]} ${match[4]}`.replace(/\s{2,}/g, ' ').trim();
}

/** Hard-coded set of plates from the real CCTV data that traverse multiple nodes. */
export const FEATURED_PLATES = [
  'DL01VU2612',
  'DL06DC7224',
  'DL10KP1319',
  'DL09WJ9666',
  'DL09FB9320',
  'DL06ZJ4923',
  'DL09VW8973',
  'DL05GB9883',
];

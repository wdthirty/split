// Deterministic per-person colors. A name always maps to the same color, so a
// person looks consistent across the app.
//
// We hash the name into a HUE only, then lock saturation and lightness to a
// fixed, bright band. Because lightness is constant (and high), a generated
// color can NEVER come out dark — it's always legible on the dark ink
// background, regardless of the name. The hue gives near-unlimited variety with
// no palette to maintain and effectively no collisions.
export type NameColor = { text: string; bg: string };

// Locked so every color is vivid and light enough for the dark bg.
const SATURATION = 75; // %
const LIGHTNESS = 68; // %

// FNV-1a — small, fast, well-distributed string hash. Case-insensitive so
// "Marco" and "marco" share a color.
function hash(str: string): number {
  let h = 0x811c9dc5;
  const s = str.trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function nameColor(name: string): NameColor {
  const hue = hash(name) % 360;
  return {
    text: `hsl(${hue} ${SATURATION}% ${LIGHTNESS}%)`,
    // Same hue, low alpha for a subtle pill background behind the text.
    bg: `hsl(${hue} ${SATURATION}% ${LIGHTNESS}% / 0.15)`,
  };
}

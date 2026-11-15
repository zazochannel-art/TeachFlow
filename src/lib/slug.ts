/** Address of a public teacher page: lowercase letters and digits, words joined by "-". */
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const CYR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
};

/** Turns a name into a page address (accents dropped, Cyrillic transliterated): Ana Popescu → ana-popescu. */
export function suggestSlug(name: string) {
  const s = [...name.toLowerCase()].map(c => CYR[c] ?? c).join("")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return s.length >= 3 ? s : `profesor${s ? `-${s}` : ""}`;
}

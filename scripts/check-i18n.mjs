// Checks that every UI string has a Russian and English translation.
// Keys are the Romanian source text: literals passed to t()/t.n(), plus any other
// string literal with Romanian diacritics (status labels, validation messages…).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP = [/src[\\/]lib[\\/]i18n[\\/]/, /src[\\/]lib[\\/]data[\\/]demo\.ts$/];
const ALLOW = new Set(["Română"]);

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

function dict(name) {
  const src = readFileSync(`src/lib/i18n/${name}.ts`, "utf8");
  return JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1).replace(/,\s*}$/, "}"));
}

const ru = dict("ru");
const en = dict("en");
const unescape = s => JSON.parse(`"${s}"`);
const keys = new Map();

for (const file of files("src")) {
  if (SKIP.some(re => re.test(file))) continue;
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\bt(?:\.n)?\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.set(unescape(m[1]), file);
  for (const m of text.matchAll(/"((?:[^"\\\n]|\\.)*[ăîșțâĂÎȘȚÂ](?:[^"\\\n]|\\.)*)"/g)) {
    const line = text.slice(text.lastIndexOf("\n", m.index) + 1, m.index);
    if (/^\s*(\/\/|\*)/.test(line) || /\.test\(|RegExp|\/.*\/\.test/.test(line)) continue;
    keys.set(unescape(m[1]), file);
  }
}

const missing = [...keys].filter(([k]) => !ALLOW.has(k) && (!(k in ru) || !(k in en)));
for (const [k, file] of missing) console.error(`missing ${!(k in ru) ? "ru" : ""}${!(k in ru) && !(k in en) ? "+" : ""}${!(k in en) ? "en" : ""}: ${JSON.stringify(k)} (${file})`);
const plural = Object.keys(ru).filter(k => k.includes("|")).filter(k => ru[k].split("|").length !== 3 || en[k].split("|").length !== 2);
for (const k of plural) console.error(`plural forms: ${JSON.stringify(k)} needs 3 ru and 2 en forms`);
if (missing.length || plural.length) process.exit(1);
console.log(`i18n: ${keys.size} strings, all translated.`);

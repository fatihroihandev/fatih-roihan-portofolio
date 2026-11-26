// Generates id/index.html (pre-rendered Indonesian page) from index.html + assets/js/translations.js.
// Usage: node scripts/build-id.mjs            -> writes id/index.html
//        node scripts/build-id.mjs --check    -> verifies the English index.html matches translations.js
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { translations } from "../assets/js/translations.js";
import { CONFIG } from "../assets/js/config.js";
import { withServicesCatalog } from "./structured-data.mjs";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("index.html", root), "utf8");
const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (text) => escapeHtml(text).replace(/"/g, "&quot;");

function render(html, lang) {
    const dict = translations[lang];

    // Text content: <tag ... data-i18n="key" ...>text</tag> (text-only elements)
    html = html.replace(/(<([a-z0-9]+)\b[^>]*\sdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g, (m, open, tag, key, inner, close) => {
        if (typeof dict[key] !== "string") throw new Error(`Missing text key: ${key}`);
        return `${open}${escapeHtml(dict[key])}${close}`;
    });

    // Titles: plain text followed by an accent <span>.
    html = html.replace(/(<([a-z0-9]+)\b[^>]*\sdata-i18n-title="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g, (m, open, tag, key, inner, close) => {
        const value = dict[key];
        if (!Array.isArray(value)) throw new Error(`Missing title key: ${key}`);
        return `${open}${escapeHtml(value[0])} <span>${escapeHtml(value[1])}</span>${close}`;
    });

    // Attributes: data-i18n-attr="attr:key;attr2:key2"
    html = html.replace(/<[a-z0-9]+\b[^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/g, (tag, pairs) => {
        pairs.split(";").forEach((pair) => {
            const [attr, key] = pair.split(":");
            if (!dict[key]) throw new Error(`Missing attr key: ${key}`);
            tag = tag.replace(new RegExp(`(\\s${attr}=")[^"]*(")`), `$1${escapeAttr(dict[key])}$2`);
        });
        return tag;
    });

    // WhatsApp / email links: rebuild href from the active language.
    html = html.replace(/<a\b[^>]*\sdata-contact="whatsapp"[^>]*>/g, (tag) => {
        const key = (tag.match(/data-wa-message="([^"]+)"/) || [])[1] || "contact.whatsapp";
        return tag.replace(/href="[^"]*"/, `href="https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(dict[key])}"`);
    });
    html = html.replace(/<a\b[^>]*\sdata-contact="email"[^>]*>/g, (tag) =>
        tag.replace(/href="[^"]*"/, `href="mailto:${CONFIG.email}?subject=${encodeURIComponent(dict["contact.subject"])}&amp;body=${encodeURIComponent(dict["contact.body"])}"`));

    // Inline bilingual text / href / alt for generated article cards:
    html = html.replace(/(<([a-z0-9]+)\b[^>]*\sdata-i18n-inline-en="([^"]*)"\sdata-i18n-inline-id="([^"]*)"[^>]*>)([\s\S]*?)(<\/\2>)/g, (m, open, tag, enVal, idVal, inner, close) => {
        const text = lang === "id" ? idVal : enVal;
        return `${open}${text}${close}`;
    });

    html = html.replace(/<[a-z0-9]+\b[^>]*\sdata-i18n-href-en="([^"]*)"\sdata-i18n-href-id="([^"]*)"[^>]*>/g, (tag, enHref, idHref) => {
        const targetHref = lang === "id" ? idHref : enHref;
        return tag.replace(/\shref="[^"]*"/, ` href="${targetHref}"`);
    });

    html = html.replace(/<img\b[^>]*\sdata-i18n-alt-en="([^"]*)"\sdata-i18n-alt-id="([^"]*)"[^>]*>/g, (tag, enAlt, idAlt) => {
        const targetAlt = lang === "id" ? idAlt : enAlt;
        return tag.replace(/\salt="[^"]*"/, ` alt="${targetAlt}"`);
    });

    return html;
}

if (process.argv.includes("--check")) {
    // The hand-written English page must equal the English render (keeps both pages in sync).
    const strip = (s) => s.replace(/\s+/g, " ").replace(/ ?(href|content)="[^"]*"/g, "");
    const rendered = render(source, "en");
    if (strip(rendered) !== strip(source)) {
        const a = strip(rendered).split(/(?=<)/), b = strip(source).split(/(?=<)/);
        const i = a.findIndex((x, n) => x !== b[n]);
        console.error(`English index.html differs from translations.js near:\n  html: ${b[i]}\n  dict: ${a[i]}`);
        process.exit(1);
    }
    if (withServicesCatalog(source, "en") !== source) {
        console.error("index.html JSON-LD service catalog is out of date: run node scripts/build-id.mjs");
        process.exit(1);
    }
    console.log("OK: index.html matches translations.js (en)");
    process.exit(0);
}

// Keep the English page's service catalog (JSON-LD) in sync with translations.js.
const english = withServicesCatalog(source, "en");
if (english !== source) {
    writeFileSync(new URL("index.html", root), english);
    console.log("Updated JSON-LD service catalog in index.html");
}

let id = withServicesCatalog(render(english, "id"), "id");

id = id
    // Pre-JS state of the language switcher must match the page language.
    .replace('data-lang-option="id" aria-pressed="false"', 'data-lang-option="id" aria-pressed="true"')
    .replace('data-lang-option="en" aria-pressed="true"', 'data-lang-option="en" aria-pressed="false"')
    .replace('<html lang="en">', '<html lang="id" data-static-lang="id">')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(translations.id["meta.title"])}</title>`)
    .replace('<link rel="canonical" href="https://fatihroihan.site/">', '<link rel="canonical" href="https://fatihroihan.site/id/">')
    .replace('<meta property="og:url" content="https://fatihroihan.site/">', '<meta property="og:url" content="https://fatihroihan.site/id/">')
    .replace('<meta property="og:locale" content="en_US">', '<meta property="og:locale" content="id_ID">')
    .replace('<meta property="og:locale:alternate" content="id_ID">', '<meta property="og:locale:alternate" content="en_US">')
    .replace(/"description": "Freelance web developer building[^"]*"/, `"description": "${translations.id["meta.description"].split(". ")[0]}."`)
    .replace(/"jobTitle": "[^"]*"/, '"jobTitle": "Freelance Web Developer"')
    // Asset and in-site paths are one directory deeper.
    .replace(/(href|src)="assets\//g, '$1="../assets/')
    .replace(/srcset="([^"]*)"/g, (m, list) => `srcset="${list.replace(/(^|,\s*)assets\//g, "$1../assets/")}"`)
    .replace(/href="id\/articles\//g, 'href="articles/')
    // i18n.js rewrites hrefs from these at runtime; they must resolve from /id/ too.
    .replace(/data-i18n-href-id="id\//g, 'data-i18n-href-id="')
    .replace(/data-i18n-href-en="(?!https?:|\.\.\/)/g, 'data-i18n-href-en="../');

mkdirSync(new URL("id/", root), { recursive: true });
writeFileSync(new URL("id/index.html", root), id);
console.log("Wrote id/index.html");

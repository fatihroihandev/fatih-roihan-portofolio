// Static checks for the built site. Usage: node scripts/check.mjs
// Verifies links/assets, WhatsApp numbers, metadata, hreflang/canonical, sitemap, robots, JSON-LD, headings, alt text.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { CONFIG } from "../assets/js/config.js";

const ORIGIN = "https://fatihroihan.site";
const pages = [
    { file: "index.html", url: `${ORIGIN}/`, lang: "en" },
    { file: "id/index.html", url: `${ORIGIN}/id/`, lang: "id" },
];
let failures = 0;
const fail = (message) => { failures += 1; console.error(`FAIL  ${message}`); };
const ok = (message) => console.log(`ok    ${message}`);

for (const page of pages) {
    const html = readFileSync(page.file, "utf8");
    const tag = (re) => (html.match(re) || [])[1];

    // lang, canonical, og:url, hreflang
    if (tag(/<html[^>]*\slang="([^"]+)"/) !== page.lang) fail(`${page.file}: <html lang> should be ${page.lang}`);
    if (tag(/rel="canonical" href="([^"]+)"/) !== page.url) fail(`${page.file}: canonical should be ${page.url}`);
    if (tag(/property="og:url" content="([^"]+)"/) !== page.url) fail(`${page.file}: og:url should be ${page.url}`);
    for (const [lang, url] of [["en", `${ORIGIN}/`], ["id", `${ORIGIN}/id/`], ["x-default", `${ORIGIN}/`]]) {
        if (!html.includes(`hreflang="${lang}" href="${url}"`)) fail(`${page.file}: missing hreflang ${lang}`);
    }

    // title / description / og
    const title = tag(/<title>([^<]+)<\/title>/);
    const description = tag(/name="description"[^>]*content="([^"]*)"/);
    if (!title || title.length > 75) fail(`${page.file}: title missing or too long (${title?.length})`);
    if (!description || description.length < 70 || description.length > 175) fail(`${page.file}: description length ${description?.length}`);
    for (const p of ["og:title", "og:description", "og:image", "og:type"]) if (!html.includes(`property="${p}"`)) fail(`${page.file}: missing ${p}`);
    if (!/name="twitter:card"/.test(html)) fail(`${page.file}: missing twitter:card`);
    if (/noindex/i.test(html)) fail(`${page.file}: unexpected noindex`);

    // headings and images
    const h1 = (html.match(/<h1\b/g) || []).length;
    if (h1 !== 1) fail(`${page.file}: expected 1 <h1>, found ${h1}`);
    for (const img of html.match(/<img\b[^>]*>/g) || []) {
        if (!/\salt="[^"]+"/.test(img)) fail(`${page.file}: <img> without alt: ${img.slice(0, 60)}`);
        if (!/\swidth=/.test(img) || !/\sheight=/.test(img)) fail(`${page.file}: <img> without width/height`);
    }

    // JSON-LD
    try {
        JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    } catch (error) {
        fail(`${page.file}: JSON-LD invalid (${error.message})`);
    }

    // local links, anchors and assets
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const [, ref] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        if (ref.startsWith("#")) { if (!ids.has(ref.slice(1))) fail(`${page.file}: missing anchor ${ref}`); continue; }
        if (/^(https?:|mailto:)/.test(ref)) continue;
        if (!existsSync(join(dirname(page.file), ref.split("#")[0]))) fail(`${page.file}: missing file ${ref}`);
    }

    // WhatsApp links: exact number, encoded text, no placeholder
    const wa = [...html.matchAll(/https:\/\/wa\.me\/(\d*)\?text=([^"]*)"/g)];
    if (wa.length === 0) fail(`${page.file}: no WhatsApp links`);
    for (const [, number, text] of wa) {
        if (number !== CONFIG.whatsapp || number !== "628818227834") fail(`${page.file}: WhatsApp number ${number}`);
        if (/\s|%2E%2E%2E|\.\.\./.test(text)) fail(`${page.file}: WhatsApp text not encoded/placeholder`);
    }
    if (/href="#final-cta"|wa\.me\/"|wa\.me\/\?/.test(html)) fail(`${page.file}: stale/empty WhatsApp link`);
    ok(`${page.file}: ${wa.length} WhatsApp links, ${ids.size} ids, title ${title.length} chars, description ${description.length} chars`);
}

// sitemap / robots
const sitemap = readFileSync("sitemap.xml", "utf8");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const page of pages) if (!locs.includes(page.url)) fail(`sitemap missing ${page.url}`);
for (const loc of locs) if (!pages.some((p) => p.url === loc)) fail(`sitemap has unknown URL ${loc}`);
if (!readFileSync("robots.txt", "utf8").includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) fail("robots.txt sitemap line");
if (/Disallow:\s*\//.test(readFileSync("robots.txt", "utf8").replace(/Disallow:\s*\n/g, ""))) fail("robots.txt blocks content");
if (readFileSync("CNAME", "utf8").trim() !== "fatihroihan.site") fail("CNAME unexpected");
ok(`sitemap: ${locs.length} URLs; robots.txt and CNAME checked`);

// Publication set: everything Git would track or add (not ignored). No internal folders or dev files.
try {
    const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" }).split("\n").filter((f) => f && existsSync(f));
    const internal = files.filter((f) => /^(_?docs|_source|\.vscode|node_modules|backups?)\//i.test(f) || /\.(env|pem|key)$/i.test(f) || /fatihroihan\.png$/.test(f));
    if (internal.length) fail(`internal files in publication set: ${internal.join(", ")}`);
    else ok(`publication set: ${files.length} files, no internal folders`);
    for (const f of files.filter((x) => /\.(html|js|mjs|css|md|xml|txt)$/.test(x))) {
        if (/(_docs|_source)\//.test(readFileSync(f, "utf8"))) fail(`${f}: references an internal folder`);
    }
} catch (error) {
    console.log(`skip  publication-set check (git unavailable: ${error.message.split("\n")[0]})`);
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll static checks passed");
process.exit(failures ? 1 : 0);

// Generates bilingual static article pages, article hub pages, homepage article cards, and updates sitemap.xml.
// Input: content/articles/*.json (managed by roihan-ai-office-v2).
// Usage:
//   node scripts/build-articles.mjs
//   node scripts/build-articles.mjs --download-images
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { CONFIG } from "../assets/js/config.js";
import { translations } from "../assets/js/translations.js";

const ORIGIN = "https://fatihroihan.site";
const root = new URL("../", import.meta.url);
const ARTICLES_DIR = new URL("content/articles/", root);
const DOWNLOAD_IMAGES = process.argv.includes("--download-images");

const ensureDir = (relPath) => {
    const dirUrl = new URL(relPath.endsWith("/") ? relPath : `${relPath}/`, root);
    if (!existsSync(dirUrl)) mkdirSync(dirUrl, { recursive: true });
};

const escapeHtml = (text) => String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (text) => escapeHtml(text).replace(/"/g, "&quot;");

function slugifyHeading(text, index) {
    const base = String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return base || `section-${index + 1}`;
}

function formatDate(isoDate, lang) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const date = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    return new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    }).format(date);
}

function estimateReadingTime(localeData, explicitMinutes) {
    if (Number.isInteger(explicitMinutes) && explicitMinutes > 0) return explicitMinutes;
    const text = (localeData.blocks || [])
        .map((b) => [b.text, b.title, ...(b.items || [])].filter(Boolean).join(" "))
        .join(" ");
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(2, Math.round(words / 180));
}

async function resolveImageUrl(url, slug, suffix = "cover") {
    if (!url) return "assets/images/og-cover.png";
    if (!DOWNLOAD_IMAGES || !/^https?:\/\//i.test(url)) return url;

    try {
        const parsed = new URL(url);
        const ext = extname(parsed.pathname) || ".jpg";
        const localRel = `assets/images/articles/${slug}-${suffix}${ext}`;
        const localUrl = new URL(localRel, root);
        if (!existsSync(localUrl)) {
            ensureDir("assets/images/articles/");
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            writeFileSync(localUrl, buf);
            console.log(`Downloaded image -> ${localRel}`);
        }
        return localRel;
    } catch (err) {
        console.warn(`Warning: kept remote URL for ${url} (${err.message})`);
        return url;
    }
}

function toPublicImageHref(url, prefixToRoot) {
    if (/^https?:\/\//i.test(url)) return url;
    return `${prefixToRoot}${url.replace(/^\/+/, "")}`;
}

function toAbsoluteImageUrl(url) {
    if (/^https?:\/\//i.test(url)) return url;
    return `${ORIGIN}/${url.replace(/^\/+/, "")}`;
}

function validateArticle(article, file) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug || "")) {
        throw new Error(`${file}: invalid or missing 'slug'`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(article.publishedAt || "")) {
        throw new Error(`${file}: 'publishedAt' must be YYYY-MM-DD`);
    }
    for (const lang of ["en", "id"]) {
        const loc = article[lang];
        if (!loc) throw new Error(`${file}: missing '${lang}' locale object`);
        const fullTitle = `${loc.title} | Fatih Roihan`;
        if (!loc.title || fullTitle.length > 75) {
            throw new Error(`${file} [${lang}]: full title '${fullTitle}' is ${fullTitle.length} chars (must be <= 75)`);
        }
        if (!loc.description || loc.description.length < 70 || loc.description.length > 175) {
            throw new Error(`${file} [${lang}]: description length is ${loc.description?.length} (must be 70-175)`);
        }
        if (!Array.isArray(loc.blocks) || loc.blocks.length === 0) {
            throw new Error(`${file} [${lang}]: 'blocks' must be a non-empty array`);
        }
    }
}

async function loadArticles() {
    if (!existsSync(ARTICLES_DIR)) return [];
    const files = readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".json"));
    const list = [];

    for (const file of files) {
        const fullPath = new URL(file, ARTICLES_DIR);
        const raw = JSON.parse(readFileSync(fullPath, "utf8"));
        validateArticle(raw, file);

        raw.updatedAt = raw.updatedAt || raw.publishedAt;
        raw.readingTimeMinutes = estimateReadingTime(raw.en, raw.readingTimeMinutes);

        if (raw.cover && raw.cover.url) {
            raw.cover.resolvedUrl = await resolveImageUrl(raw.cover.url, raw.slug, "cover");
        } else {
            raw.cover = {
                url: "assets/images/og-cover.png",
                resolvedUrl: "assets/images/og-cover.png",
                width: 1200,
                height: 630,
                alt: {
                    en: raw.en.title,
                    id: raw.id.title,
                },
            };
        }

        for (const lang of ["en", "id"]) {
            let imgIdx = 0;
            for (const block of raw[lang].blocks) {
                if (block.type === "image" && block.url) {
                    imgIdx++;
                    block.resolvedUrl = await resolveImageUrl(block.url, raw.slug, `img${imgIdx}`);
                }
            }
        }

        list.push(raw);
    }

    // Sort newest first
    list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
    return list;
}

function renderSharedHead({
    lang,
    pageTitle,
    description,
    canonicalUrl,
    enUrl,
    idUrl,
    ogImage,
    ogType = "website",
    prefixToRoot,
    jsonLdObject,
    altTargetHref,
    publishedTime,
    modifiedTime,
}) {
    const locale = lang === "id" ? "id_ID" : "en_US";
    const altLocale = lang === "id" ? "en_US" : "id_ID";
    const staticLangAttr = lang === "id" ? ' data-static-lang="id"' : ' data-static-lang="en"';
    const altAttr = lang === "id"
        ? ` data-alt-url_en="${escapeAttr(altTargetHref)}"`
        : ` data-alt-url_id="${escapeAttr(altTargetHref)}"`;
    const titleAttr = ` data-title_${lang}="${escapeAttr(pageTitle)}"`;
    const articleMeta = ogType === "article" && publishedTime
        ? `\n    <meta property="article:published_time" content="${escapeAttr(publishedTime)}">\n    <meta property="article:modified_time" content="${escapeAttr(modifiedTime || publishedTime)}">`
        : "";

    return `<!DOCTYPE html>
<html lang="${lang}"${staticLangAttr}${altAttr}${titleAttr}>

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeAttr(description)}">
    <meta name="author" content="Fatih Roihan">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <meta name="theme-color" content="#F8FAFC">

    <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
    <link rel="alternate" hreflang="en" href="${escapeAttr(enUrl)}">
    <link rel="alternate" hreflang="id" href="${escapeAttr(idUrl)}">
    <link rel="alternate" hreflang="x-default" href="${escapeAttr(enUrl)}">

    <link rel="icon" type="image/png" href="${prefixToRoot}assets/images/favicon-besar.png">

    <meta property="og:title" content="${escapeAttr(pageTitle)}">
    <meta property="og:description" content="${escapeAttr(description)}">
    <meta property="og:image" content="${escapeAttr(ogImage)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${escapeAttr(canonicalUrl)}">
    <meta property="og:type" content="${ogType}">
    <meta property="og:site_name" content="Fatih Roihan">
    <meta property="og:locale" content="${locale}">
    <meta property="og:locale:alternate" content="${altLocale}">${articleMeta}
    <meta name="twitter:card" content="summary_large_image">

    <script>
        (function () {
            try {
                var stored = localStorage.getItem('fr-theme');
                var theme = stored || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                document.documentElement.setAttribute('data-theme', theme);
            } catch (e) {}
        })();
    </script>

    <script type="application/ld+json">
${JSON.stringify(jsonLdObject, null, 4)}
    </script>

    <link rel="stylesheet" href="${prefixToRoot}assets/css/reset.css">
    <link rel="stylesheet" href="${prefixToRoot}assets/css/variables.css">
    <link rel="stylesheet" href="${prefixToRoot}assets/css/style.css">
    <link rel="stylesheet" href="${prefixToRoot}assets/css/responsive.css">
</head>`;
}

function renderNavbar({ lang, prefixToRoot, prefixToHome }) {
    const dict = translations[lang];
    const waHref = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(dict["contact.whatsapp"])}`;
    const idPressed = lang === "id" ? "true" : "false";
    const enPressed = lang === "en" ? "true" : "false";
    const articlesHref = lang === "id" ? `${prefixToRoot}id/articles/` : `${prefixToRoot}articles/`;

    return `<body>
    <a class="skip-link" href="#main-content" data-i18n="skip">${escapeHtml(dict["skip"])}</a>

    <header class="site-header">
        <nav class="navbar container" aria-label="${escapeAttr(dict["nav.label"])}">
            <a href="${prefixToHome}" class="navbar__logo">Fatih Roihan</a>

            <div id="primary-navigation" class="navbar__menu">
                <ul class="navbar__links">
                    <li><a href="${prefixToHome}#services" data-i18n="nav.services">${escapeHtml(dict["nav.services"])}</a></li>
                    <li><a href="${prefixToHome}#portfolio" data-i18n="nav.work">${escapeHtml(dict["nav.work"])}</a></li>
                    <li><a href="${prefixToHome}#process" data-i18n="nav.process">${escapeHtml(dict["nav.process"])}</a></li>
                    <li><a href="${prefixToHome}#about" data-i18n="nav.about">${escapeHtml(dict["nav.about"])}</a></li>
                    <li><a href="${articlesHref}" data-i18n="nav.articles">${escapeHtml(dict["nav.articles"])}</a></li>
                </ul>
            </div>

            <div class="navbar__actions">
                <div class="lang-switch" role="group" aria-label="${escapeAttr(dict["lang.label"])}">
                    <button type="button" class="lang-switch__option" data-lang-option="id" aria-pressed="${idPressed}" lang="id">ID</button>
                    <button type="button" class="lang-switch__option" data-lang-option="en" aria-pressed="${enPressed}" lang="en">EN</button>
                </div>

                <button type="button" class="theme-toggle" aria-label="${escapeAttr(dict["theme.label"])}" title="Toggle theme">
                    <svg class="theme-toggle__icon theme-toggle__icon--sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>
                    <svg class="theme-toggle__icon theme-toggle__icon--moon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                </button>

                <a href="${waHref}"
                    class="button button--primary navbar__cta" data-contact="whatsapp" data-i18n="nav.cta"
                    data-track="whatsapp_click" data-track-location="navbar" target="_blank" rel="noopener noreferrer">${escapeHtml(dict["nav.cta"])}</a>

                <button class="navbar__toggle" type="button" aria-label="${escapeAttr(dict["nav.open"])}" aria-expanded="false"
                    aria-controls="primary-navigation">
                    <span></span><span></span><span></span>
                </button>
            </div>
        </nav>
    </header>`;
}

function renderFooter({ lang, prefixToRoot, prefixToHome }) {
    const dict = translations[lang];
    const waHref = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(dict["contact.whatsapp"])}`;
    const emailHref = `mailto:${CONFIG.email}?subject=${encodeURIComponent(dict["contact.subject"])}&amp;body=${encodeURIComponent(dict["contact.body"])}`;
    const articlesHref = lang === "id" ? `${prefixToRoot}id/articles/` : `${prefixToRoot}articles/`;

    return `    <footer class="site-footer">
        <div class="container site-footer__inner">
            <div class="site-footer__brand">
                <a href="${prefixToHome}" class="navbar__logo">Fatih Roihan</a>
                <p data-i18n="footer.desc">${escapeHtml(dict["footer.desc"])}</p>
            </div>

            <nav class="site-footer__col" aria-label="${escapeAttr(dict["footer.nav"])}">
                <h2 class="site-footer__heading" data-i18n="footer.nav">${escapeHtml(dict["footer.nav"])}</h2>
                <ul>
                    <li><a href="${prefixToHome}#services" data-i18n="nav.services">${escapeHtml(dict["nav.services"])}</a></li>
                    <li><a href="${prefixToHome}#portfolio" data-i18n="nav.work">${escapeHtml(dict["nav.work"])}</a></li>
                    <li><a href="${prefixToHome}#process" data-i18n="nav.process">${escapeHtml(dict["nav.process"])}</a></li>
                    <li><a href="${prefixToHome}#about" data-i18n="nav.about">${escapeHtml(dict["nav.about"])}</a></li>
                    <li><a href="${articlesHref}" data-i18n="nav.articles">${escapeHtml(dict["nav.articles"])}</a></li>
                </ul>
            </nav>

            <div class="site-footer__col">
                <h2 class="site-footer__heading" data-i18n="footer.contact">${escapeHtml(dict["footer.contact"])}</h2>
                <ul>
                    <li><a href="${waHref}"
                            data-contact="whatsapp" data-track="whatsapp_click" data-track-location="footer" target="_blank" rel="noopener noreferrer" data-i18n="footer.whatsapp">${escapeHtml(dict["footer.whatsapp"])}</a></li>
                    <li><a href="${emailHref}" data-contact="email" data-track="email_click" data-track-location="footer" data-i18n="footer.email">${escapeHtml(dict["footer.email"])}</a></li>
                    <li><a href="https://www.linkedin.com/in/fatih-roihan-909173308" data-track="linkedin_click" target="_blank" rel="noopener noreferrer">LinkedIn</a></li>
                    <li><a href="https://github.com/fatihroihandev" target="_blank" rel="noopener noreferrer">GitHub</a></li>
                </ul>
            </div>
        </div>
        <div class="container site-footer__bottom">
            <p>&copy; <span id="current-year">2026</span> Fatih Roihan. <span data-i18n="footer.rights">${escapeHtml(dict["footer.rights"])}</span></p>
        </div>
    </footer>

    <script type="module" src="${prefixToRoot}assets/js/main.js"></script>
</body>

</html>`;
}

function renderArticleCard(article, lang, prefixToRoot, isHomepage = false) {
    const loc = article[lang];
    const enLoc = article.en;
    const idLoc = article.id;

    const enHref = isHomepage ? `articles/${article.slug}/` : `${prefixToRoot}articles/${article.slug}/`;
    const idHref = isHomepage ? `id/articles/${article.slug}/` : `${prefixToRoot}id/articles/${article.slug}/`;
    const activeHref = lang === "id" ? idHref : enHref;

    const imgUrl = toPublicImageHref(article.cover.resolvedUrl, prefixToRoot);
    const imgWidth = article.cover.width || 1200;
    const imgHeight = article.cover.height || 630;
    const enAlt = article.cover.alt?.en || enLoc.title;
    const idAlt = article.cover.alt?.id || idLoc.title;
    const activeAlt = lang === "id" ? idAlt : enAlt;

    const enDate = formatDate(article.publishedAt, "en");
    const idDate = formatDate(article.publishedAt, "id");
    const activeDate = lang === "id" ? idDate : enDate;

    const enRead = `${article.readingTimeMinutes} min read`;
    const idRead = `${article.readingTimeMinutes} menit baca`;
    const activeRead = lang === "id" ? idRead : enRead;

    const enCat = enLoc.categoryLabel || "Article";
    const idCat = idLoc.categoryLabel || "Artikel";
    const activeCat = lang === "id" ? idCat : enCat;

    const readMoreLabel = translations[lang]["articles.readMore"];

    if (isHomepage) {
        // Includes data-i18n-inline-* and data-i18n-href-* so both instant JS switcher on / and build-id.mjs work seamlessly
        return `                    <article class="article-card" data-category="${escapeAttr(article.category)}">
                        <a href="${escapeAttr(activeHref)}" class="article-card__media" data-i18n-href-en="${escapeAttr(enHref)}" data-i18n-href-id="${escapeAttr(idHref)}">
                            <img src="${escapeAttr(imgUrl)}" width="${imgWidth}" height="${imgHeight}" loading="lazy" decoding="async"
                                alt="${escapeAttr(activeAlt)}" data-i18n-alt-en="${escapeAttr(enAlt)}" data-i18n-alt-id="${escapeAttr(idAlt)}" class="article-card__img">
                        </a>
                        <div class="article-card__body">
                            <div class="article-card__meta">
                                <span class="project__kind" data-i18n-inline-en="${escapeAttr(enCat)}" data-i18n-inline-id="${escapeAttr(idCat)}">${escapeHtml(activeCat)}</span>
                                <time datetime="${escapeAttr(article.publishedAt)}" data-i18n-inline-en="${escapeAttr(enDate)}" data-i18n-inline-id="${escapeAttr(idDate)}">${escapeHtml(activeDate)}</time>
                                <span>·</span>
                                <span data-i18n-inline-en="${escapeAttr(enRead)}" data-i18n-inline-id="${escapeAttr(idRead)}">${escapeHtml(activeRead)}</span>
                            </div>
                            <h3 class="article-card__title">
                                <a href="${escapeAttr(activeHref)}" data-i18n-href-en="${escapeAttr(enHref)}" data-i18n-href-id="${escapeAttr(idHref)}" data-i18n-inline-en="${escapeAttr(enLoc.title)}" data-i18n-inline-id="${escapeAttr(idLoc.title)}">${escapeHtml(loc.title)}</a>
                            </h3>
                            <p class="article-card__excerpt" data-i18n-inline-en="${escapeAttr(enLoc.excerpt)}" data-i18n-inline-id="${escapeAttr(idLoc.excerpt)}">${escapeHtml(loc.excerpt)}</p>
                            <div class="article-card__footer">
                                <a href="${escapeAttr(activeHref)}" class="text-link" data-i18n="articles.readMore" data-i18n-href-en="${escapeAttr(enHref)}" data-i18n-href-id="${escapeAttr(idHref)}">${escapeHtml(readMoreLabel)}</a>
                            </div>
                        </div>
                    </article>`;
    }

    return `                    <article class="article-card" data-category="${escapeAttr(article.category)}">
                        <a href="${escapeAttr(activeHref)}" class="article-card__media">
                            <img src="${escapeAttr(imgUrl)}" width="${imgWidth}" height="${imgHeight}" loading="lazy" decoding="async"
                                alt="${escapeAttr(activeAlt)}" class="article-card__img">
                        </a>
                        <div class="article-card__body">
                            <div class="article-card__meta">
                                <span class="project__kind">${escapeHtml(activeCat)}</span>
                                <time datetime="${escapeAttr(article.publishedAt)}">${escapeHtml(activeDate)}</time>
                                <span>·</span>
                                <span>${escapeHtml(activeRead)}</span>
                            </div>
                            <h3 class="article-card__title">
                                <a href="${escapeAttr(activeHref)}">${escapeHtml(loc.title)}</a>
                            </h3>
                            <p class="article-card__excerpt">${escapeHtml(loc.excerpt)}</p>
                            <div class="article-card__footer">
                                <a href="${escapeAttr(activeHref)}" class="text-link">${escapeHtml(readMoreLabel)}</a>
                            </div>
                        </div>
                    </article>`;
}

function renderBlocks(blocks, prefixToRoot) {
    const toc = [];
    const htmlParts = [];

    blocks.forEach((block, index) => {
        switch (block.type) {
            case "h2": {
                const id = block.id || slugifyHeading(block.text, index);
                toc.push({ id, text: block.text });
                htmlParts.push(`<h2 id="${escapeAttr(id)}">${escapeHtml(block.text)}</h2>`);
                break;
            }
            case "h3": {
                const id = block.id || slugifyHeading(block.text, index);
                htmlParts.push(`<h3 id="${escapeAttr(id)}">${escapeHtml(block.text)}</h3>`);
                break;
            }
            case "p":
                htmlParts.push(`<p>${escapeHtml(block.text)}</p>`);
                break;
            case "ul":
                htmlParts.push(`<ul>\n${(block.items || []).map((item) => `    <li>${escapeHtml(item)}</li>`).join("\n")}\n</ul>`);
                break;
            case "ol":
                htmlParts.push(`<ol>\n${(block.items || []).map((item) => `    <li>${escapeHtml(item)}</li>`).join("\n")}\n</ol>`);
                break;
            case "quote":
                htmlParts.push(
                    `<blockquote>\n    <p>${escapeHtml(block.text)}</p>${
                        block.author ? `\n    <footer>— ${escapeHtml(block.author)}</footer>` : ""
                    }\n</blockquote>`
                );
                break;
            case "callout":
                htmlParts.push(
                    `<aside class="article-callout">\n    <div class="article-callout__title">${escapeHtml(
                        block.title || "Note"
                    )}</div>\n    <p>${escapeHtml(block.text)}</p>\n</aside>`
                );
                break;
            case "image": {
                const src = toPublicImageHref(block.resolvedUrl || block.url, prefixToRoot);
                const w = block.width || 1000;
                const h = block.height || 600;
                const alt = block.alt || "Article illustration";
                htmlParts.push(
                    `<figure class="article-figure">\n    <img src="${escapeAttr(
                        src
                    )}" width="${w}" height="${h}" loading="lazy" decoding="async" alt="${escapeAttr(alt)}">${
                        block.caption ? `\n    <figcaption>${escapeHtml(block.caption)}</figcaption>` : ""
                    }\n</figure>`
                );
                break;
            }
            case "code":
                htmlParts.push(`<pre><code>${escapeHtml(block.code)}</code></pre>`);
                break;
            default:
                if (block.text) htmlParts.push(`<p>${escapeHtml(block.text)}</p>`);
        }
    });

    return { proseHtml: htmlParts.join("\n                    "), toc };
}

function renderArticleDetailPage(article, allArticles, lang) {
    const isId = lang === "id";
    const loc = article[lang];
    const prefixToRoot = isId ? "../../../" : "../../";
    const prefixToHome = isId ? "../../" : "../../";
    const enUrl = `${ORIGIN}/articles/${article.slug}/`;
    const idUrl = `${ORIGIN}/id/articles/${article.slug}/`;
    const canonicalUrl = isId ? idUrl : enUrl;
    const altTargetHref = isId ? `../../../articles/${article.slug}/` : `../../id/articles/${article.slug}/`;
    const hubHref = "../";

    const pageTitle = `${loc.title} | Fatih Roihan`;
    const ogImage = toAbsoluteImageUrl(article.cover.resolvedUrl);
    const { proseHtml, toc } = renderBlocks(loc.blocks, prefixToRoot);

    const graph = [
        {
            "@type": "BlogPosting",
            "@id": `${canonicalUrl}#article`,
            "headline": loc.title,
            "description": loc.description,
            "image": ogImage,
            "datePublished": article.publishedAt,
            "dateModified": article.updatedAt,
            "inLanguage": lang,
            "author": {
                "@type": "Person",
                "@id": `${ORIGIN}/#person`,
                "name": "Fatih Roihan",
                "url": `${ORIGIN}/`,
            },
            "publisher": {
                "@type": "Person",
                "@id": `${ORIGIN}/#person`,
                "name": "Fatih Roihan",
            },
            "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": canonicalUrl,
            },
            "keywords": (loc.keywords || []).join(", "),
        },
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "name": isId ? "Beranda" : "Home",
                    "item": isId ? `${ORIGIN}/id/` : `${ORIGIN}/`,
                },
                {
                    "@type": "ListItem",
                    "position": 2,
                    "name": isId ? "Artikel" : "Articles",
                    "item": isId ? `${ORIGIN}/id/articles/` : `${ORIGIN}/articles/`,
                },
                {
                    "@type": "ListItem",
                    "position": 3,
                    "name": loc.title,
                    "item": canonicalUrl,
                },
            ],
        },
    ];

    if (Array.isArray(loc.faq) && loc.faq.length > 0) {
        graph.push({
            "@type": "FAQPage",
            "mainEntity": loc.faq.map((item) => ({
                "@type": "Question",
                "name": item.q,
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": item.a,
                },
            })),
        });
    }

    const head = renderSharedHead({
        lang,
        pageTitle,
        description: loc.description,
        canonicalUrl,
        enUrl,
        idUrl,
        ogImage,
        ogType: "article",
        prefixToRoot,
        jsonLdObject: { "@context": "https://schema.org", "@graph": graph },
        altTargetHref,
        publishedTime: article.publishedAt,
        modifiedTime: article.updatedAt,
    });

    const navbar = renderNavbar({ lang, prefixToRoot, prefixToHome });
    const footer = renderFooter({ lang, prefixToRoot, prefixToHome });

    const coverSrc = toPublicImageHref(article.cover.resolvedUrl, prefixToRoot);
    const coverAlt = article.cover.alt?.[lang] || loc.title;
    const coverCaption = article.cover.caption?.[lang] || "";
    const coverW = article.cover.width || 1200;
    const coverH = article.cover.height || 630;

    const waText = loc.ctaMessage || translations[lang]["contact.whatsapp"];
    const waHref = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(waText)}`;

    const faqSection =
        Array.isArray(loc.faq) && loc.faq.length > 0
            ? `
                    <section class="article-faq" aria-labelledby="article-faq-title">
                        <h2 id="article-faq-title">${isId ? "Pertanyaan Terkait (FAQ)" : "Frequently Asked Questions"}</h2>
                        <div class="faq__list">
                            ${loc.faq
                                .map(
                                    (f) =>
                                        `<details class="faq__item"><summary>${escapeHtml(f.q)}</summary><p>${escapeHtml(f.a)}</p></details>`
                                )
                                .join("\n                            ")}
                        </div>
                    </section>`
            : "";

    const related = allArticles.filter((a) => a.slug !== article.slug).slice(0, 2);
    const relatedSection =
        related.length > 0
            ? `
        <section class="section section--tint" aria-labelledby="related-articles-title">
            <div class="container">
                <header class="section-header">
                    <p class="eyebrow">${isId ? "Baca Selanjutnya" : "Further Reading"}</p>
                    <h2 id="related-articles-title" class="section-title">${
                        isId ? "Artikel &amp; Wawasan <span>Lainnya.</span>" : "More Articles &amp; <span>Insights.</span>"
                    }</h2>
                </header>
                <div class="articles-grid">
${related.map((r) => renderArticleCard(r, lang, prefixToRoot, false)).join("\n")}
                </div>
            </div>
        </section>`
            : "";

    return `${head}
${navbar}

    <main id="main-content" tabindex="-1">
        <header class="article-hero">
            <div class="container">
                <nav class="breadcrumb" aria-label="Breadcrumb">
                    <a href="${prefixToHome}">${isId ? "Beranda" : "Home"}</a>
                    <span class="breadcrumb__sep">/</span>
                    <a href="${hubHref}">${isId ? "Artikel" : "Articles"}</a>
                    <span class="breadcrumb__sep">/</span>
                    <span aria-current="page">${escapeHtml(loc.title)}</span>
                </nav>
                <div class="article-header">
                    <div class="article-header__meta">
                        <span class="project__kind">${escapeHtml(loc.categoryLabel || "Article")}</span>
                        <time datetime="${escapeAttr(article.publishedAt)}">${escapeHtml(formatDate(article.publishedAt, lang))}</time>
                        <span>·</span>
                        <span>${
                            isId ? `${article.readingTimeMinutes} menit baca` : `${article.readingTimeMinutes} min read`
                        }</span>
                    </div>
                    <h1 class="article-header__title">${escapeHtml(loc.title)}</h1>
                    <p class="article-header__desc">${escapeHtml(loc.description)}</p>
                </div>
            </div>
        </header>

        <div class="container article-layout">
            <article class="article-main">
                <figure class="article-cover">
                    <img src="${escapeAttr(coverSrc)}" width="${coverW}" height="${coverH}" decoding="async" alt="${escapeAttr(coverAlt)}">
                    ${coverCaption ? `<figcaption>${escapeHtml(coverCaption)}</figcaption>` : ""}
                </figure>

                <div class="article-prose">
                    ${proseHtml}
                </div>
${faqSection}
                <aside class="article-cta-box" aria-labelledby="article-cta-heading">
                    <p class="eyebrow">${isId ? "Konsultasi Proyek" : "Project Consultation"}</p>
                    <h2 id="article-cta-heading">${
                        isId
                            ? "Ingin menerapkan solusi ini untuk bisnis Anda?"
                            : "Need a website or custom system like this?"
                    }</h2>
                    <p>${
                        isId
                            ? "Diskusikan kebutuhan website atau sistem operasional Anda langsung via WhatsApp. Tanpa perlu dokumen spesifikasi teknis yang rumit."
                            : "Discuss your website or internal system goals directly on WhatsApp. No complex technical brief required."
                    }</p>
                    <div>
                        <a href="${waHref}" class="button button--primary" data-track="whatsapp_click" data-track-location="article-${escapeAttr(
        article.slug
    )}" target="_blank" rel="noopener noreferrer">${
        isId ? "Diskusikan via WhatsApp" : "Discuss Your Project on WhatsApp"
    }</a>
                    </div>
                </aside>
            </article>

            <aside class="article-sidebar" aria-label="${isId ? "Daftar isi & profil penulis" : "Table of contents & author"}">
                ${
                    toc.length > 0
                        ? `<div class="sidebar-card">
                    <h2 class="sidebar-card__title">${isId ? "Daftar Isi" : "On This Page"}</h2>
                    <ul class="toc-list">
                        ${toc.map((t) => `<li><a href="#${escapeAttr(t.id)}">${escapeHtml(t.text)}</a></li>`).join("\n                        ")}
                    </ul>
                </div>`
                        : ""
                }
                <div class="sidebar-card">
                    <h2 class="sidebar-card__title">${isId ? "Tentang Penulis" : "Written By"}</h2>
                    <p><strong>Fatih Roihan</strong> — ${
                        isId
                            ? "Freelance web developer & digital solutions engineer untuk landing page, company profile, dan sistem web enterprise."
                            : "Freelance website developer & digital solutions engineer building high-performance websites and custom business systems."
                    }</p>
                    <div style="margin-top: 1rem;">
                        <a href="${waHref}" class="text-link" data-track="whatsapp_click" data-track-location="article-sidebar" target="_blank" rel="noopener noreferrer">${
        isId ? "Chat WhatsApp" : "Chat on WhatsApp"
    }</a>
                    </div>
                </div>
            </aside>
        </div>
${relatedSection}
    </main>

${footer}`;
}

function renderArticlesHubPage(articles, lang) {
    const isId = lang === "id";
    const prefixToRoot = isId ? "../../" : "../";
    const prefixToHome = isId ? "../" : "../";
    const enUrl = `${ORIGIN}/articles/`;
    const idUrl = `${ORIGIN}/id/articles/`;
    const canonicalUrl = isId ? idUrl : enUrl;
    const altTargetHref = isId ? "../../articles/" : "../id/articles/";

    const pageTitle = isId
        ? "Artikel & Wawasan Web Development | Fatih Roihan"
        : "Articles & Insights on Web Development | Fatih Roihan";
    const description = isId
        ? "Kumpulan artikel dan panduan praktis seputar strategi landing page, website bisnis, sistem web internal enterprise, dan optimasi SEO teknis."
        : "Practical articles and engineering guides on high-converting landing pages, business websites, custom enterprise web systems, and technical SEO.";

    const jsonLdObject = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                "@id": `${canonicalUrl}#collection`,
                "url": canonicalUrl,
                "name": pageTitle,
                "description": description,
                "inLanguage": lang,
                "isPartOf": { "@id": `${ORIGIN}/#website` },
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": 1,
                        "name": isId ? "Beranda" : "Home",
                        "item": isId ? `${ORIGIN}/id/` : `${ORIGIN}/`,
                    },
                    {
                        "@type": "ListItem",
                        "position": 2,
                        "name": isId ? "Artikel" : "Articles",
                        "item": canonicalUrl,
                    },
                ],
            },
        ],
    };

    const head = renderSharedHead({
        lang,
        pageTitle,
        description,
        canonicalUrl,
        enUrl,
        idUrl,
        ogImage: `${ORIGIN}/assets/images/og-cover.png`,
        ogType: "website",
        prefixToRoot,
        jsonLdObject,
        altTargetHref,
    });

    const navbar = renderNavbar({ lang, prefixToRoot, prefixToHome });
    const footer = renderFooter({ lang, prefixToRoot, prefixToHome });

    const cardsHtml = articles.map((a) => renderArticleCard(a, lang, prefixToRoot, false)).join("\n");
    const waHref = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(translations[lang]["contact.whatsapp"])}`;

    return `${head}
${navbar}

    <main id="main-content" tabindex="-1">
        <header class="article-hero">
            <div class="container">
                <nav class="breadcrumb" aria-label="Breadcrumb">
                    <a href="${prefixToHome}">${isId ? "Beranda" : "Home"}</a>
                    <span class="breadcrumb__sep">/</span>
                    <span aria-current="page">${isId ? "Artikel" : "Articles"}</span>
                </nav>
                <div class="article-header">
                    <p class="eyebrow">${isId ? "Artikel & Wawasan" : "Articles & Insights"}</p>
                    <h1 class="article-header__title">${
                        isId
                            ? "Catatan praktis seputar website &amp; sistem bisnis."
                            : "Practical notes on web &amp; systems engineering."
                    }</h1>
                    <p class="article-header__desc">${escapeHtml(description)}</p>
                </div>
            </div>
        </header>

        <section class="section" aria-label="${isId ? "Daftar Artikel" : "All Articles"}">
            <div class="container">
                <div class="articles-grid">
${cardsHtml}
                </div>
            </div>
        </section>

        <section class="contact" aria-labelledby="hub-contact-title">
            <div class="container contact__inner">
                <p class="eyebrow eyebrow--light">${isId ? "Mari Berdiskusi" : "Let's Talk"}</p>
                <h2 id="hub-contact-title" class="contact__title">${
                    isId ? "Siap membangun <span>website Anda?</span>" : "Ready to build <span>your website?</span>"
                }</h2>
                <p class="contact__desc">${escapeHtml(translations[lang]["final.desc"])}</p>
                <div class="contact__actions">
                    <a href="${waHref}" class="button button--light button--lg" data-contact="whatsapp" data-track="whatsapp_click" data-track-location="articles-hub" target="_blank" rel="noopener noreferrer">${escapeHtml(
        translations[lang]["final.whatsapp"]
    )}</a>
                </div>
            </div>
        </section>
    </main>

${footer}`;
}

function injectLatestArticlesIntoHomepage(articles) {
    const latest = articles.slice(0, 3);
    const cardsHtml = latest.map((a) => renderArticleCard(a, "en", "", true)).join("\n\n");
    const block = `<!-- ARTICLES_LATEST_START -->\n                <div class="articles-grid">\n${cardsHtml}\n                </div>\n                <!-- ARTICLES_LATEST_END -->`;

    const indexHtml = readFileSync(new URL("index.html", root), "utf8");
    const updated = indexHtml.replace(/<!-- ARTICLES_LATEST_START -->[\s\S]*?<!-- ARTICLES_LATEST_END -->/, block);
    writeFileSync(new URL("index.html", root), updated);
    console.log(`Updated index.html with ${latest.length} latest article card(s)`);
}

function updateSitemap(articles) {
    const urlPairs = [
        { en: `${ORIGIN}/`, id: `${ORIGIN}/id/` },
        { en: `${ORIGIN}/articles/`, id: `${ORIGIN}/id/articles/` },
        ...articles.map((a) => ({
            en: `${ORIGIN}/articles/${a.slug}/`,
            id: `${ORIGIN}/id/articles/${a.slug}/`,
            lastmod: a.updatedAt || a.publishedAt,
        })),
    ];

    const entries = [];
    for (const pair of urlPairs) {
        for (const loc of [pair.en, pair.id]) {
            entries.push(`    <url>
        <loc>${loc}</loc>${pair.lastmod ? `\n        <lastmod>${pair.lastmod}</lastmod>` : ""}
        <xhtml:link rel="alternate" hreflang="en" href="${pair.en}"/>
        <xhtml:link rel="alternate" hreflang="id" href="${pair.id}"/>
    </url>`);
        }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join(
        "\n"
    )}\n</urlset>\n`;
    writeFileSync(new URL("sitemap.xml", root), xml);
    console.log(`Updated sitemap.xml with ${entries.length} URLs`);
}

async function main() {
    const articles = await loadArticles();
    console.log(`Loaded ${articles.length} article(s) from content/articles`);

    // 1. Generate Hub pages
    ensureDir("articles/");
    ensureDir("id/articles/");
    writeFileSync(new URL("articles/index.html", root), renderArticlesHubPage(articles, "en"));
    writeFileSync(new URL("id/articles/index.html", root), renderArticlesHubPage(articles, "id"));
    console.log("Wrote articles/index.html and id/articles/index.html");

    // 2. Generate Article Detail pages
    for (const article of articles) {
        const enDir = `articles/${article.slug}/`;
        const idDir = `id/articles/${article.slug}/`;
        ensureDir(enDir);
        ensureDir(idDir);

        writeFileSync(new URL(`${enDir}index.html`, root), renderArticleDetailPage(article, articles, "en"));
        writeFileSync(new URL(`${idDir}index.html`, root), renderArticleDetailPage(article, articles, "id"));
        console.log(`Wrote ${enDir}index.html and ${idDir}index.html`);
    }

    // 3. Inject latest articles into index.html
    injectLatestArticlesIntoHomepage(articles);

    // 4. Update sitemap.xml
    updateSitemap(articles);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

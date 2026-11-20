# Fatih Roihan: Freelance Website Developer Portfolio

Portfolio and client-acquisition website for freelance website development (landing pages, company profiles, portfolio sites). Live at https://fatihroihan.site/ (GitHub Pages, custom domain via `CNAME`).

## Stack

Plain HTML, CSS, and JavaScript (ES modules). No build step is needed to serve the site.

## Structure

- `index.html`: English page (site root, hand-written).
- `id/index.html`: pre-rendered Indonesian page. **Generated**, do not edit by hand.
- `articles/` & `id/articles/`: generated bilingual article hub and article detail pages.
- `content/articles/*.json`: structured bilingual article + SEO data managed by `roihan-ai-office-v2`.
- `content/schema.json` & `content/AI_PUBLISHING_SPEC.md`: JSON Schema and publishing rules for `roihan-ai-office-v2`.
- `assets/js/translations.js`: all copy in EN and ID.
- `assets/js/config.js`: WhatsApp number, email, tracking switch.
- `assets/js/i18n.js`: language detection, switcher, WhatsApp/email link generation.
- `scripts/build-articles.mjs`: builds `articles/`, `id/articles/`, homepage article cards, and `sitemap.xml`.
- `scripts/build-id.mjs`: builds `id/index.html`.
- `scripts/publish.mjs`: unified build and SEO check pipeline for `roihan-ai-office-v2`.
- `scripts/check.mjs`: static checks (links, assets, WhatsApp, metadata, hreflang, sitemap, JSON-LD).

## Workflow

After changing copy in `index.html`, `translations.js`, or adding/updating an article in `content/articles/*.json`:

    node scripts/publish.mjs              # builds articles, builds id/index.html, updates sitemap.xml, and runs check.mjs
    node scripts/publish.mjs --git-push   # builds, validates, commits, and pushes to GitHub Pages

Run locally with any static server from the repo root, for example `python -m http.server 8000`, then open `/` and `/id/`.

Language: `/` detects the browser language (Indonesian browsers see Indonesian, everything else English) and remembers a manual choice; `/id/` is always Indonesian. WhatsApp CTAs use the number in `config.js` with a pre-filled message in the active language.

Tracking events (`data-track`) only fire if gtag, plausible, or dataLayer is already on the page; nothing third-party is loaded.

## Internal files

Planning notes and the original full-size photo are kept outside this repository (local only). Do not add internal documents to the repository: GitHub Pages publishes everything that is committed, and Git history is public.

# AI Publishing & SEO Specification (`roihan-ai-office-v2`)

This repository (`fatihroihan.site`) includes an automated bilingual static article & SEO engine designed specifically for **`roihan-ai-office-v2`**.

## 1. How It Works

1. **`roihan-ai-office-v2` creates or updates a JSON file** in `content/articles/<slug>.json` following `content/schema.json`.
2. **Build & Publish Pipeline (`node scripts/publish.mjs` or GitHub Actions)**:
   - Reads all JSON files in `content/articles/*.json`.
   - Optionally downloads external cover/inline images if `--download-images` is passed, or embeds external image URLs (`https://...`) directly with proper `width`, `height`, `loading="lazy"`, and `alt` attributes.
   - Generates static English (`articles/<slug>/index.html`) and Indonesian (`id/articles/<slug>/index.html`) article pages.
   - Generates the bilingual Article Hub pages (`articles/index.html` and `id/articles/index.html`).
   - Injects the latest 3 articles into the homepage (`index.html` and `id/index.html`).
   - Updates `sitemap.xml` with `<xhtml:link rel="alternate" hreflang="..." />` for every article.
   - Runs `node scripts/check.mjs` to enforce strict SEO, link, JSON-LD, and accessibility rules.

---

## 2. Strict SEO Rules (Enforced by `scripts/check.mjs`)

When `roihan-ai-office-v2` generates an article JSON, it **MUST** obey these limits:
- **`slug`**: Lowercase alphanumeric and hyphens only (e.g., `high-converting-landing-page-architecture`).
- **`en.title` & `id.title`**: Between **15 and 58 characters**. (The generator appends ` | Fatih Roihan`, keeping the total `<title>` tag `<= 75` characters).
- **`en.description` & `id.description`**: Strictly between **70 and 175 characters**.
- **Images (`cover` and `type: "image"` blocks)**:
  - Can use any external HTTPS URL (e.g., `https://images.unsplash.com/...` or CDN URL) or a local path (`assets/images/...`).
  - Must include non-empty `alt` text (`en` and `id` for cover, `alt` string for content blocks).
  - `width` and `height` default to `1200` and `630` for covers and `1000` and `600` for inline images if omitted.

---

## 3. Supported Content Block Types (`blocks`)

Each entry in `en.blocks` and `id.blocks` is an object:

| Type | Required Fields | Optional Fields | Description |
| :--- | :--- | :--- | :--- |
| `"p"` | `text` | - | Paragraph text. |
| `"h2"` | `text` | `id` | Section heading (auto-indexed in Table of Contents). |
| `"h3"` | `text` | `id` | Sub-section heading. |
| `"ul"` | `items` (string[]) | - | Bulleted list. |
| `"ol"` | `items` (string[]) | - | Numbered list. |
| `"quote"` | `text` | `author` | Styled pull-quote / blockquote. |
| `"callout"` | `title`, `text` | - | Highlighted executive takeaway box. |
| `"image"` | `url`, `alt` | `caption`, `width`, `height` | Responsive figure with external or local image URL. |
| `"code"` | `code` | `language` | Formatted code/architecture snippet block. |

---

## 4. Commands for `roihan-ai-office-v2`

```bash
# Build all articles, regenerate id/index.html, update sitemap.xml, and run SEO checks:
node scripts/publish.mjs

# Also download remote https:// images locally into assets/images/articles/ during build:
node scripts/publish.mjs --download-images

# Build and automatically commit & push to GitHub Pages:
node scripts/publish.mjs --git-push
```

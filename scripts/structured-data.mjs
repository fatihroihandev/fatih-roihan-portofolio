// Schema.org data shared by the page builders.
// The service catalog is generated from translations.js so the JSON-LD always matches
// the services shown on the page, in the page's language.
import { translations } from "../assets/js/translations.js";

export const ORIGIN = "https://fatihroihan.site";
const PERSON_ID = `${ORIGIN}/#person`;
const CATALOG_ID = `${ORIGIN}/#services`;

// Same grouping and order as the Services section in index.html.
const SERVICE_GROUPS = [
    ["sg1", ["sv1", "sv2", "sv3"]],
    ["sg2", ["sv5", "sv6", "sv7"]],
    ["sg3", ["sv8", "sv4", "sv9"]],
];

export function servicesCatalog(lang) {
    const t = translations[lang];
    const home = lang === "id" ? `${ORIGIN}/id/` : `${ORIGIN}/`;

    return {
        "@type": "OfferCatalog",
        "@id": CATALOG_ID,
        "name": t["nav.services"],
        "itemListElement": SERVICE_GROUPS.map(([group, services]) => ({
            "@type": "OfferCatalog",
            "name": t[`${group}.title`],
            "description": t[`${group}.desc`],
            "itemListElement": services.map((key) => ({
                "@type": "Offer",
                "url": `${home}#services`,
                "itemOffered": {
                    "@type": "Service",
                    "name": t[`${key}.title`],
                    "description": [1, 2, 3, 4].map((n) => t[`${key}.l${n}`]).join(". ") + ".",
                    "audience": { "@type": "Audience", "audienceType": t[`${key}.for`] },
                    "provider": { "@id": PERSON_ID },
                },
            })),
        })),
    };
}

// Insert or refresh the service catalog inside a page's JSON-LD @graph.
export function withServicesCatalog(html, lang) {
    const pattern = /(<script type="application\/ld\+json">)([\s\S]*?)(\n\s*<\/script>)/;
    const match = html.match(pattern);
    if (!match) throw new Error("JSON-LD block not found");

    const data = JSON.parse(match[2]);
    const graph = data["@graph"];
    const person = graph.find((node) => node["@id"] === PERSON_ID);
    if (!person) throw new Error("Person node not found in JSON-LD");
    person.hasOfferCatalog = { "@id": CATALOG_ID };

    const catalog = servicesCatalog(lang);
    const index = graph.findIndex((node) => node["@id"] === CATALOG_ID);
    if (index === -1) graph.push(catalog);
    else graph[index] = catalog;

    const json = JSON.stringify(data, null, 4).replace(/^/gm, "    ");
    return html.replace(pattern, `$1\n${json}$3`);
}

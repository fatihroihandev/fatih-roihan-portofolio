import { CONFIG } from "./config.js";
import { translations } from "./translations.js";

const STORAGE_KEY = "fr-lang";
const SUPPORTED = ["id", "en"];

// id/index.html is a pre-rendered Indonesian page; its URL decides its language.
const staticLang = document.documentElement.dataset.staticLang;

function storedLanguage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);

        return SUPPORTED.includes(stored) ? stored : null;
    } catch (error) {
        // Storage can be blocked (private mode); fall back to browser language.
        return null;
    }
}

function detectLanguage() {
    if (SUPPORTED.includes(staticLang)) {
        return staticLang;
    }

    const stored = storedLanguage();

    if (stored) {
        return stored;
    }

    const preferred = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
    const code = preferred.toLowerCase().split("-")[0];

    // "in" is the legacy ISO code some browsers still report for Indonesian.
    return code === "id" || code === "in" ? "id" : "en";
}

function applyTitle(element, [plain, accent]) {
    const accentNode = element.querySelector("span");

    if (element.firstChild && element.firstChild.nodeType === Node.TEXT_NODE) {
        element.firstChild.nodeValue = `${plain} `;
    }

    if (accentNode) {
        accentNode.textContent = accent;
    }
}

function applyContactLinks(dict) {
    const subject = encodeURIComponent(dict["contact.subject"]);
    const body = encodeURIComponent(dict["contact.body"]);
    const emailHref = `mailto:${CONFIG.email}?subject=${subject}&body=${body}`;

    document.querySelectorAll('[data-contact="email"]').forEach((link) => {
        link.href = emailHref;
    });

    document.querySelectorAll("[data-contact-text]").forEach((element) => {
        element.textContent = CONFIG.email;
    });

    const hasWhatsapp = /^\d{8,15}$/.test(CONFIG.whatsapp);

    document.querySelectorAll('[data-contact="whatsapp"]').forEach((link) => {
        // Primary CTAs keep their in-page fallback link when no number is set.
        link.hidden = !hasWhatsapp && !link.hasAttribute("data-contact-fallback");

        if (hasWhatsapp) {
            const message = dict[link.dataset.waMessage] || dict["contact.whatsapp"];
            link.href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(message)}`;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
        }
    });

    // A list item wrapping only a WhatsApp link hides together with it.
    document.querySelectorAll("li:has(> [data-contact='whatsapp'])").forEach((item) => {
        item.hidden = !hasWhatsapp;
    });
}

export function setLanguage(lang) {
    const language = SUPPORTED.includes(lang) ? lang : "en";
    const dict = translations[language];

    document.documentElement.lang = language;
    document.title = dict["meta.title"];

    document.querySelectorAll("[data-i18n]").forEach((element) => {
        const value = dict[element.dataset.i18n];

        if (typeof value === "string") {
            element.textContent = value;
        }
    });

    document.querySelectorAll("[data-i18n-title]").forEach((element) => {
        const value = dict[element.dataset.i18nTitle];

        if (Array.isArray(value)) {
            applyTitle(element, value);
        }
    });

    // data-i18n-attr="aria-label:nav.label;alt:about.alt"
    document.querySelectorAll("[data-i18n-attr]").forEach((element) => {
        element.dataset.i18nAttr.split(";").forEach((pair) => {
            const [attribute, key] = pair.split(":");

            if (dict[key]) {
                element.setAttribute(attribute, dict[key]);
            }
        });
    });

    document.querySelectorAll("[data-lang-option]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.langOption === language));
    });

    // Keep the menu toggle label in sync with its current state.
    const toggle = document.querySelector(".navbar__toggle");

    if (toggle) {
        const isOpen = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-label", dict[isOpen ? "nav.close" : "nav.open"]);
    }

    applyContactLinks(dict);
}

export function getText(key) {
    return translations[document.documentElement.lang]?.[key] || translations.en[key];
}

export function initI18n() {
    setLanguage(detectLanguage());

    document.querySelectorAll("[data-lang-option]").forEach((button) => {
        button.addEventListener("click", () => {
            const language = button.dataset.langOption;

            try {
                localStorage.setItem(STORAGE_KEY, language);
            } catch (error) {
                // Preference simply won't persist if storage is unavailable.
            }

            // The Indonesian page lives at /id/; English is the site root.
            if (staticLang === "id" && language === "en") {
                window.location.href = "../";
                return;
            }

            setLanguage(language);
        });
    });
}

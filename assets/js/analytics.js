import { CONFIG } from "./config.js";

// Sends conversion events (CTA / contact clicks) to an analytics provider
// only if one has been added to the page (gtag, plausible, or dataLayer).
// No third-party script is loaded here, so nothing is sent by default.

function sendEvent(name, params) {
    if (typeof window.gtag === "function") {
        window.gtag("event", name, params);
    }

    if (typeof window.plausible === "function") {
        window.plausible(name, { props: params });
    }

    if (Array.isArray(window.dataLayer)) {
        window.dataLayer.push({ event: name, ...params });
    }
}

export function initAnalytics() {
    if (!CONFIG.trackingEnabled) {
        return;
    }

    document.addEventListener("click", (event) => {
        const target = event.target.closest("[data-track]");

        if (!target) {
            return;
        }

        sendEvent(target.dataset.track, {
            location: target.dataset.trackLocation || "",
            language: document.documentElement.lang,
        });
    });
}

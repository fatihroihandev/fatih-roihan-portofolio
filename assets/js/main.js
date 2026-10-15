import { initI18n } from "./i18n.js";
import { initNavigation } from "./navigation.js";
import { initAnalytics } from "./analytics.js";

initI18n();
initNavigation();
initAnalytics();

const yearElement = document.querySelector("#current-year");

if (yearElement) {
    yearElement.textContent = String(new Date().getFullYear());
}

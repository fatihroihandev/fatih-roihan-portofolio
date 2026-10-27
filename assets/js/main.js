import { initTheme } from "./theme.js";
import { initI18n } from "./i18n.js";
import { initNavigation } from "./navigation.js";
import { initAnalytics } from "./analytics.js";
import { initPortfolioFilter } from "./portfolio.js";

initTheme();
initI18n();
initNavigation();
initAnalytics();
initPortfolioFilter();

const yearElement = document.querySelector("#current-year");

if (yearElement) {
    yearElement.textContent = String(new Date().getFullYear());
}

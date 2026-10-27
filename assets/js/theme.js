const THEME_STORAGE_KEY = "fr-theme";

export function getPreferredTheme() {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === "dark" || stored === "light") {
            return stored;
        }
    } catch (e) {
        // Storage access might be restricted
    }
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme) {
    const activeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", activeTheme);

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute("content", activeTheme === "dark" ? "#090D16" : "#F8FAFC");
    }

    const toggleBtns = document.querySelectorAll(".theme-toggle");
    toggleBtns.forEach((btn) => {
        btn.setAttribute("aria-pressed", String(activeTheme === "dark"));
        btn.setAttribute("data-current-theme", activeTheme);
    });

    try {
        localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
    } catch (e) {}
}

export function initTheme() {
    const initialTheme = getPreferredTheme();
    applyTheme(initialTheme);

    document.querySelectorAll(".theme-toggle").forEach((btn) => {
        btn.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme") || "light";
            const next = current === "dark" ? "light" : "dark";
            applyTheme(next);
        });
    });

    if (window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
            try {
                if (!localStorage.getItem(THEME_STORAGE_KEY)) {
                    applyTheme(e.matches ? "dark" : "light");
                }
            } catch (err) {}
        });
    }
}

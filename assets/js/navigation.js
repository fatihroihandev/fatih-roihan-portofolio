import { getText } from "./i18n.js";

export function initNavigation() {
    const toggle = document.querySelector(".navbar__toggle");
    const menu = document.querySelector("#primary-navigation");

    if (!toggle || !menu) {
        return;
    }

    function setOpen(open) {
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", getText(open ? "nav.close" : "nav.open"));
        menu.classList.toggle("is-open", open);
    }

    toggle.addEventListener("click", () => {
        setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    // Close the mobile menu after choosing a destination.
    menu.addEventListener("click", (event) => {
        if (event.target.closest("a")) {
            setOpen(false);
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
            setOpen(false);
            toggle.focus();
        }
    });
}

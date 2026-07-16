export function initNavigation() {
    const toggle = document.querySelector(".navbar__toggle");
    const menu = document.querySelector("#primary-navigation");

    if (!toggle || !menu) {
        return;
    }

    toggle.addEventListener("click", () => {
        const isOpen = toggle.getAttribute("aria-expanded") === "true";

        toggle.setAttribute("aria-expanded", String(!isOpen));

        toggle.setAttribute(
            "aria-label",
            isOpen
                ? "Open navigation menu"
                : "Close navigation menu"
        );

        menu.classList.toggle("is-open", !isOpen);
    });
}
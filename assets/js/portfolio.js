export function initPortfolioFilter() {
    const filterButtons = document.querySelectorAll(".project-filter__btn");
    const projects = document.querySelectorAll(".project[data-category]");

    if (!filterButtons.length || !projects.length) return;

    filterButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const filter = btn.getAttribute("data-filter") || "all";

            filterButtons.forEach((b) => {
                const isActive = b === btn;
                b.classList.toggle("is-active", isActive);
                b.setAttribute("aria-pressed", String(isActive));
            });

            projects.forEach((card) => {
                const category = card.getAttribute("data-category");
                const matches = filter === "all" || category === filter;

                if (matches) {
                    card.removeAttribute("hidden");
                    card.style.display = "";
                    card.classList.add("is-visible");
                } else {
                    card.setAttribute("hidden", "");
                    card.style.display = "none";
                    card.classList.remove("is-visible");
                }
            });
        });
    });
}

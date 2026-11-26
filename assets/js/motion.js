// Motion layer: preloader, smooth scroll, scroll reveal, header behaviour, process timeline,
// custom cursor, magnetic buttons, spotlight cards, 3D hero tilt and the developer HUD.
// Everything is progressive: without this file the page is fully readable.
//
// Performance rules used throughout:
// - pointer and scroll handlers only record values; DOM writes happen once per animation frame;
// - motion is driven by transform/opacity (compositor-only), never by top/left/width;
// - easing is frame-rate independent (exponential damping by real elapsed time),
//   so it feels the same on 60 Hz and 120 Hz screens.

const root = document.documentElement;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const PRELOAD_KEY = "fr-intro-seen";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
// Fraction of the remaining distance to cover this frame, for a given "speed" (higher = snappier).
const damp = (speed, dt) => 1 - Math.exp(-speed * dt);

// Small helper: run `step(dt)` every frame until it returns false, restartable at any time.
function animator(step) {
    let running = false;
    let last = 0;

    function frame(now) {
        const dt = Math.min((now - last) / 1000, 1 / 20);
        last = now;
        if (step(dt) === false) {
            running = false;
            return;
        }
        requestAnimationFrame(frame);
    }

    return function start() {
        if (running) return;
        running = true;
        last = performance.now();
        requestAnimationFrame(frame);
    };
}

function markReady() {
    root.classList.add("is-ready");
}

function runPreloader() {
    const hero = document.querySelector(".hero");
    let seen = false;

    try {
        seen = sessionStorage.getItem(PRELOAD_KEY) === "1";
        sessionStorage.setItem(PRELOAD_KEY, "1");
    } catch (error) {
        seen = true;
    }

    if (!hero || seen || reduceMotion) {
        requestAnimationFrame(markReady);
        return;
    }

    const loader = document.createElement("div");
    loader.className = "preloader";
    loader.setAttribute("aria-hidden", "true");
    loader.innerHTML = '<span class="preloader__name">Fatih Roihan — Portfolio</span><span class="preloader__count">0</span><span class="preloader__bar"></span>';
    document.body.appendChild(loader);

    const count = loader.querySelector(".preloader__count");
    const bar = loader.querySelector(".preloader__bar");
    const duration = 1100;
    const start = performance.now();

    function tick(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        count.textContent = String(Math.round(eased * 100));
        bar.style.transform = `scaleX(${eased.toFixed(3)})`;

        if (t < 1) {
            requestAnimationFrame(tick);
            return;
        }

        loader.classList.add("is-done");
        setTimeout(markReady, 250);
        loader.addEventListener("transitionend", () => loader.remove(), { once: true });
        setTimeout(() => loader.remove(), 1600);
    }

    requestAnimationFrame(tick);
}

// ---------- Smooth scroll (desktop mouse wheel only) ----------

const scroller = {
    enabled: false,
    to(y) {
        window.scrollTo(0, y);
    },
};

function initSmoothScroll() {
    if (reduceMotion || !finePointer) return;

    root.classList.add("has-smooth-scroll");
    scroller.enabled = true;

    const maxScroll = () => root.scrollHeight - window.innerHeight;
    let current = window.scrollY;
    let target = current;
    let active = false;
    // Programmatic jumps (anchor links) use an eased tween instead of the wheel damping.
    let tween = null;

    const start = animator((dt) => {
        if (tween) {
            const t = Math.min((performance.now() - tween.start) / tween.duration, 1);
            const eased = t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
            current = tween.from + (tween.to - tween.from) * eased;
            if (t >= 1) {
                tween = null;
                target = current;
            }
        } else {
            current += (target - current) * damp(9, dt);
            if (Math.abs(target - current) < 0.4) current = target;
        }

        window.scrollTo(0, current);
        active = Boolean(tween) || current !== target;
        return active;
    });

    function canScroll(element, deltaY) {
        // Let inner scrollable areas (code blocks, menus) scroll natively.
        for (let node = element; node && node !== document.body && node !== root; node = node.parentElement) {
            if (node.scrollHeight <= node.clientHeight + 1) continue;
            const overflow = getComputedStyle(node).overflowY;
            if (overflow !== "auto" && overflow !== "scroll") continue;
            const atTop = node.scrollTop <= 0;
            const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
            if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return true;
        }
        return false;
    }

    window.addEventListener(
        "wheel",
        (event) => {
            if (event.ctrlKey || event.defaultPrevented) return;
            if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
            if (canScroll(event.target, event.deltaY)) return;

            let delta = event.deltaY;
            if (event.deltaMode === 1) delta *= 16;
            else if (event.deltaMode === 2) delta *= window.innerHeight;

            event.preventDefault();
            if (!active) current = target = window.scrollY;
            tween = null;
            target = clamp(target + delta, 0, maxScroll());
            start();
        },
        { passive: false }
    );

    // Keyboard, scrollbar drag, find-in-page: follow the native position.
    window.addEventListener(
        "scroll",
        () => {
            if (!active) current = target = window.scrollY;
        },
        { passive: true }
    );

    scroller.to = (y) => {
        const to = clamp(y, 0, maxScroll());
        const from = window.scrollY;
        const distance = Math.abs(to - from);
        current = from;
        tween = { from, to, start: performance.now(), duration: clamp(500 + distance * 0.25, 700, 1500) };
        start();
    };

    document.addEventListener("click", (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
        const link = event.target.closest('a[href^="#"]');
        if (!link) return;
        const hash = link.getAttribute("href");
        const destination = hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
        if (!destination) return;

        event.preventDefault();
        const offset = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
        scroller.to(destination.getBoundingClientRect().top + window.scrollY - offset);
        history.pushState(null, "", hash);
        destination.setAttribute("tabindex", destination.getAttribute("tabindex") || "-1");
        destination.focus({ preventScroll: true });
    });
}

// ---------- Scroll reveal ----------

function initReveal() {
    const groups = [
        [".section-header .eyebrow, .about__content .eyebrow, .service-group__head, .trust__stats", 0],
        [".section-title, .contact__title", 0],
        [".section-description, .contact__desc, .services__more, .project-filter, .contact__actions, .faq__cta", 0.1],
        [".service, .project, .article-card, .faq__item, .stats > div, .trust__stat, .commitment, .audience", "stagger"],
        [".step", "sequence"],
        [".about__content > p, .about__content > .button, .section-header-row__action", 0.05],
    ];

    const targets = [];

    groups.forEach(([selector, delay]) => {
        document.querySelectorAll(selector).forEach((element) => {
            if (element.closest(".hero")) return;
            element.classList.add("reveal");

            const siblings = Array.from(element.parentElement.children);
            const index = siblings.indexOf(element);
            if (delay === "stagger") {
                element.style.setProperty("--d", `${(index % 3) * 0.08}s`);
            } else if (delay === "sequence") {
                // Process steps arrive strictly in order: 01, 02, 03...
                element.style.setProperty("--d", `${index * 0.09}s`);
            } else if (delay) {
                element.style.setProperty("--d", `${delay}s`);
            }

            targets.push(element);
        });
    });

    const figure = document.querySelector(".about__figure");
    if (figure) targets.push(figure);

    if (!("IntersectionObserver" in window) || reduceMotion) {
        targets.forEach((element) => element.classList.add("is-in"));
        return;
    }

    // Clip-path-hidden elements never intersect, so watch their parent instead;
    // steps are revealed together so their sequence delays play in order.
    const triggers = new Map();
    targets.forEach((element) => {
        const viaParent = element.matches(".section-title, .contact__title, .about__figure, .step");
        const trigger = viaParent ? element.parentElement : element;
        if (!triggers.has(trigger)) triggers.set(trigger, []);
        triggers.get(trigger).push(element);
    });

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                triggers.get(entry.target).forEach((element) => {
                    element.classList.add("is-in");
                    onRevealed(element);
                });
                observer.unobserve(entry.target);
            });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
    );

    triggers.forEach((_, trigger) => observer.observe(trigger));
}

// ---------- Scroll-linked: progress bar, header, process timeline, HUD ----------

const scrollListeners = [];

function initScrollEffects() {
    const header = document.querySelector(".site-header");
    const bar = document.createElement("div");
    bar.className = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);

    let lastY = window.scrollY;
    let maxScroll = 1;
    let queued = false;

    function measure() {
        maxScroll = Math.max(root.scrollHeight - window.innerHeight, 1);
    }

    function update() {
        queued = false;
        const y = window.scrollY;
        bar.style.transform = `scaleX(${(y / maxScroll).toFixed(4)})`;

        if (header) {
            header.classList.toggle("is-scrolled", y > 24);
            const menuOpen = header.querySelector(".navbar__menu.is-open");
            // Small dead zone so tiny wheel jitters do not flicker the header.
            if (Math.abs(y - lastY) > 4) {
                const hide = y > lastY && y > 400 && !menuOpen && !header.contains(document.activeElement);
                header.classList.toggle("is-hidden", hide);
                lastY = y;
            }
        }

        scrollListeners.forEach((listener) => listener(y, maxScroll));
    }

    function queue() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(update);
    }

    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener(
        "resize",
        () => {
            measure();
            queue();
        },
        { passive: true }
    );
    // Content below (images, fonts) can change the page height after load.
    if ("ResizeObserver" in window) new ResizeObserver(() => measure()).observe(document.body);
    measure();
    update();
}

function initProcess() {
    const steps = document.querySelector(".steps");
    if (!steps) return;
    const items = Array.from(steps.querySelectorAll(".step"));

    const fill = document.createElement("span");
    fill.className = "steps__fill";
    const head = document.createElement("span");
    head.className = "steps__head";
    [fill, head].forEach((element) => {
        element.setAttribute("aria-hidden", "true");
        steps.appendChild(element);
    });

    let horizontal = true;
    let width = 0;
    let nodes = [];
    let progress = 0;
    let target = 0;

    function measure() {
        horizontal = getComputedStyle(steps, "::before").display !== "none";
        width = steps.clientWidth;
        // Each step's number badge sits at its left edge; light it when the head passes it.
        nodes = items.map((item) => item.offsetLeft + 19);
    }

    function setTarget() {
        const rect = steps.getBoundingClientRect();
        const vh = window.innerHeight;
        target = clamp((vh * 0.85 - rect.top) / (vh * 0.5), 0, 1);
        if (reduceMotion) progress = target;
    }

    const render = () => {
        if (horizontal) {
            const x = progress * width;
            fill.style.transform = `scaleX(${progress.toFixed(4)})`;
            head.style.transform = `translate3d(${x.toFixed(1)}px, -50%, 0)`;
            head.style.opacity = progress > 0.002 && progress < 0.998 ? "1" : "0";
            items.forEach((item, index) => item.classList.toggle("is-lit", x >= nodes[index]));
        } else {
            const vh = window.innerHeight;
            items.forEach((item) => item.classList.toggle("is-lit", item.getBoundingClientRect().top < vh * 0.72));
        }
    };

    const start = animator((dt) => {
        progress += (target - progress) * damp(6, dt);
        if (Math.abs(target - progress) < 0.0005) progress = target;
        render();
        return progress !== target;
    });

    scrollListeners.push(() => {
        setTarget();
        start();
    });
    window.addEventListener(
        "resize",
        () => {
            measure();
            render();
        },
        { passive: true }
    );
    measure();
    setTarget();
    progress = target;
    render();
}

// ---------- Pointer effects ----------

function initSpotlight() {
    const cards = document.querySelectorAll(".service, .project, .article-card, .step, .commitment, .audience");

    cards.forEach((card) => {
        let rect = null;
        let x = 0;
        let y = 0;
        let queued = false;

        function write() {
            queued = false;
            card.style.setProperty("--mx", `${x}px`);
            card.style.setProperty("--my", `${y}px`);
        }

        card.addEventListener("pointerenter", () => {
            rect = card.getBoundingClientRect();
        });
        card.addEventListener("pointermove", (event) => {
            if (!rect) rect = card.getBoundingClientRect();
            x = Math.round(event.clientX - rect.left);
            y = Math.round(event.clientY - rect.top);
            if (!queued) {
                queued = true;
                requestAnimationFrame(write);
            }
        });
        card.addEventListener("pointerleave", () => {
            rect = null;
        });
    });
}

function initHeroPointer() {
    const hero = document.querySelector(".hero");
    if (!hero) return;
    const spot = hero.querySelector(".hero__spot");
    const mockup = hero.querySelector(".browser-mockup");

    const REST = { rx: 8, ry: -14 };
    let rect = null;
    let inside = false;
    const pos = { x: 0, y: 0, tx: 0, ty: 0 };
    const tilt = { rx: REST.rx, ry: REST.ry, tx: REST.rx, ty: REST.ry };

    const start = animator((dt) => {
        const k = damp(8, dt);
        pos.x += (pos.tx - pos.x) * k;
        pos.y += (pos.ty - pos.y) * k;
        tilt.rx += (tilt.tx - tilt.rx) * damp(5, dt);
        tilt.ry += (tilt.ty - tilt.ry) * damp(5, dt);

        if (spot) spot.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
        if (mockup) mockup.style.transform = `perspective(1400px) rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)`;

        const settled =
            Math.abs(pos.tx - pos.x) < 0.3 &&
            Math.abs(pos.ty - pos.y) < 0.3 &&
            Math.abs(tilt.tx - tilt.rx) < 0.02 &&
            Math.abs(tilt.ty - tilt.ry) < 0.02;
        if (settled && !inside && mockup) mockup.style.transform = "";
        return !settled;
    });

    hero.addEventListener("pointerenter", (event) => {
        rect = hero.getBoundingClientRect();
        inside = true;
        // Start the light where the pointer is, then follow it.
        pos.x = pos.tx = event.clientX - rect.left;
        pos.y = pos.ty = event.clientY - rect.top;
        spot?.classList.add("is-on");
        mockup?.classList.add("is-tracking");
    });

    hero.addEventListener("pointermove", (event) => {
        if (!rect) rect = hero.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        pos.tx = x;
        pos.ty = y;
        tilt.tx = (0.5 - y / rect.height) * 12;
        tilt.ty = (x / rect.width - 0.5) * 20;
        start();
    });

    hero.addEventListener("pointerleave", () => {
        rect = null;
        inside = false;
        spot?.classList.remove("is-on");
        tilt.tx = REST.rx;
        tilt.ty = REST.ry;
        start();
    });

    window.addEventListener("scroll", () => (rect = null), { passive: true });
}

function initMagnetic() {
    document.querySelectorAll(".button, .theme-toggle, .hero__scroll").forEach((element) => {
        const strength = element.classList.contains("button--lg") ? 0.3 : 0.22;
        let center = null;
        const p = { x: 0, y: 0, tx: 0, ty: 0 };

        const start = animator((dt) => {
            const k = damp(10, dt);
            p.x += (p.tx - p.x) * k;
            p.y += (p.ty - p.y) * k;
            const settled = Math.abs(p.tx - p.x) < 0.05 && Math.abs(p.ty - p.y) < 0.05;
            if (settled && p.tx === 0 && p.ty === 0) {
                element.style.transform = "";
                element.classList.remove("is-magnetic");
                return false;
            }
            element.style.transform = `translate3d(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px, 0)`;
            return !settled;
        });

        element.addEventListener("pointerenter", () => {
            const rect = element.getBoundingClientRect();
            // Measure the resting centre even if the element is still drifting back.
            center = { x: rect.left + rect.width / 2 - p.x, y: rect.top + rect.height / 2 - p.y };
            element.classList.add("is-magnetic");
        });

        element.addEventListener("pointermove", (event) => {
            if (!center) return;
            p.tx = (event.clientX - center.x) * strength;
            p.ty = (event.clientY - center.y) * strength;
            start();
        });

        element.addEventListener("pointerleave", () => {
            center = null;
            p.tx = 0;
            p.ty = 0;
            start();
        });
    });
}

// ---------- Programmer details ----------

const GLYPHS = "!<>-_\\/[]{}=+*^?#01";

// "Decode" text: characters resolve left to right from random glyphs.
// Aborts if something else (e.g. the language switcher) rewrites the text meanwhile.
function scramble(element, duration = 650) {
    if (reduceMotion || element.dataset.scrambling) return;
    const finalText = element.textContent;
    if (!finalText.trim()) return;

    element.dataset.scrambling = "1";
    const lockWidth = element.matches(".button, .project-filter__btn");
    if (lockWidth) element.style.width = `${element.getBoundingClientRect().width}px`;

    const start = performance.now();
    let written = finalText;
    let lastSwap = 0;

    function finish(text) {
        if (text !== null) element.textContent = text;
        if (lockWidth) element.style.width = "";
        delete element.dataset.scrambling;
    }

    function frame(now) {
        if (element.textContent !== written) {
            finish(null);
            return;
        }
        const progress = Math.min((now - start) / duration, 1);
        if (progress >= 1) {
            finish(finalText);
            return;
        }
        // Swap glyphs ~30 times a second: readable flicker, less text layout work.
        if (now - lastSwap > 33) {
            lastSwap = now;
            const revealed = Math.floor(progress * finalText.length);
            let out = "";
            for (let i = 0; i < finalText.length; i += 1) {
                const char = finalText[i];
                out += i < revealed || char === " " ? char : GLYPHS[(Math.random() * GLYPHS.length) | 0];
            }
            written = out;
            element.textContent = out;
        }
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

function initHoverScramble() {
    document.querySelectorAll(".navbar__links a, .site-footer__col a, .text-link, .button, .project-filter__btn").forEach((element) => {
        element.addEventListener("pointerenter", () => scramble(element, 420));
    });
}

function countUp(element) {
    const raw = element.dataset.count || "";
    const target = Number(raw);
    if (!Number.isFinite(target) || reduceMotion) return;

    const duration = 1400;
    const start = performance.now();
    function frame(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 4);
        element.textContent = String(Math.round(eased * target));
        if (t < 1) requestAnimationFrame(frame);
        else element.textContent = raw;
    }
    requestAnimationFrame(frame);
}

function onRevealed(element) {
    if (element.matches(".eyebrow")) scramble(element, 900);
    if (element.matches(".trust__stat")) {
        const number = element.querySelector("[data-count]");
        if (number) countUp(number);
    }
}

// Label shown next to the cursor, written like function calls.
function cursorLabel(target) {
    const element = target.closest("a, button, summary, .project, .audience");
    if (!element) return "";
    if (element.dataset.cursor) return element.dataset.cursor;
    if (element.matches('[data-contact="whatsapp"]')) return "whatsapp.open()";
    if (element.matches('[data-contact="email"]')) return "mail.compose()";
    if (element.matches(".theme-toggle")) return "theme.toggle()";
    if (element.matches(".lang-switch__option")) return `lang.set("${element.dataset.langOption}")`;
    if (element.matches(".project-filter__btn")) return `filter("${element.dataset.filter}")`;
    if (element.matches(".navbar__toggle")) return "menu.toggle()";
    if (element.matches("summary")) return "faq.expand()";
    if (element.matches(".project, .audience")) return "";
    const href = element.getAttribute("href") || "";
    if (href.startsWith("#")) return `scrollTo("${href}")`;
    if (/^https?:/.test(href)) return "window.open()";
    return "router.go()";
}

function initCursor() {
    const cursor = document.createElement("div");
    cursor.className = "cursor";
    cursor.setAttribute("aria-hidden", "true");
    cursor.innerHTML = '<span class="cursor__shape"></span><span class="cursor__label"></span>';
    document.body.appendChild(cursor);
    root.classList.add("has-cursor");

    const shape = cursor.querySelector(".cursor__shape");
    const label = cursor.querySelector(".cursor__label");
    let x = -100;
    let y = -100;
    let cx = -100;
    let cy = -100;
    let hovering = false;

    const start = animator((dt) => {
        const dx = x - cx;
        const dy = y - cy;
        const k = damp(28, dt);
        cx += dx * k;
        cy += dy * k;
        cursor.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;

        // Squash and stretch along the direction of travel (dot state only).
        const moving = Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15;
        if (!hovering && moving) {
            const stretch = Math.min(Math.hypot(dx, dy) / 80, 0.45);
            shape.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad) scale(${(1 + stretch).toFixed(3)}, ${(1 - stretch * 0.5).toFixed(3)})`;
        } else {
            shape.style.transform = "";
        }

        if (!moving) {
            cx = x;
            cy = y;
            cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
        }
        return moving;
    });

    window.addEventListener(
        "pointermove",
        (event) => {
            if (event.pointerType !== "mouse") return;
            x = event.clientX;
            y = event.clientY;
            if (!cursor.classList.contains("is-active")) {
                cx = x;
                cy = y;
                cursor.classList.add("is-active");
            }
            start();
        },
        { passive: true }
    );

    document.documentElement.addEventListener("pointerleave", () => cursor.classList.remove("is-active"));
    window.addEventListener("pointerdown", () => cursor.classList.add("is-down"));
    window.addEventListener("pointerup", () => cursor.classList.remove("is-down"));

    let lastTarget = null;
    document.addEventListener("pointerover", (event) => {
        if (event.target === lastTarget) return;
        lastTarget = event.target;
        const interactive = event.target.closest("a, button, summary");
        const text = !interactive && event.target.closest("p, h1, h2, h3, h4, dd, li");
        const labelText = cursorLabel(event.target);

        hovering = Boolean(interactive);
        cursor.classList.toggle("is-hover", hovering);
        cursor.classList.toggle("is-text", Boolean(text));
        cursor.classList.toggle("has-label", Boolean(labelText));
        if (labelText && label.textContent !== labelText) label.textContent = labelText;
    });
}

function initHud() {
    const hud = document.createElement("div");
    hud.className = "hud";
    hud.setAttribute("aria-hidden", "true");
    hud.innerHTML = '<span class="hud__live">JKT <b data-hud="time">--:--:--</b></span><span>X <b data-hud="x">0000</b> Y <b data-hud="y">0000</b></span><span>SCROLL <b data-hud="scroll">000</b>%</span>';
    document.body.appendChild(hud);

    const time = hud.querySelector('[data-hud="time"]');
    const px = hud.querySelector('[data-hud="x"]');
    const py = hud.querySelector('[data-hud="y"]');
    const scroll = hud.querySelector('[data-hud="scroll"]');
    const pad = (value, size) => String(Math.max(0, Math.round(value))).padStart(size, "0");
    let clock;

    try {
        clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    } catch (error) {
        clock = null;
    }

    function tick() {
        time.textContent = clock ? clock.format(new Date()) : new Date().toLocaleTimeString();
    }
    tick();
    setInterval(tick, 1000);

    let mx = 0;
    let my = 0;
    let queued = false;
    function writePointer() {
        queued = false;
        if (!hud.classList.contains("is-on")) return;
        px.textContent = pad(mx, 4);
        py.textContent = pad(my, 4);
    }
    window.addEventListener(
        "pointermove",
        (event) => {
            mx = event.clientX;
            my = event.clientY;
            if (!queued) {
                queued = true;
                requestAnimationFrame(writePointer);
            }
        },
        { passive: true }
    );

    // The HUD stays out of the hero composition and appears once the visitor scrolls on.
    const hero = document.querySelector(".hero");
    let heroHeight = hero ? hero.offsetHeight : 0;
    window.addEventListener("resize", () => (heroHeight = hero ? hero.offsetHeight : 0), { passive: true });

    let lastPercent = "";
    function onScroll(y, max) {
        const percent = pad((y / max) * 100, 3);
        if (percent !== lastPercent) {
            lastPercent = percent;
            scroll.textContent = percent;
        }
        hud.classList.toggle("is-on", !hero || y > heroHeight * 0.6);
    }
    scrollListeners.push(onScroll);
    onScroll(window.scrollY, Math.max(root.scrollHeight - window.innerHeight, 1));
}

function consoleHello() {
    const big = "font: 600 28px/1.1 'Inter Tight', system-ui, sans-serif; letter-spacing: -0.04em;";
    const mono = "font: 12px/1.6 ui-monospace, Menlo, monospace; color: #8a8a93;";
    console.log("%cFatih Roihan", big);
    console.log("%cYou opened the console, so you are probably a developer too.\nThis site: hand-written HTML, CSS, and ES modules. No framework, no bundler.\nLet's build something: https://wa.me/628818227834", mono);
}

export function initMotion() {
    runPreloader();
    initReveal();
    initProcess();
    if (finePointer && !reduceMotion) initHud();
    initScrollEffects();
    consoleHello();

    if (reduceMotion) return;

    initSmoothScroll();
    initSpotlight();

    if (finePointer) {
        initHeroPointer();
        initMagnetic();
        initCursor();
        initHoverScramble();
    }
}

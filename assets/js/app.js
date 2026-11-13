/* =========================================================
   Smile Bar — interactions
   ========================================================= */
(() => {
  "use strict";

  /* ---------- Settings ---------- */
  const CONFIG = {
    phoneIntl: "+66896774851",
    phoneDisplay: "+66 89 677 4851",
    whatsapp: "66896774851",
    address: "97/85 Kamala Beach Road, Soi Rong Rian Tamruat, Kamala, Kathu, Phuket 83150",
    lat: 7.9516, lng: 98.2812,
    open: 11 * 60, close: 24 * 60,
    // Optional: a URL that accepts a JSON POST (your own API, Formspree,
    // Google Apps Script…) to receive bookings directly. When empty, the
    // request is sent to the restaurant on WhatsApp.
    bookingEndpoint: "",
    firstSeating: 11 * 60, lastSeating: 22 * 60 + 30, step: 30,
    maxGuests: 19, daysAhead: 120,
    // Fire Show nights (0 = Sunday … 6 = Saturday): no reservations between
    // 17:30 and 21:30, walk-in guests only.
    fireShow: { days: [5, 6], from: 17 * 60 + 30, to: 21 * 60 + 30 },
    nye: { date: "2026-12-31", midnight: Date.UTC(2026, 11, 31, 17, 0) }, // 1 Jan 2027 00:00 Phuket
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  /* ---------- i18n ---------- */
  const LANGS = ["en", "ru", "th"];
  const guessLang = () => { const n = (navigator.language || "en").slice(0, 2).toLowerCase(); return LANGS.includes(n) ? n : "en"; };
  let lang = store.get("smile.lang", null);
  if (!LANGS.includes(lang)) lang = guessLang();
  const t = (k) => (window.I18N[lang] && window.I18N[lang][k]) ?? window.I18N.en[k] ?? k;
  const locale = () => ({ en: "en-GB", ru: "ru-RU", th: "th-TH-u-ca-gregory" }[lang]);
  // Messages for the restaurant team are always in English.
  const tEn = (k) => window.I18N.en[k] ?? k;
  const guestsLabel = (n, l = lang) => {
    if (l === "ru") { const a = n % 10, b = n % 100; return `${n} ${a === 1 && b !== 11 ? "гость" : a >= 2 && a <= 4 && (b < 12 || b > 14) ? "гостя" : "гостей"}`; }
    if (l === "th") return `${n} ท่าน`;
    return `${n} ${n > 1 ? "guests" : "guest"}`;
  };

  function applyLang() {
    document.documentElement.lang = lang;
    $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    $$("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    $$("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    renderFaq();
    renderMenu();
    renderBookings();
    updateLive();
    $$("[data-whatsapp]").forEach((a) => { a.href = wa(tEn("wa.hello")); });
    $$("[data-whatsapp-group]").forEach((a) => { a.href = wa(tEn("wa.group")); });
    if (booking.dlg.open) booking.refresh();
  }

  /* ---------- Phuket time (UTC+7) ---------- */
  const OFFSET = 7 * 3600e3;
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; };
  const now = () => { const d = new Date(Date.now() + OFFSET); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), mins: d.getUTCHours() * 60 + d.getUTCMinutes() }; };
  const today = () => { const n = now(); return ymd(n.y, n.m, n.d); };
  const addDays = (s, k) => { const { y, m, d } = parse(s); const x = new Date(Date.UTC(y, m - 1, d + k)); return ymd(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); };
  const dow = (s) => { const { y, m, d } = parse(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const fmtTime = (mins) => { const h = Math.floor(mins / 60) % 24, m = Math.round(mins % 60); return `${pad(h)}:${pad(m)}`; };
  const fmtDate = (s, o = { weekday: "long", day: "numeric", month: "long" }, loc = locale()) => {
    const { y, m, d } = parse(s);
    const r = new Intl.DateTimeFormat(loc, { ...o, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
    return r.charAt(0).toUpperCase() + r.slice(1);
  };
  function sunset(s) {
    const { y, m, d } = parse(s), rad = Math.PI / 180;
    const N = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
    const g = (2 * Math.PI / 365) * (N - 1);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const lat = CONFIG.lat * rad;
    const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat) * Math.cos(dec)) - Math.tan(lat) * Math.tan(dec)) / rad;
    return 720 - 4 * (CONFIG.lng - ha) - eq + 420;
  }

  /* ---------- Live bits ---------- */
  const wa = (text) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
  function updateLive() {
    const n = now();
    const open = n.mins >= CONFIG.open && n.mins < CONFIG.close;
    $$("[data-open-status]").forEach((el) => { el.textContent = open ? t("open.now") : t("open.closed"); el.parentElement.classList.toggle("is-open", open); });
    let diff = Math.floor((CONFIG.nye.midnight - Date.now()) / 1000);
    const cd = $(".countdown");
    if (diff <= 0) { cd.hidden = true; return; }
    const parts = { d: Math.floor(diff / 86400), h: Math.floor(diff % 86400 / 3600), m: Math.floor(diff % 3600 / 60), s: diff % 60 };
    for (const k in parts) $(`[data-cd="${k}"]`).textContent = pad(parts[k]);
  }

  let toastTimer;
  function toast(msg) {
    const el = $(".toast");
    el.textContent = msg; el.classList.add("is-shown");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("is-shown"), 2800);
  }

  /* ---------- Smooth scroll (Lenis) ---------- */
  let lenis = null;
  function initSmooth() {
    if (reduceMotion || !window.Lenis) return;
    lenis = new window.Lenis({ duration: 1.15, easing: (x) => 1 - Math.pow(1 - x, 4), smoothTouch: false });
    if (window.gsap && window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  const navH = () => $(".nav").offsetHeight;
  function scrollToEl(el) {
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: -navH() + 1, duration: 1.4 });
    else el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }
  const lockScroll = (on) => { document.body.classList.toggle("is-locked", on); if (lenis) on ? lenis.stop() : lenis.start(); };

  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    closeDrawer();
    scrollToEl(target);
  });

  /* ---------- GSAP flourishes ---------- */
  function initMotion() {
    if (reduceMotion || !window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    $$(".hero__tile").forEach((tile, i) => {
      gsap.to(tile, { yPercent: (i % 2 ? -4 : 4), ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    });
    gsap.to(".hero__center", { yPercent: 30, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    gsap.fromTo(".reserve__word", { scale: 0.86, letterSpacing: "0.02em" }, { scale: 1, letterSpacing: "-0.04em", ease: "none", scrollTrigger: { trigger: ".reserve", start: "top 85%", end: "center 55%", scrub: true } });
    gsap.fromTo(".reserve__glow", { scale: 0.7, opacity: 0.4 }, { scale: 1, opacity: 1, ease: "none", scrollTrigger: { trigger: ".reserve", start: "top bottom", end: "center center", scrub: true } });
    $$(".story__photo img, .events__poster img").forEach((img) => {
      gsap.fromTo(img, { yPercent: -4 }, { yPercent: 4, ease: "none", scrollTrigger: { trigger: img, start: "top bottom", end: "bottom top", scrub: true } });
    });
  }

  /* ---------- Reveal ---------- */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const sib = $$(".reveal", en.target.parentElement);
      en.target.style.transitionDelay = `${Math.min(Math.max(0, sib.indexOf(en.target)), 6) * 70}ms`;
      en.target.classList.add("is-in");
      revealIO.unobserve(en.target);
    });
  }, { rootMargin: "0px 0px -8% 0px" });
  $$(".reveal").forEach((el) => revealIO.observe(el));

  /* ---------- Nav, drawer, dock ---------- */
  const nav = $(".nav"), hero = $(".hero"), dock = $(".dock");
  const burger = $(".burger"), drawer = $("#drawer");
  function onScroll() {
    const y = window.scrollY;
    nav.classList.toggle("is-scrolled", y > hero.offsetHeight - navH() - 10);
    const r = $(".reserve").getBoundingClientRect();
    const nearReserve = r.top < innerHeight && r.bottom > 0;
    dock.classList.toggle("is-shown", y > hero.offsetHeight * 0.7 && !nearReserve);
  }
  addEventListener("scroll", onScroll, { passive: true });

  function openDrawer() {
    drawer.hidden = false;
    $$("nav a", drawer).forEach((a, i) => a.style.setProperty("--i", i));
    requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.add("is-open")));
    burger.setAttribute("aria-expanded", "true");
    nav.classList.add("is-scrolled");
    lockScroll(true);
  }
  function closeDrawer() {
    if (drawer.hidden) return;
    drawer.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    lockScroll(false);
    onScroll();
    setTimeout(() => { drawer.hidden = true; }, 800);
  }
  burger.addEventListener("click", () => (drawer.hidden ? openDrawer() : closeDrawer()));
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  const links = $$(".nav__links a");
  const secIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) links.forEach((a) => a.classList.toggle("is-current", a.getAttribute("href") === "#" + en.target.id)); });
  }, { rootMargin: "-45% 0px -50% 0px" });
  ["story", "menu", "signatures", "events", "gallery", "infos"].forEach((id) => { const el = document.getElementById(id); el && secIO.observe(el); });

  $$("[data-lang]").forEach((b) => b.addEventListener("click", () => { lang = b.dataset.lang; store.set("smile.lang", lang); applyLang(); }));

  /* =========================================================
     MENU
     ========================================================= */
  const MENU = window.SMILE_MENU;
  const chipSpy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const id = en.target.id.slice(2);
      $$(".chip").forEach((c) => {
        const on = c.dataset.jump === id;
        c.classList.toggle("is-active", on);
        if (on) { const box = c.parentElement; box.scrollTo({ left: c.offsetLeft - box.offsetWidth / 2 + c.offsetWidth / 2, behavior: "smooth" }); }
      });
    });
  }, { rootMargin: "-35% 0px -60% 0px" });
  let mode = "food", query = "";
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hl = (text) => {
    if (!query) return esc(text);
    const i = norm(text).indexOf(norm(query));
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + query.length)) + "</mark>" + esc(text.slice(i + query.length));
  };
  function priceHtml(p) {
    if (!p) return `<span class="mitem__price">—</span>`;
    if (/^[\d,]+$/.test(p)) return `<span class="mitem__price">${esc(p)} THB</span>`;
    return `<span class="mitem__price is-multi">${esc(p).replace(/ \/ /g, "<br>")}</span>`;
  }
  function renderMenu() {
    const sections = MENU[mode];
    $$(".menu__mode").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
    $(".menu__chips").innerHTML = sections.map((s) => `<button type="button" class="chip" data-jump="${s.id}">${esc(s.t)}</button>`).join("");
    let count = 0;
    $(".menu__cols").innerHTML = sections.map((s) => {
      const items = s.items.filter((it) => !query || norm([it.n, it.d || "", it.s || "", s.t, it.c || ""].join(" ")).includes(norm(query)));
      count += items.length;
      let lastSub = null;
      const rows = items.map((it) => {
        let sub = "";
        if (it.s && it.s !== lastSub) { sub = `<p class="mcat__sub">${esc(it.s)}</p>`; lastSub = it.s; }
        return `${sub}<div class="mitem"><div class="mitem__name">${it.c ? `<span class="mitem__code">${esc(it.c)}</span>` : ""}${hl(it.n)}</div>${it.prot ? `<span class="mitem__price">290 – 490 THB</span>` : priceHtml(it.p)}${it.d ? `<p class="mitem__desc">${hl(it.d)}</p>` : ""}</div>`;
      }).join("");
      const prot = s.items.some((it) => it.prot) ? `<div class="mprot"><strong>${esc(t("menu.protein"))}</strong>${esc(t("menu.proteinList"))}</div>` : "";
      return `<section class="mcat" id="m-${s.id}" ${items.length ? "" : "hidden"}><h3 class="mcat__title">${esc(s.t)}</h3>${s.i ? `<p class="mcat__intro">${esc(s.i)}</p>` : ""}${prot}${rows}</section>`;
    }).join("");
    $(".menu__empty").hidden = count > 0;
    chipSpy.disconnect();
    $$(".mcat").forEach((el) => chipSpy.observe(el));
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }
  $$(".menu__mode").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; renderMenu(); }));
  $(".menu__chips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-jump]"); if (!c) return;
    $$(".chip").forEach((x) => x.classList.toggle("is-active", x === c));
    const el = document.getElementById("m-" + c.dataset.jump);
    if (lenis) lenis.scrollTo(el, { offset: -(navH() + 80), duration: 1.2 }); else el.scrollIntoView({ behavior: "smooth" });
  });
  let qTimer;
  $(".menu__search input").addEventListener("input", (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { query = e.target.value.trim(); renderMenu(); }, 120); });

  /* ---------- Signatures rail ---------- */
  const rail = $(".rail");
  $$("[data-rail]").forEach((b) => b.addEventListener("click", () => {
    const card = $(".card", rail);
    rail.scrollBy({ left: Number(b.dataset.rail) * (card.offsetWidth + 24), behavior: reduceMotion ? "auto" : "smooth" });
  }));

  /* ---------- Gallery lightbox ---------- */
  const lb = $(".lightbox");
  $$("[data-lightbox]").forEach((b) => b.addEventListener("click", () => {
    const img = $("img", lb);
    img.src = b.dataset.lightbox; img.alt = $("img", b).alt;
    lb.showModal(); lockScroll(true);
  }));
  lb.addEventListener("close", () => lockScroll(false));
  lb.addEventListener("click", (e) => { if (e.target === lb || e.target.closest("[data-close-lb]")) lb.close(); });

  /* ---------- FAQ ---------- */
  function renderFaq() {
    const list = t("faq");
    $(".faq__list").innerHTML = list.map(([q, a]) => `<details class="qa"><summary>${esc(q)}</summary><div class="qa__a"><p>${esc(a)}</p></div></details>`).join("");
    $$(".qa").forEach((d) => {
      const s = $("summary", d), body = $(".qa__a", d);
      s.addEventListener("click", (e) => {
        if (reduceMotion) return;
        e.preventDefault();
        if (d.open) {
          body.animate([{ height: body.offsetHeight + "px", opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 380, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => { d.open = false; };
        } else {
          d.open = true;
          body.animate([{ height: "0px", opacity: 0 }, { height: body.offsetHeight + "px", opacity: 1 }], { duration: 520, easing: "cubic-bezier(.16,1,.3,1)" });
        }
      });
    });
  }

  /* =========================================================
     BOOKING
     ========================================================= */
  const booking = {
    dlg: $(".booking"),
    form: $(".booking__form"),
    step: 1,
    st: { guests: 2, date: null, time: null },
    month: null, preset: null, opener: null, last: null,

    // Every seating time still ahead on that date (bookable or walk-in only).
    slots(date) {
      const n = now(), isToday = date === today(), out = [];
      for (let m = CONFIG.firstSeating; m <= CONFIG.lastSeating; m += CONFIG.step) if (!(isToday && m < n.mins + 30)) out.push(m);
      return out;
    },
    isFireNight(date) { return CONFIG.fireShow.days.includes(dow(date)); },
    // Fri & Sat 17:30–21:30: no reservations (Fire Show), walk-in only.
    isBlocked(date, m) { return this.isFireNight(date) && m >= CONFIG.fireShow.from && m < CONFIG.fireShow.to; },
    bookable(date) { return this.slots(date).filter((m) => !this.isBlocked(date, m)); },
    first() { return this.bookable(today()).length ? today() : addDays(today(), 1); },

    open(preset, opener) {
      this.opener = opener; this.preset = preset || null;
      this.dlg.classList.remove("is-done", "is-closing");
      this.st.time = null;
      if (preset === "nye") { this.st.date = CONFIG.nye.date; }
      else if (!this.st.date || this.st.date < this.first()) this.st.date = this.first();
      const { y, m } = parse(this.st.date); this.month = { y, m };
      if (preset === "nye") this.form.elements.occasion.value = "nye";
      this.go(preset === "nye" ? 2 : 1);
      this.dlg.showModal(); lockScroll(true);
    },
    close() {
      if (!this.dlg.open) return;
      if (reduceMotion) return this.dlg.close();
      this.dlg.classList.add("is-closing");
      setTimeout(() => { this.dlg.classList.remove("is-closing"); this.dlg.close(); }, 320);
    },

    go(step) {
      this.step = step;
      $$(".step", this.form).forEach((el) => el.classList.toggle("is-active", Number(el.dataset.step) === step));
      $$("[data-step-dot]").forEach((li) => { const s = Number(li.dataset.stepDot); li.classList.toggle("is-active", s === step); li.classList.toggle("is-done", s < step); });
      $(".booking__foot").classList.toggle("has-prev", step > 1 && step < 5);
      this.dlg.classList.toggle("is-done", step === 5);
      $("[data-next]").disabled = false;
      this.refresh();
      const a = $(`.step[data-step="${step}"]`, this.form); if (a) a.scrollTop = 0;
    },

    refresh() {
      const st = this.st;
      $("output[name=guests]").textContent = st.guests;
      $('[data-guests="-1"]').disabled = st.guests <= 1;
      $('[data-guests="1"]').disabled = st.guests >= CONFIG.maxGuests;
      const hint = $("[data-group-hint]");
      hint.hidden = st.guests < CONFIG.maxGuests;
      hint.innerHTML = `${esc(t("bk.group"))} <a href="${wa(tEn("wa.group"))}" target="_blank" rel="noopener">WhatsApp</a>`;
      this.calendar();
      if (this.step === 2) this.renderSlots();
      if (this.step === 4) $("[data-review]").innerHTML = this.ticket(this.data());
      if (this.step === 5 && this.last) this.done(this.last);
      $("[data-next]").textContent = this.step === 4 ? t("bk.confirm") : this.step === 5 ? t("done.close") : t("bk.continue");
    },

    calendar() {
      const { y, m } = this.month, td = today(), first = this.first(), max = addDays(td, CONFIG.daysAhead);
      $(".cal__title").textContent = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
      const a = parse(td), b = parse(max);
      $('[data-cal="-1"]').disabled = y === a.y && m === a.m;
      $('[data-cal="1"]').disabled = y === b.y && m === b.m;
      const names = [];
      for (let i = 0; i < 7; i++) names.push(new Intl.DateTimeFormat(locale(), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i))).replace(".", ""));
      $(".cal__dow").innerHTML = names.map((n) => `<span>${esc(n)}</span>`).join("");
      const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7, days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      let html = "<span></span>".repeat(lead);
      for (let d = 1; d <= days; d++) {
        const s = ymd(y, m, d), off = s < first || s > max;
        const cls = ["cal__day", s === td && "is-today", s === this.st.date && "is-selected", s === CONFIG.nye.date && "is-event"].filter(Boolean).join(" ");
        html += `<button type="button" class="${cls}" data-date="${s}" ${off ? "disabled" : ""} aria-pressed="${s === this.st.date}" aria-label="${esc(fmtDate(s))}">${d}</button>`;
      }
      $(".cal__grid").innerHTML = html;
    },

    renderSlots() {
      const st = this.st, list = this.slots(st.date), open = this.bookable(st.date);
      $("[data-summary-date]").textContent = `${fmtDate(st.date)} · ${guestsLabel(st.guests)}`;
      $("[data-fire-note]").hidden = !this.isFireNight(st.date);
      if (!open.length) { st.time = null; $(".slots").innerHTML = `<p class="mute">${esc(t("bk.noSlots"))}</p>`; return; }
      const ss = sunset(st.date) - 45;
      const sunsetSlot = open.reduce((b, x) => (Math.abs(x - ss) < Math.abs(b - ss) ? x : b), open[0]);
      if (this.preset === "nye" && st.time == null && open.includes(20 * 60)) st.time = 20 * 60;
      if (st.time != null && !open.includes(st.time)) st.time = null;
      const groups = [["slot.lunch", (x) => x < 15 * 60], ["slot.afternoon", (x) => x >= 15 * 60 && x < 19 * 60], ["slot.dinner", (x) => x >= 19 * 60]];
      $(".slots").innerHTML = groups.map(([k, f]) => {
        const g = list.filter(f); if (!g.length) return "";
        return `<div><h4>${esc(t(k))}</h4><div class="slots__row">${g.map((x) => {
          if (this.isBlocked(st.date, x)) return `<button type="button" class="slot is-walkin" disabled aria-label="${fmtTime(x)} — ${esc(t("slot.walkin"))}">${fmtTime(x)}<span class="slot__badge slot__badge--walkin">${esc(t("slot.walkin"))}</span></button>`;
          return `<button type="button" class="slot ${st.time === x ? "is-selected" : ""}" data-time="${x}" aria-pressed="${st.time === x}">${fmtTime(x)}${x === sunsetSlot ? `<span class="slot__badge">${esc(t("slot.sunset"))}</span>` : ""}</button>`;
        }).join("")}</div></div>`;
      }).join("");
    },

    data() {
      const fd = new FormData(this.form);
      return { ...this.st, name: (fd.get("name") || "").trim(), phone: (fd.get("phone") || "").trim(), email: (fd.get("email") || "").trim(), occasion: fd.get("occasion") || "none", notes: (fd.get("notes") || "").trim() };
    },
    validate() {
      const d = this.data();
      const ok = { name: d.name.length >= 2, phone: d.phone.replace(/\D/g, "").length >= 8, email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email) };
      let bad = null;
      for (const k in ok) {
        const input = this.form.elements[k];
        input.closest(".field").classList.toggle("is-invalid", !ok[k]);
        input.setAttribute("aria-invalid", String(!ok[k]));
        if (!ok[k] && !bad) bad = input;
      }
      if (bad) bad.focus();
      return !bad;
    },
    ticket(d, ref) {
      const rows = [];
      if (ref) rows.push([t("t.ref"), ref, "ref"]);
      rows.push([t("t.date"), fmtDate(d.date)], [t("t.time"), fmtTime(d.time)], [t("t.guests"), guestsLabel(d.guests)], [t("t.name"), d.name]);
      if (d.occasion !== "none") rows.push([t("t.occasion"), t("o." + d.occasion)]);
      if (d.notes) rows.push([t("t.notes"), d.notes]);
      return `<dl>${rows.map(([k, v, c]) => `<div class="ticket__row"><dt>${esc(k)}</dt><dd class="${c || ""}">${esc(v)}</dd></div>`).join("")}</dl>`;
    },
    message(b) {
      const lines = [tEn("wa.booking"), "", `Reference: ${b.ref}`, `Date: ${fmtDate(b.date, undefined, "en-GB")}`, `Time: ${fmtTime(b.time)}`, `Guests: ${b.guests}`, `Name: ${b.name}`, `Tel: ${b.phone}`, `Email: ${b.email}`];
      if (b.occasion !== "none") lines.push(`Occasion: ${tEn("o." + b.occasion)}`);
      if (b.notes) lines.push(`Requests: ${b.notes}`);
      lines.push(`Guest language: ${String(b.lang).toUpperCase()}`);
      lines.push("", "I understand the reservation is confirmed once the deposit is paid. Please send me the deposit details.");
      return lines.join("\n");
    },
    done(b) {
      $("[data-done-title]").textContent = b.sent ? t("done.titleSent") : t("done.title");
      $("[data-done-text]").textContent = b.sent ? t("done.textSent") : t("done.text");
      $("[data-done-ticket]").innerHTML = this.ticket(b, b.ref);
      $("[data-done-whatsapp]").href = wa(this.message(b));
    },
    async submit() {
      const b = { ...this.data(), ref: "SB-" + Math.random().toString(36).slice(2, 7).toUpperCase(), lang, createdAt: new Date().toISOString(), sent: false };
      if (CONFIG.bookingEndpoint) {
        const btn = $("[data-next]"); btn.disabled = true; btn.textContent = t("bk.sending");
        try {
          const r = await fetch(CONFIG.bookingEndpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...b, time: fmtTime(b.time), restaurant: "Smile Bar Kamala" }) });
          b.sent = r.ok;
        } catch { b.sent = false; }
      }
      const all = store.get("smile.bookings", []); all.push(b); store.set("smile.bookings", all);
      this.last = b; renderBookings(); this.go(5);
    },
    ics(b) {
      const { y, m, d } = parse(b.date);
      const start = new Date(Date.UTC(y, m - 1, d, 0, b.time) - OFFSET), end = new Date(start.getTime() + 2 * 3600e3);
      const f = (x) => x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const e = (s) => s.replace(/[\\,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
      const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Smile Bar//Booking//EN", "BEGIN:VEVENT", `UID:${b.ref}@smilebarphuket.com`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:${e(`Smile Bar — ${guestsLabel(b.guests)}`)}`, `LOCATION:${e(CONFIG.address)}`, `DESCRIPTION:${e(`${t("t.ref")}: ${b.ref}\nTel: ${CONFIG.phoneDisplay}`)}`, "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Smile Bar", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
      const url = URL.createObjectURL(new Blob([body], { type: "text/calendar;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `smile-bar-${b.date}.ics` });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    init() {
      const dlg = this.dlg;
      dlg.addEventListener("close", () => {
        lockScroll(false);
        if (this.opener && this.opener.focus) this.opener.focus({ preventScroll: true });
        if (this.step === 5) { this.form.reset(); this.st = { guests: 2, date: null, time: null }; this.last = null; }
      });
      dlg.addEventListener("cancel", (e) => { e.preventDefault(); this.close(); });
      dlg.addEventListener("click", (e) => {
        if (e.target === dlg || e.target.closest("[data-close]")) return this.close();
        const g = e.target.closest("[data-guests]");
        if (g) { this.st.guests = Math.min(CONFIG.maxGuests, Math.max(1, this.st.guests + Number(g.dataset.guests))); return this.refresh(); }
        const c = e.target.closest("[data-cal]");
        if (c) { let { y, m } = this.month; m += Number(c.dataset.cal); if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } this.month = { y, m }; return this.calendar(); }
        const day = e.target.closest("[data-date]");
        if (day && !day.disabled) { this.st.date = day.dataset.date; this.st.time = null; this.calendar(); const f = $(`[data-date="${this.st.date}"]`); f && f.focus(); return; }
        const slot = e.target.closest("[data-time]");
        if (slot) { this.st.time = Number(slot.dataset.time); this.renderSlots(); const f = $(`[data-time="${this.st.time}"]`); f && f.focus(); }
      });
      $("[data-prev]").addEventListener("click", () => this.go(Math.max(1, this.step - 1)));
      $("[data-next]").addEventListener("click", () => {
        if (this.step === 1) return this.st.date ? this.go(2) : toast(t("bk.pickDate"));
        if (this.step === 2) { if (this.st.time == null) return toast(t("bk.pickTime")); this.go(3); setTimeout(() => this.form.elements.name.focus(), 60); return; }
        if (this.step === 3) { if (this.validate()) this.go(4); return; }
        if (this.step === 4) return this.submit();
        this.close();
      });
      this.form.addEventListener("submit", (e) => e.preventDefault());
      this.form.addEventListener("input", (e) => { const f = e.target.closest(".field.is-invalid"); if (f) f.classList.remove("is-invalid"); });
      $("[data-ics]").addEventListener("click", () => this.last && this.ics(this.last));
      document.addEventListener("click", (e) => {
        const b = e.target.closest("[data-book]"); if (!b) return;
        e.preventDefault(); closeDrawer(); this.open(b.dataset.book || null, b);
      });
    },
  };

  function renderBookings() {
    const wrap = $(".mybookings"), td = today();
    const list = store.get("smile.bookings", []).filter((b) => b.date >= td).sort((a, b) => (a.date + pad(a.time)).localeCompare(b.date + pad(b.time)));
    wrap.hidden = !list.length;
    $(".mybookings__list").innerHTML = list.map((b) => `<li class="mybooking"><strong>${esc(fmtDate(b.date))} · ${fmtTime(b.time)}</strong><span>${guestsLabel(b.guests)}</span><span class="ref">${esc(b.ref)}</span><button type="button" data-cancel="${esc(b.ref)}">${esc(t("res.cancel"))}</button></li>`).join("");
  }
  $(".mybookings__list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cancel]"); if (!btn) return;
    const all = store.get("smile.bookings", []), item = all.find((x) => x.ref === btn.dataset.cancel);
    store.set("smile.bookings", all.filter((x) => x.ref !== btn.dataset.cancel));
    renderBookings(); toast(t("res.cancelled"));
    if (item) window.open(wa(`${tEn("wa.cancel")} ${item.ref} (${fmtDate(item.date, undefined, "en-GB")}, ${fmtTime(item.time)}).`), "_blank", "noopener");
  });

  /* ---------- Boot ---------- */
  $$("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
  booking.init();
  applyLang();
  onScroll();
  setInterval(updateLive, 1000);
  initSmooth();
  initMotion();
  const ready = () => document.documentElement.classList.add("is-ready");
  if (document.readyState === "complete") requestAnimationFrame(ready); else addEventListener("load", ready);
  setTimeout(ready, 1800);
})();

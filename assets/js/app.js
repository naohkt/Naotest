/* =========================================================
   Smile Bar & Restaurant — interactions
   ========================================================= */
(() => {
  "use strict";

  const S = window.SMILE;
  const R = S.restaurant;
  const B = S.booking;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Safe storage ---------- */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
    },
  };

  /* ---------- i18n ---------- */
  let lang = store.get("smile.lang", null) ||
    ((navigator.language || "en").toLowerCase().startsWith("fr") ? "fr" : "en");

  const t = (key, vars) => {
    let s = (window.I18N[lang] && window.I18N[lang][key]) ?? window.I18N.en[key] ?? key;
    if (vars) for (const k in vars) s = s.replace(`{${k}}`, vars[k]);
    return s;
  };
  const tx = (obj) => (obj ? obj[lang] || obj.en : "");
  const locale = () => (lang === "fr" ? "fr-FR" : "en-GB");

  function applyLang() {
    document.documentElement.lang = lang;
    $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    $$("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    $$(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    renderMenu();
    updateLive();
    updateWhatsAppLinks();
    renderMyBookings();
    if (booking.dialog.open) booking.refresh();
  }

  /* ---------- Phuket time (UTC+7, no DST) ---------- */
  const TZ_OFFSET = 7;
  const phuketNow = () => {
    const d = new Date(Date.now() + TZ_OFFSET * 3600e3);
    return {
      y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
      dow: d.getUTCDay(), mins: d.getUTCHours() * 60 + d.getUTCMinutes(), secs: d.getUTCSeconds(),
      ms: Date.now(),
    };
  };
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return { y, m, d }; };
  const dowOf = (s) => { const { y, m, d } = parseYmd(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
  const addDays = (s, n) => {
    const { y, m, d } = parseYmd(s);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  };
  const todayStr = () => { const n = phuketNow(); return ymd(n.y, n.m, n.d); };
  const toMins = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  const fmtMins = (mins) => {
    mins = Math.round(mins);
    const h = Math.floor(mins / 60) % 24, m = mins % 60;
    return lang === "fr" ? `${h}h${pad(m)}` : `${pad(h)}:${pad(m)}`;
  };
  const fmtDate = (s, opts = { weekday: "long", day: "numeric", month: "long" }) => {
    const { y, m, d } = parseYmd(s);
    const str = new Intl.DateTimeFormat(locale(), { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  /* ---------- Sunset (NOAA approximation) ---------- */
  function sunsetMinutes(dateStr) {
    const { y, m, d } = parseYmd(dateStr);
    const rad = Math.PI / 180;
    const N = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
    const g = (2 * Math.PI / 365) * (N - 1);
    const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
      0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const lat = R.lat * rad;
    const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl)) / rad;
    const utc = 720 - 4 * (R.lng - ha) - eqtime;
    return utc + TZ_OFFSET * 60;
  }

  /* ---------- Live info: open status, sunset, fire show ---------- */
  const OPEN = toMins(R.open), CLOSE = toMins(R.close);
  const FIRE_START = toMins(R.fireShow.start), FIRE_END = toMins(R.fireShow.end);

  function nextFireShow() {
    const n = phuketNow();
    const today = ymd(n.y, n.m, n.d);
    for (let i = 0; i < 8; i++) {
      const day = addDays(today, i);
      if (!R.fireShow.days.includes(dowOf(day))) continue;
      if (i === 0 && n.mins >= FIRE_END) continue;
      const live = i === 0 && n.mins >= FIRE_START;
      const { y, m, d } = parseYmd(day);
      const startMs = Date.UTC(y, m - 1, d, 0, FIRE_START) - TZ_OFFSET * 3600e3;
      return { day, offset: i, live, startMs };
    }
    return null;
  }

  function updateLive() {
    const n = phuketNow();
    const open = n.mins >= OPEN && n.mins < CLOSE;
    const soon = open && CLOSE - n.mins <= 45;
    $$("[data-open-status]").forEach((el) => { el.textContent = open ? (soon ? t("open.soon") : t("open.now")) : t("open.closed"); });
    $$("[data-open-dot]").forEach((el) => el.classList.toggle("is-open", open));

    const sunset = sunsetMinutes(todayStr());
    $$("[data-sunset]").forEach((el) => { el.textContent = fmtMins(sunset); });
    $$("[data-arrive]").forEach((el) => { el.textContent = fmtMins(Math.floor((sunset - 45) / 15) * 15); });

    const fire = nextFireShow();
    if (fire) {
      let label;
      if (fire.live) label = t("fire.now");
      else if (fire.offset === 0) label = t("fire.tonight");
      else label = t("fire.on", { day: fmtDate(fire.day, { weekday: "long" }) });
      $$("[data-next-fire]").forEach((el) => { el.textContent = label; });
      const cd = $(".countdown");
      cd.classList.toggle("is-live", fire.live);
      $(".countdown__label").textContent = fire.live ? t("mom.f.live") : t("mom.f.in");
      let diff = Math.max(0, Math.floor((fire.startMs - n.ms) / 1000));
      const parts = { d: Math.floor(diff / 86400), h: Math.floor(diff % 86400 / 3600), m: Math.floor(diff % 3600 / 60), s: diff % 60 };
      for (const k in parts) { const el = $(`[data-cd="${k}"]`); if (el) el.textContent = pad(parts[k]); }
    }
  }

  /* ---------- WhatsApp ---------- */
  const waLink = (text) => `https://wa.me/${R.whatsapp}?text=${encodeURIComponent(text)}`;
  function updateWhatsAppLinks() {
    $$("[data-whatsapp]").forEach((a) => { a.href = waLink(t("wa.hello")); });
    $$("[data-whatsapp-group]").forEach((a) => { a.href = waLink(t("wa.group")); });
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $(".toast");
    el.textContent = msg;
    el.classList.add("is-shown");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-shown"), 2800);
  }

  /* =========================================================
     MENU
     ========================================================= */
  let activeCourse = "all";
  let query = "";
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const normalize = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function highlight(text) {
    const safe = escapeHtml(text);
    if (!query) return safe;
    const n = normalize(text), q = normalize(query);
    const i = n.indexOf(q);
    if (i < 0) return safe;
    return escapeHtml(text.slice(0, i)) + "<mark>" + escapeHtml(text.slice(i, i + q.length)) + "</mark>" + escapeHtml(text.slice(i + q.length));
  }

  function renderMenu() {
    const tabs = $(".tabs");
    const panels = $(".menu__panels");
    tabs.innerHTML = [{ id: "all", label: { en: t("menu.all"), fr: t("menu.all") } }, ...S.menu]
      .map((c) => `<button type="button" class="tab" role="tab" data-course="${c.id}" aria-selected="${c.id === activeCourse}">${escapeHtml(tx(c.label))}</button>`)
      .join("");

    let visibleDishes = 0;
    panels.innerHTML = S.menu.map((c, ci) => {
      const dishes = c.dishes.filter((d) => {
        if (!query) return true;
        const hay = normalize([tx(d.name), tx(d.desc), ...(d.tags || []).map((tg) => tx(S.tagLabels[tg]))].join(" "));
        return hay.includes(normalize(query));
      });
      const hidden = (activeCourse !== "all" && activeCourse !== c.id) || dishes.length === 0;
      if (!hidden) visibleDishes += dishes.length;
      return `
        <section class="course" data-course-panel="${c.id}" ${hidden ? "hidden" : ""}>
          <header class="course__head">
            <span class="course__num">${pad(ci + 1)}</span>
            <h3 class="course__title">${escapeHtml(tx(c.label))}</h3>
            <p class="course__intro">${escapeHtml(tx(c.intro))}</p>
          </header>
          <ul class="dishes">
            ${dishes.map((d) => `
              <li class="dish ${(d.tags || []).includes("signature") ? "dish--signature" : ""}">
                <div class="dish__top">
                  <h4 class="dish__name">${highlight(tx(d.name))}</h4>
                  ${d.price != null ? `<span class="dish__leader"></span><span class="dish__price">${Number(d.price).toLocaleString(locale())}<small>THB</small></span>` : ""}
                </div>
                <p class="dish__desc">${highlight(tx(d.desc))}</p>
                ${(d.tags || []).length ? `<div class="dish__tags">${d.tags.map((tg) => `<span class="tag tag--${tg}">${escapeHtml(tx(S.tagLabels[tg]))}</span>`).join("")}</div>` : ""}
              </li>`).join("")}
          </ul>
        </section>`;
    }).join("");
    $(".menu__empty").hidden = visibleDishes > 0;
  }

  function initMenu() {
    $(".tabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-course]");
      if (!b) return;
      activeCourse = b.dataset.course;
      renderMenu();
      const sel = $(`.tab[data-course="${activeCourse}"]`);
      sel && sel.focus({ preventScroll: true });
      sel && sel.scrollIntoView({ inline: "center", block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
      const menuTop = $("#menu .menu__bar").getBoundingClientRect().top;
      if (menuTop < 0 || menuTop > window.innerHeight * 0.6) $(".menu__bar").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    });
    $(".tabs").addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const tabs = $$(".tab");
      const i = tabs.indexOf(document.activeElement);
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      next.click();
    });
    let timer;
    $(".search input").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { query = e.target.value.trim(); if (query) activeCourse = "all"; renderMenu(); }, 120);
    });
    $("[data-print]").addEventListener("click", () => window.print());
  }

  /* =========================================================
     BOOKING
     ========================================================= */
  const booking = {
    dialog: $(".booking"),
    form: $(".booking__form"),
    step: 1,
    state: { guests: 2, date: null, time: null, zone: "sand" },
    calMonth: null,
    preset: null,
    opener: null,
    last: null,

    open(preset, opener) {
      this.opener = opener || document.activeElement;
      this.preset = preset || null;
      this.dialog.classList.remove("is-done", "is-closing");
      this.state.time = null;
      const first = this.firstAvailableDate();
      if (preset === "fire") {
        const fire = nextFireShow();
        this.state.date = fire && !fire.live ? fire.day : this.nextFireDateAfterToday();
      } else if (preset === "sunset") {
        this.state.date = first;
      } else if (!this.state.date || this.state.date < first) {
        this.state.date = first;
      }
      const { y, m } = parseYmd(this.state.date);
      this.calMonth = { y, m };
      this.go(preset ? 2 : 1);
      this.dialog.showModal();
      document.body.classList.add("is-locked");
    },

    close() {
      if (!this.dialog.open) return;
      if (reduceMotion) return this.finishClose();
      this.dialog.classList.add("is-closing");
      setTimeout(() => this.finishClose(), 320);
    },
    finishClose() {
      this.dialog.classList.remove("is-closing");
      this.dialog.close();
    },

    nextFireDateAfterToday() {
      for (let i = 1; i < 8; i++) { const d = addDays(todayStr(), i); if (R.fireShow.days.includes(dowOf(d))) return d; }
      return todayStr();
    },

    slotsFor(dateStr) {
      const n = phuketNow();
      const isToday = dateStr === todayStr();
      const out = [];
      for (let mn = toMins(B.firstSeating); mn <= toMins(B.lastSeating); mn += B.stepMinutes) {
        if (isToday && mn < n.mins + 30) continue;
        out.push(mn);
      }
      return out;
    },
    firstAvailableDate() {
      const today = todayStr();
      return this.slotsFor(today).length ? today : addDays(today, 1);
    },

    go(step) {
      this.step = step;
      $$(".step", this.form).forEach((el) => el.classList.toggle("is-active", Number(el.dataset.step) === step));
      $$("[data-step-dot]").forEach((li) => {
        const s = Number(li.dataset.stepDot);
        li.classList.toggle("is-active", s === step);
        li.classList.toggle("is-done", s < step);
        if (s === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
      });
      const foot = $(".booking__foot");
      foot.classList.toggle("has-prev", step > 1 && step < 5);
      const next = $("[data-next]");
      next.disabled = false;
      next.textContent = step === 4 ? t("bk.confirm") : step === 5 ? t("done.close") : t("bk.continue");
      this.dialog.classList.toggle("is-done", step === 5);
      this.refresh();
      const active = $(`.step[data-step="${step}"]`, this.form);
      if (active) active.scrollTop = 0;
    },

    refresh() {
      const st = this.state;
      // Step 1
      $("output[name=guests]").textContent = st.guests;
      $('[data-guests="-1"]').disabled = st.guests <= 1;
      $('[data-guests="1"]').disabled = st.guests >= B.maxGuests;
      const hint = $("[data-group-hint]");
      hint.hidden = st.guests < B.maxGuests;
      hint.innerHTML = `${escapeHtml(t("bk.groupHint"))} <a href="${waLink(t("wa.group"))}" target="_blank" rel="noopener">WhatsApp</a>`;
      this.renderCalendar();
      // Step 2
      if (this.step === 2) this.renderSlots();
      if (this.step === 4) this.renderReview();
      if (this.step === 5 && this.last) this.renderDone(this.last);
      const next = $("[data-next]");
      next.textContent = this.step === 4 ? t("bk.confirm") : this.step === 5 ? t("done.close") : t("bk.continue");
    },

    renderCalendar() {
      const { y, m } = this.calMonth;
      const today = todayStr();
      const first = this.firstAvailableDate();
      const max = addDays(today, B.daysAhead);
      const title = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
      $(".cal__title").textContent = title;
      const t0 = parseYmd(today), tm = parseYmd(max);
      $('[data-cal="-1"]').disabled = y === t0.y && m === t0.m;
      $('[data-cal="1"]').disabled = y === tm.y && m === tm.m;

      // Monday-first weekday names
      const dows = [];
      for (let i = 0; i < 7; i++) dows.push(new Intl.DateTimeFormat(locale(), { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i))));
      $(".cal__dow").innerHTML = dows.map((d) => `<span>${escapeHtml(d.replace(".", ""))}</span>`).join("");

      const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      let html = "";
      for (let i = 0; i < firstDow; i++) html += "<span></span>";
      for (let d = 1; d <= days; d++) {
        const s = ymd(y, m, d);
        const disabled = s < first || s > max;
        const cls = ["cal__day"];
        if (s === today) cls.push("is-today");
        if (s === this.state.date) cls.push("is-selected");
        if (R.fireShow.days.includes(dowOf(s))) cls.push("is-fire");
        html += `<button type="button" role="gridcell" class="${cls.join(" ")}" data-date="${s}" ${disabled ? "disabled" : ""} aria-label="${escapeHtml(fmtDate(s))}" aria-pressed="${s === this.state.date}">${d}</button>`;
      }
      $(".cal__grid").innerHTML = html;
    },

    renderSlots() {
      const st = this.state;
      const dateStr = st.date;
      $("[data-summary-date]").textContent = `${fmtDate(dateStr)} · ${st.guests} ${st.guests > 1 ? t("t.guestN") : t("t.guest1")}`;
      const slots = this.slotsFor(dateStr);
      const sunset = sunsetMinutes(dateStr);
      const sunsetSlot = slots.reduce((best, mn) => (Math.abs(mn - (sunset - 45)) < Math.abs(best - (sunset - 45)) ? mn : best), slots[0]);
      const fireNight = R.fireShow.days.includes(dowOf(dateStr));
      const fireSlots = fireNight ? [FIRE_START - 60, FIRE_START - 30] : [];

      if (this.preset === "sunset" && st.time == null && slots.includes(sunsetSlot)) st.time = sunsetSlot;
      if (this.preset === "fire" && st.time == null && fireNight && slots.includes(fireSlots[0])) st.time = fireSlots[0];
      if (st.time != null && !slots.includes(st.time)) st.time = null;

      if (!slots.length) { $(".slots").innerHTML = `<p class="muted">${escapeHtml(t("bk.noSlots"))}</p>`; return; }
      const groups = [
        { key: "slot.lunch", test: (mn) => mn < 15 * 60 },
        { key: "slot.afternoon", test: (mn) => mn >= 15 * 60 && mn < 19 * 60 },
        { key: "slot.dinner", test: (mn) => mn >= 19 * 60 },
      ];
      $(".slots").innerHTML = groups.map((g) => {
        const list = slots.filter(g.test);
        if (!list.length) return "";
        return `<div class="slots__group"><h4>${escapeHtml(t(g.key))}</h4><div class="slots__row">${list.map((mn) => {
          let badge = "";
          if (mn === sunsetSlot) badge = `<span class="slot__badge">${escapeHtml(t("slot.sunset"))}</span>`;
          else if (fireSlots.includes(mn)) badge = `<span class="slot__badge slot__badge--fire">${escapeHtml(t("slot.fire"))}</span>`;
          return `<button type="button" class="slot ${st.time === mn ? "is-selected" : ""}" data-time="${mn}" aria-pressed="${st.time === mn}">${fmtMins(mn)}${badge}</button>`;
        }).join("")}</div></div>`;
      }).join("");
    },

    collect() {
      const f = this.form;
      const fd = new FormData(f);
      return {
        ...this.state,
        zone: fd.get("zone") || "any",
        name: (fd.get("name") || "").trim(),
        phone: (fd.get("phone") || "").trim(),
        email: (fd.get("email") || "").trim(),
        occasion: fd.get("occasion") || "none",
        notes: (fd.get("notes") || "").trim(),
      };
    },

    validateDetails() {
      const d = this.collect();
      const checks = {
        name: d.name.length >= 2,
        phone: d.phone.replace(/\D/g, "").length >= 8,
        email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email),
      };
      let firstBad = null;
      for (const k in checks) {
        const input = this.form.elements[k];
        const field = input.closest(".field");
        field.classList.toggle("is-invalid", !checks[k]);
        input.setAttribute("aria-invalid", String(!checks[k]));
        if (!checks[k] && !firstBad) firstBad = input;
      }
      if (firstBad) firstBad.focus();
      return !firstBad;
    },

    ticketRows(d, ref) {
      const zoneKey = { sand: "z.sand", front: "z.front", any: "z.any" }[d.zone] || "z.any";
      const rows = [];
      if (ref) rows.push([t("t.ref"), ref, "ref"]);
      rows.push([t("t.date"), fmtDate(d.date)]);
      rows.push([t("t.time"), fmtMins(d.time)]);
      rows.push([t("t.guests"), `${d.guests} ${d.guests > 1 ? t("t.guestN") : t("t.guest1")}`]);
      rows.push([t("t.seating"), t(zoneKey)]);
      rows.push([t("t.name"), d.name]);
      if (d.occasion && d.occasion !== "none") rows.push([t("t.occasion"), t("o." + d.occasion)]);
      if (d.notes) rows.push([t("t.notes"), d.notes]);
      return `<dl>${rows.map(([k, v, cls]) => `<div class="ticket__row"><dt>${escapeHtml(k)}</dt><dd class="${cls || ""}">${escapeHtml(String(v))}</dd></div>`).join("")}</dl>`;
    },

    renderReview() { $("[data-review]").innerHTML = this.ticketRows(this.collect()); },

    waMessage(b) {
      const zoneKey = { sand: "z.sand", front: "z.front", any: "z.any" }[b.zone] || "z.any";
      const lines = [
        t("wa.booking"),
        "",
        `${t("t.ref")}: ${b.ref}`,
        `${t("t.date")}: ${fmtDate(b.date)}`,
        `${t("t.time")}: ${fmtMins(b.time)}`,
        `${t("t.guests")}: ${b.guests}`,
        `${t("t.seating")}: ${t(zoneKey)}`,
        `${t("t.name")}: ${b.name}`,
        `Tel: ${b.phone}`,
        `Email: ${b.email}`,
      ];
      if (b.occasion !== "none") lines.push(`${t("t.occasion")}: ${t("o." + b.occasion)}`);
      if (b.notes) lines.push(`${t("t.notes")}: ${b.notes}`);
      return lines.join("\n");
    },

    renderDone(b) {
      $("[data-done-title]").textContent = b.sent ? t("done.titleSent") : t("done.title");
      $("[data-done-text]").textContent = b.sent ? t("done.textSent") : t("done.text");
      $("[data-done-ticket]").innerHTML = this.ticketRows(b, b.ref);
      $("[data-done-whatsapp]").href = waLink(this.waMessage(b));
    },

    async submit() {
      const d = this.collect();
      const ref = "SB-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      const b = { ...d, ref, lang, createdAt: new Date().toISOString(), sent: false };
      const next = $("[data-next]");
      if (B.endpoint) {
        next.disabled = true;
        next.textContent = t("bk.sending");
        try {
          const res = await fetch(B.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ ...b, time: fmtMins(b.time), restaurant: R.name }),
          });
          b.sent = res.ok;
        } catch { b.sent = false; }
      }
      const list = store.get("smile.bookings", []);
      list.push(b);
      store.set("smile.bookings", list);
      this.last = b;
      renderMyBookings();
      this.go(5);
    },

    downloadIcs(b) {
      const { y, m, d } = parseYmd(b.date);
      const start = new Date(Date.UTC(y, m - 1, d, 0, b.time) - TZ_OFFSET * 3600e3);
      const end = new Date(start.getTime() + 2 * 3600e3);
      const f = (dt) => dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const esc = (s) => s.replace(/[\\,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
      const ics = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Smile Bar//Reservations//EN", "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        `UID:${b.ref}@smilebarphuket`,
        `DTSTAMP:${f(new Date())}`,
        `DTSTART:${f(start)}`,
        `DTEND:${f(end)}`,
        `SUMMARY:${esc(`${R.name} — ${b.guests} ${b.guests > 1 ? t("t.guestN") : t("t.guest1")}`)}`,
        `LOCATION:${esc(R.address.join(", "))}`,
        `DESCRIPTION:${esc(`${t("t.ref")}: ${b.ref}\nTel: ${R.phoneDisplay}`)}`,
        "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Smile Bar", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR",
      ].join("\r\n");
      const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `smile-bar-${b.date}.ics` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    init() {
      const dlg = this.dialog;
      dlg.addEventListener("close", () => {
        document.body.classList.remove("is-locked");
        if (this.opener && this.opener.focus) this.opener.focus({ preventScroll: true });
        if (this.step === 5) { this.form.reset(); this.state = { guests: 2, date: null, time: null, zone: "sand" }; this.last = null; }
      });
      dlg.addEventListener("cancel", (e) => { e.preventDefault(); this.close(); });
      dlg.addEventListener("click", (e) => { if (e.target === dlg) this.close(); });
      $("[data-close]", dlg).addEventListener("click", () => this.close());

      dlg.addEventListener("click", (e) => {
        const g = e.target.closest("[data-guests]");
        if (g) { this.state.guests = Math.min(B.maxGuests, Math.max(1, this.state.guests + Number(g.dataset.guests))); this.refresh(); return; }
        const c = e.target.closest("[data-cal]");
        if (c) {
          let { y, m } = this.calMonth; m += Number(c.dataset.cal);
          if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
          this.calMonth = { y, m }; this.renderCalendar(); return;
        }
        const day = e.target.closest("[data-date]");
        if (day && !day.disabled) {
          this.state.date = day.dataset.date; this.state.time = null; this.renderCalendar();
          const btn = $(`[data-date="${this.state.date}"]`); btn && btn.focus();
          return;
        }
        const slot = e.target.closest("[data-time]");
        if (slot) { this.state.time = Number(slot.dataset.time); this.renderSlots(); const s = $(`[data-time="${this.state.time}"]`); s && s.focus(); return; }
      });

      $("[data-prev]").addEventListener("click", () => this.go(Math.max(1, this.step - 1)));
      $("[data-next]").addEventListener("click", () => {
        if (this.step === 1) {
          if (!this.state.date) return toast(t("bk.pickDate"));
          return this.go(2);
        }
        if (this.step === 2) {
          if (this.state.time == null) return toast(t("bk.pickTime"));
          this.go(3);
          setTimeout(() => this.form.elements.name.focus(), 50);
          return;
        }
        if (this.step === 3) { if (this.validateDetails()) this.go(4); return; }
        if (this.step === 4) return this.submit();
        if (this.step === 5) return this.close();
      });
      this.form.addEventListener("submit", (e) => e.preventDefault());
      this.form.addEventListener("input", (e) => {
        const field = e.target.closest(".field.is-invalid");
        if (field) field.classList.remove("is-invalid");
      });
      $("[data-ics]").addEventListener("click", () => this.last && this.downloadIcs(this.last));

      document.addEventListener("click", (e) => {
        const b = e.target.closest("[data-book]");
        if (!b) return;
        e.preventDefault();
        closeDrawer();
        this.open(b.dataset.book || null, b);
      });
    },
  };

  /* ---------- My reservations ---------- */
  function renderMyBookings() {
    const wrap = $(".mybookings");
    const today = todayStr();
    const list = store.get("smile.bookings", []).filter((b) => b.date >= today).sort((a, b) => (a.date + pad(a.time)).localeCompare(b.date + pad(b.time)));
    wrap.hidden = !list.length;
    $(".mybookings__list").innerHTML = list.map((b) => `
      <li class="mybooking">
        <strong>${escapeHtml(fmtDate(b.date))} · ${fmtMins(b.time)}</strong>
        <span>${b.guests} ${b.guests > 1 ? t("t.guestN") : t("t.guest1")}</span>
        <span class="ref">${escapeHtml(b.ref)}</span>
        <button type="button" data-cancel="${escapeHtml(b.ref)}">${escapeHtml(t("res.cancel"))}</button>
      </li>`).join("");
  }
  $(".mybookings__list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cancel]");
    if (!b) return;
    const ref = b.dataset.cancel;
    const all = store.get("smile.bookings", []);
    const item = all.find((x) => x.ref === ref);
    store.set("smile.bookings", all.filter((x) => x.ref !== ref));
    renderMyBookings();
    toast(t("res.cancelled"));
    if (item) window.open(waLink(`${lang === "fr" ? "Bonjour, je souhaite annuler ma réservation" : "Hello, I'd like to cancel my reservation"} ${ref} (${fmtDate(item.date)}, ${fmtMins(item.time)}).`), "_blank", "noopener");
  });

  /* =========================================================
     Navigation, drawer, reveal
     ========================================================= */
  const nav = $(".nav");
  const burger = $(".burger");
  const drawer = $("#drawer");
  function openDrawer() {
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add("is-open"));
    burger.setAttribute("aria-expanded", "true");
    document.body.classList.add("is-locked");
  }
  function closeDrawer() {
    if (drawer.hidden) return;
    drawer.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    document.body.classList.remove("is-locked");
    setTimeout(() => { drawer.hidden = true; }, 400);
  }
  burger.addEventListener("click", () => (drawer.hidden ? openDrawer() : closeDrawer()));
  drawer.addEventListener("click", (e) => { if (e.target.closest("a")) closeDrawer(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  const sticky = $(".sticky-cta");
  const hero = $(".hero");
  function onScroll() {
    const y = window.scrollY;
    nav.classList.toggle("is-scrolled", y > 30);
    sticky.classList.toggle("is-shown", y > hero.offsetHeight * 0.6 && !isNearReserve());
  }
  const isNearReserve = () => {
    const r = $(".reserve__card").getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  // Current section in nav
  const links = $$(".nav__links a");
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.classList.toggle("is-current", a.getAttribute("href") === "#" + en.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  ["experience", "menu", "moments", "visit"].forEach((id) => sectionObserver.observe(document.getElementById(id)));

  // Reveal on scroll
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const siblings = $$(".reveal", en.target.parentElement);
      const idx = Math.max(0, siblings.indexOf(en.target));
      en.target.style.transitionDelay = `${Math.min(idx, 5) * 80}ms`;
      en.target.classList.add("is-in");
      revealObserver.unobserve(en.target);
    });
  }, { rootMargin: "0px 0px -8% 0px" });
  $$(".reveal").forEach((el) => revealObserver.observe(el));

  // Language toggle
  $$(".lang button").forEach((b) => b.addEventListener("click", () => {
    lang = b.dataset.lang;
    store.set("smile.lang", lang);
    applyLang();
  }));

  /* =========================================================
     Canvas: hero sunset sea
     ========================================================= */
  function heroScene() {
    const canvas = $(".hero__canvas");
    const ctx = canvas.getContext("2d");
    let w, h, dpr, horizon, stars = [], waves = [], raf, visible = true, pointerX = 0, scrollY = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      horizon = h * 0.64;
      stars = Array.from({ length: Math.round(w / 9) }, () => ({ x: Math.random() * w, y: Math.random() * horizon * 0.45, r: Math.random() * 1.1 + 0.2, p: Math.random() * Math.PI * 2 }));
      waves = Array.from({ length: 70 }, (_, i) => {
        const depth = i / 70;
        return { y: horizon + Math.pow(depth, 1.7) * (h - horizon), len: 20 + Math.random() * 120 * (0.3 + depth), x: Math.random() * w, s: 0.15 + Math.random() * 0.4, p: Math.random() * Math.PI * 2, depth };
      });
    }

    function draw(time) {
      const tt = time / 1000;
      ctx.clearRect(0, 0, w, h);
      const sunX = w * (w < 700 ? 0.7 : 0.8) + pointerX * 18;
      const sunY = horizon - h * 0.07 + scrollY * 0.12;

      // stars
      for (const s of stars) {
        const a = 0.25 + 0.35 * Math.sin(tt * 1.2 + s.p);
        ctx.fillStyle = `rgba(255,240,220,${a * (1 - s.y / (horizon * 0.45))})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }

      // sun glow
      const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.55);
      glow.addColorStop(0, "rgba(255,214,150,.75)");
      glow.addColorStop(0.08, "rgba(255,170,100,.45)");
      glow.addColorStop(0.35, "rgba(230,110,70,.14)");
      glow.addColorStop(1, "rgba(230,110,70,0)");
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, horizon);

      // sun disc (clipped at horizon)
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, horizon); ctx.clip();
      const r = Math.max(34, Math.min(w, h) * 0.065);
      const disc = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r);
      disc.addColorStop(0, "#fff1cf"); disc.addColorStop(0.7, "#ffc87d"); disc.addColorStop(1, "rgba(255,170,95,.0)");
      ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(sunX, sunY, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // sea
      const sea = ctx.createLinearGradient(0, horizon, 0, h);
      sea.addColorStop(0, "#2a2a37"); sea.addColorStop(0.35, "#141c27"); sea.addColorStop(1, "#0b0d0f");
      ctx.fillStyle = sea; ctx.fillRect(0, horizon, w, h - horizon);

      // horizon line
      ctx.fillStyle = "rgba(255,210,160,.35)"; ctx.fillRect(0, horizon, w, 1);

      // sun reflection and waves
      for (const wv of waves) {
        const dx = Math.sin(tt * wv.s + wv.p) * 30 * (0.4 + wv.depth);
        const nearSun = Math.max(0, 1 - Math.abs(wv.x + dx - sunX) / (w * (0.08 + wv.depth * 0.2)));
        const alpha = 0.05 + nearSun * 0.75 * (1 - wv.depth * 0.6);
        ctx.strokeStyle = nearSun > 0.05 ? `rgba(255,${190 + nearSun * 40},${130 + nearSun * 50},${alpha})` : `rgba(180,190,210,${0.05 + wv.depth * 0.04})`;
        ctx.lineWidth = 0.6 + wv.depth * 1.6;
        ctx.beginPath(); ctx.moveTo(wv.x + dx, wv.y); ctx.lineTo(wv.x + dx + wv.len, wv.y); ctx.stroke();
        wv.x += wv.s * 0.15; if (wv.x > w + 50) wv.x = -wv.len - 50;
      }
      // column of light
      const col = ctx.createLinearGradient(0, horizon, 0, h);
      col.addColorStop(0, "rgba(255,200,140,.28)"); col.addColorStop(1, "rgba(255,200,140,0)");
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(sunX - r * 0.8, horizon); ctx.lineTo(sunX + r * 0.8, horizon); ctx.lineTo(sunX + r * 3, h); ctx.lineTo(sunX - r * 3, h); ctx.closePath(); ctx.fill();

      if (!reduceMotion && visible) raf = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", () => { resize(); if (reduceMotion || !visible) draw(performance.now()); });
    window.addEventListener("pointermove", (e) => { pointerX = (e.clientX / window.innerWidth - 0.5) * 2; }, { passive: true });
    window.addEventListener("scroll", () => { scrollY = window.scrollY; }, { passive: true });
    new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(draw);
    }).observe(canvas);
    draw(performance.now());
  }

  /* ---------- Canvas: embers ---------- */
  function embers(canvas, density = 1) {
    const ctx = canvas.getContext("2d");
    let w, h, dpr, parts = [], raf, visible = false, last = 0;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / 9000 * density);
      parts = Array.from({ length: Math.min(n, 180) }, () => spawn(true));
    }
    function spawn(initial) {
      return { x: Math.random() * w, y: initial ? Math.random() * h : h + 10, vy: 0.3 + Math.random() * 1.1, vx: (Math.random() - 0.5) * 0.3, r: 0.6 + Math.random() * 2.2, life: 0, max: 200 + Math.random() * 300, p: Math.random() * 6 };
    }
    function draw(time) {
      const dt = Math.min(3, (time - last) / 16.7 || 1); last = time;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.life += dt; p.y -= p.vy * dt; p.x += (p.vx + Math.sin(time / 900 + p.p) * 0.3) * dt;
        const k = 1 - p.life / p.max;
        if (k <= 0 || p.y < -10) { parts[i] = spawn(false); continue; }
        const a = Math.min(1, p.life / 30) * k;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, `rgba(255,${180 + 50 * k},120,${0.9 * a})`);
        g.addColorStop(0.4, `rgba(240,110,50,${0.35 * a})`);
        g.addColorStop(1, "rgba(240,110,50,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      if (visible && !reduceMotion) raf = requestAnimationFrame(draw);
    }
    resize();
    window.addEventListener("resize", resize);
    new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) { last = performance.now(); raf = requestAnimationFrame(draw); }
    }).observe(canvas);
    if (reduceMotion) draw(performance.now());
  }

  /* =========================================================
     Boot
     ========================================================= */
  $$("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });
  initMenu();
  booking.init();
  applyLang();
  onScroll();
  setInterval(updateLive, 1000);
  heroScene();
  $$("canvas.embers").forEach((c) => embers(c, c.classList.contains("embers--small") ? 1.6 : 1));

  const ready = () => document.body.classList.add("is-ready");
  if (document.readyState === "complete") setTimeout(ready, 900);
  else window.addEventListener("load", () => setTimeout(ready, 700));
  setTimeout(ready, 2500); // never block on slow fonts or map
})();

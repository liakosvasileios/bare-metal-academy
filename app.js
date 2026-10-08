/* Bare Metal Academy — single-file SPA, no dependencies. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const view = $("#view");
  const MODULES = window.MODULES, TRACKS = window.TRACKS, QBANK = window.QBANK, GLOSSARY = window.GLOSSARY || [];
  const modById = Object.fromEntries(MODULES.map((m) => [m.id, m]));
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  /* ---------------- state ---------------- */
  const KEY = "bma:v1";
  const blank = () => ({ read: {}, q: {}, best: {}, exams: [], flash: {}, theme: "" });
  let S;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { S = blank(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
  if (S.theme) document.documentElement.dataset.theme = S.theme;

  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
  }

  /* ---------------- questions ---------------- */
  const ALLQ = [];
  for (const m of MODULES) (QBANK[m.id] || []).forEach((q, i) => { q.id = `${m.id}:${i}`; q.mod = m.id; ALLQ.push(q); });
  const qById = Object.fromEntries(ALLQ.map((q) => [q.id, q]));
  const isMistake = (id) => S.q[id] && S.q[id].last === 0;

  /* ---------------- markdown ---------------- */
  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^\w*])\*([^*\s](?:[^*]*?[^*\s])?)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\[([^\]]+)\]\((#\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${esc(codes[n])}</code>`);
  }
  const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  function md(src) {
    const L = src.replace(/\r/g, "").split("\n");
    let i = 0; const out = [];
    const isList = (l) => /^\s*([-*]|\d+\.)\s+/.test(l);
    const isBlockStart = (l) => /^(```|#{1,5}\s|>|\||---\s*$)/.test(l) || isList(l);
    while (i < L.length) {
      const line = L[i];
      if (!line.trim()) { i++; continue; }
      if (line.startsWith("```")) {
        const lang = line.slice(3).trim(); const buf = []; i++;
        while (i < L.length && !L[i].startsWith("```")) buf.push(L[i++]);
        i++;
        out.push(`<pre${lang ? ` data-lang="${esc(lang)}"` : ""}><code>${esc(buf.join("\n"))}</code></pre>`);
        continue;
      }
      let m = line.match(/^(#{1,5})\s+(.*)$/);
      if (m) {
        const lvl = Math.min(m[1].length + 0, 5), txt = inline(m[2]);
        out.push(`<h${lvl} id="${slug(m[2])}">${txt}</h${lvl}>`); i++; continue;
      }
      if (/^---\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
      if (line.startsWith(">")) {
        const buf = [];
        while (i < L.length && L[i].startsWith(">")) buf.push(L[i++].replace(/^>\s?/, ""));
        let cls = "", label = "";
        const cm = buf[0].match(/^\[!(note|tip|warn|lab)\]\s*(.*)$/i);
        if (cm) { const k = cm[1].toLowerCase(); cls = ` class="callout-${k}"`; label = `<div class="callout-label">${{ note: "Note", tip: "Pro tip", warn: "Warning", lab: "Hands-on" }[k]}</div>`; buf[0] = cm[2]; }
        out.push(`<blockquote${cls}>${label}${md(buf.join("\n"))}</blockquote>`); continue;
      }
      if (line.startsWith("|")) {
        const rows = [];
        while (i < L.length && L[i].startsWith("|")) rows.push(L[i++]);
        const cells = (r) => r.replace(/\\\|/g, "\u0001").replace(/^\||\|\s*$/g, "").split("|").map((c) => inline(c.trim().replace(/\u0001/g, "|")));
        const head = cells(rows[0]); const body = rows.slice(/^\|[\s:|-]+\|?\s*$/.test(rows[1] || "") ? 2 : 1);
        out.push(`<div class="tbl"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }
      if (isList(line)) {
        const stack = []; let h = "";
        while (i < L.length) {
          const lm = L[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
          if (!lm) {
            if (L[i].trim() && /^\s+/.test(L[i]) && stack.length) { h += " " + inline(L[i].trim()); i++; continue; }
            break;
          }
          const ind = lm[1].length, type = /\d/.test(lm[2]) ? "ol" : "ul";
          if (!stack.length || ind > stack[stack.length - 1].ind) { h += `<${type}>`; stack.push({ ind, type }); }
          else {
            while (stack.length > 1 && ind < stack[stack.length - 1].ind) h += `</li></${stack.pop().type}>`;
            h += "</li>";
          }
          h += `<li>${inline(lm[3])}`; i++;
        }
        while (stack.length) h += `</li></${stack.pop().type}>`;
        out.push(h); continue;
      }
      const buf = [];
      while (i < L.length && L[i].trim() && !isBlockStart(L[i])) buf.push(L[i++].trim());
      if (!buf.length) { buf.push(L[i++]); }
      out.push(`<p>${inline(buf.join(" "))}</p>`);
    }
    return out.join("\n");
  }

  /* ---------------- content loading ---------------- */
  const cache = {};
  async function loadModule(id) {
    if (cache[id]) return cache[id];
    const res = await fetch(`content/${id}.md`);
    if (!res.ok) throw new Error(`Could not load ${id}`);
    const txt = await res.text();
    // One lesson per top-level "# " heading; ignore "# " lines inside code fences.
    const lessons = []; let fence = false, cur = null;
    for (const line of txt.replace(/\r/g, "").split("\n")) {
      if (line.startsWith("```")) fence = !fence;
      const m = !fence && line.match(/^# (.+)$/);
      if (m) { cur = { title: m[1].trim(), body: "" }; lessons.push(cur); }
      else if (cur) cur.body += line + "\n";
    }
    return (cache[id] = lessons);
  }
  const lessonCount = {};
  async function preloadCounts() {
    await Promise.all(MODULES.map(async (m) => { try { lessonCount[m.id] = (await loadModule(m.id)).length; } catch { lessonCount[m.id] = 0; } }));
  }

  function modProgress(id) {
    const n = lessonCount[id] || 0;
    const read = Object.keys(S.read).filter((k) => k.startsWith(id + "/")).length;
    const qs = QBANK[id] || [];
    const answered = qs.filter((q) => S.q[q.id] && S.q[q.id].c > 0).length;
    return { n, read, nq: qs.length, mastered: answered, readPct: pct(read, n), qPct: pct(answered, qs.length) };
  }

  /* ---------------- router ---------------- */
  const routes = [];
  const route = (re, fn) => routes.push([re, fn]);
  async function render() {
    const h = location.hash.slice(1) || "/";
    const [path, qs] = h.split("?");
    const params = new URLSearchParams(qs || "");
    stopTimers();
    for (const [re, fn] of routes) {
      const m = path.match(re);
      if (m) {
        const tab = path.split("/")[1] || "home";
        const map = { "": "home", m: "learn", l: "learn", learn: "learn", glossary: "learn", search: "learn", quiz: "practice", practice: "practice", exam: "practice", flash: "practice", review: "practice", lab: "lab", progress: "progress" };
        $$(".tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.tab === (map[tab] || "home")));
        try { await fn(m, params); } catch (e) { view.innerHTML = `<div class="empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><a class="btn" href="#/">Home</a></div>`; }
        if (!path.startsWith("/l/")) window.scrollTo(0, 0);
        return;
      }
    }
    location.hash = "#/";
  }
  window.addEventListener("hashchange", render);
  let timers = [];
  const stopTimers = () => { timers.forEach(clearInterval); timers = []; window.onscroll = null; $(".read-progress")?.remove(); };

  /* ---------------- views ---------------- */
  function modCard(m) {
    const p = modProgress(m.id);
    return `<a class="card mod-card t-${m.track}" href="#/m/${m.id}">
      <div class="mod-head"><div class="mod-icon">${esc(m.icon)}</div><div><h3>${esc(m.title)}</h3><div class="meta"><span>${p.n} lessons</span><span>${p.nq} questions</span></div></div></div>
      <p>${esc(m.summary)}</p>
      <div class="bar" title="Lessons read"><i style="width:${p.readPct}%"></i></div>
      <div class="meta"><span>read ${p.read}/${p.n}</span><span>mastered ${p.mastered}/${p.nq}</span>${S.best[m.id] != null ? `<span>best ${S.best[m.id]}%</span>` : ""}</div>
    </a>`;
  }

  route(/^\/$/, () => {
    const totalL = MODULES.reduce((a, m) => a + (lessonCount[m.id] || 0), 0);
    const read = Object.keys(S.read).length;
    const mastered = ALLQ.filter((q) => S.q[q.id] && S.q[q.id].c > 0).length;
    const mistakes = ALLQ.filter((q) => isMistake(q.id)).length;
    const last = S.lastLesson;
    const next = nextUnread();
    view.innerHTML = `
      <section class="hero">
        <div class="kicker">// from silicon to evidence</div>
        <h1>Learn the machine all the way down.</h1>
        <p>Hardware reverse engineering, IoT, routers, smart home and smartphones; data recovery and digital forensics; x86-64 and ARM64 assembly; operating systems and low-level architecture. Every module has lessons and an interactive quiz, and it all works offline.</p>
        <div class="row" style="margin-top:16px">
          ${last ? `<a class="btn primary" href="#/l/${last}">Continue reading</a>` : next ? `<a class="btn primary" href="#/l/${next}">Start learning</a>` : ""}
          <a class="btn" href="#/practice">Practice & exams</a>
          <a class="btn ghost" href="#/lab">Open the lab</a>
        </div>
        <div class="stats">
          <div class="stat"><b>${MODULES.length}</b><span>modules</span></div>
          <div class="stat"><b>${read}/${totalL}</b><span>lessons read</span></div>
          <div class="stat"><b>${mastered}/${ALLQ.length}</b><span>questions mastered</span></div>
          <div class="stat"><b>${mistakes}</b><span>to review</span></div>
        </div>
      </section>
      ${TRACKS.map((t) => `
        <div class="section-title"><h2>${esc(t.title)}</h2><p>${esc(t.blurb)}</p></div>
        <div class="grid">${MODULES.filter((m) => m.track === t.id).map(modCard).join("")}</div>`).join("")}
      <div class="section-title"><h2>Reference</h2></div>
      <div class="grid tight">
        <a class="card" href="#/glossary"><h3>Glossary</h3><p>${GLOSSARY.length} terms, from ABI to ZIF.</p></a>
        <a class="card" href="#/flash"><h3>Flashcards</h3><p>Drill the glossary with spaced repetition.</p></a>
        <a class="card" href="#/lab"><h3>Lab tools</h3><p>Base converter, registers, file analyzer, timestamps and more.</p></a>
      </div>`;
  });

  function nextUnread() {
    for (const m of MODULES) for (let k = 0; k < (lessonCount[m.id] || 0); k++) if (!S.read[`${m.id}/${k}`]) return `${m.id}/${k}`;
    return null;
  }

  route(/^\/learn$/, () => {
    view.innerHTML = `<section class="hero"><div class="kicker">// curriculum</div><h1>Library</h1><p>${MODULES.length} modules in four tracks. Read in order or jump around; each module ends with a quiz.</p>
      <div class="row" style="margin-top:14px"><a class="btn" href="#/glossary">Glossary</a><a class="btn ghost" href="#/search">Search</a></div></section>
      ${TRACKS.map((t) => `<div class="section-title"><h2>${esc(t.title)}</h2><p>${esc(t.blurb)}</p></div><div class="grid">${MODULES.filter((m) => m.track === t.id).map(modCard).join("")}</div>`).join("")}`;
  });

  route(/^\/m\/([\w-]+)$/, async (m) => {
    const mod = modById[m[1]]; if (!mod) throw new Error("Unknown module");
    const lessons = await loadModule(mod.id);
    const p = modProgress(mod.id);
    view.innerHTML = `<div class="crumbs"><a href="#/learn">Library</a> / ${esc(TRACKS.find((t) => t.id === mod.track).title)}</div>
      <section class="hero t-${mod.track}">
        <div class="mod-head"><div class="mod-icon">${esc(mod.icon)}</div><div><h1 style="margin:0">${esc(mod.title)}</h1></div></div>
        <p style="margin-top:10px">${esc(mod.summary)}</p>
        <div class="stats"><div class="stat"><b>${p.read}/${p.n}</b><span>lessons read</span></div><div class="stat"><b>${p.mastered}/${p.nq}</b><span>questions mastered</span></div><div class="stat"><b>${S.best[mod.id] != null ? S.best[mod.id] + "%" : "—"}</b><span>best quiz score</span></div></div>
        <div class="row" style="margin-top:14px">
          <a class="btn primary" href="#/l/${mod.id}/${lessons.findIndex((_, k) => !S.read[`${mod.id}/${k}`]) >= 0 ? lessons.findIndex((_, k) => !S.read[`${mod.id}/${k}`]) : 0}">${p.read ? "Continue" : "Start"} reading</a>
          <a class="btn" href="#/quiz/${mod.id}">Take the quiz (${p.nq})</a>
          <a class="btn ghost" href="#/quiz/${mod.id}?n=10">Quick 10</a>
        </div>
      </section>
      <div class="section-title"><h2>Lessons</h2></div>
      <div class="list">${lessons.map((l, k) => `<a class="lesson-link" href="#/l/${mod.id}/${k}"><span class="num">${String(k + 1).padStart(2, "0")}</span><span>${esc(l.title)}</span>${S.read[`${mod.id}/${k}`] ? '<span class="done">✓</span>' : ""}</a>`).join("")}</div>`;
  });

  route(/^\/l\/([\w-]+)\/(\d+)$/, async (m) => {
    const mod = modById[m[1]]; if (!mod) throw new Error("Unknown module");
    const lessons = await loadModule(mod.id); const k = +m[2]; const l = lessons[k];
    if (!l) throw new Error("Lesson not found");
    const html = md(l.body);
    const heads = [...html.matchAll(/<h([23]) id="([^"]+)">(.*?)<\/h[23]>/g)];
    const key = `${mod.id}/${k}`;
    S.lastLesson = key; save();
    const prev = k > 0 ? `${mod.id}/${k - 1}` : null;
    const mi = MODULES.indexOf(mod);
    const next = k < lessons.length - 1 ? `${mod.id}/${k + 1}` : null;
    const nextMod = MODULES[mi + 1];
    view.innerHTML = `<article class="reader-wrap">
      <div class="crumbs"><a href="#/learn">Library</a> / <a href="#/m/${mod.id}">${esc(mod.title)}</a> / ${k + 1} of ${lessons.length}</div>
      <div class="prose"><h1>${inline(l.title)}</h1>
      ${heads.length > 2 ? `<details class="toc"><summary>On this page</summary>${heads.map((h) => `<a class="h${h[1]}" href="#" data-target="${h[2]}">${h[3]}</a>`).join("")}</details>` : ""}
      ${html}</div>
      <div class="row" style="margin-top:24px">
        <button class="btn ${S.read[key] ? "" : "primary"}" id="markRead">${S.read[key] ? "✓ Read — mark unread" : "Mark as read"}</button>
      </div>
      <div class="pager">
        ${prev ? `<a class="btn ghost" href="#/l/${prev}">← ${esc(lessons[k - 1].title)}</a>` : `<a class="btn ghost" href="#/m/${mod.id}">← Module overview</a>`}
        ${next ? `<a class="btn" href="#/l/${next}" data-advance>${esc(lessons[k + 1].title)} →</a>` : `<a class="btn primary" href="#/quiz/${mod.id}" data-advance>Module quiz →</a>`}
      </div>
      ${!next && nextMod ? `<p class="muted small" style="text-align:right">Next module: <a href="#/m/${nextMod.id}">${esc(nextMod.title)}</a></p>` : ""}
    </article>`;
    window.scrollTo(0, 0);
    $$(".toc a").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); document.getElementById(a.dataset.target)?.scrollIntoView({ behavior: "smooth" }); }));
    $("#markRead").onclick = () => { if (S.read[key]) delete S.read[key]; else S.read[key] = Date.now(); save(); render(); };
    $$("[data-advance]").forEach((a) => a.addEventListener("click", () => { if (!S.read[key]) { S.read[key] = Date.now(); save(); } }));
    const bar = document.createElement("div"); bar.className = "read-progress"; document.body.appendChild(bar);
    window.onscroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? scrollY / max : 1; bar.style.width = p * 100 + "%";
      if (p > 0.97 && !S.read[key]) { S.read[key] = Date.now(); save(); const b = $("#markRead"); if (b) { b.textContent = "✓ Read — mark unread"; b.classList.remove("primary"); } }
    };
  });

  /* ---------------- quiz engine ---------------- */
  const TYPE_LABEL = { mcq: "Single choice", multi: "Select all that apply", tf: "True or false", fill: "Type the answer", order: "Put in order" };
  const norm = (s) => String(s).toLowerCase().trim().replace(/\s+/g, " ").replace(/[.;]$/, "").replace(/^0x0*(?=[0-9a-f])/, "0x");

  function prepare(q) {
    const p = { q };
    if (q.t === "mcq" || q.t === "multi") p.order = shuffle(q.o.map((_, i) => i));
    if (q.t === "order") { let o = shuffle(q.o.map((_, i) => i)); if (o.every((v, i) => v === i) && o.length > 1) o = o.reverse(); p.cur = o; }
    p.sel = q.t === "multi" ? new Set() : null;
    return p;
  }
  function grade(p) {
    const q = p.q;
    if (q.t === "mcq") return p.sel === q.a;
    if (q.t === "tf") return p.sel === q.a;
    if (q.t === "multi") { const a = new Set(q.a); return a.size === p.sel.size && [...a].every((x) => p.sel.has(x)); }
    if (q.t === "fill") { const v = norm(p.sel || ""); return (Array.isArray(q.a) ? q.a : [q.a]).some((x) => norm(x) === v); }
    if (q.t === "order") return p.cur.every((v, i) => v === i);
    return false;
  }
  const answered = (p) => p.q.t === "multi" ? p.sel.size > 0 : p.q.t === "order" ? true : p.q.t === "fill" ? !!(p.sel && p.sel.trim()) : p.sel !== null;
  function correctText(q) {
    if (q.t === "mcq") return q.o[q.a];
    if (q.t === "tf") return q.a ? "True" : "False";
    if (q.t === "multi") return q.a.map((i) => q.o[i]).join(" · ");
    if (q.t === "fill") return (Array.isArray(q.a) ? q.a : [q.a])[0];
    if (q.t === "order") return q.o.map((x, i) => `${i + 1}. ${x}`).join("  ");
  }
  function yourText(p) {
    const q = p.q;
    if (q.t === "mcq") return p.sel == null ? "—" : q.o[p.sel];
    if (q.t === "tf") return p.sel == null ? "—" : p.sel ? "True" : "False";
    if (q.t === "multi") return [...p.sel].map((i) => q.o[i]).join(" · ") || "—";
    if (q.t === "fill") return p.sel || "—";
    if (q.t === "order") return p.cur.map((x, i) => `${i + 1}. ${q.o[x]}`).join("  ");
  }
  function record(q, ok) {
    const r = S.q[q.id] || { c: 0, w: 0 };
    ok ? r.c++ : r.w++; r.last = ok ? 1 : 0; r.ts = Date.now(); S.q[q.id] = r;
  }

  function renderQuestionBody(p, locked) {
    const q = p.q;
    let body = "";
    if (q.t === "mcq" || q.t === "multi") {
      body = `<div class="opts">${p.order.map((oi) => {
        let cls = "opt" + (q.t === "multi" ? " multi" : "");
        const sel = q.t === "multi" ? p.sel.has(oi) : p.sel === oi;
        if (sel) cls += " sel";
        if (locked) { const right = q.t === "multi" ? q.a.includes(oi) : q.a === oi; if (right) cls += " right"; else if (sel) cls += " wrong"; }
        return `<button class="${cls}" data-o="${oi}" ${locked ? "disabled" : ""}><span class="mark">${sel ? "✓" : ""}</span><span>${inline(q.o[oi])}</span></button>`;
      }).join("")}</div>`;
    } else if (q.t === "tf") {
      body = `<div class="opts">${[true, false].map((v) => {
        let cls = "opt"; if (p.sel === v) cls += " sel";
        if (locked) { if (q.a === v) cls += " right"; else if (p.sel === v) cls += " wrong"; }
        return `<button class="${cls}" data-tf="${v}" ${locked ? "disabled" : ""}><span class="mark">${p.sel === v ? "✓" : ""}</span><span>${v ? "True" : "False"}</span></button>`;
      }).join("")}</div>`;
    } else if (q.t === "fill") {
      body = `<input class="fill" id="fillIn" placeholder="Your answer…" value="${esc(p.sel || "")}" ${locked ? "disabled" : ""} autocomplete="off" autocapitalize="off" spellcheck="false">`;
    } else if (q.t === "order") {
      body = `<div class="opts">${p.cur.map((oi, pos) => `<div class="order-item ${locked ? (oi === pos ? "right" : "wrong") : ""}"><span class="n">${pos + 1}</span><span class="txt">${inline(q.o[oi])}</span>
        ${locked ? "" : `<button class="icon-btn" data-up="${pos}" ${pos === 0 ? "disabled" : ""} aria-label="Move up">▲</button><button class="icon-btn" data-down="${pos}" ${pos === p.cur.length - 1 ? "disabled" : ""} aria-label="Move down">▼</button>`}</div>`).join("")}</div>`;
    }
    return `<div class="qtype">${TYPE_LABEL[q.t]} · ${esc(modById[q.mod].title)}</div>
      <div class="qtext">${inline(q.q)}</div>${q.code ? `<pre><code>${esc(q.code)}</code></pre>` : ""}${body}`;
  }
  function wireQuestion(root, p, locked, onChange) {
    if (locked) return;
    $$("[data-o]", root).forEach((b) => b.onclick = () => {
      const oi = +b.dataset.o;
      if (p.q.t === "multi") p.sel.has(oi) ? p.sel.delete(oi) : p.sel.add(oi); else p.sel = oi;
      onChange();
    });
    $$("[data-tf]", root).forEach((b) => b.onclick = () => { p.sel = b.dataset.tf === "true"; onChange(); });
    $$("[data-up]", root).forEach((b) => b.onclick = () => { const i = +b.dataset.up; [p.cur[i - 1], p.cur[i]] = [p.cur[i], p.cur[i - 1]]; onChange(); });
    $$("[data-down]", root).forEach((b) => b.onclick = () => { const i = +b.dataset.down; [p.cur[i + 1], p.cur[i]] = [p.cur[i], p.cur[i + 1]]; onChange(); });
    const f = $("#fillIn", root);
    if (f) { f.oninput = () => { p.sel = f.value; root.dispatchEvent(new Event("answerable")); }; }
  }

  // practice mode: immediate feedback
  function runPractice({ title, qs, back, bestKey }) {
    const items = qs.map(prepare);
    let i = 0, locked = false, correct = 0;
    const draw = () => {
      const p = items[i];
      view.innerHTML = `<div class="quiz"><div class="crumbs"><a href="${back}">← Back</a></div>
        <div class="qhead"><span>${esc(title)}</span><span>${i + 1} / ${items.length} · ✓ ${correct}</span></div>
        <div class="bar" style="margin-bottom:12px"><i style="width:${pct(i, items.length)}%"></i></div>
        <div class="qcard" id="qc">${renderQuestionBody(p, locked)}
        ${locked ? `<div class="feedback ${p.ok ? "ok" : "no"}"><b>${p.ok ? "Correct" : "Not quite"}</b>${p.ok ? "" : `<div class="small muted">Answer: ${inline(correctText(p.q))}</div>`}<div style="margin-top:6px">${inline(p.q.e || "")}</div></div>` : ""}
        <div class="qactions">${locked ? `<button class="btn primary" id="next">${i === items.length - 1 ? "See results" : "Next →"}</button>` : `<button class="btn ghost" id="skip">Skip</button><button class="btn primary" id="check" ${answered(p) ? "" : "disabled"}>Check</button>`}</div></div></div>`;
      const qc = $("#qc");
      wireQuestion(qc, p, locked, draw);
      qc.addEventListener("answerable", () => { $("#check").disabled = !answered(p); });
      const f = $("#fillIn"); if (f && !locked) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); f.onkeydown = (e) => { if (e.key === "Enter" && answered(p)) check(); }; }
      $("#check") && ($("#check").onclick = check);
      $("#skip") && ($("#skip").onclick = () => { p.ok = false; p.skipped = true; advance(); });
      $("#next") && ($("#next").onclick = advance);
    };
    const check = () => { const p = items[i]; p.ok = grade(p); if (p.ok) correct++; record(p.q, p.ok); save(); locked = true; draw(); $("#next")?.focus(); };
    const advance = () => { locked = false; if (++i >= items.length) finish(); else draw(); };
    const finish = () => {
      const score = pct(correct, items.length);
      if (bestKey) { S.best[bestKey] = Math.max(S.best[bestKey] || 0, score); }
      save();
      results({ title, items, correct, back, retry: () => runPractice({ title, qs: shuffle(qs), back, bestKey }), wrongRetry: items.some((p) => !p.ok) ? () => runPractice({ title: title + " — mistakes", qs: items.filter((p) => !p.ok).map((p) => p.q), back }) : null });
    };
    draw();
  }

  function results({ title, items, correct, back, retry, wrongRetry, extra = "" }) {
    const score = pct(correct, items.length);
    const verdict = score >= 90 ? "Outstanding" : score >= 75 ? "Solid" : score >= 50 ? "Getting there" : "Keep studying";
    view.innerHTML = `<div class="quiz"><div class="crumbs"><a href="${back}">← Back</a></div>
      <div class="qcard" style="text-align:center"><div class="kicker">${esc(title)}</div>
      <div class="score-ring" style="--p:${score}"><div>${score}%</div></div>
      <h2 style="margin:6px 0">${verdict}</h2><p class="muted">${correct} of ${items.length} correct ${extra}</p>
      <div class="row" style="justify-content:center;margin-top:10px"><button class="btn primary" id="retry">Try again</button>${wrongRetry ? '<button class="btn" id="wr">Retry the ones I missed</button>' : ""}<a class="btn ghost" href="${back}">Done</a></div></div>
      <div class="section-title"><h2>Review</h2></div>
      <div class="list">${items.map((p, k) => `<div class="review-item ${p.ok ? "ok" : "no"}"><div class="small muted">${k + 1}. ${esc(modById[p.q.mod].title)}</div><div><b>${inline(p.q.q)}</b></div>${p.q.code ? `<pre class="lab-out" style="margin:6px 0">${esc(p.q.code)}</pre>` : ""}
        ${p.ok ? "" : `<div class="ans">Your answer: ${inline(p.skipped ? "(skipped)" : yourText(p))}</div>`}<div class="ans">Correct: ${inline(correctText(p.q))}</div><div class="small" style="margin-top:6px">${inline(p.q.e || "")}</div></div>`).join("")}</div></div>`;
    $("#retry").onclick = retry;
    if (wrongRetry) $("#wr").onclick = wrongRetry;
  }

  route(/^\/quiz\/([\w-]+)$/, (m, params) => {
    const mod = modById[m[1]]; if (!mod) throw new Error("Unknown module");
    let qs = shuffle(QBANK[mod.id] || []);
    const n = +params.get("n"); if (n) qs = qs.slice(0, n);
    if (!qs.length) { view.innerHTML = `<div class="empty">No questions yet.</div>`; return; }
    runPractice({ title: `${mod.title} quiz`, qs, back: `#/m/${mod.id}`, bestKey: n ? null : mod.id });
  });

  /* ---------------- practice hub ---------------- */
  route(/^\/practice$/, () => {
    const mistakes = ALLQ.filter((q) => isMistake(q.id));
    const unseen = ALLQ.filter((q) => !S.q[q.id]);
    view.innerHTML = `<section class="hero"><div class="kicker">// test yourself</div><h1>Practice & Exams</h1><p>${ALLQ.length} questions across ${MODULES.length} modules: single choice, select-all, true/false, typed answers and ordering.</p></section>
      <div class="section-title"><h2>Quick modes</h2></div>
      <div class="grid tight">
        <a class="card" href="#/review?mode=random"><h3>Random 20</h3><p>A mixed set from every module.</p></a>
        <a class="card" href="#/review?mode=unseen"><h3>New questions</h3><p>${unseen.length} you haven't tried yet.</p></a>
        <a class="card" href="#/review?mode=mistakes"><h3>Fix my mistakes</h3><p>${mistakes.length} questions you last got wrong.</p></a>
        <a class="card" href="#/flash"><h3>Flashcards</h3><p>${GLOSSARY.length} glossary terms.</p></a>
      </div>
      <div class="section-title"><h2>Exam simulator</h2><p>Timed, with no feedback until you submit.</p></div>
      <div class="qcard">
        <div class="field"><label>Modules</label><div class="chips" id="modChips">${MODULES.map((m) => `<button class="chip on" data-m="${m.id}">${esc(m.title)}</button>`).join("")}</div>
        <div class="row"><button class="btn sm ghost" id="allOn">All</button><button class="btn sm ghost" id="allOff">None</button>${TRACKS.map((t) => `<button class="btn sm ghost" data-track="${t.id}">${esc(t.title.split(" ")[0])}…</button>`).join("")}</div></div>
        <div class="row">
          <div class="field" style="flex:1;min-width:140px"><label>Questions</label><select id="exN"><option>10</option><option selected>25</option><option>50</option><option>100</option></select></div>
          <div class="field" style="flex:1;min-width:140px"><label>Time limit</label><select id="exT"><option value="0">No limit</option><option value="60" selected>1 min / question</option><option value="40">40 s / question</option><option value="90">90 s / question</option></select></div>
        </div>
        <button class="btn primary" id="startExam">Start exam</button>
      </div>
      <div class="section-title"><h2>Module quizzes</h2></div>
      <div class="list">${MODULES.map((m) => `<a class="lesson-link t-${m.track}" href="#/quiz/${m.id}"><span class="mod-icon" style="width:34px;height:34px;font-size:10px">${esc(m.icon)}</span><span>${esc(m.title)}</span><span class="spacer"></span><span class="pill ${S.best[m.id] >= 80 ? "ok" : ""}">${S.best[m.id] != null ? `best ${S.best[m.id]}%` : `${(QBANK[m.id] || []).length} q`}</span></a>`).join("")}</div>
      ${S.exams.length ? `<div class="section-title"><h2>Exam history</h2></div><div class="list">${S.exams.slice(-8).reverse().map((e) => `<div class="lesson-link"><span class="mono small">${new Date(e.d).toLocaleDateString()}</span><span>${e.n} questions</span><span class="spacer"></span><span class="pill ${e.s >= 75 ? "ok" : ""}">${e.s}%</span></div>`).join("")}</div>` : ""}`;
    const chips = $$("#modChips .chip");
    chips.forEach((c) => c.onclick = () => c.classList.toggle("on"));
    $("#allOn").onclick = () => chips.forEach((c) => c.classList.add("on"));
    $("#allOff").onclick = () => chips.forEach((c) => c.classList.remove("on"));
    $$("[data-track]").forEach((b) => b.onclick = () => chips.forEach((c) => c.classList.toggle("on", modById[c.dataset.m].track === b.dataset.track)));
    $("#startExam").onclick = () => {
      const mods = chips.filter((c) => c.classList.contains("on")).map((c) => c.dataset.m);
      if (!mods.length) return toast("Pick at least one module");
      const pool = ALLQ.filter((q) => mods.includes(q.mod));
      const n = Math.min(+$("#exN").value, pool.length);
      runExam(shuffle(pool).slice(0, n), +$("#exT").value * n);
    };
  });

  route(/^\/review$/, (m, params) => {
    const mode = params.get("mode");
    let qs, title;
    if (mode === "mistakes") { qs = shuffle(ALLQ.filter((q) => isMistake(q.id))); title = "Mistake review"; }
    else if (mode === "unseen") { qs = shuffle(ALLQ.filter((q) => !S.q[q.id])).slice(0, 20); title = "New questions"; }
    else { qs = shuffle(ALLQ).slice(0, 20); title = "Random 20"; }
    if (!qs.length) { view.innerHTML = `<div class="empty"><h2>Nothing here 🎉</h2><p>${mode === "mistakes" ? "No outstanding mistakes." : "You've seen every question."}</p><a class="btn" href="#/practice">Back</a></div>`; return; }
    runPractice({ title, qs, back: "#/practice" });
  });

  function runExam(qs, seconds) {
    const items = qs.map(prepare); let i = 0; const start = Date.now();
    let left = seconds;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    const draw = () => {
      const p = items[i];
      view.innerHTML = `<div class="quiz"><div class="qhead"><span>Exam · ${i + 1} / ${items.length}</span>${seconds ? `<span class="timer" id="tm">${fmt(left)}</span>` : ""}</div>
        <div class="bar" style="margin-bottom:12px"><i style="width:${pct(i, items.length)}%"></i></div>
        <div class="qcard" id="qc">${renderQuestionBody(p, false)}
        <div class="qactions"><button class="btn ghost" id="prev" ${i ? "" : "disabled"}>← Prev</button><span class="spacer"></span><button class="btn ghost danger" id="end">Submit now</button><button class="btn primary" id="nx">${i === items.length - 1 ? "Submit" : "Next →"}</button></div></div>
        <div class="chips" style="margin-top:14px">${items.map((it, k) => `<button class="chip ${it.touched ? "on" : ""}" data-jump="${k}" style="${k === i ? "outline:2px solid var(--accent2)" : ""}">${k + 1}</button>`).join("")}</div></div>`;
      const qc = $("#qc");
      wireQuestion(qc, p, false, () => { p.touched = true; draw(); });
      $("#prev").onclick = () => { i--; draw(); };
      $("#nx").onclick = () => { if (i === items.length - 1) finish(); else { i++; draw(); } };
      $("#end").onclick = () => { if (confirmInline()) finish(); };
      $$("[data-jump]").forEach((b) => b.onclick = () => { i = +b.dataset.jump; draw(); });
      const f = $("#fillIn"); if (f) { f.focus(); f.oninput = () => { p.sel = f.value; p.touched = true; }; }
    };
    let confirmArmed = false;
    const confirmInline = () => { if (confirmArmed) return true; confirmArmed = true; toast("Tap “Submit now” again to finish"); setTimeout(() => confirmArmed = false, 3000); return false; };
    const finish = () => {
      stopTimers();
      let correct = 0;
      items.forEach((p) => { p.ok = grade(p); if (p.ok) correct++; if (p.touched) record(p.q, p.ok); else p.skipped = true; });
      const s = pct(correct, items.length);
      S.exams.push({ d: Date.now(), n: items.length, s }); save();
      const used = Math.round((Date.now() - start) / 1000);
      results({ title: "Exam results", items, correct, back: "#/practice", extra: `· ${fmt(used)} elapsed`, retry: () => runExam(shuffle(qs), seconds), wrongRetry: null });
    };
    if (seconds) timers.push(setInterval(() => { left--; const t = $("#tm"); if (t) t.textContent = fmt(Math.max(0, left)); if (left <= 0) { toast("Time's up"); finish(); } }, 1000));
    draw();
  }

  /* ---------------- flashcards (Leitner boxes) ---------------- */
  route(/^\/flash$/, () => {
    const box = (t) => S.flash[t] || 0;
    const deck = () => shuffle(GLOSSARY).sort((a, b) => box(a[0]) - box(b[0])).slice(0, 25);
    let cards = deck(), i = 0;
    const draw = () => {
      if (i >= cards.length) { cards = deck(); i = 0; }
      const [term, def] = cards[i];
      const learned = GLOSSARY.filter((g) => box(g[0]) >= 3).length;
      view.innerHTML = `<div class="quiz"><div class="crumbs"><a href="#/practice">← Practice</a></div>
        <div class="qhead"><span>Flashcards · box ${box(term)}</span><span>${learned}/${GLOSSARY.length} learned</span></div>
        <div class="flash" id="fc"><div class="flash-inner"><div class="flash-face"><h2>${esc(term)}</h2><p class="muted small">tap to flip</p></div><div class="flash-face back"><div>${inline(def)}</div></div></div></div>
        <div class="row" style="justify-content:center;margin-top:16px"><button class="btn danger" id="again">Again</button><button class="btn" id="flip">Flip</button><button class="btn primary" id="know">I knew it</button></div></div>`;
      const fc = $("#fc");
      fc.onclick = $("#flip").onclick = () => fc.classList.toggle("flipped");
      $("#again").onclick = () => { S.flash[term] = 0; save(); i++; draw(); };
      $("#know").onclick = () => { S.flash[term] = Math.min(5, box(term) + 1); save(); i++; draw(); };
    };
    draw();
  });

  /* ---------------- glossary & search ---------------- */
  route(/^\/glossary$/, () => {
    const sorted = GLOSSARY.slice().sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: "base" }));
    const letters = [...new Set(sorted.map((g) => g[0][0].toUpperCase()))];
    view.innerHTML = `<div class="reader-wrap"><div class="crumbs"><a href="#/learn">Library</a></div><h1>Glossary</h1>
      <input class="fill" id="gf" placeholder="Filter ${sorted.length} terms…" autocomplete="off">
      <div class="letters">${letters.map((l) => `<a href="#" data-l="${esc(l)}">${esc(l)}</a>`).join("")}</div>
      <dl class="gloss" id="gl"></dl></div>`;
    const drawList = (f) => {
      const fl = f.toLowerCase();
      $("#gl").innerHTML = sorted.filter((g) => !f || g[0].toLowerCase().includes(fl) || g[1].toLowerCase().includes(fl))
        .map((g) => `<dt id="g-${slug(g[0])}" data-first="${esc(g[0][0].toUpperCase())}">${esc(g[0])}</dt><dd>${inline(g[1])}</dd>`).join("") || `<p class="muted">No matches.</p>`;
    };
    drawList("");
    $("#gf").oninput = (e) => drawList(e.target.value);
    $$("[data-l]").forEach((a) => a.onclick = (e) => { e.preventDefault(); $(`#gl dt[data-first="${a.dataset.l}"]`)?.scrollIntoView({ behavior: "smooth" }); });
  });

  route(/^\/search$/, async (m, params) => {
    const q = (params.get("q") || "").trim();
    $("#searchInput").value = q;
    view.innerHTML = `<div class="reader-wrap"><h1>Search</h1><input class="fill" id="sq" value="${esc(q)}" placeholder="e.g. JTAG, \$MFT, ldp, TRIM, page table"><div id="sr" class="list" style="margin-top:14px"><p class="muted">Loading index…</p></div></div>`;
    $("#sq").onkeydown = (e) => { if (e.key === "Enter") location.hash = `#/search?q=${encodeURIComponent(e.target.value)}`; };
    if (!q) { $("#sr").innerHTML = `<p class="muted">Type a term and press Enter.</p>`; return; }
    await preloadCounts();
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = [];
    for (const mod of MODULES) {
      (cache[mod.id] || []).forEach((l, k) => {
        const text = (l.title + "\n" + l.body).toLowerCase();
        if (!terms.every((t) => text.includes(t))) return;
        let score = terms.reduce((a, t) => a + text.split(t).length - 1 + (l.title.toLowerCase().includes(t) ? 20 : 0), 0);
        const plain = l.body.replace(/[#*`|>]/g, " ").replace(/\s+/g, " ");
        const at = plain.toLowerCase().indexOf(terms[0]);
        const snip = plain.slice(Math.max(0, at - 70), at + 160);
        hits.push({ score, html: `<a class="card search-hit" href="#/l/${mod.id}/${k}"><div class="small muted">${esc(mod.title)}</div><h3>${esc(l.title)}</h3><p>…${highlight(esc(snip), terms)}…</p></a>` });
      });
    }
    GLOSSARY.forEach(([t, d]) => {
      const text = (t + " " + d).toLowerCase();
      if (terms.every((x) => text.includes(x))) hits.push({ score: t.toLowerCase().includes(terms[0]) ? 30 : 2, html: `<a class="card search-hit" href="#/glossary"><div class="small muted">Glossary</div><h3>${esc(t)}</h3><p>${highlight(esc(d), terms)}</p></a>` });
    });
    hits.sort((a, b) => b.score - a.score);
    $("#sr").innerHTML = hits.length ? `<p class="muted small">${hits.length} results</p>` + hits.slice(0, 60).map((h) => h.html).join("") : `<p class="muted">No results for “${esc(q)}”.</p>`;
  });
  function highlight(s, terms) {
    for (const t of terms) { const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"); s = s.replace(re, (x) => `<mark>${x}</mark>`); }
    return s;
  }
  $("#searchForm").onsubmit = (e) => { e.preventDefault(); location.hash = `#/search?q=${encodeURIComponent($("#searchInput").value)}`; $("#searchInput").blur(); };

  /* ---------------- progress ---------------- */
  route(/^\/progress$/, () => {
    const att = Object.values(S.q);
    const c = att.reduce((a, r) => a + r.c, 0), w = att.reduce((a, r) => a + r.w, 0);
    view.innerHTML = `<section class="hero"><div class="kicker">// telemetry</div><h1>Your progress</h1><p>Stored only on this device.</p>
      <div class="stats"><div class="stat"><b>${Object.keys(S.read).length}</b><span>lessons read</span></div><div class="stat"><b>${pct(c, c + w)}%</b><span>answer accuracy</span></div><div class="stat"><b>${c + w}</b><span>answers given</span></div><div class="stat"><b>${S.exams.length}</b><span>exams taken</span></div></div></section>
      <div class="section-title"><h2>By module</h2></div>
      <div class="list">${MODULES.map((m) => { const p = modProgress(m.id); return `<a class="card t-${m.track}" href="#/m/${m.id}" style="padding:12px 14px"><div class="row"><b>${esc(m.title)}</b><span class="spacer"></span><span class="meta"><span>read ${p.read}/${p.n}</span><span>mastered ${p.mastered}/${p.nq}</span><span>best ${S.best[m.id] ?? "—"}${S.best[m.id] != null ? "%" : ""}</span></span></div><div class="bar" style="margin-top:8px"><i style="width:${Math.round((p.readPct + p.qPct) / 2)}%"></i></div></a>`; }).join("")}</div>
      <div class="section-title"><h2>Settings & data</h2></div>
      <div class="qcard"><div class="field"><label>Theme</label><select id="theme"><option value="">System</option><option value="dark">Dark</option><option value="light">Light</option></select></div>
      <div class="row"><button class="btn" id="exp">Export progress</button><label class="btn ghost">Import<input type="file" id="imp" accept="application/json" hidden></label><span class="spacer"></span><button class="btn danger" id="reset">Reset all progress</button></div>
      <p class="small muted" style="margin-top:14px">Install: on iOS Safari use Share → Add to Home Screen; on Android/desktop Chrome use “Install app”. After the first visit everything works offline.</p></div>`;
    $("#theme").value = S.theme || "";
    $("#theme").onchange = (e) => { S.theme = e.target.value; save(); if (S.theme) document.documentElement.dataset.theme = S.theme; else delete document.documentElement.dataset.theme; };
    $("#exp").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" })); a.download = "bare-metal-academy-progress.json"; a.click(); };
    $("#imp").onchange = async (e) => { try { S = Object.assign(blank(), JSON.parse(await e.target.files[0].text())); save(); toast("Progress imported"); render(); } catch { toast("Invalid file"); } };
    let armed = false;
    $("#reset").onclick = () => { if (!armed) { armed = true; $("#reset").textContent = "Tap again to confirm"; return; } S = blank(); save(); toast("Progress reset"); render(); };
  });

  /* ---------------- lab ---------------- */
  route(/^\/lab(?:\/([\w-]+))?$/, (m) => window.LAB.render(view, m[1], { esc, inline, toast, $, $$ }));

  /* ---------------- boot ---------------- */
  preloadCounts().then(render);
  view.innerHTML = `<div class="empty">Loading…</div>`;
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        nw && nw.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) toast("New content available — reload to update"); });
      });
    }).catch(() => {});
  }
})();

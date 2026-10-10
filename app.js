/* 貸金業務取扱主任者 学習アプリ  —  データ: window.EXAMS / QUESTIONS / LAWS_INDEX / EXPLAIN / TEXTBOOK / CARDS */
(function () {
  "use strict";

  // ===================== データ =====================
  const EXAMS = window.EXAMS || [];
  const QUESTIONS = window.QUESTIONS || [];
  const LAWS_INDEX = window.LAWS_INDEX || [];
  const EXPLAIN = window.EXPLAIN || {};
  const TEXTBOOK = window.TEXTBOOK || [];
  const CARDS = window.CARDS || { cats: [], cards: [] };
  const CARD_MAP = Object.fromEntries(CARDS.cards.map(c => [c.id, c]));
  const CAT_NAME = Object.fromEntries(CARDS.cats);
  const QMAP = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
  const EXAM_BY_NO = Object.fromEntries(EXAMS.map(e => [e.no, e]));
  const SUBJECTS = {
    1: { name: "法及び関係法令", short: "法令", range: "22〜28問" },
    2: { name: "貸付け及び貸付けに付随する取引に関する法令及び実務", short: "貸付けの実務", range: "14〜18問" },
    3: { name: "資金需要者等の保護", short: "資金需要者の保護", range: "4〜6問" },
    4: { name: "財務及び会計", short: "財務・会計", range: "2〜4問" },
  };
  const MOCK_DIST = { 1: 27, 2: 15, 3: 5, 4: 3 };   // 第16〜20回の実際の配分
  const EXAM_DATE = new Date("2026-11-15T13:00:00+09:00");
  const CURRENT_BASE = "2026-04-01";
  const FMT = { single: "4択", count: "個数", combination: "組合せ", truefalse: "正誤組合せ", fill: "穴埋め", matching: "組合せ" };
  const LABEL_Z = { a: "ａ", b: "ｂ", c: "ｃ", d: "ｄ", e: "ｅ" };
  const OPT_MARK = ["①", "②", "③", "④"];

  const lawById = Object.fromEntries(LAWS_INDEX.map(l => [l.id, l]));
  const lawByName = {};
  LAWS_INDEX.forEach(l => { lawByName[l.name] = l.id; (l.aliases || []).forEach(a => { lawByName[a] = l.id; }); });
  function resolveLaw(nameOrId) { return lawById[nameOrId] ? nameOrId : lawByName[nameOrId]; }

  // 〇×（肢）単位のデータ
  function itemsOf(q) {
    if (q.format === "single") return q.options.map(o => ({ key: String(o.no), text: o.text, truth: o.truth }));
    if (["count", "combination", "truefalse"].includes(q.format)) return q.statements.map(s => ({ key: s.label, text: s.text, truth: s.truth }));
    return [];
  }
  function nowTruth(q, key, fallback) {
    const ex = EXPLAIN[q.id];
    if (ex && ex.items && ex.items[key] && typeof ex.items[key].now === "boolean") return ex.items[key].now;
    if (ex && ex.items && ex.items[key] && typeof ex.items[key].t === "boolean" && fallback === undefined) return ex.items[key].t;
    return fallback;
  }
  const TF_ITEMS = [];
  QUESTIONS.forEach(q => itemsOf(q).forEach(it => {
    const t = nowTruth(q, it.key, it.truth);
    if (typeof t === "boolean") TF_ITEMS.push({ qid: q.id, key: it.key, truth: t });
  }));

  // ===================== 学習履歴（このブラウザ内） =====================
  const STORE_KEY = "kashikin-study-v1";
  const emptyProg = () => ({ q: {}, t: {}, c: {}, mocks: [] });
  let prog = emptyProg();
  try { const s = localStorage.getItem(STORE_KEY); if (s) prog = Object.assign(prog, JSON.parse(s)); } catch (e) { /* 保存不可の環境 */ }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(prog)); } catch (e) { /* 無視 */ } }
  function recordQ(id, ok) {
    const r = prog.q[id] || (prog.q[id] = { n: 0, c: 0 });
    r.n++; if (ok) r.c++; r.ok = ok; r.last = Date.now(); save();
  }
  function recordT(qid, key, ok) {
    const k = qid + "|" + key; const r = prog.t[k] || (prog.t[k] = { n: 0, c: 0 });
    r.n++; if (ok) r.c++; r.ok = ok; r.last = Date.now(); schedule(r, ok); save();
  }
  function recordC(id, ok) {
    const r = prog.c[id] || (prog.c[id] = { n: 0, c: 0 });
    r.n++; if (ok) r.c++; r.ok = ok; r.last = Date.now(); schedule(r, ok); save();
  }

  // ===================== 間隔反復 =====================
  // 正解するたびに次に出す日を 1→3→7→14→30日後と延ばし、間違えたらその日のうちに出し直す
  const INTERVALS = [0, 1, 3, 7, 14, 30];
  const DAY = 86400000;
  function dayStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function schedule(r, ok) {
    r.box = ok ? Math.min((r.box || 0) + 1, INTERVALS.length - 1) : 0;
    r.due = dayStart(Date.now()) + INTERVALS[r.box] * DAY;
  }
  // 間隔反復を入れる前の記録（box・due なし）は、最後の正誤と日時から次に出す日を決める
  function dueAt(r) { return typeof r.due === "number" ? r.due : dayStart(r.last || 0) + INTERVALS[r.ok ? 1 : 0] * DAY; }
  function isDue(r) { return !!r && dueAt(r) <= Date.now(); }
  function byDue(recs) { return (a, b) => dueAt(recs(a)) - dueAt(recs(b)); }

  // ===================== ユーティリティ =====================
  const $ = (sel, root = document) => root.querySelector(sel);
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function fmtDate(iso) { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return `${y}年${m}月${d}日`; }
  function examLabel(no) { const e = EXAM_BY_NO[no]; return `第${no}回` + (e && e.year ? `（${e.year}）` : ""); }
  function pct(c, n) { return n ? Math.round(c / n * 100) : 0; }
  // 教科書・解説の書式: {{法令名:条}} → 条文リンク / **太字** / !!赤字!!
  function rich(s) {
    let h = esc(s);
    h = h.replace(/\{\{([^:}]+):([^}]+)\}\}/g, (m, law, art) => {
      const id = resolveLaw(law);
      const parts = art.split("の");
      const label = /^[0-9]/.test(art) ? `${law}第${parts[0]}条${parts.slice(1).map(x => "の" + x).join("")}` : law + art;
      return id ? `<button type="button" class="inline-ref" data-law="${id}" data-art="${esc(art)}">${esc(label)}</button>` : esc(label);
    });
    h = h.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/!!(.+?)!!/g, '<span class="redpen-inline" style="color:var(--red);font-weight:700">$1</span>');
    return h;
  }
  function artLabel(lawId, art) {
    const L = lawById[lawId]; const name = L ? (L.aliases && L.aliases[0] && L.name.length > 12 ? L.aliases[0] : L.name) : lawId;
    const a = String(art).split("の");
    return `${name}${a[0]}条${a.slice(1).map(x => "の" + x).join("")}`;
  }
  function refButtons(refs) {
    if (!refs || !refs.length) return "";
    return `<div class="refs">${refs.map(([law, art]) => {
      const id = resolveLaw(law); if (!id) return "";
      return `<button type="button" class="ref-link" data-law="${id}" data-art="${esc(art)}">${esc(artLabel(id, art))}</button>`;
    }).join("")}</div>`;
  }
  let toastTimer = null;
  function toast(msg) {
    let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ===================== 条文の読み込みと表示 =====================
  const LAW_DATA = {}; const LAW_WAIT = {};
  window.KLAW = { register(o) { LAW_DATA[o.id] = o; (LAW_WAIT[o.id] || []).forEach(f => f(o)); delete LAW_WAIT[o.id]; } };
  function loadLaw(id) {
    if (LAW_DATA[id]) return Promise.resolve(LAW_DATA[id]);
    return new Promise((resolve, reject) => {
      const first = !LAW_WAIT[id]; (LAW_WAIT[id] = LAW_WAIT[id] || []).push(resolve);
      if (first) {
        const s = document.createElement("script"); s.src = `laws/${id}.js`;
        s.onerror = () => reject(new Error("条文データを読み込めませんでした")); document.head.appendChild(s);
      }
    });
  }
  function renderItems(items, cls) {
    return items.map(it => `<div class="item ${cls || ""}"><span>${esc(it.t)}</span><span class="pre">${esc(it.x)}${it.s ? renderItems(it.s, "sub") : ""}</span></div>`).join("");
  }
  function renderArticle(L, key) {
    const a = L.a[key];
    if (!a) return `<p class="muted">${esc(L.name)}に「${esc(key)}」の条文が見つかりません（削除された条文の可能性があります）。</p>`;
    return `<div class="law-art"><div class="cap">${esc(a.t)}${esc(a.c)}</div>${a.p.map(p => `<div class="para"><span>${esc(p.n || "")}</span><span class="pre">${esc(p.x)}</span></div>${p.i ? renderItems(p.i) : ""}`).join("")}</div>`;
  }
  let drawerState = null;
  async function openLaw(id, key) {
    closeDrawer();
    const back = document.createElement("div"); back.className = "drawer-back";
    const d = document.createElement("aside"); d.className = "drawer"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "条文");
    d.innerHTML = `<header><b>${esc(lawById[id] ? lawById[id].name : id)}</b><button class="btn ghost" type="button" id="drawer-close">閉じる</button></header><div class="body"><p class="muted">読み込み中…</p></div>`;
    document.body.append(back, d);
    back.addEventListener("click", closeDrawer); $("#drawer-close", d).addEventListener("click", closeDrawer);
    drawerState = { id, key, el: d, back };
    try { const L = await loadLaw(id); paintDrawer(L, key); }
    catch (e) { $(".body", d).innerHTML = `<p class="muted">${esc(e.message)}。lawsフォルダがアプリと同じ場所にあるか確認してください。</p>`; }
  }
  function paintDrawer(L, key) {
    if (!drawerState) return;
    drawerState.key = key;
    const keys = Object.keys(L.a); const i = keys.indexOf(key);
    const prev = i > 0 ? keys[i - 1] : null, next = i >= 0 && i < keys.length - 1 ? keys[i + 1] : null;
    $(".body", drawerState.el).innerHTML = renderArticle(L, key) +
      `<div class="nav-row">${prev ? `<button class="btn ghost" type="button" data-go="${esc(prev)}">← ${esc(L.a[prev].t)}</button>` : "<span></span>"}${next ? `<button class="btn ghost" type="button" data-go="${esc(next)}">${esc(L.a[next].t)} →</button>` : ""}</div>` +
      `<p class="law-src">出典：e-Gov法令検索（${esc(L.num)}）。${CURRENT_BASE.replace(/-/g, "/")}時点の条文（直近の改正施行日 ${esc(L.enforced || "")}）。</p>`;
    drawerState.el.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => paintDrawer(L, b.dataset.go)));
    $(".body", drawerState.el).scrollTop = 0;
  }
  function closeDrawer() { if (drawerState) { drawerState.el.remove(); drawerState.back.remove(); drawerState = null; } }
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-law]"); if (b) { e.preventDefault(); openLaw(b.dataset.law, b.dataset.art); }
  });

  // ===================== 画面の切り替え =====================
  const app = document.getElementById("app");
  let view = { name: "home" };
  let session = null;   // 出題中のセッション
  let timerId = null;
  function go(name, opts) {
    clearInterval(timerId); timerId = null;
    view = Object.assign({ name }, opts || {});
    render(); window.scrollTo(0, 0);
  }
  function setNav() {
    document.querySelectorAll(".nav [data-nav]").forEach(b => {
      const active = b.dataset.nav === view.name || (b.dataset.nav === "practice" && ["setup", "quiz", "result", "cards"].includes(view.name) && view.tab !== "mock") || (b.dataset.nav === "mock" && view.tab === "mock");
      b.setAttribute("aria-current", active ? "page" : "false");
    });
  }
  function render() {
    setNav();
    const v = view.name;
    if (v === "home") return renderHome();
    if (v === "book") return renderBook();
    if (v === "practice") return renderPractice();
    if (v === "mock") return renderMockSetup();
    if (v === "quiz") return renderQuiz();
    if (v === "result") return renderResult();
    if (v === "record") return renderRecord();
    if (v === "cards") return renderCards();
    if (v === "about") return renderAbout();
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-about]"); if (b) { e.preventDefault(); go("about"); } });
  document.querySelectorAll(".nav [data-nav]").forEach(b => b.addEventListener("click", () => go(b.dataset.nav)));
  $(".brand").addEventListener("click", () => go("home"));

  // ===================== ホーム =====================
  function subjectStats(s) {
    const qs = QUESTIONS.filter(q => q.subject === s);
    let n = 0, c = 0, seen = 0;
    qs.forEach(q => { const r = prog.q[q.id]; if (r) { seen++; n++; if (r.ok) c++; } });
    return { total: qs.length, seen, acc: pct(c, n) };
  }
  function wrongQuestions() { return QUESTIONS.filter(q => prog.q[q.id] && prog.q[q.id].ok === false); }
  function dueItems() { return TF_ITEMS.filter(it => isDue(prog.t[it.qid + "|" + it.key])); }
  function dueCards() { return CARDS.cards.filter(c => isDue(prog.c[c.id])); }
  function renderHome() {
    const days = Math.max(0, Math.ceil((EXAM_DATE - new Date()) / 86400000));
    const explained = Object.keys(EXPLAIN).length;
    const wq = wrongQuestions().length, di = dueItems().length, dc = dueCards().length;
    app.innerHTML = `<div class="narrow">
      <section class="hero panel">
        <span class="eyebrow">令和8年度 貸金業務取扱主任者資格試験</span>
        <div class="spread">
          <div class="countdown"><span>試験日 11月15日（日）まで</span><b>${days}</b><span>日</span></div>
          <span class="muted small">法令の基準日：${fmtDate(CURRENT_BASE)}</span>
        </div>
        <p>試験は<b>四肢択一50問・2時間</b>のマークシート方式です。4つの分野から出題され、半分以上が「法及び関係法令」です。</p>
        <div class="grid2">${[1, 2, 3, 4].map(s => { const st = subjectStats(s); return `
          <div class="subject-row">
            <span><b>${SUBJECTS[s].short}</b> <span class="muted small">出題数の目安 ${SUBJECTS[s].range}</span></span>
            <span class="small num muted">${st.seen}/${st.total}問 ${st.seen ? "正答率" + st.acc + "%" : ""}</span>
            <div class="bar ok" style="grid-column:1/-1"><span style="width:${pct(st.seen, st.total)}%"></span></div>
          </div>`; }).join("")}</div>
      </section>

      <section class="panel">
        <h2>はじめての人の進め方</h2>
        <ol class="steps">
          <li><b>教科書</b>で分野の全体像をつかむ（まずは「法及び関係法令」から）</li>
          <li>各章の終わりから<b>関連する過去問</b>を解き、間違えた肢の赤字を読む</li>
          <li>慣れてきたら<b>〇×一問一答</b>で肢ごとの正誤判断を速くし、<b>暗記カード</b>で数字を覚える</li>
          <li>毎日<b>今日の復習</b>を片づける（正解した肢やカードは、間をあけて出し直します）</li>
          <li>仕上げに<b>本番模試</b>（ランダム50問・2時間）で時間配分を確かめる</li>
        </ol>
      </section>

      <section class="grid2">
        <button class="panel mode-card" type="button" data-go="book"><h3>教科書で学ぶ</h3><p class="small muted">4分野の入門テキスト。条文をその場で確認できます。</p></button>
        <button class="panel mode-card" type="button" data-go="practice" data-tab="exam"><h3>回ごとに解く</h3><p class="small muted">第1回〜第20回、各50問。解説付きは${explained ? "第20回など" + explained + "問" : "準備中"}。</p></button>
        <button class="panel mode-card" type="button" data-go="practice" data-tab="subject"><h3>分野ごとに解く</h3><p class="small muted">分野・回の範囲・問題数を選んで練習します。</p></button>
        <button class="panel mode-card" type="button" data-go="practice" data-tab="tf"><h3>〇×一問一答</h3><p class="small muted">過去問の肢を1つずつ判定。${TF_ITEMS.length.toLocaleString()}肢あります。</p></button>
        <button class="panel mode-card" type="button" data-go="practice" data-tab="cards"><h3>数字の暗記カード</h3><p class="small muted">上限金利・期間・金額など${CARDS.cards.length}枚。覚えた度合いに合わせて出し直します。</p></button>
        <button class="panel mode-card" type="button" data-go="mock"><h3>本番模試</h3><p class="small muted">全回からランダム50問。制限時間2時間、終了後に採点。</p></button>
        <button class="panel mode-card" type="button" data-go="practice" data-tab="wrong"><h3>今日の復習</h3><p class="small muted">4択${wq}問・〇×${di}肢・カード${dc}枚が復習待ちです。</p></button>
      </section>
      <p class="small muted">これは日本貸金業協会の公式アプリではありません。過去問と正答の出典：日本貸金業協会「貸金業務取扱主任者資格試験問題」。条文の出典：e-Gov法令検索。学習履歴はこのブラウザの中だけに保存されます。<button type="button" class="inline-ref" data-about="1">このアプリについて（出典・免責事項）</button></p>
    </div>`;
    app.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go, { tab: b.dataset.tab })));
  }

  // ===================== 教科書 =====================
  function chapterQuestions(ch) {
    if (!ch.q) return [];
    const re = new RegExp(ch.q);
    return QUESTIONS.filter(q => q.subject === ch.subject && re.test(q.stem));
  }
  function renderBook() {
    if (!TEXTBOOK.length) { app.innerHTML = `<div class="narrow panel"><p>教科書データがありません。</p></div>`; return; }
    const all = []; TEXTBOOK.forEach(sec => sec.chapters.forEach(ch => all.push(Object.assign({ subject: sec.subject }, ch))));
    const cur = all.find(c => c.id === view.ch) || all[0];
    const idx = all.indexOf(cur);
    const qs = chapterQuestions(cur);
    const tfs = TF_ITEMS.filter(it => qs.some(q => q.id === it.qid));
    app.innerHTML = `<div class="book">
      <nav class="toc panel" aria-label="目次">${TEXTBOOK.map(sec => `<div><h3>${esc(SUBJECTS[sec.subject].name)}</h3><ol>${sec.chapters.map(ch => `<li><button type="button" data-ch="${ch.id}" aria-current="${ch.id === cur.id}">${esc(ch.title)}</button></li>`).join("")}</ol></div>`).join("")}</nav>
      <article class="chapter">
        <span class="eyebrow">${esc(SUBJECTS[cur.subject].name)}</span>
        <h1>${esc(cur.title)}</h1>
        ${cur.lead ? `<p class="lead">${rich(cur.lead)}</p>` : ""}
        ${(cur.body || []).map(renderBlock).join("")}
        <div class="panel" style="background:var(--paper)">
          <h3 style="border:0;margin:0;padding:0">この章の過去問</h3>
          ${qs.length ? `<p class="small muted">問題文から「${esc(cur.title)}」に関係する問題を${qs.length}問見つけました（${tfs.length}肢）。</p>
          <div class="row"><button class="btn primary" type="button" id="ch-quiz">4択で解く（${Math.min(qs.length, 20)}問）</button><button class="btn" type="button" id="ch-tf" ${tfs.length ? "" : "disabled"}>〇×で解く（${Math.min(tfs.length, 20)}肢）</button></div>`
          : `<p class="small muted">この章に対応づけた過去問はまだありません。</p>`}
        </div>
        <div class="nav-row">${idx > 0 ? `<button class="btn ghost" type="button" data-ch="${all[idx - 1].id}">← ${esc(all[idx - 1].title)}</button>` : "<span></span>"}${idx < all.length - 1 ? `<button class="btn ghost" type="button" data-ch="${all[idx + 1].id}">${esc(all[idx + 1].title)} →</button>` : ""}</div>
      </article></div>`;
    app.querySelectorAll("[data-ch]").forEach(b => b.addEventListener("click", () => go("book", { ch: b.dataset.ch })));
    const qb = $("#ch-quiz"); if (qb) qb.addEventListener("click", () => startQuiz({ mode: "practice", title: cur.title, ids: shuffle(qs).slice(0, 20).map(q => q.id), back: { name: "book", ch: cur.id } }));
    const tb = $("#ch-tf"); if (tb) tb.addEventListener("click", () => startQuiz({ mode: "tf", title: cur.title + "（〇×）", items: shuffle(tfs).slice(0, 20), back: { name: "book", ch: cur.id } }));
  }
  function renderBlock(b) {
    const [type, val] = b;
    if (type === "h") return `<h3>${rich(val)}</h3>`;
    if (type === "p") return `<p>${rich(val)}</p>`;
    if (type === "ul") return `<ul>${val.map(x => `<li>${rich(x)}</li>`).join("")}</ul>`;
    if (type === "key") return `<div class="keypoint"><span class="eyebrow">ここを覚える</span><div>${Array.isArray(val) ? `<ul>${val.map(x => `<li>${rich(x)}</li>`).join("")}</ul>` : rich(val)}</div></div>`;
    if (type === "trap") return `<div class="trap"><span class="eyebrow">ひっかけ注意</span><div>${Array.isArray(val) ? `<ul>${val.map(x => `<li>${rich(x)}</li>`).join("")}</ul>` : rich(val)}</div></div>`;
    if (type === "table") return `<div class="scroll-x"><table class="tbl"><thead><tr>${val.head.map(h => `<th>${rich(h)}</th>`).join("")}</tr></thead><tbody>${val.rows.map(r => `<tr>${r.map(c => `<td>${rich(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    return "";
  }

  // ===================== 練習の設定 =====================
  const practiceForm = { subject: 1, range: "all", count: 20, order: "random", filter: "all", tfSubject: 0, tfRange: "all", tfCount: 30, instant: true };
  function examRange(r) {
    if (r === "recent5") return no => no >= 16;
    if (r === "recent10") return no => no >= 11;
    return () => true;
  }
  function renderPractice() {
    const tab = view.tab || "exam";
    const tabs = [["exam", "回ごと"], ["subject", "分野ごと"], ["tf", "〇×一問一答"], ["cards", "暗記カード"], ["wrong", "復習"]];
    let body = "";
    if (tab === "exam") {
      body = `<div class="panel"><p class="small muted">各回の50問を問題番号順に解きます。解説付きの回は、間違えた肢の誤りを赤字で示します。</p>
        <div class="seg" role="group" aria-label="答え合わせ"><button type="button" data-instant="1" aria-pressed="${practiceForm.instant}">1問ずつ答え合わせ</button><button type="button" data-instant="0" aria-pressed="${!practiceForm.instant}">最後にまとめて</button></div></div>
        <div class="grid4">${EXAMS.slice().reverse().map(e => {
          const qs = QUESTIONS.filter(q => q.exam_no === e.no);
          const done = qs.filter(q => prog.q[q.id]).length; const ok = qs.filter(q => prog.q[q.id] && prog.q[q.id].ok).length;
          const ex = qs.filter(q => EXPLAIN[q.id]).length;
          return `<button class="panel mode-card" type="button" data-exam="${e.no}">
            <div class="spread"><b>第${e.no}回</b>${ex ? `<span class="chip ok">解説${ex === qs.length ? "あり" : ex + "問"}</span>` : ""}</div>
            <span class="small muted">${esc(e.year || "")}・基準日 ${esc((e.base_date || "").replace(/-/g, "/"))}</span>
            <div class="bar ok"><span style="width:${pct(done, qs.length)}%"></span></div>
            <span class="small num">${done}/${qs.length}問 ${done ? `正解${ok}` : ""}</span></button>`; }).join("")}</div>`;
    } else if (tab === "subject") {
      const pool = subjectPool();
      body = `<div class="panel">
        <div class="grid2">
          <label class="field">分野<select id="f-subject">${[1, 2, 3, 4].map(s => `<option value="${s}" ${practiceForm.subject == s ? "selected" : ""}>${SUBJECTS[s].name}</option>`).join("")}</select></label>
          <label class="field">出題する回<select id="f-range"><option value="all" ${practiceForm.range === "all" ? "selected" : ""}>全20回</option><option value="recent10" ${practiceForm.range === "recent10" ? "selected" : ""}>第11回以降（直近10回）</option><option value="recent5" ${practiceForm.range === "recent5" ? "selected" : ""}>第16回以降（直近5回）</option></select></label>
          <label class="field">問題の選び方<select id="f-filter"><option value="all" ${practiceForm.filter === "all" ? "selected" : ""}>すべて</option><option value="new" ${practiceForm.filter === "new" ? "selected" : ""}>まだ解いていない問題</option><option value="wrong" ${practiceForm.filter === "wrong" ? "selected" : ""}>前回間違えた問題</option><option value="explained" ${practiceForm.filter === "explained" ? "selected" : ""}>解説がある問題</option></select></label>
          <label class="field">問題数<select id="f-count">${[10, 20, 30, 50].map(n => `<option ${practiceForm.count == n ? "selected" : ""}>${n}</option>`).join("")}<option value="999" ${practiceForm.count == 999 ? "selected" : ""}>該当する全問</option></select></label>
        </div>
        <div class="spread"><span class="small muted">該当 ${pool.length}問</span><button class="btn primary" type="button" id="start-subject" ${pool.length ? "" : "disabled"}>解き始める</button></div></div>`;
    } else if (tab === "tf") {
      const pool = tfPool();
      body = `<div class="panel">
        <p class="small muted">過去問の肢を1つずつ「〇（適切・該当する）」「×（適切でない・該当しない）」で判定します。どの問題の肢かは、上に小さく表示する問題文で確認できます。</p>
        <div class="grid2">
          <label class="field">分野<select id="t-subject"><option value="0">全分野</option>${[1, 2, 3, 4].map(s => `<option value="${s}" ${practiceForm.tfSubject == s ? "selected" : ""}>${SUBJECTS[s].name}</option>`).join("")}</select></label>
          <label class="field">出題する回<select id="t-range"><option value="all" ${practiceForm.tfRange === "all" ? "selected" : ""}>全20回</option><option value="recent10" ${practiceForm.tfRange === "recent10" ? "selected" : ""}>第11回以降</option><option value="recent5" ${practiceForm.tfRange === "recent5" ? "selected" : ""}>第16回以降</option></select></label>
          <label class="field">肢の数<select id="t-count">${[10, 30, 50, 100].map(n => `<option ${practiceForm.tfCount == n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        </div>
        <div class="spread"><span class="small muted">該当 ${pool.length.toLocaleString()}肢</span><button class="btn primary" type="button" id="start-tf">はじめる</button></div></div>`;
    } else if (tab === "cards") {
      const all = CARDS.cards.filter(c => !cardForm.cat || c.cat === cardForm.cat);
      const due = all.filter(c => isDue(prog.c[c.id])).length, fresh = all.filter(c => !prog.c[c.id]).length;
      const pool = cardPool();
      body = `<div class="panel">
        <p class="small muted">試験でよく問われる数字（上限金利・期間・金額・割合）を、問いを見て答えを思い出す形で覚えます。答えを見たら「覚えていた」か「まだ」を選んでください。覚えていたカードほど、次に出すまでの間をあけます。</p>
        <div class="grid2">
          <label class="field">分類<select id="c-cat"><option value="">すべての分類（${CARDS.cards.length}枚）</option>${CARDS.cats.map(([id, name]) => `<option value="${id}" ${cardForm.cat === id ? "selected" : ""}>${esc(name)}（${CARDS.cards.filter(c => c.cat === id).length}枚）</option>`).join("")}</select></label>
          <label class="field">出し方<select id="c-mode"><option value="today" ${cardForm.mode === "today" ? "selected" : ""}>今日の分（最大20枚）</option><option value="all" ${cardForm.mode === "all" ? "selected" : ""}>選んだ分類のすべて</option></select></label>
        </div>
        <p class="small muted">「今日の分」は、出し直しの日が来たカードを先に、続けてまだ見ていないカードを出します。</p>
        <div class="spread"><span class="small muted">出し直し ${due}枚・まだ見ていない ${fresh}枚・あとで出す ${all.length - due - fresh}枚</span><button class="btn primary" type="button" id="start-cards" ${pool.length ? "" : "disabled"}>はじめる（${pool.length}枚）</button></div></div>
        <details class="panel"><summary>カードの一覧（答えつき）</summary><div class="scroll-x"><table class="tbl"><thead><tr><th>問い</th><th>答え</th><th>根拠</th></tr></thead><tbody>${all.map(c => `<tr><td>${rich(c.q)}</td><td>${richLines(c.a)}</td><td>${refButtons(c.r)}</td></tr>`).join("")}</tbody></table></div></details>`;
    } else {
      const wq = wrongQuestions(), di = dueItems(), dc = dueCards();
      body = `<div class="panel"><p class="small muted">〇×で判定した肢と暗記カードは、正解するたびに次に出す日を<b>1日後→3日後→7日後→14日後→30日後</b>と延ばします。間違えたものは、その日のうちにもう一度出します。</p></div>
      <div class="grid2">
        <div class="panel"><h3>今日復習する肢</h3><p class="small muted">〇×一問一答と4択の答え合わせで判定した肢のうち、出し直しの日が来たものです（1回に最大50肢）。</p><span class="num"><b>${di.length}</b>肢</span><button class="btn primary" type="button" id="rev-t" ${di.length ? "" : "disabled"}>復習する</button></div>
        <div class="panel"><h3>今日復習するカード</h3><p class="small muted">暗記カードのうち、出し直しの日が来たものです。</p><span class="num"><b>${dc.length}</b>枚</span><button class="btn primary" type="button" id="rev-c" ${dc.length ? "" : "disabled"}>復習する</button></div>
        <div class="panel"><h3>4択で間違えた問題</h3><p class="small muted">最後に解いたときに不正解だった問題です。正解すると一覧から外れます。</p><span class="num"><b>${wq.length}</b>問</span><button class="btn primary" type="button" id="rev-q" ${wq.length ? "" : "disabled"}>復習する</button></div>
      </div>`;
    }
    app.innerHTML = `<div class="narrow"><h1>問題を解く</h1>
      <div class="seg" role="tablist">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${k === tab}">${l}</button>`).join("")}</div>${body}</div>`;
    app.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => go("practice", { tab: b.dataset.tab })));
    app.querySelectorAll("[data-instant]").forEach(b => b.addEventListener("click", () => { practiceForm.instant = b.dataset.instant === "1"; render(); }));
    app.querySelectorAll("[data-exam]").forEach(b => b.addEventListener("click", () => {
      const no = +b.dataset.exam;
      startQuiz({ mode: practiceForm.instant ? "practice" : "exam", title: examLabel(no), ids: QUESTIONS.filter(q => q.exam_no === no).map(q => q.id), back: { name: "practice", tab: "exam" } });
    }));
    const bind = (id, key, num) => { const el = $("#" + id); if (el) el.addEventListener("change", () => { practiceForm[key] = num ? +el.value : el.value; render(); }); };
    bind("f-subject", "subject", true); bind("f-range", "range"); bind("f-filter", "filter"); bind("f-count", "count", true);
    bind("t-subject", "tfSubject", true); bind("t-range", "tfRange"); bind("t-count", "tfCount", true);
    const cb = (id, key) => { const el = $("#" + id); if (el) el.addEventListener("change", () => { cardForm[key] = el.value; render(); }); };
    cb("c-cat", "cat"); cb("c-mode", "mode");
    const sc = $("#start-cards"); if (sc) sc.addEventListener("click", () => startCards({ title: "暗記カード" + (cardForm.cat ? "（" + CAT_NAME[cardForm.cat] + "）" : ""), ids: cardPool().map(c => c.id), back: { name: "practice", tab: "cards" } }));
    const rc = $("#rev-c"); if (rc) rc.addEventListener("click", () => startCards({ title: "暗記カードの復習", ids: shuffle(dueCards()).map(c => c.id), back: { name: "practice", tab: "wrong" } }));
    const ss = $("#start-subject"); if (ss) ss.addEventListener("click", () => {
      const pool = subjectPool(); const ids = shuffle(pool).slice(0, practiceForm.count).map(q => q.id);
      startQuiz({ mode: "practice", title: SUBJECTS[practiceForm.subject].short + "の練習", ids, back: { name: "practice", tab: "subject" } });
    });
    const st = $("#start-tf"); if (st) st.addEventListener("click", () => startQuiz({ mode: "tf", title: "〇×一問一答", items: shuffle(tfPool()).slice(0, practiceForm.tfCount), back: { name: "practice", tab: "tf" } }));
    const rq = $("#rev-q"); if (rq) rq.addEventListener("click", () => startQuiz({ mode: "practice", title: "間違えた問題の復習", ids: shuffle(wrongQuestions()).slice(0, 30).map(q => q.id), back: { name: "practice", tab: "wrong" } }));
    const rt = $("#rev-t"); if (rt) rt.addEventListener("click", () => startQuiz({ mode: "tf", title: "今日の復習（〇×）", items: shuffle(dueItems().sort(byDue(it => prog.t[it.qid + "|" + it.key])).slice(0, 50)), back: { name: "practice", tab: "wrong" } }));
  }
  function subjectPool() {
    const inRange = examRange(practiceForm.range);
    return QUESTIONS.filter(q => q.subject === practiceForm.subject && inRange(q.exam_no)).filter(q => {
      const r = prog.q[q.id];
      if (practiceForm.filter === "new") return !r;
      if (practiceForm.filter === "wrong") return r && r.ok === false;
      if (practiceForm.filter === "explained") return !!EXPLAIN[q.id];
      return true;
    });
  }
  // 今日の分：出し直しの日が来たカード（古い順）→ まだ見ていないカード、の順に最大20枚
  const cardForm = { cat: "", mode: "today" };
  function cardPool() {
    const all = CARDS.cards.filter(c => !cardForm.cat || c.cat === cardForm.cat);
    if (cardForm.mode === "all") return shuffle(all);
    const due = all.filter(c => isDue(prog.c[c.id])).sort(byDue(c => prog.c[c.id]));
    return due.concat(all.filter(c => !prog.c[c.id])).slice(0, 20);
  }
  function tfPool() {
    const inRange = examRange(practiceForm.tfRange);
    return TF_ITEMS.filter(it => { const q = QMAP[it.qid]; return inRange(q.exam_no) && (!practiceForm.tfSubject || q.subject === practiceForm.tfSubject); });
  }

  // ===================== 本番模試 =====================
  const mockForm = { range: "all" };
  function renderMockSetup() {
    view.tab = "mock"; setNav();
    const last = (prog.mocks || []).slice(-5).reverse();
    app.innerHTML = `<div class="narrow"><h1>本番模試</h1>
      <div class="panel">
        <p>本番と同じ<b>50問・制限時間2時間</b>です。分野の配分は直近の試験と同じ（法令27・貸付けの実務15・資金需要者の保護5・財務会計3）で、問題は過去問からランダムに選びます。途中で答え合わせはせず、最後にまとめて採点します。</p>
        <label class="field">出題する回<select id="m-range"><option value="all">全20回</option><option value="recent10" ${mockForm.range === "recent10" ? "selected" : ""}>第11回以降</option><option value="recent5" ${mockForm.range === "recent5" ? "selected" : ""}>第16回以降</option></select></label>
        <div class="notice">古い回の問題は、その後の法改正で正解が変わっている場合があります。仕上げの模試は「第11回以降」がおすすめです。</div>
        <div><button class="btn primary" type="button" id="m-start">模試を始める</button></div>
      </div>
      ${last.length ? `<div class="panel"><h2>これまでの模試</h2><div class="scroll-x"><table class="tbl"><thead><tr><th>日時</th><th class="r">得点</th>${[1, 2, 3, 4].map(s => `<th class="r">${SUBJECTS[s].short}</th>`).join("")}<th class="r">時間</th></tr></thead><tbody>${last.map(m => `<tr><td>${new Date(m.date).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td class="r"><b>${m.score}</b>/50</td>${[1, 2, 3, 4].map(s => `<td class="r">${m.by[s] ? m.by[s][0] + "/" + m.by[s][1] : "-"}</td>`).join("")}<td class="r">${Math.round(m.secs / 60)}分</td></tr>`).join("")}</tbody></table></div></div>` : ""}
    </div>`;
    $("#m-range").addEventListener("change", e => { mockForm.range = e.target.value; });
    $("#m-start").addEventListener("click", () => {
      const inRange = examRange(mockForm.range); const ids = [];
      [1, 2, 3, 4].forEach(s => { shuffle(QUESTIONS.filter(q => q.subject === s && inRange(q.exam_no))).slice(0, MOCK_DIST[s]).forEach(q => ids.push(q.id)); });
      startQuiz({ mode: "mock", title: "本番模試", ids, limit: 120 * 60, back: { name: "mock" } });
    });
  }

  // ===================== 出題 =====================
  function startQuiz(opts) {
    session = Object.assign({ idx: 0, answers: {}, checked: {}, flags: {}, started: Date.now(), finished: false }, opts);
    if (session.mode === "tf") session.list = session.items.map(it => ({ qid: it.qid, key: it.key, truth: it.truth }));
    else session.list = session.ids.map(id => ({ qid: id }));
    if (!session.list.length) { toast("該当する問題がありません"); return; }
    go("quiz", { tab: session.mode === "mock" ? "mock" : view.tab });
  }
  function isCorrect(q, ans) { return ans != null && ans === q.answer; }
  function renderQuiz() {
    if (!session) return go("home");
    const s = session; const cur = s.list[s.idx]; const q = QMAP[cur.qid];
    const isMock = s.mode === "mock", isExam = s.mode === "exam", isTF = s.mode === "tf";
    const showReview = s.finished || (!isMock && !isExam && s.checked[s.idx]);
    const answered = Object.keys(s.answers).length;
    const exam = EXAM_BY_NO[q.exam_no];
    let html = `<div class="narrow">
      <div class="runner-bar"><div><span class="eyebrow">${esc(s.title)}</span><div class="num"><b>${s.idx + 1}</b> / ${s.list.length}${isTF ? "肢" : "問"}${(isMock || isExam) && !s.finished ? `　<span class="muted small">解答済み ${answered}</span>` : ""}</div></div>
        <div class="row">${isMock && !s.finished ? `<span class="timer num" id="timer"></span>` : ""}<button class="btn ghost" type="button" id="q-quit">${s.finished ? "結果に戻る" : "やめる"}</button></div></div>`;
    if ((isMock || isExam) && !isTF) {
      html += `<div class="markgrid" aria-label="問題一覧">${s.list.map((c, i) => {
        const cls = []; if (i === s.idx) cls.push("cur");
        if (s.finished) cls.push(isCorrect(QMAP[c.qid], s.answers[i]) ? "ok" : "ng"); else { if (s.answers[i] != null) cls.push("done"); if (s.flags[i]) cls.push("flag"); }
        return `<button type="button" data-jump="${i}" class="${cls.join(" ")}">${i + 1}</button>`; }).join("")}</div>`;
    }
    html += `<div class="qhead"><span class="qno">第${q.exam_no}回 問${q.no}</span><span class="chip s1">${esc(SUBJECTS[q.subject].short)}</span><span class="chip">${FMT[q.format]}</span>${EXPLAIN[q.id] ? `<span class="chip ok">解説あり</span>` : ""}<span class="chip">基準日 ${esc((exam.base_date || "").replace(/-/g, "/"))}</span></div>`;
    html += isTF ? tfSheet(q, cur, s) : questionSheet(q, s.answers[s.idx], showReview);
    if (isTF) {
      if (s.checked[s.idx]) html += tfReview(q, cur, s.answers[s.idx]);
    } else if (showReview) html += questionReview(q, s.answers[s.idx]);
    // 下部ナビ
    html += `<div class="nav-row">`;
    html += s.idx > 0 ? `<button class="btn" type="button" id="q-prev">← 前へ</button>` : "<span></span>";
    if (isMock && !s.finished) html += `<button class="btn ghost" type="button" id="q-flag">${s.flags[s.idx] ? "見直し印を外す" : "見直し印をつける"}</button>`;
    if (!isMock && !isExam && !isTF && !s.checked[s.idx]) html += `<button class="btn primary" type="button" id="q-check" ${s.answers[s.idx] == null ? "disabled" : ""}>答え合わせ</button>`;
    else if (s.idx < s.list.length - 1) html += `<button class="btn ${isTF && !s.checked[s.idx] ? "" : "primary"}" type="button" id="q-next">次へ →</button>`;
    else if (!s.finished) html += `<button class="btn primary" type="button" id="q-finish" ${isTF && !s.checked[s.idx] ? "disabled" : ""}>${isMock || isExam ? "採点する" : "結果を見る"}</button>`;
    html += `</div>`;
    if ((isMock || isExam) && !s.finished) html += `<div id="confirm-area"></div>`;
    html += `</div>`;
    app.innerHTML = html;
    bindQuiz(q, cur);
    if (isMock && !s.finished) startTimer();
  }
  function questionSheet(q, ans, review) {
    const shortOpts = q.options.every(o => o.text.length <= 14);
    let h = `<section class="sheet"><p class="stem">${esc(q.stem)}</p>`;
    if (q.has_table) h += `<div class="notice">この問題には表があります。表の内容は問題文の中に1行で入っています。元の表は問題用紙PDF（${esc(EXAM_BY_NO[q.exam_no].source_question_pdf)}）で確認できます。</div>`;
    if (q.statements.length) h += `<ul class="stmts">${q.statements.map(st => `<li class="stmt"><span class="lb">${LABEL_Z[st.label]}</span><span>${esc(st.text)}</span></li>`).join("")}</ul>`;
    if (q.note) h += `<p class="qnote">${esc(q.note)}</p>`;
    h += `<ul class="opts ${shortOpts ? "inline" : ""}">${q.options.map(o => {
      const cls = ["opt"]; if (shortOpts) cls.push("short");
      if (ans === o.no) cls.push("picked");
      if (review) { if (o.no === q.answer) cls.push("is-correct"); else if (ans === o.no) cls.push("is-wrong"); }
      return `<li><button type="button" class="${cls.join(" ")}" data-opt="${o.no}" ${review ? "disabled" : ""}><span class="bubble">${o.no}</span><span>${esc(o.text)}</span></button></li>`; }).join("")}</ul></section>`;
    return h;
  }
  function explainFor(q) { return EXPLAIN[q.id] || null; }
  function lawChangeNote(q, ex) {
    const exam = EXAM_BY_NO[q.exam_no];
    if (ex && ex.law) return `<div class="notice">${rich(ex.law)}</div>`;
    if (!ex && exam.base_date < "2021-04-01") return `<div class="notice">第${q.exam_no}回（基準日 ${fmtDate(exam.base_date)}）の問題です。正答はその時点の法令によるため、現在の法令では結論が変わる肢があるかもしれません。</div>`;
    return "";
  }
  function questionReview(q, ans) {
    const ok = isCorrect(q, ans); const ex = explainFor(q);
    let h = `<section class="review panel">
      <div class="verdict ${ok ? "ok" : "ng"}">${ok ? "正解" : "不正解"}<span class="small muted" style="font-weight:400">正解は ${OPT_MARK[q.answer - 1]}${ans ? `／あなたの解答 ${OPT_MARK[ans - 1]}` : "／未解答"}</span></div>`;
    if (ex && ex.s) h += `<p>${rich(ex.s)}</p>`;
    h += lawChangeNote(q, ex);
    const items = itemsOf(q);
    if (items.length) {
      h += `<ul class="explain-list">${items.map(it => {
        const exi = ex && ex.items ? ex.items[it.key] : null;
        const truth = exi && typeof exi.t === "boolean" ? exi.t : it.truth;
        const mark = q.format === "single" ? OPT_MARK[+it.key - 1] : LABEL_Z[it.key];
        const mine = q.format === "single" && ans === +it.key;
        const chip = truth === true ? `<span class="chip ok">〇 ${q.polarity === "incorrect" || /該当/.test(q.stem) ? "適切／該当" : "適切"}</span>` : truth === false ? `<span class="chip ng">× ${q.polarity === "incorrect" || /該当/.test(q.stem) ? "適切でない／該当しない" : "適切でない"}</span>` : `<span class="chip">正誤は個数のみ公表</span>`;
        return `<li class="explain-item ${mine ? "mine" : ""}"><div class="head"><span>${mark}</span>${chip}${mine ? `<span class="small muted">あなたが選んだ肢</span>` : ""}${exi && typeof exi.now === "boolean" && exi.now !== truth ? `<span class="chip warn">現行法では${exi.now ? "〇" : "×"}</span>` : ""}</div>
          ${ex ? "" : `<p class="small">${esc(it.text)}</p>`}
          ${exi && exi.p ? `<p class="redpen">${rich(exi.p)}</p>` : ""}
          ${exi && exi.w ? `<p class="why">${rich(exi.w)}</p>` : ""}
          ${exi ? refButtons(exi.r) : ""}</li>`; }).join("")}</ul>`;
    } else if (ex && ex.items) {
      h += `<ul class="explain-list">${Object.entries(ex.items).map(([k, exi]) => `<li class="explain-item"><div class="head">${esc(k)}</div>${exi.p ? `<p class="redpen">${rich(exi.p)}</p>` : ""}${exi.w ? `<p class="why">${rich(exi.w)}</p>` : ""}${refButtons(exi.r)}</li>`).join("")}</ul>`;
    }
    if (!ex) h += `<p class="pending">この問題の解説はまだありません。各肢の〇×は公式の正答から判定しています。${q.refs.length ? "問題文に出てくる条文は下から確認できます。" : ""}</p>`;
    const refs = ex && ex.r ? ex.r : (!ex ? q.refs : []);
    if (refs && refs.length) h += `<div><span class="eyebrow">${ex ? "根拠条文" : "問題文に出てくる条文"}</span>${refButtons(refs)}</div>`;
    h += `</section>`;
    return h;
  }
  function tfSheet(q, cur, s) {
    const it = itemsOf(q).find(x => x.key === cur.key);
    const mark = q.format === "single" ? OPT_MARK[+cur.key - 1] : LABEL_Z[cur.key];
    const ans = s.answers[s.idx];
    let h = `<section class="sheet"><p class="small muted">${examLabel(q.exam_no)} 問${q.no}の肢を〇×形式に改題</p><p class="stem context">${esc(q.stem)}</p>${q.note ? `<p class="qnote">${esc(q.note)}</p>` : ""}
      <div class="stmt" style="font-size:1.05rem"><span class="lb">${mark}</span><span>${esc(it.text)}</span></div></section>`;
    if (!s.checked[s.idx]) h += `<div class="tf-buttons"><button class="btn" type="button" data-tf="1">〇<small>適切・該当する</small></button><button class="btn" type="button" data-tf="0">×<small>適切でない・該当しない</small></button></div>`;
    else {
      const cls = v => [cur.truth === v ? "tf-correct" : "", ans === v && cur.truth !== v ? "tf-wrong" : ""].join(" ");
      h += `<div class="tf-buttons"><button class="btn ${cls(true)}" type="button" disabled>〇${ans === true ? "<small>あなたの解答</small>" : ""}</button><button class="btn ${cls(false)}" type="button" disabled>×${ans === false ? "<small>あなたの解答</small>" : ""}</button></div>`;
    }
    return h;
  }
  function tfReview(q, cur, ans) {
    const ok = ans === cur.truth; const ex = explainFor(q); const exi = ex && ex.items ? ex.items[cur.key] : null;
    let h = `<section class="review panel"><div class="verdict ${ok ? "ok" : "ng"}">${ok ? "正解" : "不正解"}<span class="small muted" style="font-weight:400">この肢は ${cur.truth ? "〇（適切・該当する）" : "×（適切でない・該当しない）"}</span></div>`;
    h += lawChangeNote(q, ex);
    if (exi) { if (exi.p) h += `<p class="redpen">${rich(exi.p)}</p>`; if (exi.w) h += `<p class="why">${rich(exi.w)}</p>`; h += refButtons(exi.r); }
    else { h += `<p class="pending">この肢の解説はまだありません。正誤は公式の正答から判定しています。</p>`; if (q.refs.length) h += `<div><span class="eyebrow">問題文に出てくる条文</span>${refButtons(q.refs)}</div>`; }
    h += `<p class="small muted">出典：${examLabel(q.exam_no)} 問${q.no}</p></section>`;
    return h;
  }
  function bindQuiz(q, cur) {
    const s = session;
    app.querySelectorAll("[data-opt]").forEach(b => b.addEventListener("click", () => { s.answers[s.idx] = +b.dataset.opt; renderQuiz(); }));
    app.querySelectorAll("[data-tf]").forEach(b => b.addEventListener("click", () => {
      const ans = b.dataset.tf === "1"; s.answers[s.idx] = ans; s.checked[s.idx] = true;
      recordT(cur.qid, cur.key, ans === cur.truth); renderQuiz();
    }));
    app.querySelectorAll("[data-jump]").forEach(b => b.addEventListener("click", () => { s.idx = +b.dataset.jump; renderQuiz(); }));
    const on = (id, f) => { const el = $("#" + id); if (el) el.addEventListener("click", f); };
    on("q-prev", () => { s.idx--; renderQuiz(); window.scrollTo(0, 0); });
    on("q-next", () => { s.idx++; renderQuiz(); window.scrollTo(0, 0); });
    on("q-flag", () => { s.flags[s.idx] = !s.flags[s.idx]; renderQuiz(); });
    on("q-check", () => {
      s.checked[s.idx] = true; const ok = isCorrect(q, s.answers[s.idx]); recordQ(q.id, ok);
      // 選んだ肢の判定も〇×の履歴に入れる（4択で、肢の正誤がわかる場合）
      if (q.format === "single") itemsOf(q).forEach(it => { if (+it.key === s.answers[s.idx] && typeof it.truth === "boolean") recordT(q.id, it.key, ok); });
      renderQuiz();
    });
    on("q-finish", () => {
      if (s.mode === "mock" || s.mode === "exam") return confirmFinish();
      finish();
    });
    on("q-quit", () => {
      if (s.finished || s.mode === "practice" || s.mode === "tf") { if (s.finished) go("result"); else { session = null; go(s.back.name, s.back); } return; }
      confirmFinish(true);
    });
  }
  function confirmFinish(quitting) {
    const s = session; const left = s.list.length - Object.keys(s.answers).length;
    const area = $("#confirm-area"); if (!area) return;
    area.innerHTML = `<div class="panel" style="border-color:var(--accent)"><p>${quitting ? "途中でやめますか？ここまでの解答で採点することもできます。" : "採点しますか？"}${left ? `未解答が<b>${left}問</b>あります。` : ""}</p>
      <div class="row"><button class="btn primary" type="button" id="cf-yes">採点する</button>${quitting ? `<button class="btn danger" type="button" id="cf-discard">採点せずにやめる</button>` : ""}<button class="btn ghost" type="button" id="cf-no">続ける</button></div></div>`;
    area.scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("#cf-yes").addEventListener("click", finish);
    $("#cf-no").addEventListener("click", () => { area.innerHTML = ""; });
    const d = $("#cf-discard"); if (d) d.addEventListener("click", () => { session = null; go(s.back.name, s.back); });
  }
  function startTimer() {
    const s = session; const el = $("#timer"); if (!el) return;
    const tick = () => {
      const left = Math.max(0, s.limit - Math.floor((Date.now() - s.started) / 1000));
      el.textContent = `残り ${Math.floor(left / 3600)}:${String(Math.floor(left % 3600 / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
      el.classList.toggle("low", left < 600);
      if (left <= 0) { clearInterval(timerId); toast("時間になりました。採点します"); finish(); }
    };
    tick(); clearInterval(timerId); timerId = setInterval(tick, 1000);
  }
  function finish() {
    const s = session; clearInterval(timerId);
    s.finished = true; s.secs = Math.round((Date.now() - s.started) / 1000);
    if (s.mode === "mock" || s.mode === "exam") {
      s.list.forEach((c, i) => {
        const q = QMAP[c.qid]; const ok = isCorrect(q, s.answers[i]); recordQ(q.id, ok);
        if (q.format === "single" && s.answers[i] != null) itemsOf(q).forEach(it => { if (+it.key === s.answers[i] && typeof it.truth === "boolean") recordT(q.id, it.key, ok); });
      });
      if (s.mode === "mock") {
        const by = {}; s.list.forEach((c, i) => { const q = QMAP[c.qid]; by[q.subject] = by[q.subject] || [0, 0]; by[q.subject][1]++; if (isCorrect(q, s.answers[i])) by[q.subject][0]++; });
        prog.mocks = (prog.mocks || []).concat([{ date: Date.now(), score: Object.values(by).reduce((a, b) => a + b[0], 0), by, secs: s.secs }]).slice(-50); save();
      }
    }
    go("result", { tab: s.mode === "mock" ? "mock" : view.tab });
  }

  // ===================== 結果 =====================
  function renderResult() {
    const s = session; if (!s) return go("home");
    const isTF = s.mode === "tf";
    const rows = s.list.map((c, i) => {
      const q = QMAP[c.qid];
      const ok = isTF ? s.answers[i] === c.truth : (s.mode === "practice" ? (s.checked[i] ? isCorrect(q, s.answers[i]) : null) : isCorrect(q, s.answers[i]));
      return { i, q, ok, c };
    });
    const done = rows.filter(r => r.ok !== null);
    const score = done.filter(r => r.ok).length;
    const by = {}; rows.forEach(r => { const k = r.q.subject; by[k] = by[k] || [0, 0]; if (r.ok !== null) { by[k][1]++; if (r.ok) by[k][0]++; } });
    app.innerHTML = `<div class="narrow"><span class="eyebrow">${esc(s.title)}の結果</span>
      <section class="panel"><div class="score"><b>${score}</b><span>/ ${done.length}${isTF ? "肢" : "問"}</span><span class="muted">正答率 ${pct(score, done.length)}%${s.secs ? `・${Math.floor(s.secs / 60)}分${s.secs % 60}秒` : ""}</span></div>
        ${s.mode === "mock" ? `<p class="small muted">合格基準点は回ごとに日本貸金業協会が公表しています。分野ごとの取りこぼしを下の表で確認してください。</p>` : ""}
        <div class="scroll-x"><table class="tbl"><thead><tr><th>分野</th><th class="r">正解</th><th class="r">出題</th><th class="r">正答率</th></tr></thead><tbody>${[1, 2, 3, 4].filter(k => by[k] && by[k][1]).map(k => `<tr><td>${SUBJECTS[k].name}</td><td class="r">${by[k][0]}</td><td class="r">${by[k][1]}</td><td class="r">${pct(by[k][0], by[k][1])}%</td></tr>`).join("")}</tbody></table></div>
        <div class="row"><button class="btn primary" type="button" id="r-wrong" ${rows.some(r => r.ok === false) ? "" : "disabled"}>間違えた${isTF ? "肢" : "問題"}だけ解き直す</button><button class="btn" type="button" id="r-back">戻る</button></div>
      </section>
      <section class="panel"><h2>1問ずつ見直す</h2><p class="small muted">番号を押すと、問題と解説（赤字）を表示します。</p>
        <div class="markgrid">${rows.map(r => `<button type="button" data-rv="${r.i}" class="${r.ok === null ? "" : r.ok ? "ok" : "ng"}">${r.i + 1}</button>`).join("")}</div></section></div>`;
    app.querySelectorAll("[data-rv]").forEach(b => b.addEventListener("click", () => {
      s.idx = +b.dataset.rv; if (isTF || s.mode === "practice") s.checked[s.idx] = s.checked[s.idx] || s.answers[s.idx] != null; s.finished = true; go("quiz", { tab: view.tab });
    }));
    $("#r-back").addEventListener("click", () => { const b = s.back; session = null; go(b.name, b); });
    $("#r-wrong").addEventListener("click", () => {
      const wrong = rows.filter(r => r.ok === false);
      if (isTF) startQuiz({ mode: "tf", title: "間違えた肢の解き直し", items: wrong.map(r => r.c), back: s.back });
      else startQuiz({ mode: "practice", title: "間違えた問題の解き直し", ids: wrong.map(r => r.q.id), back: s.back });
    });
  }

  // ===================== 暗記カード =====================
  let cardSession = null;
  function richLines(s) { return rich(s).replace(/\n/g, "<br>"); }
  function startCards(opts) {
    if (!opts.ids.length) { toast("該当するカードがありません"); return; }
    cardSession = Object.assign({ idx: 0, shown: false, results: {} }, opts);
    go("cards", { tab: "cards" });
  }
  function renderCards() {
    const s = cardSession; if (!s) return go("practice", { tab: "cards" });
    if (s.idx >= s.ids.length) return renderCardsDone();
    const c = CARD_MAP[s.ids[s.idx]]; const r = prog.c[c.id];
    app.innerHTML = `<div class="narrow">
      <div class="runner-bar"><div><span class="eyebrow">${esc(s.title)}</span><div class="num"><b>${s.idx + 1}</b> / ${s.ids.length}枚</div></div><button class="btn ghost" type="button" id="c-quit">やめる</button></div>
      <section class="sheet">
        <div class="row"><span class="chip s1">${esc(CAT_NAME[c.cat] || "")}</span><span class="chip">${r ? "前回：" + (r.ok ? "覚えていた" : "まだ") : "はじめて"}</span></div>
        <p class="stem">${rich(c.q)}</p>
        ${s.shown ? `<div class="flash-a">${richLines(c.a)}</div>${c.w ? `<p class="why">${rich(c.w)}</p>` : ""}${refButtons(c.r)}` : ""}
      </section>
      ${s.shown ? `<div class="tf-buttons"><button class="btn" type="button" data-know="1">覚えていた<small>次はしばらくあとに出す</small></button><button class="btn" type="button" data-know="0">まだ<small>今日のうちにもう一度出す</small></button></div>`
        : `<div class="tf-buttons one"><button class="btn primary" type="button" id="c-show">答えを見る</button></div>`}
    </div>`;
    $("#c-quit").addEventListener("click", () => { cardSession = null; go(s.back.name, s.back); });
    const sh = $("#c-show"); if (sh) { sh.focus(); sh.addEventListener("click", () => { s.shown = true; renderCards(); const k = $("[data-know]"); if (k) k.focus(); }); }
    app.querySelectorAll("[data-know]").forEach(b => b.addEventListener("click", () => {
      const ok = b.dataset.know === "1"; recordC(c.id, ok); s.results[c.id] = ok;
      s.idx++; s.shown = false; renderCards(); window.scrollTo(0, 0);
    }));
  }
  function renderCardsDone() {
    const s = cardSession; const ids = Object.keys(s.results);
    const ok = ids.filter(id => s.results[id]).length; const again = ids.filter(id => !s.results[id]);
    app.innerHTML = `<div class="narrow"><span class="eyebrow">${esc(s.title)}の結果</span>
      <section class="panel"><div class="score"><b>${ok}</b><span>/ ${ids.length}枚</span><span class="muted">覚えていた</span></div>
        <p class="small muted">「まだ」のカードは今日の復習に入っています。「覚えていた」カードは、次に出す日が来るまで復習に出ません。</p>
        <div class="row"><button class="btn primary" type="button" id="c-again" ${again.length ? "" : "disabled"}>「まだ」のカードをもう一度（${again.length}枚）</button><button class="btn" type="button" id="c-back">戻る</button></div></section></div>`;
    $("#c-back").addEventListener("click", () => { cardSession = null; go(s.back.name, s.back); });
    $("#c-again").addEventListener("click", () => startCards({ title: s.title, ids: shuffle(again), back: s.back }));
  }

  // ===================== このアプリについて（出典・免責事項） =====================
  function renderAbout() {
    const src = [
      ["過去問・正答", "日本貸金業協会「貸金業務取扱主任者資格試験問題」（第1回〜第20回）", "https://www.j-fsa.or.jp/"],
      ["法令の条文", "e-Gov法令検索（デジタル庁）。2026年4月1日時点の条文を取得して収録", "https://laws.e-gov.go.jp/"],
      ["監督指針", "金融庁「貸金業者向けの総合的な監督指針」（令和8年10月）、事務ガイドライン（13 指定信用情報機関関係）", "https://www.fsa.go.jp/"],
      ["協会の規則", "日本貸金業協会「貸金業の業務運営に関する自主規制基本規則」「貸金業者の広告に関する細則」「紛争解決等業務に関する規則・細則」「貸付自粛対応に関する規則」など", "https://www.j-fsa.or.jp/"],
      ["景品表示法関係", "「消費者信用の融資費用に関する不当な表示」（昭和55年公正取引委員会告示第13号）及び同運用基準", "https://www.caa.go.jp/"],
      ["個人情報保護", "個人情報保護委員会・金融庁の個人情報保護に関するガイドライン", "https://www.ppc.go.jp/"],
      ["企業会計原則", "企業会計審議会「企業会計原則」「企業会計原則注解」（企業会計基準委員会の会計基準検索システムより）", "https://www.asb-j.jp/"],
    ];
    app.innerHTML = `<div class="narrow"><h1>このアプリについて</h1>
      <section class="panel"><h2>概要</h2>
        <p>貸金業務取扱主任者資格試験の学習用アプリです。<b>日本貸金業協会その他の団体の公式アプリではなく、これらの団体とは関係ありません。</b></p>
        <p>解説・教科書・暗記カードは、下の資料と過去問の公式正答をもとに、このアプリの作者が作成したものです。</p></section>
      <section class="panel"><h2>出典</h2>
        <dl class="src-list">${src.map(([k, v, u]) => `<dt>${esc(k)}</dt><dd>${esc(v)}<br><a href="${u}" target="_blank" rel="noopener">${esc(u)}</a></dd>`).join("")}</dl>
        <ul class="small">
          <li>過去問の問題文・選択肢は、原文のまま掲載しています（日本貸金業協会のサイトの利用条件による）。</li>
          <li>「〇×一問一答」は、過去問の肢を1つずつ取り出し、〇×で答える形にしたもの（改題）です。肢の正誤は、公式正答と、このアプリの解説によります。</li>
          <li>表を含む一部の問題は、表の内容を1行の文章として収録しています。元の表は協会が公表している問題用紙で確認してください。</li>
        </ul></section>
      <section class="panel"><h2>免責事項</h2>
        <ul>
          <li>内容の正確性には注意していますが、<b>正確性・完全性は保証しません</b>。このアプリの利用によって生じた損害（試験の結果を含む）について、作者は責任を負いません。</li>
          <li>法令は <b>2026年4月1日時点</b>（令和8年度試験の出題の基準日）、監督指針は <b>令和8年10月版</b> によります。</li>
          <li>過去問の公式正答は、それぞれの回の試験の基準日の法令によるものです。その後の法改正で結論が変わった肢には、解説で「現行法では」と示しています。</li>
          <li>試験の正式な情報（日程・出題範囲・合格基準など）は、日本貸金業協会のサイトで確認してください。</li>
        </ul></section>
      <section class="panel"><h2>データの扱い</h2>
        <ul>
          <li>学習記録は、このブラウザの中（localStorage）だけに保存します。外部のサーバーには送信しません。</li>
          <li>表示用のフォントを Google Fonts から読み込みます。それ以外の外部通信はしません。</li>
        </ul></section>
    </div>`;
  }

  // ===================== 学習記録・データの移行 =====================
  function renderRecord() {
    const nq = Object.keys(prog.q).length, nt = Object.keys(prog.t).length;
    const okq = Object.values(prog.q).filter(r => r.ok).length;
    app.innerHTML = `<div class="narrow"><h1>学習記録</h1>
      <section class="panel"><div class="grid4">
        <div><span class="eyebrow">解いた問題</span><div class="num"><b style="font-size:1.6rem">${nq}</b> / ${QUESTIONS.length}</div></div>
        <div><span class="eyebrow">最後に正解した問題</span><div class="num"><b style="font-size:1.6rem">${okq}</b></div></div>
        <div><span class="eyebrow">判定した肢</span><div class="num"><b style="font-size:1.6rem">${nt}</b> / ${TF_ITEMS.length}</div></div>
        <div><span class="eyebrow">学習したカード</span><div class="num"><b style="font-size:1.6rem">${Object.keys(prog.c).length}</b> / ${CARDS.cards.length}</div></div>
        <div><span class="eyebrow">模試の回数</span><div class="num"><b style="font-size:1.6rem">${(prog.mocks || []).length}</b></div></div></div>
        <div class="scroll-x"><table class="tbl"><thead><tr><th>分野</th><th class="r">解いた問題</th><th class="r">正答率</th></tr></thead><tbody>${[1, 2, 3, 4].map(s => { const st = subjectStats(s); return `<tr><td>${SUBJECTS[s].name}</td><td class="r">${st.seen}/${st.total}</td><td class="r">${st.seen ? st.acc + "%" : "-"}</td></tr>`; }).join("")}</tbody></table></div>
      </section>
      <section class="panel"><h2>別の端末・ブラウザへ移す</h2>
        <p class="small muted">学習記録はこのブラウザの中だけに保存され、外部には送信しません。下の「コピー」で記録を文字列としてコピーし、移し先で「貼り付けて読み込む」に貼り付けてください。</p>
        <textarea class="io" id="io" spellcheck="false" aria-label="学習記録のデータ"></textarea>
        <div class="row"><button class="btn" type="button" id="io-copy">記録をコピー</button><button class="btn" type="button" id="io-load">貼り付けて読み込む</button><button class="btn danger" type="button" id="io-reset">記録を消す</button></div>
        <div id="io-confirm"></div>
      </section></div>`;
    const ta = $("#io"); ta.value = JSON.stringify(prog);
    $("#io-copy").addEventListener("click", () => {
      ta.value = JSON.stringify(prog);
      const done = () => toast("コピーしました");
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); toast("テキストを選択しました。コピーしてください"); });
      else { ta.select(); toast("テキストを選択しました。コピーしてください"); }
    });
    $("#io-load").addEventListener("click", () => {
      try { const o = JSON.parse(ta.value); if (!o || typeof o.q !== "object") throw new Error(); prog = Object.assign(emptyProg(), o); save(); toast("読み込みました"); render(); }
      catch (e) { toast("読み込めませんでした。コピーした文字列をそのまま貼り付けてください"); }
    });
    $("#io-reset").addEventListener("click", () => {
      $("#io-confirm").innerHTML = `<div class="row"><span>学習記録をすべて消します。元に戻せません。</span><button class="btn danger" type="button" id="io-yes">消す</button><button class="btn ghost" type="button" id="io-no">やめる</button></div>`;
      $("#io-yes").addEventListener("click", () => { prog = emptyProg(); save(); toast("消しました"); render(); });
      $("#io-no").addEventListener("click", () => { $("#io-confirm").innerHTML = ""; });
    });
  }

  // ===================== PWA（オフライン用のキャッシュ） =====================
  // http(s) で開いたときだけ service worker を登録する（file:// では何もしない）
  let swUpdating = false;
  function offerUpdate(w) {
    if (!w || !navigator.serviceWorker.controller || $(".update-bar")) return;
    const bar = document.createElement("div"); bar.className = "update-bar"; bar.setAttribute("role", "status");
    bar.innerHTML = `<span>新しい版があります。</span><button class="btn primary" type="button">更新する</button><button class="btn ghost" type="button">あとで</button>`;
    const [upd, later] = bar.querySelectorAll("button");
    upd.addEventListener("click", () => { swUpdating = true; w.postMessage("SKIP_WAITING"); });
    later.addEventListener("click", () => bar.remove());
    document.body.appendChild(bar);
  }
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    try {
      navigator.serviceWorker.register("sw.js").then(reg => {
        offerUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing; if (w) w.addEventListener("statechange", () => { if (w.state === "installed") offerUpdate(w); });
        });
      }).catch(() => { /* 登録できない環境（プレビューなど）では通常どおり動く */ });
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (swUpdating) location.reload(); });
    } catch (e) { /* 無視 */ }
  }

  render();
})();

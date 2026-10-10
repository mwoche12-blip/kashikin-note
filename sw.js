// 生成物（tools/build_pwa.py が作る）。直接編集しない。
// 最初に開いたときに app/ の全ファイルをキャッシュし、以後はキャッシュから表示する（オフライン対応）。
// 新しい版は、アプリ側の「更新する」ボタン（SKIP_WAITING）で切り替える。
const VERSION = "8628bc77acab";
const CACHE = "kashikin-" + VERSION;
const FONT_CACHE = "kashikin-fonts";
const FILES = ["app.js", "index.html", "style.css", "data/cards.js", "data/explanations.js", "data/laws_index.js", "data/questions.js", "data/textbook.js", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "laws/L01.js", "laws/L02.js", "laws/L03.js", "laws/L04.js", "laws/L05.js", "laws/L06.js", "laws/L07.js", "laws/L08.js", "laws/L09.js", "laws/L10.js", "laws/L11.js", "laws/L12.js", "laws/L13.js", "laws/L14.js", "laws/L15.js", "laws/L16.js", "laws/L17.js", "laws/L18.js", "laws/L19.js", "laws/L20.js", "laws/L21.js", "laws/L22.js", "laws/L23.js", "laws/L24.js", "laws/L25.js", "laws/L26.js", "laws/L27.js", "laws/L28.js", "laws/L29.js", "laws/L30.js", "laws/L31.js", "laws/L32.js", "laws/L33.js", "laws/L34.js", "laws/L35.js", "laws/L36.js", "laws/L37.js", "laws/L38.js", "manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./"].concat(FILES))));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("kashikin-") && k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("message", e => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Webフォント：一度読み込んだものを保存して使う
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONT_CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(req, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    return fetch(req).catch(() => req.mode === "navigate" ? c.match("index.html") : Response.error());
  })));
});

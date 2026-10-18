const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const pathPage = (location.pathname.split("/").pop() || "index.html").toLowerCase();
const page = pathPage.includes('.') ? pathPage : `${pathPage}.html`;

const nav = [
  ["index.html", "主頁"],
  ["rules.html", "規則"],
  ["news.html", "公告"],
  ["wiki.html", "Wiki"],
  ["forum.html", "論壇"],
  ["gallery.html", "玩家相冊"]
];

const header = $("[data-header]");
if (header) {
  header.innerHTML = `<header class="topbar topbar-hidden ${page === "index.html" ? "home-topbar" : ""}">
    <a class="brand" href="/"><img class="brand-icon" src="/image/server_icon.png" alt=""><span><b>茶咖暖居</b><small>TEACAFE</small></span></a>
    <nav class="topnav">${nav.map(([url, name]) => `<a class="mc-nav ${page === url ? "active" : ""}" href="/${url}">${name}</a>`).join("")}<details class="nav-more"><summary class="mc-nav">更多</summary><div><a href="/supporters.html">感謝支持</a><a href="/careers.html">職業指南</a><a href="/market.html">月映茶行</a><a data-official-link href="/admin" hidden>管理後台</a></div></details></nav>
    <div class="top-tools">
      <a class="discord-invite" href="https://discord.gg/FHCSjfD9Fq" target="_blank" rel="noopener noreferrer" aria-label="加入茶咖暖居 Discord 伺服器" title="加入 Discord 伺服器"><img src="/image/discord.svg" alt=""></a>
      <button class="mc-nav settings-button" data-settings aria-label="設定">⚙</button>
      <button class="mc-nav mobile-menu" data-mobile aria-label="選單">☰</button>
    </div>
  </header>`;
}

const footer = $("[data-footer]");
if (footer) {
  footer.innerHTML = `<footer class="site-footer">
    <a class="brand" href="/"><img class="brand-icon" src="/image/server_icon.png" alt=""><span><b>茶咖暖居</b><small>TEACAFE</small></span></a>
    <nav><a href="/">主頁</a><a href="/rules.html">規則</a><a href="/news.html">公告</a><a href="/wiki.html">Wiki</a><a href="/forum.html">論壇</a><a href="/gallery.html">玩家相冊</a><a href="/supporters.html">感謝支持</a><a href="/careers.html">職業指南</a><a href="/market.html">月映茶行</a><a data-official-link href="/admin" hidden>管理後台</a></nav>
  </footer>`;
}

document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="/assets/css/effects.css?v=20261017">');
document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="/assets/css/polish.css?v=20261018">');
document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="/assets/css/site-refresh.css?v=20261018-2">');
const motionStyle = document.querySelector('link[href^="/assets/css/motion.css"]');
if (motionStyle) document.head.append(motionStyle);
else document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="/assets/css/motion.css?v=20261018-3">');
document.body.insertAdjacentHTML("beforeend", `
<div class="toast" id="toast" role="status"></div>
<dialog id="settings"><form method="dialog"><div class="mc-menu-screen">
  <h2 class="mc-menu-title">遊戲選單</h2>
  <div class="mc-menu-grid">
    <button type="button" class="mc-menu-button wide green" data-settings-resume>返回網站</button>
    <button type="button" class="mc-menu-button" data-settings-sound>音樂與音效</button>
    <button type="button" class="mc-menu-button" data-settings-interface>介面設定</button>
    <button type="button" class="mc-menu-button" data-settings-discord>Discord 登入</button>
    <button type="button" class="mc-menu-button" data-settings-home>回到首頁</button>
  </div>
  <section class="mc-settings-panel" id="sound-panel">
    <h3>音樂與音效</h3>
    <div class="mc-settings-row"><div><b>背景音樂</b><small>背景 BGM</small></div><button type="button" class="mc-menu-button mc-settings-toggle" id="music-switch">開啟</button><span></span><input id="music-volume" type="range" min="0" max="100" value="18"><span class="mc-settings-value" id="music-value">18%</span></div>
    <div class="mc-settings-row"><div><b>介面音效</b><small>按鈕與選單音效</small></div><button type="button" class="mc-menu-button mc-settings-toggle" id="sound-switch">開啟</button><span></span><input id="sound-volume" type="range" min="0" max="100" value="45"><span class="mc-settings-value" id="sound-value">45%</span></div>
    <button type="button" class="mc-menu-button wide" data-settings-back>完成</button>
  </section>
  <section class="mc-settings-panel" id="interface-panel">
    <h3>介面設定</h3>
    <div class="mc-settings-row compact"><div><b>文字大小</b><small>標題與內文按比例調整</small></div><button type="button" class="mc-menu-button mc-settings-toggle" id="text-size-switch">標準</button></div>
    <div class="mc-settings-row compact"><div><b>文字樣式</b><small>網站文字的顯示方式</small></div><button type="button" class="mc-menu-button mc-settings-toggle" id="font-style-switch">像素風文字</button></div>
    <button type="button" class="mc-menu-button wide" data-settings-back>完成</button>
  </section>
</div></form></dialog>
<dialog id="auth" class="auth-dialog"><form method="dialog"><button class="dialog-close">×</button><div id="auth-content"></div></form></dialog>`);

const toast = (message) => {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove("show"), 1900);
};
const authResult = new URL(location.href);
const authNotice = { cancelled: "已取消 Discord 授權。", expired: "登入已過期，請重新嘗試。", failed: "Discord 登入暫時失敗，請稍後重試。" }[authResult.searchParams.get("auth")];
if (authNotice) {
  authResult.searchParams.delete("auth");
  history.replaceState(null, "", authResult.pathname + authResult.search + authResult.hash);
  queueMicrotask(() => toast(authNotice));
}

// Original site sounds are generated by scripts/generate-audio.py.
const AUDIO_PATHS = {
  click: "/audio/ui-click.wav",
  music: "/audio/background.wav"
};
const clickAudio = new Audio(AUDIO_PATHS.click);
const musicAudio = new Audio(AUDIO_PATHS.music);
clickAudio.preload = "none";
musicAudio.preload = "none";
musicAudio.loop = true;

let musicOn = localStorage.getItem("teacafe-music-on") !== "false";
let soundOn = localStorage.getItem("teacafe-sound-on") !== "false";
let musicVol = Number(localStorage.getItem("teacafe-music-vol") || 18);
let soundVol = Number(localStorage.getItem("teacafe-sound-vol") || 45);
let audioUnlocked = false;

function playAudio(audio, volume) {
  if (!audio || volume <= 0) return;
  audio.volume = Math.max(0, Math.min(1, volume / 100));
  try {
    audio.currentTime = 0;
    const promise = audio.play();
    if (promise?.catch) promise.catch(() => {});
  } catch {}
}
function clickSound() {
  if (soundOn) playAudio(clickAudio, soundVol);
}

function startMusic() {
  musicAudio.volume = Math.max(0, Math.min(1, musicVol / 100));
  const promise = musicAudio.play();
  if (promise?.catch) promise.catch(() => {});
}
function stopMusic() {
  musicAudio.pause();
}
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  if (musicOn) startMusic();
}
document.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
document.addEventListener("keydown", unlockAudio, { once: true });
document.addEventListener("click", (event) => {
  if (event.target.closest("button,a") && !event.target.closest("[data-no-click-sound]")) clickSound();
});

// Functional interface settings.
const textScaleOptions = ["normal", "125", "150", "200"];
const savedScale = localStorage.getItem("teacafe-text-size");
let textScale = textScaleOptions.includes(savedScale) ? savedScale : savedScale === "large" ? "125" : "normal";
let pixelText = localStorage.getItem("teacafe-font-style") !== "normal";
function applyInterfaceSettings() {
  document.documentElement.dataset.textSize = textScale;
  document.documentElement.dataset.fontStyle = pixelText ? "pixel" : "normal";
  const textButton = $("#text-size-switch");
  const fontButton = $("#font-style-switch");
  if (textButton) textButton.textContent = textScale === "normal" ? "標準" : `${textScale}%`;
  if (fontButton) fontButton.textContent = pixelText ? "像素風文字" : "一般文字";
}
applyInterfaceSettings();

const settings = $("#settings");
const auth = $("#auth");
$("[data-settings]")?.addEventListener("click", () => settings.showModal());
$$('[data-mobile]').forEach((button) => button.addEventListener("click", () => $(".topnav")?.classList.toggle("mobile-open")));
const closeSettingPanels = () => {
  $$('.mc-settings-panel').forEach((panel) => panel.classList.remove('open'));
  $$('[data-settings-sound],[data-settings-interface]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
};
const toggleSettingPanel = (selector, button) => {
  const panel = $(selector);
  const opening = !panel?.classList.contains('open');
  closeSettingPanels();
  if (opening) { panel.classList.add('open'); button.setAttribute('aria-expanded', 'true'); }
};
$('[data-settings-resume]')?.addEventListener('click', () => settings.close());
$('[data-settings-sound]')?.addEventListener('click', (event) => toggleSettingPanel('#sound-panel', event.currentTarget));
$('[data-settings-interface]')?.addEventListener('click', (event) => toggleSettingPanel('#interface-panel', event.currentTarget));
$$('[data-settings-back]').forEach((button) => button.addEventListener('click', closeSettingPanels));
$('[data-settings-home]')?.addEventListener('click', () => location.href = '/');

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const openDialog = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (openDialog && openDialog !== settings && openDialog !== auth) return;
  event.preventDefault();
  if (settings.open) { closeSettingPanels(); settings.close(); return; }
  if (auth?.open) { auth.close(); return; }
  settings.showModal();
}, { capture: true });

const musicSwitch = $("#music-switch");
const soundSwitch = $("#sound-switch");
const musicVolume = $("#music-volume");
const soundVolume = $("#sound-volume");
if (musicVolume) musicVolume.value = musicVol;
if (soundVolume) soundVolume.value = soundVol;
if (musicSwitch) musicSwitch.textContent = musicOn ? "開啟" : "關閉";
if (soundSwitch) soundSwitch.textContent = soundOn ? "開啟" : "關閉";
$("#music-value").textContent = musicVol + "%";
$("#sound-value").textContent = soundVol + "%";

musicSwitch?.addEventListener("click", () => {
  musicOn = !musicOn;
  localStorage.setItem("teacafe-music-on", String(musicOn));
  musicSwitch.textContent = musicOn ? "開啟" : "關閉";
  if (musicOn && audioUnlocked) startMusic(); else stopMusic();
});
soundSwitch?.addEventListener("click", () => {
  soundOn = !soundOn;
  localStorage.setItem("teacafe-sound-on", String(soundOn));
  soundSwitch.textContent = soundOn ? "開啟" : "關閉";
});
musicVolume?.addEventListener("input", (event) => {
  musicVol = Number(event.target.value);
  $("#music-value").textContent = musicVol + "%";
  localStorage.setItem("teacafe-music-vol", String(musicVol));
  musicAudio.volume = musicVol / 100;
});
soundVolume?.addEventListener("input", (event) => {
  soundVol = Number(event.target.value);
  $("#sound-value").textContent = soundVol + "%";
  localStorage.setItem("teacafe-sound-vol", String(soundVol));
});
$("#text-size-switch")?.addEventListener("click", () => {
  textScale = textScaleOptions[(textScaleOptions.indexOf(textScale) + 1) % textScaleOptions.length];
  localStorage.setItem("teacafe-text-size", textScale);
  applyInterfaceSettings();
});
$("#font-style-switch")?.addEventListener("click", () => {
  pixelText = !pixelText;
  localStorage.setItem("teacafe-font-style", pixelText ? "pixel" : "normal");
  applyInterfaceSettings();
});

$$('[data-copy]').forEach((button) => button.addEventListener("click", async () => {
  const value = button.dataset.copy === "SERVER_IP" ? "mc.teacafe.xyz" : button.dataset.copy;
  try { await navigator.clipboard.writeText(value); toast(value + " 已複製"); }
  catch { toast(value); }
}));

async function loadServerStatus() {
  const status = $("[data-server-status]");
  if (!status) return;
  try {
    const response = await fetch("/api/server/status", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("status");
    const data = await response.json();
    const address = $("[data-server-address]");
    if (address) address.textContent = "mc.teacafe.xyz";
    status.classList.remove("status-loading", "status-offline", "status-online");
    if (data.online) {
      status.textContent = "● 線上";
      status.classList.add("status-online");
      $("[data-server-players]").textContent = `${data.players.online} / ${data.players.max}`;
      $("[data-server-version]").textContent = data.version || "未知";
      const panel = $("[data-online-player-panel]");
      const heads = $("[data-online-player-heads]");
      const players = Array.isArray(data.players?.list) ? data.players.list : [];
      if (panel && heads) {
        heads.replaceChildren(...players.map((player) => {
          const image = document.createElement("img");
          image.className = "online-player-head";
          image.src = `https://mc-heads.net/avatar/${encodeURIComponent(player.uuid)}/40`;
          image.alt = "";
          image.width = 40;
          image.height = 40;
          image.loading = "lazy";
          image.decoding = "async";
          return image;
        }));
        panel.hidden = players.length === 0;
      }
    } else {
      status.textContent = "● 離線";
      status.classList.add("status-offline");
      $("[data-server-players]").textContent = "0 / 0";
      $("[data-server-version]").textContent = "26.2";
      $("[data-online-player-heads]")?.replaceChildren();
      if ($("[data-online-player-panel]")) $("[data-online-player-panel]").hidden = true;
    }
  } catch {
    status.textContent = "狀態無法取得";
    status.classList.remove("status-loading");
    status.classList.add("status-offline");
  }
}
loadServerStatus();

const TEACAFE_STARTED_AT = Date.parse("2026-08-07T00:00:00+08:00");
function updateServerUptime() {
  const el = $("[data-server-uptime]");
  if (!el) return;
  const total = Math.max(0, Math.floor((Date.now() - TEACAFE_STARTED_AT) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor(total % 86400 / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const seconds = total % 60;
  el.textContent = `${days}天 ${String(hours).padStart(2, "0")}小時 ${String(minutes).padStart(2, "0")}分鐘 ${String(seconds).padStart(2, "0")}秒`;
}
updateServerUptime();
setInterval(updateServerUptime, 1000);

let authState = { authenticated: false };
const authName = (user) => user?.global_name || user?.username || "Discord 使用者";
async function loadAuth() {
  try {
    const response = await fetch("/api/auth/me", { headers: { Accept: "application/json" } });
    authState = response.ok ? await response.json() : { authenticated: false };
  } catch {
    authState = { authenticated: false };
  }
  $$('[data-official-link]').forEach(link => { link.hidden = !authState.is_official; });
  const menuAuth = $('[data-settings-discord]');
  if (menuAuth) menuAuth.textContent = authState.authenticated ? 'Discord 帳號' : 'Discord 登入';
  return authState;
}
const authReady = loadAuth();

async function openAuth(event) {
  event?.preventDefault();
  await authReady;
  if (!authState.authenticated) {
    location.href = "/api/auth/login?return=" + encodeURIComponent(location.pathname + location.search);
    return;
  }
  const user = authState.user;
  const content = $("#auth-content");
  content.replaceChildren();
  if (user.avatar_url) {
    const avatar = document.createElement("img");
    avatar.className = "discord-avatar";
    avatar.src = user.avatar_url;
    avatar.alt = "";
    content.append(avatar);
  }
  const title = document.createElement("h2");
  title.textContent = authName(user);
  content.append(title);
  const handle = document.createElement("p");
  handle.textContent = "@" + user.username;
  content.append(handle);
  const levelRow = document.createElement("div");
  levelRow.className = "profile-level-row";
  const levelTitle = document.createElement("span");
  levelTitle.textContent = "TeaCafe 社群等級";
  const levelBadge = document.createElement("b");
  levelBadge.textContent = "Lv.0";
  levelRow.append(levelTitle, levelBadge);
  content.append(levelRow);
  const progress = document.createElement("div");
  progress.className = "profile-exp-track";
  progress.append(document.createElement("span"));
  content.append(progress);
  const explanation = document.createElement("p");
  explanation.className = "profile-level-explanation";
  explanation.textContent = "0 / 100 EXP · 論壇發文與相冊分享在後端啟用後可累積經驗。";
  content.append(explanation);
  if (authState.is_official) {
    const review = document.createElement("a");
    review.href = "/admin";
    review.className = "mc-button official-profile-link";
    review.textContent = "管理後台";
    content.append(review);
  }
  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "mc-button";
  logout.textContent = "登出";
  content.append(logout);
  auth.showModal();
  logout.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    location.reload();
  });
}
// Shared read-only auth state for front-end components.
window.TeaCafeAuth = { ready: authReady, open: openAuth, getState: () => authState };
window.addEventListener('teacafe-toast', (event) => toast(String(event.detail || '')));
$('[data-settings-discord]')?.addEventListener('click', (event) => { settings.close(); openAuth(event); });
$$('.auth-required').forEach((button) => button.addEventListener("click", async (event) => {
  event.preventDefault();
  await authReady;
  if (!authState.authenticated) { openAuth(event); return; }
  toast("目前尚未開放購買");
}));

// Navigation is revealed only by moving the pointer upward into its hover band.
// Scrolling down hides the bar immediately, even while the pointer is over it.
const topbar = $(".topbar");
if (topbar) {
  let previousPointerY = null;
  let hideTimer = 0;
  const touchPointer = matchMedia('(hover: none), (pointer: coarse)');
  const showTopbar = () => {
    if (touchPointer.matches) return;
    clearTimeout(hideTimer);
    topbar.classList.remove('topbar-hidden');
  };
  const hideTopbar = (immediate = false) => {
    if (touchPointer.matches) return;
    clearTimeout(hideTimer);
    if (immediate) topbar.classList.add('topbar-hidden');
    else hideTimer = setTimeout(() => topbar.classList.add('topbar-hidden'), 850);
  };
  document.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || touchPointer.matches) return;
    const withinRevealBand = event.clientY <= Math.max(108, topbar.offsetHeight + 26);
    const movingUp = previousPointerY !== null && event.clientY < previousPointerY - 1;
    if (withinRevealBand && movingUp) showTopbar();
    else if (!withinRevealBand && !topbar.contains(event.target)) hideTopbar();
    previousPointerY = event.clientY;
  }, {passive:true});
  topbar.addEventListener('pointerleave', () => hideTopbar());
  document.addEventListener('wheel', event => {
    if (event.deltaY > 0) hideTopbar(true);
  }, {passive:true});
  let priorScroll = window.scrollY;
  addEventListener('scroll', () => {
    if (window.scrollY > priorScroll + 2) hideTopbar(true);
    priorScroll = window.scrollY;
  }, {passive:true});
  topbar.addEventListener('focusin', () => topbar.classList.remove('topbar-hidden'));
  document.addEventListener('keydown', event => {
    if (event.altKey && event.key.toLowerCase() === 'm') {
      event.preventDefault();
      topbar.classList.toggle('topbar-hidden');
    }
  });
}

// D1 is the primary content source. Static JSON stays as a setup preview.
async function loadNews() {
  const list = $("[data-news-list]");
  if (!list) return;
  try {
    const api = await fetch('/api/news', { headers: { Accept: 'application/json' } });
    let data = api.ok ? await api.json() : null;
    if (!data?.configured) {
      const fallback = await fetch('/data/news.json', { cache: 'no-cache' });
      if (!fallback.ok) throw new Error('news');
      data = await fallback.json();
    }
    const items = Array.isArray(data.items) ? data.items : [];
    list.replaceChildren(...items.map((item) => {
      const article = document.createElement("article");
      article.className = "notice-row";
      const time = document.createElement("time");
      const date = new Date(item.published_at);
      time.dateTime = item.published_at || "";
      time.textContent = Number.isNaN(date.getTime()) ? "公告" : date.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
      const copy = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = item.title || "公告";
      const body = document.createElement("p");
      body.textContent = item.body || "";
      copy.append(title, body);
      article.append(time, copy);
      if (item.discord_url) {
        const link = document.createElement("a");
        link.className = "mc-button compact-button";
        link.href = item.discord_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Discord 原文";
        article.append(link);
      }
      return article;
    }));
  } catch {
    const article = document.createElement("article");
    article.className = "notice-row";
    article.innerHTML = "<time>公告</time><div><h3>暫時無法讀取公告</h3><p>請稍後重新整理。</p></div>";
    list.replaceChildren(article);
  }
}
loadNews();

async function loadWikiUpdates() {
  const host = $('[data-wiki-updates]');
  if (!host) return;
  try {
    const response = await fetch('/api/wiki/entries', { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const data = await response.json();
    if (!data.configured || !Array.isArray(data.entries) || !data.entries.length) return;
    host.replaceChildren();
    host.hidden = false;
    const title = document.createElement('h2'); title.textContent = '官方補充條目';
    host.append(title);
    for (const entry of data.entries) {
      const section = document.createElement('section'); section.className = 'wiki-live-entry';
      section.dataset.keywords = `${entry.title} ${entry.section} ${entry.summary} ${entry.body}`.toLowerCase();
      const heading = document.createElement('h3'); heading.textContent = entry.title;
      const summary = document.createElement('small'); summary.textContent = entry.summary || '';
      const body = document.createElement('p'); body.textContent = entry.body;
      section.append(heading, summary, body);
      if (entry.source_note) {
        const source = document.createElement('small'); source.textContent = `資料來源：${entry.source_note}`;
        section.append(source);
      }
      host.append(section);
    }
  } catch {}
}
loadWikiUpdates();

async function loadPassSummary() {
  const host = $('[data-pass-summary]');
  if (!host) return;
  try {
    const response = await fetch('/api/pass/summary');
    if (!response.ok) return;
    const data = await response.json();
    if (data.season) host.textContent = `${data.season.title} · 最高 ${data.season.max_level} 級 · 每級 ${data.season.xp_per_level} 經驗`;
  } catch {}
}
loadPassSummary();

const search = $("#wiki-search");
if (search) search.addEventListener("input", (event) => {
  const query = event.target.value.trim().toLowerCase();
  $$(".wiki-card").forEach((card) => {
    card.hidden = Boolean(query && !card.dataset.keywords.toLowerCase().includes(query) && !card.textContent.toLowerCase().includes(query));
  });
  $$(".wiki-live-entry").forEach((entry) => { entry.hidden = Boolean(query && !entry.dataset.keywords.includes(query)); });
});

if (page === "wiki.html") {
  const panel = $(".content-panel");
  let chapter = null;
  if (panel) {
    [...panel.childNodes].forEach((node) => {
      if (node.nodeType === 1 && node.matches("h2")) {
        chapter = document.createElement("section");
        chapter.className = "chapter-screen snap-screen";
        panel.append(chapter);
      }
      if (chapter) chapter.append(node);
    });
  }
  const chapterHeadings = $$('.content-panel .chapter-screen > h2[id]');
  const chapterLinks = $$('.wiki-page .sidebar-links a[href^="#"]');
  if (chapterHeadings.length && chapterLinks.length) {
    let activeId = '';
    const updateWikiIndex = () => {
      const readingLine = innerHeight * 0.34;
      let current = chapterHeadings[0];
      for (const heading of chapterHeadings) {
        if (heading.getBoundingClientRect().top <= readingLine) current = heading;
      }
      if (current.id === activeId) return;
      activeId = current.id;
      for (const link of chapterLinks) {
        const selected = link.getAttribute('href') === `#${activeId}`;
        link.classList.toggle('scroll-active', selected);
        if (selected) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    };
    addEventListener('scroll', updateWikiIndex, { passive: true });
    addEventListener('resize', updateWikiIndex, { passive: true });
    chapterLinks.forEach(link => link.addEventListener('click', () => setTimeout(updateWikiIndex, 350)));
    updateWikiIndex();
  }
}

// Keep the rule index pressed on the section closest to the reading position.
const ruleSections = $$('[data-rule-section]');
const ruleLinks = $$('[data-rule-link]');
if (ruleSections.length) {
  const updateRuleIndex = () => {
    const target = innerHeight * 0.32;
    let active = ruleSections[0];
    let distance = Infinity;
    ruleSections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const d = rect.top <= target && rect.bottom >= target ? 0 : Math.min(Math.abs(rect.top - target), Math.abs(rect.bottom - target));
      if (d < distance) { distance = d; active = section; }
    });
    ruleLinks.forEach((link) => {
      const selected = link.dataset.ruleLink === active.id;
      link.classList.toggle("scroll-active", selected);
      if (selected) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current");
    });
  };
  addEventListener("scroll", updateRuleIndex, { passive: true });
  addEventListener("resize", updateRuleIndex, { passive: true });
  updateRuleIndex();
}

const motionScript = document.createElement('script');
motionScript.src = '/assets/js/motion.js?v=20261018-3';
document.body.append(motionScript);

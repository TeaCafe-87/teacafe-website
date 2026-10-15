const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
const reducedBySystem = matchMedia("(prefers-reduced-motion: reduce)").matches;

const nav = [
  ["index.html", "主頁"],
  ["rules.html", "規則"],
  ["news.html", "公告"],
  ["gallery.html", "玩家相冊"],
  ["forum.html", "論壇"],
  ["wiki.html", "Wiki"]
];

const header = $("[data-header]");
if (header) {
  header.innerHTML = `<header class="topbar topbar-hidden ${page === "index.html" ? "home-topbar" : ""}">
    <a class="brand" href="/"><span class="brand-block"></span><span><b>茶咖暖居</b><small>TEACAFE</small></span></a>
    <nav class="topnav">${nav.map(([url, name]) => `<a class="mc-nav ${page === url ? "active" : ""}" href="/${url}">${name}</a>`).join("")}</nav>
    <div class="top-tools">
      <button class="discord-button topbar-auth" data-auth>Discord 登入</button>
      <button class="mc-nav settings-button" data-settings aria-label="設定">⚙</button>
      <button class="mc-nav mobile-menu" data-mobile aria-label="選單">☰</button>
    </div>
  </header>`;
}

const footer = $("[data-footer]");
if (footer) {
  footer.innerHTML = `<footer class="site-footer">
    <a class="brand" href="/"><span class="brand-block"></span><span><b>茶咖暖居</b><small>TEACAFE</small></span></a>
    <nav><a href="/">主頁</a><a href="/rules.html">規則</a><a href="/news.html">公告</a><a href="/gallery.html">玩家相冊</a><a href="/forum.html">論壇</a><a href="/wiki.html">Wiki</a></nav>
  </footer>`;
}

document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="/assets/css/effects.css">');
document.body.insertAdjacentHTML("beforeend", `
<div class="toast" id="toast" role="status"></div>
<dialog id="settings"><form method="dialog"><div class="mc-menu-screen">
  <h2 class="mc-menu-title">遊戲選單</h2>
  <div class="mc-menu-grid">
    <button type="button" class="mc-menu-button wide green" data-settings-resume>返回網站</button>
    <button type="button" class="mc-menu-button" data-settings-sound>音樂與音效</button>
    <button type="button" class="mc-menu-button" data-settings-interface>介面設定</button>
    <button type="button" class="mc-menu-button discord" data-settings-discord>Discord</button>
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
    <div class="mc-settings-row compact"><div><b>文字大小</b><small>標題與內文同步調整</small></div><button type="button" class="mc-menu-button mc-settings-toggle" id="text-size-switch">標準</button></div>
    <div class="mc-settings-row compact"><div><b>介面動畫</b><small>頁面與選單移動效果</small></div><button type="button" class="mc-menu-button mc-settings-toggle" id="motion-switch">一般</button></div>
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

// Audio is wired to files under /audio. Copyrighted Minecraft audio is not bundled.
const AUDIO_PATHS = {
  click: "/audio/ui-click.ogg",
  music: "/audio/background.ogg"
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
let textLarge = localStorage.getItem("teacafe-text-size") === "large";
let motionReduced = localStorage.getItem("teacafe-motion") === "reduced" || reducedBySystem;
function applyInterfaceSettings() {
  document.documentElement.dataset.textSize = textLarge ? "large" : "normal";
  document.documentElement.dataset.motion = motionReduced ? "reduced" : "normal";
  const textButton = $("#text-size-switch");
  const motionButton = $("#motion-switch");
  if (textButton) textButton.textContent = textLarge ? "放大" : "標準";
  if (motionButton) motionButton.textContent = motionReduced ? "減少" : "一般";
}
applyInterfaceSettings();

const settings = $("#settings");
const auth = $("#auth");
$("[data-settings]")?.addEventListener("click", () => settings.showModal());
$$('[data-mobile]').forEach((button) => button.addEventListener("click", () => $(".topnav")?.classList.toggle("mobile-open")));
const closeSettingPanels = () => $$('.mc-settings-panel').forEach((panel) => panel.classList.remove('open'));
$('[data-settings-resume]')?.addEventListener('click', () => settings.close());
$('[data-settings-sound]')?.addEventListener('click', () => { closeSettingPanels(); $('#sound-panel')?.classList.add('open'); });
$('[data-settings-interface]')?.addEventListener('click', () => { closeSettingPanels(); $('#interface-panel')?.classList.add('open'); });
$$('[data-settings-back]').forEach((button) => button.addEventListener('click', closeSettingPanels));
$('[data-settings-home]')?.addEventListener('click', () => location.href = '/');
$('[data-settings-discord]')?.addEventListener('click', () => { settings.close(); $('[data-auth]')?.click(); });

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
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
  textLarge = !textLarge;
  localStorage.setItem("teacafe-text-size", textLarge ? "large" : "normal");
  applyInterfaceSettings();
});
$("#motion-switch")?.addEventListener("click", () => {
  motionReduced = !motionReduced;
  localStorage.setItem("teacafe-motion", motionReduced ? "reduced" : "normal");
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
  $$('[data-auth]').forEach((button) => {
    button.replaceChildren();
    button.classList.toggle("is-authenticated", Boolean(authState.authenticated));
    if (!authState.authenticated) {
      button.textContent = "Discord 登入";
      return;
    }
    const user = authState.user;
    if (user?.avatar_url) {
      const avatar = document.createElement("img");
      avatar.className = "topbar-auth-avatar";
      avatar.src = user.avatar_url;
      avatar.alt = "";
      button.append(avatar);
    }
    const copy = document.createElement("span");
    copy.className = "topbar-auth-copy";
    const name = document.createElement("b");
    name.textContent = authName(user);
    copy.append(name);
    const level = document.createElement("span");
    level.className = "topbar-level";
    level.textContent = "Lv.0";
    const caret = document.createElement("span");
    caret.className = "topbar-auth-caret";
    caret.textContent = "▾";
    button.append(copy, level, caret);
  });
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
$$('[data-auth]').forEach((button) => button.addEventListener("click", openAuth));
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
    else hideTimer = setTimeout(() => topbar.classList.add('topbar-hidden'), 90);
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

// News content is editable in /dist/data/news.json.
async function loadNews() {
  const list = $("[data-news-list]");
  if (!list) return;
  try {
    const response = await fetch("/data/news.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("news");
    const data = await response.json();
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

const search = $("#wiki-search");
if (search) search.addEventListener("input", (event) => {
  const query = event.target.value.trim().toLowerCase();
  $$(".wiki-card").forEach((card) => {
    card.hidden = Boolean(query && !card.dataset.keywords.toLowerCase().includes(query) && !card.textContent.toLowerCase().includes(query));
  });
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
}

// Gallery: API-backed collaborative carousel with static fallback.
const galleryRail = $("[data-gallery-rail]");
if (galleryRail) {
  const current = $("[data-gallery-current]");
  const total = $("[data-gallery-total]");
  const progress = $("[data-gallery-progress]");
  const prev = $("[data-gallery-prev]");
  const next = $("[data-gallery-next]");
  const commentsBox = $("[data-gallery-comments]");
  const commentCount = $("[data-gallery-comment-count]");
  const commentForm = $("[data-gallery-comment-form]");
  const createButton = $("[data-gallery-create]");
  const uploadDialog = $("#gallery-upload");
  const uploadForm = $("[data-gallery-upload-form]");
  const uploadStatus = $("[data-gallery-upload-status]");
  let posts = [];
  const COOLDOWN_MS = 48 * 60 * 60 * 1000;
  let activeIndex = 0;
  function cooldownUntil() {
    const userId = authState.user?.id;
    if (!userId) return 0;
    const stored = Number(localStorage.getItem(`teacafe-gallery-last-${userId}`) || 0);
    const ownPosts = posts.filter(post => String(post.author_id || '') === String(userId));
    const lastOnline = Math.max(0, ...ownPosts.map(post => +new Date(post.created_at) || 0));
    return Math.max(stored, lastOnline) + COOLDOWN_MS;
  }
  function getCooldownRemaining() {
    const userId = authState.user?.id;
    if (!userId) return 0;
    return Math.max(0, cooldownUntil() - Date.now());
  }
  function updateCooldownHint() {
    const hint = $('[data-gallery-cooldown]');
    if (!hint) return;
    const left = getCooldownRemaining();
    if (!left) { hint.textContent = '每 48 小時最多發布一張照片。'; return; }
    const hours = Math.floor(left / 3600000);
    const minutes = Math.ceil(left % 3600000 / 60000);
    hint.textContent = `距離下次可發布約 ${hours} 小時 ${minutes} 分鐘（前端提示）`;
  }
  let galleryConfigured = false;
  let commentLoadToken = 0;
  let drag = null;
  let dragFrame = 0;
  let pendingScrollLeft = 0;

  const formatTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  function makeSlide(post) {
    const article = document.createElement("article");
    article.className = "gallery-slide";
    article.dataset.postId = post.id;

    const media = document.createElement("div");
    media.className = "gallery-shot";
    const image = document.createElement("img");
    image.src = post.image_url;
    image.alt = post.title || "茶咖暖居遊戲畫面";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.remove();
      media.classList.add("image-missing");
      const label = document.createElement("span");
      label.textContent = post.title || "TeaCafe";
      media.append(label);
    }, { once: true });
    media.append(image);

    const meta = document.createElement("div");
    meta.className = "gallery-caption";
    const author = document.createElement("div");
    author.className = "gallery-author";
    const avatar = document.createElement("img");
    avatar.src = post.author_avatar_url || "/image/favicon.svg";
    avatar.alt = "";
    const who = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = post.author_name || post.author_username || "TeaCafe";
    const time = document.createElement("time");
    time.dateTime = post.created_at || "";
    time.textContent = formatTime(post.created_at);
    const level = document.createElement('span');
    level.className = 'level-pill';
    level.textContent = `Lv.${Math.max(0, Number(post.level) || 0)}`;
    who.append(name, level, time);
    author.append(avatar, who);

    const text = document.createElement("div");
    text.className = "gallery-caption-copy";
    const title = document.createElement("h2");
    title.textContent = post.title || "未命名照片";
    const body = document.createElement("p");
    body.textContent = post.body || "";
    text.append(title, body);
    meta.append(author, text);
    article.append(media, meta);
    return article;
  }

  function nearestIndex(scrollLeft = galleryRail.scrollLeft) {
    if (!posts.length) return 0;
    let best = 0;
    let distance = Infinity;
    const target = scrollLeft + galleryRail.clientWidth / 2;
    $$(".gallery-slide", galleryRail).forEach((slide, index) => {
      const center = slide.offsetLeft + slide.offsetWidth / 2;
      const d = Math.abs(center - target);
      if (d < distance) { distance = d; best = index; }
    });
    return best;
  }

  function updateGalleryUi(loadCommentsNow = false) {
    activeIndex = nearestIndex();
    if (current) current.textContent = String(posts.length ? activeIndex + 1 : 0).padStart(2, "0");
    if (total) total.textContent = String(posts.length).padStart(2, "0");
    if (progress) progress.style.width = posts.length ? `${((activeIndex + 1) / posts.length) * 100}%` : "0%";
    if (prev) prev.disabled = activeIndex <= 0;
    if (next) next.disabled = activeIndex >= posts.length - 1;
    if (loadCommentsNow) loadComments(posts[activeIndex]);
  }

  function goTo(index, behavior = "smooth") {
    const slides = $$(".gallery-slide", galleryRail);
    const clamped = Math.max(0, Math.min(slides.length - 1, index));
    const slide = slides[clamped];
    if (!slide) return;
    galleryRail.scrollTo({
      left: slide.offsetLeft - Math.max(0, (galleryRail.clientWidth - slide.offsetWidth) / 2),
      behavior: motionReduced ? "auto" : behavior
    });
  }

  async function loadComments(post) {
    const token = ++commentLoadToken;
    commentsBox.replaceChildren();
    if (!post) { if (commentCount) commentCount.textContent = ""; return; }
    if (!galleryConfigured) {
      if (commentCount) commentCount.textContent = "";
      commentForm?.querySelector("textarea")?.setAttribute("disabled", "");
      commentForm?.querySelector("button")?.setAttribute("disabled", "");
      return;
    }
    commentForm?.querySelector("textarea")?.removeAttribute("disabled");
    commentForm?.querySelector("button")?.removeAttribute("disabled");
    try {
      const response = await fetch(`/api/gallery/comments?post=${encodeURIComponent(post.id)}`, { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (token !== commentLoadToken) return;
      const comments = Array.isArray(data.comments) ? data.comments : [];
      if (commentCount) commentCount.textContent = comments.length ? `${comments.length} 則` : "0 則";
      if (!comments.length) {
        const empty = document.createElement('p');
        empty.className = 'gallery-comments-empty';
        empty.textContent = '還沒有留言。';
        commentsBox.replaceChildren(empty);
        return;
      }
      commentsBox.replaceChildren(...comments.map((comment) => {
        const row = document.createElement("article");
        row.className = "gallery-comment";
        const avatar = document.createElement("img");
        avatar.src = comment.author_avatar_url || "/image/favicon.svg";
        avatar.alt = "";
        const content = document.createElement("div");
        const line = document.createElement("p");
        line.className = 'social-comment-text';
        const name = document.createElement("strong");
        name.textContent = comment.author_name || comment.author_username || "Discord 使用者";
        line.append(name, document.createTextNode('  ' + comment.body));
        const time = document.createElement("time");
        time.dateTime = comment.created_at || '';
        time.textContent = formatTime(comment.created_at);
        content.append(line, time);
        row.append(avatar, content);
        return row;
      }));
    } catch {
      if (token === commentLoadToken) commentsBox.replaceChildren();
    }
  }

  async function loadGallery() {
    let data = null;
    try {
      const response = await fetch("/api/gallery/posts", { headers: { Accept: "application/json" } });
      if (response.ok) data = await response.json();
    } catch {}
    galleryConfigured = Boolean(data?.configured);
    posts = Array.isArray(data?.posts) ? data.posts : [];

    if (!posts.length) {
      try {
        const fallback = await fetch("/data/gallery.json", { cache: "no-cache" });
        const fallbackData = await fallback.json();
        posts = Array.isArray(fallbackData.posts) ? fallbackData.posts : [];
      } catch { posts = []; }
    }

    galleryRail.replaceChildren(...posts.map(makeSlide));
    updateCooldownHint();
    activeIndex = 0;
    requestAnimationFrame(() => {
      updateGalleryUi(true);
      goTo(0, "auto");
    });
  }

  let scrollTimer;
  galleryRail.addEventListener("scroll", () => {
    cancelAnimationFrame(dragFrame);
    dragFrame = requestAnimationFrame(() => updateGalleryUi(false));
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => updateGalleryUi(true), 130);
  }, { passive: true });
  addEventListener("resize", () => updateGalleryUi(false), { passive: true });
  prev?.addEventListener("click", () => goTo(activeIndex - 1));
  next?.addEventListener("click", () => goTo(activeIndex + 1));

  galleryRail.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startScroll: galleryRail.scrollLeft,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocity: 0
    };
    pendingScrollLeft = galleryRail.scrollLeft;
    galleryRail.classList.add("dragging");
    galleryRail.setPointerCapture(event.pointerId);
  });
  galleryRail.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastTime);
    drag.velocity = (event.clientX - drag.lastX) / dt;
    drag.lastX = event.clientX;
    drag.lastTime = now;
    pendingScrollLeft = drag.startScroll - (event.clientX - drag.startX);
    if (!dragFrame) {
      dragFrame = requestAnimationFrame(() => {
        galleryRail.scrollLeft = pendingScrollLeft;
        dragFrame = 0;
      });
    }
  });
  const finishDrag = (event) => {
    if (!drag || (event?.pointerId != null && event.pointerId !== drag.id)) return;
    const projected = galleryRail.scrollLeft - drag.velocity * 180;
    const targetIndex = nearestIndex(projected);
    drag = null;
    galleryRail.classList.remove("dragging");
    goTo(targetIndex);
  };
  galleryRail.addEventListener("pointerup", finishDrag);
  galleryRail.addEventListener("pointercancel", finishDrag);
  galleryRail.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") { event.preventDefault(); goTo(activeIndex + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); goTo(activeIndex - 1); }
  });

  createButton?.addEventListener("click", async () => {
    await authReady;
    if (!authState.authenticated) {
      location.href = "/api/auth/login?return=" + encodeURIComponent(location.pathname);
      return;
    }
    if (getCooldownRemaining() > 0) {
      updateCooldownHint();
      toast('目前尚未達到下一次照片發布時間。');
      return;
    }
    if (!galleryConfigured) {
      toast("相冊後端尚未設定");
      return;
    }
    uploadDialog.showModal();
  });
  $("[data-gallery-upload-close]")?.addEventListener("click", () => uploadDialog.close());
  uploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await authReady;
    if (!authState.authenticated) { openAuth(event); return; }
    uploadStatus.textContent = "上傳中…";
    const formData = new FormData(uploadForm);
    try {
      const response = await fetch("/api/gallery/posts", { method: "POST", body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 503) throw new Error("相冊儲存空間尚未設定");
        if (response.status === 413) throw new Error("圖片大小超過 12 MB");
        throw new Error("發布失敗");
      }
      if (authState.user?.id) {
        localStorage.setItem(`teacafe-gallery-last-${authState.user.id}`, String(Date.now()));
      }
      uploadForm.reset();
      uploadDialog.close();
      uploadStatus.textContent = "";
      await loadGallery();
      toast("照片已發布");
    } catch (error) {
      uploadStatus.textContent = error.message || "發布失敗";
    }
  });

  commentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const post = posts[activeIndex];
    if (!post) return;
    await authReady;
    if (!authState.authenticated) {
      location.href = "/api/auth/login?return=" + encodeURIComponent(location.pathname);
      return;
    }
    const textarea = commentForm.querySelector("textarea");
    const body = textarea.value.trim();
    if (!body) return;
    const response = await fetch("/api/gallery/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: post.id, body })
    });
    if (response.ok) {
      textarea.value = "";
      await loadComments(post);
      toast("留言已送出");
    } else if (response.status === 503) {
      toast("相冊資料庫尚未設定");
    } else {
      toast("留言失敗");
    }
  });

  loadGallery();
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

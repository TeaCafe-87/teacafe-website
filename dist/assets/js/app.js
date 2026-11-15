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
  header.innerHTML = `<header class="topbar topbar-hidden">
    <a class="brand" href="/"><img class="brand-icon" src="/image/server_icon.png" alt=""><span><b>茶咖暖居</b><small>TEACAFE</small></span></a>
    <nav class="topnav">${nav.map(([url, name]) => `<a class="mc-nav ${page === url ? "active" : ""}" href="/${url}">${name}</a>`).join("")}<details class="nav-more"><summary class="mc-nav">更多</summary><div><a href="/supporters.html">感謝支持</a><a href="/careers.html">職業指南</a><a href="/market.html">月映茶行</a><a data-official-link href="/admin" hidden>管理後台</a></div></details></nav>
    <div class="top-tools">
      <a class="discord-invite" href="https://discord.gg/FHCSjfD9Fq" target="_blank" rel="noopener noreferrer" aria-label="加入茶咖暖居 Discord 伺服器" title="加入 Discord 伺服器"><img src="/image/discord.svg" alt=""></a>
      <button class="topbar-music-toggle" data-music-mute type="button" aria-label="靜音背景音樂" aria-pressed="false" title="背景音樂"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="speaker-body" d="M3 9v6h4l5 4V5L7 9H3Z"/><path class="speaker-on" d="M16 8a6 6 0 0 1 0 8m2-11a10 10 0 0 1 0 14"/><path class="speaker-off" d="m16 9 5 6m0-6-5 6"/></svg></button>
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
const cinematicStyle = document.querySelector('link[href^="/assets/css/teacafe-cinematic.css"]');
if (cinematicStyle) document.head.append(cinematicStyle);
if (document.body.classList.contains('moderation-page')) document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/assets/css/admin-copy.css?v=20261019-2">');
const adminCopyStyle = document.querySelector('link[href^="/assets/css/admin-copy.css"]');
if (adminCopyStyle) document.head.append(adminCopyStyle);
const homeInkStyle = document.querySelector('link[href^="/assets/css/home-ink.css"]');
if (homeInkStyle) document.head.append(homeInkStyle);
document.head.insertAdjacentHTML("beforeend", '<link rel="stylesheet" href="/assets/css/site-ui.css?v=20261115">');
document.body.insertAdjacentHTML("beforeend", `
<div class="toast" id="toast" role="status"></div>
<dialog id="settings" class="prm" aria-label="網站設定"><form method="dialog" class="prm-sheet">
  <header class="prm-head"><h2>設定</h2><button class="prm-x" value="close" aria-label="關閉設定" type="submit">×</button></header>
  <div class="prm-body">
  <section class="prm-group" aria-labelledby="prm-audio-h">
    <h3 id="prm-audio-h">音訊</h3>
    <div class="prm-row"><div class="prm-text"><b>背景音樂</b><small>Path to Lake Land</small></div><button type="button" class="prm-switch" id="music-switch" role="switch" aria-checked="true" aria-label="背景音樂"><span class="prm-knob"></span></button></div>
    <div class="prm-row prm-col"><div class="prm-text"><b>音量</b><small><span id="music-value">18</span>%</small></div><div class="prm-volume" data-volume-bars></div></div>
    <div class="prm-row"><div class="prm-text"><b>靜音</b><small>也可用右上角的喇叭圖示</small></div><button type="button" class="prm-switch" id="music-mute-switch" role="switch" aria-checked="false" aria-label="靜音"><span class="prm-knob"></span></button></div>
  </section>
  <section class="prm-group" aria-labelledby="prm-ui-h">
    <h3 id="prm-ui-h">介面</h3>
    <div class="prm-row"><div class="prm-text"><b>文字大小</b><small>標題與內文按比例調整</small></div><div class="prm-seg" id="text-size-seg" role="group" aria-label="文字大小"></div></div>
    <div class="prm-row"><div class="prm-text"><b>文字樣式</b></div><div class="prm-seg" id="font-style-seg" role="group" aria-label="文字樣式"></div></div>
    <div class="prm-row"><div class="prm-text"><b>頁面開場動畫</b><small>新版本首次造訪仍會播放一次</small></div><button type="button" class="prm-switch" id="intro-switch" role="switch" aria-checked="true" aria-label="頁面開場動畫"><span class="prm-knob"></span></button></div>
  </section>
  <section class="prm-group" aria-labelledby="prm-acct-h">
    <h3 id="prm-acct-h">帳號</h3>
    <div class="prm-row"><div class="prm-text"><b>Discord</b><small data-settings-auth>未登入</small></div><button type="button" class="prm-btn" data-settings-discord>登入</button></div>
  </section>
  <nav class="prm-foot"><a class="prm-link" href="/">回到首頁</a><button value="close" class="prm-btn prm-btn-dark" type="submit">完成</button></nav>
  </div>
</form></dialog>
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

let resumeMusicTime = Math.max(0, Number(sessionStorage.getItem("teacafe-music-time")) || 0);
const musicAudio = new Audio("/audio/path_to_lake_land.mp3");
musicAudio.preload = "none";
musicAudio.loop = true;

let musicOn = localStorage.getItem("teacafe-music-on") !== "false";
let musicMuted = localStorage.getItem("teacafe-music-muted") === "true";
let musicVol = Math.max(0, Math.min(100, Number(localStorage.getItem("teacafe-music-vol") ?? 18) || 0));
let audioUnlocked = false;
musicAudio.addEventListener("loadedmetadata", () => {
  if (resumeMusicTime > 0 && resumeMusicTime < musicAudio.duration - 1) musicAudio.currentTime = resumeMusicTime;
  resumeMusicTime = 0;
});
addEventListener("pagehide", () => {
  if (Number.isFinite(musicAudio.currentTime)) sessionStorage.setItem("teacafe-music-time", String(musicAudio.currentTime));
});

function startMusic() {
  musicAudio.volume = Math.max(0, Math.min(1, musicVol / 100));
  musicAudio.muted = musicMuted;
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

// Functional interface settings.
const textScaleOptions = ["normal", "125", "150", "200"];
const savedScale = localStorage.getItem("teacafe-text-size");
let textScale = textScaleOptions.includes(savedScale) ? savedScale : savedScale === "large" ? "125" : "normal";
let pixelText = localStorage.getItem("teacafe-font-style") === "pixel";
function applyInterfaceSettings() {
  document.documentElement.dataset.textSize = textScale;
  document.documentElement.dataset.fontStyle = pixelText ? "pixel" : "normal";
  $$('#text-size-seg [data-value]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.value === textScale)));
  $$('#font-style-seg [data-value]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.value === (pixelText ? "pixel" : "normal"))));
}
applyInterfaceSettings();

const settings = $("#settings");
const auth = $("#auth");
$("[data-settings]")?.addEventListener("click", () => settings.showModal());
$$('[data-mobile]').forEach((button) => button.addEventListener("click", () => $(".topnav")?.classList.toggle("mobile-open")));
settings?.addEventListener('click', (event) => { if (event.target === settings) settings.close(); });

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const openDialog = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (openDialog && openDialog !== settings && openDialog !== auth) return;
  event.preventDefault();
  if (settings.open) { settings.close(); return; }
  if (auth?.open) { auth.close(); return; }
  settings.showModal();
}, { capture: true });

// Volume bars: a fixed centre indicator with rolling digits over a row of bars
// that slides beneath it. Bars rise into a gentle peak around the indicator.
window.TeaVolumeBars = function (host, { min = 0, max = 100, value = 0, step = 5, onInput } = {}) {
  const BAR_GAP = 7;                       // px between bar centres
  const BAR_COUNT = 81;                    // odd, so one bar sits exactly under the pin
  const SPAN = (BAR_COUNT - 1) * BAR_GAP;  // px length of the whole scale
  const unitsPerPx = (max - min) / SPAN;
  const clampValue = (v) => Math.min(max, Math.max(min, v));
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";

  host.classList.add("vol");
  host.tabIndex = 0;
  host.setAttribute("role", "slider");
  host.setAttribute("aria-label", "音量");
  host.setAttribute("aria-valuemin", String(min));
  host.setAttribute("aria-valuemax", String(max));
  host.setAttribute("aria-orientation", "horizontal");
  const track = document.createElement("div");
  track.className = "vol-track";
  const bars = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const bar = document.createElement("span");
    bar.className = "vol-bar";
    track.append(bar);
    bars.push(bar);
  }
  const pin = document.createElement("div");
  pin.className = "vol-pin";
  const pill = document.createElement("div");
  pill.className = "vol-pill";
  const reels = [];
  for (let d = 0; d < 3; d++) {
    const digit = document.createElement("span");
    digit.className = "vol-digit";
    const reel = document.createElement("span");
    reel.className = "vol-reel";
    for (let n = 0; n < 10; n++) {
      const glyph = document.createElement("i");
      glyph.textContent = String(n);
      reel.append(glyph);
    }
    digit.append(reel);
    pill.append(digit);
    reels.push({ digit, reel });
  }
  const stem = document.createElement("span");
  stem.className = "vol-stem";
  pin.append(pill, stem);
  host.append(track, pin);

  let current = clampValue(Number(value) || 0);
  let shown = -1;
  let raf = 0, tweenRaf = 0, idleTimer = 0;

  function paintDigits() {
    const rounded = Math.round(current);
    if (rounded === shown) return;
    shown = rounded;
    const text = String(rounded).padStart(2, "0");
    const offset = 3 - text.length;
    reels.forEach(({ digit, reel }, index) => {
      const char = text[index - offset];
      digit.classList.toggle("off", char === undefined);
      if (char !== undefined) reel.style.transform = `translateY(-${Number(char)}em)`;
    });
    host.setAttribute("aria-valuenow", String(rounded));
    host.setAttribute("aria-valuetext", rounded + "%");
  }
  function paint() {
    raf = 0;
    const centre = host.clientWidth / 2;
    const offset = centre - ((current - min) / (max - min)) * SPAN;
    track.style.transform = `translateX(${offset.toFixed(2)}px)`;
    for (let i = 0; i < BAR_COUNT; i++) {
      const dx = offset + i * BAR_GAP - centre;
      const peak = Math.exp(-(dx * dx) / (2 * 90 * 90));
      bars[i].style.height = (8 + 26 * peak).toFixed(1) + "px";
      bars[i].style.opacity = (0.3 + 0.7 * Math.exp(-(dx * dx) / (2 * 170 * 170))).toFixed(2);
    }
    paintDigits();
  }
  const queuePaint = () => { if (!raf) raf = requestAnimationFrame(paint); };

  function setValue(next, { animate = false, notify = true } = {}) {
    next = clampValue(next);
    cancelAnimationFrame(tweenRaf);
    const finish = () => { if (notify && onInput) onInput(Math.round(current)); };
    if (!animate || reduced()) { current = next; queuePaint(); finish(); return; }
    const from = current, t0 = performance.now(), duration = 320;
    const frame = (now) => {
      const k = Math.min(1, (now - t0) / duration);
      current = from + (next - from) * (1 - Math.pow(1 - k, 3));
      paint();
      if (k < 1) tweenRaf = requestAnimationFrame(frame);
      else finish();
    };
    tweenRaf = requestAnimationFrame(frame);
  }

  // The pin expands while adjusting and settles back into a short centre bar.
  function expand() {
    clearTimeout(idleTimer);
    host.classList.add("vol-live");
  }
  function scheduleCollapse() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => host.classList.remove("vol-live"), 1100);
  }

  let dragId = null, startX = 0, startVal = 0, moved = false;
  host.addEventListener("pointerdown", (event) => {
    dragId = event.pointerId;
    try { host.setPointerCapture(dragId); } catch {}
    startX = event.clientX;
    startVal = current;
    moved = false;
    expand();
    event.preventDefault();
  });
  host.addEventListener("pointermove", (event) => {
    if (dragId !== event.pointerId) return;
    const dx = event.clientX - startX;
    if (Math.abs(dx) > 3) moved = true;
    if (moved) setValue(startVal - dx * unitsPerPx);
  });
  const endDrag = (event) => {
    if (dragId !== event.pointerId) return;
    try { host.releasePointerCapture(dragId); } catch {}
    dragId = null;
    if (!moved) {
      const rect = host.getBoundingClientRect();
      const fromCentre = event.clientX - (rect.left + rect.width / 2);
      setValue(startVal + fromCentre * unitsPerPx, { animate: true });
    }
    scheduleCollapse();
  };
  host.addEventListener("pointerup", endDrag);
  host.addEventListener("pointercancel", endDrag);
  host.addEventListener("keydown", (event) => {
    const moves = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: step * 2, PageDown: -step * 2 };
    let next = null;
    if (event.key in moves) next = Math.round(current) + moves[event.key];
    else if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    if (next === null) return;
    event.preventDefault();
    expand();
    setValue(next, { animate: true });
    scheduleCollapse();
  });
  host.addEventListener("blur", () => host.classList.remove("vol-live"));
  if (typeof ResizeObserver === "function") new ResizeObserver(queuePaint).observe(host);
  paint();
  return { set: (v) => setValue(v, { notify: false }), get: () => Math.round(current) };
};

const musicSwitch = $("#music-switch");
const muteSwitch = $("#music-mute-switch");
const topbarMute = $("[data-music-mute]");
const setSwitch = (el, on) => el && el.setAttribute("aria-checked", String(Boolean(on)));
function renderMusicMute() {
  musicAudio.muted = musicMuted;
  setSwitch(muteSwitch, musicMuted);
  if (topbarMute) {
    topbarMute.classList.toggle("is-muted", musicMuted);
    topbarMute.setAttribute("aria-label", musicMuted ? "取消靜音背景音樂" : "靜音背景音樂");
    topbarMute.setAttribute("aria-pressed", String(musicMuted));
  }
}
function toggleMusicMute() {
  musicMuted = !musicMuted;
  localStorage.setItem("teacafe-music-muted", String(musicMuted));
  renderMusicMute();
}
renderMusicMute();
topbarMute?.addEventListener("click", toggleMusicMute);
muteSwitch?.addEventListener("click", toggleMusicMute);
setSwitch(musicSwitch, musicOn);
musicSwitch?.addEventListener("click", () => {
  musicOn = !musicOn;
  localStorage.setItem("teacafe-music-on", String(musicOn));
  setSwitch(musicSwitch, musicOn);
  if (musicOn && audioUnlocked) startMusic(); else stopMusic();
});
const musicValueOut = $("#music-value");
if (musicValueOut) musicValueOut.textContent = String(musicVol);
const volumeHost = $("[data-volume-bars]");
if (volumeHost && window.TeaVolumeBars) window.TeaVolumeBars(volumeHost, {
  value: musicVol,
  onInput: (value) => {
    musicVol = value;
    if (musicValueOut) musicValueOut.textContent = String(value);
    localStorage.setItem("teacafe-music-vol", String(value));
    musicAudio.volume = value / 100;
  }
});
const introSwitch = $("#intro-switch");
let introEnabled = localStorage.getItem("teacafe-intro-enabled") !== "false";
setSwitch(introSwitch, introEnabled);
introSwitch?.addEventListener("click", () => {
  introEnabled = !introEnabled;
  localStorage.setItem("teacafe-intro-enabled", String(introEnabled));
  setSwitch(introSwitch, introEnabled);
});
function buildSegment(host, options, setter) {
  if (!host) return;
  host.replaceChildren(...options.map(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.value = value;
    button.textContent = label;
    button.addEventListener("click", () => { setter(value); applyInterfaceSettings(); });
    return button;
  }));
}
buildSegment($("#text-size-seg"), [["normal", "標準"], ["125", "125%"], ["150", "150%"], ["200", "200%"]], (value) => {
  textScale = value;
  localStorage.setItem("teacafe-text-size", value);
});
buildSegment($("#font-style-seg"), [["normal", "一般"], ["pixel", "像素"]], (value) => {
  pixelText = value === "pixel";
  localStorage.setItem("teacafe-font-style", value);
});
applyInterfaceSettings();

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
const uptimeEl = $("[data-server-uptime]");
const uptimeSeconds = () => Math.max(0, Math.floor((Date.now() - TEACAFE_STARTED_AT) / 1000));
function renderUptime(total) {
  const days = Math.floor(total / 86400);
  const hours = Math.floor(total % 86400 / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const seconds = total % 60;
  uptimeEl.textContent = `${days}天 ${String(hours).padStart(2, "0")}小時 ${String(minutes).padStart(2, "0")}分鐘 ${String(seconds).padStart(2, "0")}秒`;
}
if (uptimeEl) {
  // First paint counts up from a random earlier day to the real elapsed time, then ticks live.
  const tick = () => renderUptime(uptimeSeconds());
  let uptimeStarted = false;
  const beginUptime = () => {
    if (uptimeStarted) return;
    uptimeStarted = true;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";
    if (reduce) { tick(); setInterval(tick, 1000); return; }
    const from = Math.floor(uptimeSeconds() * (0.2 + Math.random() * 0.5));
    const started = performance.now();
    const duration = 2400;
    const frame = (now) => {
      const k = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - k, 4);
      renderUptime(Math.floor(from + (uptimeSeconds() - from) * eased));
      if (k < 1) requestAnimationFrame(frame);
      else setInterval(tick, 1000);
    };
    requestAnimationFrame(frame);
  };
  renderUptime(0);
  if ("IntersectionObserver" in window) {
    const uptimeWatch = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { uptimeWatch.disconnect(); beginUptime(); }
    }, { threshold: 0.4 });
    uptimeWatch.observe(uptimeEl);
  } else beginUptime();
}

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
authReady.then(() => {
  const stateOut = $("[data-settings-auth]");
  const authButton = $("[data-settings-discord]");
  if (!stateOut) return;
  if (authState.authenticated) {
    stateOut.textContent = `已登入：${authName(authState.user)}`;
    if (authButton) authButton.textContent = "帳號資訊";
  } else {
    stateOut.textContent = "未登入";
    if (authButton) authButton.textContent = "登入";
  }
});
window.addEventListener('teacafe-toast', (event) => toast(String(event.detail || '')));
$('[data-settings-discord]')?.addEventListener('click', (event) => { settings.close(); openAuth(event); });
$$('.auth-required').forEach((button) => button.addEventListener("click", async (event) => {
  event.preventDefault();
  await authReady;
  if (!authState.authenticated) { openAuth(event); return; }
  toast("目前尚未開放購買");
}));

// The navigation stays fixed after the opening reveal.
const topbar = $(".topbar");
if (topbar) {
  const showTopbar = () => {
    if (document.querySelector('.site-intro') && !document.body.classList.contains('site-nav-reveal')) return;
    if (!topbar.classList.contains('topbar-hidden')) return;
    topbar.classList.remove('topbar-hidden');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced') return;
    topbar.classList.remove('nav-revealing');
    void topbar.offsetWidth;
    topbar.classList.add('nav-revealing');
  };
  topbar.addEventListener('animationend', event => {
    if (event.animationName === 'tea-nav-reveal') topbar.classList.remove('nav-revealing');
  });
  window.teaRevealTopbar = showTopbar;
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
    const all = Array.isArray(data.items) ? data.items : [];
    // Optional data-news-limit lets the home page show only the newest few; the news page sets none.
    const limit = Number(list.dataset.newsLimit) > 0 ? Number(list.dataset.newsLimit) : all.length;
    const items = all.slice(0, limit);
    if (!items.length) {
      const empty = document.createElement("article");
      empty.className = "notice-row";
      empty.innerHTML = "<time>公告</time><div><h3>目前還沒有公告</h3><p>有新消息時會更新在這裡，也會同步到 Discord。</p></div>";
      list.replaceChildren(empty);
      list.setAttribute("aria-busy", "false");
      return;
    }
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
    list.setAttribute("aria-busy", "false");
  } catch {
    const article = document.createElement("article");
    article.className = "notice-row";
    article.innerHTML = "<time>公告</time><div><h3>暫時無法讀取公告</h3><p>請稍後重新整理。</p></div>";
    list.replaceChildren(article);
    list.setAttribute("aria-busy", "false");
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
  $$(".wiki-live-entry,.site-custom-section").forEach((entry) => { entry.hidden = Boolean(query && !entry.dataset.keywords.includes(query)); });
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
motionScript.src = '/assets/js/motion.js?v=20261019-2';
document.body.append(motionScript);

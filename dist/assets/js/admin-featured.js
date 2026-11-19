/* Admin: home featured wall, feature switches, and recent moderation decisions. */
(() => {
  'use strict';
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const toast = (message) => window.dispatchEvent(new CustomEvent('teacafe-toast', { detail: message }));
  const FEATURE_NAMES = { forum: '玩家論壇', gallery: '玩家相冊', wiki: '伺服器 Wiki', market: '月映茶行', featured: '首頁精選牆' };

  /* ---------- Featured wall manager ---------- */
  const featuredList = $('[data-featured-list]');
  const featuredStatus = $('[data-featured-status]');
  const pickGrid = $('[data-featured-pick]');
  const pickStatus = $('[data-featured-pick-status]');
  const pickMore = $('[data-featured-pick-more]');
  const pickDetails = $('[data-featured-pick-details]');
  let featuredIds = new Set();
  let pickCursor = null;
  let pickLoaded = false;

  async function act(body) {
    const response = await fetch('/api/admin/featured', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error('featured_action');
    return response.json();
  }

  function featuredCard(item) {
    const card = document.createElement('figure');
    card.className = 'admin-featured-card' + (item.broken ? ' af-broken' : '');
    card.style.margin = '0';
    const image = document.createElement('img');
    image.src = item.url; image.alt = ''; image.loading = 'lazy';
    const caption = document.createElement('figcaption');
    caption.textContent = item.broken ? '⚠ 來源貼文已隱藏或刪除' : (item.label || item.post_title || '未命名');
    const actions = document.createElement('div');
    actions.className = 'af-actions';
    const buttons = [
      ['↑', '上移', () => act({ action: 'move', media_id: item.media_id, direction: 'up' })],
      ['↓', '下移', () => act({ action: 'move', media_id: item.media_id, direction: 'down' })],
      ['標籤', '編輯標籤', async () => {
        const label = prompt('照片標籤（顯示在照片下方，可留空）', item.label || '');
        if (label === null) return null;
        return act({ action: 'label', media_id: item.media_id, label });
      }],
      ['移除', '從精選移除', async () => {
        if (!confirm('把這張照片從首頁精選移除？')) return null;
        return act({ action: 'remove', media_id: item.media_id });
      }]
    ];
    for (const [text, label, run] of buttons) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'mc-button'; button.textContent = text; button.title = label; button.setAttribute('aria-label', label);
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { if (await run() !== null) { await loadFeatured(); toast('已更新精選牆'); } }
        catch { toast('操作失敗，請再試一次。'); }
        button.disabled = false;
      });
      actions.append(button);
    }
    card.append(image, caption, actions);
    return card;
  }

  async function loadFeatured() {
    if (!featuredList) return;
    try {
      const response = await fetch('/api/admin/featured', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (response.status === 403) { featuredStatus.textContent = '需要官方身分才能管理精選牆。'; return; }
      if (!response.ok) throw new Error();
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      featuredIds = new Set(items.map((item) => item.media_id));
      featuredStatus.textContent = items.length ? `目前精選 ${items.length} 張照片。` : '還沒有精選照片，從下方挑選幾張吧。';
      featuredList.replaceChildren(...items.map(featuredCard));
    } catch { featuredStatus.textContent = '暫時無法讀取精選清單。'; }
  }

  function pickCard(post, media) {
    const card = document.createElement('figure');
    card.className = 'admin-featured-card';
    card.style.margin = '0';
    const image = document.createElement('img');
    image.src = media.url; image.alt = ''; image.loading = 'lazy';
    const caption = document.createElement('figcaption');
    caption.textContent = post.title || '未命名貼文';
    const actions = document.createElement('div');
    actions.className = 'af-actions';
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'mc-button green';
    const paint = () => {
      const picked = featuredIds.has(media.id);
      add.textContent = picked ? '已在精選' : '加入精選';
      add.disabled = picked;
    };
    paint();
    add.addEventListener('click', async () => {
      add.disabled = true;
      try { await act({ action: 'add', media_id: media.id }); featuredIds.add(media.id); await loadFeatured(); toast('已加入精選牆'); }
      catch { toast('加入失敗，照片可能已不存在。'); }
      paint();
    });
    actions.append(add);
    card.append(image, caption, actions);
    return card;
  }

  async function loadPicker(reset = false) {
    if (!pickGrid) return;
    if (reset) { pickGrid.replaceChildren(); pickCursor = null; }
    pickStatus.textContent = '讀取相冊貼文…';
    try {
      const url = new URL('/api/community/posts', location.origin);
      url.searchParams.set('kind', 'gallery');
      if (pickCursor) url.searchParams.set('cursor', pickCursor);
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const posts = Array.isArray(data.posts) ? data.posts : [];
      for (const post of posts) {
        for (const media of Array.isArray(post.media) ? post.media : []) {
          if (String(media.type || '').startsWith('image/')) pickGrid.append(pickCard(post, media));
        }
      }
      pickCursor = data.next_cursor || null;
      pickMore.hidden = !pickCursor;
      pickStatus.textContent = pickGrid.children.length ? '' : '相冊目前沒有可挑選的照片。';
    } catch { pickStatus.textContent = '暫時無法讀取相冊。'; }
  }
  pickDetails?.addEventListener('toggle', () => {
    if (pickDetails.open && !pickLoaded) { pickLoaded = true; loadPicker(true); }
  });
  pickMore?.addEventListener('click', () => loadPicker());
  $('[data-featured-refresh]')?.addEventListener('click', () => { loadFeatured(); if (pickLoaded) loadPicker(true); });

  /* ---------- Feature switches ---------- */
  const switchesHost = $('[data-switches]');
  const switchesStatus = $('[data-switches-status]');
  function switchRow(key, state) {
    const row = document.createElement('div');
    row.className = 'admin-feature-row';
    const name = document.createElement('b');
    name.textContent = FEATURE_NAMES[key] || key;
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'prm-switch'; toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(state.enabled));
    toggle.setAttribute('aria-label', `${FEATURE_NAMES[key] || key}開關`);
    toggle.append(Object.assign(document.createElement('span'), { className: 'prm-knob' }));
    const note = document.createElement('input');
    note.type = 'text'; note.maxLength = 200; note.value = state.note || '';
    note.placeholder = '暫停時顯示給玩家的說明（選填）';
    const save = document.createElement('button');
    save.type = 'button'; save.className = 'mc-button'; save.textContent = '儲存備註';
    async function push(enabled) {
      const response = await fetch('/api/admin/features', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature: key, enabled, note: note.value })
      });
      if (!response.ok) throw new Error();
      return response.json();
    }
    toggle.addEventListener('click', async () => {
      const next = toggle.getAttribute('aria-checked') !== 'true';
      toggle.disabled = true;
      try { await push(next); toggle.setAttribute('aria-checked', String(next)); toast(next ? '已重新開放' : '已暫停，玩家會看到暫停頁'); }
      catch { toast('切換失敗，請再試一次。'); }
      toggle.disabled = false;
    });
    save.addEventListener('click', async () => {
      save.disabled = true;
      try { await push(toggle.getAttribute('aria-checked') === 'true'); toast('備註已儲存'); }
      catch { toast('儲存失敗，請再試一次。'); }
      save.disabled = false;
    });
    row.append(name, toggle, note, save);
    return row;
  }
  async function loadSwitches() {
    if (!switchesHost) return;
    try {
      const response = await fetch('/api/admin/features', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (response.status === 403) { switchesStatus.textContent = '需要官方身分才能調整功能開關。'; return; }
      if (!response.ok) throw new Error();
      const data = await response.json();
      switchesStatus.textContent = '';
      switchesHost.replaceChildren(...Object.keys(FEATURE_NAMES).map((key) => switchRow(key, data.features?.[key] || { enabled: true, note: '' })));
    } catch { switchesStatus.textContent = '暫時無法讀取功能開關（資料庫可能還沒執行 0009 遷移）。'; }
  }

  /* ---------- Recent decisions ---------- */
  const decidedList = $('[data-decided-list]');
  const decidedStatus = $('[data-decided-status]');
  function decidedRow(post) {
    const row = document.createElement('div');
    row.className = 'admin-feature-row';
    const name = document.createElement('b');
    name.textContent = post.title || '未命名貼文';
    const meta = document.createElement('span');
    const kindName = post.kind === 'gallery' ? '相冊' : '論壇';
    meta.textContent = `${kindName}｜${post.author_name || post.author_username || '玩家'}｜${post.status === 'published' ? '✓ 已公開' : '✕ 已退回'}`;
    meta.style.color = post.status === 'published' ? '#8fd478' : '#e18474';
    const flip = document.createElement('button');
    flip.type = 'button'; flip.className = 'mc-button';
    flip.textContent = post.status === 'published' ? '改為退回' : '重新公開';
    flip.addEventListener('click', async () => {
      const decision = post.status === 'published' ? 'reject' : 'approve';
      if (!confirm(decision === 'reject' ? '把這篇改為退回？玩家頁面會立刻看不到它。' : '重新公開這篇貼文？')) return;
      flip.disabled = true;
      try {
        const response = await fetch('/api/community/moderation', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postId: post.id, decision, revise: true })
        });
        if (!response.ok) throw new Error();
        toast('已更新貼文狀態');
        await loadDecided();
      } catch { toast('操作失敗，請再試一次。'); flip.disabled = false; }
    });
    row.append(name, meta, flip);
    return row;
  }
  async function loadDecided() {
    if (!decidedList) return;
    try {
      const response = await fetch('/api/community/moderation?view=decided', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (response.status === 403) { decidedStatus.textContent = '需要官方身分。'; return; }
      if (!response.ok) throw new Error();
      const data = await response.json();
      const posts = Array.isArray(data.posts) ? data.posts : [];
      decidedStatus.textContent = posts.length ? '' : '還沒有處理過的投稿。';
      decidedList.replaceChildren(...posts.map(decidedRow));
    } catch { decidedStatus.textContent = '暫時無法讀取紀錄。'; }
  }
  $('[data-decided-refresh]')?.addEventListener('click', loadDecided);

  loadFeatured();
  loadSwitches();
  loadDecided();
})();

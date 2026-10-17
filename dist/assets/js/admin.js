(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const make = (tag, className, value) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (value !== undefined) item.textContent = value;
    return item;
  };
  const gate = $('[data-moderation-gate]');
  const workspace = $('[data-moderation-workspace]');
  const feed = $('[data-moderation-posts]');
  const count = $('[data-moderation-count]');
  const form = $('[data-official-form]');
  const filesStatus = $('[data-official-files]');
  const lightbox = $('[data-moderation-lightbox]');
  const memberList = $('[data-member-list]');
  const memberCount = $('[data-member-count]');
  const memberSearch = $('[data-member-search]');
  const memberMore = $('[data-member-more]');
  const memberPosts = $('[data-member-posts]');
  const supporterForm = $('[data-supporter-form]');
  const supporterList = $('[data-supporter-list]');
  const supporterMessage = $('[data-supporter-message]');
  const pendingSummary = $('[data-admin-pending]');
  const memberSummary = $('[data-admin-members]');
  const supporterSummary = $('[data-admin-supporters]');
  let memberPage = 0;
  let activeMember = null;
  let postPage = 0;
  const showMessage = value => window.dispatchEvent(new CustomEvent('teacafe-toast', { detail: value }));
  const todayTaipei = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const categoryName = { gallery: '玩家相冊', general: '閒聊交流', help: '新手提問', professions: '職業與料理', homes: '家園與建築', economy: '交易與經濟', pets: '寵物與冒險', pass: '季節通行證', suggestions: '玩法建議' };
  lightbox.querySelector('button').addEventListener('click', () => lightbox.close());
  lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });

  async function decide(id, decision, button) {
    if (decision === 'reject' && !confirm('確定退回這篇貼文？退回後不會公開。')) return;
    button.disabled = true;
    try {
      const response = await fetch('/api/community/moderation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: id, decision }) });
      if (!response.ok) throw new Error();
      showMessage(decision === 'approve' ? '貼文已公開' : '貼文已退回');
      await loadQueue();
    } catch { showMessage('操作失敗，請重新整理後再試。'); button.disabled = false; }
  }

  function renderPost(post) {
    const article = make('article', 'community-post');
    const head = make('header', 'post-head');
    const avatar = make('img', 'post-avatar'); avatar.src = post.author_avatar_url || '/image/server_icon.png'; avatar.alt = '';
    const main = make('div', 'post-head-main');
    main.append(make('strong', '', post.author_name || post.author_username || '玩家'), make('small', '', new Date(post.created_at).toLocaleString('zh-TW')), make('h3', 'post-title', post.title));
    head.append(avatar, main, make('span', 'post-category', categoryName[post.category] || post.category));
    article.append(head);
    const content = make('div', 'post-content'); content.append(make('p', '', post.body)); article.append(content);
    if (post.media?.length) {
      const mediaList = make('div', 'moderation-media');
      for (const item of post.media) {
        if (item.type.startsWith('video/')) {
          const video = make('video'); video.src = item.url; video.controls = true; video.preload = 'metadata'; mediaList.append(video);
        } else {
          const button = make('button', 'moderation-image'); button.type = 'button'; button.setAttribute('aria-label', '放大待審圖片');
          const image = make('img'); image.src = item.url; image.alt = post.title; image.loading = 'lazy'; button.append(image);
          button.addEventListener('click', () => { lightbox.querySelector('img').src = item.url; lightbox.showModal(); }); mediaList.append(button);
        }
      }
      article.append(mediaList);
    }
    const actions = make('div', 'moderation-actions');
    const approve = make('button', 'mc-button green', '核准公開'); approve.type = 'button'; approve.addEventListener('click', () => decide(post.id, 'approve', approve));
    const reject = make('button', 'mc-button reject', '退回'); reject.type = 'button'; reject.addEventListener('click', () => decide(post.id, 'reject', reject));
    actions.append(approve, reject); article.append(actions);
    return article;
  }

  async function loadQueue() {
    try {
      const response = await fetch('/api/community/moderation', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const posts = Array.isArray(data.posts) ? data.posts : [];
      count.textContent = posts.length ? `${posts.length} 篇待審${data.has_more ? '；請先處理這批，再重新整理看其他貼文' : ''}` : '目前沒有待審貼文。';
      pendingSummary.textContent = data.has_more ? `${posts.length}+` : String(posts.length);
      feed.replaceChildren(...posts.map(renderPost));
    } catch { count.textContent = '待審貼文無法讀取，請按「重新整理」重試。'; pendingSummary.textContent = '—'; }
  }

  function renderMember(member) {
    const card = make('article', 'admin-member');
    const avatar = make('img'); avatar.src = member.avatar_url || '/image/server_icon.png'; avatar.alt = '';
    const details = make('div', 'admin-member-details');
    details.append(make('strong', '', member.global_name || member.username), make('small', '', `@${member.username} · Discord ID ${member.discord_id}`));
    if (member.minecraft_name) details.append(make('small', '', `Minecraft：${member.minecraft_name}`));
    details.append(make('small', '', `最近登入：${member.login_count ? new Date(member.last_login_at).toLocaleString('zh-TW') : '尚無新登入紀錄'} · 貼文 ${member.post_count} 篇 · 待審 ${member.pending_count} 篇`));
    const view = make('button', 'mc-button', '查看文章'); view.type = 'button';
    view.addEventListener('click', () => showMemberPosts(member));
    card.append(avatar, details, view);
    return card;
  }

  async function loadMembers(reset = false) {
    if (reset) { memberPage = 0; memberList.replaceChildren(); }
    const url = new URL('/api/admin/members', location.origin);
    url.searchParams.set('q', memberSearch.value.trim()); url.searchParams.set('page', String(memberPage));
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const members = Array.isArray(data.members) ? data.members : [];
      memberList.append(...members.map(renderMember));
      memberCount.textContent = memberList.children.length ? `顯示 ${memberList.children.length} 位成員` : '找不到符合條件的成員。';
      memberSummary.textContent = String(memberList.children.length);
      memberPage = data.next_page;
      memberMore.hidden = memberPage === null;
    } catch { memberCount.textContent = '成員資料無法讀取，請確認 D1 遷移或按「重新整理」重試。'; memberSummary.textContent = '—'; memberMore.hidden = true; }
  }

  function renderAuthorPost(post) {
    const card = make('article', 'admin-author-post');
    const statusLabel = { published: '已公開', pending: '待審', hidden: '已退回' }[post.status] || post.status;
    card.append(make('strong', '', post.title), make('small', '', `${post.kind === 'gallery' ? '玩家相冊' : '論壇'} · ${statusLabel} · ${new Date(post.created_at).toLocaleString('zh-TW')} · ${post.media_count} 個附件`));
    card.append(make('p', '', post.body.length > 280 ? `${post.body.slice(0, 280)}…` : post.body));
    if (post.status === 'published') {
      const link = make('a', 'admin-post-link', '查看公開貼文 ↗');
      link.href = `/${post.kind === 'gallery' ? 'gallery' : 'forum'}?post=${encodeURIComponent(post.id)}`;
      card.append(link);
    } else if (post.status === 'pending') {
      const link = make('a', 'admin-post-link', '前往審核 ↑'); link.href = '#review'; card.append(link);
    }
    return card;
  }

  async function showMemberPosts(member, append = false) {
    if (!append) { activeMember = member; postPage = 0; memberPosts.replaceChildren(); }
    memberPosts.hidden = false;
    const url = new URL('/api/admin/posts', location.origin);
    url.searchParams.set('author', activeMember.discord_id); url.searchParams.set('page', String(postPage));
    let data;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      data = await response.json();
    } catch { memberPosts.replaceChildren(make('p', '', '文章無法讀取，請稍後再試。')); return; }
    if (!append) memberPosts.append(make('h3', '', `${activeMember.global_name || activeMember.username} 的文章`));
    const posts = Array.isArray(data.posts) ? data.posts : [];
    memberPosts.append(...posts.map(renderAuthorPost));
    if (!posts.length && !append) memberPosts.append(make('p', '', '這位成員尚未發文。'));
    postPage = data.next_page;
    if (postPage !== null) {
      const morePosts = make('button', 'mc-button', '載入更多文章'); morePosts.type = 'button';
      morePosts.addEventListener('click', () => { morePosts.remove(); showMemberPosts(activeMember, true); });
      memberPosts.append(morePosts);
    }
    if (!append) memberPosts.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  let searchTimer;
  memberSearch.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadMembers(true), 250); });
  memberMore.addEventListener('click', () => loadMembers());
  $('[data-moderation-refresh]')?.addEventListener('click', loadQueue);
  $('[data-member-refresh]')?.addEventListener('click', () => loadMembers(true));
  $('[data-supporter-refresh]')?.addEventListener('click', loadSupporters);

  async function loadSupporters() {
    try {
      const response = await fetch('/api/admin/supporters', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      supporterList.replaceChildren();
      supporterSummary.textContent = String((data.supporters || []).length);
      for (const row of data.supporters || []) {
        const item = make('article', 'admin-supporter-row');
        item.append(make('span', '', `${row.player_name} · ${row.supported_at}${row.note ? ' · ' + row.note : ''}`));
        const remove = make('button', 'mc-button', '移除'); remove.type = 'button';
        remove.addEventListener('click', async () => {
          if (!confirm(`確定從感謝名單移除 ${row.player_name}？`)) return;
          remove.disabled = true;
          try {
            const result = await fetch('/api/admin/supporters', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id }) });
            if (!result.ok) throw new Error();
            supporterMessage.textContent = '已從名單移除。';
            await loadSupporters();
          } catch { supporterMessage.textContent = '移除失敗，請稍後重試。'; remove.disabled = false; }
        });
        item.append(remove); supporterList.append(item);
      }
      if (!data.supporters?.length) supporterMessage.textContent = '目前還沒有公開的支持者。';
    } catch { supporterMessage.textContent = '名單無法讀取，請確認 D1 遷移或按「重新整理」重試。'; supporterSummary.textContent = '—'; }
  }
  supporterForm.elements.supported_at.value = todayTaipei();
  supporterForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = supporterForm.querySelector('[type="submit"]'); button.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(supporterForm));
      const response = await fetch('/api/admin/supporters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error();
      supporterMessage.textContent = '已加入感謝名單。'; supporterForm.reset();
      supporterForm.elements.supported_at.value = todayTaipei();
      await loadSupporters();
    } catch { supporterMessage.textContent = '新增失敗，請確認資料與 D1 migration。'; }
    finally { button.disabled = false; }
  });

  form.elements.media.addEventListener('change', () => {
    const files = [...form.elements.media.files];
    const size = files.reduce((sum, file) => sum + file.size, 0);
    const invalid = files.find(file => !['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(file.type) || !file.size);
    filesStatus.textContent = `${files.length} / 30 個檔案 · ${(size / 1048576).toFixed(2)} / 20 MiB${files.length > 30 ? '，已超過件數上限' : size > 20 * 1048576 ? '，已超過大小限制，請移除或壓縮檔案' : invalid ? `，「${invalid.name}」格式不支援或檔案為空` : ''}`;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const files = [...form.elements.media.files];
    const size = files.reduce((sum, file) => sum + file.size, 0);
    if (files.length > 30) { filesStatus.textContent = '每篇最多可附上 30 個檔案。'; return; }
    if (size > 20 * 1048576) { filesStatus.textContent = '附件總大小超過 20 MiB。'; return; }
    if (files.some(file => !['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'].includes(file.type) || !file.size)) { filesStatus.textContent = '附件格式不支援或檔案為空。'; return; }
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    const data = new FormData(form); data.set('kind', 'forum'); data.set('category', 'official');
    try {
      const response = await fetch('/api/community/posts', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error === 'post_rate_limited' ? '請稍等 30 秒再發文。' : '發布失敗，請稍後再試。');
      form.reset(); filesStatus.textContent = '';
      showMessage('官方貼文已公開');
    } catch (error) { filesStatus.textContent = error.message; }
    finally { button.disabled = false; }
  });

  (async () => {
    const state = await window.TeaCafeAuth.ready;
    if (!state.authenticated) { gate.innerHTML = '<a class="mc-button green" href="/api/auth/login?return=%2Fadmin">使用 Discord 登入</a>'; return; }
    if (!state.is_official) { gate.textContent = '這個頁面只開放官方審核員使用。'; return; }
    gate.hidden = true; workspace.hidden = false; await Promise.all([loadQueue(), loadMembers(true), loadSupporters()]);
  })();
})();

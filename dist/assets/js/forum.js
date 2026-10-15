/* TeaCafe player forum — front-end prototype. No forum API calls or publication. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const categoriesHost = $('[data-forum-categories]');
  const feed = $('[data-forum-list]');
  if (!categoriesHost || !feed) return;

  const dialog = $('#forum-compose');
  const form = $('[data-forum-compose]');
  const files = $('[data-compose-files]');
  const previews = $('[data-compose-previews]');
  const feedback = $('[data-compose-feedback]');
  const query = new URL(location.href);
  const draftKey = 'teacafe-forum-local-drafts-v1';
  let examples = [];
  let categories = [];
  let activeCategory = query.searchParams.get('category') || 'all';
  let search = '';
  let sort = 'newest';
  let objectUrls = [];
  let drafts = [];

  function readDrafts() {
    try {
      const value = JSON.parse(localStorage.getItem(draftKey) || '[]');
      return Array.isArray(value) ? value.filter(x => x && typeof x.title === 'string') : [];
    } catch { return []; }
  }
  drafts = readDrafts();
  const element = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const getCategoryName = (id) => categories.find(c => c.id === id)?.name || '玩家交流';
  const dateText = (value) => {
    if (!value) return '介面展示';
    const date = new Date(value);
    return Number.isNaN(+date) ? '介面展示' : date.toLocaleString('zh-TW', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
  };
  function updateCategoryBar() {
    categoriesHost.replaceChildren(...categories.map(category => {
      const a = element('a', activeCategory === category.id ? 'active' : '', category.name);
      a.href = `/forum.html${category.id === 'all' ? '' : `?category=${encodeURIComponent(category.id)}`}`;
      if (category.id === activeCategory) a.setAttribute('aria-current', 'page');
      return a;
    }));
  }
  function postCard(post) {
    const article = element('article', 'forum-post-card');
    const heading = element('div', 'forum-post-head');
    const avatar = element('img','forum-user-avatar');
    avatar.src = post.author_avatar_url || '/image/favicon.svg';
    avatar.alt = '';
    avatar.loading = 'lazy';
    const byline = element('div','forum-post-byline');
    const author = element('div','forum-post-user');
    author.append(element('strong', '', post.author_name || 'TeaCafe'));
    author.append(element('span','level-pill', `Lv.${Math.max(0, Number(post.level) || 0)}`));
    const time = element('div','forum-post-time', dateText(post.created_at));
    byline.append(author,time);
    const badges = element('div','forum-post-badges');
    badges.append(element('span','forum-category-pill',getCategoryName(post.category)));
    if (post.demo) badges.append(element('span','forum-demo-tag','介面示範'));
    if (post.isLocalDraft) badges.append(element('span','forum-draft-tag','本機草稿 · 未送審'));
    heading.append(avatar,byline,badges);
    article.append(heading);
    article.append(element('h2','forum-post-title',post.title));
    article.append(element('p','forum-post-body',post.body));
    if (post.isLocalDraft && (post.mediaCount || 0) > 0) {
      article.append(element('p','forum-media-note',`已選擇 ${post.mediaCount} 個附件；本機草稿不儲存媒體，送審前需重新選擇。`));
    }
    const footer = element('footer','forum-post-footer');
    footer.append(element('span','',post.isLocalDraft ? '只有這台裝置看得到' : '玩家討論區'));
    if (post.isLocalDraft) {
      const edit = element('button','forum-text-action','繼續編輯');
      edit.type = 'button';
      edit.addEventListener('click', async () => {
        const state = await window.TeaCafeAuth?.ready;
        if (!state?.authenticated) { window.TeaCafeAuth?.open(); return; }
        form.elements.title.value = post.title;
        form.elements.body.value = post.body;
        form.elements.category.value = post.category;
        form.dataset.editId = post.id;
        dialog.showModal();
      });
      footer.append(edit);
    }
    article.append(footer);
    return article;
  }
  function redraw() {
    updateCategoryBar();
    let items = [...drafts, ...examples];
    if (activeCategory !== 'all') items = items.filter(post => post.category === activeCategory);
    const term = search.trim().toLocaleLowerCase();
    if (term) items = items.filter(post => `${post.title} ${post.body} ${post.author_name} ${getCategoryName(post.category)}`.toLocaleLowerCase().includes(term));
    items.sort((a,b) => {
      const av = a.created_at ? +new Date(a.created_at) : 0;
      const bv = b.created_at ? +new Date(b.created_at) : 0;
      return sort === 'oldest' ? av-bv : bv-av;
    });
    if (!items.length) {
      const empty = element('div','forum-empty');
      empty.append(element('h2','','這個分類目前沒有文章'));
      empty.append(element('p','','可以選擇其他分類，或先儲存一篇本機草稿。'));
      feed.replaceChildren(empty);
      return;
    }
    feed.replaceChildren(...items.map(postCard));
  }
  function clearMediaPreviews() {
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls = [];
    previews?.replaceChildren();
  }
  function onFilesChange() {
    clearMediaPreviews();
    const selected = [...(files.files || [])];
    if (selected.length > 4) {
      feedback.textContent = '最多可選擇 4 個附件，請重新選擇。';
      files.value = '';
      return;
    }
    feedback.textContent = '';
    selected.forEach(file => {
      if (!/^image\/(jpeg|png|gif|webp)$|^video\/(mp4|webm)$/.test(file.type)) {
        feedback.textContent = '僅支援 JPG、PNG、WebP、GIF、MP4 與 WebM。';
        return;
      }
      const url = URL.createObjectURL(file);
      objectUrls.push(url);
      const figure = element('figure','forum-preview-media');
      const media = file.type.startsWith('video/') ? document.createElement('video') : document.createElement('img');
      media.src = url;
      if (media.tagName === 'VIDEO') { media.controls = true; media.preload = 'metadata'; }
      media.alt = file.name;
      figure.append(media, element('figcaption','',file.name));
      previews.append(figure);
    });
  }
  files?.addEventListener('change',onFilesChange);
  dialog?.addEventListener('close', () => { clearMediaPreviews(); feedback.textContent = ''; });
  document.querySelectorAll('[data-forum-close]').forEach(button => button.addEventListener('click',() => dialog.close()));
  $('[data-forum-create]')?.addEventListener('click',async () => {
    const state = await window.TeaCafeAuth?.ready;
    if (!state?.authenticated) { window.TeaCafeAuth?.open(); return; }
    form.reset();delete form.dataset.editId;
    clearMediaPreviews();feedback.textContent = '';
    form.elements.category.value = activeCategory === 'all' ? 'general' : activeCategory;
    dialog.showModal();
  });
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const state = await window.TeaCafeAuth?.ready;
    if (!state?.authenticated) { window.TeaCafeAuth?.open(); return; }
    const title = form.elements.title.value.trim();
    const body = form.elements.body.value.trim();
    if (!title || !body) { feedback.textContent = '請填寫標題與內文。'; return; }
    if ((files.files?.length || 0) > 4) { feedback.textContent = '最多 4 個附件。'; return; }
    const oldId = form.dataset.editId;
    const draft = {
      id: oldId || `local-${Date.now()}`,
      title: title.slice(0,100), body: body.slice(0,5000), category: form.elements.category.value,
      author_name: state.user.global_name || state.user.username,
      author_avatar_url: state.user.avatar_url || '/image/favicon.svg', level: 0,
      created_at: new Date().toISOString(),
      mediaCount: files.files?.length || 0,
      isLocalDraft: true
    };
    drafts = [draft, ...drafts.filter(x=>x.id!==oldId)].slice(0,20);
    try { localStorage.setItem(draftKey, JSON.stringify(drafts)); }
    catch { feedback.textContent = '本機儲存空間不足，請先複製內文備份。'; return; }
    activeCategory='all'; query.searchParams.delete('category');history.replaceState({},'',query.pathname);
    redraw();form.reset();dialog.close();
    window.dispatchEvent(new CustomEvent('teacafe-toast',{detail:'草稿已儲存在此瀏覽器，尚未送審或公開。'}));
  });
  $('[data-forum-search]')?.addEventListener('input',event=>{search=event.target.value;redraw()});
  $('[data-forum-sort]')?.addEventListener('change',event=>{sort=event.target.value;redraw()});
  async function boot() {
    try {
      const r = await fetch('/data/forum.json',{cache:'no-cache'});
      if (!r.ok) throw new Error('forum_data_unavailable');
      const data=await r.json();
      categories=Array.isArray(data.categories)?data.categories:[];
      examples=Array.isArray(data.posts)?data.posts:[];
    } catch {
      categories=[{id:'all',name:'全部文章'},{id:'general',name:'閒聊交流'}];
      examples=[];
    }
    if (!categories.some(c=>c.id===activeCategory)) activeCategory='all';
    const categoryInput = $('[data-compose-category]');
    if (categoryInput) categoryInput.replaceChildren(...categories.filter(c=>c.id!=='all').map(c=>{
      const option=element('option','',c.name);option.value=c.id;return option;
    }));
    redraw();
    const state = await window.TeaCafeAuth?.ready;
    const profile=$('[data-forum-profile]');
    if (profile && state?.authenticated) {
      profile.replaceChildren();
      const row=element('div','forum-profile-user');
      const avatar=element('img','forum-user-avatar');avatar.src=state.user.avatar_url||'/image/favicon.svg';avatar.alt='';
      row.append(avatar,element('strong','',state.user.global_name||state.user.username));
      profile.append(row,element('strong','forum-profile-level','Lv.0'),element('div','forum-exp-track'));
      profile.querySelector('.forum-exp-track').append(element('span',''));
      profile.append(element('p','','0 / 100 EXP · 發文經審核後可獲得經驗值（待後端啟用）'));
    }
  }
  boot();
})();

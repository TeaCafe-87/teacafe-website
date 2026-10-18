(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const tabs = [...document.querySelectorAll('[data-copy-tab]')];
  const status = $('[data-copy-status]');
  const workspace = $('[data-copy-workspace]');
  if (!status || !workspace || !window.TeaCafeCopy) return;
  const list = $('[data-copy-list]');
  const search = $('[data-copy-search]');
  const input = $('[data-copy-input]');
  const original = $('[data-copy-original]');
  const preview = $('[data-copy-preview]');
  const diff = $('[data-copy-diff]');
  const message = $('[data-copy-message]');
  const saveButton = $('[data-copy-save]');
  const resetButton = $('[data-copy-reset]');
  const pages = new Map();
  const drafts = new Map();
  let currentPage = 'wiki';
  let selectedKey = null;
  const draftKey = block => `${block.page}/${block.key}`;
  const selected = () => pages.get(currentPage)?.blocks.find(block => block.key === selectedKey);
  const published = block => pages.get(block.page)?.overrides.get(block.key)?.value ?? block.base;
  const currentDraft = block => drafts.get(draftKey(block)) ?? published(block);

  function renderDiff(before, after) {
    diff.replaceChildren();
    if (before === after) { diff.textContent = '與網站原文相同。'; return; }
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let end = 0;
    while (end < before.length - start && end < after.length - start && before[before.length - end - 1] === after[after.length - end - 1]) end++;
    const contextBefore = before.slice(Math.max(0, start - 24), start);
    const contextAfter = before.slice(before.length - end, before.length - end + 24);
    const removed = before.slice(start, before.length - end);
    const added = after.slice(start, after.length - end);
    const oldLine = document.createElement('p');
    const newLine = document.createElement('p');
    oldLine.append('原文：', contextBefore);
    if (removed) { const mark = document.createElement('del'); mark.textContent = removed; oldLine.append(mark); }
    oldLine.append(contextAfter);
    newLine.append('新版：', contextBefore);
    if (added) { const mark = document.createElement('ins'); mark.textContent = added; newLine.append(mark); }
    newLine.append(after.slice(after.length - end, after.length - end + 24));
    diff.append(oldLine, newLine);
  }
  function renderEditor() {
    const block = selected();
    input.disabled = !block;
    if (!block) {
      $('[data-copy-location]').textContent = '選擇左側段落';
      input.value = '';
      original.textContent = '';
      preview.textContent = '';
      diff.textContent = '尚未選擇段落';
      saveButton.disabled = true;
      resetButton.disabled = true;
      return;
    }
    $('[data-copy-location]').textContent = `${block.section} · ${block.kind}`;
    $('[data-copy-view]').href = `/${currentPage === 'wiki' ? 'wiki' : 'rules'}.html`;
    input.value = currentDraft(block);
    original.textContent = block.base;
    renderPreview();
  }
  function renderPreview() {
    const block = selected();
    if (!block) return;
    const draft = input.value;
    window.TeaCafeCopy.renderText(preview, draft);
    renderDiff(block.base, draft);
    const changed = draft.trim() !== block.base;
    $('[data-copy-change-badge]').textContent = changed ? '● 與原文不同' : '與原文相同';
    saveButton.disabled = !draft.trim() || draft.trim() === published(block);
    resetButton.disabled = !pages.get(block.page).overrides.has(block.key);
  }
  function renderList() {
    const data = pages.get(currentPage);
    if (!data) return;
    const query = search.value.trim().toLowerCase();
    list.replaceChildren();
    let currentGroup = '';
    for (const block of data.blocks) {
      if (query && !`${block.section} ${block.base} ${currentDraft(block)}`.toLowerCase().includes(query)) continue;
      if (block.section !== currentGroup) {
        currentGroup = block.section;
        const heading = document.createElement('h3'); heading.textContent = currentGroup; list.append(heading);
      }
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'copy-block-button';
      button.classList.toggle('active', block.key === selectedKey);
      const title = document.createElement('span'); title.textContent = block.label;
      const detail = document.createElement('small');
      const dirty = currentDraft(block) !== published(block);
      detail.textContent = `${block.kind}${data.overrides.has(block.key) ? ' · 已公開修改' : ''}${dirty ? ' · 尚未儲存' : ''}`;
      button.append(title, detail);
      button.addEventListener('click', () => { selectedKey = block.key; message.textContent = ''; renderList(); renderEditor(); });
      list.append(button);
    }
    if (!list.children.length) list.textContent = '沒有符合的段落。';
    status.textContent = `${currentPage === 'wiki' ? 'Wiki' : '規則'}：${data.blocks.length} 個可編輯段落，${data.overrides.size} 個已修改。`;
  }
  async function loadPage(page) {
    const [sourceResponse, copyResponse] = await Promise.all([
      fetch(`/${page}.html`, { cache: 'no-store' }),
      fetch(`/api/site-copy?page=${page}`, { cache: 'no-store' })
    ]);
    if (!sourceResponse.ok || !copyResponse.ok) throw new Error('load_failed');
    const source = new DOMParser().parseFromString(await sourceResponse.text(), 'text/html');
    const data = await copyResponse.json();
    if (!data.configured || !Array.isArray(data.items)) throw new Error('migration_required');
    pages.set(page, { blocks: window.TeaCafeCopy.collect(source, page), overrides: new Map(data.items.map(item => [item.block_key, item])) });
  }
  function switchPage(page) {
    if (!pages.has(page)) return;
    currentPage = page;
    selectedKey = pages.get(page).blocks[0]?.key || null;
    search.value = '';
    tabs.forEach(tab => { const active = tab.dataset.copyTab === page; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
    message.textContent = '';
    renderList(); renderEditor();
  }
  async function persist(reset) {
    const block = selected();
    if (!block) return;
    const value = input.value.trim();
    const shouldReset = reset || value === block.base;
    saveButton.disabled = resetButton.disabled = true;
    message.textContent = '儲存中…';
    try {
      const response = await fetch('/api/admin/site-copy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: block.page, key: block.key, value, reset: shouldReset })
      });
      if (!response.ok) throw new Error('save_failed');
      const result = await response.json();
      const overrides = pages.get(block.page).overrides;
      if (shouldReset) overrides.delete(block.key);
      else overrides.set(block.key, { value, updated_at: result.updated_at });
      drafts.delete(draftKey(block));
      message.textContent = shouldReset ? '已還原網站原文。' : '已儲存並公開，重新整理頁面即可看到更新。';
      renderList(); renderEditor();
    } catch { message.textContent = '儲存失敗，請確認 D1 遷移與登入狀態後再試。'; renderPreview(); }
  }
  input.addEventListener('input', () => {
    const block = selected();
    if (!block) return;
    drafts.set(draftKey(block), input.value);
    renderPreview();
    renderList();
  });
  search.addEventListener('input', renderList);
  tabs.forEach(tab => tab.addEventListener('click', () => switchPage(tab.dataset.copyTab)));
  saveButton.addEventListener('click', () => persist(false));
  resetButton.addEventListener('click', () => persist(true));
  window.TeaCafeAuth?.ready.then(async state => {
    if (!state.is_official) return;
    try {
      await Promise.all(['wiki', 'rules'].map(loadPage));
      workspace.hidden = false;
      switchPage('wiki');
    } catch (error) {
      status.textContent = error.message === 'migration_required'
        ? '請先在 teacafe-db 執行 migrations/0006_site_copy.sql，再重新整理此頁。'
        : '編輯器無法讀取 Wiki 或規則，請稍後重新整理。';
    }
  });
})();

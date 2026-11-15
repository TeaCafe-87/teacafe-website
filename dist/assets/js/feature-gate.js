/* Feature gate: when an admin pauses a section (forum / gallery / wiki / market),
 * replace the page body with a clean paused notice. The APIs refuse writes
 * server-side as well; this script only handles presentation. */
(async () => {
  'use strict';
  const key = document.body.dataset.featureGate;
  if (!key) return;
  let payload = null;
  try {
    const response = await fetch('/api/site-features', { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    payload = await response.json();
  } catch { return; }
  const feature = payload?.features?.[key];
  if (!feature || feature.enabled !== false) return;

  const names = { forum: '玩家論壇', gallery: '玩家相冊', wiki: '伺服器 Wiki', market: '月映茶行' };
  const main = document.querySelector('main');
  if (!main) return;
  document.body.classList.add('feature-paused');

  const holder = document.createElement('section');
  holder.className = 'feature-paused-notice';
  const card = document.createElement('div');
  card.className = 'feature-paused-card';
  const mark = document.createElement('span');
  mark.className = 'fp-mark';
  mark.textContent = '✕';
  mark.setAttribute('aria-hidden', 'true');
  const title = document.createElement('h2');
  title.textContent = `${names[key] || '此功能'}暫停開放中`;
  const body = document.createElement('p');
  body.textContent = feature.note || '管理員暫時關閉了這個區塊，整理完成後會重新開放。最新消息請看公告或 Discord。';
  const back = document.createElement('a');
  back.href = '/';
  back.textContent = '回到首頁';
  card.append(mark, title, body, back);
  holder.append(card);

  // Keep the page title banner when the page has one; swap out everything after it.
  // Compose buttons and login prompts inside the banner make no sense on a paused page.
  const keep = main.querySelector('.page-title');
  keep?.querySelectorAll('[data-community-create], [data-community-auth-error]').forEach((el) => el.remove());
  main.replaceChildren(...(keep ? [keep, holder] : [holder]));
})();

(() => {
  const root = document.documentElement;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.motion === 'reduced';
  const preloader = document.querySelector('.site-preloader');

  if (preloader) {
    let seen = false;
    try {
      seen = sessionStorage.getItem('teacafe-intro-seen') === '1';
      sessionStorage.setItem('teacafe-intro-seen', '1');
    } catch { /* Storage may be disabled; the CSS timer still clears the intro. */ }
    if (seen || reduceMotion()) preloader.classList.add('is-skipped');
    else {
      document.body.classList.add('intro-queued');
      setTimeout(() => {
        preloader.remove();
        document.body.classList.remove('intro-queued');
      }, 2600);
    }
  }

  const transition = document.createElement('div');
  transition.className = 'page-transition';
  transition.setAttribute('aria-hidden', 'true');
  transition.innerHTML = '<span class="page-transition-label"><img src="/image/server_icon.png" alt="">茶咖暖居</span>';
  document.body.append(transition);

  // Let native links handle new tabs, downloads, external sites, hashes and OAuth.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || reduceMotion()) return;
    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || link.target && link.target !== '_self') return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) || url.pathname.startsWith('/api/')) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    if (document.body.classList.contains('is-page-leaving')) { event.preventDefault(); return; }
    event.preventDefault();
    document.body.classList.add('is-page-leaving');
    setTimeout(() => location.assign(url.href), 460);
  });
  addEventListener('pageshow', () => document.body.classList.remove('is-page-leaving'));

  // Build masked lines only for plain headings and selected lead copy. Any DOM or
  // animation failure leaves readable text in the document.
  const observer = !reduceMotion() && 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle('kinetic-visible', entry.isIntersecting);
        }
      }, { threshold: .08, rootMargin: '0px 0px -9% 0px' })
    : null;

  const selector = 'main h2, main h3, main .screen-heading p, main .section-head > p, main .title-line';
  function prepare(element) {
    if (!observer || element.dataset.kineticPrepared !== undefined || element.closest('dialog,[hidden]')) return;
    // Avoid changing rich text, links, controls, or live status labels.
    if (element.children.length || !element.textContent.trim() || element.hasAttribute('data-server-status')) return;
    const inner = document.createElement('span');
    inner.className = 'kinetic-inner';
    inner.textContent = element.textContent;
    element.replaceChildren(inner);
    element.dataset.kineticPrepared = '';
    element.classList.add('kinetic-mask', 'kinetic-ready');
    if (element.classList.contains('title-line')) {
      element.style.setProperty('--kinetic-delay', `${Math.min([...element.parentElement.children].indexOf(element), 3) * 130}ms`);
    }
    observer.observe(element);
  }
  document.querySelectorAll(selector).forEach(prepare);
  if (observer) {
    const main = document.querySelector('main');
    if (main) new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE || node.classList?.contains('kinetic-inner')) continue;
        if (node.matches?.(selector)) prepare(node);
        node.querySelectorAll?.(selector).forEach(prepare);
      }
    }).observe(main, { childList: true, subtree: true });
  }

  // Smooth in-page navigation remains available on the rules page, where its
  // original stylesheet disables CSS smooth scrolling to avoid scroll snapping.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || reduceMotion()) return;
    const id = decodeURIComponent(link.hash.slice(1));
    const target = id && document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    history.pushState(null, '', `#${encodeURIComponent(id)}`);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();

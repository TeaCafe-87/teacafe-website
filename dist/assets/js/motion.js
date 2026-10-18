(() => {
  const root = document.documentElement;
  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.motion === 'reduced';
  const intro = document.querySelector('.site-intro');
  let introFinished = false;
  let navRevealed = false;
  const revealNav = () => {
    if (navRevealed) return;
    navRevealed = true;
    document.body.classList.add('site-nav-reveal');
    if (window.teaRevealTopbar) window.teaRevealTopbar();
    else document.querySelector('.topbar')?.classList.remove('topbar-hidden');
  };
  const finishIntro = () => {
    if (introFinished) return;
    introFinished = true;
    intro?.remove();
    document.body.classList.remove('site-intro-pending');
    revealNav();
    startKinetic();
    dispatchEvent(new Event('teacafe-intro-finished'));
  };
  if (intro && !reduceMotion()) {
    document.body.classList.add('site-intro-pending');
    intro.addEventListener('animationend', (event) => {
      if (event.target === intro && event.animationName === 'tea-intro-finish') finishIntro();
    });
    setTimeout(finishIntro, 5000);
  } else {
    intro?.remove();
    revealNav();
    queueMicrotask(() => dispatchEvent(new Event('teacafe-intro-finished')));
  }

  const transition = document.createElement('div');
  transition.className = 'page-transition';
  transition.setAttribute('aria-hidden', 'true');
  transition.innerHTML = '<span class="page-transition-line page-transition-line-left"></span><span class="page-transition-line page-transition-line-middle"></span><span class="page-transition-line page-transition-line-right"></span><span class="page-transition-seal"><svg class="page-transition-seal-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19.4"/></svg><span class="page-transition-seal-text">茶</span></span>';
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
    setTimeout(() => location.assign(url.href), 540);
  });
  addEventListener('pageshow', () => document.body.classList.remove('is-page-leaving'));

  // Only section titles use masked motion. Upward scrolling keeps them visible;
  // they reset only after leaving below the viewport, ready for the next descent.
  const observer = !reduceMotion() && 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) entry.target.classList.add('kinetic-visible');
          else if (entry.boundingClientRect.top >= innerHeight - 2) entry.target.classList.remove('kinetic-visible');
        }
      }, { threshold: .08 })
    : null;

  const selector = 'main h2, main .title-line';
  function prepare(element) {
    if (!observer || element.dataset.kineticPrepared !== undefined || element.closest('dialog,[hidden]')) return;
    // Keep rich text, links, and controls untouched.
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
  let kineticStarted = false;
  function startKinetic() {
    if (!observer || kineticStarted) return;
    kineticStarted = true;
    document.querySelectorAll(selector).forEach(prepare);
    const main = document.querySelector('main');
    if (main) new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE || node.classList?.contains('kinetic-inner')) continue;
        if (node.matches?.(selector)) prepare(node);
        node.querySelectorAll?.(selector).forEach(prepare);
      }
    }).observe(main, { childList: true, subtree: true });
  }
  if (!intro || reduceMotion()) startKinetic();

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

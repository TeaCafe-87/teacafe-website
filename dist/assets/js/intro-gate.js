/* TeaCafe opening gate. Loaded as a blocking script at the very top of <body>, before the intro
 * markup paints, so the decision never arrives mid-animation (the old cause of glitchy intros).
 *
 *   intro-skip  no intro: hidden before the first frame
 *   intro-play  inner pages: lines retract, the seal ring erases with them, the doors open
 *   intro-wait  home: a loader that holds until the film is ready; the seal ring fills as a
 *               progress stroke (teaIntro.progress), then teaIntro.go() plays the opening
 *
 * It also picks the home theme (day/night) before the first paint, so night visitors never see a
 * flash of the day film, and it plays the opening after any in-site page change, so the leaving
 * curtain always lands in a matching arrival. */
(function () {
  'use strict';
  var body = document.body, root = document.documentElement;
  var VERSION = 'tea-cinematic-2026-11-v3';
  var get = function (store, key) { try { return window[store].getItem(key); } catch (e) { return null; } };
  var put = function (store, key, value) { try { window[store].setItem(key, value); } catch (e) { /* private mode */ } };
  var home = body.classList.contains('ink-home');

  if (home) {
    var pref = get('localStorage', 'teacafe-theme') || 'auto';
    var hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    body.classList.toggle('theme-night', pref === 'night' || (pref === 'auto' && (hour >= 18 || hour < 6)));
  }

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || root.dataset.motion === 'reduced';
  var arriving = get('sessionStorage', 'teacafe-arrive') === '1';
  if (arriving) { try { sessionStorage.removeItem('teacafe-arrive'); } catch (e) { /* ignore */ } }
  var seen = get('localStorage', 'teacafe-intro-seen-version') === VERSION;
  var enabled = get('localStorage', 'teacafe-intro-enabled') !== 'false';
  var playedThisSession = get('sessionStorage', 'teacafe-intro-session-version') === VERSION;
  var admin = body.classList.contains('moderation-page');
  var play = !admin && (home || (!reduced && (arriving || !seen || (enabled && !playedThisSession))));
  var mode = play ? (home ? 'intro-wait' : 'intro-play') : 'intro-skip';
  body.classList.add(mode);
  if (play) body.classList.add('site-intro-pending');

  var done = false;
  function finish(played) {
    if (done) return;
    done = true;
    if (played) {
      put('localStorage', 'teacafe-intro-seen-version', VERSION);
      put('sessionStorage', 'teacafe-intro-session-version', VERSION);
    }
    var intro = document.querySelector('.site-intro');
    if (intro) intro.remove();
    body.classList.remove('site-intro-pending', 'intro-wait');
    window.teaIntro.done = true;
    window.dispatchEvent(new CustomEvent('teacafe-intro-finished', { detail: { played: played } }));
  }
  function go() {
    if (done || !body.classList.contains('intro-wait')) return;
    root.style.setProperty('--intro-progress', '1');
    body.classList.remove('intro-wait');
    body.classList.add('intro-play');
    setTimeout(function () { finish(true); }, 4500); // the opening lasts 3.15s; never leave it hanging
  }

  window.teaIntro = {
    done: false,
    progress: function (p) { root.style.setProperty('--intro-progress', String(Math.max(0, Math.min(1, p)))); },
    go: go,
  };
  document.addEventListener('animationend', function (event) {
    if (event.animationName === 'tea-intro-finish') finish(true);
  }, true);

  if (!play) document.addEventListener('DOMContentLoaded', function () { finish(false); });
  // Safety nets: a stalled film must never trap the visitor behind the loader.
  if (home) setTimeout(go, 9000);
  if (play) setTimeout(function () { finish(true); }, home ? 15000 : 6000);
})();

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const code = readFileSync(new URL('../dist/assets/js/home-scene.js', import.meta.url), 'utf8');
function setup({ reduced = false, saveData = false, portrait = false, flowers = false } = {}) {
  const events = () => ({ handlers: {}, addEventListener(name, fn) { (this.handlers[name] ??= []).push(fn); }, emit(name) { for (const fn of this.handlers[name] || []) fn(); } });
  const video = Object.assign(events(), {
    dataset: { srcMobile: 'mobile.mp4', srcDesktop: 'desktop.mp4' },
    classList: { add() {}, remove() {} }, duration: 8, readyState: 4, seeking: false,
    _time: 0, seeks: [], pause() {}, load() {}, hasAttribute() { return !!this.src; },
    removeAttribute() { this.src = ''; }
  });
  Object.defineProperty(video, 'currentTime', {
    get() { return this._time; },
    set(value) { assert.equal(this.seeking, false, 'seeks must not overlap'); this._time = value; this.seeks.push(value); this.seeking = true; }
  });
  const content = { dataset: {}, style: { values: {}, setProperty(k,v) { this.values[k]=v; } } };
  const stage = { offsetHeight: 800 };
  const camera = { style: {} };
  const paint = { draws: [], fillRect() {}, setTransform() {}, save() {}, restore() {},
    clearRect() { this.draws = []; }, translate(x,y) { this.position=[x,y]; }, rotate() {},
    drawImage() { this.draws.push(this.position); } };
  const canvas = { style: {}, width: 0, height: 0, getContext: () => paint };
  const section = { id: 'home', style: { setProperty() {} }, querySelector: selector => selector === '.scene-panel' ? stage : content, getBoundingClientRect: () => ({top: -context.scrollY, bottom: 1520-context.scrollY}) };
  const nextSection = { ...section, id: 'server-info', getBoundingClientRect: () => ({top:1520-context.scrollY,bottom:3040-context.scrollY}) };
  const main = { dataset: {}, querySelectorAll: () => flowers ? [section,nextSection] : [section] };
  const document = Object.assign(events(), { hidden: false, documentElement: { scrollHeight: 4000, dataset: {} }, body: {}, createElement: () => ({ getContext: () => paint }), querySelector: selector => selector.includes('video') ? video : selector.includes('camera') ? camera : selector.includes('blossom') ? (flowers ? canvas : null) : main });
  const media = { reduced: Object.assign(events(),{matches:reduced}), portrait: Object.assign(events(),{matches:portrait}) };
  const pending = new Map();
  let next = 0, now = 0, mutation;
  const context = Object.assign(events(), {
    document, navigator: { connection: Object.assign(events(),{saveData}) }, innerHeight: 800, innerWidth: 1440, devicePixelRatio: 1, scrollY: 0,
    matchMedia: query => media[query.includes('reduced') ? 'reduced' : 'portrait'],
    requestAnimationFrame: fn => { pending.set(++next,fn); return next; }, cancelAnimationFrame: id => pending.delete(id),
    MutationObserver: class { constructor(fn) { mutation=fn; } observe() {} },
    ResizeObserver: class { observe() {} }
  });
  context.window = context;
  context.addEventListener = context.addEventListener.bind(context);
  runInNewContext(code,context);
  function flush() {
    for (let i=0;i<160 && (pending.size || video.seeking);i++) {
      const batch = [...pending.values()]; pending.clear(); now += 16;
      for (const fn of batch) fn(now);
      if (video.seeking) { video.seeking=false; video.emit('seeked'); }
    }
    assert.equal(pending.size,0,'render loop stops when scroll settles');
  }
  return { context,video,media,pending,flush,mutation,content,camera,stage,canvas,paint };
}
const test = setup();
test.flush();
assert.equal(test.video.src,'desktop.mp4');
test.context.scrollY=300; test.context.emit('scroll'); test.flush();
assert.equal(test.content.style.values['--scene-opacity'],1,'hero copy stays visible during its pinned hold');
test.context.scrollY=1600; test.context.emit('scroll'); test.flush();
assert.ok(Math.abs(test.video.currentTime-(8-1/30)/2)<1/30);
test.context.scrollY=3200; test.context.emit('scroll');
test.video.seeking=true;
const before=test.video.seeks.length;
const queued = [...test.pending.values()];
test.pending.clear();
for (const fn of queued) fn(1000);
assert.equal(test.video.seeks.length,before,'in-flight decode is not interrupted');
test.video.seeking=false; test.video.emit('seeked'); test.flush();
assert.ok(Math.abs(test.video.currentTime-(8-1/30))<1/30);
test.context.scrollY=0; test.context.emit('scroll'); test.flush();
assert.ok(test.video.currentTime<1/30,'reverse scroll returns to first frame');
test.media.portrait.matches=true; test.media.portrait.emit('change'); test.flush();
assert.equal(test.video.src,'mobile.mp4');
test.context.document.documentElement.dataset.motion='reduced'; test.mutation(); test.flush();
assert.equal(test.video.src,'');
assert.equal(test.content.style.values['--scene-opacity'],1);
for (const config of [{reduced:true},{saveData:true}]) {
  const staticTest=setup(config); staticTest.flush();
  assert.ok(!staticTest.video.src,'static preference avoids downloading video');
  assert.equal(staticTest.video.seeks.length,0);
}
const broken=setup(); broken.flush(); broken.video.emit('error');
broken.context.scrollY=1600; broken.context.emit('scroll'); broken.flush();
assert.equal(broken.video.seeks.length,0,'failed video leaves content usable');
console.log('Scene: pinned hold, seeking, reverse, idle, portrait, reduced motion, save-data and error fallback passed.');

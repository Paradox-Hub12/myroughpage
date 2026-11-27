/* My Rough Page — site behaviour. Loaded in <head> (no defer) so the saved
   theme applies before first paint; everything else waits for the DOM.
   Nothing is saved except the theme choice (localStorage, guarded). */
(function () {
  'use strict';
  var root = document.documentElement;
  var KEY = 'mrp-theme';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function store(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ } }
  function effective() {
    var t = root.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return mq && mq.matches ? 'dark' : 'light';
  }
  function syncTheme() {
    var dark = effective() === 'dark';
    root.classList.toggle('is-dark', dark);
    var btns = document.querySelectorAll('.theme-btn');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
  var s = stored();
  if (s === 'dark' || s === 'light') root.setAttribute('data-theme', s);
  syncTheme();
  if (mq && mq.addEventListener) mq.addEventListener('change', syncTheme);

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
  function show(el, yes) { if (el) { if (yes) el.removeAttribute('hidden'); else el.setAttribute('hidden', ''); } }
  function emit(el, name, detail) {
    var e; try { e = new CustomEvent(name, { bubbles: true, detail: detail }); } catch (x) { e = document.createEvent('CustomEvent'); e.initCustomEvent(name, true, false, detail); }
    el.dispatchEvent(e);
  }
  function scrollTo(el) { if (el && el.scrollIntoView) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }

  /* ---------------------------------------------------- header */
  function initHeader() {
    $$('.theme-btn').forEach(function (b) {
      on(b, 'click', function () {
        var next = effective() === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next); store(next); syncTheme();
      });
    });
    syncTheme();
    $$('.lang').forEach(function (l) {
      var b = $('.lang-btn', l), m = $('.lang-menu', l);
      on(b, 'click', function (e) {
        e.stopPropagation();
        var open = b.getAttribute('aria-expanded') === 'true';
        b.setAttribute('aria-expanded', open ? 'false' : 'true'); show(m, !open);
      });
    });
    on(document, 'click', function () { $$('.lang-btn').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); }); $$('.lang-menu').forEach(function (m) { show(m, false); }); });
    on(document, 'keydown', function (e) { if (e.key === 'Escape') { $$('.lang-btn[aria-expanded="true"]').forEach(function (b) { b.click(); b.focus(); }); } });
    var fill = $('.readbar-fill');
    if (fill) {
      var tick = function () {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        var p = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 1;
        fill.style.transform = 'scaleX(' + p + ')';
      };
      on(window, 'scroll', tick); on(window, 'resize', tick); tick();
    }
  }

  /* ---------------------------------------------------- long-equation boxes */
  function eqUpdate(box) {
    var sc = box.querySelector('.eqbox-scroll');
    if (!sc) return;
    var over = sc.scrollWidth > sc.clientWidth + 2;
    box.classList.toggle('is-overflow', over);
    box.classList.toggle('is-scrolled', sc.scrollLeft > 2);
    box.classList.toggle('at-end', sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 2);
    if (over) sc.setAttribute('tabindex', '0'); else sc.removeAttribute('tabindex');
  }
  function initEq(scope) {
    $$('.eqbox', scope).forEach(function (box) {
      eqUpdate(box);
      if (!box._eq) { box._eq = 1; on(box.querySelector('.eqbox-scroll'), 'scroll', function () { eqUpdate(box); }); }
    });
  }
  var rT;
  on(window, 'resize', function () { clearTimeout(rT); rT = setTimeout(function () { initEq(document); if (typeof initTableCue === 'function') initTableCue(document); }, 120); });

  /* ---------------------------------------------------- worked-example steps */
  function initSteps(scope) {
    $$('[data-steps]', scope).forEach(function (w) {
      if (w._s) return; w._s = 1;
      var steps = $$('.step', w), ctl = $('.steps-ctl', w);
      var bn = $('[data-act="next"]', ctl), ba = $('[data-act="all"]', ctl), bh = $('[data-act="hide"]', ctl);
      var shown = 1;
      function render() {
        steps.forEach(function (s, i) { s.classList.toggle('is-hidden', i >= shown); });
        var all = shown >= steps.length;
        show(bn, !all); show(ba, !all); show(bh, all);
        initEq(w);
      }
      on(bn, 'click', function () { shown++; render(); var s = steps[shown - 1]; if (s) { s.setAttribute('tabindex', '-1'); s.focus({ preventScroll: true }); } });
      on(ba, 'click', function () { shown = steps.length; render(); });
      on(bh, 'click', function () { shown = 0; render(); bn.focus(); });
      show(ctl, true); render();
    });
  }

  /* ---------------------------------------------------- MCQ widgets */
  var OK_TITLES = ['Correct.', 'Correct — well reasoned.', 'Yes, that’s it.'];
  function initMcq(scope) {
    $$('.mcq', scope).forEach(function (w) {
      if (w._m) return; w._m = 1;
      var mode = w.getAttribute('data-mode'), ans = w.getAttribute('data-answer');
      var opts = $$('.opt', w), fb = $('.fb', w), title = $('.fb-title', w);
      var check = $('.check-btn', w), sol = $('.sol', w), solBtn = $('.sol-btn', w);
      var hintB = $('.hint-btn', w), hintBox = $('.hint-box', w);
      var picked = null, done = false;
      function fbFor(k) { return $('.fb-text[data-key="' + k + '"]', w); }
      function showFb(k, ok) {
        $$('.fb-text', w).forEach(function (t) { show(t, false); });
        fb.classList.remove('fb--ok', 'fb--no');
        fb.classList.add(ok ? 'fb--ok' : 'fb--no');
        title.textContent = ok ? (mode === 'check' ? OK_TITLES[1] : OK_TITLES[0]) : (mode === 'check' || mode === 'once' ? 'Not this time.' : 'Not quite — try again.');
        var mine = fbFor(k), right = fbFor(ans), all = $('.fb-text--all', w);
        if (ok) { show(mine || right, true); }
        else {
          if (mine) show(mine, true);
          if ((mode === 'check' || mode === 'once') && right) show(right, true);
        }
        if (all) show(all, true);
        show(fb, true);
      }
      function reveal() { if (sol) { show(sol, true); show(solBtn, false); initSteps(sol); initEq(sol); } }
      function finish(ok) {
        done = true;
        opts.forEach(function (o) {
          var k = o.getAttribute('data-key');
          o.classList.remove('is-selected');
          if (k === ans) o.classList.add('is-right');
          else if (k === picked) o.classList.add('is-wrong');
          else o.classList.add('is-dim');
          o.setAttribute('aria-disabled', 'true');
          if (mode === 'check' || mode === 'once') {
            var word = $('.opt-no-word', o); if (word) word.textContent = 'Your answer';
            var okw = $('.opt-state--ok span', o); if (okw) okw.textContent = (k === picked) ? 'Correct' : 'Correct answer';
          }
        });
        if (check) show(check, false);
        if (hintB) show(hintB, false);
        showFb(picked, ok);
        if (ok || mode !== 'retry') reveal();
        emit(w, 'mrp:answered', { correct: ok });
      }
      opts.forEach(function (o) {
        on(o, 'click', function () {
          if (done) return;
          var k = o.getAttribute('data-key');
          if (mode === 'test') {
            opts.forEach(function (x) { x.classList.toggle('is-selected', x === o); x.setAttribute('aria-pressed', x === o ? 'true' : 'false'); });
            w.setAttribute('data-picked', k); emit(w, 'mrp:picked', { key: k }); return;
          }
          if (mode === 'check') {
            picked = k;
            opts.forEach(function (x) { x.classList.toggle('is-selected', x === o); x.setAttribute('aria-pressed', x === o ? 'true' : 'false'); });
            check.disabled = false; return;
          }
          picked = k;
          if (mode === 'once') { finish(k === ans); return; }
          // retry: mark this option, keep going until right
          o.setAttribute('aria-pressed', 'true');
          if (k === ans) { opts.forEach(function (x) { if (x !== o && !x.classList.contains('is-wrong')) x.classList.add('is-dim'); }); finish(true); }
          else {
            o.classList.add('is-wrong'); showFb(k, false);
            if (!w._wrongOnce) { w._wrongOnce = 1; emit(w, 'mrp:answered', { correct: false, first: true }); }
          }
        });
      });
      on(check, 'click', function () { if (picked) finish(picked === ans); });
      on(hintB, 'click', function () { var o = hintB.getAttribute('aria-expanded') === 'true'; hintB.setAttribute('aria-expanded', o ? 'false' : 'true'); show(hintBox, !o); });
      on(solBtn, 'click', reveal);
    });
  }

  /* ---------------------------------------------------- self-check (written) */
  function initSelf(scope) {
    $$('.selfcheck', scope).forEach(function (w) {
      if (w._c) return; w._c = 1;
      var btn = $('.sc-show', w), ans = $('.sc-answer', w), res = $('.sc-result', w);
      on(btn, 'click', function () { show(ans, true); show(btn, false); initSteps(ans); initEq(ans); emit(w, 'mrp:shown', {}); });
      function mark(ok) {
        $('.sc-yes', w).setAttribute('aria-pressed', ok ? 'true' : 'false');
        $('.sc-no', w).setAttribute('aria-pressed', ok ? 'false' : 'true');
        if (res) { res.textContent = ok ? 'Nice — marked as known.' : 'Marked “not yet”. Come back to this one.'; res.classList.toggle('is-ok', ok); }
        emit(w, 'mrp:answered', { correct: ok, self: true });
      }
      on($('.sc-yes', w), 'click', function () { mark(true); });
      on($('.sc-no', w), 'click', function () { mark(false); });
      var pts = $$('.point', w), total = $('.pt-n', w);
      pts.forEach(function (p) {
        on(p, 'click', function () {
          p.setAttribute('aria-pressed', p.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
          var n = pts.filter(function (x) { return x.getAttribute('aria-pressed') === 'true'; }).length;
          if (total) total.textContent = n;
          emit(w, 'mrp:answered', { correct: n === pts.length, self: true, partial: n / pts.length });
        });
      });
    });
  }

  /* ---------------------------------------------------- PYQ switch */
  function initPyq() {
    $$('.pyq').forEach(function (c) {
      var open = $('.pyq-open', c), ans = $('.pyq-ans', c);
      function reveal() { show(ans, true); show(open, false); initSteps(ans); initEq(ans); }
      on(open, 'click', reveal);
      on(c, 'mrp:answered', function (e) { if (e.detail && e.detail.correct) reveal(); });
      $$('.seg-btn', c).forEach(function (b) {
        on(b, 'click', function () {
          var v = b.getAttribute('data-view');
          $$('.seg-btn', c).forEach(function (x) { var y = x === b; x.classList.toggle('is-on', y); x.setAttribute('aria-pressed', y ? 'true' : 'false'); });
          $$('.pyq-view', c).forEach(function (p) { show(p, p.getAttribute('data-view') === v); });
          initEq(c);
        });
      });
    });
  }

  /* ---------------------------------------------------- skip-check (T02) */
  function initSkip() {
    $$('.skipcheck').forEach(function (s) {
      var cards = $$('.qc-card', s), total = cards.length, res = {};
      on(s, 'mrp:answered', function (e) {
        var card = e.target.closest('.qc-card'); if (!card) return;
        if (e.detail.first) return;
        res[card.getAttribute('data-qid')] = !!e.detail.correct;
        var keys = Object.keys(res);
        if (keys.length < total) return;
        var n = keys.filter(function (k) { return res[k]; }).length;
        var box = $('.skip-result', s);
        show(box, true); show($('.skip-pass', s), n === total); show($('.skip-fail', s), n !== total);
        var sn = $('.skip-n', s); if (sn) sn.textContent = n;
      });
    });
  }

  /* ---------------------------------------------------- NCERT open/close all */
  function initNcert() {
    on($('[data-open-all]'), 'click', function () { $$('.sol-card').forEach(function (d) { d.open = true; }); initEq(document); });
    on($('[data-close-all]'), 'click', function () { $$('.sol-card').forEach(function (d) { d.open = false; }); });
    $$('.sol-card').forEach(function (d) { on(d, 'toggle', function () { if (d.open) { initEq(d); initSteps(d); } }); });
    if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t && t.tagName === 'DETAILS') t.open = true; }
  }

  /* ---------------------------------------------------- practice runner */
  function initPractice() {
    var r = $('[data-runner]'); if (!r) return;
    var items = $$('.pq', r), dotsEl = $('.pr-dots', r), countEl = $('.pr-count', r), hdr = $('.pr-hdr');
    var prev = $('.pr-prev', r), next = $('.pr-next', r), empty = $('.pr-empty', r), sel = $('.pr-topic-sel', r);
    var diff = 'all', topic = '', list = [], pos = 0, result = {};
    var m = /topic=(T\d+)/i.exec(location.hash || '');
    if (m) { topic = m[1].toUpperCase(); sel.value = topic; }
    function build() {
      list = items.filter(function (it) {
        return (diff === 'all' || it.getAttribute('data-diff') === diff) && (!topic || (' ' + it.getAttribute('data-topic') + ' ').indexOf(' ' + topic + ' ') >= 0);
      });
      pos = 0; render();
    }
    function render() {
      items.forEach(function (it) { show(it, false); });
      show(empty, !list.length); show(prev, !!list.length); show(next, !!list.length);
      dotsEl.innerHTML = '';
      list.forEach(function (it, i) {
        var d = document.createElement('span'); var q = it.getAttribute('data-qid');
        if (i === pos) d.className = 'is-now'; else if (result[q] === true) d.className = 'is-ok'; else if (result[q] === false) d.className = 'is-no';
        dotsEl.appendChild(d);
      });
      if (!list.length) { countEl.textContent = '0 questions'; if (hdr) hdr.textContent = 'No questions'; return; }
      var cur = list[pos]; show(cur, true); initEq(cur);
      var label = 'Question ' + (pos + 1) + ' of ' + list.length;
      countEl.textContent = label; if (hdr) hdr.textContent = label;
      prev.disabled = pos === 0;
      next.textContent = pos === list.length - 1 ? 'Back to the first question' : 'Next question →';
    }
    $$('.pr-filters .pill', r).forEach(function (b) {
      on(b, 'click', function () {
        diff = b.getAttribute('data-diff');
        $$('.pr-filters .pill', r).forEach(function (x) { var y = x === b; x.classList.toggle('is-on', y); x.setAttribute('aria-pressed', y ? 'true' : 'false'); });
        build();
      });
    });
    on(sel, 'change', function () { topic = sel.value; try { history.replaceState(null, '', topic ? '#topic=' + topic : location.pathname); } catch (e) { } build(); });
    on(prev, 'click', function () { if (pos > 0) { pos--; render(); scrollTo(r); } });
    on(next, 'click', function () { pos = pos < list.length - 1 ? pos + 1 : 0; render(); scrollTo(r); });
    on(r, 'mrp:answered', function (e) {
      var it = e.target.closest('.pq'); if (!it || e.detail.first) return;
      result[it.getAttribute('data-qid')] = !!e.detail.correct;
      var i = list.indexOf(it); var d = dotsEl.children[i];
      if (d && i !== pos) d.className = e.detail.correct ? 'is-ok' : 'is-no';
    });
    build();
  }

  /* ---------------------------------------------------- chapter test */
  function fmtTime(s) { s = Math.max(0, s); var m = Math.floor(s / 60), x = s % 60; return m + ':' + (x < 10 ? '0' : '') + x; }
  function fmtMarks(v) {
    var w = Math.floor(v + 1e-9), f = Math.round((v - w) * 4);
    var fr = ['', '¼', '½', '¾'][f] || '';
    return (w === 0 && fr) ? fr : (w + fr);
  }
  function initTest() {
    var t = $('.test'); if (!t) return;
    var intro = $('.test-intro', t), run = $('.test-run', t), resEl = $('.test-results', t);
    var qs = $$('.tq', t), chips = $$('.nav-chip', t), timerEl = $('.timer-t', t), timerBox = $('.timer', t);
    var minutes = +t.getAttribute('data-minutes'), total = +t.getAttribute('data-total');
    var cur = 0, left = minutes * 60, iv = null, startAt = 0, endAt = 0;
    function answered(q) {
      if (q.getAttribute('data-kind') === 'mcq') return !!$('.mcq', q).getAttribute('data-picked');
      var ta = $('.test-ans', q); return !!(ta && ta.value.trim());
    }
    function flagged(q) { return $('.flag-btn', q).getAttribute('aria-pressed') === 'true'; }
    function paint() {
      chips.forEach(function (c, i) {
        var q = qs[i];
        c.className = 'nav-chip' + (i === cur ? ' is-now' : flagged(q) ? ' is-flag' : answered(q) ? ' is-done' : '');
        var st = i === cur ? 'current' : flagged(q) ? 'flagged' : answered(q) ? 'answered' : 'not answered yet';
        c.setAttribute('aria-label', 'Question ' + (i + 1) + ', ' + st);
        if (i === cur) c.setAttribute('aria-current', 'step'); else c.removeAttribute('aria-current');
      });
    }
    function go(i) {
      cur = Math.max(0, Math.min(qs.length - 1, i));
      qs.forEach(function (q, j) { show(q, j === cur); });
      $('.tq-prev', t).disabled = cur === 0;
      $('.tq-next', t).textContent = cur === qs.length - 1 ? 'Review & submit' : 'Question ' + (cur + 2) + ' →';
      $('.tq-prev', t).textContent = cur === 0 ? '← Previous' : '← Question ' + cur;
      paint(); initEq(qs[cur]);
    }
    function tick() {
      left = Math.round((endAt - Date.now()) / 1000);
      timerEl.textContent = fmtTime(left);
      timerBox.classList.toggle('is-low', left <= 300);
      if (left <= 0) { submit(true); }
    }
    on($('.test-start', t), 'click', function () {
      show(intro, false); show(run, true);
      startAt = Date.now(); endAt = startAt + minutes * 60000; tick(); iv = setInterval(tick, 1000);
      go(0); scrollTo(run);
    });
    chips.forEach(function (c, i) { on(c, 'click', function () { go(i); }); });
    on($('.tq-prev', t), 'click', function () { go(cur - 1); });
    on($('.tq-next', t), 'click', function () { if (cur === qs.length - 1) openConfirm(); else go(cur + 1); });
    qs.forEach(function (q) {
      var f = $('.flag-btn', q);
      on(f, 'click', function () { var p = f.getAttribute('aria-pressed') === 'true'; f.setAttribute('aria-pressed', p ? 'false' : 'true'); $('span', f).textContent = p ? 'Flag for review' : 'Flagged — come back later'; paint(); });
      on(q, 'mrp:picked', paint);
      var ta = $('.test-ans', q); on(ta, 'input', paint);
      $$('.fkey', q).forEach(function (k) {
        on(k, 'click', function () {
          if (!ta) return;
          var s0 = ta.selectionStart, s1 = ta.selectionEnd, v = ta.value;
          if (k.hasAttribute('data-ins')) { var ins = k.getAttribute('data-ins'); ta.value = v.slice(0, s0) + ins + v.slice(s1); ta.selectionStart = ta.selectionEnd = s0 + ins.length; }
          else {
            var sub = '₀₁₂₃₄₅₆₇₈₉', i0 = s0;
            while (i0 > 0 && /[0-9]/.test(v[i0 - 1])) i0--;
            var digits = v.slice(i0, s0).replace(/[0-9]/g, function (d) { return sub[+d]; });
            ta.value = v.slice(0, i0) + digits + v.slice(s0); ta.selectionStart = ta.selectionEnd = s0;
          }
          ta.focus(); paint();
        });
      });
      $$('.opt-choose .pill', q).forEach(function (b) {
        on(b, 'click', function () {
          $$('.opt-choose .pill', q).forEach(function (x) { var y = x === b; x.classList.toggle('is-on', y); x.setAttribute('aria-pressed', y ? 'true' : 'false'); });
          q.setAttribute('data-opt', b.getAttribute('data-opt'));
        });
      });
    });
    var conf = $('.confirm', t);
    function openConfirm() {
      var a = qs.filter(answered).length, fl = qs.filter(flagged).length;
      $('.confirm-sum', t).textContent = 'You have answered ' + a + ' of ' + qs.length + ' questions' + (fl ? ' and flagged ' + fl : '') + '. You still have ' + fmtTime(left) + ' left.';
      show(conf, true); $('.confirm-no', t).focus();
    }
    on($('.test-submit-open', t), 'click', openConfirm);
    on($('.confirm-no', t), 'click', function () { show(conf, false); });
    on($('.confirm-yes', t), 'click', function () { submit(false); });

    var auto = 0, self = {};
    function submit(timeUp) {
      clearInterval(iv); show(conf, false); show(run, false); show(resEl, true);
      var used = Math.min(minutes * 60, Math.round((Date.now() - startAt) / 1000));
      $('.score-time', t).textContent = (timeUp ? 'Time is up. ' : '') + 'Time taken: ' + Math.ceil(used / 60) + ' min of ' + minutes + '.';
      // auto-mark section A
      auto = 0; var wrongs = 0, mcqN = 0;
      var autoBySec = {}, possBySec = {}, topicAuto = {};
      qs.forEach(function (q, i) {
        var sec = q.getAttribute('data-section'), mk = +q.getAttribute('data-marks');
        possBySec[sec] = (possBySec[sec] || 0) + mk;
        if (q.getAttribute('data-kind') !== 'mcq') return;
        mcqN++;
        var w = $('.mcq', q), p = w.getAttribute('data-picked'), a = w.getAttribute('data-answer'), ok = p === a;
        if (ok) { auto += mk; autoBySec[sec] = (autoBySec[sec] || 0) + mk; }
        (q.getAttribute('data-topics') || '').split(' ').forEach(function (tp) { if (!tp) return; topicAuto[tp] = topicAuto[tp] || [0, 0]; topicAuto[tp][0] += ok ? mk : 0; topicAuto[tp][1] += mk; });
        var rv = $('.rev-item[data-n="' + (i + 1) + '"]', t);
        if (rv && !ok) {
          wrongs++; show(rv, true);
          var optText = p ? ($('.opt[data-key="' + p + '"] .opt-text', w) || {}).textContent : '';
          $('.rev-yours', rv).textContent = p ? 'Your answer: (' + p + ') ' + optText : 'You did not answer this one.';
          $('.rev-score', rv).textContent = '✗ 0 / ' + mk;
        } else if (rv) show(rv, false);
      });
      t._autoBySec = autoBySec; t._possBySec = possBySec; t._topicAuto = topicAuto;
      $('.rev-ok', t).textContent = wrongs ? ('The other ' + (mcqN - wrongs) + ' auto-marked answers were correct.') : ('All ' + mcqN + ' auto-marked answers were correct — well done.');
      // fill "you wrote"
      $$('.mark-q', t).forEach(function (mq) {
        var n = +mq.getAttribute('data-n'), q = qs[n - 1], ta = $('.test-ans', q);
        $('.yw-text', mq).textContent = ta && ta.value.trim() ? ta.value.trim() : '(Nothing written. If you answered on paper, mark that.)';
        var opt = q.getAttribute('data-opt') || 'A';
        $$('.mark-opt', mq).forEach(function (o) { show(o, o.getAttribute('data-opt') === opt); });
        if (!self[n]) self[n] = 0;
      });
      updateScore();
      resEl.focus({ preventScroll: true }); scrollTo(resEl);
    }
    function updateScore() {
      var selfTot = 0, pending = 0, bySec = {}, marked = {};
      var topic = JSON.parse(JSON.stringify(t._topicAuto || {}));
      $$('.mark-q', t).forEach(function (mq) {
        var n = +mq.getAttribute('data-n'), mk = +mq.getAttribute('data-marks');
        var vis = $$('.mark-opt', mq).filter(function (o) { return !o.hasAttribute('hidden'); })[0];
        var pts = vis ? $$('.point', vis) : [];
        var v = 0, any = false;
        pts.forEach(function (p) { if (p.getAttribute('aria-pressed') === 'true') { v += +p.getAttribute('data-v'); any = true; } });
        v = Math.min(v, mk);
        $('.mq-n', mq).textContent = fmtMarks(v);
        selfTot += v;
        var sec = qs[n - 1].getAttribute('data-section');
        bySec[sec] = (bySec[sec] || 0) + v;
        if (any) marked[sec] = true; else pending++;
        if (any) (mq.getAttribute('data-topics') || '').split(' ').forEach(function (tp) { if (!tp) return; topic[tp] = topic[tp] || [0, 0]; topic[tp][0] += v; topic[tp][1] += mk; });
      });
      var tot = auto + selfTot;
      $('.score-n', t).textContent = fmtMarks(tot);
      $('.score-note', t).innerHTML = pending ? ('MCQ and assertion–reason questions were marked for you. <b>' + pending + '</b> written answer' + (pending > 1 ? 's are' : ' is') + ' waiting for you to mark below.') : 'All answers marked. This is your total out of ' + total + '.';
      // section table
      var secs = Object.keys(t._possBySec || {});
      var html = '<div class="sec-row sec-row--h"><span>Section</span><span>Marks</span><span>Status</span></div>';
      secs.forEach(function (s) {
        var hasMcq = qs.some(function (q) { return q.getAttribute('data-section') === s && q.getAttribute('data-kind') === 'mcq'; });
        var hasW = qs.some(function (q) { return q.getAttribute('data-section') === s && q.getAttribute('data-kind') !== 'mcq'; });
        var got = (t._autoBySec[s] || 0) + (bySec[s] || 0), poss = t._possBySec[s];
        var status = hasW ? (marked[s] ? 'Marked by you' : 'Mark yourself') : '✓ Auto-marked';
        var shown = (hasW && !marked[s] && !hasMcq) ? '– / ' + poss : fmtMarks(got) + ' / ' + poss;
        html += '<div class="sec-row"><span>Section ' + s + '</span><span>' + shown + '</span><span class="' + (hasW ? '' : 'st-ok') + '">' + status + '</span></div>';
      });
      $('.sec-table', t).innerHTML = html;
      // topics
      var names = {}; $$('.tnames span', t).forEach(function (s) { names[s.getAttribute('data-t')] = [s.getAttribute('data-n'), s.textContent, s.getAttribute('data-href')]; });
      var th = '';
      Object.keys(topic).sort().forEach(function (k) {
        var v = topic[k], nm = names[k]; if (!nm || !v[1]) return;
        var strong = v[0] / v[1] >= 0.7;
        if (strong) th += '<div class="tr-row"><span><b>' + k + ' · ' + nm[1] + '</b><span class="muted">' + fmtMarks(v[0]) + ' of ' + fmtMarks(v[1]) + ' marks</span></span><span class="chip chip--mint">✓ Strong</span></div>';
        else th += '<a class="tr-row" href="' + nm[2] + '"><span><b>' + k + ' · ' + nm[1] + '</b><span class="muted">' + fmtMarks(v[0]) + ' of ' + fmtMarks(v[1]) + ' marks · revise the lesson</span></span><span class="chip chip--pink">Revise</span></a>';
      });
      $('.topic-res', t).innerHTML = th;
    }
    $$('.mark-q .point', t).forEach(function (p) {
      on(p, 'click', function () { p.setAttribute('aria-pressed', p.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); updateScore(); });
    });
    on($('.test-retake', t), 'click', function () {
      qs.forEach(function (q) {
        var w = $('.mcq', q); if (w) { w.removeAttribute('data-picked'); $$('.opt', w).forEach(function (o) { o.classList.remove('is-selected'); o.setAttribute('aria-pressed', 'false'); }); }
        var ta = $('.test-ans', q); if (ta) ta.value = '';
        var f = $('.flag-btn', q); f.setAttribute('aria-pressed', 'false'); $('span', f).textContent = 'Flag for review';
      });
      $$('.mark-q .point', t).forEach(function (p) { p.setAttribute('aria-pressed', 'false'); });
      show(resEl, false); show(intro, true); scrollTo(t);
    });
  }

  /* ---------------------------------------------------- rapid recall */
  function initRecall() {
    var r = $('.recall'); if (!r) return;
    var cards = $$('.flip', r), dots = $$('.recall-dots span', r), pos = $('.recall-pos b', r), done = $('.recall-done', r);
    var state = {}, order = cards.map(function (_, i) { return i; }), at = 0;
    function showCard() {
      cards.forEach(function (c) { show(c, false); });
      if (at >= order.length) {
        show(done, true);
        $('.recall-knew', r).textContent = Object.keys(state).filter(function (k) { return state[k]; }).length + ' of ' + cards.length;
        pos.textContent = 'Done'; return;
      }
      show(done, false);
      var c = cards[order[at]]; show(c, true);
      show($('.flip-front', c), true); show($('.flip-back', c), false);
      pos.textContent = (at + 1) + ' of ' + order.length;
      dots.forEach(function (d, i) { d.className = state[i] === true ? 'is-ok' : state[i] === false ? 'is-no' : ''; });
    }
    cards.forEach(function (c, i) {
      on($('.flip-front', c), 'click', function () { show($('.flip-front', c), false); show($('.flip-back', c), true); initEq(c); $('.flip-yes', c).focus({ preventScroll: true }); });
      on($('.flip-yes', c), 'click', function () { state[i] = true; at++; showCard(); focusNext(); });
      on($('.flip-no', c), 'click', function () { state[i] = false; at++; showCard(); focusNext(); });
    });
    function focusNext() { var c = cards[order[at]]; var b = c && !c.hasAttribute('hidden') ? $('.flip-front', c) : $('.recall-again', r); if (b) b.focus({ preventScroll: true }); }
    on($('.recall-again', r), 'click', function () { state = {}; order = cards.map(function (_, i) { return i; }); at = 0; showCard(); focusNext(); });
    on($('.recall-again-no', r), 'click', function () {
      order = cards.map(function (_, i) { return i; }).filter(function (i) { return state[i] !== true; });
      if (!order.length) order = cards.map(function (_, i) { return i; });
      at = 0; showCard(); focusNext();
    });
    showCard();
  }

  /* ---------------------------------------------------- spaced review */
  function initReview() {
    $$('.review-set').forEach(function (s) {
      var res = {};
      on(s, 'mrp:answered', function (e) {
        var c = e.target.closest('.qc-card'); if (!c) return;
        res[c.getAttribute('data-qid')] = !!e.detail.correct;
        var el = $('.set-score', s); show(el, true);
        $('.ss-n', s).textContent = Object.keys(res).filter(function (k) { return res[k]; }).length;
      });
    });
  }

  /* ---------------------------------------------------- subject filter */
  function initSubject() {
    $$('.filter-row .pill').forEach(function (b) {
      on(b, 'click', function () {
        var f = b.getAttribute('data-filter');
        $$('.filter-row .pill').forEach(function (x) { var y = x === b; x.classList.toggle('is-on', y); x.setAttribute('aria-pressed', y ? 'true' : 'false'); });
        $$('[data-ready]').forEach(function (r) { show(r, f === 'all' || r.getAttribute('data-ready') === '1'); });
        $$('.unit').forEach(function (u) { show(u, f === 'all' || !!$('[data-ready="1"]', u)); });
      });
    });
  }

  function initFig(scope) {
    $$('.fig--drawn', scope).forEach(function (fig) {
      var btn = $('.fig-toggle', fig);
      if (!btn) return;
      on(btn, 'click', function () {
        var exam = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', exam ? 'true' : 'false');
        show($('.fig-art--full', fig), !exam);
        show($('.fig-art--exam', fig), exam);
        $('.fig-toggle-txt', btn).textContent = exam ? 'Show full diagram' : 'Show exam version';
      });
    });
  }
  /* ---------------------------------------------------- "move the object" explorers (Ch 9 V6, V16)
     The SVG (content/<ch>/diagrams/<ID>.svg) carries data-xp + its world-to-px mapping; the default frame is drawn
     statically, and this redraws <g class="xp-dyn"> from the mirror / lens formula as the slider moves. */
  function initXp() {
    $$('svg[data-xp]').forEach(function (svg, idx) {
      var fig = svg.closest('.fig'), dyn = $('.xp-dyn', svg);
      if (!fig || !dyn || $('.xp-ctl', fig)) return;
      var D = function (k) { return parseFloat(svg.getAttribute('data-' + k)); };
      var mirror = svg.getAttribute('data-xp') === 'mirror';
      var f = D('f'), h = D('h'), x0 = D('x0'), x1 = D('x1'), y0 = D('y0'), y1 = D('y1'), k = D('k'), ky = k * D('vex'),
        left = D('left'), top = D('top');
      var INK = 'var(--ink, #1F2328)', ACC = 'var(--acc, #0A6C74)',
        RA = 'var(--dg-ray-a, #C2410C)', RB = 'var(--dg-ray-b, #6D28D9)';
      function X(x) { return left + (x - x0) * k; }
      function Y(y) { return top + (y1 - y) * ky; }
      function pt(p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }
      function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
      function nrm(d) { var L = Math.sqrt(d[0] * d[0] + d[1] * d[1]) || 1; return [d[0] / L, d[1] / L]; }
      function clip(p, d) {
        var ts = [];
        if (d[0] > 1e-9) ts.push((x1 + 2 - p[0]) / d[0]); else if (d[0] < -1e-9) ts.push((x0 - 2 - p[0]) / d[0]);
        if (d[1] > 1e-9) ts.push((y1 + 2 - p[1]) / d[1]); else if (d[1] < -1e-9) ts.push((y0 - 2 - p[1]) / d[1]);
        var t = Math.max(0, Math.min.apply(null, ts.length ? ts : [0]));
        return [p[0] + d[0] * t, p[1] + d[1] * t];
      }
      var cx = 2 * f;
      function xs(y) { return cx + (cx < 0 ? 1 : -1) * Math.sqrt(Math.max(cx * cx - y * y, 0)); }
      function hit(p, d) {
        var fx = p[0] - cx, fy = p[1], b = 2 * (fx * d[0] + fy * d[1]), c = fx * fx + fy * fy - cx * cx,
          q = Math.sqrt(Math.max(b * b - 4 * c, 0)), a1 = [p[0] + d[0] * (-b - q) / 2, p[1] + d[1] * (-b - q) / 2],
          a2 = [p[0] + d[0] * (-b + q) / 2, p[1] + d[1] * (-b + q) / 2];
        return Math.abs(a1[0]) < Math.abs(a2[0]) ? a1 : a2;
      }
      var out;
      function line(a, b, col, dash) {
        out.push('<path d="M' + pt(a) + ' L' + pt(b) + '" fill="none" stroke="' + col + '" stroke-width="' + (dash ? 1.5 : 1.8) + '"' +
          (dash ? ' stroke-dasharray="5 4"' : '') + '/>');
      }
      function ray(a, b, col, at) {
        line(a, b, col);
        var ax = X(a[0]), ay = Y(a[1]), bx = X(b[0]), by = Y(b[1]), L = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
        if (L < 22) return;
        var t = at || 0.5, mx = ax + (bx - ax) * t, my = ay + (by - ay) * t, an = Math.atan2(by - ay, bx - ax), s = 7.5;
        mx += Math.cos(an) * s * 0.45; my += Math.sin(an) * s * 0.45;
        out.push('<path d="M' + (mx + s * Math.cos(an + Math.PI - 0.42)).toFixed(1) + ',' + (my + s * Math.sin(an + Math.PI - 0.42)).toFixed(1) +
          ' L' + mx.toFixed(1) + ',' + my.toFixed(1) + ' L' + (mx + s * Math.cos(an + Math.PI + 0.42)).toFixed(1) + ',' +
          (my + s * Math.sin(an + Math.PI + 0.42)).toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="1.8"/>');
      }
      function arrowObj(x, hh, col, dash) {
        var X0 = X(x), Yb = Y(0), Yt = Y(hh), sg = hh > 0 ? 1 : -1, s = Math.abs(Yt - Yb) > 16 ? 7 : 5;
        out.push('<path d="M' + X0.toFixed(1) + ',' + Yb.toFixed(1) + ' L' + X0.toFixed(1) + ',' + Yt.toFixed(1) + '" fill="none" stroke="' +
          col + '" stroke-width="2.4"' + (dash ? ' stroke-dasharray="5 3.5"' : '') + '/>');
        out.push('<path d="M' + (X0 - s * 0.62).toFixed(1) + ',' + (Yt + sg * s).toFixed(1) + ' L' + X0.toFixed(1) + ',' + Yt.toFixed(1) +
          ' L' + (X0 + s * 0.62).toFixed(1) + ',' + (Yt + sg * s).toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="2"/>');
      }
      function text(x, y, s) {
        out.push('<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-family="Kalam, cursive" font-size="16" text-anchor="middle" fill="' +
          INK + '">' + s + '</text>');
      }
      function num(x, d) { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d).replace('-', '−'); }
      function near(a, b) { return Math.abs(a - b) < 0.26; }
      function describe(u, v, m) {
        var zone, pos, size, nat;
        if (mirror) {
          zone = near(u, cx) ? 'at C' : u < cx ? 'beyond C' : near(u, f) ? 'at F' : u < f ? 'between C and F' : 'between P and F';
          if (v === null) return { zone: zone, line: 'at infinity · highly enlarged · real and inverted' };
          if (v > 0) pos = 'behind the mirror';
          else pos = near(v, cx) ? 'at C' : v > cx ? 'between F and C' : 'beyond C';
        } else {
          zone = near(u, -2 * f) ? 'at 2F₁' : u < -2 * f ? 'beyond 2F₁' : near(u, -f) ? 'at F₁' : u < -f ? 'between 2F₁ and F₁' : 'between F₁ and O';
          if (v === null) return { zone: zone, line: 'at infinity · highly enlarged · real and inverted' };
          if (v < 0) pos = 'same side as the object';
          else pos = near(v, 2 * f) ? 'at 2F₂' : v < 2 * f ? 'between F₂ and 2F₂' : 'beyond 2F₂';
        }
        var am = Math.abs(m);
        size = Math.abs(am - 1) < 0.005 ? 'same size' : am > 1 ? 'enlarged' : 'diminished';
        nat = m < 0 ? 'real and inverted' : 'virtual and erect';
        return { zone: zone, line: pos + ' · ' + size + ' · ' + nat };
      }
      function draw(u) {
        out = [];
        var v, m, B = [u, h];
        if (mirror) { v = Math.abs(u - f) < 1e-9 ? null : 1 / (1 / f - 1 / u); m = v === null ? null : -v / u; }
        else { v = Math.abs(u + f) < 1e-9 ? null : 1 / (1 / f + 1 / u); m = v === null ? null : v / u; }
        var img = v === null ? null : [v, m * h], real = v !== null && (mirror ? v < 0 : v > 0);
        if (mirror) {
          var F = [f, 0], C = [cx, 0], H = [xs(h), h], d;
          ray(B, H, RA, 0.55);
          if (!img) { d = nrm(sub(F, H)); ray(H, clip(H, d), RA); }
          else if (real) { d = nrm(sub(img, H)); ray(H, clip(H, d), RA, 0.3); }
          else { d = nrm(sub(H, img)); ray(H, clip(H, d), RA, 0.35); line(H, img, RA, true); }
          if (Math.abs(u - cx) < 0.6) {            /* object at C: the C-ray is vertical, use the ray through F */
            var yF = h * f / (f - u), H2 = [xs(yF), yF];
            ray(B, H2, RB); ray(H2, [x0 - 2, yF], RB);
          } else {
            var dc = nrm(sub(C, B)); if (dc[0] < 0) dc = [-dc[0], -dc[1]];
            var H3 = hit(B, dc);
            ray(B, H3, RB, 0.35); ray(H3, clip(H3, nrm(sub(B, H3))), RB, 0.45);
            if (img && !real) line(H3, img, RB, true);
          }
        } else {
          var F2 = [f, 0], Hl = [0, h], dl = nrm(sub(F2, Hl));
          ray(B, Hl, RA, 0.55); ray(Hl, clip(Hl, dl), RA, real ? 0.3 : 0.5);
          if (img && !real) line(Hl, img, RA, true);
          ray(B, clip(B, nrm(sub([0, 0], B))), RB, 0.35);
          if (img && !real) line(B, img, RB, true);
        }
        arrowObj(u, h, INK, false);
        text(X(u), Y(h) - 7, 'B');
        if (img) {
          arrowObj(img[0], img[1], ACC, !real);
          if (img[0] > x0 && img[0] < x1 && img[1] > y0 && img[1] < y1) text(X(img[0]), img[1] < 0 ? Y(img[1]) + 17 : Y(img[1]) - 7, 'B′');
        }
        dyn.innerHTML = out.join('');
        var dsc = describe(u, v, m), dist = num(-u, 1).replace(/\.0$/, '');
        lab.textContent = dist + ' cm (' + dsc.zone + ')';
        slider.setAttribute('aria-valuetext', 'Object ' + dist + ' cm from the ' + (mirror ? 'mirror' : 'lens') + ', ' + dsc.zone);
        r1.textContent = 'Image: ' + dsc.line;
        var off = img && (img[0] < x0 || img[0] > x1 || img[1] < y0 || img[1] > y1);
        r2.textContent = v === null ? 'v = ∞ (rays leave parallel) · m: very large' :
          'v = ' + num(v, 1) + ' cm · m = ' + num(m, 2) + (off ? ' · image is off the picture' : '');
      }
      var id = 'xp-' + (svg.closest('[data-block-id]') ? svg.closest('[data-block-id]').getAttribute('data-block-id') : idx);
      var ctl = document.createElement('div');
      ctl.className = 'xp-ctl';
      ctl.innerHTML = '<label class="xp-label" for="' + id + '">Drag the object · distance from the ' + (mirror ? 'mirror' : 'lens') +
        ': <b class="xp-u"></b></label><input class="xp-range" type="range" id="' + id + '" min="' + D('umin') + '" max="' + D('umax') +
        '" step="0.5" value="' + D('u') + '"><p class="xp-read" aria-live="polite"><b class="xp-r1"></b><span class="xp-r2"></span></p>';
      var art = svg.closest('.fig-art');
      art.parentNode.insertBefore(ctl, art.nextSibling);
      var slider = $('.xp-range', ctl), lab = $('.xp-u', ctl), r1 = $('.xp-r1', ctl), r2 = $('.xp-r2', ctl);
      on(slider, 'input', function () { draw(parseFloat(slider.value)); });
      draw(parseFloat(slider.value));
    });
  }
  /* ---------------------------------------------------- angle explorer (Maths Ch 8, V4)
     One component, two modes. "sides" (Topic 1) replaces the static frame svg[data-ae] (content/C10-MATH-CH08/diagrams,
     drawn by trig_a.py v4 with the same numbers as AE below). "values" (Topic 4) is added after the static bar graph
     svg[data-ae-mount="values"] (V10): live sin/cos bars, a trail of visited special angles, emphasised snap chips.
     Hypotenuse AC = 1 unit (240 px); C moves on a quarter circle centred at A; B is the foot of the perpendicular from C.
     Values are computed from the angle; exact KaTeX values (pre-rendered at build time, AE_TEX) only at 0/30/45/60/90.
     Nothing is stored. */
  /*AE-TEX*/var AE_TEX = {"sin0":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>sin</mi><mo>⁡</mo><msup><mn>0</mn><mo>∘</mo></msup><mo>=</mo><mn>0</mn></mrow><annotation encoding=\"application/x-tex\">\\sin 0^\\circ = 0</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">sin</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6444em;\"></span><span class=\"mord\">0</span></span></span></span>","sin30":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>sin</mi><mo>⁡</mo><mn>3</mn><msup><mn>0</mn><mo>∘</mo></msup><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\sin 30^\\circ = \\dfrac{1}{2}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">sin</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\">3</span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0074em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">2</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","sin45":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>sin</mi><mo>⁡</mo><mn>4</mn><msup><mn>5</mn><mo>∘</mo></msup><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><msqrt><mn>2</mn></msqrt></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\sin 45^\\circ = \\dfrac{1}{\\sqrt{2}}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">sin</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\">4</span><span class=\"mord\"><span class=\"mord\">5</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.2514em;vertical-align:-0.93em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.2028em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord sqrt\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.9072em;\"><span class=\"svg-align\" style=\"top:-3em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\" style=\"padding-left:0.833em;\"><span class=\"mord\">2</span></span></span><span style=\"top:-2.8672em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"hide-tail\" style=\"min-width:0.853em;height:1.08em;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400em\" height=\"1.08em\" viewBox=\"0 0 400000 1080\" preserveAspectRatio=\"xMinYMin slice\"><path d=\"M95,702\nc-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14\nc0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54\nc44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10\ns173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429\nc69,-144,104.5,-217.7,106.5,-221\nl0 -0\nc5.3,-9.3,12,-14,20,-14\nH400000v40H845.2724\ns-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7\nc-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z\nM834 80h400000v40h-400000z\"/></svg></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.1328em;\"><span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.93em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","sin60":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>sin</mi><mo>⁡</mo><mn>6</mn><msup><mn>0</mn><mo>∘</mo></msup><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><msqrt><mn>3</mn></msqrt><mn>2</mn></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\sin 60^\\circ = \\dfrac{\\sqrt{3}}{2}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">sin</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\">6</span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.2702em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.5842em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">2</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord sqrt\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.9072em;\"><span class=\"svg-align\" style=\"top:-3em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\" style=\"padding-left:0.833em;\"><span class=\"mord\">3</span></span></span><span style=\"top:-2.8672em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"hide-tail\" style=\"min-width:0.853em;height:1.08em;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400em\" height=\"1.08em\" viewBox=\"0 0 400000 1080\" preserveAspectRatio=\"xMinYMin slice\"><path d=\"M95,702\nc-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14\nc0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54\nc44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10\ns173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429\nc69,-144,104.5,-217.7,106.5,-221\nl0 -0\nc5.3,-9.3,12,-14,20,-14\nH400000v40H845.2724\ns-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7\nc-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z\nM834 80h400000v40h-400000z\"/></svg></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.1328em;\"><span></span></span></span></span></span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","sin90":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>sin</mi><mo>⁡</mo><mn>9</mn><msup><mn>0</mn><mo>∘</mo></msup><mo>=</mo><mn>1</mn></mrow><annotation encoding=\"application/x-tex\">\\sin 90^\\circ = 1</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">sin</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\">9</span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6444em;\"></span><span class=\"mord\">1</span></span></span></span>","cos0":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>cos</mi><mo>⁡</mo><msup><mn>0</mn><mo>∘</mo></msup><mo>=</mo><mn>1</mn></mrow><annotation encoding=\"application/x-tex\">\\cos 0^\\circ = 1</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">cos</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6444em;\"></span><span class=\"mord\">1</span></span></span></span>","cos30":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>cos</mi><mo>⁡</mo><mn>3</mn><msup><mn>0</mn><mo>∘</mo></msup><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><msqrt><mn>3</mn></msqrt><mn>2</mn></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\cos 30^\\circ = \\dfrac{\\sqrt{3}}{2}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">cos</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\">3</span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.2702em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.5842em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">2</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord sqrt\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.9072em;\"><span class=\"svg-align\" style=\"top:-3em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\" style=\"padding-left:0.833em;\"><span class=\"mord\">3</span></span></span><span style=\"top:-2.8672em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"hide-tail\" style=\"min-width:0.853em;height:1.08em;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400em\" height=\"1.08em\" viewBox=\"0 0 400000 1080\" preserveAspectRatio=\"xMinYMin slice\"><path d=\"M95,702\nc-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14\nc0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54\nc44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10\ns173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429\nc69,-144,104.5,-217.7,106.5,-221\nl0 -0\nc5.3,-9.3,12,-14,20,-14\nH400000v40H845.2724\ns-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7\nc-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z\nM834 80h400000v40h-400000z\"/></svg></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.1328em;\"><span></span></span></span></span></span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","cos45":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>cos</mi><mo>⁡</mo><mn>4</mn><msup><mn>5</mn><mo>∘</mo></msup><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><msqrt><mn>2</mn></msqrt></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\cos 45^\\circ = \\dfrac{1}{\\sqrt{2}}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">cos</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\">4</span><span class=\"mord\"><span class=\"mord\">5</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.2514em;vertical-align:-0.93em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.2028em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord sqrt\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.9072em;\"><span class=\"svg-align\" style=\"top:-3em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\" style=\"padding-left:0.833em;\"><span class=\"mord\">2</span></span></span><span style=\"top:-2.8672em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"hide-tail\" style=\"min-width:0.853em;height:1.08em;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400em\" height=\"1.08em\" viewBox=\"0 0 400000 1080\" preserveAspectRatio=\"xMinYMin slice\"><path d=\"M95,702\nc-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14\nc0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54\nc44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10\ns173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429\nc69,-144,104.5,-217.7,106.5,-221\nl0 -0\nc5.3,-9.3,12,-14,20,-14\nH400000v40H845.2724\ns-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7\nc-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z\nM834 80h400000v40h-400000z\"/></svg></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.1328em;\"><span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.93em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","cos60":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>cos</mi><mo>⁡</mo><mn>6</mn><msup><mn>0</mn><mo>∘</mo></msup><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>2</mn></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\cos 60^\\circ = \\dfrac{1}{2}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">cos</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\">6</span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0074em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">2</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","cos90":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>cos</mi><mo>⁡</mo><mn>9</mn><msup><mn>0</mn><mo>∘</mo></msup><mo>=</mo><mn>0</mn></mrow><annotation encoding=\"application/x-tex\">\\cos 90^\\circ = 0</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">cos</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\">9</span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6444em;\"></span><span class=\"mord\">0</span></span></span></span>","tan0":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>tan</mi><mo>⁡</mo><msup><mn>0</mn><mo>∘</mo></msup><mo>=</mo><mn>0</mn></mrow><annotation encoding=\"application/x-tex\">\\tan 0^\\circ = 0</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">tan</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6444em;\"></span><span class=\"mord\">0</span></span></span></span>","tan30":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>tan</mi><mo>⁡</mo><mn>3</mn><msup><mn>0</mn><mo>∘</mo></msup><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><msqrt><mn>3</mn></msqrt></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\tan 30^\\circ = \\dfrac{1}{\\sqrt{3}}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">tan</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\">3</span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.2514em;vertical-align:-0.93em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.2028em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord sqrt\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.9072em;\"><span class=\"svg-align\" style=\"top:-3em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\" style=\"padding-left:0.833em;\"><span class=\"mord\">3</span></span></span><span style=\"top:-2.8672em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"hide-tail\" style=\"min-width:0.853em;height:1.08em;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400em\" height=\"1.08em\" viewBox=\"0 0 400000 1080\" preserveAspectRatio=\"xMinYMin slice\"><path d=\"M95,702\nc-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14\nc0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54\nc44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10\ns173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429\nc69,-144,104.5,-217.7,106.5,-221\nl0 -0\nc5.3,-9.3,12,-14,20,-14\nH400000v40H845.2724\ns-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7\nc-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z\nM834 80h400000v40h-400000z\"/></svg></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.1328em;\"><span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.93em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","tan45":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>tan</mi><mo>⁡</mo><mn>4</mn><msup><mn>5</mn><mo>∘</mo></msup><mo>=</mo><mn>1</mn></mrow><annotation encoding=\"application/x-tex\">\\tan 45^\\circ = 1</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">tan</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\">4</span><span class=\"mord\"><span class=\"mord\">5</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6444em;\"></span><span class=\"mord\">1</span></span></span></span>","tan60":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>tan</mi><mo>⁡</mo><mn>6</mn><msup><mn>0</mn><mo>∘</mo></msup><mo>=</mo><msqrt><mn>3</mn></msqrt></mrow><annotation encoding=\"application/x-tex\">\\tan 60^\\circ = \\sqrt{3}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">tan</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\">6</span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:1.04em;vertical-align:-0.1328em;\"></span><span class=\"mord sqrt\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.9072em;\"><span class=\"svg-align\" style=\"top:-3em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\" style=\"padding-left:0.833em;\"><span class=\"mord\">3</span></span></span><span style=\"top:-2.8672em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"hide-tail\" style=\"min-width:0.853em;height:1.08em;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400em\" height=\"1.08em\" viewBox=\"0 0 400000 1080\" preserveAspectRatio=\"xMinYMin slice\"><path d=\"M95,702\nc-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14\nc0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54\nc44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10\ns173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429\nc69,-144,104.5,-217.7,106.5,-221\nl0 -0\nc5.3,-9.3,12,-14,20,-14\nH400000v40H845.2724\ns-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7\nc-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z\nM834 80h400000v40h-400000z\"/></svg></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.1328em;\"><span></span></span></span></span></span></span></span></span>","tan90":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>tan</mi><mo>⁡</mo><mn>9</mn><msup><mn>0</mn><mo>∘</mo></msup><mo>=</mo><mtext>not defined</mtext></mrow><annotation encoding=\"application/x-tex\">\\tan 90^\\circ = \\text{not defined}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mop\">tan</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\">9</span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6944em;\"></span><span class=\"mord text\"><span class=\"mord\">not defined</span></span></span></span></span>"};/*END-AE-TEX*/
  var AE = { ax: 40, ay: 272, L: 240, w: 360, h: 302 };
  var AE_SPECIAL = [0, 30, 45, 60, 90];
  function aeNum(v) { return v.toFixed(3); }
  function aeShort(v) { return String(parseFloat(v.toFixed(3))); }
  function initAe() {
    $$('svg[data-ae]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-ae-on')) return;
      art.setAttribute('data-ae-on', '1');
      aeBuild(art, 'sides', function (node) { art.innerHTML = ''; art.appendChild(node); });
    });
    $$('svg[data-ae-mount]').forEach(function (svg) {
      var fig = svg.closest('.fig'); if (!fig || fig.getAttribute('data-ae-on')) return;
      fig.setAttribute('data-ae-on', '1');
      var f = document.createElement('figure');
      f.className = 'fig fig--drawn fig--ae';
      f.innerHTML = '<div class="fig-art"></div><figcaption><b class="fig-title">Angle explorer · values mode</b>' +
        '<span class="fig-purpose">Drag C or use the slider: the sin bar grows and the cos bar shrinks as A opens. ' +
        'Tap 0°, 30°, 45°, 60° and 90° to see the exact values from the table.</span></figcaption>';
      fig.parentNode.insertBefore(f, fig.nextSibling);
      var art = $('.fig-art', f);
      aeBuild(art, 'values', function (node) { art.appendChild(node); });
    });
  }
  function aeBuild(art, mode, mount) {
    var NS = 'http://www.w3.org/2000/svg', A = { x: AE.ax, y: AE.ay }, L = AE.L, values = mode === 'values';
    var C_INK = 'var(--ink, #1F2328)', C_SOFT = 'var(--ink-soft, #57554D)', C_OPP = 'var(--dg-m-opp, #C2410C)',
      C_ADJ = 'var(--dg-m-adj, #1D5FBF)', C_ACC = 'var(--acc, #5B3FC4)', C_CARD = 'var(--card, #FFFFFF)';
    var uid = 'ae' + Math.random().toString(36).slice(2, 8);
    var root = document.createElement('div');
    root.className = 'ae ae--' + mode;
    var top = { x: A.x, y: A.y - L };
    var svgTxt = '<svg class="dg ae-svg" viewBox="0 0 ' + AE.w + ' ' + AE.h + '" role="img" aria-labelledby="' + uid + '-t" ' +
      'stroke-linecap="round" stroke-linejoin="round"><title id="' + uid + '-t">Right triangle ABC with the right angle at B and ' +
      'hypotenuse AC = 1. Angle A and the side lengths are given in the read-outs.</title>' +
      '<path d="M' + (A.x + L) + ',' + A.y + ' A' + L + ',' + L + ' 0 0 0 ' + top.x + ',' + top.y + '" fill="none" stroke="' + C_SOFT + '" stroke-width="1.2" stroke-dasharray="3 5"/>' +
      '<path d="M' + (A.x - 6) + ',' + A.y + ' L' + (A.x + L + 14) + ',' + A.y + '" fill="none" stroke="' + C_SOFT + '" stroke-width="1"/>' +
      '<g class="ae-trail"></g>' +
      '<path class="ae-tri" fill="var(--dg-m-shade, #F1EEFB)" stroke="none"/>' +
      '<path class="ae-wedge" fill="var(--dg-m-angle, #E6DFFB)" stroke="none"/><path class="ae-arc" fill="none" stroke="' + C_INK + '" stroke-width="1.5"/>' +
      '<path class="ae-hyp" fill="none" stroke="' + C_INK + '" stroke-width="2.4"/>' +
      '<path class="ae-bc" fill="none" stroke-width="3.4"/><path class="ae-ab" fill="none" stroke-width="3.4"/>' +
      '<path class="ae-sq" fill="none" stroke="' + C_INK + '" stroke-width="1.4"/>' +
      '<g class="ae-eye"><path d="M-13,0 Q0,-11.2 13,0 Q0,11.2 -13,0 Z" fill="' + C_CARD + '" stroke="' + C_INK + '" stroke-width="1.6"/>' +
      '<circle cx="3" cy="0" r="4.2" fill="' + C_INK + '"/><circle cx="4.3" cy="-1.3" r="1.2" fill="' + C_CARD + '"/>' +
      '<path d="M16,0 L22,0" fill="none" stroke="' + C_INK + '" stroke-width="1.3" stroke-dasharray="2 3"/></g>' +
      '<g class="ae-labs">' +
      '<text class="ae-lh" paint-order="stroke" stroke="' + C_CARD + '" stroke-width="4" stroke-linejoin="round" font-family="Kalam, cursive" font-size="16" font-weight="700" text-anchor="middle" fill="' + C_INK + '">hypotenuse = 1</text>' +
      '<text class="ae-lbc" paint-order="stroke" stroke="' + C_CARD + '" stroke-width="4" stroke-linejoin="round" font-family="Kalam, cursive" font-size="16" font-weight="700"></text>' +
      '<text class="ae-lab" paint-order="stroke" stroke="' + C_CARD + '" stroke-width="4" stroke-linejoin="round" font-family="Kalam, cursive" font-size="16" font-weight="700"></text></g>' +
      '<text class="ae-va" paint-order="stroke" stroke="' + C_CARD + '" stroke-width="4" stroke-linejoin="round" font-family="Lexend, sans-serif" font-size="16" font-weight="600" text-anchor="end" fill="' + C_INK + '">A</text>' +
      '<text class="ae-vb" paint-order="stroke" stroke="' + C_CARD + '" stroke-width="4" stroke-linejoin="round" font-family="Lexend, sans-serif" font-size="16" font-weight="600" text-anchor="middle" fill="' + C_INK + '">B</text>' +
      '<text class="ae-vc" paint-order="stroke" stroke="' + C_CARD + '" stroke-width="4" stroke-linejoin="round" font-family="Lexend, sans-serif" font-size="16" font-weight="600" text-anchor="end" fill="' + C_INK + '">C</text>' +
      '<text x="' + (AE.w - 8) + '" y="18" font-family="Kalam, cursive" font-size="15" text-anchor="end" fill="' + C_SOFT + '">drag C to change A</text>' +
      '<circle class="ae-knob" r="10" fill="' + C_ACC + '" stroke="' + C_CARD + '" stroke-width="2.5"/>' +
      '<circle class="ae-hit" r="26" fill="transparent" stroke="none"/></svg>';
    var bars = values ? '<svg class="dg ae-bars" viewBox="0 0 360 150" aria-hidden="true" focusable="false">' +
      '<path d="M96,130 L264,130" fill="none" stroke="' + C_INK + '" stroke-width="1.6"/>' +
      '<path d="M96,70 L264,70 M96,10 L264,10" fill="none" stroke="var(--grid-border, #D9E3EE)" stroke-width="1" stroke-dasharray="4 4"/>' +
      '<text x="88" y="135" font-family="Lexend, sans-serif" font-size="14" text-anchor="end" fill="' + C_SOFT + '">0</text>' +
      '<text x="88" y="75" font-family="Lexend, sans-serif" font-size="14" text-anchor="end" fill="' + C_SOFT + '">0.5</text>' +
      '<text x="88" y="15" font-family="Lexend, sans-serif" font-size="14" text-anchor="end" fill="' + C_SOFT + '">1</text>' +
      '<rect class="ae-bs" x="122" width="36" rx="2" fill="' + C_OPP + '" stroke="' + C_OPP + '" stroke-width="1"/>' +
      '<rect class="ae-bk" x="202" width="36" rx="2" fill="var(--dg-m-adj-bg, #DEE9FB)" stroke="' + C_ADJ + '" stroke-width="2.2"/>' +
      '<text class="ae-bsv" paint-order="stroke" stroke="' + C_CARD + '" stroke-width="4" stroke-linejoin="round" x="140" font-family="Lexend, sans-serif" font-size="14" text-anchor="middle" fill="' + C_INK + '"></text>' +
      '<text class="ae-bkv" paint-order="stroke" stroke="' + C_CARD + '" stroke-width="4" stroke-linejoin="round" x="220" font-family="Lexend, sans-serif" font-size="14" text-anchor="middle" fill="' + C_INK + '"></text>' +
      '<text x="140" y="148" font-family="Lexend, sans-serif" font-size="14" font-weight="600" text-anchor="middle" fill="' + C_INK + '">sin A</text>' +
      '<text x="220" y="148" font-family="Lexend, sans-serif" font-size="14" font-weight="600" text-anchor="middle" fill="' + C_INK + '">cos A</text>' +
      '<g class="ae-btrail"></g></svg>' : '';
    var chips = AE_SPECIAL.map(function (a) {
      return '<button type="button" class="ae-chip" data-a="' + a + '" aria-pressed="false">' + a + '°</button>';
    }).join('');
    root.innerHTML = '<div class="ae-main"><div class="ae-figs">' + svgTxt + bars + '</div>' +
      '<div class="ae-read"><p class="ae-r-ang"></p><p class="ae-r-c" hidden></p><p class="ae-r-sides"></p>' +
      '<p class="ae-r-sin"></p><p class="ae-r-cos"></p><p class="ae-r-tan"></p>' +
      '<div class="ae-exact" hidden><span class="ae-exact-h">Exact values</span><span class="ae-exact-v"></span></div></div></div>' +
      '<div class="ae-ctl"><label class="ae-label" for="' + uid + '-r">Angle A <b class="ae-lval"></b></label>' +
      '<input class="ae-range" type="range" id="' + uid + '-r" role="slider" min="0" max="90" step="1" value="30" aria-valuemin="0" aria-valuemax="90">' +
      '<div class="ae-chips" role="group" aria-label="Jump to a special angle">' + chips + '</div>' +
      (values ? '' : '<button type="button" class="fig-toggle ae-swap" aria-pressed="false">Stand at the other angle</button>') +
      '</div><p class="ae-live" aria-live="polite"></p>';
    mount(root);
    var svg = $('.ae-svg', root), q = function (c) { return $('.' + c, root); };
    var el = { tri: q('ae-tri'), wedge: q('ae-wedge'), arc: q('ae-arc'), hyp: q('ae-hyp'), bc: q('ae-bc'), ab: q('ae-ab'), sq: q('ae-sq'),
      eye: q('ae-eye'), labs: q('ae-labs'), lh: q('ae-lh'), lbc: q('ae-lbc'), lab: q('ae-lab'), va: q('ae-va'), vb: q('ae-vb'),
      vc: q('ae-vc'), knob: q('ae-knob'), hit: q('ae-hit'), trail: q('ae-trail'), bs: q('ae-bs'), bk: q('ae-bk'), bsv: q('ae-bsv'),
      bkv: q('ae-bkv'), btrail: q('ae-btrail'), rAng: q('ae-r-ang'), rC: q('ae-r-c'), rSides: q('ae-r-sides'), rSin: q('ae-r-sin'),
      rCos: q('ae-r-cos'), rTan: q('ae-r-tan'), exact: q('ae-exact'), exactV: q('ae-exact-v'), range: q('ae-range'), lval: q('ae-lval'),
      live: q('ae-live'), swap: q('ae-swap') };
    var deg = 30, atC = false, visited = {}, liveT = null, liveLast = 0;
    function P(x, y) { return x.toFixed(1) + ',' + y.toFixed(1); }
    function at(o, a, r) { var t = a * Math.PI / 180; return { x: o.x + r * Math.cos(t), y: o.y - r * Math.sin(t) }; }
    function wedgeD(o, a0, a1, r, fill) {
      var p0 = at(o, a0, r), p1 = at(o, a1, r), large = (a1 - a0) > 180 ? 1 : 0;
      return (fill ? 'M' + P(o.x, o.y) + ' L' : 'M') + P(p0.x, p0.y) + ' A' + r + ',' + r + ' 0 ' + large + ' 0 ' + P(p1.x, p1.y) + (fill ? ' Z' : '');
    }
    function setText(t, x, y, s, fill, anchor, rot) {
      t.setAttribute('x', x.toFixed(1)); t.setAttribute('y', y.toFixed(1)); t.textContent = s;
      if (fill) t.setAttribute('fill', fill);
      if (anchor) t.setAttribute('text-anchor', anchor);
      if (rot !== undefined) t.setAttribute('transform', rot ? 'rotate(' + rot.toFixed(2) + ' ' + x.toFixed(1) + ' ' + (y - 5).toFixed(1) + ')' : '');
    }
    function show(n, yes) { n.style.display = yes ? '' : 'none'; }
    function ratios(a) {
      /* computed from the angle; at exactly 0° and 90° the side that has shrunk to nothing is exactly 0 */
      var r = a * Math.PI / 180, s = a === 0 ? 0 : a === 90 ? 1 : Math.sin(r), c = a === 90 ? 0 : a === 0 ? 1 : Math.cos(r);
      return { s: s, c: c };
    }
    function drawFig() {
      var C = at(A, deg, L), B = { x: C.x, y: A.y }, bc = A.y - C.y, ab = B.x - A.x;
      el.tri.setAttribute('d', 'M' + P(A.x, A.y) + ' L' + P(B.x, B.y) + ' L' + P(C.x, C.y) + ' Z');
      el.hyp.setAttribute('d', 'M' + P(A.x, A.y) + ' L' + P(C.x, C.y));
      el.bc.setAttribute('d', 'M' + P(B.x, B.y) + ' L' + P(C.x, C.y));
      el.ab.setAttribute('d', 'M' + P(A.x, A.y) + ' L' + P(B.x, B.y));
      /* colours follow the ROLE of the side: opposite = colour 1, adjacent = colour 2 */
      el.bc.setAttribute('stroke', atC ? C_ADJ : C_OPP);
      el.ab.setAttribute('stroke', atC ? C_OPP : C_ADJ);
      show(el.bc, bc > 0.05); show(el.ab, ab > 0.05);
      if (bc >= 14 && ab >= 14) { el.sq.setAttribute('d', 'M' + P(B.x - 11, B.y) + ' L' + P(B.x - 11, B.y - 11) + ' L' + P(B.x, B.y - 11)); show(el.sq, true); }
      else show(el.sq, false);
      var eyeX, eyeY, eyeAng;
      if (!atC) {
        var r = Math.min(36, Math.max(ab * 0.45, 22));
        el.wedge.setAttribute('d', deg > 0 ? wedgeD(A, 0, deg, r, true) : '');
        el.arc.setAttribute('d', deg > 0 ? wedgeD(A, 0, deg, r, false) : '');
        eyeX = 18; eyeY = A.y - 26; eyeAng = deg / 2 - 14;
      } else {
        var cdeg = 90 - deg, a0 = 180 + deg, rc = Math.min(30, Math.max(bc * 0.4, 20));
        el.wedge.setAttribute('d', cdeg > 0 ? wedgeD(C, a0, 270, rc, true) : '');
        el.arc.setAttribute('d', cdeg > 0 ? wedgeD(C, a0, 270, rc, false) : '');
        var out = 45 + deg / 2, e = at(C, out, 34);
        eyeX = Math.min(e.x, AE.w - 16); eyeY = Math.max(e.y, 14); eyeAng = out + 180;
      }
      el.eye.setAttribute('transform', 'translate(' + eyeX.toFixed(1) + ' ' + eyeY.toFixed(1) + ') rotate(' + (-eyeAng).toFixed(1) + ')');
      /* hypotenuse label: along AC, outside (up-left side) */
      var mx = (A.x + C.x) / 2 - 13 * Math.sin(deg * Math.PI / 180), my = (A.y + C.y) / 2 - 13 * Math.cos(deg * Math.PI / 180);
      setText(el.lh, mx, my + 5, 'hypotenuse = 1', null, null, -deg);
      /* BC label: right of BC; AB label: under AB (beside B when AB is short) */
      var bcWord = atC ? 'adjacent' : 'opposite', abWord = atC ? 'opposite' : 'adjacent';
      setText(el.lbc, B.x + 9, Math.min((B.y + C.y) / 2 + 5, B.y - 6), bcWord, atC ? C_ADJ : C_OPP, 'start');
      show(el.lbc, bc > 0.05);
      if (ab >= 74) setText(el.lab, (A.x + B.x) / 2, A.y + 21, abWord, atC ? C_OPP : C_ADJ, 'middle');
      else setText(el.lab, B.x + 14, A.y + 21, abWord, atC ? C_OPP : C_ADJ, 'start');
      show(el.lab, ab > 0.05);
      setText(el.va, A.x - 10, A.y + 20, 'A');
      setText(el.vb, B.x, B.y + 20, 'B');
      setText(el.vc, C.x - 13, C.y - 12, 'C');
      show(el.vb, ab > 0.05 && bc > 0.05);
      el.knob.setAttribute('cx', C.x.toFixed(1)); el.knob.setAttribute('cy', C.y.toFixed(1));
      el.hit.setAttribute('cx', C.x.toFixed(1)); el.hit.setAttribute('cy', C.y.toFixed(1));
      if (values) {
        if (AE_SPECIAL.indexOf(deg) >= 0) visited[deg] = true;
        var tr = '', btr = '';
        AE_SPECIAL.forEach(function (a) {
          if (!visited[a]) return;
          var p = at(A, a, L), v = ratios(a);
          tr += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="' + C_SOFT + '" opacity=".55"/>';
          btr += '<path d="M118,' + (130 - v.s * 120).toFixed(1) + ' L162,' + (130 - v.s * 120).toFixed(1) + ' M198,' + (130 - v.c * 120).toFixed(1) +
            ' L242,' + (130 - v.c * 120).toFixed(1) + '" fill="none" stroke="' + C_SOFT + '" stroke-width="1.4" stroke-dasharray="2 3" opacity=".7"/>';
        });
        el.trail.innerHTML = tr; el.btrail.innerHTML = btr;
        var v = ratios(deg), hs = v.s * 120, hc = v.c * 120;
        el.bs.setAttribute('y', (130 - Math.max(hs, 3)).toFixed(1)); el.bs.setAttribute('height', Math.max(hs, 3).toFixed(1));
        el.bk.setAttribute('y', (130 - Math.max(hc, 3)).toFixed(1)); el.bk.setAttribute('height', Math.max(hc, 3).toFixed(1));
        el.bsv.setAttribute('y', (130 - hs - 7).toFixed(1)); el.bsv.textContent = aeNum(v.s);
        el.bkv.setAttribute('y', (130 - hc - 7).toFixed(1)); el.bkv.textContent = aeNum(v.c);
      }
    }
    function readouts() {
      var v = ratios(deg), ang = atC ? 90 - deg : deg, n = atC ? 'C' : 'A';
      /* standing at C: opposite = AB = cos A, adjacent = BC = sin A */
      var opp = atC ? v.c : v.s, adj = atC ? v.s : v.c;
      el.rAng.textContent = n + ' = ' + ang + '°';
      el.lval.textContent = '= ' + deg + '°';
      el.rC.textContent = 'C = 90° − A = ' + (90 - deg) + '°'; show(el.rC, atC); el.rC.hidden = !atC;
      el.rSides.textContent = opp === 0 ? 'opposite = 0, adjacent = hypotenuse = 1' :
        adj === 0 ? 'adjacent = 0, opposite = hypotenuse = 1' : 'opposite = ' + aeNum(opp) + ' · adjacent = ' + aeNum(adj);
      el.rSin.innerHTML = '<b>sin ' + n + '</b> = opposite ÷ hypotenuse = <b>' + aeNum(opp) + '</b>';
      el.rCos.innerHTML = '<b>cos ' + n + '</b> = adjacent ÷ hypotenuse = <b>' + aeNum(adj) + '</b>';
      var tanTxt = adj === 0 ? 'not defined (adjacent = 0)' : aeNum(opp / adj);
      el.rTan.innerHTML = '<b>tan ' + n + '</b> = opposite ÷ adjacent = <b>' + tanTxt + '</b>';
      var special = AE_SPECIAL.indexOf(ang) >= 0;
      el.exact.hidden = !special;
      if (special) el.exactV.innerHTML = ['sin', 'cos', 'tan'].map(function (f) {
        return '<span class="ae-ex">' + (AE_TEX[f + ang] || '') + '</span>';
      }).join('');
      var vt = 'A = ' + deg + ' degrees. ' + (atC ? 'Standing at C, C = ' + ang + ' degrees. ' : '') + 'sin ' + n + ' = ' + aeShort(opp) +
        ', cos ' + n + ' = ' + aeShort(adj) + ', tan ' + n + (adj === 0 ? ' not defined' : ' = ' + aeShort(opp / adj));
      el.range.setAttribute('aria-valuetext', vt);
      $$('.ae-chip', root).forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-a') === deg ? 'true' : 'false'); });
      /* polite live region, at most every 250 ms */
      var now = Date.now();
      clearTimeout(liveT);
      if (now - liveLast >= 250) { el.live.textContent = vt; liveLast = now; }
      else liveT = setTimeout(function () { el.live.textContent = vt; liveLast = Date.now(); }, 250 - (now - liveLast));
    }
    function set(a) {
      a = Math.max(0, Math.min(90, Math.round(a)));
      deg = a; el.range.value = String(a);
      drawFig(); readouts();
    }
    on(el.range, 'input', function () { set(parseFloat(el.range.value)); });
    on(el.range, 'keydown', function (e) {
      var k = e.key, d = e.shiftKey ? 5 : 1, n = null;
      if (k === 'ArrowRight' || k === 'ArrowUp') n = deg + d;
      else if (k === 'ArrowLeft' || k === 'ArrowDown') n = deg - d;
      else if (k === 'Home') n = 0; else if (k === 'End') n = 90;
      else if (k === 'PageUp') n = deg + 10; else if (k === 'PageDown') n = deg - 10;
      if (n !== null) { e.preventDefault(); set(n); }
    });
    $$('.ae-chip', root).forEach(function (b) { on(b, 'click', function () { set(+b.getAttribute('data-a')); }); });
    /* drag the handle at C */
    var dragging = false;
    function angleAt(e) {
      var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      var p = pt.matrixTransform(svg.getScreenCTM().inverse());
      var dx = p.x - A.x, dy = A.y - p.y;
      if (dx <= 0 && dy <= 0) return deg;
      if (dx <= 0) return 90;
      if (dy <= 0) return 0;
      return Math.atan2(dy, dx) * 180 / Math.PI;
    }
    on(el.hit, 'pointerdown', function (e) {
      dragging = true; e.preventDefault();
      try { el.hit.setPointerCapture(e.pointerId); } catch (x) { /* old browsers */ }
      root.classList.add('is-dragging');
    });
    on(el.hit, 'pointermove', function (e) { if (dragging) set(angleAt(e)); });
    function end() { if (dragging) { dragging = false; root.classList.remove('is-dragging'); } }
    on(el.hit, 'pointerup', end); on(el.hit, 'pointercancel', end); on(el.hit, 'lostpointercapture', end);
    if (el.swap) on(el.swap, 'click', function () {
      var go = function () {
        atC = !atC;
        el.swap.setAttribute('aria-pressed', atC ? 'true' : 'false');
        el.swap.textContent = atC ? 'Stand at A' : 'Stand at the other angle';
        drawFig(); readouts();
        el.labs.classList.remove('is-fading');
      };
      if (reduced) { go(); return; }
      el.labs.classList.add('is-fading');
      setTimeout(go, 100);
    });
    set(30);
  }

  /* ---------------------------------------------------- pH explorer (Science Ch 2, V9)
     svg[data-ph] is the static first view (content/C10-SCI-CH02/diagrams, drawn by _src/d_ph.py v9); initPh replaces it
     with the live explorer and re-uses its colour band (<g class="ph-ruler">). Three modes: Pick a substance, Mix acid and
     base, Strong or weak? Formulas and colour rules = _src/ph_model.py and clib.py (asserted there). Nothing is stored. */
  var PH_KW = 1e-14, PH_KA = 1.8e-5;
  var PH_UNI = ['red', 'red', 'red', 'orange', 'orange', 'yellow', 'yellow', 'green', 'blue', 'blue', 'blue', 'violet', 'violet', 'violet', 'violet'];
  var PH_HEX = { red: '#D7263D', orange: '#F28C28', yellow: '#F5D02F', green: '#3FA34D', blue: '#2563C9', violet: '#6B3FA0',
    purple: '#8A4FB8', pink: '#F06BA8', 'orange-brown': '#C9772B', 'reddish-brown': '#9C3D1E', 'lit-red': '#D64550', 'lit-blue': '#3B6FD4', 'tur-yellow': '#F2C230' };
  /* [name, pH, shown, note, fact] */
  var PH_SUBS = [
    ['1 M hydrochloric acid', 0, '0.0', '', 'A strong acid: almost every HCl molecule gives an H⁺ ion in water.'],
    ['gastric juice', 1.2, '1.2', 'NCERT value', 'Your stomach makes hydrochloric acid to help digestion.'],
    ['lemon juice', 2.2, '2.2', 'NCERT value', 'Lemons get their sour taste from citric acid.'],
    ['vinegar', 2.8, '2.8', 'range 2.4–3.4', 'Vinegar is a dilute solution of acetic acid, a weak acid.'],
    ['colourless aerated drink', 3.0, '3.0', 'range 2.5–4.0', 'Dissolved carbon dioxide (carbonic acid) and added acids make these drinks acidic.'],
    ['tomato juice', 4.2, '4.2', 'range 4.0–4.6', 'Tomatoes contain oxalic acid.'],
    ['black coffee', 5.0, '5.0', 'range 4.8–5.2', 'Coffee contains several weak acids, so it is mildly acidic.'],
    ['clean rain water', 5.6, '5.6', '', 'Rain below 5.6 is acid rain.'],
    ['fresh milk', 6.5, '6.5', 'range 6.4–6.8', 'Milk is very slightly acidic; as it turns sour, lactic acid forms and the pH falls.'],
    ['pure water', 7, '7', 'NCERT value', 'Pure water is neutral: it has equal numbers of H⁺ and OH⁻ ions.'],
    ['blood', 7.4, '7.4', 'NCERT value · range 7.35–7.45', 'Blood is slightly basic; your body keeps it between 7.35 and 7.45.'],
    ['sea water', 8.1, '8.1', 'range 7.9–8.3', 'Dissolved salts such as carbonates make sea water slightly basic.'],
    ['baking soda solution', 8.3, '8.3', 'range 8.0–8.5', 'Sodium hydrogencarbonate is a mild base, used in baking powder and antacids.'],
    ['toothpaste (most brands)', 8.5, '8.5', 'range 7.5–10', 'Most toothpastes are mildly basic to fight tooth decay (which starts below pH 5.5).'],
    ['soap solution', 10.0, '10.0', 'range 9.0–10.5', 'Soap solutions are basic, so they turn red litmus blue.'],
    ['milk of magnesia', 10, '10', 'NCERT value', 'A mild base used as an antacid.'],
    ['washing soda solution', 11.5, '11.5', 'range 11–12', 'Sodium carbonate solution is basic: it is the salt of a strong base and a weak acid.'],
    ['1 M sodium hydroxide', 14, '14', 'NCERT value', 'A strong base: it gives a large number of OH⁻ ions in water.']
  ];
  var PH_IND = [['universal', 'universal indicator'], ['litmus', 'litmus'], ['phenolphthalein', 'phenolphthalein'],
    ['methyl orange', 'methyl orange'], ['turmeric', 'turmeric']];
  var PH_CONC = [1, 0.1, 0.01, 0.001, 0.0001];
  function phClamp(p) { return Math.min(14, Math.max(0, p)); }
  function phFix(p) { var s = phClamp(p).toFixed(2); return s === '-0.00' ? '0.00' : s; }
  /* mixing with exact integer moles: concentrations in mM, volumes in tenths of a mL */
  function phMix(caM, vaT, cbM, vbT) {
    var n = caM * vaT - cbM * vbT, V = (vaT + vbT) / 10000, h;
    if (n >= 0) { var x = n * 1e-7 / V; h = (x + Math.sqrt(x * x + 4 * PH_KW)) / 2; }
    else { var y = -n * 1e-7 / V, oh = (y + Math.sqrt(y * y + 4 * PH_KW)) / 2; h = PH_KW / oh; }
    return { p: phClamp(-Math.log(h) / Math.LN10), n: n };
  }
  function phStrong(c) { return phClamp(-Math.log((c + Math.sqrt(c * c + 4 * PH_KW)) / 2) / Math.LN10); }
  function phWeak(c) { var x = (-PH_KA + Math.sqrt(PH_KA * PH_KA + 4 * PH_KA * c)) / 2; return { p: phClamp(-Math.log(x) / Math.LN10), per: Math.round(1000 * x / c) }; }
  /* universal indicator: bands meet half-way between whole numbers; exactly half-way belongs to the band further from 7 */
  function phUniWord(p) {
    p = phClamp(p);
    var edge = { 2.5: 'red', 4.5: 'orange', 6.5: 'yellow', 7.5: 'blue', 10.5: 'violet' };
    if (edge[p]) return edge[p];
    return PH_UNI[Math.round(p)];
  }
  function phMixHex(a, b, t) {
    var A = [1, 3, 5].map(function (i) { return parseInt(a.substr(i, 2), 16); }), B = [1, 3, 5].map(function (i) { return parseInt(b.substr(i, 2), 16); });
    return 'rgb(' + A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); }).join(',') + ')';
  }
  function phColour(ind, p) {
    p = phClamp(p);
    if (ind === 'universal') { var i = Math.min(13, Math.floor(p)); return { w: phUniWord(p), c: phMixHex(PH_HEX[PH_UNI[i]], PH_HEX[PH_UNI[i + 1]], p - i) }; }
    if (ind === 'litmus') return p < 4.5 ? { w: 'red', c: PH_HEX['lit-red'] } : p <= 8.3 ? { w: 'purple', c: PH_HEX.purple } : { w: 'blue', c: PH_HEX['lit-blue'] };
    if (ind === 'phenolphthalein') return p < 8.2 ? { w: 'colourless', c: 'var(--dg-clear, #EEF5F6)' } : { w: 'pink', c: PH_HEX.pink };
    if (ind === 'methyl orange') return p < 3.1 ? { w: 'red', c: PH_HEX.red } : p <= 4.4 ? { w: 'orange', c: PH_HEX.orange } : { w: 'yellow', c: PH_HEX.yellow };
    return p <= 7.4 ? { w: 'yellow', c: PH_HEX['tur-yellow'] } : p <= 8.6 ? { w: 'orange-brown', c: PH_HEX['orange-brown'] } : { w: 'reddish-brown', c: PH_HEX['reddish-brown'] };
  }
  function phNature(p) {
    return p < 3 ? 'strongly acidic' : p < 5 ? 'acidic' : p < 6.995 ? 'weakly acidic' : p <= 7.005 ? 'neutral' : p <= 9 ? 'weakly basic' : p < 11 ? 'basic' : 'strongly basic';
  }
  function phTube(cls, w, h) {
    var hw = w / 2 - 6, cx = w / 2, top = 10, bot = h - 4;
    return '<svg class="ph-tube ' + cls + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true" focusable="false">' +
      '<path class="ph-liq" d="M' + (cx - hw) + ',' + (top + 26) + ' L' + (cx - hw) + ',' + (bot - hw) + ' A' + hw + ',' + hw + ' 0 0 0 ' + (cx + hw) + ',' + (bot - hw) + ' L' + (cx + hw) + ',' + (top + 26) + ' Z" stroke="none"/>' +
      '<path d="M' + (cx - hw) + ',' + top + ' L' + (cx - hw) + ',' + (bot - hw) + ' A' + hw + ',' + hw + ' 0 0 0 ' + (cx + hw) + ',' + (bot - hw) + ' L' + (cx + hw) + ',' + top +
      '" fill="none" stroke="var(--ink, #1F2328)" stroke-width="2"/></svg>';
  }
  function initPh() {
    $$('svg[data-ph]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-ph-on')) return;
      art.setAttribute('data-ph-on', '1');
      var band = $('.ph-ruler', svg), bx0 = +band.getAttribute('data-x0'), bx1 = +band.getAttribute('data-x1'), by = +$('rect', band).getAttribute('y');
      band = band.cloneNode(true);
      phBuild(art, band, bx0, bx1, by);
    });
  }
  function phBuild(art, band, X0, X1, BY) {
    var uid = 'ph' + Math.random().toString(36).slice(2, 7), K = (X1 - X0) / 14;
    var S = { mode: 0, ind: 'universal', sub: 2, alk: false, puzzle: false, guess: null, added: 0, pts: [], conc: 1, dil: 0 };
    var root = document.createElement('div');
    root.className = 'ph';
    var tabs = ['Pick a substance', 'Mix acid and base', 'Strong or weak?'].map(function (t, i) {
      return '<button type="button" role="tab" class="ph-tab" id="' + uid + '-t' + i + '" aria-controls="' + uid + '-p" aria-selected="' + (i === 0) + '" tabindex="' + (i ? -1 : 0) + '">' + t + '</button>';
    }).join('');
    var inds = PH_IND.map(function (d, i) {
      return '<label class="ph-chip"><input type="radio" name="' + uid + '-ind" value="' + d[0] + '"' + (i ? '' : ' checked') + '><span>' + d[1] + '</span></label>';
    }).join('');
    var opts = PH_SUBS.map(function (s, i) { return '<option value="' + i + '">' + s[0] + ' · pH ' + s[2] + '</option>'; }).join('');
    var btns = PH_SUBS.map(function (s, i) { return '<button type="button" class="ph-sb" data-i="' + i + '" aria-pressed="false">' + s[0] + ' <b>' + s[2] + '</b></button>'; }).join('');
    var concs = PH_CONC.slice(0, 4).map(function (c, i) { return '<button type="button" class="ph-cc" data-i="' + i + '" aria-pressed="false">' + c + ' M</button>'; }).join('');
    var ticks = '';
    for (var t = 0; t <= 14; t++) {
      var x = (X0 + t * K).toFixed(1);
      ticks += '<path d="M' + x + ',66 L' + x + ',72" stroke="var(--ink, #1F2328)" stroke-width="1.3"/><text x="' + x + '" y="88" font-family="Lexend, sans-serif" font-size="14" text-anchor="middle" fill="var(--ink, #1F2328)">' + t + '</text>';
    }
    root.innerHTML =
      '<div class="ph-tabs" role="tablist" aria-label="pH explorer modes">' + tabs + '</div>' +
      '<fieldset class="ph-inds"><legend>Indicator</legend>' + inds + '</fieldset>' +
      '<div class="ph-panel" role="tabpanel" id="' + uid + '-p" aria-labelledby="' + uid + '-t0">' +
      '<div class="ph-main"><div class="ph-pic"><div class="ph-pic-1">' + phTube('ph-t1', 140, 220) + '</div>' +
      '<div class="ph-pic-2" hidden><svg class="ph-beaker" viewBox="0 0 140 220" aria-hidden="true" focusable="false"><rect class="ph-liq ph-bliq" x="22" width="96" stroke="none"/>' +
      '<path d="M14,36 Q22,38 22,46 L22,206 Q22,214 30,214 L110,214 Q118,214 118,206 L118,36" fill="none" stroke="var(--ink, #1F2328)" stroke-width="2"/>' +
      '<text x="112" y="55" font-family="Lexend, sans-serif" font-size="13" text-anchor="end" fill="var(--ink-soft, #57554D)">60 mL</text><path d="M118,60 l-8,0 M118,163 l-8,0" stroke="var(--ink-soft, #57554D)"/></svg></div>' +
      '<div class="ph-pic-3" hidden><div class="ph-pair"><div>' + phTube('ph-ta', 64, 200) + '<p class="ph-cw ph-cwa"></p></div><div>' + phTube('ph-tb', 64, 200) + '<p class="ph-cw ph-cwb"></p></div></div></div>' +
      '<p class="ph-cw ph-cw1"></p></div>' +
      '<div class="ph-read">' +
      /* Pick */
      '<div class="ph-m ph-m0"><label class="ph-sl" for="' + uid + '-s">Choose a substance</label><select class="ph-sel" id="' + uid + '-s">' + opts + '</select>' +
      '<div class="ph-list" role="group" aria-label="Choose a substance">' + btns + '</div>' +
      '<p class="ph-name"></p><p class="ph-big"></p><p class="ph-note"></p><p class="ph-nat"></p><p class="ph-fact"></p></div>' +
      /* Mix */
      '<div class="ph-m ph-m1" hidden><div class="ph-start" role="radiogroup" aria-label="Start with"><span>start with:</span>' +
      '<label class="ph-chip"><input type="radio" name="' + uid + '-st" value="acid" checked><span>acid in beaker</span></label>' +
      '<label class="ph-chip"><input type="radio" name="' + uid + '-st" value="alk"><span>alkali in beaker</span></label></div>' +
      '<p class="ph-setup"></p><div class="ph-btns"><button type="button" class="ph-add" data-t="10"></button><button type="button" class="ph-add" data-t="1">add 0.1 mL</button>' +
      '<button type="button" class="ph-add" data-t="50">add 5 mL</button><button type="button" class="ph-reset">start again</button></div>' +
      '<p class="ph-added"></p><p class="ph-big ph-mbig"></p><p class="ph-nat ph-mnat"></p><p class="ph-salt"></p><p class="ph-full" hidden>beaker full</p>' +
      '<p class="ph-banner" hidden>Neutral — pH 7. Acid and base have cancelled out: H<sup>+</sup> + OH<sup>−</sup> → H<sub>2</sub>O</p>' +
      '<svg class="ph-graph" viewBox="0 0 300 150" role="img" aria-label="Graph of pH against volume added"></svg>' +
      '<p class="ph-eq">NaOH + HCl → NaCl + H<sub>2</sub>O</p>' +
      '<button type="button" class="ph-pz-open">Try the textbook puzzle</button>' +
      '<div class="ph-pz" hidden><p>10 mL of this alkali needs 8 mL of the acid. Predict how much acid 20 mL needs, then test it.</p>' +
      '<p class="ph-pz-row"><label for="' + uid + '-g">Your prediction (mL)</label><input id="' + uid + '-g" class="ph-guess" type="number" inputmode="decimal" min="0" max="40" step="0.1">' +
      '<button type="button" class="ph-pz-go">Test it</button></p><p class="ph-pz-msg"></p></div></div>' +
      /* Strong or weak */
      '<div class="ph-m ph-m2" hidden><div class="ph-ccs" role="group" aria-label="Concentration of both acids">' + concs + '</div>' +
      '<button type="button" class="ph-dil">dilute both ×10</button><p class="ph-same">same concentration: <b class="ph-cv"></b> · <span class="ph-cword"></span></p>' +
      '<div class="ph-cols"><div><p class="ph-tn">hydrochloric acid (strong)</p><p class="ph-big ph-pa"></p><p class="ph-per ph-ra"></p></div>' +
      '<div><p class="ph-tn">acetic acid (weak)</p><p class="ph-big ph-pb"></p><p class="ph-per ph-rb"></p></div></div>' +
      '<p class="ph-cap">Same concentration, different strength — the strong acid has the lower pH.</p>' +
      '<p class="ph-cap">\'Strong\' and \'weak\' describe the acid; the pH tells you how acidic the solution is.</p>' +
      '<p class="ph-cap ph-cap3" hidden>Diluting changes the concentration, not the strength.</p></div>' +
      '</div></div>' +
      '<svg class="ph-rul" viewBox="0 0 360 110" role="img" aria-label="pH ruler from 0 to 14"><g class="ph-band"></g>' +
      '<path d="M' + X0 + ',66 L' + X1 + ',66" stroke="var(--ink, #1F2328)" stroke-width="1.6"/>' + ticks +
      [['acidic', 2.5], ['neutral 7', 7], ['basic', 11.5]].map(function (w) { return '<text x="' + (X0 + w[1] * K).toFixed(1) + '" y="106" font-family="Lexend, sans-serif" font-size="14" font-weight="600" text-anchor="middle" fill="var(--ink-soft, #57554D)">' + w[0] + '</text>'; }).join('') +
      '<g class="ph-ptr"><path d="M-8,0 L8,0 L0,13 Z" fill="var(--ink, #1F2328)"/></g>' +
      '<g class="ph-ptr ph-ptr2" style="display:none"><path d="M-8,0 L8,0 L0,13 Z" fill="var(--card, #FFF)" stroke="var(--ink, #1F2328)" stroke-width="1.6"/></g></svg>' +
            '<p class="ph-key" hidden>black pointer ▼ hydrochloric acid · white pointer ▽ acetic acid</p></div>' +
      '<p class="ph-live" aria-live="polite"></p>';
    art.innerHTML = '';
    art.appendChild(root);
    var q = function (c) { return $('.' + c, root); };
    var bandG = q('ph-band');
    band.setAttribute('transform', 'translate(0 ' + (22 - BY) + ')');
    bandG.appendChild(band);
    root._ph = { mix: phMix, strong: phStrong, weak: phWeak, uniWord: phUniWord, colour: phColour, fix: phFix };
    var liveT = null, liveLast = 0;
    function live(s) {
      var now = Date.now(); clearTimeout(liveT);
      if (now - liveLast >= 250) { q('ph-live').textContent = s; liveLast = now; }
      else liveT = setTimeout(function () { q('ph-live').textContent = s; liveLast = Date.now(); }, 250 - (now - liveLast));
    }
    function ptr(el, p) { el.setAttribute('transform', 'translate(' + (X0 + phClamp(p) * K).toFixed(2) + ' 4)'); }
    function indName() { return PH_IND.filter(function (d) { return d[0] === S.ind; })[0][1]; }
    function fill(sel, p) { var c = phColour(S.ind, p); $$(sel, root).forEach(function (e) { e.style.fill = c.c; }); return c.w; }
    function drawPick() {
      var s = PH_SUBS[S.sub], p = s[1];
      q('ph-sel').value = String(S.sub);
      $$('.ph-sb', root).forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-i') === S.sub ? 'true' : 'false'); });
      var w = fill('.ph-t1 .ph-liq', p);
      q('ph-cw1').textContent = indName() + ': ' + w;
      q('ph-name').textContent = s[0];
      $('.ph-m0 .ph-big', root).textContent = 'pH = ' + s[2];
      q('ph-note').textContent = s[3] ? '(' + s[3] + ')' : '';
      $('.ph-m0 .ph-nat', root).textContent = phNature(p);
      q('ph-fact').textContent = s[4];
      ptr(q('ph-ptr'), p);
      live(s[0] + ': pH ' + s[2] + ', ' + phNature(p) + '. ' + indName() + ': ' + w + '.');
    }
    function mixState() {
      if (S.puzzle) return phMix(100, S.added, 80, 200);
      return S.alk ? phMix(100, S.added, 100, 200) : phMix(100, 200, 100, S.added);
    }
    function drawGraph() {
      var g = '<path d="M30,10 L30,130 L290,130" fill="none" stroke="var(--ink, #1F2328)" stroke-width="1.4"/>' +
        '<path d="M30,70 L290,70" stroke="var(--ink-soft, #57554D)" stroke-dasharray="4 4"/>';
      [0, 7, 14].forEach(function (v) { g += '<text x="24" y="' + (134 - v * 120 / 14) + '" font-family="Lexend, sans-serif" font-size="13" text-anchor="end" fill="var(--ink-soft, #57554D)">' + v + '</text>'; });
      [0, 20, 40].forEach(function (v) { g += '<text x="' + (30 + v * 6.5) + '" y="147" font-family="Lexend, sans-serif" font-size="13" text-anchor="' + (v === 40 ? 'end' : v ? 'middle' : 'start') + '" fill="var(--ink-soft, #57554D)">' + v + ' mL</text>'; });
      g += '<text x="36" y="20" font-family="Lexend, sans-serif" font-size="13" fill="var(--ink-soft, #57554D)">pH</text>';
      var d = S.pts.map(function (pt, i) { return (i ? 'L' : 'M') + (30 + pt[0] * 6.5).toFixed(1) + ',' + (130 - pt[1] * 120 / 14).toFixed(1); }).join(' ');
      if (S.pts.length > 1) g += '<path d="' + d + '" fill="none" stroke="var(--acc, #0A6C74)" stroke-width="1.8"/>';
      S.pts.forEach(function (pt) { g += '<circle cx="' + (30 + pt[0] * 6.5).toFixed(1) + '" cy="' + (130 - pt[1] * 120 / 14).toFixed(1) + '" r="2.6" fill="var(--acc, #0A6C74)"/>'; });
      q('ph-graph').innerHTML = g;
    }
    function drawMix() {
      var r = mixState(), p = r.p, ml = (S.added / 10).toFixed(1), adding = (S.alk || S.puzzle) ? 'hydrochloric acid' : 'sodium hydroxide';
      $('.ph-add[data-t="10"]', root).textContent = 'add 1 mL ' + adding;
      q('ph-setup').textContent = S.puzzle ? 'Puzzle — beaker: 20.0 mL sodium hydroxide (0.080 M); adding hydrochloric acid (0.10 M)' :
        S.alk ? 'Beaker: 20.0 mL sodium hydroxide (0.10 M); adding hydrochloric acid (0.10 M)' : 'Beaker: 20.0 mL hydrochloric acid (0.10 M); adding sodium hydroxide (0.10 M)';
      q('ph-added').textContent = adding + ' added: ' + ml + ' mL';
      q('ph-mbig').textContent = 'pH = ' + phFix(p);
      q('ph-mnat').textContent = phNature(p);
      q('ph-salt').textContent = 'salt formed so far: ' + (S.added > 0 ? 'sodium chloride' : 'none yet');
      q('ph-banner').hidden = r.n !== 0;
      q('ph-full').hidden = S.added < 400;
      var lvl = 214 - (200 + S.added) / 600 * 154 * 1;
      var bl = q('ph-bliq'); bl.setAttribute('y', lvl.toFixed(1)); bl.setAttribute('height', (213 - lvl).toFixed(1));
      var w = fill('.ph-bliq', p);
      q('ph-cw1').textContent = indName() + ': ' + w;
      ptr(q('ph-ptr'), p);
      drawGraph();
      if (S.puzzle && r.n === 0) q('ph-pz-msg').textContent = 'Neutral at ' + ml + ' mL.' + (S.guess !== null ? ' You predicted ' + S.guess + ' mL' + (Math.abs(S.guess - 16) < 0.05 ? ' — spot on!' : '.') : '');
      live(adding + ' added ' + ml + ' mL. pH ' + phFix(p) + ', ' + phNature(p) + '. ' + indName() + ': ' + w + '.' + (r.n === 0 ? ' Neutral.' : ''));
    }
    function mixReset() { S.added = 0; S.pts = [[0, mixState().p]]; q('ph-pz-msg').textContent = S.puzzle && S.guess !== null ? 'Your prediction: ' + S.guess + ' mL. Add acid and watch for pH 7.' : ''; drawMix(); }
    function drawStrong() {
      var c = PH_CONC[S.conc], a = phStrong(c), b = phWeak(c);
      $$('.ph-cc', root).forEach(function (e) { e.setAttribute('aria-pressed', +e.getAttribute('data-i') === S.conc ? 'true' : 'false'); });
      q('ph-dil').disabled = S.conc >= 4;
      q('ph-cv').textContent = c + ' M';
      q('ph-cword').textContent = S.conc === 0 ? 'concentrated' : 'dilute';
      q('ph-pa').textContent = 'pH = ' + phFix(a);
      q('ph-pb').textContent = 'pH = ' + phFix(b.p);
      q('ph-ra').textContent = 'H⁺ ions released per 1000 acid molecules: 1000';
      q('ph-rb').textContent = 'H⁺ ions released per 1000 acid molecules: ' + b.per;
      var wa = fill('.ph-ta .ph-liq', a), wb = fill('.ph-tb .ph-liq', b.p);
      q('ph-cwa').textContent = 'HCl: ' + wa; q('ph-cwb').textContent = 'acetic: ' + wb;
      q('ph-cw1').textContent = indName();
      q('ph-cap3').hidden = S.dil < 2;
      ptr(q('ph-ptr'), a); ptr(q('ph-ptr2'), b.p);
      live(c + ' M. Hydrochloric acid pH ' + phFix(a) + ', ' + wa + '. Acetic acid pH ' + phFix(b.p) + ', ' + wb + '.');
    }
    function draw() {
      [0, 1, 2].forEach(function (i) { q('ph-m' + i).hidden = i !== S.mode; q('ph-pic-' + (i + 1)).hidden = i !== S.mode; });
      q('ph-ptr2').style.display = S.mode === 2 ? '' : 'none';
      q('ph-key').hidden = S.mode !== 2;
      [drawPick, drawMix, drawStrong][S.mode]();
    }
    var tabEls = $$('.ph-tab', root);
    function selectTab(i, focus) {
      S.mode = i;
      tabEls.forEach(function (b, j) { b.setAttribute('aria-selected', i === j ? 'true' : 'false'); b.tabIndex = i === j ? 0 : -1; });
      q('ph-panel').setAttribute('aria-labelledby', tabEls[i].id);
      if (focus) tabEls[i].focus();
      draw();
    }
    tabEls.forEach(function (b, i) {
      on(b, 'click', function () { selectTab(i); });
      on(b, 'keydown', function (e) {
        var n = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1;
        if (n >= 0) { e.preventDefault(); selectTab(n, true); }
      });
    });
    $$('input[name="' + uid + '-ind"]', root).forEach(function (r) { on(r, 'change', function () { if (r.checked) { S.ind = r.value; draw(); } }); });
    on(q('ph-sel'), 'change', function () { S.sub = +q('ph-sel').value; drawPick(); });
    $$('.ph-sb', root).forEach(function (b) { on(b, 'click', function () { S.sub = +b.getAttribute('data-i'); drawPick(); }); });
    $$('.ph-add', root).forEach(function (b) {
      on(b, 'click', function () {
        if (S.added >= 400) { q('ph-full').hidden = false; return; }
        S.added = Math.min(400, S.added + +b.getAttribute('data-t'));
        S.pts.push([S.added / 10, mixState().p]);
        drawMix();
      });
    });
    on(q('ph-reset'), 'click', mixReset);
    $$('input[name="' + uid + '-st"]', root).forEach(function (r) { on(r, 'change', function () { if (r.checked) { S.alk = r.value === 'alk'; S.puzzle = false; q('ph-pz').hidden = true; mixReset(); } }); });
    on(q('ph-pz-open'), 'click', function () { q('ph-pz').hidden = false; q('ph-guess').focus(); });
    on(q('ph-pz-go'), 'click', function () {
      var g = parseFloat(q('ph-guess').value);
      S.guess = isFinite(g) ? Math.round(g * 10) / 10 : null;
      S.puzzle = true; mixReset();
    });
    $$('.ph-cc', root).forEach(function (b) { on(b, 'click', function () { S.conc = +b.getAttribute('data-i'); S.dil = 0; drawStrong(); }); });
    on(q('ph-dil'), 'click', function () { if (S.conc < 4) { S.conc++; S.dil++; drawStrong(); } });
    S.pts = [[0, mixState().p]];
    draw();
  }

  /* ---------------------------------------------------- "Show answers" for question-view diagrams (Maths Ch 2 T03-V2)
     svg[data-reveal] carries its answers in <g class="dg-ans">; without JS they simply show. */
  function initReveal() {
    $$('svg[data-reveal]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-rv-on')) return;
      art.setAttribute('data-rv-on', '1');
      svg.classList.add('is-q');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'fig-toggle rv-btn'; b.setAttribute('aria-pressed', 'false'); b.textContent = 'Show answers';
      art.parentNode.insertBefore(b, art.nextSibling);
      on(b, 'click', function () {
        var showing = svg.classList.toggle('is-q') === false;
        b.setAttribute('aria-pressed', showing ? 'true' : 'false');
        b.textContent = showing ? 'Hide answers' : 'Show answers';
      });
    });
  }

  /* shared bits for the Maths explorers: exact integer helpers, live-region throttle */
  function mGcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function mMinus(s) { return String(s).replace(/-/g, '−'); }
  function mThrottle(fn, ms) {
    var last = 0, t = null;
    return function () {
      var now = Date.now(); clearTimeout(t);
      if (now - last >= ms) { last = now; fn(); } else t = setTimeout(function () { last = Date.now(); fn(); }, ms - (now - last));
    };
  }

  /* ---------------------------------------------------- HCF–LCM explorer (Maths Ch 1, T03-V9)
     svg[data-hl] is the static first view (content/C10-MATH-CH01/diagrams, _src/real_a.py v9); initHl replaces it.
     Exact integer arithmetic: trial division up to √n (n ≤ 99 999); every product stays below 2^53. Nothing is stored. */
  var HL_MAX = 99999;
  var HL_PRESETS = [['144 & 198', [144, 198]], ['1050 & 1386', [1050, 1386]], ['48, 60, 90', [48, 60, 90]],
    ['8, 12, 20 (test the product rule)', [8, 12, 20]], ['391 & 527', [391, 527]]];
  var HL_BAD = 'Enter a whole number from 2 to 99 999';
  function hlFact(n) { var f = {}, p = 2; while (p * p <= n) { while (n % p === 0) { f[p] = (f[p] || 0) + 1; n /= p; } p++; } if (n > 1) f[n] = (f[n] || 0) + 1; return f; }
  function hlSpf(n) { for (var p = 2; p * p <= n; p++) if (n % p === 0) return p; return n; }
  function hlSep(n) { var s = String(n); return s.length < 5 ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function hlPow(p, e, one) { return p + (e > 1 || one ? '<sup>' + e + '</sup>' : ''); }
  function hlKeys(f) { return Object.keys(f).map(Number).sort(function (a, b) { return a - b; }); }
  function hlFstr(f) { return hlKeys(f).map(function (p) { return hlPow(p, f[p]); }).join(' × '); }
  function hlParse(s) {
    s = String(s).replace(/[\s  ,]/g, '');
    if (!/^\d+$/.test(s)) return null;
    var n = parseInt(s, 10); return n >= 1 && n <= HL_MAX ? n : null;
  }
  function hlCalc(nums) {
    var fs = nums.map(hlFact), set = {};
    fs.forEach(function (f) { hlKeys(f).forEach(function (p) { set[p] = 1; }); });
    var primes = hlKeys(set), cells = [], hrow = [], lrow = [], h = 1, l = 1;
    primes.forEach(function (p) {
      var es = fs.map(function (f) { return f[p] || 0; }), common = es.every(function (e) { return e > 0; });
      var mn = Math.min.apply(null, es), mx = Math.max.apply(null, es);
      cells.push(es.map(function (e) { return { e: e, mn: e > 0 && common && e === mn, mx: e > 0 && e === mx }; }));
      hrow.push(common ? mn : 0); lrow.push(mx);
      h *= Math.pow(p, common ? mn : 0); l *= Math.pow(p, mx);
    });
    var pairwise = true;
    for (var i = 0; i < nums.length; i++) for (var j = i + 1; j < nums.length; j++) if (mGcd(nums[i], nums[j]) !== 1) pairwise = false;
    var prod = nums.reduce(function (a, b) { return a * b; }, 1);
    return { fs: fs, primes: primes, cells: cells, hrow: hrow, lrow: lrow, h: h, l: l, prod: prod, pairwise: pairwise };
  }
  function hlNode(x, y, s, leaf) {
    var w = Math.max(30, s.length * 9 + 14);
    return leaf ? '<ellipse cx="' + x + '" cy="' + y + '" rx="' + Math.max(15, w / 2) + '" ry="15" fill="var(--dg-m-band3, #EDE7FB)" stroke="var(--acc, #5B3FC4)" stroke-width="2.2"/>' +
      '<text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" font-family="Lexend, sans-serif" font-size="15" font-weight="600" fill="var(--ink, #1F2328)">' + s + '</text>'
      : '<rect x="' + (x - w / 2) + '" y="' + (y - 13) + '" width="' + w + '" height="26" rx="5" fill="var(--card, #FFF)" stroke="var(--ink, #1F2328)" stroke-width="1.5"/>' +
      '<text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" font-family="Lexend, sans-serif" font-size="15" font-weight="600" fill="var(--ink, #1F2328)">' + s + '</text>';
  }
  function hlPic(n, ladder) {
    /* factor tree: split off the smallest prime each time (same as the ladder); prime leaves circled to the left of the spine */
    var out = '', y = 22, rh = 38, cx = 112, lx = 62, q = n, leaves = [], h;
    var line = 'stroke="var(--ink-soft, #57554D)" stroke-width="1.4" fill="none"';
    if (hlSpf(n) === n) {
      out = hlNode(85, 24, String(n), true) + '<text x="85" y="62" text-anchor="middle" font-family="Kalam, cursive" font-size="16" font-weight="700" fill="var(--acc, #5B3FC4)">prime</text>';
      return { svg: out, h: 74, w: 170, label: n + ' is prime' };
    }
    if (ladder) {
      var rows = [], qq = n;
      while (qq > 1) { var pp = hlSpf(qq); rows.push([pp, qq]); qq /= pp; }
      rows.push([0, 1]);
      var top = 8, r = 30, xl = 62;
      out += '<rect x="28" y="' + top + '" width="30" height="' + (r * (rows.length - 1)) + '" rx="5" fill="var(--dg-m-opp-bg, #FCE7DA)"/>';
      rows.forEach(function (rw, i) {
        var yy = top + i * r + 21;
        if (rw[0]) out += '<text x="43" y="' + yy + '" text-anchor="middle" font-family="Lexend, sans-serif" font-size="16" font-weight="600" fill="var(--dg-m-opp, #C2410C)">' + rw[0] + '</text>';
        out += '<text x="' + (xl + 10) + '" y="' + yy + '" font-family="Lexend, sans-serif" font-size="16" fill="var(--ink, #1F2328)">' + rw[1] + '</text>';
        if (rw[0]) out += '<path d="M' + xl + ',' + (top + (i + 1) * r) + ' L' + (xl + 62) + ',' + (top + (i + 1) * r) + '" ' + line.replace('ink-soft, #57554D', 'ink, #1F2328') + '/>';
      });
      out += '<path d="M' + xl + ',' + (top + 2) + ' L' + xl + ',' + (top + r * (rows.length - 1)) + '" stroke="var(--ink, #1F2328)" stroke-width="1.6"/>';
      return { svg: out, h: top + r * rows.length + 6, w: 170, label: 'Repeated division of ' + n + ': divide by ' + rows.slice(0, -1).map(function (x) { return x[0]; }).join(', ') };
    }
    while (true) {
      if (hlSpf(q) === q) { out += hlNode(cx, y, String(q), true); leaves.push(q); break; }
      var p = hlSpf(q);
      out += '<path d="M' + (cx - 8) + ',' + (y + 13) + ' L' + (lx + 8) + ',' + (y + rh - 14) + '" ' + line + '/>' +
        '<path d="M' + cx + ',' + (y + 13) + ' L' + cx + ',' + (y + rh - 13) + '" ' + line + '/>';
      out += hlNode(cx, y, String(q), false) + hlNode(lx, y + rh, String(p), true);
      leaves.push(p); q /= p; y += rh;
    }
    h = y + 24;
    return { svg: out, h: h, w: 170, label: 'Factor tree of ' + n + ': prime leaves ' + leaves.sort(function (a, b) { return a - b; }).join(', ') };
  }
  function initHl() {
    $$('svg[data-hl]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-hl-on')) return;
      art.setAttribute('data-hl-on', '1');
      hlBuild(art);
    });
  }
  function hlBuild(art) {
    var uid = 'hl' + Math.random().toString(36).slice(2, 7), names = ['First number', 'Second number', 'Third number'];
    var root = document.createElement('div');
    root.className = 'hlx';
    root.innerHTML = '<div class="hl-ins">' + names.map(function (nm, i) {
      return '<div class="hl-in"' + (i === 2 ? ' hidden' : '') + '><label for="' + uid + '-' + i + '">' + nm + '</label>' +
        '<input id="' + uid + '-' + i + '" class="hl-box" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" aria-describedby="' + uid + '-e' + i + '">' +
        '<p class="hl-err" id="' + uid + '-e' + i + '" hidden></p></div>';
    }).join('') + '</div>' +
      '<button type="button" class="hl-add fig-toggle" aria-pressed="false">Add a third number</button>' +
      '<div class="hl-chips" role="group" aria-label="Try these numbers">' + HL_PRESETS.map(function (p, i) {
        return '<button type="button" class="hl-chip" data-i="' + i + '" aria-pressed="false">' + p[0] + '</button>';
      }).join('') + '</div>' +
      '<div class="hl-seg" role="group" aria-label="Tree / Ladder"><button type="button" class="hl-sv" data-v="tree" aria-pressed="true">Tree</button>' +
      '<button type="button" class="hl-sv" data-v="ladder" aria-pressed="false">Ladder</button></div>' +
      '<div class="hl-pics"></div>' +
      '<div class="hl-tw" role="region" aria-label="Prime-power table" tabindex="0"><table class="hl-t"></table></div>' +
      '<p class="hl-key"><span class="hl-m hl-mn" aria-hidden="true">▼</span> HCF: smallest power of each COMMON prime · ' +
      '<span class="hl-m hl-mx" aria-hidden="true">▲</span> LCM: largest power of EVERY prime · — = prime missing</p>' +
      '<div class="hl-res" aria-live="polite"></div>';
    art.innerHTML = '';
    art.appendChild(root);
    var q = function (c) { return $('.' + c, root); };
    var boxes = $$('.hl-box', root), wraps = $$('.hl-in', root), errs = $$('.hl-err', root);
    var S = { three: false, ladder: false, touched: [true, true, false], nums: [144, 198, null] };
    var timer = null;
    root._hl = { fact: hlFact, calc: hlCalc };
    function setBoxes(vals) {
      S.three = vals.length === 3;
      wraps[2].hidden = !S.three;
      boxes.forEach(function (b, i) { b.value = vals[i] !== undefined ? String(vals[i]) : ''; errs[i].hidden = true; errs[i].textContent = ''; b.removeAttribute('aria-invalid'); });
      S.touched = [true, true, S.three];
      q('hl-add').textContent = S.three ? 'Remove third number' : 'Add a third number';
      q('hl-add').setAttribute('aria-pressed', S.three ? 'true' : 'false');
    }
    function chipsState(vals) {
      $$('.hl-chip', root).forEach(function (c) {
        var p = HL_PRESETS[+c.getAttribute('data-i')][1];
        c.setAttribute('aria-pressed', vals && p.join(',') === vals.join(',') ? 'true' : 'false');
      });
    }
    function update() {
      var count = S.three ? 3 : 2, vals = [], bad = false;
      for (var i = 0; i < count; i++) {
        var raw = boxes[i].value, n = hlParse(raw);
        if (i === 2 && !S.touched[2] && raw.trim() === '') { continue; }   /* a third box nobody has typed in yet */
        if (n === null) { errs[i].textContent = HL_BAD; errs[i].hidden = false; boxes[i].setAttribute('aria-invalid', 'true'); bad = true; }
        else { errs[i].hidden = true; errs[i].textContent = ''; boxes[i].removeAttribute('aria-invalid'); vals.push({ i: i, n: n }); }
      }
      if (bad) return;                                   /* keep the last valid results */
      chipsState(vals.map(function (v) { return v.n; }));
      var nums = vals.filter(function (v) { return v.n >= 2; }).map(function (v) { return v.n; });
      /* pictures */
      var pics = vals.map(function (v) {
        if (v.n === 1) return '<div class="hl-pic hl-one"><p class="hl-pn">' + names[v.i] + ': 1</p><p>1 has no prime factors — it is neither prime nor composite</p></div>';
        var pc = hlPic(v.n, S.ladder);
        return '<div class="hl-pic"><svg class="dg" viewBox="0 0 ' + pc.w + ' ' + pc.h + '" width="' + pc.w + '" role="img" aria-label="' + pc.label + '">' + pc.svg + '</svg>' +
          '<p class="hl-f mx">' + v.n + ' = ' + hlFstr(hlFact(v.n)) + '</p></div>';
      }).join('');
      q('hl-pics').innerHTML = pics;
      if (!reduced) { q('hl-pics').classList.remove('hl-anim'); void q('hl-pics').offsetWidth; q('hl-pics').classList.add('hl-anim'); }
      var res = q('hl-res');
      if (nums.length < 2) {
        q('hl-tw').hidden = true; q('hl-key').hidden = true;
        res.innerHTML = '<p class="hl-msg">Enter at least two whole numbers from 2 to 99 999</p>';
        return;
      }
      q('hl-tw').hidden = false; q('hl-key').hidden = false;
      var c = hlCalc(nums);
      var mk = function (cell) {
        return (cell.mn ? ' <span class="hl-m hl-mn" aria-hidden="true">▼</span><span class="sr">smallest</span>' : '') +
          (cell.mx ? ' <span class="hl-m hl-mx" aria-hidden="true">▲</span><span class="sr">largest</span>' : '');
      };
      var t = '<thead><tr><th scope="col">prime</th>' + c.primes.map(function (p) { return '<th scope="col">' + p + '</th>'; }).join('') + '</tr></thead><tbody>';
      nums.forEach(function (n, i) {
        t += '<tr><th scope="row" class="mx">' + n + ' = ' + hlFstr(c.fs[i]) + '</th>' + c.primes.map(function (p, j) {
          var cell = c.cells[j][i], cls = cell.mn && cell.mx ? 'hl-both' : cell.mn ? 'hl-cmn' : cell.mx ? 'hl-cmx' : '';
          return '<td class="mx ' + cls + '">' + (cell.e ? hlPow(p, cell.e, true) + mk(cell) : '<span class="hl-miss">—</span>') + '</td>';
        }).join('') + '</tr>';
      });
      [['HCF', 'mn', '▼', c.hrow], ['LCM', 'mx', '▲', c.lrow]].forEach(function (r) {
        t += '<tr class="hl-r' + r[1] + '"><th scope="row">' + r[0] + ' <span class="hl-m hl-' + r[1] + '" aria-hidden="true">' + r[2] + '</span></th>' +
          r[3].map(function (e, j) { return '<td class="mx">' + (e ? hlPow(c.primes[j], e, true) : '<span class="hl-miss">—</span>') + '</td>'; }).join('') + '</tr>';
      });
      q('hl-t').innerHTML = t + '</tbody>';
      var expr = function (row) {
        var parts = c.primes.map(function (p, j) { return row[j] ? hlPow(p, row[j]) : ''; }).filter(Boolean);
        return parts.length ? parts.join(' × ') : '1';
      };
      var line = function (name, cls, sym, row, v) {
        var e = expr(row), plain = e.replace(/<[^>]+>/g, '');
        return '<p class="hl-r ' + cls + ' mx"><span class="hl-k">' + name + ' <span class="hl-m" aria-hidden="true">' + sym + '</span></span> = ' +
          (plain === String(v) ? '' : e + ' = ') + '<b>' + hlSep(v) + '</b></p>';
      };
      var html = line('HCF', 'hl-rh', '▼', c.hrow, c.h) + line('LCM', 'hl-rl', '▲', c.lrow, c.l);
      if (c.h === 1) html += '<p class="hl-note">HCF = 1: the numbers are co-prime' + (nums.length === 2 || c.pairwise ? ' — so LCM = product of the numbers' : '') + '</p>';
      var hl = c.h * c.l, pr = nums.map(String).join(' × ');
      if (nums.length === 2) {
        html += '<div class="hl-chk hl-ok"><p>HCF × LCM = ' + c.h + ' × ' + hlSep(c.l) + ' = ' + hlSep(hl) + '</p>' +
          '<p>' + pr + ' = ' + hlSep(c.prod) + (hl === c.prod ? ' <span class="hl-tick" aria-hidden="true">✔</span> equal' : ' — not equal') + '</p>' +
          '<p class="hl-rule">HCF × LCM = a × b ✔ for any two numbers</p></div>';
      } else if (hl !== c.prod) {
        html += '<div class="hl-chk hl-warn"><p>HCF × LCM = ' + c.h + ' × ' + hlSep(c.l) + ' = ' + hlSep(hl) + ', but ' + pr + ' = ' + hlSep(c.prod) +
          ' — HCF × LCM = product works only for two numbers</p></div>';
      } else {
        html += '<div class="hl-chk hl-warn"><p>HCF × LCM = ' + c.h + ' × ' + hlSep(c.l) + ' = ' + hlSep(hl) + ' and ' + pr + ' = ' + hlSep(c.prod) + '.</p>' +
          '<p>Equal here only because no two of these numbers share a prime factor. For three numbers this is not true in general — never use it to find an HCF or LCM.</p></div>';
      }
      res.innerHTML = html;
    }
    boxes.forEach(function (b, i) {
      on(b, 'input', function () { S.touched[i] = true; chipsState(null); clearTimeout(timer); timer = setTimeout(update, 300); });
      on(b, 'change', function () { clearTimeout(timer); update(); });
    });
    on(q('hl-add'), 'click', function () {
      if (S.three) { S.three = false; wraps[2].hidden = true; boxes[2].value = ''; errs[2].hidden = true; S.touched[2] = false; }
      else { S.three = true; wraps[2].hidden = false; S.touched[2] = false; boxes[2].focus(); }
      q('hl-add').textContent = S.three ? 'Remove third number' : 'Add a third number';
      q('hl-add').setAttribute('aria-pressed', S.three ? 'true' : 'false');
      update();
    });
    $$('.hl-chip', root).forEach(function (c) {
      on(c, 'click', function () { setBoxes(HL_PRESETS[+c.getAttribute('data-i')][1]); update(); });
    });
    $$('.hl-sv', root).forEach(function (b) {
      on(b, 'click', function () {
        S.ladder = b.getAttribute('data-v') === 'ladder';
        $$('.hl-sv', root).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        update();
      });
    });
    setBoxes([144, 198]);
    update();
  }

  /* ---------------------------------------------------- graph explorer (Maths Ch 2, T03-V6)
     svg[data-gx="coef"] (content/C10-MATH-CH02/diagrams, _src/poly_a.py v6) is the static first view: initGx replaces it
     with the coefficients mode; svg[data-gx-mount="sp"] (the V5 card on Topic 5) gets the sum & product mode after it.
     Every input is a multiple of 0.5, so a, b, c are kept as the integers A = 4a, B = 4b, C = 4c (k·S is a multiple of
     0.25): the sign of D, D = 0, rational zeroes and the surd form are decided exactly. Nothing is stored. */
  /*GX-TEX*/var GX_TEX = {"formula":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>x</mi><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mrow><mo>−</mo><mi>b</mi><mo>±</mo><msqrt><mrow><msup><mi>b</mi><mn>2</mn></msup><mo>−</mo><mn>4</mn><mi>a</mi><mi>c</mi></mrow></msqrt></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.4306em;\"></span><span class=\"mord mathnormal\">x</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.2764em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.5904em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">2</span><span class=\"mord mathnormal\">a</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">−</span><span class=\"mord mathnormal\">b</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">±</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord sqrt\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.9134em;\"><span class=\"svg-align\" style=\"top:-3em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\" style=\"padding-left:0.833em;\"><span class=\"mord\"><span class=\"mord mathnormal\">b</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.7401em;\"><span style=\"top:-2.989em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\">4</span><span class=\"mord mathnormal\">a</span><span class=\"mord mathnormal\">c</span></span></span><span style=\"top:-2.8734em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"hide-tail\" style=\"min-width:0.853em;height:1.08em;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400em\" height=\"1.08em\" viewBox=\"0 0 400000 1080\" preserveAspectRatio=\"xMinYMin slice\"><path d=\"M95,702\nc-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14\nc0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54\nc44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10\ns173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429\nc69,-144,104.5,-217.7,106.5,-221\nl0 -0\nc5.3,-9.3,12,-14,20,-14\nH400000v40H845.2724\ns-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7\nc-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z\nM834 80h400000v40h-400000z\"/></svg></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.1266em;\"><span></span></span></span></span></span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","sum":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>α</mi><mo>+</mo><mi>β</mi><mo>=</mo><mo>−</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mi>b</mi><mi>a</mi></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\alpha + \\beta = -\\dfrac{b}{a}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6667em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.0037em;\">α</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8889em;vertical-align:-0.1944em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.05278em;\">β</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0574em;vertical-align:-0.686em;\"></span><span class=\"mord\">−</span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3714em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">a</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">b</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","prod":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>α</mi><mi>β</mi><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mi>c</mi><mi>a</mi></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\alpha\\beta = \\dfrac{c}{a}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.8889em;vertical-align:-0.1944em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.0037em;\">α</span><span class=\"mord mathnormal\" style=\"margin-right:0.05278em;\">β</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:1.7936em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.1076em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">a</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">c</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","kform":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>p</mi><mo stretchy=\"false\">(</mo><mi>x</mi><mo stretchy=\"false\">)</mo><mo>=</mo><mi>k</mi><mo stretchy=\"false\">{</mo><msup><mi>x</mi><mn>2</mn></msup><mo>−</mo><mi>S</mi><mi>x</mi><mo>+</mo><mi>P</mi><mo stretchy=\"false\">}</mo></mrow><annotation encoding=\"application/x-tex\">p(x) = k\\{x^2 - Sx + P\\}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:1em;vertical-align:-0.25em;\"></span><span class=\"mord mathnormal\">p</span><span class=\"mopen\">(</span><span class=\"mord mathnormal\">x</span><span class=\"mclose\">)</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:1.0641em;vertical-align:-0.25em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03148em;\">k</span><span class=\"mopen\">{</span><span class=\"mord\"><span class=\"mord mathnormal\">x</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.7667em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.05764em;\">S</span><span class=\"mord mathnormal\">x</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:1em;vertical-align:-0.25em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.13889em;\">P</span><span class=\"mclose\">}</span></span></span></span>"};/*END-GX-TEX*/
  var GX_PRESETS = [['x² − x − 6', [1, -1, -6]], ['x² − 6x + 9 (touches)', [1, -6, 9]], ['x² + 1 (no zeroes)', [1, 0, 1]],
    ['−2x² + 7x + 4 (a < 0)', [-2, 7, 4]], ['2x² − 6x + 3 (surd zeroes)', [2, -6, 3]]];
  function gxFr(n, d) { if (d < 0) { n = -n; d = -d; } var g = mGcd(n, d) || 1; return { n: n / g, d: d / g }; }
  function gxFrEq(p, r) { return p.n === r.n && p.d === r.d; }
  function gxFrHtml(p) {
    if (p.d === 1) return mMinus(p.n);
    return (p.n < 0 ? '−' : '') + '<span class="gx-fr"><span>' + Math.abs(p.n) + '</span><span class="sr">/</span><span>' + p.d + '</span></span>';
  }
  function gxDec(v) { var s = v.toFixed(3); return mMinus(s === '-0.000' ? '0.000' : s); }
  function gxShort(v) { return mMinus(String(parseFloat(v.toFixed(3)))); }
  function gxNum(v) { return mMinus(String(v)); }
  function gxSqf(D) { var m = 1, n = D; for (var k = 2; k * k <= n; k++) while (n % (k * k) === 0) { n /= k * k; m *= k; } return { m: m, n: n }; }
  function gxSolve(A, B, C) {
    if (A === 0) return B === 0 ? { kind: C === 0 ? 'zero' : 'const' } : { kind: 'line', z: gxFr(-C, B) };
    var D = B * B - 4 * A * C;
    if (D < 0) return { kind: 'none', D: D };
    if (D === 0) return { kind: 'equal', z: gxFr(-B, 2 * A), D: 0 };
    var s = Math.round(Math.sqrt(D));
    if (s * s === D) {
      var z1 = gxFr(-B - s, 2 * A), z2 = gxFr(-B + s, 2 * A);
      if (z1.n / z1.d > z2.n / z2.d) { var t = z1; z1 = z2; z2 = t; }
      return { kind: 'rat', z: [z1, z2], D: D };
    }
    var f = gxSqf(D), p = -B, m = f.m, d = 2 * A, g = mGcd(mGcd(p, m), d);
    p /= g; m /= g; d /= g;
    if (d < 0) { p = -p; d = -d; }
    return { kind: 'surd', p: p, m: m, n: f.n, d: d, D: D, v: [(p - m * Math.sqrt(f.n)) / d, (p + m * Math.sqrt(f.n)) / d] };
  }
  function gxSurdHtml(r, sign) {
    var root = (r.m > 1 ? r.m : '') + '<span class="gx-rt">√<span>' + r.n + '</span></span>';
    var num = r.p === 0 ? (sign < 0 ? '−' : '') + root : mMinus(r.p) + (sign < 0 ? ' − ' : ' + ') + root;
    return r.d === 1 ? num : '<span class="gx-fr"><span><span class="sr">(</span>' + num + '<span class="sr">)</span></span><span class="sr">/</span><span>' + r.d + '</span></span>';
  }
  function gxPoly(A, B, C) {
    var t = [];
    [[A, 2], [B, 1], [C, 0]].forEach(function (c) {
      var k = c[0] / 4, e = c[1];
      if (!k) return;
      var a = Math.abs(k), s = (a === 1 && e > 0 ? '' : String(a)) + (e ? '<i>x</i>' + (e === 2 ? '<sup>2</sup>' : '') : '');
      t.push({ neg: k < 0, s: s });
    });
    if (!t.length) return '0';
    return t.map(function (x, i) { return (i ? (x.neg ? ' − ' : ' + ') : (x.neg ? '−' : '')) + x.s; }).join('');
  }
  function gxZeroList(r) {
    if (r.kind === 'rat') return r.z.map(function (z) { return z.n / z.d; });
    if (r.kind === 'surd') return r.v;
    if (r.kind === 'equal' || r.kind === 'line') return [r.z.n / r.z.d];
    return [];
  }
  function initGx() {
    $$('svg[data-gx="coef"]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-gx-on')) return;
      art.setAttribute('data-gx-on', '1');
      gxBuild(art, 'coef', function (n) { art.innerHTML = ''; art.appendChild(n); });
    });
    $$('svg[data-gx-mount="sp"]').forEach(function (svg) {
      var fig = svg.closest('.fig'); if (!fig || fig.getAttribute('data-gx-on') || svg.closest('#diagrams')) return;   /* lesson only, not the revision pack */
      fig.setAttribute('data-gx-on', '1');
      var f = document.createElement('figure');
      f.className = 'fig fig--drawn fig--gx';
      f.innerHTML = '<div class="fig-art"></div><figcaption><b class="fig-title">Graph explorer · sum &amp; product mode</b>' +
        '<span class="fig-purpose">Choose a sum S and a product P: the graph of k{x² − Sx + P} has zeroes with that sum and product. ' +
        'Move k and watch the curve stretch or flip while the zeroes stay put.</span></figcaption>';
      fig.parentNode.insertBefore(f, fig.nextSibling);
      var art = $('.fig-art', f);
      gxBuild(art, 'sp', function (n) { art.appendChild(n); });
    });
  }
  function gxBuild(art, mode, mount) {
    var uid = 'gx' + Math.random().toString(36).slice(2, 7), sp = mode === 'sp';
    var defs = sp ? [['S', 'S (sum)', -10, 10], ['P', 'P (product)', -10, 10], ['k', 'k', -3, 3]] : [['a', 'a', -5, 5], ['b', 'b', -10, 10], ['c', 'c', -10, 10]];
    var V = sp ? { S: 3, P: 2, k: 1 } : { a: 1, b: -1, c: -6 };
    var S = { zoom: false, mistake: false, exact: false };
    var root = document.createElement('div');
    root.className = 'gx gx--' + mode;
    root.innerHTML = (sp ? '<p class="gx-form">' + (GX_TEX.kform || '') + '<span>, k ≠ 0</span></p>' : '') + '<p class="gx-poly mx"></p>' +
      '<div class="gx-main"><div class="gx-left"><svg class="gx-svg" viewBox="0 0 360 268" role="img" aria-labelledby="' + uid + '-t">' +
      '<title id="' + uid + '-t"></title><defs><clipPath id="' + uid + '-c"><rect x="20" y="14" width="320" height="240"/></clipPath></defs>' +
      '<g class="gx-grid"></g><g class="gx-curves" clip-path="url(#' + uid + '-c)"></g><g class="gx-marks"></g></svg>' +
      '<p class="gx-cap"></p>' + (sp ? '<p class="gx-kcap"></p><p class="gx-mcap" hidden></p>' : '') + '</div>' +
      '<div class="gx-read" aria-live="polite">' +
      '<div class="gx-row gx-r1"><p class="gx-h">zeroes</p><p class="gx-v mx"></p>' +
      '<button type="button" class="gx-xb" aria-expanded="false" hidden>Show exact</button><div class="gx-x mx" hidden></div></div>' +
      '<div class="gx-row gx-r2"><p class="gx-h">sum of zeroes <span class="gx-hf">' + (GX_TEX.sum || '') + '</span></p><p class="gx-v mx"></p></div>' +
      '<div class="gx-row gx-r3"><p class="gx-h">product of zeroes <span class="gx-hf">' + (GX_TEX.prod || '') + '</span></p><p class="gx-v mx"></p></div></div></div>' +
      '<div class="gx-ctl">' + defs.map(function (d) {
        return '<div class="gx-c"><label class="gx-lab" for="' + uid + '-' + d[0] + '">' + d[1] + '</label>' +
          '<input class="gx-range" type="range" role="slider" id="' + uid + '-' + d[0] + '" data-k="' + d[0] + '" min="' + d[2] + '" max="' + d[3] + '" step="0.5">' +
          '<input class="gx-num" type="text" inputmode="decimal" autocomplete="off" data-k="' + d[0] + '" aria-label="' + d[1] + ', type a value" aria-describedby="' + uid + '-e' + d[0] + '">' +
          '<p class="gx-err" id="' + uid + '-e' + d[0] + '" hidden></p></div>';
      }).join('') +
      (sp ? '' : '<div class="gx-chips" role="group" aria-label="Try these polynomials">' + GX_PRESETS.map(function (p, i) {
        return '<button type="button" class="gx-chip" data-i="' + i + '" aria-pressed="false">' + p[0] + '</button>';
      }).join('') + '</div>') +
      '<div class="gx-tg"><button type="button" class="fig-toggle gx-zoom" aria-pressed="false">Zoom out</button>' +
      (sp ? '<button type="button" class="fig-toggle gx-mis" aria-pressed="false">Show the common mistake</button>' : '') + '</div></div>';
    mount(root);
    var q = function (c) { return $('.' + c, root); }, svg = q('gx-svg');
    root._gx = { solve: gxSolve };
    function coeffs() {
      if (!sp) return [Math.round(V.a * 4), Math.round(V.b * 4), Math.round(V.c * 4)];
      return [Math.round(V.k * 4), Math.round(-V.k * V.S * 4), Math.round(V.k * V.P * 4)];
    }
    function view() { return S.zoom ? { x0: -20, x1: 20, y0: -40, y1: 40, gx: 5, gy: 10, lx: [-15, -10, -5, 5, 10, 15], ly: [30, 20, 10, -10, -20, -30] } :
      { x0: -8, x1: 8, y0: -12, y1: 12, gx: 1, gy: 2, lx: [-6, -2, 2, 6], ly: [8, 4, -4, -8] }; }
    function txt(x, y, s, o) {
      o = o || {};
      var w = s.length * (o.size || 14) * 0.56;
      var x0 = o.anchor === 'end' ? x - w : o.anchor === 'middle' ? x - w / 2 : x;
      return (o.halo ? '<rect x="' + (x0 - 3).toFixed(1) + '" y="' + (y - 13).toFixed(1) + '" width="' + (w + 6).toFixed(1) + '" height="18" rx="3" fill="var(--card, #FFF)"/>' : '') +
        '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-family="Lexend, sans-serif" font-size="' + (o.size || 14) + '"' +
        (o.bold ? ' font-weight="600"' : '') + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + ' fill="' + (o.fill || 'var(--ink, #1F2328)') + '">' + s + '</text>';
    }
    function drawGraph(A, B, C, r) {
      var w = view(), X = function (x) { return 20 + (x - w.x0) / (w.x1 - w.x0) * 320; }, Y = function (y) { return 14 + (w.y1 - y) / (w.y1 - w.y0) * 240; };
      var soft = 'var(--ink-soft, #57554D)', boxes = [], mk = '', g = '', k;
      /* labels are laid out first so that tick numbers never sit under them */
      function lab(x, y, s, o) {
        var wd = s.length * (o.size || 14) * (o.bold ? 0.6 : 0.56), x0 = o.anchor === 'end' ? x - wd : o.anchor === 'middle' ? x - wd / 2 : x;
        return { x0: x0 - 4, x1: x0 + wd + 4, y0: y - 15, y1: y + 5, svg: txt(x, y, s, o) };
      }
      function hits(b) { return boxes.some(function (o) { return b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0; }); }
      function put(b) { boxes.push(b); mk += b.svg; }
      /* zeroes: filled dots; off-graph zeroes get an arrow at the edge of the axis */
      var zs = gxZeroList(r), off = { l: 0, r: 0 };
      zs.forEach(function (z, i) {
        var s = gxShort(z);
        if (z < w.x0 || z > w.x1) {
          var left = z < w.x0, n = left ? off.l++ : off.r++, xe = left ? 22 : 338;
          mk += '<path d="M' + (left ? 44 : 316) + ',' + Y(0) + ' L' + xe + ',' + Y(0) + ' M' + (xe + (left ? 7 : -7)) + ',' + (Y(0) - 6) + ' L' + xe + ',' + Y(0) + ' L' + (xe + (left ? 7 : -7)) + ',' + (Y(0) + 6) + '" fill="none" stroke="var(--ink, #1F2328)" stroke-width="2.4"/>';
          put(lab(left ? 24 : 336, Y(0) - 30 - n * 22, 'zero at x = ' + s + ' (off the graph)', { anchor: left ? 'start' : 'end', halo: true, size: 14, bold: true }));
          return;
        }
        mk += '<circle cx="' + X(z).toFixed(1) + '" cy="' + Y(0).toFixed(1) + '" r="5" fill="var(--ink, #1F2328)" stroke="var(--card, #FFF)" stroke-width="1.2"/>';
        var touch = r.kind === 'equal', below = A === 0 ? B > 0 : A > 0, side = zs.length > 1 ? (i === 0 ? 'end' : 'start') : (A === 0 ? 'start' : 'middle');
        var text = (touch ? 'touches at ' : '') + s, ly = below ? Y(0) + 20 : Y(0) - 9;
        var mkLab = function (sd, yy) { return lab(sd === 'middle' ? X(z) : X(z) + (sd === 'end' ? -6 : 6), yy, text, { anchor: sd, halo: true, bold: true, size: 15 }); };
        var b = mkLab(side, ly);
        if (b.x0 < 1) b = mkLab('start', ly);                         /* keep the label inside the picture */
        if (b.x1 > 359) b = mkLab('end', ly);
        if (hits(b)) { var b2 = mkLab(side === 'middle' ? 'middle' : side, below ? Y(0) - 9 : Y(0) + 20); if (!hits(b2)) b = b2; }
        put(b);
      });
      /* y-intercept: hollow dot, label beside it on whichever side is free */
      var c0 = C / 4;
      if (c0 >= w.y0 && c0 <= w.y1) {
        mk += '<circle cx="' + X(0) + '" cy="' + Y(c0).toFixed(1) + '" r="5" fill="var(--card, #FFF)" stroke="var(--ink, #1F2328)" stroke-width="2"/>';
        var s0 = 'p(0) = ' + gxNum(c0), cand = [];
        [Y(c0) + 23, Y(c0) - 10].forEach(function (yy) {
          if (yy > 252 || yy < 30) return;
          cand.push(lab(X(0) + 9, yy, s0, { halo: true, size: 15, bold: true }), lab(X(0) - 9, yy, s0, { halo: true, size: 15, bold: true, anchor: 'end' }));
        });
        var pick = cand.filter(function (b) { return !hits(b); })[0] || cand[0];
        if (pick) put(pick);
      } else {
        put(lab(X(0) + 9, c0 > 0 ? 32 : 246, 'p(0) = ' + gxNum(c0) + ' (off the graph)', { halo: true, size: 14 }));
      }
      /* grid, axes, axis names, tick numbers (skipped where a label sits) */
      for (k = w.x0; k <= w.x1; k += w.gx) g += '<path d="M' + X(k).toFixed(1) + ',14 L' + X(k).toFixed(1) + ',254" stroke="var(--dg-m-grid, #D6E0EC)" stroke-width="0.7"/>';
      for (k = w.y0; k <= w.y1; k += w.gy) g += '<path d="M20,' + Y(k).toFixed(1) + ' L340,' + Y(k).toFixed(1) + '" stroke="var(--dg-m-grid, #D6E0EC)" stroke-width="0.7"/>';
      var ax = 'stroke="var(--ink, #1F2328)" stroke-width="1.4" fill="none"';
      g += '<path d="M20,' + Y(0) + ' L340,' + Y(0) + ' M' + X(0) + ',14 L' + X(0) + ',254" ' + ax + '/>' +
        '<path d="M335,' + (Y(0) - 5) + ' L340,' + Y(0) + ' L335,' + (Y(0) + 5) + ' M25,' + (Y(0) - 5) + ' L20,' + Y(0) + ' L25,' + (Y(0) + 5) +
        ' M' + (X(0) - 5) + ',19 L' + X(0) + ',14 L' + (X(0) + 5) + ',19 M' + (X(0) - 5) + ',249 L' + X(0) + ',254 L' + (X(0) + 5) + ',249" ' + ax + '/>';
      [lab(338, Y(0) - 7, 'X', { anchor: 'end', fill: soft, bold: true }), lab(22, Y(0) - 7, 'X′', { fill: soft, bold: true }),
        lab(X(0) + 6, 27, 'Y', { fill: soft, bold: true }), lab(X(0) + 6, 250, 'Y′', { fill: soft, bold: true }),
        lab(X(0) - 5, Y(0) + 15, 'O', { anchor: 'end', fill: soft })].forEach(function (b) { if (!hits(b)) g += b.svg; });
      w.lx.forEach(function (v) { var b = lab(X(v), Y(0) + 17, mMinus(v), { anchor: 'middle', fill: soft }); if (!hits(b)) g += b.svg; });
      w.ly.forEach(function (v) { var b = lab(X(0) - 5, Y(v) + 5, mMinus(v), { anchor: 'end', fill: soft }); if (!hits(b)) g += b.svg; });
      q('gx-grid').innerHTML = g;
      /* curves: ≥ 400 samples across the window */
      var path = function (a, b, c) {
        var d = '', n = 480;
        for (var i = 0; i <= n; i++) {
          var x = w.x0 + (w.x1 - w.x0) * i / n, y = (a * x * x + b * x + c) / 4;
          y = Math.max(w.y0 - (w.y1 - w.y0), Math.min(w.y1 + (w.y1 - w.y0), y));
          d += (i ? ' L' : 'M') + X(x).toFixed(2) + ',' + Y(y).toFixed(2);
        }
        return d;
      };
      var col = A > 0 ? 'var(--dg-m-opp, #C2410C)' : A < 0 ? 'var(--dg-m-adj, #1D5FBF)' : 'var(--acc, #5B3FC4)';
      var cv = '';
      if (sp && S.mistake && mistakeOk()) cv += '<path d="' + path(4, Math.round(4 * V.S), Math.round(4 * V.P)) + '" fill="none" stroke="var(--ink-soft, #57554D)" stroke-width="2" stroke-dasharray="6 5"/>';
      cv += '<path d="' + path(A, B, C) + '" fill="none" stroke="' + col + '" stroke-width="2.6"/>';
      q('gx-curves').innerHTML = cv;
      q('gx-marks').innerHTML = mk;
    }
    function mistakeOk() { return V.S * V.S - 4 * V.P >= 0 && V.S !== 0; }
    function rowsHtml(A, B, C, r) {
      var sb = gxFr(-B, A), pc = gxFr(C, A), tick = ' <span class="gx-ok"><span aria-hidden="true">✔</span> equal</span>';
      var o = { r1: '', r2: '', r3: '', grey: false, hide: false, exact: '' };
      if (r.kind === 'line') { o.r1 = 'a = 0: not a quadratic — the graph is the line y = ' + gxPoly(0, B, C) + '; its zero: <i>x</i> = ' + gxFrHtml(r.z) + (r.z.d === 1 ? '' : ' = ' + gxShort(r.z.n / r.z.d)); o.hide = true; return o; }
      if (r.kind === 'const') { o.r1 = 'a = 0: not a quadratic — the graph is the line y = ' + gxNum(C / 4) + ': constant polynomial — no zeroes'; o.hide = true; return o; }
      if (r.kind === 'zero') { o.r1 = 'a = 0: not a quadratic — every x makes it 0 (the zero polynomial)'; o.hide = true; return o; }
      if (r.kind === 'none') {
        o.r1 = 'no zeroes — the graph does not meet the x-axis';
        o.r2 = 'There are no zeroes on the graph to add or multiply.';
        o.r3 = '(The numbers −b/a = ' + gxFrHtml(sb) + ' and c/a = ' + gxFrHtml(pc) + ' still exist.)';
        o.grey = true; return o;
      }
      var sum, prod;
      if (r.kind === 'equal') {
        o.r1 = 'one point of contact — two equal zeroes: α = β = ' + gxFrHtml(r.z) + (r.z.d === 1 ? '' : ' (' + gxShort(r.z.n / r.z.d) + ')');
        sum = gxFr(2 * r.z.n, r.z.d); prod = gxFr(r.z.n * r.z.n, r.z.d * r.z.d);
        o.r2 = 'α + β = 2α = ' + gxFrHtml(sum); o.r3 = 'αβ = α<sup>2</sup> = ' + gxFrHtml(prod);
      } else if (r.kind === 'rat') {
        var e = function (z) { return gxFrHtml(z) + (z.d === 1 ? '' : ' (' + gxShort(z.n / z.d) + ')'); };
        o.r1 = 'two zeroes: α = ' + e(r.z[0]) + ', β = ' + e(r.z[1]);
        sum = gxFr(r.z[0].n * r.z[1].d + r.z[1].n * r.z[0].d, r.z[0].d * r.z[1].d);
        prod = gxFr(r.z[0].n * r.z[1].n, r.z[0].d * r.z[1].d);
        o.r2 = 'α + β = ' + gxFrHtml(sum); o.r3 = 'αβ = ' + gxFrHtml(prod);
      } else {
        o.r1 = 'two zeroes: α = ' + gxDec(r.v[0]) + ', β = ' + gxDec(r.v[1]);
        o.exact = 'α = ' + gxSurdHtml(r, -1) + ', β = ' + gxSurdHtml(r, 1);
        sum = gxFr(2 * r.p, r.d); prod = gxFr(r.p * r.p - r.m * r.m * r.n, r.d * r.d);
        o.r2 = 'α + β = ' + gxFrHtml(sum); o.r3 = 'αβ = ' + gxFrHtml(prod);
      }
      o.r2 += ' <span class="gx-vs">−b/a = ' + gxFrHtml(sb) + (gxFrEq(sum, sb) ? tick : '') + '</span>';
      o.r3 += ' <span class="gx-vs">c/a = ' + gxFrHtml(pc) + (gxFrEq(prod, pc) ? tick : '') + '</span>';
      return o;
    }
    var renderRead = mThrottle(function () {
      var cf = coeffs(), r = gxSolve(cf[0], cf[1], cf[2]), o = rowsHtml(cf[0], cf[1], cf[2], r);
      $('.gx-r1 .gx-v', root).innerHTML = o.r1;
      $('.gx-r2 .gx-v', root).innerHTML = o.r2;
      $('.gx-r3 .gx-v', root).innerHTML = o.r3;
      q('gx-r2').hidden = q('gx-r3').hidden = o.hide;
      q('gx-r2').classList.toggle('is-grey', o.grey); q('gx-r3').classList.toggle('is-grey', o.grey);
      q('gx-xb').hidden = !o.exact;
      q('gx-x').innerHTML = o.exact ? (GX_TEX.formula ? '<span class="gx-xf">' + GX_TEX.formula + '</span>' : '') + '<span>' + o.exact + '</span>' : '';
      q('gx-x').hidden = !o.exact || !S.exact;
      q('gx-xb').setAttribute('aria-expanded', o.exact && S.exact ? 'true' : 'false');
      q('gx-xb').textContent = S.exact ? 'Hide exact' : 'Show exact';
    }, 250);
    function render() {
      var cf = coeffs(), A = cf[0], B = cf[1], C = cf[2], r = gxSolve(A, B, C);
      var p = gxPoly(A, B, C);
      if (sp) {
        var inner = gxPoly(4, Math.round(-4 * V.S), Math.round(4 * V.P));
        p = V.k === 1 ? 'p(<i>x</i>) = ' + inner : 'p(<i>x</i>) = ' + (V.k === -1 ? '−' : gxNum(V.k)) + '{' + inner + '} = ' + p;
      } else p = 'p(<i>x</i>) = ' + p;
      q('gx-poly').innerHTML = p;
      $('title', svg).textContent = 'Graph of y = ' + q('gx-poly').textContent.replace(/^p\(x\) = /, '');
      drawGraph(A, B, C, r);
      q('gx-cap').textContent = A > 0 ? 'opens upwards (a > 0)' : A < 0 ? 'opens downwards (a < 0)' : '';
      q('gx-cap').hidden = A === 0;
      if (sp) {
        var none = V.S * V.S - 4 * V.P < 0;
        q('gx-kcap').textContent = none ? 'changing k does not change where the graph meets the axis — here it never does' : 'changing k does not move the zeroes';
        var mb = q('gx-mis'), ok = mistakeOk();
        mb.disabled = !ok;
        mb.textContent = none ? 'Show the common mistake — no zeroes to compare' : V.S === 0 ? 'with S = 0 the two curves are the same' : 'Show the common mistake';
        if (!ok) { S.mistake = false; mb.setAttribute('aria-pressed', 'false'); }
        q('gx-mcap').hidden = !(S.mistake && ok);
        q('gx-mcap').textContent = 'dashed: x² + Sx + P has zeroes of sum −S — wrong sign';
      }
      $$('.gx-chip', root).forEach(function (c) {
        var v = GX_PRESETS[+c.getAttribute('data-i')][1];
        c.setAttribute('aria-pressed', !sp && v[0] === V.a && v[1] === V.b && v[2] === V.c ? 'true' : 'false');
      });
      renderRead();
    }
    function word(v) { return v < 0 ? 'minus ' + (-v) : String(v); }
    function setV(k, v, fromBox) {
      V[k] = v;
      var rg = $('.gx-range[data-k="' + k + '"]', root), nb = $('.gx-num[data-k="' + k + '"]', root), er = $('#' + uid + '-e' + k, root);
      rg.value = String(v);
      rg.setAttribute('aria-valuetext', defs.filter(function (d) { return d[0] === k; })[0][1].replace(/ \(.*/, '') + ' equals ' + word(v));
      if (!fromBox) nb.value = gxNum(v);
      er.hidden = true; nb.removeAttribute('aria-invalid');
      render();
    }
    function clampK(v, dir) { return v === 0 ? (dir >= 0 ? 0.5 : -0.5) : v; }
    defs.forEach(function (d) {
      var k = d[0], rg = $('.gx-range[data-k="' + k + '"]', root), nb = $('.gx-num[data-k="' + k + '"]', root), er = $('#' + uid + '-e' + k, root);
      var lo = d[2], hi = d[3], t = null;
      on(rg, 'input', function () {
        var v = parseFloat(rg.value);
        if (k === 'k' && v === 0) v = V.k > 0 ? -0.5 : 0.5;
        setV(k, v);
      });
      on(rg, 'keydown', function (e) {
        var key = e.key, n = null;
        if (key === 'ArrowRight' || key === 'ArrowUp') n = V[k] + 0.5;
        else if (key === 'ArrowLeft' || key === 'ArrowDown') n = V[k] - 0.5;
        else if (key === 'PageUp') n = V[k] + 2; else if (key === 'PageDown') n = V[k] - 2;
        else if (key === 'Home') n = lo; else if (key === 'End') n = hi;
        if (n === null) return;
        e.preventDefault();
        n = Math.max(lo, Math.min(hi, n));
        if (k === 'k') n = clampK(n, n - V.k);
        setV(k, n);
      });
      function check(final) {
        var s = nb.value.replace(/−/g, '-').replace(/\s/g, '');
        var ok = /^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(s), v = ok ? parseFloat(s) : NaN;
        ok = ok && Math.abs(v * 2 - Math.round(v * 2)) < 1e-9 && v >= lo && v <= hi && !(k === 'k' && v === 0);
        if (ok) { setV(k, Math.round(v * 2) / 2, !final); if (final) nb.value = gxNum(V[k]); return; }
        er.textContent = 'Use a multiple of 0.5 between ' + mMinus(lo) + ' and ' + hi + (k === 'k' ? ' (not 0)' : '');
        er.hidden = false; nb.setAttribute('aria-invalid', 'true');
      }
      on(nb, 'input', function () { clearTimeout(t); t = setTimeout(function () { check(false); }, 400); });
      on(nb, 'change', function () { clearTimeout(t); check(true); });
      on(nb, 'keydown', function (e) { if (e.key === 'Enter') { clearTimeout(t); check(true); } });
      rg.value = String(V[k]); nb.value = gxNum(V[k]);
      rg.setAttribute('aria-valuetext', d[1].replace(/ \(.*/, '') + ' equals ' + word(V[k]));
    });
    $$('.gx-chip', root).forEach(function (c) {
      on(c, 'click', function () {
        var v = GX_PRESETS[+c.getAttribute('data-i')][1];
        ['a', 'b', 'c'].forEach(function (k, i) { V[k] = v[i]; });
        ['a', 'b', 'c'].forEach(function (k) { setV(k, V[k]); });
      });
    });
    on(q('gx-zoom'), 'click', function () { S.zoom = !S.zoom; q('gx-zoom').setAttribute('aria-pressed', S.zoom ? 'true' : 'false'); render(); });
    if (sp) on(q('gx-mis'), 'click', function () { if (!mistakeOk()) return; S.mistake = !S.mistake; q('gx-mis').setAttribute('aria-pressed', S.mistake ? 'true' : 'false'); render(); });
    on(q('gx-xb'), 'click', function () { S.exact = !S.exact; renderRead(); });
    render();
  }

  /* ---------------------------------------------------- two-lines explorer (Maths Ch 3, T02-V7)
     svg[data-tl] is the static first view (content/C10-MATH-CH03/diagrams, _src/lines_a.py v7); initTl replaces it.
     Topic 2 opens in picture view; Topic 3 (figure block id …-T03.…) opens with the ratio panel and the "parallel" preset.
     Every decision is exact: inputs are multiples of 0.5, so each is doubled to an integer (A₁, B₁, C₁, A₂, B₂, C₂) and the
     case, the meeting point and the ratios are integer / reduced-fraction arithmetic — never a float tolerance.
     Values are set in HTML with KaTeX fonts (.mx). Nothing is stored. */
  var TL_KEYS = [['a1', 'a₁', 'a one'], ['b1', 'b₁', 'b one'], ['c1', 'c₁', 'c one'], ['a2', 'a₂', 'a two'], ['b2', 'b₂', 'b two'], ['c2', 'c₂', 'c two']];
  var TL_PRESETS = [['intersecting: 2x + y = 8, x − y = 1', [2, 1, -8, 1, -1, -1]], ['parallel: 3x + y = 3, 6x + 2y = 12', [3, 1, -3, 6, 2, -12]],
    ['coincident: x − 3y = 3, 2x − 6y = 6', [1, -3, -3, 2, -6, -6]], ['two horizontal lines: 2y = 7, y + 4 = 0', [0, 2, -7, 0, 1, 4]],
    ['a vertical line: x = −1, 3x + 2y = 1', [1, 0, 1, 3, 2, -1]], ['zero constants: 4x − y = 0, 8x − 2y = 0', [4, -1, 0, 8, -2, 0]],
    ['far-away meeting point: x − y = 0, x − 1.5y + 10 = 0', [1, -1, 0, 1, -1.5, 10]]];
  var TL_CASE = { i: 'intersecting — one solution · consistent', p: 'parallel — no solution · inconsistent',
    c: 'coincident — infinitely many solutions · dependent (consistent)' };
  /* a and b run from −10 to 10; c from −20 to 20, because the brief's own pairs 6x + 2y = 12 (parallel preset, Topic 3 start)
     need c₂ = −12 (see content/C10-MATH-CH03/diagrams/NOTES.md) */
  function tlLim(k) { return k.charAt(0) === 'c' ? 20 : 10; }
  function tlBad(k) { return 'Use a multiple of 0.5 between −' + tlLim(k) + ' and ' + tlLim(k); }
  function tlNum(A) { return mMinus(String(A / 2)); }                       /* A is a doubled integer */
  function tlEq(A, B, C, dform) {
    var t = [];
    [[A, 'x'], [B, 'y']].concat(dform ? [] : [[C, '']]).forEach(function (p) {
      if (!p[0]) return;
      var a = Math.abs(p[0]) / 2;
      t.push({ neg: p[0] < 0, s: (a === 1 && p[1] ? '' : String(a)) + (p[1] ? '<i>' + p[1] + '</i>' : '') });
    });
    var lhs = t.length ? t.map(function (x, i) { return (i ? (x.neg ? ' − ' : ' + ') : (x.neg ? '−' : '')) + x.s; }).join('') : '0';
    return lhs + ' = ' + (dform ? tlNum(-C) : '0');
  }
  function tlCoord(p, html) {
    if (p.d === 1) return mMinus(p.n);
    return (html ? gxFrHtml(p) : mMinus(p.n) + '/' + p.d) + ' ≈ ' + gxDec(p.n / p.d);
  }
  function tlSolve(I) {
    /* I = [A1, B1, C1, A2, B2, C2] (doubled integers) */
    var A1 = I[0], B1 = I[1], C1 = I[2], A2 = I[3], B2 = I[4], C2 = I[5], r = { bad: [] };
    if (A1 === 0 && B1 === 0) r.bad.push(1);
    if (A2 === 0 && B2 === 0) r.bad.push(2);
    if (r.bad.length) return r;
    var D = A1 * B2 - A2 * B1;
    if (D !== 0) { r.kind = 'i'; r.x = gxFr(B1 * C2 - B2 * C1, D); r.y = gxFr(C1 * A2 - C2 * A1, D); }
    else r.kind = (A1 * C2 === A2 * C1 && B1 * C2 === B2 * C1) ? 'c' : 'p';
    /* ratio test (the same integers) */
    var ra = A2 ? gxFr(A1, A2) : null, rb = B2 ? gxFr(B1, B2) : null, rc = C2 ? gxFr(C1, C2) : null;
    r.ra = ra; r.rb = rb; r.rc = rc;
    if (ra && rb && !gxFrEq(ra, rb)) r.test = { by: 'ratio', kind: 'i' };
    else if (ra && rb && rc) r.test = { by: 'ratio', kind: gxFrEq(rb, rc) ? 'c' : 'p' };
    else {
      /* multiple test: m with A2 = m·A1 and B2 = m·B1 */
      var m = null;
      if (A1 * B2 === A2 * B1) m = A1 ? gxFr(A2, A1) : gxFr(B2, B1);
      r.test = { by: 'mult', m: m, kind: !m ? 'i' : (C2 * m.d === m.n * C1 ? 'c' : 'p') };
    }
    return r;
  }
  function initTl() {
    $$('svg[data-tl="lines"]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-tl-on')) return;
      art.setAttribute('data-tl-on', '1');
      var fig = svg.closest('.fig'), t3 = /-T03\./.test(fig ? fig.getAttribute('data-block-id') || '' : '');
      tlBuild(art, t3);
    });
  }
  function tlBuild(art, ratios) {
    var uid = 'tl' + Math.random().toString(36).slice(2, 7);
    var V = { a1: 2, b1: 1, c1: -8, a2: 1, b2: -1, c2: -1 };
    if (ratios) TL_PRESETS[1][1].forEach(function (v, i) { V[TL_KEYS[i][0]] = v; });
    var S = { zoom: false, dform: false, ratios: !!ratios };
    var root = document.createElement('div');
    root.className = 'tl';
    root.innerHTML = '<div class="tl-eqs">' + [1, 2].map(function (n) {
      return '<p class="tl-eq tl-eq' + n + '"><span class="tl-ln">line ' + n + '</span><span class="tl-sw tl-sw' + n + '" aria-hidden="true"></span><span class="mx tl-ex"></span></p>';
    }).join('') + '</div>' +
      '<div class="tl-tg"><button type="button" class="fig-toggle tl-form" aria-pressed="false">show as ax + by = d</button></div>' +
      '<div class="tl-main"><div class="tl-left"><svg class="tl-svg" viewBox="0 0 360 348" role="img" aria-labelledby="' + uid + '-t">' +
      '<title id="' + uid + '-t"></title><defs><clipPath id="' + uid + '-c"><rect x="20" y="14" width="320" height="320"/></clipPath></defs>' +
      '<g class="tl-grid"></g><g class="tl-lines" clip-path="url(#' + uid + '-c)"></g><g class="tl-marks"></g></svg>' +
      '<p class="tl-note" hidden>every point of the line is a solution</p></div>' +
      '<div class="tl-read" aria-live="polite">' +
      '<p class="tl-ban"></p><div class="tl-nl"></div><p class="tl-pt" hidden></p>' +
      '<div class="tl-rat" hidden><p class="tl-rh">Ratios</p><div class="tl-rows"></div><p class="tl-con"></p></div></div></div>' +
      '<div class="tl-ctl">' + TL_KEYS.map(function (k) {
        return '<div class="tl-c"><label class="tl-lab" for="' + uid + '-' + k[0] + '">' + k[1] + '</label>' +
          '<input class="tl-range" type="range" role="slider" id="' + uid + '-' + k[0] + '" data-k="' + k[0] + '" min="-' + tlLim(k[0]) + '" max="' + tlLim(k[0]) + '" step="0.5">' +
          '<input class="tl-num" type="text" inputmode="decimal" autocomplete="off" data-k="' + k[0] + '" aria-label="' + k[1] + ', type a value" aria-describedby="' + uid + '-e' + k[0] + '">' +
          '<p class="tl-err" id="' + uid + '-e' + k[0] + '" hidden></p></div>';
      }).join('') + '</div>' +
      '<div class="tl-chips" role="group" aria-label="Try these pairs">' + TL_PRESETS.map(function (p, i) {
        return '<button type="button" class="tl-chip" data-i="' + i + '" aria-pressed="false">' + p[0] + '</button>';
      }).join('') + '</div>' +
      '<div class="tl-tg"><button type="button" class="fig-toggle tl-zoom" aria-pressed="false">Zoom out</button>' +
      '<button type="button" class="fig-toggle tl-show" aria-pressed="false">Show ratios</button></div>';
    art.innerHTML = '';
    art.appendChild(root);
    var q = function (c) { return $('.' + c, root); }, svg = q('tl-svg');
    function ints() { return TL_KEYS.map(function (k) { return Math.round(V[k[0]] * 2); }); }
    function view() {
      return S.zoom ? { x0: -40, x1: 40, y0: -40, y1: 40, g: 5, lx: [-30, -20, -10, 10, 20, 30] } : { x0: -10, x1: 10, y0: -10, y1: 10, g: 1, lx: [-8, -4, 4, 8] };
    }
    var INK = 'var(--ink, #1F2328)', SOFT = 'var(--ink-soft, #57554D)', CARD = 'var(--card, #FFF)';
    var COL = ['var(--dg-m-opp, #C2410C)', 'var(--dg-m-adj, #1D5FBF)'];
    function txt(x, y, s, o) {
      o = o || {};
      var sz = o.size || 14, w = s.length * sz * (o.bold ? 0.6 : 0.56);
      var x0 = o.anchor === 'end' ? x - w : o.anchor === 'middle' ? x - w / 2 : x;
      return { x0: x0 - 3, x1: x0 + w + 3, y0: y - sz - 1, y1: y + 5,
        svg: (o.halo ? '<rect x="' + (x0 - 3).toFixed(1) + '" y="' + (y - sz + 1).toFixed(1) + '" width="' + (w + 6).toFixed(1) + '" height="' + (sz + 5) + '" rx="3" fill="' + CARD + '"/>' : '') +
          '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-family="Lexend, sans-serif" font-size="' + sz + '"' + (o.bold ? ' font-weight="600"' : '') +
          (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + ' fill="' + (o.fill || INK) + '">' + s + '</text>' };
    }
    function arrowPath(x1, y1, x2, y2) {
      var a = Math.atan2(y2 - y1, x2 - x1), h = 8;
      return '<path d="M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' L' + x2.toFixed(1) + ',' + y2.toFixed(1) +
        ' M' + (x2 - h * Math.cos(a - 0.5)).toFixed(1) + ',' + (y2 - h * Math.sin(a - 0.5)).toFixed(1) + ' L' + x2.toFixed(1) + ',' + y2.toFixed(1) +
        ' L' + (x2 - h * Math.cos(a + 0.5)).toFixed(1) + ',' + (y2 - h * Math.sin(a + 0.5)).toFixed(1) + '" fill="none" stroke="' + INK + '" stroke-width="2.2"/>';
    }
    function clipLine(A, B, C, w) {
      /* A x + B y + C = 0 (floats only for drawing; the decisions above are exact) */
      var p = [], e = 1e-9;
      if (B) [w.x0, w.x1].forEach(function (x) { var y = -(A * x + C) / B; if (y >= w.y0 - e && y <= w.y1 + e) p.push([x, y]); });
      if (A) [w.y0, w.y1].forEach(function (y) { var x = -(B * y + C) / A; if (x >= w.x0 - e && x <= w.x1 + e) p.push([x, y]); });
      if (p.length < 2) return null;
      p.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      var s = p[0], t = p[p.length - 1];
      return Math.abs(s[0] - t[0]) + Math.abs(s[1] - t[1]) < 1e-9 ? null : [s, t];
    }
    function edgeRay(fx, fy, w) {
      /* from the origin towards (fx, fy): the point where the ray leaves the (symmetric) window */
      var t = Math.min(fx ? w.x1 / Math.abs(fx) : Infinity, fy ? w.y1 / Math.abs(fy) : Infinity);
      return [fx * t, fy * t];
    }
    function drawGraph(I, r) {
      var w = view(), X = function (x) { return 20 + (x - w.x0) / (w.x1 - w.x0) * 320; }, Y = function (y) { return 14 + (w.y1 - y) / (w.y1 - w.y0) * 320; };
      var boxes = [], mk = '', g = '', ln = '', k;
      function hits(b) { return b.x0 < 0 || b.x1 > 360 || b.y0 < 0 || b.y1 > 348 || boxes.some(function (o) { return b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0; }); }
      function put(b) { boxes.push(b); mk += b.svg; }
      function place(cands) { var p = cands.filter(function (b) { return !hits(b); })[0] || cands[0]; put(p); }
      var bad = r.bad || [];
      /* point of intersection */
      if (!bad.length && r.kind === 'i') {
        var xv = r.x.n / r.x.d, yv = r.y.n / r.y.d, lab = '(' + tlCoord(r.x) + ', ' + tlCoord(r.y) + ')';
        if (xv >= w.x0 && xv <= w.x1 && yv >= w.y0 && yv <= w.y1) {
          var dx_ = X(xv), dy_ = Y(yv), so = { halo: true, bold: true, size: lab.length > 12 ? 13 : 15 };
          mk += '<circle cx="' + dx_.toFixed(1) + '" cy="' + dy_.toFixed(1) + '" r="5.5" fill="' + INK + '" stroke="' + CARD + '" stroke-width="1.4"/>';
          place([txt(dx_ + 9, dy_ - 9, lab, so), txt(dx_ + 9, dy_ + 20, lab, so), txt(dx_ - 9, dy_ - 9, lab, Object.assign({ anchor: 'end' }, so)),
            txt(dx_ - 9, dy_ + 20, lab, Object.assign({ anchor: 'end' }, so)), txt(Math.max(110, Math.min(250, dx_)), dy_ - 14, lab, Object.assign({ anchor: 'middle' }, so)),
            txt(Math.max(110, Math.min(250, dx_)), dy_ + 26, lab, Object.assign({ anchor: 'middle' }, so))]);
        } else {
          var e2 = edgeRay(xv, yv, w), ex2 = X(e2[0]), ey2 = Y(e2[1]), cx2 = X(0), cy2 = Y(0), ddx = ex2 - cx2, ddy = ey2 - cy2, L2 = Math.sqrt(ddx * ddx + ddy * ddy);
          mk += arrowPath(ex2 - ddx / L2 * 46, ey2 - ddy / L2 * 46, ex2 - ddx / L2 * 3, ey2 - ddy / L2 * 3);
          boxes.push({ x0: Math.min(ex2, ex2 - ddx / L2 * 46) - 4, x1: Math.max(ex2, ex2 - ddx / L2 * 46) + 4, y0: Math.min(ey2, ey2 - ddy / L2 * 46) - 4, y1: Math.max(ey2, ey2 - ddy / L2 * 46) + 4, svg: '' });
          var lines = ['the lines meet at ' + lab, '— off the graph'];
          if (!S.zoom && Math.abs(xv) <= 40 && Math.abs(yv) <= 40) lines.push('Zoom out to see it');
          var ty0 = ey2 < 174 ? Math.max(40, ey2 + 44) : Math.min(326 - 20 * (lines.length - 1), ey2 - 34 - 20 * (lines.length - 1));
          var anc = ex2 > 250 ? 'end' : ex2 < 110 ? 'start' : 'middle', tx0 = anc === 'end' ? 334 : anc === 'start' ? 26 : 180;
          lines.forEach(function (s, j) { put(txt(tx0, ty0 + 20 * j, s, { anchor: anc, halo: true, bold: true, size: 13 })); });
        }
      }
      /* lines: line 1 first, line 2 (dashed) on top */
      [0, 1].forEach(function (i) {
        if (bad.indexOf(i + 1) >= 0) return;
        var A = I[3 * i], B = I[3 * i + 1], C = I[3 * i + 2], seg = clipLine(A, B, C, w), name = 'line ' + (i + 1);
        if (!seg) {
          var n2 = A * A + B * B, e = edgeRay(-A * C / n2, -B * C / n2, w), ex = X(e[0]), ey = Y(e[1]);
          var cx = X(0), cy = Y(0), dx = ex - cx, dy = ey - cy, L = Math.sqrt(dx * dx + dy * dy);
          mk += arrowPath(ex - dx / L * 40, ey - dy / L * 40, ex - dx / L * 3, ey - dy / L * 3);
          var ty = Math.max(34, Math.min(326, ey + (dy < 0 ? 30 : -16) + (dy === 0 ? 0 : 0) + i * 0));
          place([txt(180, ty, name + ' is off the graph — try Zoom out', { anchor: 'middle', halo: true, size: 13, bold: true, fill: COL[i] }),
            txt(180, ty + (dy < 0 ? 20 : -20), name + ' is off the graph — try Zoom out', { anchor: 'middle', halo: true, size: 13, bold: true, fill: COL[i] })]);
          return;
        }
        ln += '<path class="tl-l' + (i + 1) + '" d="M' + X(seg[0][0]).toFixed(2) + ',' + Y(seg[0][1]).toFixed(2) + ' L' + X(seg[1][0]).toFixed(2) + ',' + Y(seg[1][1]).toFixed(2) +
          '" fill="none" stroke="' + COL[i] + '" stroke-width="2.6"' + (i ? ' stroke-dasharray="8 6"' : '') + '/>';
        /* label at the right-hand end (the top end of a vertical line) */
        var vert = B === 0, end = vert ? (seg[0][1] > seg[1][1] ? seg[0] : seg[1]) : seg[1];
        var px = X(end[0]), py = Y(end[1]), o = { halo: true, bold: true, fill: COL[i] }, c = [];
        if (vert) {
          [py + 16, py + 36, py + 56].forEach(function (yy) {
            c.push(txt(px + 6, yy, name, Object.assign({}, o)), txt(px - 6, yy, name, Object.assign({ anchor: 'end' }, o)));
          });
        } else {
          var dn = py < 174 ? 1 : -1;
          [0, 20, 40].forEach(function (d) {
            c.push(txt(px - 6, py + dn * (14 + d), name, Object.assign({ anchor: 'end' }, o)));
          });
          c.push(txt(px - 6, py - dn * 8, name, Object.assign({ anchor: 'end' }, o)));
          [0, 20, 40, 60, 80].forEach(function (d) {
            c.push(txt(px - 60, py + dn * (14 + d), name, Object.assign({ anchor: 'end' }, o)), txt(px - 110, py + dn * (14 + d), name, Object.assign({ anchor: 'end' }, o)));
          });
        }
        place(c);
      });
      /* grid, axes, axis names, tick numbers (skipped where a label sits) */
      for (k = w.x0; k <= w.x1; k += w.g) g += '<path d="M' + X(k).toFixed(1) + ',14 L' + X(k).toFixed(1) + ',334" stroke="var(--dg-m-grid, #D6E0EC)" stroke-width="0.7"/>';
      for (k = w.y0; k <= w.y1; k += w.g) g += '<path d="M20,' + Y(k).toFixed(1) + ' L340,' + Y(k).toFixed(1) + '" stroke="var(--dg-m-grid, #D6E0EC)" stroke-width="0.7"/>';
      var ax = 'stroke="' + INK + '" stroke-width="1.4" fill="none"', o0 = Y(0), z0 = X(0);
      g += '<path d="M20,' + o0 + ' L340,' + o0 + ' M' + z0 + ',14 L' + z0 + ',334" ' + ax + '/>' +
        '<path d="M335,' + (o0 - 5) + ' L340,' + o0 + ' L335,' + (o0 + 5) + ' M25,' + (o0 - 5) + ' L20,' + o0 + ' L25,' + (o0 + 5) +
        ' M' + (z0 - 5) + ',19 L' + z0 + ',14 L' + (z0 + 5) + ',19 M' + (z0 - 5) + ',329 L' + z0 + ',334 L' + (z0 + 5) + ',329" ' + ax + '/>';
      var fl = function (b) { if (!hits(b)) g += b.svg; };
      [txt(338, o0 - 7, 'X', { anchor: 'end', fill: SOFT, bold: true }), txt(22, o0 - 7, 'X′', { fill: SOFT, bold: true }),
        txt(z0 + 6, 28, 'Y', { fill: SOFT, bold: true }), txt(z0 + 6, 330, 'Y′', { fill: SOFT, bold: true }),
        txt(z0 - 5, o0 + 15, 'O', { anchor: 'end', fill: SOFT })].forEach(fl);
      w.lx.forEach(function (v) { fl(txt(X(v), o0 + 17, mMinus(v), { anchor: 'middle', fill: SOFT })); fl(txt(z0 - 5, Y(v) + 5, mMinus(v), { anchor: 'end', fill: SOFT })); });
      q('tl-grid').innerHTML = g;
      q('tl-lines').innerHTML = ln;
      q('tl-marks').innerHTML = mk;
    }
    function rl(v) { return '<span class="gx-fr"><span><i>' + v + '</i><sub>1</sub></span><span class="sr">/</span><span><i>' + v + '</i><sub>2</sub></span></span>'; }
    function sub(v, n) { return '<i>' + v + '</i><sub>' + n + '</sub>'; }
    var renderRead = mThrottle(function () {
      var I = ints(), r = tlSolve(I), nl = '';
      (r.bad || []).forEach(function (n) {
        var c = I[3 * n - 1];
        nl += '<p class="tl-bad">line ' + n + ' is not a line: a' + (n === 1 ? '₁' : '₂') + ' and b' + (n === 1 ? '₁' : '₂') + ' are both 0 ' +
          (c === 0 ? '(every point satisfies 0 = 0)' : '(no point satisfies it)') + '</p>';
      });
      q('tl-nl').innerHTML = nl;
      var bad = r.bad.length > 0;
      q('tl-ban').hidden = bad;
      q('tl-ban').textContent = bad ? '' : TL_CASE[r.kind];
      q('tl-ban').className = 'tl-ban' + (bad ? '' : ' tl-ban--' + r.kind);
      var pt = q('tl-pt');
      pt.hidden = bad || r.kind !== 'i';
      if (!pt.hidden) {
        var xv = r.x.n / r.x.d, yv = r.y.n / r.y.d, w = view(), lab = '(' + tlCoord(r.x, true) + ', ' + tlCoord(r.y, true) + ')';
        var off = xv < w.x0 || xv > w.x1 || yv < w.y0 || yv > w.y1;
        pt.innerHTML = 'point of intersection: <span class="mx tl-xy">' + lab + '</span>' +
          (off ? '<span class="tl-off">the lines meet at ' + lab + ' — off the graph' + (!S.zoom && Math.abs(xv) <= 40 && Math.abs(yv) <= 40 ? ' · Zoom out to see it' : '') + '</span>' : '');
      }
      var rat = q('tl-rat');
      rat.hidden = bad || !S.ratios;
      if (!bad) {
        var fv = function (p) { return p ? '<span class="mx">' + gxFrHtml(p) + '</span>' : '<span class="tl-dz">— (denominator is 0)</span>'; };
        var cmp = function (p, s) { return p && s ? '<p class="tl-cmp mx" aria-hidden="false">' + (gxFrEq(p, s) ? '=' : '≠') + '</p>' : '<p class="tl-cmp"></p>'; };
        q('tl-rows').innerHTML = '<p class="tl-r tl-ra"><span class="mx">' + rl('a') + ' =</span> ' + fv(r.ra) + '</p>' + cmp(r.ra, r.rb) +
          '<p class="tl-r tl-rb"><span class="mx">' + rl('b') + ' =</span> ' + fv(r.rb) + '</p>' + cmp(r.rb, r.rc) +
          '<p class="tl-r tl-rc"><span class="mx">' + rl('c') + ' =</span> ' + fv(r.rc) + '</p>';
        var t = r.test, word = { i: 'intersecting', p: 'parallel', c: 'coincident' }[t.kind], con;
        if (t.by === 'ratio') {
          con = t.kind === 'i' ? rl('a') + ' ≠ ' + rl('b') + ' → intersecting'
            : rl('a') + ' = ' + rl('b') + (t.kind === 'c' ? ' = ' : ' ≠ ') + rl('c') + ' → ' + word;
        } else {
          con = '<span class="tl-mh">A denominator is 0, so the ratio test can\'t be used here. Multiple test:</span> ' +
            (!t.m ? 'no <i>m</i> gives ' + sub('a', 2) + ' = <i>m</i>·' + sub('a', 1) + ' and ' + sub('b', 2) + ' = <i>m</i>·' + sub('b', 1) + ' → intersecting'
              : '<i>m</i> = ' + gxFrHtml(t.m) + ' gives ' + sub('a', 2) + ' = <i>m</i>·' + sub('a', 1) + ' and ' + sub('b', 2) + ' = <i>m</i>·' + sub('b', 1) + '; ' +
              sub('c', 2) + (t.kind === 'c' ? ' = ' : ' ≠ ') + '<i>m</i>·' + sub('c', 1) + ' → ' + word);
        }
        q('tl-con').innerHTML = con;
        q('tl-con').setAttribute('data-case', t.kind);
      }
    }, 250);
    function render() {
      var I = ints(), r = tlSolve(I);
      [1, 2].forEach(function (n) {
        $('.tl-eq' + n + ' .tl-ex', root).innerHTML = tlEq(I[3 * n - 3], I[3 * n - 2], I[3 * n - 1], S.dform);
      });
      drawGraph(I, r);
      $('title', svg).textContent = 'Graph of line 1: ' + $('.tl-eq1 .tl-ex', root).textContent + ' and line 2: ' + $('.tl-eq2 .tl-ex', root).textContent +
        (r.bad.length ? '' : ' — ' + TL_CASE[r.kind]);
      q('tl-note').hidden = r.bad.length > 0 || r.kind !== 'c';
      root.setAttribute('data-case', r.bad.length ? 'none' : r.kind);
      $$('.tl-chip', root).forEach(function (c) {
        var v = TL_PRESETS[+c.getAttribute('data-i')][1];
        c.setAttribute('aria-pressed', TL_KEYS.every(function (k, i) { return V[k[0]] === v[i]; }) ? 'true' : 'false');
      });
      renderRead();
    }
    function word(v) { return v < 0 ? 'minus ' + (-v) : String(v); }
    function setV(k, v, fromBox, quiet) {
      V[k] = v;
      var rg = $('.tl-range[data-k="' + k + '"]', root), nb = $('.tl-num[data-k="' + k + '"]', root), er = $('#' + uid + '-e' + k, root);
      rg.value = String(v);
      rg.setAttribute('aria-valuetext', TL_KEYS.filter(function (d) { return d[0] === k; })[0][2] + ' equals ' + word(v));
      if (!fromBox) nb.value = gxNum(v);
      er.hidden = true; nb.removeAttribute('aria-invalid');
      if (!quiet) render();
    }
    TL_KEYS.forEach(function (d) {
      var k = d[0], rg = $('.tl-range[data-k="' + k + '"]', root), nb = $('.tl-num[data-k="' + k + '"]', root), er = $('#' + uid + '-e' + k, root), t = null;
      on(rg, 'input', function () { setV(k, parseFloat(rg.value)); });
      on(rg, 'keydown', function (e) {
        var key = e.key, n = null;
        if (key === 'ArrowRight' || key === 'ArrowUp') n = V[k] + 0.5;
        else if (key === 'ArrowLeft' || key === 'ArrowDown') n = V[k] - 0.5;
        else if (key === 'PageUp') n = V[k] + 2; else if (key === 'PageDown') n = V[k] - 2;
        else if (key === 'Home') n = -tlLim(k); else if (key === 'End') n = tlLim(k);
        if (n === null) return;
        e.preventDefault();
        setV(k, Math.max(-tlLim(k), Math.min(tlLim(k), n)));
      });
      function check(final) {
        var s = nb.value.replace(/−/g, '-').replace(/\s/g, '');
        var ok = /^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(s), v = ok ? parseFloat(s) : NaN;
        ok = ok && Math.abs(v * 2 - Math.round(v * 2)) < 1e-9 && v >= -tlLim(k) && v <= tlLim(k);
        if (ok) { setV(k, Math.round(v * 2) / 2, !final); if (final) nb.value = gxNum(V[k]); return; }
        er.textContent = tlBad(k); er.hidden = false; nb.setAttribute('aria-invalid', 'true');
      }
      on(nb, 'input', function () { clearTimeout(t); t = setTimeout(function () { check(false); }, 400); });
      on(nb, 'change', function () { clearTimeout(t); check(true); });
      on(nb, 'keydown', function (e) { if (e.key === 'Enter') { clearTimeout(t); check(true); } });
      setV(k, V[k], false, true);
    });
    $$('.tl-chip', root).forEach(function (c) {
      on(c, 'click', function () {
        var v = TL_PRESETS[+c.getAttribute('data-i')][1];
        TL_KEYS.forEach(function (k, i) { setV(k[0], v[i], false, true); });
        render();
      });
    });
    on(q('tl-zoom'), 'click', function () { S.zoom = !S.zoom; q('tl-zoom').setAttribute('aria-pressed', S.zoom ? 'true' : 'false'); render(); });
    on(q('tl-form'), 'click', function () { S.dform = !S.dform; q('tl-form').setAttribute('aria-pressed', S.dform ? 'true' : 'false'); render(); });
    on(q('tl-show'), 'click', function () { S.ratios = !S.ratios; q('tl-show').setAttribute('aria-pressed', S.ratios ? 'true' : 'false'); renderRead(); });
    q('tl-show').setAttribute('aria-pressed', S.ratios ? 'true' : 'false');
    render();
  }

  /* ---------------------------------------------------- AP explorer (Maths Ch 5, T03-V6)
     svg[data-ap] is the static first view (content/C10-MATH-CH05/diagrams, _src/ap_a.py v6); initAp replaces it.
     Topic 3 (and the revision pack) open in the "terms" view; Topic 4 (figure block id …-T04.…) opens in the "sum" view.
     Exact arithmetic: a and d are multiples of 0.5, so they are doubled to integers A = 2a, D = 2d. Term k is
     (A + (k − 1)D)/2 and S_k = k(2A + (k − 1)D)/4; k(2A + (k − 1)D) is always even, so every value is a whole number of
     halves and is shown exactly (one decimal place at most). Floats are used only to draw. Values are set in HTML with
     KaTeX fonts (.mx). Nothing is stored. */
  var AP_KEYS = [['a', -50, 50, 0.5], ['d', -10, 10, 0.5], ['n', 1, 100, 1]];
  var AP_PRESETS = [['3, 7, 11, … (n = 5)', [3, 4, 5]], ['going down: 10, 7, 4, … (n = 8)', [10, -3, 8]], ['d = 0: −6, −6, … (n = 7)', [-6, 0, 7]],
    ['halves: 0.5, 2, 3.5, … (n = 6)', [0.5, 1.5, 6]], ['sum reached twice: 30, 26, 22, … (n = 10)', [30, -4, 10]], ['100 terms: 20, 30, 40, …', [20, 10, 100]]];
  function apH(X) {                     /* X halves -> exact string: 7 -> 3.5, -1 -> −0.5, 8 -> 4 */
    if (X % 2 === 0) return mMinus(String(X / 2));
    var s = Math.abs(X), w = (s - 1) / 2;
    return (X < 0 ? '−' : '') + w + '.5';
  }
  function apB(X) { return X < 0 ? '(' + apH(X) + ')' : apH(X); }          /* negatives in brackets when substituted */
  function apOrd(k) {
    var t = k % 100, u = k % 10;
    return k + ((t >= 11 && t <= 13) ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
  }
  function apFr(n, d) { return '<span class="gx-fr"><span>' + n + '</span><span class="sr">/</span><span>' + d + '</span></span>'; }
  function apSub(b, s) { return '<i>' + b + '</i><sub>' + s + '</sub>'; }
  var AP_N = '<i>n</i>', AP_SN = apSub('S', '<i>n</i>'), AP_AN = apSub('a', '<i>n</i>');
  function apNice(lo, hi) {
    /* lo ≤ 0 ≤ hi in tenths (integers); smallest nice step (1, 2, 5 × 10^k tenths) giving at most 5 ticks */
    if (lo === 0 && hi === 0) return { lo: -10, hi: 10, step: 10 };
    for (var p = 1; ; p *= 10) {
      for (var i = 0; i < 3; i++) {
        var s = [1, 2, 5][i] * p, l = Math.floor(lo / s) * s, h = Math.ceil(hi / s) * s;
        if ((h - l) / s + 1 <= 5) return { lo: l, hi: h, step: s };
      }
    }
  }
  function apTick(t) { return t % 10 === 0 ? mMinus(String(t / 10)) : mMinus((t / 10).toFixed(1)); }
  function initAp() {
    $$('svg[data-ap="explorer"]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-ap-on')) return;
      art.setAttribute('data-ap-on', '1');
      var fig = svg.closest('.fig'), t4 = /-T04\./.test(fig ? fig.getAttribute('data-block-id') || '' : '');
      apBuild(art, t4 ? 'sum' : 'terms');
    });
  }
  function apBuild(art, view0) {
    var uid = 'ap' + Math.random().toString(36).slice(2, 7);
    var V = { a: 3, d: 4, n: 5, k: 1 };
    var S = { view: view0, sel: 0, end: false, pair: false, pm: 'fold', shown: 0, timer: null, count: '' };
    var INK = 'var(--ink, #1F2328)', SOFT = 'var(--ink-soft, #57554D)', CARD = 'var(--card, #FFF)', ACC = 'var(--acc, #0A6C74)';
    var C1 = 'var(--dg-m-opp, #C2410C)', C2 = 'var(--dg-m-adj, #1D5FBF)', C2BG = 'var(--dg-m-adj-bg, #DEE9FB)', GRID = 'var(--dg-m-grid, #D6E0EC)';
    var root = document.createElement('div');
    root.className = 'ap';
    function slider(k, lab) {
      return '<div class="ap-c ap-c-' + k + '"><label class="ap-lab" for="' + uid + '-' + k + '">' + lab + '</label>' +
        '<input class="ap-range" type="range" role="slider" id="' + uid + '-' + k + '" data-k="' + k + '">' +
        '<input class="ap-num" type="text" inputmode="' + (k === 'n' || k === 'k' ? 'numeric' : 'decimal') + '" autocomplete="off" data-k="' + k +
        '" aria-label="' + k + ', type a value" aria-describedby="' + uid + '-e' + k + '">' +
        '<p class="ap-err" id="' + uid + '-e' + k + '" hidden></p></div>';
    }
    root.innerHTML =
      '<div class="ap-seg" role="group" aria-label="View"><button type="button" class="ap-v" data-v="terms" aria-pressed="false">terms</button>' +
      '<button type="button" class="ap-v" data-v="sum" aria-pressed="false">sum</button></div>' +
      '<p class="ap-list mx"></p>' +
      '<div class="ap-ctl">' + slider('a', '<i>a</i>') + slider('d', '<i>d</i>') + slider('n', '<i>n</i>') + '</div>' +
      '<div class="ap-chips" role="group" aria-label="Try these APs">' + AP_PRESETS.map(function (p, i) {
        return '<button type="button" class="ap-chip" data-i="' + i + '" aria-pressed="false">' + p[0] + '</button>';
      }).join('') + '</div>' +
      '<div class="ap-tg ap-tg-t"><button type="button" class="fig-toggle ap-end" aria-pressed="false">from the end</button></div>' +
      '<div class="ap-ctl ap-kc" hidden>' + slider('k', '<i>k</i>') + '</div>' +
      '<div class="ap-tg ap-tg-s"><button type="button" class="fig-toggle ap-add">Add one term at a time</button>' +
      '<button type="button" class="fig-toggle ap-pair" aria-pressed="false">pair them up</button></div>' +
      '<div class="ap-seg ap-pm" role="group" aria-label="Pair them up as" hidden><button type="button" class="ap-pv" data-m="fold" aria-pressed="true">fold</button>' +
      '<button type="button" class="ap-pv" data-m="stair" aria-pressed="false">double staircase</button></div>' +
      '<div class="ap-main"><div class="ap-left">' +
      '<svg class="ap-svg" tabindex="0" role="group" aria-label="Bars for the terms. Use the left and right arrow keys to select a term."><defs>' +
      '<pattern id="' + uid + '-h" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="6" height="6" fill="' + C2BG + '"/>' +
      '<path d="M0,0 L0,6" stroke="' + C2 + '" stroke-width="1.6"/></pattern></defs><g class="ap-g"></g></svg>' +
      '<p class="ap-note" hidden>every term is 0</p>' +
      '<div class="ap-runw" hidden><p class="ap-rh">running sum ' + apSub('S', '<i>k</i>') + '</p><svg class="ap-run" aria-hidden="true"></svg></div>' +
      '<p class="ap-count mx" hidden></p>' +
      '<div class="ap-pairw" hidden><p class="ap-rh">pair them up: each pair = <i>a</i> + <i>l</i></p><svg class="ap-psvg" aria-hidden="true"></svg><p class="ap-pmsg"></p></div>' +
      '</div><div class="ap-read" aria-live="polite"></div></div>';
    art.innerHTML = '';
    art.appendChild(root);
    var q = function (c) { return $('.' + c, root); }, svg = q('ap-svg'), g = q('ap-g');
    var cv = document.createElement('canvas').getContext('2d');
    function tw(s, sz, bold) { if (!cv) return s.length * sz * 0.6; cv.font = (bold ? '600 ' : '') + sz + 'px Lexend, sans-serif'; return cv.measureText(s).width; }
    function lim(k) { return k === 'k' ? [1, V.n, 1] : AP_KEYS.filter(function (r) { return r[0] === k; })[0].slice(1); }
    /* ---- the AP, exactly */
    function st() {
      var A = Math.round(V.a * 2), D = Math.round(V.d * 2), n = V.n, X = [], k;
      for (k = 1; k <= n; k++) X.push(A + (k - 1) * D);
      var L = X[n - 1], tt = 0;
      for (k = 0; k < n; k++) tt += X[k];                       /* term-by-term total, in halves */
      var f1 = n * (2 * A + (n - 1) * D) / 2;                     /* Sₙ by n/2 [2a + (n − 1)d], in halves (exact: even/2) */
      var f2 = n * (A + L) / 2;                                   /* Sₙ by n/2 (a + l), in halves */
      var sk = function (j) { return j * (2 * A + (j - 1) * D) / 2; };
      var twice = 0;
      for (k = 1; k < n; k++) if (sk(k) === f1) { twice = k; break; }
      return { A: A, D: D, n: n, X: X, L: L, tt: tt, f1: f1, f2: f2, sk: sk, twice: twice, zero: A === 0 && D === 0,
        pos: Math.min(A, L) >= 0, neg: Math.max(A, L) <= 0 };
    }
    function shown() { return S.shown || V.n; }
    /* ---- chart */
    function geom(s) {
      var W = Math.max(200, Math.round(svg.getBoundingClientRect().width || 340)), H = window.matchMedia && window.matchMedia('(min-width: 768px)').matches ? 280 : 220;
      var L = 42, R = 6, T = 34, B = 30, pw = W - L - R, slot = pw / s.n;
      var stair = S.view === 'sum' && S.pair && S.pm === 'stair' && s.n > 1 && !s.zero && (s.pos || s.neg);
      var lo = 0, hi = 0;
      s.X.forEach(function (x) { lo = Math.min(lo, 5 * x); hi = Math.max(hi, 5 * x); });
      if (stair) { lo = Math.min(lo, 5 * (s.A + s.L)); hi = Math.max(hi, 5 * (s.A + s.L)); }
      var sc = apNice(lo, hi);
      var Y = function (t10) { return T + (sc.hi - t10) / (sc.hi - sc.lo) * (H - T - B); };
      return { W: W, H: H, L: L, R: R, T: T, B: B, pw: pw, slot: slot, sc: sc, Y: Y, stair: stair,
        cx: function (k) { return L + slot * (k - 0.5); } };
    }
    function drawChart(s) {
      var G = geom(s), W = G.W, H = G.H, Y = G.Y, n = s.n, out = '', k, sh = shown();
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      root.setAttribute('data-slot', G.slot.toFixed(3));
      /* ticks: at most 5 labels on the left */
      for (var t = G.sc.lo; t <= G.sc.hi; t += G.sc.step) {
        var yy = Y(t);
        out += '<path d="M' + G.L + ',' + yy.toFixed(1) + ' L' + (W - G.R) + ',' + yy.toFixed(1) + '" stroke="' + GRID + '" stroke-width="0.8"/>' +
          '<text class="ap-tk" x="' + (G.L - 5) + '" y="' + (yy + 4).toFixed(1) + '" text-anchor="end" font-family="Lexend, sans-serif" font-size="12" fill="' + SOFT + '">' + apTick(t) + '</text>';
      }
      var y0 = Y(0), gap = G.slot >= 8, bw = gap ? G.slot - 2 : G.slot;
      root.setAttribute('data-bw', bw.toFixed(3));
      var bars = '', marks = '', hits = '';
      for (k = 1; k <= n; k++) {
        var x = G.L + G.slot * (k - 1) + (gap ? 1 : 0), v = s.X[k - 1], lab = 'term ' + k + ': ' + apH(v);
        var vis = k <= sh;
        if (vis) {
          if (v === 0) bars += '<rect class="ap-bar ap-zero" role="img" aria-label="' + lab + '" x="' + x.toFixed(2) + '" y="' + (y0 - 2.8).toFixed(2) + '" width="' + bw.toFixed(2) + '" height="2" fill="' + C1 + '"/>';
          else {
            var yv = Y(5 * v);
            bars += '<rect class="ap-bar" role="img" aria-label="' + lab + '" x="' + x.toFixed(2) + '" y="' + Math.min(y0, yv).toFixed(2) + '" width="' + bw.toFixed(2) +
              '" height="' + Math.abs(yv - y0).toFixed(2) + '" fill="' + C1 + '"/>';
          }
          if (G.stair) {
            var top = Y(5 * (s.A + s.L)), yb = Y(5 * v);
            if (s.X[n - k] !== 0) bars += '<rect class="ap-hat" x="' + x.toFixed(2) + '" y="' + Math.min(yb, top).toFixed(2) + '" width="' + bw.toFixed(2) + '" height="' + Math.abs(top - yb).toFixed(2) +
              '" fill="url(#' + uid + '-h)" stroke="' + C2 + '" stroke-width="' + (bw > 6 ? 1.2 : 0) + '"/>';
          }
        }
        var hw = Math.max(G.slot, 44);
        hits += '<rect class="ap-hit" data-k="' + k + '" x="' + (G.cx(k) - hw / 2).toFixed(2) + '" y="' + (G.T - 20) + '" width="' + hw.toFixed(2) + '" height="' + (H - G.T + 14) + '" fill="transparent"/>';
      }
      /* outlines: middle (terms view), from the end, selected — always with a text label too */
      function outline(k1, k2, cls, dash) {
        var xa = G.L + G.slot * (k1 - 1), xb = G.L + G.slot * k2, ya = y0, yb = y0;
        for (var j = k1; j <= k2; j++) { var yv2 = Y(5 * s.X[j - 1]); ya = Math.min(ya, yv2); yb = Math.max(yb, yv2); }
        marks += '<rect class="' + cls + '" x="' + (xa - 0.5).toFixed(2) + '" y="' + (ya - 3).toFixed(2) + '" width="' + (xb - xa + 1).toFixed(2) + '" height="' + (yb - ya + 6).toFixed(2) +
          '" rx="3" fill="none" stroke="' + INK + '" stroke-width="2.2"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
      }
      var mid = [];
      if (n > 1) mid = n % 2 ? [(n + 1) / 2] : [n / 2, n / 2 + 1];
      var showMid = S.view === 'terms' && n > 1, endK = S.view === 'terms' && S.end ? n - V.k + 1 : 0;
      if (showMid) outline(mid[0], mid[mid.length - 1], 'ap-mid', '6 4');
      if (endK) outline(endK, endK, 'ap-endo', '2 3');
      if (S.sel && S.sel <= sh) outline(S.sel, S.sel, 'ap-selo', '');
      /* rectangle (double staircase) */
      var rect = '';
      if (G.stair) {
        var ry = Y(5 * (s.A + s.L)), rx0 = G.L, rx1 = G.L + G.slot * n;
        rect = '<rect class="ap-rect" x="' + rx0.toFixed(2) + '" y="' + Math.min(ry, y0).toFixed(2) + '" width="' + (rx1 - rx0).toFixed(2) + '" height="' + Math.abs(ry - y0).toFixed(2) +
          '" fill="none" stroke="' + INK + '" stroke-width="2.4"/>';
      }
      /* labels: placed in priority order (selected, nth, from the end, middle, first, the rest); never overlapping */
      var boxes = [], labs = [];
      function want(text, cx, yEnd, up, pri, cls) { labs.push({ t: text, cx: cx, y: yEnd, up: up, p: pri, c: cls || '' }); }
      var all = G.slot >= 28, l12 = 12;
      for (k = 1; k <= Math.min(n, sh); k++) {
        if (G.stair) break;
        var v2 = s.X[k - 1], isMid = showMid && mid.indexOf(k) >= 0, up = v2 >= 0, ye = v2 === 0 ? y0 - 3 : Y(5 * v2);
        if (k === S.sel) { want('term ' + k + ': ' + apH(v2), G.cx(k), ye, up, 6, 'ap-l-sel'); continue; }
        if (k === endK) { want(apOrd(V.k) + ' from the end: ' + apH(v2), G.cx(k), ye, up, 4, 'ap-l-end'); continue; }
        if (isMid) continue;
        if (k === n) want(apH(v2), G.cx(k), ye, up, 5, 'ap-l-n');
        else if (k === 1) want(apH(v2), G.cx(k), ye, up, 2, 'ap-l-1');
        else if (all) want(apH(v2), G.cx(k), ye, up, 1, 'ap-l-v');
      }
      if (showMid && !G.stair && mid[mid.length - 1] <= sh) {
        var mv = mid.map(function (j) { return s.X[j - 1]; }), mup = Math.max.apply(null, mv) >= 0;
        var mye = mup ? Math.min.apply(null, mv.map(function (x) { return x === 0 ? y0 - 3 : Y(5 * x); })) : Math.max.apply(null, mv.map(function (x) { return Y(5 * x); }));
        var mcx = (G.cx(mid[0]) + G.cx(mid[mid.length - 1])) / 2;
        var mtxt = mid.length === 1 ? 'middle term ' + apH(mv[0]) : 'middle terms ' + apH(mv[0]) + ', ' + apH(mv[1]);
        want(mtxt, mcx, mye, mup, 3, 'ap-l-mid');
      }
      if (G.stair) {
        var neg = s.neg && !s.pos, ryy = Y(5 * (s.A + s.L));
        want('rectangle = 2S = n(a + l)', G.L + G.slot * n / 2, ryy, !neg, 7, 'ap-l-rect');
        want('a + l = ' + apH(s.A + s.L), G.L + G.slot * n / 2, ryy, !neg, 6.5, 'ap-l-al');
        if (S.sel && S.sel <= sh) want('term ' + S.sel + ': ' + apH(s.X[S.sel - 1]), G.cx(S.sel), y0, neg, 6, 'ap-l-sel');
      }
      labs.sort(function (p, r) { return r.p - p.p; });
      var txt = '';
      labs.forEach(function (o) {
        var w = tw(o.t, l12, true) + 6;
        for (var lane = 0; lane < 4; lane++) {
          var by = o.up ? o.y - 5 - lane * 15 : o.y + 15 + lane * 15;
          var cx = Math.max(G.L - 30 + w / 2, Math.min(W - w / 2 - 1, o.cx));
          var b = { x0: cx - w / 2, x1: cx + w / 2, y0: by - 11, y1: by + 3 };
          if (b.y0 < 0 || b.y1 > H) continue;
          if (boxes.some(function (c) { return b.x0 < c.x1 && b.x1 > c.x0 && b.y0 < c.y1 && b.y1 > c.y0; })) continue;
          boxes.push(b);
          txt += '<g class="ap-lb ' + o.c + '"><rect x="' + b.x0.toFixed(1) + '" y="' + b.y0.toFixed(1) + '" width="' + w.toFixed(1) + '" height="14" rx="3" fill="' + CARD + '" opacity="0.92"/>' +
            '<text x="' + cx.toFixed(1) + '" y="' + by.toFixed(1) + '" text-anchor="middle" font-family="Lexend, sans-serif" font-size="12" font-weight="600" fill="' + INK + '">' + o.t + '</text></g>';
          return;
        }
      });
      var zl = '<path d="M' + G.L + ',' + y0.toFixed(1) + ' L' + (W - G.R) + ',' + y0.toFixed(1) + '" stroke="' + INK + '" stroke-width="1.6"/>';
      g.innerHTML = out + bars + zl + rect + marks + txt + hits;
      q('ap-note').hidden = !s.zero;
      return G;
    }
    function drawRun(s, G) {
      var w = q('ap-runw'), on_ = S.view === 'sum';
      w.hidden = !on_;
      if (!on_) return;
      var rs = q('ap-run'), W = G.W, H = 38, sh = shown(), out = '', boxes = [], ks = [];
      rs.setAttribute('viewBox', '0 0 ' + W + ' ' + H); rs.style.height = H + 'px';
      if (G.slot >= 28) for (var k = 1; k <= Math.min(s.n, sh); k++) ks.push(k);
      else { if (S.sel && S.sel <= sh) ks.push(S.sel); if (sh >= s.n && ks.indexOf(s.n) < 0) ks.push(s.n); if (S.shown && ks.indexOf(sh) < 0) ks.push(sh); }
      ks.forEach(function (k) {
        var t = apH(s.sk(k)), wd = tw(t, 12, true) + 4, cx = Math.max(wd / 2, Math.min(W - wd / 2, G.cx(k)));
        for (var lane = 0; lane < 2; lane++) {
          var by = 14 + lane * 17, b = { x0: cx - wd / 2, x1: cx + wd / 2 };
          if (boxes.some(function (c) { return c.l === lane && b.x0 < c.x1 + 2 && b.x1 > c.x0 - 2; })) continue;
          boxes.push({ l: lane, x0: b.x0, x1: b.x1 });
          out += '<text class="ap-rs" data-k="' + k + '" x="' + cx.toFixed(1) + '" y="' + by + '" text-anchor="middle" font-family="Lexend, sans-serif" font-size="12" font-weight="600" fill="' + INK + '">' + t + '</text>';
          return;
        }
      });
      rs.innerHTML = '<path d="M' + G.L + ',1 L' + (W - G.R) + ',1" stroke="' + GRID + '" stroke-width="1"/>' + out;
    }
    function drawPair(s, G) {
      var w = q('ap-pairw'), on_ = S.view === 'sum' && S.pair && s.n > 1, ps = q('ap-psvg'), msg = q('ap-pmsg');
      w.hidden = !on_;
      if (!on_) return;
      var al = s.A + s.L, odd = s.n % 2 === 1, P = Math.floor(s.n / 2);
      msg.innerHTML = ''; ps.style.display = 'none'; ps.innerHTML = '';
      if (S.pm === 'stair') {
        if (s.zero) msg.textContent = 'every term is 0, so every sum is 0';
        else if (!(s.pos || s.neg)) msg.textContent = 'Some terms are negative and some positive, so the two staircases do not make a rectangle on the picture — but every pair still adds to a + l = ' + apH(al);
        else msg.innerHTML = 'rectangle = 2<i>S</i> = <i>n</i>(<i>a</i> + <i>l</i>) — ' + (s.neg && !s.pos ? 'it hangs below the zero line' : 'the hatched copy is the list backwards');
        return;
      }
      if (s.n > 20) {
        msg.textContent = odd ? '(n − 1)/2 pairs, each = a + l, plus the middle term (a + l)/2' : 'n/2 pairs, each = a + l';
        return;
      }
      var W = G.W, dep = function (j) { return 10 + (P - j + 1) * 17; }, H = dep(1) + 14 + (odd ? 30 : 0), out = '';
      ps.style.display = '';
      ps.setAttribute('viewBox', '0 0 ' + W + ' ' + H); ps.style.height = H + 'px';
      if (odd) {
        var xm = G.cx((s.n + 1) / 2);
        out += '<path d="M' + xm.toFixed(1) + ',2 L' + xm.toFixed(1) + ',' + (H - 22) + '" stroke="' + SOFT + '" stroke-width="1.2" stroke-dasharray="3 3"/>';
      }
      for (var j = 1; j <= P; j++) {
        var x1 = G.cx(j), x2 = G.cx(s.n + 1 - j), d = dep(j);
        out += '<path class="ap-arc" data-j="' + j + '" d="M' + x1.toFixed(1) + ',2 C' + x1.toFixed(1) + ',' + (d * 4 / 3).toFixed(1) + ' ' + x2.toFixed(1) + ',' + (d * 4 / 3).toFixed(1) + ' ' + x2.toFixed(1) + ',2" fill="none" stroke="' + ACC + '" stroke-width="1.6"/>';
      }
      for (j = 1; j <= P; j++) {
        var t = apH(s.X[j - 1] + s.X[s.n - j]), wd = tw(t, 12, true) + 6, xc = (G.cx(j) + G.cx(s.n + 1 - j)) / 2, yb = dep(j) + 5;
        out += '<g class="ap-pt" data-j="' + j + '"><rect x="' + (xc - wd / 2).toFixed(1) + '" y="' + (yb - 11) + '" width="' + wd.toFixed(1) + '" height="14" rx="3" fill="' + CARD + '"/>' +
          '<text x="' + xc.toFixed(1) + '" y="' + yb + '" text-anchor="middle" font-family="Lexend, sans-serif" font-size="12" font-weight="600" fill="' + INK + '">' + t + '</text></g>';
      }
      if (odd) {
        var mt = 'middle term = (a + l)/2 — half a pair', mw = tw(mt, 12, true), mx = Math.max(mw / 2 + 2, Math.min(W - mw / 2 - 2, G.cx((s.n + 1) / 2)));
        out += '<text class="ap-pmid" x="' + mx.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-family="Lexend, sans-serif" font-size="12" font-weight="600" fill="' + INK + '">' + mt + '</text>';
      }
      ps.innerHTML = out;
    }
    /* ---- read-outs (aria-live region, at most every 250 ms) */
    var renderRead = mThrottle(function () {
      var s = st(), n = s.n, h = '', a = apH(s.A), d = apB(s.D), l = apH(s.L), nn = String(n);
      var cap = '';
      if (s.D === 0) cap = S.view === 'sum' ? 'd = 0: every term equals a, so ' + AP_SN + ' = <i>n</i> × <i>a</i>' : 'd = 0: every term equals a';
      else if (s.D < 0) cap = 'd < 0: each term is smaller than the one before';
      if (cap) h += '<p class="ap-cap">' + cap + '</p>';
      if (S.view === 'terms') {
        h += '<p class="ap-nth mx">' + AP_AN + ' = <i>a</i> + (<i>n</i> − 1)<i>d</i> = ' + a + ' + (' + nn + ' − 1) × ' + d + ' = ' + l + '</p>';
        if (n === 1) h += '<p class="ap-mid1">only one term — it is the first, the last and the middle term</p>';
        else if (n % 2) h += '<p class="ap-midr mx">middle term: ' + apSub('a', (n + 1) / 2) + ' = ' + apH(s.X[(n - 1) / 2]) + '</p>';
        else h += '<p class="ap-midr mx">middle terms: ' + apSub('a', n / 2) + ' = ' + apH(s.X[n / 2 - 1]) + ' and ' + apSub('a', n / 2 + 1) + ' = ' + apH(s.X[n / 2]) + '</p>';
        if (S.end) {
          var K = V.k;
          h += '<p class="ap-endf mx"><i>k</i>th term from the end = <i>l</i> − (<i>k</i> − 1)<i>d</i></p>' +
            '<p class="ap-endv mx">' + apOrd(K) + ' term from the end = ' + l + ' − (' + K + ' − 1) × ' + d + ' = ' + apH(s.L - (K - 1) * s.D) + '</p>';
        }
      } else {
        var two = apFr('<i>n</i>', '2'), twoV = apFr(nn, '2');
        h += '<p class="ap-s1 mx">' + AP_SN + ' = ' + two + '[2<i>a</i> + (<i>n</i> − 1)<i>d</i>] = ' + twoV + '[2 × ' + apB(s.A) + ' + (' + nn + ' − 1) × ' + d + '] = ' + apH(s.f1) + '</p>';
        h += '<p class="ap-s2 mx">' + AP_SN + ' = ' + two + '(<i>a</i> + <i>l</i>) = ' + twoV + '(' + a + ' + ' + apB(s.L) + ') = ' + apH(s.f2) + '</p>';
        var tt = n <= 6 ? s.X.map(function (x, i) { return i ? apB(x) : apH(x); }).join(' + ')
          : s.X.slice(0, 3).map(function (x, i) { return i ? apB(x) : apH(x); }).join(' + ') + ' + … + ' + apB(s.L);
        h += '<p class="ap-tt mx">term by term: ' + tt + ' = ' + apH(s.tt) + '</p>';
        if (s.zero) h += '<p class="ap-twice">every term is 0, so every sum is 0</p>';
        else if (s.twice) h += '<p class="ap-twice">The total is also ' + AP_SN + ' after ' + s.twice + ' term' + (s.twice === 1 ? '' : 's') + ' — the terms in between add up to 0</p>';
        if (S.pair && n > 1) {
          var al = s.A + s.L;
          h += '<p class="ap-pr mx">each pair = <i>a</i> + <i>l</i> = ' + a + ' + ' + apB(s.L) + ' = ' + apH(al) + '</p>';
          if (S.pm === 'stair' && !s.zero && (s.pos || s.neg)) {
            h += '<p class="ap-pr2 mx">rectangle = 2<i>S</i> = <i>n</i>(<i>a</i> + <i>l</i>) = ' + nn + ' × ' + apB(al) + ' = ' + apH(n * al) + ', so ' + AP_SN + ' = ' + apH(s.f2) + '</p>';
          } else if (n % 2) {
            h += '<p class="ap-pr2 mx">' + AP_SN + ' = ' + apFr('<i>n</i> − 1', '2') + ' pairs × (<i>a</i> + <i>l</i>) + ' + apFr('<i>a</i> + <i>l</i>', '2') + ' = ' + two + '(<i>a</i> + <i>l</i>)</p>' +
              '<p class="ap-pr3 mx">= ' + (n - 1) / 2 + ' × ' + apB(al) + ' + ' + apB(al) + '/2 = ' + apH(s.f2) + '</p>' +
              '<p class="ap-prm mx">middle term = (<i>a</i> + <i>l</i>)/2 — half a pair: (' + a + ' + ' + apB(s.L) + ')/2 = ' + apH(s.X[(n - 1) / 2]) + '</p>';
          } else {
            h += '<p class="ap-pr2 mx">' + AP_SN + ' = ' + two + ' × (<i>a</i> + <i>l</i>) = ' + n / 2 + ' × ' + apB(al) + ' = ' + apH(s.f2) + '</p>';
          }
        }
      }
      if (S.sel) h += '<p class="ap-sel mx">' + apSub('a', S.sel) + ' = ' + apH(s.X[S.sel - 1]) + ' · ' + apSub('S', S.sel) + ' = ' + apH(s.sk(S.sel)) + '</p>';
      q('ap-read').innerHTML = h;
    }, 250);
    function render() {
      var s = st();
      if (S.sel > s.n) S.sel = 0;
      var list = s.n <= 5 ? s.X.map(apH).join(', ') : s.X.slice(0, 3).map(apH).join(', ') + ', …, ' + apH(s.L);
      q('ap-list').textContent = list;
      $$('.ap-v', root).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === S.view ? 'true' : 'false'); });
      root.setAttribute('data-view', S.view);
      q('ap-tg-t').hidden = S.view !== 'terms';
      q('ap-kc').hidden = !(S.view === 'terms' && S.end);
      q('ap-tg-s').hidden = S.view !== 'sum';
      var pb = q('ap-pair');
      if (s.n === 1) { pb.innerHTML = 'one term — nothing to pair: ' + apSub('S', '1') + ' = <i>a</i>'; pb.disabled = true; pb.setAttribute('aria-pressed', 'false'); }
      else { pb.textContent = 'pair them up'; pb.disabled = false; pb.setAttribute('aria-pressed', S.pair ? 'true' : 'false'); }
      q('ap-pm').hidden = !(S.view === 'sum' && S.pair && s.n > 1);
      $$('.ap-pv', root).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === S.pm ? 'true' : 'false'); });
      $$('.ap-chip', root).forEach(function (c) {
        var v = AP_PRESETS[+c.getAttribute('data-i')][1];
        c.setAttribute('aria-pressed', V.a === v[0] && V.d === v[1] && V.n === v[2] ? 'true' : 'false');
      });
      var G = drawChart(s);
      drawRun(s, G);
      drawPair(s, G);
      var cn = q('ap-count');
      cn.hidden = !S.count || S.view !== 'sum';
      cn.innerHTML = S.count;
      renderRead();
    }
    /* ---- "Add one term at a time" */
    function stopAnim() { if (S.timer) clearInterval(S.timer); S.timer = null; S.shown = 0; delete root.dataset.anim; }
    function counter(k) { var s = st(); S.count = 'running sum: ' + apSub('S', k) + ' = ' + apH(s.sk(k)); }
    on(q('ap-add'), 'click', function () {
      stopAnim();
      var n = V.n;
      if (reduced) { counter(n); render(); return; }
      var step = Math.max(1, Math.ceil(n / 20));
      S.shown = Math.min(n, step); counter(S.shown); render();
      if (S.shown >= n) { S.shown = 0; render(); return; }
      root.dataset.anim = '1';
      S.timer = setInterval(function () {
        S.shown = Math.min(n, S.shown + step); counter(S.shown);
        if (S.shown >= n) { clearInterval(S.timer); S.timer = null; S.shown = 0; delete root.dataset.anim; }
        render();
      }, 300);
    });
    /* ---- inputs */
    function word(v) { return v < 0 ? 'minus ' + String(-v) : String(v); }
    function setV(k, v, fromBox, quiet) {
      V[k] = v;
      if (k === 'n') { if (V.k > v) setV('k', v, false, true); }
      var rg = $('.ap-range[data-k="' + k + '"]', root), nb = $('.ap-num[data-k="' + k + '"]', root), er = $('#' + uid + '-e' + k, root), lm = lim(k);
      rg.min = lm[0]; rg.max = lm[1]; rg.step = lm[2]; rg.value = String(v);
      rg.setAttribute('aria-valuetext', k + ' equals ' + word(v));
      if (!fromBox) nb.value = mMinus(String(v));
      er.hidden = true; nb.removeAttribute('aria-invalid');
      if (k === 'n') { var kr = $('.ap-range[data-k="k"]', root); if (kr) { kr.max = v; } }
      if (!quiet) {
        if (k !== 'k') { stopAnim(); S.count = ''; }
        render();
      }
    }
    ['a', 'd', 'n', 'k'].forEach(function (k) {
      var rg = $('.ap-range[data-k="' + k + '"]', root), nb = $('.ap-num[data-k="' + k + '"]', root), er = $('#' + uid + '-e' + k, root), t = null;
      on(rg, 'input', function () { setV(k, parseFloat(rg.value)); });
      on(rg, 'keydown', function (e) {
        var lm = lim(k), key = e.key, nv = null, st_ = lm[2];
        if (key === 'ArrowRight' || key === 'ArrowUp') nv = V[k] + st_;
        else if (key === 'ArrowLeft' || key === 'ArrowDown') nv = V[k] - st_;
        else if (key === 'PageUp') nv = V[k] + 5 * st_; else if (key === 'PageDown') nv = V[k] - 5 * st_;
        else if (key === 'Home') nv = lm[0]; else if (key === 'End') nv = lm[1];
        if (nv === null) return;
        e.preventDefault();
        setV(k, Math.max(lm[0], Math.min(lm[1], nv)));
      });
      function check(final) {
        var lm = lim(k), s = nb.value.replace(/−/g, '-').replace(/\s/g, ''), whole = k === 'n' || k === 'k';
        var ok = (whole ? /^\+?\d+$/ : /^[-+]?(\d+(\.\d*)?|\.\d+)$/).test(s), v = ok ? parseFloat(s) : NaN;
        ok = ok && (whole ? v === Math.round(v) : Math.abs(v * 2 - Math.round(v * 2)) < 1e-9) && v >= lm[0] && v <= lm[1];
        if (ok) { setV(k, whole ? Math.round(v) : Math.round(v * 2) / 2, !final); if (final) nb.value = mMinus(String(V[k])); return; }
        er.textContent = whole ? 'Use a whole number from 1 to ' + lm[1] : 'Use a multiple of 0.5 between −' + lm[1] + ' and ' + lm[1];
        er.hidden = false; nb.setAttribute('aria-invalid', 'true');
      }
      on(nb, 'input', function () { clearTimeout(t); t = setTimeout(function () { check(false); }, 400); });
      on(nb, 'change', function () { clearTimeout(t); check(true); });
      on(nb, 'keydown', function (e) { if (e.key === 'Enter') { clearTimeout(t); check(true); } });
      setV(k, V[k], false, true);
    });
    $$('.ap-chip', root).forEach(function (c) {
      on(c, 'click', function () {
        var v = AP_PRESETS[+c.getAttribute('data-i')][1];
        setV('a', v[0], false, true); setV('d', v[1], false, true); setV('n', v[2], false, true);
        stopAnim(); S.count = ''; S.sel = 0;
        render();
      });
    });
    $$('.ap-v', root).forEach(function (b) { on(b, 'click', function () { S.view = b.getAttribute('data-v'); stopAnim(); S.count = ''; render(); }); });
    $$('.ap-pv', root).forEach(function (b) { on(b, 'click', function () { S.pm = b.getAttribute('data-m'); render(); }); });
    on(q('ap-end'), 'click', function () { S.end = !S.end; q('ap-end').setAttribute('aria-pressed', S.end ? 'true' : 'false'); render(); });
    on(q('ap-pair'), 'click', function () { if (V.n < 2) return; S.pair = !S.pair; render(); });
    /* ---- selecting a bar: tap / click (nearest bar) or the arrow keys when the chart has focus */
    on(svg, 'click', function (e) {
      var G = geom(st()), r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * G.W / r.width;
      var k = Math.max(1, Math.min(V.n, Math.floor((x - G.L) / G.slot) + 1));
      S.sel = k; render();
    });
    on(svg, 'keydown', function (e) {
      var k = S.sel, n = V.n;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') k = k ? Math.min(n, k + 1) : 1;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') k = k ? Math.max(1, k - 1) : n;
      else if (e.key === 'Home') k = 1; else if (e.key === 'End') k = n;
      else if (e.key === 'Escape') k = 0;
      else return;
      e.preventDefault(); S.sel = k; render();
    });
    if (window.ResizeObserver) { var lw = 0; new ResizeObserver(function () { var w = Math.round(svg.getBoundingClientRect().width); if (w && w !== lw) { lw = w; render(); } }).observe(q('ap-left')); }
    else on(window, 'resize', render);
    render();
  }

  /* ---------------------------------------------------- reactivity explorer (Science Ch 3, T04-V14)
     svg[data-rx] is the static first view (content/C10-SCI-CH03/diagrams, _src/d3_react.py); initRx replaces it.
     Every result, sentence and equation comes from _src/react_model.py (RX_DATA: the brief's tables, asserted there);
     the equations are KaTeX + mhchem pre-rendered at build time (chemTex). Starts on iron + copper(II) sulphate with
     "Predict first" on. Nothing is stored. Cell = [result 0 No / 1 Yes / 2 never tried, see, equation, note, why, after]. */
  /*RX-DATA*/var RX_DATA = {"m":[["K","potassium"],["Na","sodium"],["Ca","calcium"],["Mg","magnesium"],["Al","aluminium"],["Zn","zinc"],["Fe","iron"],["Pb","lead"],["Cu","copper"],["Hg","mercury"],["Ag","silver"],["Au","gold"]],"rg":[["air","heat in air","Oxygen","",""],["cold","cold water","Water","",""],["hot","hot water","Water","",""],["steam","steam","Water","",""],["hcl","dilute hydrochloric acid","Dilute acids","",""],["h2so4","dilute sulphuric acid","Dilute acids","",""],["hno3","dilute nitric acid","Dilute acids","",""],["mgso4","magnesium sulphate","Salt solutions","Mg","colourless"],["al2so4","aluminium sulphate","Salt solutions","Al","colourless"],["znso4","zinc sulphate","Salt solutions","Zn","colourless"],["feso4","iron(II) sulphate","Salt solutions","Fe","pale green"],["pbno3","lead nitrate","Salt solutions","Pb","colourless"],["cuso4","copper(II) sulphate","Salt solutions","Cu","blue"],["agno3","silver nitrate","Salt solutions","Ag","colourless"]],"s":["Catches fire and burns; this is why potassium is kept under kerosene.","The higher the metal, the more vigorously it reacts with oxygen; silver and gold do not react at all.","Reacts violently; the reaction is so exothermic that the hydrogen catches fire.","Higher metals react with colder water: K, Na, Ca — cold; Mg — hot; Al, Zn, Fe — steam; Pb and below — none.","Already reacts violently with cold water — never heated with water.","Dangerously violent.","Potassium is above hydrogen, so it pushes hydrogen out of the acid.","Violent; no equation is shown here.","Potassium is far above hydrogen, so the reaction is violent.","These metals react with the WATER in the solution first, giving hydrogen and their hydroxide — so they are never used to show displacement.","Potassium is above magnesium on the ladder, but it reacts with the water first, so it is never used to show displacement.","Potassium is above aluminium on the ladder, but it reacts with the water first, so it is never used to show displacement.","Potassium is above zinc on the ladder, but it reacts with the water first, so it is never used to show displacement.","Potassium is above iron on the ladder, but it reacts with the water first, so it is never used to show displacement.","Potassium is above lead on the ladder, but it reacts with the water first, so it is never used to show displacement.","Potassium is above copper on the ladder, but it reacts with the water first, so it is never used to show displacement.","Potassium is above silver on the ladder, but it reacts with the water first, so it is never used to show displacement.","Catches fire and burns; this is why sodium is kept under kerosene.","Sodium is above hydrogen, so it pushes hydrogen out of the acid.","Sodium is far above hydrogen, so the reaction is violent.","Sodium is above magnesium on the ladder, but it reacts with the water first, so it is never used to show displacement.","Sodium is above aluminium on the ladder, but it reacts with the water first, so it is never used to show displacement.","Sodium is above zinc on the ladder, but it reacts with the water first, so it is never used to show displacement.","Sodium is above iron on the ladder, but it reacts with the water first, so it is never used to show displacement.","Sodium is above lead on the ladder, but it reacts with the water first, so it is never used to show displacement.","Sodium is above copper on the ladder, but it reacts with the water first, so it is never used to show displacement.","Sodium is above silver on the ladder, but it reacts with the water first, so it is never used to show displacement.","Burns to form a white oxide.","Reacts less violently; calcium floats because hydrogen bubbles stick to it.","Faster than in cold water.","Already reacts with cold water — never tested with steam.","Very vigorous.","Calcium is above hydrogen, so it pushes hydrogen out of the acid.","Calcium is far above hydrogen, so the reaction is violent.","Calcium is above magnesium on the ladder, but it reacts with the water first, so it is never used to show displacement.","Calcium is above aluminium on the ladder, but it reacts with the water first, so it is never used to show displacement.","Calcium is above zinc on the ladder, but it reacts with the water first, so it is never used to show displacement.","Calcium is above iron on the ladder, but it reacts with the water first, so it is never used to show displacement.","Calcium is above lead on the ladder, but it reacts with the water first, so it is never used to show displacement.","Calcium is above copper on the ladder, but it reacts with the water first, so it is never used to show displacement.","Calcium is above silver on the ladder, but it reacts with the water first, so it is never used to show displacement.","Burns with a dazzling white flame, leaving white ash.","No visible reaction.","Slow bubbles; magnesium floats because hydrogen bubbles stick to it.","Burns brightly in steam, forming the oxide.","Fizzes fastest of the metals tested; the tube gets warm. The gas burns with a pop.","Magnesium is above hydrogen, so it pushes hydrogen out of the acid.","With VERY dilute nitric acid, magnesium gives hydrogen — one of only two metals that do (the other is manganese).","Magnesium is above hydrogen; with VERY dilute nitric acid it pushes hydrogen out.","A metal cannot displace itself — nothing changes.","No: a metal cannot displace itself.","Solution: colourless → colourless (stays colourless). Deposit: grey-white aluminium on the magnesium.","Predicted by the series, but in water magnesium also reacts slowly with the water itself, so little aluminium is seen; not a lab example.","Magnesium is above aluminium on the ladder, so it pushes aluminium out of its salt.","Solution: colourless → colourless (stays colourless). Deposit: grey zinc on the magnesium.","Magnesium is above zinc on the ladder, so it pushes zinc out of its salt.","Solution: pale green → colourless. Deposit: dark grey iron on the magnesium.","Magnesium is above iron on the ladder, so it pushes iron out of its salt.","Solution: colourless → colourless (stays colourless). Deposit: grey, spongy lead crystals on the magnesium.","Magnesium is above lead on the ladder, so it pushes lead out of its salt.","Solution: blue → colourless. Deposit: reddish-brown copper on the magnesium.","Magnesium is above copper on the ladder, so it pushes copper out of its salt.","Solution: colourless → colourless (stays colourless). Deposit: shiny grey silver crystals on the magnesium.","Magnesium is above silver on the ladder, so it pushes silver out of its salt.","Foil gets a thin protective oxide layer; powder sprinkled in a flame burns brightly.","No reaction — the oxide layer protects it.","Forms the oxide and hydrogen.","Slow to start (oxide layer), then steady bubbles.","Aluminium is above hydrogen, so it pushes hydrogen out of the acid.","Reacts, but NO hydrogen is given off: nitric acid is a strong oxidising agent that oxidises the hydrogen to water and is itself reduced to oxides of nitrogen. (The equations are beyond the syllabus.)","Nitric acid is a strong oxidising agent, so the hydrogen rule does not apply — no hydrogen is given off.","No change — no deposit, and the solution stays colourless.","Aluminium is below magnesium on the ladder, so it cannot push it out.","Solution: colourless → colourless (stays colourless). Deposit: grey zinc on the aluminium.","Slow at first — the oxide layer must be broken (rub with sandpaper).","Aluminium is above zinc on the ladder, so it pushes zinc out of its salt.","Solution: pale green → colourless. Deposit: dark grey iron on the aluminium.","Aluminium is above iron on the ladder, so it pushes iron out of its salt.","Solution: colourless → colourless (stays colourless). Deposit: grey, spongy lead crystals on the aluminium.","Aluminium is above lead on the ladder, so it pushes lead out of its salt.","Solution: blue → colourless. Deposit: reddish-brown copper on the aluminium.","Aluminium is above copper on the ladder, so it pushes copper out of its salt.","Solution: colourless → colourless (stays colourless). Deposit: shiny grey silver crystals on the aluminium.","Aluminium is above silver on the ladder, so it pushes silver out of its salt.","Burns when strongly heated; at room temperature a protective oxide layer forms.","No reaction.","Forms zinc oxide and hydrogen.","Steady bubbles of hydrogen.","Zinc is above hydrogen, so it pushes hydrogen out of the acid.","Zinc is below magnesium on the ladder, so it cannot push it out.","Zinc is below aluminium on the ladder, so it cannot push it out.","Solution: pale green → colourless. Deposit: dark grey iron on the zinc.","Zinc is above iron on the ladder, so it pushes iron out of its salt.","Solution: colourless → colourless (stays colourless). Deposit: grey, spongy lead crystals on the zinc.","Zinc is above lead on the ladder, so it pushes lead out of its salt.","Solution: blue → colourless. Deposit: reddish-brown copper on the zinc.","Zinc is above copper on the ladder, so it pushes copper out of its salt.","Solution: colourless → colourless (stays colourless). Deposit: shiny grey silver crystals on the zinc.","Zinc is above silver on the ladder, so it pushes silver out of its salt.","A lump does not burn, but iron filings sprinkled in a flame burn with sparks.","In moist air over a long time iron rusts — that is a different, slow reaction; see Topic 7.","Forms a black oxide and hydrogen.","Slow bubbles; the solution turns pale green.","Iron is above hydrogen, so it pushes hydrogen out of the acid.","Iron is below magnesium on the ladder, so it cannot push it out.","Iron is below aluminium on the ladder, so it cannot push it out.","Iron is below zinc on the ladder, so it cannot push it out.","Solution: colourless → pale green. Deposit: grey, spongy lead crystals on the iron.","Iron is above lead on the ladder, so it pushes lead out of its salt.","Solution: blue → pale green. Deposit: reddish-brown copper on the iron.","Iron is above copper on the ladder, so it pushes copper out of its salt.","Solution: colourless → pale green. Deposit: shiny grey silver crystals on the iron.","Iron is above silver on the ladder, so it pushes silver out of its salt.","Does not burn; on strong heating an oxide forms; at room temperature a protective oxide layer.","Does not react with water at all.","Very slow — hardly any bubbles; an insoluble coating soon stops it.","Lead is above hydrogen, so it pushes hydrogen out of the acid.","Lead is below magnesium on the ladder, so it cannot push it out.","Lead is below aluminium on the ladder, so it cannot push it out.","Lead is below zinc on the ladder, so it cannot push it out.","No change — no deposit, and the solution stays pale green.","Lead is below iron on the ladder, so it cannot push it out.","Solution: blue → colourless. Deposit: reddish-brown copper on the lead.","An insoluble white coat of lead sulphate soon covers the lead, so the reaction is slow and the blue fades only a little.","Lead is above copper on the ladder, so it pushes copper out of its salt.","Solution: colourless → colourless (stays colourless). Deposit: shiny grey silver crystals on the lead.","Lead is above silver on the ladder, so it pushes silver out of its salt.","Does not burn; the hot metal gets a black coating of copper(II) oxide.","No bubbles, no change.","Copper is below hydrogen, so it cannot push hydrogen out of the acid.","Copper is below magnesium on the ladder, so it cannot push it out.","Copper is below aluminium on the ladder, so it cannot push it out.","Copper is below zinc on the ladder, so it cannot push it out.","Copper is below iron on the ladder, so it cannot push it out.","Copper is below lead on the ladder, so it cannot push it out.","Solution: colourless → blue. Deposit: shiny grey silver crystals on the copper.","Copper is above silver on the ladder, so it pushes silver out of its salt.","Only very slowly, when heated for a long time; stronger heating breaks the red oxide down again. Mercury is poisonous and not used in school labs.","Mercury is below hydrogen, so it cannot push hydrogen out of the acid.","Mercury is below magnesium on the ladder, so it cannot push it out.","Mercury is below aluminium on the ladder, so it cannot push it out.","Mercury is below zinc on the ladder, so it cannot push it out.","Mercury is below iron on the ladder, so it cannot push it out.","Mercury is below lead on the ladder, so it cannot push it out.","No change — no deposit, and the solution stays blue.","Mercury is below copper on the ladder, so it cannot push it out.","Solution: colourless → colourless (stays colourless). Deposit: shiny grey silver crystals on the mercury.","Mercury is poisonous and is not used in school labs.","Mercury is above silver on the ladder, so it pushes silver out of its salt.","No reaction, even at high temperatures.","Silver is below hydrogen, so it cannot push hydrogen out of the acid.","Silver is below magnesium on the ladder, so it cannot push it out.","Silver is below aluminium on the ladder, so it cannot push it out.","Silver is below zinc on the ladder, so it cannot push it out.","Silver is below iron on the ladder, so it cannot push it out.","Silver is below lead on the ladder, so it cannot push it out.","Silver is below copper on the ladder, so it cannot push it out.","Gold is below hydrogen, so it cannot push hydrogen out of the acid.","Gold is the least reactive metal; dilute nitric acid does not attack it.","Gold is below magnesium on the ladder, so it cannot push it out.","Gold is below aluminium on the ladder, so it cannot push it out.","Gold is below zinc on the ladder, so it cannot push it out.","Gold is below iron on the ladder, so it cannot push it out.","Gold is below lead on the ladder, so it cannot push it out.","Gold is below copper on the ladder, so it cannot push it out.","Gold is below silver on the ladder, so it cannot push it out."],"c":[[[1,0,23,-1,1,""],[2,2,10,-1,3,""],[2,4,10,-1,3,""],[2,4,10,-1,3,""],[2,5,11,-1,6,""],[2,5,12,-1,6,""],[2,7,-1,-1,8,""],[2,9,-1,-1,10,""],[2,9,-1,-1,11,""],[2,9,-1,-1,12,""],[2,9,-1,-1,13,""],[2,9,-1,-1,14,""],[2,9,-1,-1,15,""],[2,9,-1,-1,16,""]],[[1,17,24,-1,1,""],[2,2,14,-1,3,""],[2,4,14,-1,3,""],[2,4,14,-1,3,""],[2,5,15,-1,18,""],[2,5,16,-1,18,""],[2,7,-1,-1,19,""],[2,9,-1,-1,20,""],[2,9,-1,-1,21,""],[2,9,-1,-1,22,""],[2,9,-1,-1,23,""],[2,9,-1,-1,24,""],[2,9,-1,-1,25,""],[2,9,-1,-1,26,""]],[[1,27,7,-1,1,""],[1,28,26,-1,3,""],[1,29,26,-1,3,""],[2,30,26,-1,3,""],[2,31,27,-1,32,""],[2,31,28,-1,32,""],[2,7,-1,-1,33,""],[2,9,-1,-1,34,""],[2,9,-1,-1,35,""],[2,9,-1,-1,36,""],[2,9,-1,-1,37,""],[2,9,-1,-1,38,""],[2,9,-1,-1,39,""],[2,9,-1,-1,40,""]],[[1,41,13,-1,1,""],[0,42,-1,-1,3,""],[1,43,37,-1,3,""],[1,44,42,-1,3,""],[1,45,38,-1,46,""],[1,45,43,-1,46,""],[1,47,39,-1,48,""],[0,49,-1,-1,50,""],[1,51,21,52,53,"colourless"],[1,54,45,-1,55,"colourless"],[1,56,41,-1,57,"colourless"],[1,58,44,-1,59,"colourless"],[1,60,40,-1,61,"colourless"],[1,62,36,-1,63,"colourless"]],[[1,64,22,-1,1,""],[0,65,-1,-1,3,""],[0,65,-1,-1,3,""],[1,66,2,-1,3,""],[1,67,6,-1,68,""],[1,67,3,-1,68,""],[1,69,-1,-1,70,""],[0,71,-1,-1,72,""],[0,49,-1,-1,50,""],[1,73,5,74,75,"colourless"],[1,76,1,74,77,"colourless"],[1,78,4,74,79,"colourless"],[1,80,0,74,81,"colourless"],[1,82,25,74,83,"colourless"]],[[1,84,18,-1,1,""],[0,85,-1,-1,3,""],[0,85,-1,-1,3,""],[1,86,54,-1,3,""],[1,87,51,-1,88,""],[1,87,55,-1,88,""],[1,69,-1,-1,70,""],[0,71,-1,-1,89,""],[0,71,-1,-1,90,""],[0,49,-1,-1,50,""],[1,91,53,-1,92,"colourless"],[1,93,56,-1,94,"colourless"],[1,95,52,-1,96,"colourless"],[1,97,50,-1,98,"colourless"]],[[1,99,19,-1,1,""],[0,85,-1,100,3,""],[0,85,-1,100,3,""],[1,101,20,-1,3,""],[1,102,31,-1,103,"pale green"],[1,102,33,-1,103,"pale green"],[1,69,-1,-1,70,""],[0,71,-1,-1,104,""],[0,71,-1,-1,105,""],[0,71,-1,-1,106,""],[0,49,-1,-1,50,""],[1,107,34,-1,108,"pale green"],[1,109,32,-1,110,"pale green"],[1,111,30,-1,112,"pale green"]],[[1,113,17,-1,1,""],[0,114,-1,-1,3,""],[0,114,-1,-1,3,""],[0,114,-1,-1,3,""],[1,115,47,-1,116,""],[1,115,49,-1,116,""],[1,69,-1,-1,70,""],[0,71,-1,-1,117,""],[0,71,-1,-1,118,""],[0,71,-1,-1,119,""],[0,120,-1,-1,121,""],[0,49,-1,-1,50,""],[1,122,48,123,124,"colourless"],[1,125,46,-1,126,"colourless"]],[[1,127,8,-1,1,""],[0,114,-1,-1,3,""],[0,114,-1,-1,3,""],[0,114,-1,-1,3,""],[0,128,-1,-1,129,""],[0,128,-1,-1,129,""],[1,69,-1,-1,70,""],[0,71,-1,-1,130,""],[0,71,-1,-1,131,""],[0,71,-1,-1,132,""],[0,120,-1,-1,133,""],[0,71,-1,-1,134,""],[0,49,-1,-1,50,""],[1,135,29,-1,136,"blue"]],[[1,137,9,-1,1,""],[0,114,-1,-1,3,""],[0,114,-1,-1,3,""],[0,114,-1,-1,3,""],[0,128,-1,-1,138,""],[0,128,-1,-1,138,""],[1,69,-1,-1,70,""],[0,71,-1,-1,139,""],[0,71,-1,-1,140,""],[0,71,-1,-1,141,""],[0,120,-1,-1,142,""],[0,71,-1,-1,143,""],[0,144,-1,-1,145,""],[1,146,35,147,148,"colourless"]],[[0,149,-1,-1,1,""],[0,114,-1,-1,3,""],[0,114,-1,-1,3,""],[0,114,-1,-1,3,""],[0,128,-1,-1,150,""],[0,128,-1,-1,150,""],[1,69,-1,-1,70,""],[0,71,-1,-1,151,""],[0,71,-1,-1,152,""],[0,71,-1,-1,153,""],[0,120,-1,-1,154,""],[0,71,-1,-1,155,""],[0,144,-1,-1,156,""],[0,49,-1,-1,50,""]],[[0,149,-1,-1,1,""],[0,114,-1,-1,3,""],[0,114,-1,-1,3,""],[0,114,-1,-1,3,""],[0,128,-1,-1,157,""],[0,128,-1,-1,157,""],[0,85,-1,-1,158,""],[0,71,-1,-1,159,""],[0,71,-1,-1,160,""],[0,71,-1,-1,161,""],[0,120,-1,-1,162,""],[0,71,-1,-1,163,""],[0,144,-1,-1,164,""],[0,71,-1,-1,165,""]]],"eqp":["2Al + 3CuSO₄ → Al₂(SO₄)₃ + 3Cu","2Al + 3FeSO₄ → Al₂(SO₄)₃ + 3Fe","2Al + 3H₂O → Al₂O₃ + 3H₂","2Al + 3H₂SO₄ → Al₂(SO₄)₃ + 3H₂","2Al + 3Pb(NO₃)₂ → 2Al(NO₃)₃ + 3Pb","2Al + 3ZnSO₄ → Al₂(SO₄)₃ + 3Zn","2Al + 6HCl → 2AlCl₃ + 3H₂","2Ca + O₂ → 2CaO","2Cu + O₂ → 2CuO","2Hg + O₂ → 2HgO","2K + 2H₂O → 2KOH + H₂","2K + 2HCl → 2KCl + H₂","2K + H₂SO₄ → K₂SO₄ + H₂","2Mg + O₂ → 2MgO","2Na + 2H₂O → 2NaOH + H₂","2Na + 2HCl → 2NaCl + H₂","2Na + H₂SO₄ → Na₂SO₄ + H₂","2Pb + O₂ → 2PbO","2Zn + O₂ → 2ZnO","3Fe + 2O₂ → Fe₃O₄","3Fe + 4H₂O → Fe₃O₄ + 4H₂","3Mg + Al₂(SO₄)₃ → 3MgSO₄ + 2Al","4Al + 3O₂ → 2Al₂O₃","4K + O₂ → 2K₂O","4Na + O₂ → 2Na₂O","Al + 3AgNO₃ → Al(NO₃)₃ + 3Ag","Ca + 2H₂O → Ca(OH)₂ + H₂","Ca + 2HCl → CaCl₂ + H₂","Ca + H₂SO₄ → CaSO₄ + H₂","Cu + 2AgNO₃ → Cu(NO₃)₂ + 2Ag","Fe + 2AgNO₃ → Fe(NO₃)₂ + 2Ag","Fe + 2HCl → FeCl₂ + H₂","Fe + CuSO₄ → FeSO₄ + Cu","Fe + H₂SO₄ → FeSO₄ + H₂","Fe + Pb(NO₃)₂ → Fe(NO₃)₂ + Pb","Hg + 2AgNO₃ → Hg(NO₃)₂ + 2Ag","Mg + 2AgNO₃ → Mg(NO₃)₂ + 2Ag","Mg + 2H₂O → Mg(OH)₂ + H₂","Mg + 2HCl → MgCl₂ + H₂","Mg + 2HNO₃ → Mg(NO₃)₂ + H₂","Mg + CuSO₄ → MgSO₄ + Cu","Mg + FeSO₄ → MgSO₄ + Fe","Mg + H₂O → MgO + H₂","Mg + H₂SO₄ → MgSO₄ + H₂","Mg + Pb(NO₃)₂ → Mg(NO₃)₂ + Pb","Mg + ZnSO₄ → MgSO₄ + Zn","Pb + 2AgNO₃ → Pb(NO₃)₂ + 2Ag","Pb + 2HCl → PbCl₂ + H₂","Pb + CuSO₄ → PbSO₄ + Cu","Pb + H₂SO₄ → PbSO₄ + H₂","Zn + 2AgNO₃ → Zn(NO₃)₂ + 2Ag","Zn + 2HCl → ZnCl₂ + H₂","Zn + CuSO₄ → ZnSO₄ + Cu","Zn + FeSO₄ → ZnSO₄ + Fe","Zn + H₂O → ZnO + H₂","Zn + H₂SO₄ → ZnSO₄ + H₂","Zn + Pb(NO₃)₂ → Zn(NO₃)₂ + Pb"]};/*END-RX-DATA*/
  var RX_SOL = { blue: '#3D8BD9', 'pale green': '#CDEBC5', colourless: '#EEF5F6' };
  var RX_MET = { Cu: '#C77B45', Au: '#E2B33C', Hg: '#D8DDE3', Ag: '#D5D9DD' };
  var RX_DEP = { Al: '#D7DBDF', Zn: '#9AA3AB', Fe: '#5E6469', Pb: '#7E848A', Cu: '#B5562B', Ag: '#C9CED3' };
  var RX_RES = ['No', 'Yes', 'Yes — but never tried in a school lab'];
  function initRx() {
    $$('svg[data-rx]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-rx-on')) return;
      art.setAttribute('data-rx-on', '1');
      rxBuild(art);
    });
  }
  function chipKeys(btns) {
    /* roving tabindex: arrow keys / Home / End move focus within one chip group; Enter or Space selects */
    btns.forEach(function (b, i) {
      on(b, 'keydown', function (e) {
        var n = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: btns.length - 1 }[e.key];
        if (n === undefined) return;
        e.preventDefault();
        n = (n + btns.length) % btns.length;
        btns.forEach(function (x, j) { x.tabIndex = j === n ? 0 : -1; });
        btns[n].focus();
      });
    });
  }
  function rxBuild(art) {
    var D = RX_DATA, uid = 'rx' + Math.random().toString(36).slice(2, 7);
    var S = { m: 6, r: 12, predict: true, guess: null };
    var groups = [], gi = {};
    D.rg.forEach(function (r, i) { if (!(r[2] in gi)) { gi[r[2]] = groups.length; groups.push([r[2], []]); } groups[gi[r[2]]][1].push(i); });
    var root = document.createElement('div');
    root.className = 'rx';
    root.innerHTML =
      '<div class="rx-ctl"><p class="rx-h" id="' + uid + '-mh">Choose a metal</p>' +
      '<div class="rx-ms" role="group" aria-labelledby="' + uid + '-mh">' + D.m.map(function (m, i) {
        return (m[0] === 'Cu' ? '<span class="rx-hm" title="hydrogen — not a metal; the dividing line"><b>[H]</b><span class="rx-mn">hydrogen</span><span class="rx-rel"></span></span>' : '') +
          '<button type="button" class="rx-m" data-i="' + i + '" aria-pressed="false" tabindex="-1" aria-label="' + m[1] + '"><b>' + m[0] + '</b>' +
          '<span class="rx-mn">' + m[1] + '</span><span class="rx-rel"></span></button>';
      }).join('') + '</div>' +
      '<p class="rx-h" id="' + uid + '-rh">Choose what to add</p><div class="rx-rs" role="group" aria-labelledby="' + uid + '-rh">' +
      groups.map(function (g) {
        return '<div class="rx-g"><span class="rx-gl">' + g[0] + '</span>' + g[1].map(function (i) {
          return '<button type="button" class="rx-r" data-i="' + i + '" aria-pressed="false" tabindex="-1">' + D.rg[i][1] + '</button>';
        }).join('') + '</div>';
      }).join('') + '</div>' +
      '<label class="rx-tog"><input type="checkbox" checked><span>Predict first</span></label></div>' +
      '<div class="rx-main"><div class="rx-pic"><svg class="rx-svg" viewBox="0 0 200 200" role="img" aria-labelledby="' + uid + '-pc"></svg>' +
      '<p class="rx-cap" id="' + uid + '-pc"></p><p class="rx-hg" hidden>⚠ mercury: poisonous — not used in school labs</p></div>' +
      '<div class="rx-read" aria-live="polite">' +
      '<div class="rx-ask"><p class="rx-q">Will it react?</p><div class="rx-yn"><button type="button" class="rx-y" data-v="1">Yes</button>' +
      '<button type="button" class="rx-y" data-v="0">No</button></div></div>' +
      '<div class="rx-res"><p class="rx-ban" hidden><span aria-hidden="true">⚠</span> Teacher demonstration only, or never done — far too dangerous</p>' +
      '<p class="rx-fb" hidden></p><dl class="rx-dl"><dt>Reaction?</dt><dd class="rx-v1"></dd><dt>What you would see</dt><dd class="rx-v2"></dd>' +
      '<dt class="rx-eqh">Equation</dt><dd class="rx-v3"></dd><dt>Why — use the ladder</dt><dd class="rx-v4"></dd></dl></div>' +
      '<button type="button" class="rx-again">Try another</button></div></div>';
    art.innerHTML = '';
    art.appendChild(root);
    var q = function (c) { return $('.' + c, root); };
    var mB = $$('.rx-m', root), rB = $$('.rx-r', root);
    chipKeys(mB); chipKeys(rB);
    function cell() { return D.c[S.m][S.r]; }
    function pic(c, show) {
      var rg = D.rg[S.r], grp = rg[2], id = rg[0], m = D.m[S.m][0], yes = show && c[0] >= 1;
      var ink = 'var(--ink, #1F2328)', mf = RX_MET[m] || '#A9AFB5', o = '', cap = '';
      function tube(liq, word) {
        var col = RX_SOL[word] || RX_SOL.colourless;
        return '<path d="M76,70 L76,152 A24,24 0 0 0 124,152 L124,70 Z" fill="' + col + '" stroke="' + (word === 'colourless' ? '#7E848A' : 'none') + '" stroke-dasharray="4 3"/>' +
          '<path d="M76,24 L76,152 A24,24 0 0 0 124,152 L124,24" fill="none" stroke="' + ink + '" stroke-width="2.2"/>';
      }
      function strip(y1, y2) {
        if (m === 'Hg') return '<ellipse cx="100" cy="166" rx="16" ry="7" fill="' + mf + '" stroke="' + ink + '" stroke-width="1.4"/>';
        return '<rect x="94" y="' + y1 + '" width="12" height="' + (y2 - y1) + '" rx="2" fill="' + mf + '" stroke="' + ink + '" stroke-width="1.4"/>';
      }
      function bubbles(n) {
        var s = '';
        for (var k = 0; k < n; k++) s += '<circle cx="' + (110 + (k % 2) * 6) + '" cy="' + (150 - k * 13) + '" r="' + (2.4 + (k % 3) * 0.6) + '" fill="none" stroke="' + ink + '" stroke-width="1.2"/>';
        return s;
      }
      if (grp === 'Salt solutions' || grp === 'Dilute acids') {
        var before = grp === 'Dilute acids' ? 'colourless' : rg[4], after = yes && c[5] ? c[5] : before;
        o += tube(true, after) + strip(30, 170);
        if (yes && grp === 'Salt solutions' && c[2] >= 0 && m !== 'Hg') o += '<rect x="92" y="76" width="16" height="86" rx="3" fill="' + RX_DEP[rg[3]] + '" stroke="' + ink + '" stroke-width="1.2" stroke-dasharray="3 2"/>';
        if (yes && grp === 'Salt solutions' && c[2] >= 0 && m === 'Hg') o += '<path d="M90,160 l4,-8 l4,8 l4,-10 l4,10 l4,-8" fill="none" stroke="' + RX_DEP.Ag + '" stroke-width="3"/>';
        if (yes && grp === 'Dilute acids') o += (id === 'hno3' && m !== 'Mg' && c[0] === 1) ?
          '<path d="M88,56 q6,-8 0,-16 t0,-16 M104,56 q6,-8 0,-16 t0,-16" fill="none" stroke="#9C5A2E" stroke-width="2"/>' : bubbles(6);
        cap = grp === 'Dilute acids' ? rg[1] + ' (colourless)' : 'solution: ' + (after !== before ? before + ' → ' + after : before);
      } else if (id === 'air') {
        o += '<path d="M100,108 C114,126 116,150 100,164 C84,150 86,126 100,108 Z" fill="var(--dg-flame, #F6A43C)" stroke="' + ink + '" stroke-width="1.4"/>' +
          '<rect x="88" y="164" width="24" height="30" fill="var(--dg-metal, #A9AFB5)" stroke="' + ink + '" stroke-width="1.4"/>' +
          '<path d="M20,84 L90,96" stroke="' + ink + '" stroke-width="3"/>' + '<rect x="88" y="88" width="34" height="12" rx="2" fill="' + mf + '" stroke="' + ink + '" stroke-width="1.4"/>';
        if (yes) o += '<path d="M128,80 l14,-10 M132,94 l18,0 M128,108 l14,10 M104,76 l0,-16 M118,78 l8,-14" stroke="var(--hint-line, #C9A400)" stroke-width="2.4"/>';
        cap = 'heated in air';
      } else if (id === 'steam') {
        o += '<path d="M30,70 L150,70 M30,104 L150,104 M30,70 A17,17 0 0 0 30,104" fill="none" stroke="' + ink + '" stroke-width="2.2"/>' +
          '<path d="M30,76 q8,4 0,8 q-8,4 0,8 q8,4 0,8" fill="none" stroke="var(--ink-soft, #57554D)" stroke-width="1.4"/>' +
          '<rect x="64" y="80" width="46" height="14" rx="3" fill="' + mf + '" stroke="' + ink + '" stroke-width="1.4"/>' +
          '<path d="M36,110 C46,124 46,140 36,150 C26,140 26,124 36,110 Z" fill="var(--dg-flame, #F6A43C)" stroke="' + ink + '" stroke-width="1.4"/>' +
          '<path d="M44,86 l14,0 M54,82 l4,4 l-4,4" fill="none" stroke="var(--acc, #0A6C74)" stroke-width="1.8"/>';
        if (yes) o += '<path d="M150,87 L178,87 M172,82 l6,5 l-6,5" fill="none" stroke="' + ink + '" stroke-width="2"/><text x="164" y="120" font-family="Lexend, sans-serif" font-size="14" text-anchor="middle" fill="' + ink + '">H₂</text>';
        cap = 'steam passed over the hot metal';
      } else {
        o += '<path d="M44,76 L44,176 Q44,184 52,184 L148,184 Q156,184 156,176 L156,76" fill="' + RX_SOL.colourless + '" stroke="none"/>' +
          '<path d="M44,76 L156,76" stroke="var(--acc, #0A6C74)" stroke-width="1.4"/>' +
          '<path d="M40,52 L44,58 L44,176 Q44,184 52,184 L148,184 Q156,184 156,176 L156,52" fill="none" stroke="' + ink + '" stroke-width="2.2"/>';
        var fl = yes && (m === 'Ca' || m === 'Mg');
        o += m === 'Hg' ? '<ellipse cx="100" cy="178" rx="16" ry="5" fill="' + mf + '" stroke="' + ink + '" stroke-width="1.4"/>' :
          '<rect x="86" y="' + (fl ? 78 : 166) + '" width="28" height="14" rx="3" fill="' + mf + '" stroke="' + ink + '" stroke-width="1.4"/>';
        if (yes) o += bubbles(5).replace(/cx="(\d+)"/g, function (a, x) { return 'cx="' + (+x - 4) + '"'; });
        if (id === 'hot') o += '<path d="M70,44 q6,-8 0,-16 t0,-16 M100,44 q6,-8 0,-16 t0,-16 M130,44 q6,-8 0,-16 t0,-16" fill="none" stroke="var(--ink-soft, #57554D)" stroke-width="1.6"/>';
        cap = rg[1];
      }
      if (show && c[0] === 2) o += '<path d="M168,14 L192,56 L144,56 Z" fill="var(--hint-bg, #FFF7D6)" stroke="var(--wrong, #8A2B0E)" stroke-width="2.4"/><text x="168" y="51" font-family="Lexend, sans-serif" font-size="22" font-weight="600" text-anchor="middle" fill="var(--wrong, #8A2B0E)">!</text>';
      return [o, D.m[S.m][1] + ' + ' + rg[1] + ' — ' + cap];
    }
    function draw() {
      var c = cell(), rg = D.rg[S.r], m = D.m[S.m][0], show = !S.predict || S.guess !== null;
      var acid = rg[2] === 'Dilute acids', cu = 8;
      mB.forEach(function (b, i) {
        b.setAttribute('aria-pressed', i === S.m ? 'true' : 'false');
        b.classList.toggle('rx-cmp', rg[3] === D.m[i][0]);
        $('.rx-rel', b).textContent = '';
      });
      rB.forEach(function (b, i) { b.setAttribute('aria-pressed', i === S.r ? 'true' : 'false'); });
      if (!root.contains(document.activeElement) || !/rx-[mr]\b/.test(document.activeElement.className)) {
        mB.forEach(function (b, i) { b.tabIndex = i === S.m ? 0 : -1; });
        rB.forEach(function (b, i) { b.tabIndex = i === S.r ? 0 : -1; });
      }
      q('rx-hm').classList.toggle('rx-cmp', acid);
      var rel = '', si = -1;
      D.m.forEach(function (x, i) { if (x[0] === rg[3]) si = i; });
      if (si >= 0) rel = si === S.m ? 'same metal' : (S.m < si ? '▲ above ' : '▼ below ') + rg[3];
      else if (acid) rel = (S.m < cu ? '▲ above ' : '▼ below ') + 'H';
      $('.rx-rel', mB[S.m]).textContent = rel;
      q('rx-ask').hidden = show;
      q('rx-res').hidden = !show;
      q('rx-hg').hidden = m !== 'Hg';
      var p = pic(c, show);
      q('rx-svg').innerHTML = p[0];
      q('rx-cap').textContent = p[1].split(' — ')[1];
      $('.rx-svg', root).setAttribute('aria-label', p[1]);
      if (!show) return;
      q('rx-v1').textContent = RX_RES[c[0]];
      q('rx-v1').className = 'rx-v1 rx-k' + c[0];
      q('rx-v2').innerHTML = '';
      q('rx-v2').appendChild(document.createTextNode(D.s[c[1]]));
      if (c[3] >= 0) { var n = document.createElement('span'); n.className = 'rx-note'; n.textContent = D.s[c[3]]; q('rx-v2').appendChild(n); }
      var hasEq = c[2] >= 0;
      q('rx-eqh').hidden = !hasEq; q('rx-v3').hidden = !hasEq;
      q('rx-v3').innerHTML = hasEq ? '<span class="rx-eq" aria-hidden="true" data-tex="' + c[2] + '">' + chemTex(c[2]) + '</span><span class="sr">' + D.eqp[c[2]] + '</span>' : '';
      q('rx-v4').textContent = D.s[c[4]];
      q('rx-ban').hidden = c[0] !== 2;
      var fb = q('rx-fb');
      fb.hidden = !(S.predict && S.guess !== null);
      if (!fb.hidden) {
        var right = (S.guess === 1) === (c[0] >= 1);
        fb.className = 'rx-fb ' + (right ? 'rx-ok' : 'rx-no');
        fb.textContent = (right ? 'Your prediction was right — ' : 'Not this time — ') + 'the answer is ' + (c[0] ? 'Yes' : 'No') + '.';
      }
    }
    mB.forEach(function (b, i) { on(b, 'click', function () { S.m = i; S.guess = null; draw(); }); });
    rB.forEach(function (b, i) { on(b, 'click', function () { S.r = i; S.guess = null; draw(); }); });
    $$('.rx-y', root).forEach(function (b) { on(b, 'click', function () { S.guess = +b.getAttribute('data-v'); draw(); }); });
    on($('.rx-tog input', root), 'change', function (e) { S.predict = e.target.checked; S.guess = null; draw(); });
    on(q('rx-again'), 'click', function () {
      var m = S.m, r = S.r;
      while (m === S.m && r === S.r) { m = Math.floor(Math.random() * D.m.length); r = Math.floor(Math.random() * D.rg.length); }
      S.m = m; S.r = r; S.guess = null; draw();
    });
    root._rx = { set: function (m, r) { S.m = m; S.r = r; S.guess = null; draw(); }, state: S, tex: function (i) { return CHEM_TEX.k[i]; } };
    draw();
  }

  /* ---------------------------------------------------- name-it explorer (Science Ch 4, T05-V13)
     svg[data-ni] is the static first view (content/C10-SCI-CH04/diagrams, _src/d4_struct.py v13); initNi replaces it.
     NI_DATA = the brief's 58 rows (_src/name_model.py): each with its structure (atoms on a grid + bonds, laid out by the
     drawing rules and checked there: four lines at every C), names, formulae (KaTeX + mhchem via chemTex), "Why this
     name?" lines, isomer line and the four "Name it yourself" options. Starts on 3 carbons, alkane. Nothing is stored. */
  /*NI-DATA*/var NI_DATA = {"rows":[{"id":"N1","f":0,"n":1,"p":0,"tb":"methane","iu":"methane","mfs":"\\ce{CH4}","cfs":"\\ce{CH4}","a":[["C",0,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,0]],"b":[[0,1,1],[0,2,1],[0,3,1],[0,4,1]],"why":["Count: 1 carbon → meth-","Group: only single bonds → -ane","Join: meth + ane = methane"],"iso":"","op":["methane","ethane","propane","butane"],"alt":"CH4"},{"id":"N2","f":0,"n":2,"p":0,"tb":"ethane","iu":"ethane","mfs":"\\ce{C2H6}","cfs":"\\ce{CH3-CH3}","a":[["C",0,0],["C",2,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,0]],"b":[[0,1,1],[0,2,1],[0,3,1],[0,4,1],[1,5,1],[1,6,1],[1,7,1]],"why":["Count: 2 carbons → eth-","Group: only single bonds → -ane","Join: eth + ane = ethane"],"iso":"","op":["ethane","ethene","methane","propane"],"alt":"CH3-CH3"},{"id":"N3","f":0,"n":3,"p":0,"tb":"propane","iu":"propane","mfs":"\\ce{C3H8}","cfs":"\\ce{CH3-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["H",6,0]],"b":[[0,1,1],[1,2,1],[0,3,1],[0,4,1],[0,5,1],[1,6,1],[1,7,1],[2,8,1],[2,9,1],[2,10,1]],"why":["Count: 3 carbons → prop-","Group: only single bonds → -ane","Join: prop + ane = propane"],"iso":"","op":["propane","propyne","ethane","butane"],"alt":"CH3-CH2-CH3"},{"id":"N4","f":0,"n":4,"p":0,"tb":"butane","iu":"butane","mfs":"\\ce{C4H10}","cfs":"\\ce{CH3-CH2-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[0,4,1],[0,5,1],[0,6,1],[1,7,1],[1,8,1],[2,9,1],[2,10,1],[3,11,1],[3,12,1],[3,13,1]],"why":["Count: 4 carbons → but-","Group: only single bonds → -ane","Join: but + ane = butane"],"iso":"","op":["butane","butene","propane","pentane"],"alt":"CH3-CH2-CH2-CH3"},{"id":"N5","f":0,"n":5,"p":0,"tb":"pentane","iu":"pentane","mfs":"\\ce{C5H12}","cfs":"\\ce{CH3-CH2-CH2-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[1,9,1],[2,10,1],[2,11,1],[3,12,1],[3,13,1],[4,14,1],[4,15,1],[4,16,1]],"why":["Count: 5 carbons → pent-","Group: only single bonds → -ane","Join: pent + ane = pentane"],"iso":"","op":["pentane","pentyne","butane","hexane"],"alt":"CH3-CH2-CH2-CH2-CH3"},{"id":"N6","f":1,"n":2,"p":1,"tb":"ethene","iu":"ethene","mfs":"\\ce{C2H4}","cfs":"\\ce{CH2=CH2}","a":[["C",0,0],["C",2,0],["H",0,-2],["H",0,2],["H",2,-2],["H",2,2]],"b":[[0,1,2],[0,2,1],[0,3,1],[1,4,1],[1,5,1]],"why":["Count: 2 carbons → eth-","Group: C=C → -ene","Join: ethane → ethene"],"iso":"","op":["ethene","ethane","propene","butene"],"alt":"CH2=CH2"},{"id":"N7","f":1,"n":3,"p":1,"tb":"propene","iu":"propene","mfs":"\\ce{C3H6}","cfs":"\\ce{CH2=CH-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["H",0,-2],["H",0,2],["H",2,-2],["H",4,-2],["H",4,2],["H",6,0]],"b":[[0,1,2],[1,2,1],[0,3,1],[0,4,1],[1,5,1],[2,6,1],[2,7,1],[2,8,1]],"why":["Count: 3 carbons → prop-","Group: C=C → -ene","Join: propane → propene"],"iso":"","op":["propene","propyne","ethene","butene"],"alt":"CH2=CH-CH3"},{"id":"N8","f":1,"n":4,"p":1,"tb":"butene","iu":"but-1-ene","mfs":"\\ce{C4H8}","cfs":"\\ce{CH2=CH-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",2,-2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,0]],"b":[[0,1,2],[1,2,1],[2,3,1],[0,4,1],[0,5,1],[1,6,1],[2,7,1],[2,8,1],[3,9,1],[3,10,1],[3,11,1]],"why":["Count: 4 carbons → but-","Group: C=C → -ene","Join: butane → butene"],"iso":"Moving the group gives isomer(s): but-2-ene. Your textbook calls them all butene.","op":["butene","butane","propene","pentene"],"alt":"CH2=CH-CH2-CH3"},{"id":"N9","f":1,"n":4,"p":2,"tb":"butene","iu":"but-2-ene","mfs":"\\ce{C4H8}","cfs":"\\ce{CH3-CH=CH-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",4,-2],["H",6,-2],["H",6,2],["H",8,0]],"b":[[0,1,1],[1,2,2],[2,3,1],[0,4,1],[0,5,1],[0,6,1],[1,7,1],[2,8,1],[3,9,1],[3,10,1],[3,11,1]],"why":["Count: 4 carbons → but-","Group: C=C → -ene","Join: butane → butene"],"iso":"Moving the group gives isomer(s): but-1-ene. Your textbook calls them all butene.","op":["butene","butyne","propene","pentene"],"alt":"CH3-CH=CH-CH3"},{"id":"N10","f":1,"n":5,"p":1,"tb":"pentene","iu":"pent-1-ene","mfs":"\\ce{C5H10}","cfs":"\\ce{CH2=CH-CH2-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",2,-2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,2],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[1,7,1],[2,8,1],[2,9,1],[3,10,1],[3,11,1],[4,12,1],[4,13,1],[4,14,1]],"why":["Count: 5 carbons → pent-","Group: C=C → -ene","Join: pentane → pentene"],"iso":"Moving the group gives isomer(s): pent-2-ene. Your textbook calls them all pentene.","op":["pentene","pentane","butene","hexene"],"alt":"CH2=CH-CH2-CH2-CH3"},{"id":"N11","f":1,"n":5,"p":2,"tb":"pentene","iu":"pent-2-ene","mfs":"\\ce{C5H10}","cfs":"\\ce{CH3-CH=CH-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",4,-2],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,1],[1,2,2],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[2,9,1],[3,10,1],[3,11,1],[4,12,1],[4,13,1],[4,14,1]],"why":["Count: 5 carbons → pent-","Group: C=C → -ene","Join: pentane → pentene"],"iso":"Moving the group gives isomer(s): pent-1-ene. Your textbook calls them all pentene.","op":["pentene","pentyne","butene","hexene"],"alt":"CH3-CH=CH-CH2-CH3"},{"id":"N12","f":2,"n":2,"p":1,"tb":"ethyne","iu":"ethyne","mfs":"\\ce{C2H2}","cfs":"\\ce{HC#CH}","a":[["C",0,0],["C",2,0],["H",-2,0],["H",4,0]],"b":[[0,1,3],[0,2,1],[1,3,1]],"why":["Count: 2 carbons → eth-","Group: C≡C → -yne","Join: ethane → ethyne"],"iso":"","op":["ethyne","ethane","propyne","butyne"],"alt":"HC≡CH"},{"id":"N13","f":2,"n":3,"p":1,"tb":"propyne","iu":"propyne","mfs":"\\ce{C3H4}","cfs":"\\ce{HC#C-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["H",-2,0],["H",4,-2],["H",4,2],["H",6,0]],"b":[[0,1,3],[1,2,1],[0,3,1],[2,4,1],[2,5,1],[2,6,1]],"why":["Count: 3 carbons → prop-","Group: C≡C → -yne","Join: propane → propyne"],"iso":"","op":["propyne","propene","ethyne","butyne"],"alt":"HC≡C-CH3"},{"id":"N14","f":2,"n":4,"p":1,"tb":"butyne","iu":"but-1-yne","mfs":"\\ce{C4H6}","cfs":"\\ce{HC#C-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",-2,0],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,0]],"b":[[0,1,3],[1,2,1],[2,3,1],[0,4,1],[2,5,1],[2,6,1],[3,7,1],[3,8,1],[3,9,1]],"why":["Count: 4 carbons → but-","Group: C≡C → -yne","Join: butane → butyne"],"iso":"Moving the group gives isomer(s): but-2-yne. Your textbook calls them all butyne.","op":["butyne","butane","propyne","pentyne"],"alt":"HC≡C-CH2-CH3"},{"id":"N15","f":2,"n":4,"p":2,"tb":"butyne","iu":"but-2-yne","mfs":"\\ce{C4H6}","cfs":"\\ce{CH3-C#C-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",-2,0],["H",6,-2],["H",6,2],["H",8,0]],"b":[[0,1,1],[1,2,3],[2,3,1],[0,4,1],[0,5,1],[0,6,1],[3,7,1],[3,8,1],[3,9,1]],"why":["Count: 4 carbons → but-","Group: C≡C → -yne","Join: butane → butyne"],"iso":"Moving the group gives isomer(s): but-1-yne. Your textbook calls them all butyne.","op":["butyne","butene","propyne","pentyne"],"alt":"CH3-C≡C-CH3"},{"id":"N16","f":2,"n":5,"p":1,"tb":"pentyne","iu":"pent-1-yne","mfs":"\\ce{C5H8}","cfs":"\\ce{HC#C-CH2-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",-2,0],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,3],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[2,6,1],[2,7,1],[3,8,1],[3,9,1],[4,10,1],[4,11,1],[4,12,1]],"why":["Count: 5 carbons → pent-","Group: C≡C → -yne","Join: pentane → pentyne"],"iso":"Moving the group gives isomer(s): pent-2-yne. Your textbook calls them all pentyne.","op":["pentyne","pentane","butyne","hexyne"],"alt":"HC≡C-CH2-CH2-CH3"},{"id":"N17","f":2,"n":5,"p":2,"tb":"pentyne","iu":"pent-2-yne","mfs":"\\ce{C5H8}","cfs":"\\ce{CH3-C#C-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,1],[1,2,3],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[3,8,1],[3,9,1],[4,10,1],[4,11,1],[4,12,1]],"why":["Count: 5 carbons → pent-","Group: C≡C → -yne","Join: pentane → pentyne"],"iso":"Moving the group gives isomer(s): pent-1-yne. Your textbook calls them all pentyne.","op":["pentyne","pentene","butyne","hexyne"],"alt":"CH3-C≡C-CH2-CH3"},{"id":"N18","f":3,"n":1,"p":1,"tb":"chloromethane","iu":"chloromethane","mfs":"\\ce{CH3Cl}","cfs":"\\ce{CH3-Cl}","a":[["C",0,0],["Cl",2,0],["H",0,-2],["H",0,2],["H",-2,0]],"b":[[0,1,1],[0,2,1],[0,3,1],[0,4,1]],"why":["Count: 1 carbon → meth-","Group: –Cl → prefix chloro-","Join: chloro + methane = chloromethane"],"iso":"","op":["chloromethane","bromomethane","chloroethane","methane"],"alt":"CH3-Cl"},{"id":"N19","f":3,"n":2,"p":1,"tb":"chloroethane","iu":"chloroethane","mfs":"\\ce{C2H5Cl}","cfs":"\\ce{CH3-CH2-Cl}","a":[["C",0,0],["C",2,0],["H",0,-2],["H",0,2],["H",-2,0],["Cl",4,0],["H",2,-2],["H",2,2]],"b":[[0,1,1],[0,2,1],[0,3,1],[0,4,1],[1,5,1],[1,6,1],[1,7,1]],"why":["Count: 2 carbons → eth-","Group: –Cl → prefix chloro-","Join: chloro + ethane = chloroethane"],"iso":"","op":["chloroethane","bromoethane","chloromethane","chloropropane"],"alt":"CH3-CH2-Cl"},{"id":"N20","f":3,"n":3,"p":1,"tb":"chloropropane","iu":"1-chloropropane","mfs":"\\ce{C3H7Cl}","cfs":"\\ce{CH3-CH2-CH2-Cl}","a":[["C",0,0],["C",2,0],["C",4,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["Cl",6,0],["H",4,-2],["H",4,2]],"b":[[0,1,1],[1,2,1],[0,3,1],[0,4,1],[0,5,1],[1,6,1],[1,7,1],[2,8,1],[2,9,1],[2,10,1]],"why":["Count: 3 carbons → prop-","Group: –Cl → prefix chloro-","Join: chloro + propane = chloropropane"],"iso":"Moving the group gives isomer(s): 2-chloropropane. Your textbook calls them all chloropropane.","op":["chloropropane","bromopropane","chloroethane","chlorobutane"],"alt":"CH3-CH2-CH2-Cl"},{"id":"N21","f":3,"n":3,"p":2,"tb":"chloropropane","iu":"2-chloropropane","mfs":"\\ce{C3H7Cl}","cfs":"\\ce{CH3-CH(Cl)-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["H",0,-2],["H",0,2],["H",-2,0],["Cl",2,2],["H",2,-2],["H",4,-2],["H",4,2],["H",6,0]],"b":[[0,1,1],[1,2,1],[0,3,1],[0,4,1],[0,5,1],[1,6,1],[1,7,1],[2,8,1],[2,9,1],[2,10,1]],"why":["Count: 3 carbons → prop-","Group: –Cl → prefix chloro-","Join: chloro + propane = chloropropane"],"iso":"Moving the group gives isomer(s): 1-chloropropane. Your textbook calls them all chloropropane.","op":["chloropropane","bromopropane","chloroethane","chlorobutane"],"alt":"CH3-CH(Cl)-CH3"},{"id":"N22","f":3,"n":4,"p":1,"tb":"chlorobutane","iu":"1-chlorobutane","mfs":"\\ce{C4H9Cl}","cfs":"\\ce{CH3-CH2-CH2-CH2-Cl}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["Cl",8,0],["H",6,-2],["H",6,2]],"b":[[0,1,1],[1,2,1],[2,3,1],[0,4,1],[0,5,1],[0,6,1],[1,7,1],[1,8,1],[2,9,1],[2,10,1],[3,11,1],[3,12,1],[3,13,1]],"why":["Count: 4 carbons → but-","Group: –Cl → prefix chloro-","Join: chloro + butane = chlorobutane"],"iso":"Moving the group gives isomer(s): 2-chlorobutane. Your textbook calls them all chlorobutane.","op":["chlorobutane","bromobutane","chloropropane","chloropentane"],"alt":"CH3-CH2-CH2-CH2-Cl"},{"id":"N23","f":3,"n":4,"p":2,"tb":"chlorobutane","iu":"2-chlorobutane","mfs":"\\ce{C4H9Cl}","cfs":"\\ce{CH3-CH(Cl)-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",-2,0],["Cl",2,2],["H",2,-2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[0,4,1],[0,5,1],[0,6,1],[1,7,1],[1,8,1],[2,9,1],[2,10,1],[3,11,1],[3,12,1],[3,13,1]],"why":["Count: 4 carbons → but-","Group: –Cl → prefix chloro-","Join: chloro + butane = chlorobutane"],"iso":"Moving the group gives isomer(s): 1-chlorobutane. Your textbook calls them all chlorobutane.","op":["chlorobutane","bromobutane","chloropropane","chloropentane"],"alt":"CH3-CH(Cl)-CH2-CH3"},{"id":"N24","f":3,"n":5,"p":1,"tb":"chloropentane","iu":"1-chloropentane","mfs":"\\ce{C5H11Cl}","cfs":"\\ce{CH3-CH2-CH2-CH2-CH2-Cl}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["Cl",10,0],["H",8,-2],["H",8,2]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[1,9,1],[2,10,1],[2,11,1],[3,12,1],[3,13,1],[4,14,1],[4,15,1],[4,16,1]],"why":["Count: 5 carbons → pent-","Group: –Cl → prefix chloro-","Join: chloro + pentane = chloropentane"],"iso":"Moving the group gives isomer(s): 2-chloropentane, 3-chloropentane. Your textbook calls them all chloropentane.","op":["chloropentane","bromopentane","chlorobutane","chlorohexane"],"alt":"CH3-CH2-CH2-CH2-CH2-Cl"},{"id":"N25","f":3,"n":5,"p":2,"tb":"chloropentane","iu":"2-chloropentane","mfs":"\\ce{C5H11Cl}","cfs":"\\ce{CH3-CH(Cl)-CH2-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["Cl",2,2],["H",2,-2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[1,9,1],[2,10,1],[2,11,1],[3,12,1],[3,13,1],[4,14,1],[4,15,1],[4,16,1]],"why":["Count: 5 carbons → pent-","Group: –Cl → prefix chloro-","Join: chloro + pentane = chloropentane"],"iso":"Moving the group gives isomer(s): 1-chloropentane, 3-chloropentane. Your textbook calls them all chloropentane.","op":["chloropentane","bromopentane","chlorobutane","chlorohexane"],"alt":"CH3-CH(Cl)-CH2-CH2-CH3"},{"id":"N26","f":3,"n":5,"p":3,"tb":"chloropentane","iu":"3-chloropentane","mfs":"\\ce{C5H11Cl}","cfs":"\\ce{CH3-CH2-CH(Cl)-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["Cl",4,2],["H",4,-2],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[1,9,1],[2,10,1],[2,11,1],[3,12,1],[3,13,1],[4,14,1],[4,15,1],[4,16,1]],"why":["Count: 5 carbons → pent-","Group: –Cl → prefix chloro-","Join: chloro + pentane = chloropentane"],"iso":"Moving the group gives isomer(s): 1-chloropentane, 2-chloropentane. Your textbook calls them all chloropentane.","op":["chloropentane","bromopentane","chlorobutane","chlorohexane"],"alt":"CH3-CH2-CH(Cl)-CH2-CH3"},{"id":"N27","f":4,"n":1,"p":1,"tb":"bromomethane","iu":"bromomethane","mfs":"\\ce{CH3Br}","cfs":"\\ce{CH3-Br}","a":[["C",0,0],["Br",2,0],["H",0,-2],["H",0,2],["H",-2,0]],"b":[[0,1,1],[0,2,1],[0,3,1],[0,4,1]],"why":["Count: 1 carbon → meth-","Group: –Br → prefix bromo-","Join: bromo + methane = bromomethane"],"iso":"","op":["bromomethane","chloromethane","bromoethane","methane"],"alt":"CH3-Br"},{"id":"N28","f":4,"n":2,"p":1,"tb":"bromoethane","iu":"bromoethane","mfs":"\\ce{C2H5Br}","cfs":"\\ce{CH3-CH2-Br}","a":[["C",0,0],["C",2,0],["H",0,-2],["H",0,2],["H",-2,0],["Br",4,0],["H",2,-2],["H",2,2]],"b":[[0,1,1],[0,2,1],[0,3,1],[0,4,1],[1,5,1],[1,6,1],[1,7,1]],"why":["Count: 2 carbons → eth-","Group: –Br → prefix bromo-","Join: bromo + ethane = bromoethane"],"iso":"","op":["bromoethane","chloroethane","bromomethane","bromopropane"],"alt":"CH3-CH2-Br"},{"id":"N29","f":4,"n":3,"p":1,"tb":"bromopropane","iu":"1-bromopropane","mfs":"\\ce{C3H7Br}","cfs":"\\ce{CH3-CH2-CH2-Br}","a":[["C",0,0],["C",2,0],["C",4,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["Br",6,0],["H",4,-2],["H",4,2]],"b":[[0,1,1],[1,2,1],[0,3,1],[0,4,1],[0,5,1],[1,6,1],[1,7,1],[2,8,1],[2,9,1],[2,10,1]],"why":["Count: 3 carbons → prop-","Group: –Br → prefix bromo-","Join: bromo + propane = bromopropane"],"iso":"Moving the group gives isomer(s): 2-bromopropane. Your textbook calls them all bromopropane.","op":["bromopropane","chloropropane","bromoethane","bromobutane"],"alt":"CH3-CH2-CH2-Br"},{"id":"N30","f":4,"n":3,"p":2,"tb":"bromopropane","iu":"2-bromopropane","mfs":"\\ce{C3H7Br}","cfs":"\\ce{CH3-CH(Br)-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["H",0,-2],["H",0,2],["H",-2,0],["Br",2,2],["H",2,-2],["H",4,-2],["H",4,2],["H",6,0]],"b":[[0,1,1],[1,2,1],[0,3,1],[0,4,1],[0,5,1],[1,6,1],[1,7,1],[2,8,1],[2,9,1],[2,10,1]],"why":["Count: 3 carbons → prop-","Group: –Br → prefix bromo-","Join: bromo + propane = bromopropane"],"iso":"Moving the group gives isomer(s): 1-bromopropane. Your textbook calls them all bromopropane.","op":["bromopropane","chloropropane","bromoethane","bromobutane"],"alt":"CH3-CH(Br)-CH3"},{"id":"N31","f":4,"n":4,"p":1,"tb":"bromobutane","iu":"1-bromobutane","mfs":"\\ce{C4H9Br}","cfs":"\\ce{CH3-CH2-CH2-CH2-Br}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["Br",8,0],["H",6,-2],["H",6,2]],"b":[[0,1,1],[1,2,1],[2,3,1],[0,4,1],[0,5,1],[0,6,1],[1,7,1],[1,8,1],[2,9,1],[2,10,1],[3,11,1],[3,12,1],[3,13,1]],"why":["Count: 4 carbons → but-","Group: –Br → prefix bromo-","Join: bromo + butane = bromobutane"],"iso":"Moving the group gives isomer(s): 2-bromobutane. Your textbook calls them all bromobutane.","op":["bromobutane","chlorobutane","bromopropane","bromopentane"],"alt":"CH3-CH2-CH2-CH2-Br"},{"id":"N32","f":4,"n":4,"p":2,"tb":"bromobutane","iu":"2-bromobutane","mfs":"\\ce{C4H9Br}","cfs":"\\ce{CH3-CH(Br)-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",-2,0],["Br",2,2],["H",2,-2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[0,4,1],[0,5,1],[0,6,1],[1,7,1],[1,8,1],[2,9,1],[2,10,1],[3,11,1],[3,12,1],[3,13,1]],"why":["Count: 4 carbons → but-","Group: –Br → prefix bromo-","Join: bromo + butane = bromobutane"],"iso":"Moving the group gives isomer(s): 1-bromobutane. Your textbook calls them all bromobutane.","op":["bromobutane","chlorobutane","bromopropane","bromopentane"],"alt":"CH3-CH(Br)-CH2-CH3"},{"id":"N33","f":4,"n":5,"p":1,"tb":"bromopentane","iu":"1-bromopentane","mfs":"\\ce{C5H11Br}","cfs":"\\ce{CH3-CH2-CH2-CH2-CH2-Br}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["Br",10,0],["H",8,-2],["H",8,2]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[1,9,1],[2,10,1],[2,11,1],[3,12,1],[3,13,1],[4,14,1],[4,15,1],[4,16,1]],"why":["Count: 5 carbons → pent-","Group: –Br → prefix bromo-","Join: bromo + pentane = bromopentane"],"iso":"Moving the group gives isomer(s): 2-bromopentane, 3-bromopentane. Your textbook calls them all bromopentane.","op":["bromopentane","chloropentane","bromobutane","bromohexane"],"alt":"CH3-CH2-CH2-CH2-CH2-Br"},{"id":"N34","f":4,"n":5,"p":2,"tb":"bromopentane","iu":"2-bromopentane","mfs":"\\ce{C5H11Br}","cfs":"\\ce{CH3-CH(Br)-CH2-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["Br",2,2],["H",2,-2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[1,9,1],[2,10,1],[2,11,1],[3,12,1],[3,13,1],[4,14,1],[4,15,1],[4,16,1]],"why":["Count: 5 carbons → pent-","Group: –Br → prefix bromo-","Join: bromo + pentane = bromopentane"],"iso":"Moving the group gives isomer(s): 1-bromopentane, 3-bromopentane. Your textbook calls them all bromopentane.","op":["bromopentane","chloropentane","bromobutane","bromohexane"],"alt":"CH3-CH(Br)-CH2-CH2-CH3"},{"id":"N35","f":4,"n":5,"p":3,"tb":"bromopentane","iu":"3-bromopentane","mfs":"\\ce{C5H11Br}","cfs":"\\ce{CH3-CH2-CH(Br)-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["Br",4,2],["H",4,-2],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[1,9,1],[2,10,1],[2,11,1],[3,12,1],[3,13,1],[4,14,1],[4,15,1],[4,16,1]],"why":["Count: 5 carbons → pent-","Group: –Br → prefix bromo-","Join: bromo + pentane = bromopentane"],"iso":"Moving the group gives isomer(s): 1-bromopentane, 2-bromopentane. Your textbook calls them all bromopentane.","op":["bromopentane","chloropentane","bromobutane","bromohexane"],"alt":"CH3-CH2-CH(Br)-CH2-CH3"},{"id":"N36","f":5,"n":1,"p":1,"tb":"methanol","iu":"methanol","mfs":"\\ce{CH4O}","cfs":"\\ce{CH3-OH}","a":[["C",0,0],["O",2,0],["H",4,0],["H",0,-2],["H",0,2],["H",-2,0]],"b":[[0,1,1],[1,2,1],[0,3,1],[0,4,1],[0,5,1]],"why":["Count: 1 carbon → meth-","Group: –OH → -ol","Join: methane − e + ol = methanol"],"iso":"","op":["methanol","methanal","ethanol","methane"],"alt":"CH3-OH"},{"id":"N37","f":5,"n":2,"p":1,"tb":"ethanol","iu":"ethanol","mfs":"\\ce{C2H6O}","cfs":"\\ce{CH3-CH2-OH}","a":[["C",0,0],["C",2,0],["H",0,-2],["H",0,2],["H",-2,0],["O",4,0],["H",6,0],["H",2,-2],["H",2,2]],"b":[[0,1,1],[0,2,1],[0,3,1],[0,4,1],[1,5,1],[5,6,1],[1,7,1],[1,8,1]],"why":["Count: 2 carbons → eth-","Group: –OH → -ol","Join: ethane − e + ol = ethanol"],"iso":"","op":["ethanol","ethanoic acid","methanol","propanol"],"alt":"CH3-CH2-OH"},{"id":"N38","f":5,"n":3,"p":1,"tb":"propanol","iu":"propan-1-ol","mfs":"\\ce{C3H8O}","cfs":"\\ce{CH3-CH2-CH2-OH}","a":[["C",0,0],["C",2,0],["C",4,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["O",6,0],["H",8,0],["H",4,-2],["H",4,2]],"b":[[0,1,1],[1,2,1],[0,3,1],[0,4,1],[0,5,1],[1,6,1],[1,7,1],[2,8,1],[8,9,1],[2,10,1],[2,11,1]],"why":["Count: 3 carbons → prop-","Group: –OH → -ol","Join: propane − e + ol = propanol"],"iso":"Moving the group gives isomer(s): propan-2-ol. Your textbook calls them all propanol.","op":["propanol","propanoic acid","ethanol","butanol"],"alt":"CH3-CH2-CH2-OH"},{"id":"N39","f":5,"n":3,"p":2,"tb":"propanol","iu":"propan-2-ol","mfs":"\\ce{C3H8O}","cfs":"\\ce{CH3-CH(OH)-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["H",0,-2],["H",0,2],["H",-2,0],["O",2,2],["H",2,4],["H",2,-2],["H",4,-2],["H",4,2],["H",6,0]],"b":[[0,1,1],[1,2,1],[0,3,1],[0,4,1],[0,5,1],[1,6,1],[6,7,1],[1,8,1],[2,9,1],[2,10,1],[2,11,1]],"why":["Count: 3 carbons → prop-","Group: –OH → -ol","Join: propane − e + ol = propanol"],"iso":"Moving the group gives isomer(s): propan-1-ol. Your textbook calls them all propanol.","op":["propanol","propanal","ethanol","butanol"],"alt":"CH3-CH(OH)-CH3"},{"id":"N40","f":5,"n":4,"p":1,"tb":"butanol","iu":"butan-1-ol","mfs":"\\ce{C4H10O}","cfs":"\\ce{CH3-CH2-CH2-CH2-OH}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["O",8,0],["H",10,0],["H",6,-2],["H",6,2]],"b":[[0,1,1],[1,2,1],[2,3,1],[0,4,1],[0,5,1],[0,6,1],[1,7,1],[1,8,1],[2,9,1],[2,10,1],[3,11,1],[11,12,1],[3,13,1],[3,14,1]],"why":["Count: 4 carbons → but-","Group: –OH → -ol","Join: butane − e + ol = butanol"],"iso":"Moving the group gives isomer(s): butan-2-ol. Your textbook calls them all butanol.","op":["butanol","butanone","propanol","pentanol"],"alt":"CH3-CH2-CH2-CH2-OH"},{"id":"N41","f":5,"n":4,"p":2,"tb":"butanol","iu":"butan-2-ol","mfs":"\\ce{C4H10O}","cfs":"\\ce{CH3-CH(OH)-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",-2,0],["O",2,2],["H",2,4],["H",2,-2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[0,4,1],[0,5,1],[0,6,1],[1,7,1],[7,8,1],[1,9,1],[2,10,1],[2,11,1],[3,12,1],[3,13,1],[3,14,1]],"why":["Count: 4 carbons → but-","Group: –OH → -ol","Join: butane − e + ol = butanol"],"iso":"Moving the group gives isomer(s): butan-1-ol. Your textbook calls them all butanol.","op":["butanol","butanoic acid","propanol","pentanol"],"alt":"CH3-CH(OH)-CH2-CH3"},{"id":"N42","f":5,"n":5,"p":1,"tb":"pentanol","iu":"pentan-1-ol","mfs":"\\ce{C5H12O}","cfs":"\\ce{CH3-CH2-CH2-CH2-CH2-OH}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["O",10,0],["H",12,0],["H",8,-2],["H",8,2]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[1,9,1],[2,10,1],[2,11,1],[3,12,1],[3,13,1],[4,14,1],[14,15,1],[4,16,1],[4,17,1]],"why":["Count: 5 carbons → pent-","Group: –OH → -ol","Join: pentane − e + ol = pentanol"],"iso":"Moving the group gives isomer(s): pentan-2-ol, pentan-3-ol. Your textbook calls them all pentanol.","op":["pentanol","pentanal","butanol","hexanol"],"alt":"CH3-CH2-CH2-CH2-CH2-OH"},{"id":"N43","f":5,"n":5,"p":2,"tb":"pentanol","iu":"pentan-2-ol","mfs":"\\ce{C5H12O}","cfs":"\\ce{CH3-CH(OH)-CH2-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["O",2,2],["H",2,4],["H",2,-2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[8,9,1],[1,10,1],[2,11,1],[2,12,1],[3,13,1],[3,14,1],[4,15,1],[4,16,1],[4,17,1]],"why":["Count: 5 carbons → pent-","Group: –OH → -ol","Join: pentane − e + ol = pentanol"],"iso":"Moving the group gives isomer(s): pentan-1-ol, pentan-3-ol. Your textbook calls them all pentanol.","op":["pentanol","pentanone","butanol","hexanol"],"alt":"CH3-CH(OH)-CH2-CH2-CH3"},{"id":"N44","f":5,"n":5,"p":3,"tb":"pentanol","iu":"pentan-3-ol","mfs":"\\ce{C5H12O}","cfs":"\\ce{CH3-CH2-CH(OH)-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["O",4,2],["H",4,4],["H",4,-2],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[1,9,1],[2,10,1],[10,11,1],[2,12,1],[3,13,1],[3,14,1],[4,15,1],[4,16,1],[4,17,1]],"why":["Count: 5 carbons → pent-","Group: –OH → -ol","Join: pentane − e + ol = pentanol"],"iso":"Moving the group gives isomer(s): pentan-1-ol, pentan-2-ol. Your textbook calls them all pentanol.","op":["pentanol","pentanoic acid","butanol","hexanol"],"alt":"CH3-CH2-CH(OH)-CH2-CH3"},{"id":"N45","f":6,"n":1,"p":1,"tb":"methanal","iu":"methanal","mfs":"\\ce{CH2O}","cfs":"\\ce{H-CHO}","a":[["C",0,0],["O",2,0],["H",0,-2],["H",-2,0]],"b":[[0,1,2],[0,2,1],[0,3,1]],"why":["Count: 1 carbon → meth-","Group: –CHO → -al","Join: methane − e + al = methanal"],"iso":"","op":["methanal","methanol","ethanal","methane"],"alt":"H-CHO"},{"id":"N46","f":6,"n":2,"p":1,"tb":"ethanal","iu":"ethanal","mfs":"\\ce{C2H4O}","cfs":"\\ce{CH3-CHO}","a":[["C",0,0],["C",2,0],["H",0,-2],["H",0,2],["H",-2,0],["O",4,0],["H",2,-2]],"b":[[0,1,1],[0,2,1],[0,3,1],[0,4,1],[1,5,2],[1,6,1]],"why":["Count: 2 carbons → eth-","Group: –CHO → -al","Join: ethane − e + al = ethanal"],"iso":"","op":["ethanal","ethanoic acid","methanal","propanal"],"alt":"CH3-CHO"},{"id":"N47","f":6,"n":3,"p":1,"tb":"propanal","iu":"propanal","mfs":"\\ce{C3H6O}","cfs":"\\ce{CH3-CH2-CHO}","a":[["C",0,0],["C",2,0],["C",4,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["O",6,0],["H",4,-2]],"b":[[0,1,1],[1,2,1],[0,3,1],[0,4,1],[0,5,1],[1,6,1],[1,7,1],[2,8,2],[2,9,1]],"why":["Count: 3 carbons → prop-","Group: –CHO → -al","Join: propane − e + al = propanal"],"iso":"","op":["propanal","propanoic acid","ethanal","butanal"],"alt":"CH3-CH2-CHO"},{"id":"N48","f":6,"n":4,"p":1,"tb":"butanal","iu":"butanal","mfs":"\\ce{C4H8O}","cfs":"\\ce{CH3-CH2-CH2-CHO}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["O",8,0],["H",6,-2]],"b":[[0,1,1],[1,2,1],[2,3,1],[0,4,1],[0,5,1],[0,6,1],[1,7,1],[1,8,1],[2,9,1],[2,10,1],[3,11,2],[3,12,1]],"why":["Count: 4 carbons → but-","Group: –CHO → -al","Join: butane − e + al = butanal"],"iso":"","op":["butanal","butanol","propanal","pentanal"],"alt":"CH3-CH2-CH2-CHO"},{"id":"N49","f":6,"n":5,"p":1,"tb":"pentanal","iu":"pentanal","mfs":"\\ce{C5H10O}","cfs":"\\ce{CH3-CH2-CH2-CH2-CHO}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["O",10,0],["H",8,-2]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[1,9,1],[2,10,1],[2,11,1],[3,12,1],[3,13,1],[4,14,2],[4,15,1]],"why":["Count: 5 carbons → pent-","Group: –CHO → -al","Join: pentane − e + al = pentanal"],"iso":"","op":["pentanal","pentanone","butanal","hexanal"],"alt":"CH3-CH2-CH2-CH2-CHO"},{"id":"N50","f":7,"n":3,"p":2,"tb":"propanone","iu":"propanone","mfs":"\\ce{C3H6O}","cfs":"\\ce{CH3-CO-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["H",0,-2],["H",0,2],["H",-2,0],["O",2,-2],["H",4,-2],["H",4,2],["H",6,0]],"b":[[0,1,1],[1,2,1],[0,3,1],[0,4,1],[0,5,1],[1,6,2],[2,7,1],[2,8,1],[2,9,1]],"why":["Count: 3 carbons → prop-","Group: –CO– → -one","Join: propane − e + one = propanone"],"iso":"","op":["propanone","propanoic acid","butanone","propane"],"alt":"CH3-CO-CH3"},{"id":"N51","f":7,"n":4,"p":2,"tb":"butanone","iu":"butan-2-one","mfs":"\\ce{C4H8O}","cfs":"\\ce{CH3-CO-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",-2,0],["O",2,-2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[0,4,1],[0,5,1],[0,6,1],[1,7,2],[2,8,1],[2,9,1],[3,10,1],[3,11,1],[3,12,1]],"why":["Count: 4 carbons → but-","Group: –CO– → -one","Join: butane − e + one = butanone"],"iso":"","op":["butanone","butanol","propanone","pentanone"],"alt":"CH3-CO-CH2-CH3"},{"id":"N52","f":7,"n":5,"p":2,"tb":"pentanone","iu":"pentan-2-one","mfs":"\\ce{C5H10O}","cfs":"\\ce{CH3-CO-CH2-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["O",2,-2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,2],[2,9,1],[2,10,1],[3,11,1],[3,12,1],[4,13,1],[4,14,1],[4,15,1]],"why":["Count: 5 carbons → pent-","Group: –CO– → -one","Join: pentane − e + one = pentanone"],"iso":"Moving the group gives isomer(s): pentan-3-one. Your textbook calls them all pentanone.","op":["pentanone","pentanal","butanone","hexanone"],"alt":"CH3-CO-CH2-CH2-CH3"},{"id":"N53","f":7,"n":5,"p":3,"tb":"pentanone","iu":"pentan-3-one","mfs":"\\ce{C5H10O}","cfs":"\\ce{CH3-CH2-CO-CH2-CH3}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["O",4,-2],["H",6,-2],["H",6,2],["H",8,-2],["H",8,2],["H",10,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[1,9,1],[2,10,2],[3,11,1],[3,12,1],[4,13,1],[4,14,1],[4,15,1]],"why":["Count: 5 carbons → pent-","Group: –CO– → -one","Join: pentane − e + one = pentanone"],"iso":"Moving the group gives isomer(s): pentan-2-one. Your textbook calls them all pentanone.","op":["pentanone","pentanoic acid","butanone","hexanone"],"alt":"CH3-CH2-CO-CH2-CH3"},{"id":"N54","f":8,"n":1,"p":1,"tb":"methanoic acid","iu":"methanoic acid","mfs":"\\ce{CH2O2}","cfs":"\\ce{H-COOH}","a":[["C",0,0],["O",0,-2],["O",2,0],["H",4,0],["H",-2,0]],"b":[[0,1,2],[0,2,1],[2,3,1],[0,4,1]],"why":["Count: 1 carbon → meth-","Group: –COOH → -oic acid","Join: methane − e + oic acid = methanoic acid"],"iso":"","op":["methanoic acid","methanol","ethanoic acid","methane"],"alt":"H-COOH"},{"id":"N55","f":8,"n":2,"p":1,"tb":"ethanoic acid","iu":"ethanoic acid","mfs":"\\ce{C2H4O2}","cfs":"\\ce{CH3-COOH}","a":[["C",0,0],["C",2,0],["H",0,-2],["H",0,2],["H",-2,0],["O",2,-2],["O",4,0],["H",6,0]],"b":[[0,1,1],[0,2,1],[0,3,1],[0,4,1],[1,5,2],[1,6,1],[6,7,1]],"why":["Count: 2 carbons → eth-","Group: –COOH → -oic acid","Join: ethane − e + oic acid = ethanoic acid"],"iso":"","op":["ethanoic acid","ethanal","methanoic acid","propanoic acid"],"alt":"CH3-COOH"},{"id":"N56","f":8,"n":3,"p":1,"tb":"propanoic acid","iu":"propanoic acid","mfs":"\\ce{C3H6O2}","cfs":"\\ce{CH3-CH2-COOH}","a":[["C",0,0],["C",2,0],["C",4,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["O",4,-2],["O",6,0],["H",8,0]],"b":[[0,1,1],[1,2,1],[0,3,1],[0,4,1],[0,5,1],[1,6,1],[1,7,1],[2,8,2],[2,9,1],[9,10,1]],"why":["Count: 3 carbons → prop-","Group: –COOH → -oic acid","Join: propane − e + oic acid = propanoic acid"],"iso":"","op":["propanoic acid","propanone","ethanoic acid","butanoic acid"],"alt":"CH3-CH2-COOH"},{"id":"N57","f":8,"n":4,"p":1,"tb":"butanoic acid","iu":"butanoic acid","mfs":"\\ce{C4H8O2}","cfs":"\\ce{CH3-CH2-CH2-COOH}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["O",6,-2],["O",8,0],["H",10,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[0,4,1],[0,5,1],[0,6,1],[1,7,1],[1,8,1],[2,9,1],[2,10,1],[3,11,2],[3,12,1],[12,13,1]],"why":["Count: 4 carbons → but-","Group: –COOH → -oic acid","Join: butane − e + oic acid = butanoic acid"],"iso":"","op":["butanoic acid","butanol","propanoic acid","pentanoic acid"],"alt":"CH3-CH2-CH2-COOH"},{"id":"N58","f":8,"n":5,"p":1,"tb":"pentanoic acid","iu":"pentanoic acid","mfs":"\\ce{C5H10O2}","cfs":"\\ce{CH3-CH2-CH2-CH2-COOH}","a":[["C",0,0],["C",2,0],["C",4,0],["C",6,0],["C",8,0],["H",0,-2],["H",0,2],["H",-2,0],["H",2,-2],["H",2,2],["H",4,-2],["H",4,2],["H",6,-2],["H",6,2],["O",8,-2],["O",10,0],["H",12,0]],"b":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[0,5,1],[0,6,1],[0,7,1],[1,8,1],[1,9,1],[2,10,1],[2,11,1],[3,12,1],[3,13,1],[4,14,2],[4,15,1],[15,16,1]],"why":["Count: 5 carbons → pent-","Group: –COOH → -oic acid","Join: pentane − e + oic acid = pentanoic acid"],"iso":"","op":["pentanoic acid","pentanal","butanoic acid","hexanoic acid"],"alt":"CH3-CH2-CH2-CH2-COOH"}],"fam":["alkane","alkene","alkyne","chloroalkane","bromoalkane","alcohol","aldehyde","ketone","carboxylic acid"],"ref":[[1,1,"An alkene needs a double bond between two carbon atoms — one carbon is not enough."],[2,1,"An alkyne needs a triple bond between two carbon atoms — one carbon is not enough."],[7,1,"In a ketone the C=O carbon must sit between two other carbons, so a ketone needs at least three carbons. (With fewer, the C=O carbon carries an H and the compound is an aldehyde.)"],[7,2,"In a ketone the C=O carbon must sit between two other carbons, so a ketone needs at least three carbons. (With fewer, the C=O carbon carries an H and the compound is an aldehyde.)"]]};/*END-NI-DATA*/
  function initNi() {
    $$('svg[data-ni]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-ni-on')) return;
      art.setAttribute('data-ni-on', '1');
      niBuild(art);
    });
  }
  function niTex(s) { var i = CHEM_TEX.k.indexOf(s); return i < 0 ? '' : chemTex(i); }
  function niSvg(r, label) {
    var u = 24, pad = 16, xs = r.a.map(function (a) { return a[1]; }), ys = r.a.map(function (a) { return a[2]; });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys), w = (Math.max.apply(null, xs) - x0) * u + 2 * pad, h = (Math.max.apply(null, ys) - y0) * u + 2 * pad;
    var P = function (a) { return [(a[1] - x0) * u + pad, (a[2] - y0) * u + pad]; }, ink = 'var(--ink, #1F2328)', o = '';
    r.b.forEach(function (b) {
      var p = P(r.a[b[0]]), q = P(r.a[b[1]]), dx = q[0] - p[0], dy = q[1] - p[1], L = Math.sqrt(dx * dx + dy * dy), ux = dx / L, uy = dy / L;
      var ra = Math.abs(ux) > 0.5 ? (r.a[b[0]][0].length > 1 ? 13 : 9) : 10, rb = Math.abs(ux) > 0.5 ? (r.a[b[1]][0].length > 1 ? 13 : 9) : 10;
      var off = { 1: [0], 2: [-3, 3], 3: [-4.5, 0, 4.5] }[b[2]];
      off.forEach(function (d) {
        o += '<line class="ni-b" data-a="' + b[0] + '" data-b="' + b[1] + '" x1="' + (p[0] + ux * ra - uy * d).toFixed(1) + '" y1="' + (p[1] + uy * ra + ux * d).toFixed(1) +
          '" x2="' + (q[0] - ux * rb - uy * d).toFixed(1) + '" y2="' + (q[1] - uy * rb + ux * d).toFixed(1) + '" stroke="' + ink + '" stroke-width="1.8"/>';
      });
    });
    r.a.forEach(function (a, i) {
      var p = P(a);
      o += '<text class="ni-at" data-i="' + i + '" x="' + p[0].toFixed(1) + '" y="' + (p[1] + 6.5).toFixed(1) + '" font-family="Lexend, sans-serif" font-size="18"' +
        (a[0] === 'C' ? ' font-weight="600"' : '') + ' text-anchor="middle" fill="' + (a[0] === 'H' ? 'var(--ink-soft, #57554D)' : ink) + '">' + a[0] + '</text>';
    });
    return '<svg class="ni-svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + label + '">' + o + '</svg>';
  }
  function niBuild(art) {
    var D = NI_DATA, uid = 'ni' + Math.random().toString(36).slice(2, 7);
    var S = { n: 3, f: 0, p: 0, quiz: false, pick: null, ops: [] };
    var root = document.createElement('div');
    root.className = 'ni';
    var chips = function (cls, items) { return items.map(function (t, i) { return '<button type="button" class="' + cls + '" data-i="' + i + '" aria-pressed="false" tabindex="-1">' + t + '</button>'; }).join(''); };
    root.innerHTML =
      '<div class="ni-ctl"><p class="ni-h" id="' + uid + '-c">Number of carbons</p><div class="ni-row" role="group" aria-labelledby="' + uid + '-c">' + chips('ni-c', ['1', '2', '3', '4', '5']) + '</div>' +
      '<p class="ni-h" id="' + uid + '-f">Family</p><div class="ni-row" role="group" aria-labelledby="' + uid + '-f">' + chips('ni-f', D.fam) + '</div>' +
      '<div class="ni-pos" hidden><p class="ni-h" id="' + uid + '-p">Position of the group</p><div class="ni-row ni-ps" role="group" aria-labelledby="' + uid + '-p"></div>' +
      '<p class="ni-pnote">Position 4 in a five-carbon chain is the same as position 2 counted from the other end.</p></div>' +
      '<label class="ni-tog"><input type="checkbox"><span>Name it yourself</span></label><button type="button" class="ni-sur">Surprise me</button></div>' +
      '<div class="ni-sf"></div>' +
      '<div class="ni-read" aria-live="polite">' +
      '<div class="ni-why-not" hidden><p class="ni-wnh"><span aria-hidden="true">⚠</span> Why not?</p><p class="ni-wnm"></p></div>' +
      '<div class="ni-res"><div class="ni-quiz" hidden><p class="ni-qh">Pick the name your textbook uses:</p><div class="ni-ops"></div><p class="ni-fb" hidden></p></div>' +
      '<dl class="ni-dl"><div class="ni-nm"><dt>Name (as in your textbook)</dt><dd class="ni-tb"></dd>' +
      '<dt>Full IUPAC name <span class="ni-tag">beyond the syllabus</span></dt><dd class="ni-iu"></dd></div>' +
      '<dt>Molecular formula</dt><dd class="ni-mf"></dd><dt>Condensed formula</dt><dd class="ni-cf"></dd>' +
      '<div class="ni-nm"><dt>Why this name?</dt><dd class="ni-why"></dd><dt class="ni-isoh">Same formula, different position?</dt><dd class="ni-iso"></dd></div></dl></div></div>';
    art.innerHTML = '';
    art.appendChild(root);
    var q = function (c) { return $('.' + c, root); };
    var cB = $$('.ni-c', root), fB = $$('.ni-f', root);
    chipKeys(cB); chipKeys(fB);
    function rowsFor() { return D.rows.filter(function (r) { return r.f === S.f && r.n === S.n; }); }
    function refused() { var m = null; D.ref.forEach(function (x) { if (x[0] === S.f && x[1] === S.n) m = x[2]; }); return m; }
    function cur() { var rs = rowsFor(); return rs.filter(function (r) { return r.p === S.p; })[0] || rs[0]; }
    function newOps(r) {
      var a = r.op.slice();
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
      S.ops = a; S.pick = null;
    }
    function draw() {
      var keepFocus = root.contains(document.activeElement) && /ni-[cfp]\b/.test(document.activeElement.className);
      cB.forEach(function (b, i) { b.setAttribute('aria-pressed', i + 1 === S.n ? 'true' : 'false'); if (!keepFocus) b.tabIndex = i + 1 === S.n ? 0 : -1; });
      fB.forEach(function (b, i) { b.setAttribute('aria-pressed', i === S.f ? 'true' : 'false'); if (!keepFocus) b.tabIndex = i === S.f ? 0 : -1; });
      var msg = refused(), rs = rowsFor();
      q('ni-why-not').hidden = !msg;
      q('ni-res').hidden = !!msg;
      q('ni-sf').hidden = !!msg;
      var multi = !msg && rs.length > 1;
      q('ni-pos').hidden = !multi;
      if (multi) {
        var ps = q('ni-ps');
        if (ps.getAttribute('data-k') !== S.f + '-' + S.n) {
          ps.setAttribute('data-k', S.f + '-' + S.n);
          ps.innerHTML = rs.map(function (r) { return '<button type="button" class="ni-p" data-p="' + r.p + '" aria-pressed="false" tabindex="-1">' + r.p + '</button>'; }).join('');
          var pB = $$('.ni-p', ps);
          chipKeys(pB);
          pB.forEach(function (b) { on(b, 'click', function () { S.p = +b.getAttribute('data-p'); newOps(cur()); draw(); }); });
        }
        $$('.ni-p', root).forEach(function (b) { var sel = +b.getAttribute('data-p') === S.p; b.setAttribute('aria-pressed', sel ? 'true' : 'false'); if (!keepFocus) b.tabIndex = sel ? 0 : -1; });
      }
      if (msg) { q('ni-wnm').textContent = msg; return; }
      var r = cur(), hide = S.quiz && S.pick === null;
      q('ni-sf').innerHTML = niSvg(r, r.alt + '. Structural formula of ' + (hide ? 'this compound' : r.tb));
      $$('.ni-nm', root).forEach(function (e) { e.hidden = hide; });
      q('ni-tb').textContent = r.tb;
      q('ni-iu').textContent = r.iu;
      q('ni-mf').innerHTML = '<span class="ni-k" aria-hidden="true">' + niTex(r.mfs) + '</span><span class="sr">' + r.mfs.slice(4, -1) + '</span>';
      q('ni-cf').innerHTML = '<span class="ni-k" aria-hidden="true">' + niTex(r.cfs) + '</span><span class="sr">' + r.alt + '</span>';
      q('ni-why').innerHTML = r.why.map(function (l) { return '<span class="ni-wl">' + l.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>'; }).join('');
      q('ni-isoh').hidden = !r.iso; q('ni-iso').hidden = !r.iso;
      q('ni-iso').textContent = r.iso;
      var qz = q('ni-quiz');
      qz.hidden = !S.quiz;
      if (S.quiz) {
        if (!S.ops.length) newOps(r);
        q('ni-ops').innerHTML = S.ops.map(function (o) {
          var st = S.pick === null ? '' : o === r.tb ? ' ni-right' : o === S.pick ? ' ni-wrong' : '';
          return '<button type="button" class="ni-op' + st + '"' + (S.pick !== null ? ' aria-disabled="true"' : '') + '>' + o + '</button>';
        }).join('');
        $$('.ni-op', root).forEach(function (b) { on(b, 'click', function () { if (S.pick !== null) return; S.pick = b.textContent; draw(); }); });
        var fb = q('ni-fb');
        fb.hidden = S.pick === null;
        if (S.pick !== null) {
          var ok = S.pick === r.tb;
          fb.className = 'ni-fb ' + (ok ? 'ni-ok' : 'ni-no');
          fb.textContent = ok ? 'Right — ' + r.tb + ' is the textbook name.' : 'Not quite — the textbook name is ' + r.tb + '.';
        }
      }
    }
    function setNF(n, f) {
      S.n = n; S.f = f;
      var rs = rowsFor(); S.p = rs.length ? rs[0].p : 0;
      if (rs.length) newOps(rs[0]);
      draw();
    }
    cB.forEach(function (b, i) { on(b, 'click', function () { setNF(i + 1, S.f); }); });
    fB.forEach(function (b, i) { on(b, 'click', function () { setNF(S.n, i); }); });
    on($('.ni-tog input', root), 'change', function (e) { S.quiz = e.target.checked; newOps(cur() || D.rows[0]); draw(); });
    on(q('ni-sur'), 'click', function () {
      var r = cur(), k = r;
      while (k === r) k = D.rows[Math.floor(Math.random() * D.rows.length)];
      S.n = k.n; S.f = k.f; S.p = k.p; newOps(k); draw();
    });
    root._ni = { set: function (n, f, p) { S.n = n; S.f = f; var rs = rowsFor(); S.p = p || (rs.length ? rs[0].p : 0); if (rs.length) newOps(cur()); draw(); }, state: S, tex: function (s) { return CHEM_TEX.k.indexOf(s); } };
    setNF(3, 0);
  }

  /* ---------------------------------------------------- label-the-diagram trainer (Science Ch 5 WRAP-V14; reused by Ch 6, 7)
     svg[data-ldt] is the static first view (content/<ch>/diagrams/_src/ldt.py): one nested svg.ldt-panel per diagram, copied
     from its exam line SVG, + JSON {done, dhint, sets: [{key, tab, alt, labels, hints, distractors}]}. Nothing is
     hard-coded here: slot n sits on the panel's lbl-n anchor, its ring on ptr-n, both read every time a diagram is drawn.
     Modes: drag / tap (chips + slots, pointer drag or tap-tap, keyboard Enter/Space, Esc cancels) and list (one native
     select per pointer). Nothing is stored; every visit starts on the first diagram.
     Optional per set (Ch 6): "pfx" - anchors are ptr-<pfx>N / lbl-<pfx>N (two panels of one exam SVG); a panel's viewBox may
     start at an offset; a label column may be split (slots then stop at the neighbouring label on the same row). */
  function initLdt() {
    $$('svg[data-ldt]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-ldt-on')) return;
      var D; try { D = JSON.parse(svg.getAttribute('data-ldt')); } catch (e) { return; }
      art.setAttribute('data-ldt-on', '1');
      ldtBuild(art, svg, D);
    });
  }
  function ldtShuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function ldtAnchor(panel, kind, n) {
    return panel.querySelector('[id="' + kind + '-' + n + '"]') || panel.querySelector('[id$="-' + kind + '-' + n + '"]');
  }
  function ldtBuild(art, src, D) {
    var uid = 'ldt' + Math.random().toString(36).slice(2, 7), NS = 'http://www.w3.org/2000/svg';
    var canDrag = !!window.PointerEvent;
    var S = { set: 0, mode: canDrag ? 'drag' : 'list', sel: null, st: [] };
    D.sets.forEach(function () { S.st.push(null); });
    var root = document.createElement('div');
    root.className = 'ldt';
    root.innerHTML =
      '<div class="ldt-tabs" role="tablist" aria-label="Diagram">' + D.sets.map(function (s, i) {
        return '<button type="button" role="tab" class="ldt-tab" id="' + uid + '-t' + i + '" aria-controls="' + uid + '-p" aria-selected="false" tabindex="-1" data-i="' + i + '">' + s.tab + '</button>';
      }).join('') + '</div>' +
      '<div class="ldt-modes" role="group" aria-label="How to answer">' +
        '<button type="button" class="ldt-mode" data-m="drag" aria-pressed="false">Drag / tap</button>' +
        '<button type="button" class="ldt-mode" data-m="list" aria-pressed="false">List</button></div>' +
      '<div class="ldt-p" id="' + uid + '-p" role="tabpanel">' +
        '<p class="ldt-how"></p>' +
        '<div class="ldt-stage"></div>' +
        '<p class="ldt-count"></p>' +
        '<p class="ldt-hint" hidden></p>' +
        '<p class="ldt-done" hidden></p>' +
        '<div class="ldt-bank" role="group" aria-label="Label bank"></div>' +
        '<ol class="ldt-list" hidden></ol>' +
        '<div class="ldt-btns"><button type="button" class="ldt-b" data-a="check">Check all</button>' +
        '<button type="button" class="ldt-b" data-a="show">Show answers</button>' +
        '<button type="button" class="ldt-b" data-a="again">Start again</button></div>' +
      '</div>' +
      '<div class="ldt-live" aria-live="polite"></div>';
    art.removeChild(src);
    art.appendChild(root);
    var stage = $('.ldt-stage', root), bank = $('.ldt-bank', root), list = $('.ldt-list', root), live = $('.ldt-live', root);
    var hintEl = $('.ldt-hint', root), doneEl = $('.ldt-done', root), countEl = $('.ldt-count', root), howEl = $('.ldt-how', root);
    var tabs = $$('.ldt-tab', root), modes = $$('.ldt-mode', root);
    var flashT = null, liveT = null;

    function say(msg) {
      clearTimeout(liveT); live.textContent = '';
      liveT = setTimeout(function () { live.textContent = msg; }, 30);
    }
    function cur() { return D.sets[S.set]; }
    function state() {
      if (!S.st[S.set]) {
        var s = cur(), chips = s.labels.map(function (l, i) { return { t: l, n: i + 1 }; })
          .concat(s.distractors.map(function (l) { return { t: l, n: 0 }; }));
        S.st[S.set] = { chips: ldtShuffle(chips), ok: {}, shown: false, pick: {} };
      }
      return S.st[S.set];
    }
    function nOk(st) { return Object.keys(st.ok).length; }

    /* ---- draw the current diagram: clone its panel, hide label texts, add rings, place slots on the anchors */
    function drawStage() {
      var s = cur(), st = state(), panel = src.querySelector('.ldt-panel[data-key="' + s.key + '"]');
      var vb = panel.getAttribute('viewBox').split(/[\s,]+/).map(Number);
      stage.innerHTML = '';
      var pic = document.createElementNS(NS, 'svg');
      pic.setAttribute('viewBox', vb.join(' '));
      pic.setAttribute('class', 'dg ldt-svg');
      pic.setAttribute('role', 'img');
      pic.setAttribute('aria-label', s.alt);
      pic.setAttribute('stroke-linecap', 'round'); pic.setAttribute('stroke-linejoin', 'round');
      Array.prototype.forEach.call(panel.childNodes, function (c) { pic.appendChild(c.cloneNode(true)); });
      $$('.ldt-x', pic).forEach(function (g) { g.setAttribute('display', 'none'); });
      stage.appendChild(pic);
      var X0 = vb[0], Y0 = vb[1], W = vb[2], H = vb[3];      /* a panel may be cut from a larger drawing (viewBox offset) */
      stage.style.aspectRatio = W + ' / ' + H;
      var pfx = s.pfx || '', rows = [];                      /* pfx: anchors named ptr-<pfx>N / lbl-<pfx>N (two panels in one SVG) */
      s.labels.forEach(function (lab, i) {
        var n = i + 1, lb = ldtAnchor(pic, 'lbl', pfx + n), pt = ldtAnchor(pic, 'ptr', pfx + n);
        if (!lb || !pt) return;
        var b = lb.getBBox(), p = pt.getBBox();
        rows.push({ n: n, lb: lb, x: b.x - X0, y: b.y - Y0, w: b.width, h: b.height,
          px: p.x + p.width / 2, py: p.y + p.height / 2, right: b.x - X0 + b.width / 2 > W / 2 });
      });
      rows.forEach(function (r) {
        var n = r.n, px = r.px, py = r.py, right = r.right;
        r.lb.setAttribute('visibility', 'hidden');
        var ring = document.createElementNS(NS, 'circle');
        ring.setAttribute('cx', px); ring.setAttribute('cy', py); ring.setAttribute('r', '6');
        ring.setAttribute('class', 'ldt-ring'); ring.setAttribute('data-n', n);
        pic.appendChild(ring);
        var slot = document.createElement('button');
        slot.type = 'button'; slot.className = 'ldt-slot' + (right ? ' is-r' : ' is-l');
        slot.setAttribute('data-n', n);
        slot.style.top = ((r.y + r.h / 2) / H * 100) + '%';
        /* the slot covers its label column (label start -> canvas edge, or -> the next label on the same row when a column
           is split, as for the brain's hind-brain group) and, once filled, may grow over the leader up to that label */
        var lo = 0, hi = W;
        rows.forEach(function (o) {
          if (o === r || Math.abs((o.y + o.h / 2) - (r.y + r.h / 2)) > 24) return;
          if (o.x + o.w <= r.x) lo = Math.max(lo, (o.x + o.w + r.x) / 2 + 2);          /* split the gap between the two labels */
          else if (o.x >= r.x + r.w) hi = Math.min(hi, (r.x + r.w + o.x) / 2 - 2);
        });
        var cover = right ? (hi - r.x) / W * 100 : (r.x + r.w - lo) / W * 100, room = (hi - lo) / W * 100;
        if (right) slot.style.right = ((W - hi) / W * 100) + '%'; else slot.style.left = (lo / W * 100) + '%';
        slot.style.minWidth = 'max(44px, ' + cover + '%)';
        slot.style.maxWidth = Math.min(Math.max(cover, 62), room) + '%';
        slot.setAttribute('data-px', px); slot.setAttribute('data-py', py);
        stage.appendChild(slot);
        on(slot, 'click', function () { slotHit(slot); });
        on(slot, 'focus', function () { ringOn(n, true); });
        on(slot, 'blur', function () { ringOn(n, false); });
        on(slot, 'mouseenter', function () { ringOn(n, true); });
        on(slot, 'mouseleave', function () { if (document.activeElement !== slot) ringOn(n, false); });
        on(slot, 'keydown', function (e) { if (e.key === 'Escape') cancelSel(); });
      });
    }
    function ringOn(n, yes) { var r = $('.ldt-ring[data-n="' + n + '"]', stage); if (r) r.classList.toggle('is-on', yes); }

    /* ---- slots, bank, list, counter */
    function slotText(slot) {
      var s = cur(), st = state(), n = +slot.getAttribute('data-n'), lab = s.labels[n - 1];
      slot.classList.remove('is-ok', 'is-shown');
      if (st.ok[n]) {
        slot.classList.add('is-ok');
        slot.innerHTML = '<span class="ldt-n" aria-hidden="true">' + n + '</span><span class="ldt-l"><span aria-hidden="true">✓ </span>' + lab + '</span>';
        slot.setAttribute('aria-label', 'Pointer ' + n + ', ' + lab + ', correct');
        slot.setAttribute('aria-disabled', 'true');
      } else if (st.shown) {
        slot.classList.add('is-shown');
        slot.innerHTML = '<span class="ldt-n" aria-hidden="true">' + n + '</span><span class="ldt-l">' + lab + '</span>';
        slot.setAttribute('aria-label', 'Pointer ' + n + ', ' + lab + ', answer shown');
        slot.setAttribute('aria-disabled', 'true');
      } else {
        slot.innerHTML = '<span class="ldt-n" aria-hidden="true">' + n + '</span>';
        slot.setAttribute('aria-label', 'Pointer ' + n + ', empty');
        slot.removeAttribute('aria-disabled');
      }
      slot.tabIndex = S.mode === 'drag' ? 0 : -1;
    }
    function drawBank() {
      var st = state();
      bank.innerHTML = '';
      st.chips.forEach(function (c, i) {
        if (c.n && st.ok[c.n]) return;
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'ldt-chip'; b.textContent = c.t;
        b.setAttribute('data-c', i); b.setAttribute('aria-pressed', S.sel === i ? 'true' : 'false');
        if (st.shown) b.disabled = true;
        bank.appendChild(b);
        on(b, 'click', function () { if (b.getAttribute('data-dragged')) { b.removeAttribute('data-dragged'); return; } pick(i); });
        on(b, 'keydown', function (e) { if (e.key === 'Escape') cancelSel(); });
        if (canDrag) dragable(b, i);
      });
    }
    function drawList() {
      var s = cur(), st = state();
      list.innerHTML = '';
      s.labels.forEach(function (lab, i) {
        var n = i + 1, li = document.createElement('li'), id = uid + '-s' + n;
        li.className = 'ldt-row';
        var opts = '<option value="">— choose —</option>' + st.chips.map(function (c, k) {
          return '<option value="' + k + '">' + c.t + '</option>';
        }).join('');
        li.innerHTML = '<label for="' + id + '">Pointer ' + n + '</label><select id="' + id + '" data-n="' + n + '">' + opts + '</select>' +
          '<span class="ldt-fb" id="' + id + '-fb"></span>';
        list.appendChild(li);
        var sel = $('select', li), fb = $('.ldt-fb', li);
        sel.setAttribute('aria-describedby', id + '-fb');
        if (st.ok[n]) { sel.value = String(chipIndex(lab)); sel.disabled = true; fb.className = 'ldt-fb is-ok'; fb.textContent = '✓ Correct'; }
        else if (st.shown) { sel.value = String(chipIndex(lab)); sel.disabled = true; fb.className = 'ldt-fb'; fb.textContent = 'Answer shown'; }
        else if (st.pick[n] != null) { sel.value = String(st.pick[n]); }
        on(sel, 'change', function () {
          if (sel.value === '') { delete st.pick[n]; fb.textContent = ''; fb.className = 'ldt-fb'; return; }
          st.pick[n] = +sel.value;
          judge(+sel.value, n, fb, sel);
        });
      });
    }
    function chipIndex(lab) { var st = state(); for (var k = 0; k < st.chips.length; k++) if (st.chips[k].t === lab) return k; return -1; }
    function drawCount() {
      var s = cur(), st = state(), m = s.labels.length, k = nOk(st);
      countEl.textContent = (st.shown ? m : k) + ' of ' + m + ' placed';
      show(doneEl, k === m);
      doneEl.textContent = k === m ? '✓ ' + D.done : '';
    }
    function drawAll() {
      $$('.ldt-slot', stage).forEach(slotText);
      drawBank(); drawList(); drawCount();
      var st = state();
      show(bank, S.mode === 'drag'); show(list, S.mode === 'list');
      stage.classList.toggle('is-list', S.mode === 'list');
      howEl.textContent = S.mode === 'drag'
        ? (canDrag ? 'Tap a label, then tap its numbered slot — or drag the label onto the slot.' : 'Choose a label, then its numbered slot.')
        : 'Choose the label for each numbered pointer.';
      $('[data-a="show"]', root).disabled = st.shown || nOk(st) === cur().labels.length;
      $('[data-a="check"]', root).disabled = st.shown;
    }

    /* ---- placing */
    function pick(i) {
      if (state().shown) return;
      S.sel = S.sel === i ? null : i;
      $$('.ldt-chip', bank).forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-c') === S.sel ? 'true' : 'false'); });
      root.classList.toggle('has-sel', S.sel !== null);
      if (S.sel !== null) say(state().chips[i].t + ' selected. Now choose a numbered slot.');
    }
    function cancelSel() { if (S.sel !== null) { pick(S.sel); say('Selection cancelled.'); } }
    function slotHit(slot) {
      var st = state(), n = +slot.getAttribute('data-n');
      if (st.shown || st.ok[n]) return;
      if (S.sel === null) { say('Pointer ' + n + '. Choose a label from the bank first.'); return; }
      var c = S.sel; S.sel = null; root.classList.remove('has-sel');
      place(c, slot);
    }
    function place(ci, slot) {
      var n = +slot.getAttribute('data-n');
      var ok = judge(ci, n, null, null);
      if (ok) {
        slotText(slot); drawBank(); drawList(); drawCount(); drawAll();
        var nx = $('.ldt-chip', bank); if (nx && document.activeElement === document.body) nx.focus();
      } else {
        slot.classList.remove('is-wrong'); void slot.offsetWidth; slot.classList.add('is-wrong');
        clearTimeout(flashT);
        flashT = setTimeout(function () { slot.classList.remove('is-wrong'); }, 600);
        drawBank();
      }
    }
    function judge(ci, n, fb, sel) {
      var s = cur(), st = state(), c = st.chips[ci], lab = s.labels[n - 1];
      if (c && c.n === n && c.t === lab) {
        st.ok[n] = true;
        hintEl.hidden = true;
        var msg = 'Correct: ' + lab + ' is pointer ' + n + '.';
        if (nOk(st) === s.labels.length) msg += ' ' + D.done;
        say(msg);
        if (fb) { fb.className = 'ldt-fb is-ok'; fb.textContent = '✓ Correct'; sel.disabled = true; }
        $$('.ldt-slot', stage).forEach(slotText); drawCount();
        if (fb) drawBank();
        return true;
      }
      var h = c && c.n ? s.hints[n - 1] : D.dhint;
      hintEl.hidden = false;
      hintEl.innerHTML = '<span aria-hidden="true">✗ </span>Not pointer ' + n + ': ' + h;
      say('Not quite. ' + (c ? c.t : '') + ' is not pointer ' + n + '. ' + h);
      if (fb) { fb.className = 'ldt-fb is-no'; fb.innerHTML = '<span aria-hidden="true">✗ </span>' + h; }
      return false;
    }

    /* ---- drag with pointer events (mouse, touch, pen); a press without movement stays a tap */
    function dragable(b, i) {
      var sx = 0, sy = 0, ghost = null, id = null;
      on(b, 'pointerdown', function (e) {
        if (b.disabled || (e.button !== undefined && e.button !== 0)) return;
        sx = e.clientX; sy = e.clientY; id = e.pointerId;
        try { b.setPointerCapture(id); } catch (x) { /* old browsers */ }
      });
      on(b, 'pointermove', function (e) {
        if (id === null || e.pointerId !== id) return;
        if (!ghost && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 6) {
          ghost = b.cloneNode(true); ghost.className = 'ldt-chip ldt-ghost'; ghost.removeAttribute('data-c');
          document.body.appendChild(ghost); b.classList.add('is-drag');
        }
        if (ghost) {
          ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
          var t = document.elementFromPoint(e.clientX, e.clientY), sl = t && t.closest ? t.closest('.ldt-slot') : null;
          $$('.ldt-slot', stage).forEach(function (x) { x.classList.toggle('is-over', x === sl); });
        }
      });
      function end(e, cancel) {
        if (id === null || e.pointerId !== id) return;
        id = null;
        if (!ghost) return;
        ghost.parentNode.removeChild(ghost); ghost = null; b.classList.remove('is-drag');
        b.setAttribute('data-dragged', '1');
        setTimeout(function () { b.removeAttribute('data-dragged'); }, 400);
        $$('.ldt-slot', stage).forEach(function (x) { x.classList.remove('is-over'); });
        if (cancel) return;
        var t = document.elementFromPoint(e.clientX, e.clientY), sl = t && t.closest ? t.closest('.ldt-slot') : null;
        if (sl && stage.contains(sl)) {
          var n = +sl.getAttribute('data-n'), st = state();
          if (st.shown || st.ok[n]) return;
          S.sel = null; root.classList.remove('has-sel');
          place(i, sl);
        }
      }
      on(b, 'pointerup', function (e) { end(e, false); });
      on(b, 'pointercancel', function (e) { end(e, true); });
    }

    /* ---- buttons, tabs, modes */
    on($('[data-a="check"]', root), 'click', function () {
      var s = cur(), st = state(), empty = [];
      if (S.mode === 'list') {
        s.labels.forEach(function (lab, i) {
          var n = i + 1, sel = $('select[data-n="' + n + '"]', list), fb = $('#' + uid + '-s' + n + '-fb', list);
          if (st.ok[n]) return;
          if (sel.value === '') { empty.push(n); fb.className = 'ldt-fb'; fb.textContent = 'Not answered yet'; }
          else judge(+sel.value, n, fb, sel);
        });
        drawCount();
      } else {
        s.labels.forEach(function (lab, i) { if (!st.ok[i + 1]) empty.push(i + 1); });
      }
      var msg = empty.length ? 'Still to label: pointer' + (empty.length > 1 ? 's ' : ' ') + empty.join(', ') + '.' :
        (nOk(st) === s.labels.length ? 'All labels correct.' : 'Some answers are not right yet — read the hints.');
      hintEl.hidden = false; hintEl.textContent = msg; say(msg);
    });
    on($('[data-a="show"]', root), 'click', function () {
      var st = state(); st.shown = true; S.sel = null; root.classList.remove('has-sel');
      hintEl.hidden = false; hintEl.textContent = 'Answers shown in grey. Press "Start again" to try it yourself.';
      say('Answers shown. Placing is off until you start again.');
      drawAll();
    });
    on($('[data-a="again"]', root), 'click', function () {
      S.st[S.set] = null; S.sel = null; root.classList.remove('has-sel');
      hintEl.hidden = true; drawStage(); drawAll(); say('Started again. Labels shuffled.');
    });
    function setTab(i, focus) {
      S.set = i; S.sel = null; root.classList.remove('has-sel'); hintEl.hidden = true;
      tabs.forEach(function (t, j) { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.tabIndex = j === i ? 0 : -1; });
      $('.ldt-p', root).setAttribute('aria-labelledby', tabs[i].id);
      drawStage(); drawAll();
      if (focus) tabs[i].focus();
    }
    tabs.forEach(function (t, i) {
      on(t, 'click', function () { setTab(i); });
      on(t, 'keydown', function (e) {
        var k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (k === undefined) return;
        e.preventDefault(); setTab((k + tabs.length) % tabs.length, true);
      });
    });
    function setMode(m) {
      S.mode = m; S.sel = null; root.classList.remove('has-sel');
      modes.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === m ? 'true' : 'false'); });
      drawAll();
    }
    modes.forEach(function (b) { on(b, 'click', function () { setMode(b.getAttribute('data-m')); }); });
    on(root, 'keydown', function (e) { if (e.key === 'Escape') cancelSel(); });
    if (!canDrag) modes[0].hidden = true;
    root._ldt = { state: S, src: src, data: D, redraw: function () { drawStage(); drawAll(); }, tab: setTab, mode: setMode };
    setMode(S.mode);
    setTab(0);
  }

  /* ---------------------------------------------------- responsive figures (Ch 6 V5, V13)
     svg[data-wide-vb] holds two layouts: g.lay-n (phone; the static view, also without JS) and g.lay-w (wide screen).
     When the figure is at least data-wide-min px wide, the wide layout and its viewBox are swapped in. */
  function initResp() {
    $$('svg[data-wide-vb]').forEach(function (svg) {
      if (svg.getAttribute('data-resp-on')) return;
      svg.setAttribute('data-resp-on', '1');
      var box = svg.closest('.fig-art') || svg.parentNode, n = $('.lay-n', svg), w = $('.lay-w', svg);
      var vbN = svg.getAttribute('viewBox'), vbW = svg.getAttribute('data-wide-vb'), min = +svg.getAttribute('data-wide-min') || 600;
      if (!n || !w || !box) return;
      var wide = null;
      function fit() {
        var cw = box.clientWidth;
        if (!cw) return;
        var want = cw >= min;
        if (want === wide) return;
        wide = want;
        svg.setAttribute('viewBox', want ? vbW : vbN);
        if (want) { n.setAttribute('display', 'none'); w.removeAttribute('display'); }
        else { w.setAttribute('display', 'none'); n.removeAttribute('display'); }
        svg.classList.toggle('is-wide', want);
      }
      fit();
      if (window.ResizeObserver) new ResizeObserver(fit).observe(box); else on(window, 'resize', fit);
    });
  }

  /* ---------------------------------------------------- virtual labs (Ch 7 V18: practicals 12 and 14)
     svg[data-vl] is the static first view (content/C10-SCI-CH07/diagrams/_src/vlab7.py) + JSON with all wording; the
     drawings are hidden svg.vl-asset[data-key] inside it (microscope, slide images, seeds) and are cloned here. Tap targets
     are read from each drawing's circle.vl-t[data-t] anchors (centre + radius); every target is also a button in a list
     under the image. Lab A: slide tray, Low/High power, Focus slider (sharp only in the middle third), "Find it" tasks,
     observation table. Lab B: seed choice, five steps (soak, cloth, peel, split, find the parts). The figure's
     data-block-id picks the opening lab (data "start"). Nothing is stored. */
  function initVl() {
    $$('svg[data-vl]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-vl-on')) return;
      var D; try { D = JSON.parse(svg.getAttribute('data-vl')); } catch (e) { return; }
      art.setAttribute('data-vl-on', '1');
      vlBuild(art, svg, D);
    });
  }
  function vlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function vlBuild(art, src, D) {
    var NS = 'http://www.w3.org/2000/svg', uid = 'vl' + Math.random().toString(36).slice(2, 7);
    var fig = art.closest('[data-block-id]'), bid = fig ? fig.getAttribute('data-block-id') : '', lab = 'A';
    Object.keys(D.start || {}).forEach(function (k) { if (bid.indexOf(k) >= 0) lab = D.start[k]; });
    var A = D.A, B = D.B, M = D.msgs;
    function btn(cls, txt, attrs) { return '<button type="button" class="' + cls + '"' + (attrs || '') + '>' + vlEsc(txt) + '</button>'; }
    var root = document.createElement('div');
    root.className = 'vl';
    root.innerHTML =
      '<div class="vl-tabs" role="tablist" aria-label="Virtual lab">' +
        '<button type="button" role="tab" class="vl-tab" id="' + uid + '-tA" aria-controls="' + uid + '-pA" data-lab="A">' + vlEsc(A.tab) + '</button>' +
        '<button type="button" role="tab" class="vl-tab" id="' + uid + '-tB" aria-controls="' + uid + '-pB" data-lab="B">' + vlEsc(B.tab) + '</button></div>' +
      '<div class="vl-p" role="tabpanel" id="' + uid + '-pA" aria-labelledby="' + uid + '-tA" data-lab="A">' +
        '<p class="vl-note">' + vlEsc(D.note) + '</p>' +
        '<div class="vl-top"><div class="vl-scope" role="img"></div>' +
          '<div class="vl-fovwrap"><div class="vl-fov vl-box" role="img"><div class="vl-img"></div></div></div></div>' +
        '<div class="vl-ctl">' +
          '<div class="vl-btns vl-slides" role="group" aria-label="Slide tray">' + A.slides.map(function (s, i) { return btn('vl-b', s.name, ' data-i="' + i + '" aria-pressed="false"'); }).join('') + '</div>' +
          '<div class="vl-btns vl-stages" role="group" aria-label="Stage" hidden></div>' +
          '<div class="vl-btns vl-power" role="group" aria-label="Magnification">' + btn('vl-b', A.lo, ' data-p="lo" aria-pressed="true"') + btn('vl-b', A.hi, ' data-p="hi" aria-pressed="false"') + '</div>' +
          '<div class="vl-focus"><label for="' + uid + '-f">' + vlEsc(A.focus) + '</label><input type="range" id="' + uid + '-f" min="0" max="100" step="1" value="10"></div>' +
        '</div>' +
        '<p class="vl-hp" hidden></p><p class="vl-task"></p><p class="vl-fb" hidden></p>' +
        '<div class="vl-btns vl-list" role="group" aria-label="Parts you can tap"></div>' +
        '<p class="vl-safe">' + vlEsc(A.safety) + '</p>' +
        '<div class="vl-obs"><h3 class="vl-h">' + vlEsc(A.obs.title) + '</h3><div class="vl-rows"></div>' + btn('vl-b vl-check', A.obs.check) + '<p class="vl-obs-sum" hidden></p></div>' +
      '</div>' +
      '<div class="vl-p" role="tabpanel" id="' + uid + '-pB" aria-labelledby="' + uid + '-tB" data-lab="B">' +
        '<p class="vl-note">' + vlEsc(D.note) + '</p>' +
        '<div class="vl-btns vl-seeds" role="group" aria-label="Seed">' + B.seeds.map(function (s, i) { return btn('vl-b', s.name, ' data-i="' + i + '" aria-pressed="false"'); }).join('') + '</div>' +
        '<ol class="vl-steps">' + B.steps.map(function (s, i) { return '<li data-s="' + (i + 1) + '"><span class="vl-sn" aria-hidden="true">' + (i + 1) + '</span> ' + vlEsc(s) + '</li>'; }).join('') + '</ol>' +
        '<p class="vl-steptext"></p>' +
        '<div class="vl-seedbox vl-box" role="img"><div class="vl-img"></div></div>' +
        '<div class="vl-btns vl-act">' + btn('vl-b vl-soak', B.soak) + btn('vl-b vl-back', B.back) + btn('vl-b vl-next', B.next) + '</div>' +
        '<p class="vl-task"></p><p class="vl-fb" hidden></p>' +
        '<div class="vl-btns vl-list" role="group" aria-label="Parts you can tap"></div>' +
        '<div class="vl-sum" hidden></div>' +
        '<p class="vl-safe">' + vlEsc(B.safety) + '</p>' +
      '</div>' +
      '<div class="vl-live" aria-live="polite"></div>';
    art.removeChild(src);
    art.appendChild(root);
    var live = $('.vl-live', root), liveT = null, PA = $('[data-lab="A"].vl-p', root), PB = $('[data-lab="B"].vl-p', root);
    function say(msg) { clearTimeout(liveT); live.textContent = ''; liveT = setTimeout(function () { live.textContent = msg; }, 30); }
    function fb(panel, kind, msg) {
      var el = $('.vl-fb', panel);
      el.hidden = false; el.className = 'vl-fb' + (kind ? ' is-' + kind : '');
      el.innerHTML = (kind === 'ok' ? '<span aria-hidden="true">✓ </span>' : kind === 'no' ? '<span aria-hidden="true">✗ </span>' : '') + vlEsc(msg);
      say((kind === 'ok' ? 'Correct. ' : kind === 'no' ? 'Not quite. ' : '') + msg);
    }
    function asset(key) { return src.querySelector('.vl-asset[data-key="' + key + '"]'); }
    function draw(box, key) {
      var a = asset(key), img = $('.vl-img', box) || box, pic = document.createElementNS(NS, 'svg');
      pic.setAttribute('viewBox', a.getAttribute('viewBox')); pic.setAttribute('class', 'vl-pic');
      pic.setAttribute('aria-hidden', 'true'); pic.setAttribute('stroke-linecap', 'round'); pic.setAttribute('stroke-linejoin', 'round');
      Array.prototype.forEach.call(a.childNodes, function (c) { pic.appendChild(c.cloneNode(true)); });
      img.innerHTML = ''; img.appendChild(pic);
      return pic;
    }
    /* target buttons over the image (positions from the drawing's anchors; zoom about the centre) + the list buttons */
    function targets(box, pic, keys, names, zoom, hit) {
      $$('.vl-tg', box).forEach(function (b) { b.parentNode.removeChild(b); });
      var vb = pic.getAttribute('viewBox').split(/\s+/).map(Number), bw = box.clientWidth, bh = box.clientHeight;
      if (!bw) return;
      var k = bw / vb[2], round = box.classList.contains('vl-fov'), R = bw / 2;
      $$('.vl-t', pic).forEach(function (c) {
        var t = c.getAttribute('data-t'); if (keys.indexOf(t) < 0) return;
        var x = (+c.getAttribute('cx') - vb[2] / 2) * k * zoom + bw / 2, y = (+c.getAttribute('cy') - vb[3] / 2) * k * zoom + bh / 2;
        var s = Math.max(44, 2 * c.getAttribute('r') * k * zoom);
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'vl-tg'; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); b.setAttribute('data-t', t);
        b.style.width = b.style.height = s + 'px'; b.style.left = (x - s / 2) + 'px'; b.style.top = (y - s / 2) + 'px';
        if (round && Math.hypot(x - R, y - R) + 18 > R) b.hidden = true;            /* outside the field of view */
        on(b, 'click', function (e) { e.stopPropagation(); hit(t, b); });
        box.appendChild(b);
      });
    }
    function inView(box, t) { return $$('.vl-tg[data-t="' + t + '"]', box).some(function (b) { return !b.hidden; }); }
    function list(panel, keys, names, box, hit) {
      var L = $('.vl-list', panel), seen = {};
      L.innerHTML = '';
      keys.forEach(function (t) {
        if (seen[t]) return; seen[t] = 1;
        var b = document.createElement('button'); b.type = 'button'; b.className = 'vl-b vl-li'; b.textContent = names[t]; b.setAttribute('data-t', t);
        on(b, 'click', function () { hit(t, null); });
        L.appendChild(b);
      });
    }
    function ring(box, t, kind) {
      $$('.vl-tg[data-t="' + t + '"]', box).forEach(function (b) {
        b.classList.remove('is-ok', 'is-no'); void b.offsetWidth; b.classList.add('is-' + kind);
        if (kind === 'no') setTimeout(function () { b.classList.remove('is-no'); }, 900);
      });
    }
    function setPressed(group, i) { $$('.vl-b', group).forEach(function (b, j) { b.setAttribute('aria-pressed', j === i ? 'true' : 'false'); }); }
    /* task runner shared by both labs: tasks = [{q, need, ok, wrong, partial}] */
    function runTask(st, tasks, t, names, panel, box, extraWrong) {
      var task = tasks[st.task];
      if (!task) { fb(panel, '', M.allDone); return; }
      if (task.need.indexOf(t) >= 0) {
        st.got[t] = 1; ring(box, t, 'ok');
        var left = task.need.filter(function (n) { return !st.got[n]; });
        if (left.length) { fb(panel, 'ok', task.partial || task.ok); return 'partial'; }
        st.task++;
        fb(panel, 'ok', task.ok + (tasks[st.task] ? ' Next: ' + tasks[st.task].q + '.' : ''));
        return 'done';
      }
      ring(box, t, 'no');
      fb(panel, 'no', (extraWrong && extraWrong[t]) || (task.wrong && task.wrong[t]) || ('That is the ' + names[t].toLowerCase() + '. ' + task.q + '.'));
      return 'wrong';
    }

    /* ======================== Lab A */
    var SA = { slide: 0, stage: 0, hi: false, task: 0, got: {} };
    var fov = $('.vl-fov', PA), scope = $('.vl-scope', PA), range = $('input[type=range]', PA), picA = null, scopePic = null;
    scopePic = draw(scope, 'scope'); scope.setAttribute('aria-label', asset('scope').getAttribute('aria-label'));
    function focused() { var v = +range.value; return v >= 34 && v <= 66; }
    function slideA() { return A.slides[SA.slide]; }
    function paintA() {
      var s = slideA(), v = +range.value, d = v < 34 ? 34 - v : v > 66 ? v - 66 : 0;
      var img = $('.vl-img', fov);
      img.style.filter = d ? 'blur(' + (1.5 + Math.min(d, 40) * 0.12).toFixed(2) + 'px)' : 'none';
      img.style.transform = SA.hi ? 'scale(2.5)' : 'none';
      fov.setAttribute('aria-label', s.alt[SA.stage] + (d ? ' The image is blurred: not in focus.' : '') + (SA.hi ? ' High power.' : ' Low power.'));
      var kn = $('.vl-knob', scope); if (kn) kn.setAttribute('transform', 'rotate(' + (v * 3.6).toFixed(0) + ' 124 118)');
      setPressed($('.vl-power', PA), SA.hi ? 1 : 0);
      var hp = $('.vl-hp', PA); hp.hidden = !(SA.hi && s.hpNote); hp.textContent = s.hpNote || '';
      var keys = Object.keys(s.targets);
      targets(fov, picA, keys, s.targets, SA.hi ? 2.5 : 1, hitA);
      Object.keys(SA.got).forEach(function (t) { ring(fov, t, 'ok'); });
      $('.vl-task', PA).textContent = s.tasks[SA.task] ? 'Find it: ' + s.tasks[SA.task].q + '.' : M.allDone;
    }
    function hitA(t) {
      var s = slideA();
      if (!focused()) { fb(PA, 'no', M.blur); return; }
      if (!inView(fov, t)) { fb(PA, 'no', M.out); return; }
      runTask(SA, s.tasks, t, s.targets, PA, fov);
      $('.vl-task', PA).textContent = s.tasks[SA.task] ? 'Find it: ' + s.tasks[SA.task].q + '.' : M.allDone;
    }
    function setSlide(i, quiet) {
      SA.slide = i; SA.stage = 0; SA.hi = false; SA.task = 0; SA.got = {}; range.value = 10;
      var s = slideA();
      setPressed($('.vl-slides', PA), i);
      var stg = $('.vl-stages', PA);
      stg.hidden = !s.stageNames;
      stg.innerHTML = (s.stageNames || []).map(function (n, j) { return btn('vl-b', n, ' data-j="' + j + '" aria-pressed="' + (j ? 'false' : 'true') + '"'); }).join('');
      $$('.vl-b', stg).forEach(function (b) { on(b, 'click', function () { SA.stage = +b.getAttribute('data-j'); setPressed(stg, SA.stage); picA = draw(fov, s.stages[SA.stage]); paintA(); say(b.textContent + ' shown.'); }); });
      picA = draw(fov, s.stages[0]);
      list(PA, Object.keys(s.targets), s.targets, fov, hitA);
      $('.vl-fb', PA).hidden = true;
      var sl = $('.vl-slide', scope);
      if (sl) { sl.classList.remove('is-in'); void sl.getBoundingClientRect(); sl.classList.add('is-in'); }
      paintA();
      if (!quiet) say(s.name + ' slide on the stage. Focus it under low power. ' + s.tasks[0].q + '.');
    }
    $$('.vl-slides .vl-b', PA).forEach(function (b) { on(b, 'click', function () { setSlide(+b.getAttribute('data-i')); }); });
    $$('.vl-power .vl-b', PA).forEach(function (b) {
      on(b, 'click', function () {
        var hi = b.getAttribute('data-p') === 'hi';
        if (hi && !focused()) { SA.hi = false; paintA(); fb(PA, 'no', M.hpFirst); return; }
        SA.hi = hi; paintA(); say((hi ? A.hi : A.lo) + '.' + (hi && slideA().hpNote ? ' ' + slideA().hpNote : ''));
      });
    });
    var lastF = null;
    on(range, 'input', function () {
      var f = focused(); paintA();
      if (f !== lastF) { say(f ? 'In focus.' : 'Blurred.'); lastF = f; }
    });
    on(fov, 'click', function (e) {
      if (e.target.closest('.vl-tg')) return;
      fb(PA, 'no', focused() ? M.miss : M.blur);
    });
    /* observation table */
    var rowsEl = $('.vl-rows', PA);
    A.obs.rows.forEach(function (r, i) {
      var order = r.opts.map(function (o, j) { return j; }), rot = i % r.opts.length;
      order = order.slice(rot).concat(order.slice(0, rot));
      var d = document.createElement('div'); d.className = 'vl-orow'; d.setAttribute('data-i', i);
      d.innerHTML = '<p class="vl-oname">' + vlEsc(r.slide) + '</p>' +
        '<label class="vl-ofield"><span>' + vlEsc(A.obs.see) + '</span><select data-k="see"><option value="">— choose —</option>' +
        order.map(function (j) { return '<option value="' + j + '">' + vlEsc(r.opts[j]) + '</option>'; }).join('') + '</select></label>' +
        '<label class="vl-ofield"><span>' + vlEsc(A.obs.method) + '</span><select data-k="method"><option value="">— choose —</option>' +
        A.obs.methods.map(function (m, j) { return '<option value="' + j + '">' + vlEsc(m) + '</option>'; }).join('') + '</select></label>' +
        '<p class="vl-ofb" hidden></p>';
      rowsEl.appendChild(d);
    });
    on($('.vl-check', PA), 'click', function () {
      var good = 0;
      $$('.vl-orow', PA).forEach(function (d) {
        var r = A.obs.rows[+d.getAttribute('data-i')], see = $('select[data-k=see]', d).value, me = $('select[data-k=method]', d).value, out = $('.vl-ofb', d);
        var why = [];
        if (see === '' || me === '') why.push('Choose both answers.');
        else { if (+see !== r.seeOk) why.push(r.whySee); if (+me !== r.methodOk) why.push(r.whyMethod); }
        d.classList.toggle('is-ok', !why.length); d.classList.toggle('is-no', !!why.length);
        out.hidden = false;
        out.innerHTML = why.length ? '<span aria-hidden="true">✗ </span>' + vlEsc(why.join(' ')) : '<span aria-hidden="true">✓ </span>Correct';
        if (!why.length) good++;
      });
      var sum = $('.vl-obs-sum', PA); sum.hidden = false; sum.textContent = good + ' of ' + A.obs.rows.length + ' rows correct.';
      say(sum.textContent);
    });

    /* ======================== Lab B */
    var SB;
    var sbox = $('.vl-seedbox', PB), picB = null;
    function resetB(i) { SB = { seed: i, step: 1, soaked: false, peeled: false, open: false, task: 0, got: {} }; }
    function seedName() { return B.seeds[SB.seed].name; }
    function paintB() {
      var g = function (c) { return $('.' + c, picB); };
      g('vl-bowl').setAttribute('display', SB.step === 1 ? 'inline' : 'none');
      g('vl-cloth').setAttribute('display', SB.step === 2 ? 'inline' : 'none');
      g('vl-closed').setAttribute('display', SB.open ? 'none' : 'inline');
      g('vl-open').setAttribute('display', SB.open ? 'inline' : 'none');
      g('vl-seedg').classList.toggle('is-soaked', SB.soaked);
      g('vl-coat').classList.toggle('is-peeled', SB.peeled);
      $$('.vl-steps li', PB).forEach(function (li) {
        var n = +li.getAttribute('data-s');
        li.classList.toggle('is-cur', n === SB.step); li.classList.toggle('is-done', n < SB.step);
        if (n === SB.step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
      $('.vl-steptext', PB).textContent = 'Step ' + SB.step + ' — ' + B.steps[SB.step - 1] + '. ' + B.texts[SB.step - 1];
      var st = !SB.soaked ? 'dry' : SB.step === 2 ? 'cloth' : SB.open ? 'open' : SB.peeled ? 'peeled' : SB.step === 1 ? 'soaked' : 'coat';
      sbox.setAttribute('aria-label', B.alt[st].replace('{seed}', seedName()));
      $('.vl-soak', PB).hidden = SB.step !== 1;
      $('.vl-back', PB).disabled = SB.step === 1;
      $('.vl-next', PB).disabled = SB.step === 5;
      var keys = SB.step === 3 && !SB.peeled ? ['peel'] : SB.step === 4 && !SB.open ? ['split'] : SB.step === 5 ? ['cot', 'plu', 'rad', 'coat'] : [];
      targets(sbox, picB, keys, B.targets, 1, hitB);
      list(PB, keys, B.targets, sbox, hitB);
      Object.keys(SB.got).forEach(function (t) { ring(sbox, t, 'ok'); });
      var tk = $('.vl-task', PB);
      tk.hidden = SB.step !== 5;
      tk.textContent = B.tasks[SB.task] ? 'Find it: ' + B.tasks[SB.task].q + '.' : '';
      $('.vl-sum', PB).hidden = !(SB.step === 5 && SB.task >= B.tasks.length);
    }
    function hitB(t) {
      if (t === 'peel') { SB.peeled = true; paintB(); fb(PB, 'ok', B.peeled); return; }
      if (t === 'split') {
        if (!SB.peeled) { ring(sbox, 'split', 'no'); fb(PB, 'no', B.noPeel); return; }
        SB.open = true; paintB(); fb(PB, 'ok', B.opened); return;
      }
      if (SB.step !== 5) return;
      runTask(SB, B.tasks, t, B.targets, PB, sbox, { coat: B.coatHint });
      paintB();
      if (SB.task >= B.tasks.length) say($('.vl-sum', PB).textContent);
    }
    function setSeed(i, quiet) {
      resetB(i); setPressed($('.vl-seeds', PB), i);
      picB = draw(sbox, 'seed-' + B.seeds[i].key);
      $('.vl-fb', PB).hidden = true;
      paintB();
      if (!quiet) { fb(PB, '', B.newSeed + ' ' + seedName() + '.'); }
    }
    var sm = B.summary;
    $('.vl-sum', PB).innerHTML = '<h3 class="vl-h">' + vlEsc(sm.title) + '</h3><ul>' + sm.parts.map(function (p) {
      return '<li><b>' + vlEsc(p[0]) + '</b> — ' + vlEsc(p[1]) + '</li>'; }).join('') + '</ul><p>' + vlEsc(sm.dicot) + '</p><p><b>' + vlEsc(sm.draw) + '</b></p>';
    $$('.vl-seeds .vl-b', PB).forEach(function (b) { on(b, 'click', function () { setSeed(+b.getAttribute('data-i')); }); });
    on($('.vl-soak', PB), 'click', function () { SB.soaked = true; paintB(); fb(PB, 'ok', B.soaked); });
    on($('.vl-next', PB), 'click', function () {
      if (SB.step === 1 && !SB.soaked) { fb(PB, 'no', B.noSoak); return; }
      if (SB.step === 4 && !SB.open) { fb(PB, 'no', B.noSplit); return; }
      if (SB.step < 5) { SB.step++; $('.vl-fb', PB).hidden = true; paintB(); say($('.vl-steptext', PB).textContent); }
    });
    on($('.vl-back', PB), 'click', function () { if (SB.step > 1) { SB.step--; $('.vl-fb', PB).hidden = true; paintB(); say($('.vl-steptext', PB).textContent); } });
    /* peel by dragging across the seed (step 3); a press without movement stays a tap */
    var dx0 = null;
    on(sbox, 'pointerdown', function (e) { dx0 = SB.step === 3 && !SB.peeled ? [e.clientX, e.clientY] : null; });
    on(sbox, 'pointermove', function (e) {
      if (!dx0 || e.buttons === 0) return;
      if (Math.abs(e.clientX - dx0[0]) + Math.abs(e.clientY - dx0[1]) > 24) { dx0 = null; hitB('peel'); }
    });
    on(sbox, 'pointerup', function () { dx0 = null; });
    on(sbox, 'click', function (e) {
      if (e.target.closest('.vl-tg')) return;
      if (SB.step === 3 && !SB.peeled) fb(PB, '', B.texts[2]);
      else if (SB.step === 4 && !SB.open) fb(PB, '', B.texts[3]);
      else if (SB.step === 5 && SB.task < B.tasks.length) fb(PB, 'no', M.miss);
    });

    /* ======================== tabs, layout */
    var tabs = $$('.vl-tab', root);
    function setLab(L, focus) {
      tabs.forEach(function (t) { var yes = t.getAttribute('data-lab') === L; t.setAttribute('aria-selected', yes ? 'true' : 'false'); t.tabIndex = yes ? 0 : -1; if (yes && focus) t.focus(); });
      PA.hidden = L !== 'A'; PB.hidden = L !== 'B';
      if (L === 'A') paintA(); else paintB();
    }
    tabs.forEach(function (t, i) {
      on(t, 'click', function () { setLab(t.getAttribute('data-lab')); });
      on(t, 'keydown', function (e) {
        var k = { ArrowRight: 1, ArrowLeft: -1, Home: 0, End: 0 }[e.key];
        if (k === undefined) return;
        e.preventDefault(); setLab(tabs[(i + 1) % 2].getAttribute('data-lab'), true);
      });
    });
    var wide = null, lastW = 0;
    function fit() {
      var w = root.clientWidth; if (!w || w === lastW) return;     /* width only: a height change must not rebuild the
                                                                       target buttons (keyboard focus would be lost) */
      lastW = w;
      var yes = w >= 600;
      if (yes !== wide) { wide = yes; root.classList.toggle('is-wide', yes); }
      if (!PA.hidden) paintA(); if (!PB.hidden) paintB();
    }
    setSlide(0, true); setSeed(0, true);
    setLab(lab);
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(root); else on(window, 'resize', fit);
    root._vl = { A: SA, B: function () { return SB; }, data: D, src: src, lab: setLab };
  }

  /*CHEM-TEX*/var CHEM_TEX = {"t":["<span class=\"katex\">","<span class=\"katex-html\" aria-hidden=\"true\">","<span class=\"base\">","<span class=\"strut\" style=\"height:1em;vertical-align:-0.25em;\">","</span>","<span class=\"mord\">","2","<span class=\"mspace\" style=\"margin-right:0.1667em;\">","<span class=\"mord mathrm\">","Al","<span class=\"mspace\" style=\"margin-right:0.2222em;\">","<span class=\"mbin\">","+","3","CuSO","<span class=\"mord rlap\">","<span class=\"inner\">","<span class=\"mord\" style=\"color:transparent;\">","<span class=\"mord mathnormal\" style=\"margin-right:0.07847em;color:transparent;\">","X","<span class=\"fix\">","<span class=\"msupsub\">","<span class=\"vlist-t vlist-t2\">","<span class=\"vlist-r\">","<span class=\"vlist\" style=\"height:-0.15em;\">","<span style=\"top:-2.55em;margin-right:0.05em;\">","<span class=\"pstrut\" style=\"height:2.7em;\">","<span class=\"sizing reset-size6 size3 mtight\">","<span class=\"mord mtight\">","<span class=\"vlist-t\">","<span class=\"vlist\" style=\"height:0em;\">","<span style=\"top:-2.7em;\">","<span>","4","<span class=\"vlist-s\">","​","<span class=\"vlist\" style=\"height:0.15em;\">","<span class=\"mspace\" style=\"margin-right:0.2778em;\">","<span class=\"mrel x-arrow\">","<span class=\"vlist\" style=\"height:0.622em;\">","<span style=\"top:-3.144em;\">","<span class=\"pstrut\" style=\"height:2.522em;\">","<span class=\"sizing reset-size6 size3 mtight x-arrow-pad\">","<span class=\"svg-align\" style=\"top:-2.511em;\">","<span class=\"hide-tail\" style=\"height:0.522em;min-width:1.469em;\">","<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400em\" height=\"0.522em\" viewBox=\"0 0 400000 522\" preserveAspectRatio=\"xMaxYMin slice\">","<path d=\"M0 241v40h399891c-47.3 35.3-84 78-110 128\n-16.7 32-27.7 63.7-33 95 0 1.3-.2 2.7-.5 4-.3 1.3-.5 2.3-.5 3 0 7.3 6.7 11 20\n 11 8 0 13.2-.8 15.5-2.5 2.3-1.7 4.2-5.5 5.5-11.5 2-13.3 5.7-27 11-41 14.7-44.7\n 39-84.5 73-119.5s73.7-60.2 119-75.5c6-2 9-5.7 9-11s-3-9-9-11c-45.3-15.3-85\n-40.5-119-75.5s-58.3-74.8-73-119.5c-4.7-14-8.3-27.3-11-40-1.3-6.7-3.2-10.8-5.5\n-12.5-2.3-1.7-7.5-2.5-15.5-2.5-14 0-21 3.7-21 11 0 2 2 10.3 6 25 20.7 83.3 67\n 151.7 139 205zm0 0v40h399900v-40z\"/>","</svg>","<span class=\"vlist\" style=\"height:0.011em;\">","<span class=\"mopen\">","(","SO","<span class=\"mclose\">",")","Cu","FeSO","Fe","<span class=\"strut\" style=\"height:0.8444em;vertical-align:-0.15em;\">","H","O","Pb","NO","ZnSO","Zn","6","HCl","AlCl","<span class=\"strut\" style=\"height:0.8333em;vertical-align:-0.15em;\">","Ca","CaO","CuO","<span class=\"strut\" style=\"height:0.8778em;vertical-align:-0.1944em;\">","<span class=\"mord mathrm\" style=\"margin-right:0.01389em;\">","Hg","HgO","K","KOH","KCl","Mg","MgO","Na","NaOH","NaCl","PbO","ZnO","MgSO","AgNO","Ag","OH","CaCl","CaSO","FeCl","<span class=\"strut\" style=\"height:0.8889em;vertical-align:-0.1944em;\">","MgCl","HNO","PbCl","PbSO","ZnCl","CH","C","−","8","10","5","12","<span class=\"mrel\">","=","<span class=\"strut\" style=\"height:0.6833em;\">","HC","≡","Cl","7","9","11","Br","<span class=\"strut\" style=\"height:0.7667em;vertical-align:-0.0833em;\">","CHO","CO","COOH"],"r":"ĄĄŷŷŷĄŸŸĚĄĜĜąąĖėĢģſŷƀėŽďƂĐƃđƄĒƅēƆŹƇĔƈŹƉĕƊžƋĘƌęƍŻƎěƏżƐĝƑėƒĞƓğƔŻƕĠƖżźŸƘƁƙĤƚĠŸŷĄąƛƜŷƗŷąĄĊĈŢƝĈƢƟĀāƥĂŽŤĄƗƧƠĆƞĄŽĩĄƩƤơĄƮċƯČươƱƝčƞƦŃĄćƛźƶŷƭƪĈĺƹƨŸĄĆƵƴƫƠƲĥĄƿĦǀžǁħǂĨǃƬǄĪǅĜǆŹǇīǈƬǉĬǊĭǋĮǌįǍŹǎƁǏİǐĠǑƻǒĥġƞƤƳƼƣąƲĄƺĈĻƟǔƨƪǓƣıĲǝƣĴĵƸƸĆƷƣţƦăǣƫčƷƽǕŷǞƭǥƝǖƩĈƴǢƟƳǘǡƦĹǫƨčƵąĈǮƫƝǰǚǜǘƪǧĽǶǬǷǟňŎǚǗƟƪǸǛǓǩŷǟƸǨƩƢƾǩƝƼǙƻǦǠǤǕȀǧǾĄƾƣƸǪǳƣǱĳĄǙȌǛƽĈǼǗŧƞŮƜŲƜĉƾƨƳƝňȅȆǵǙȗĄǵȋŁŷȍǽǙƨǤĈƽƤǛƺǔƺȐƺǖȓĉǻȔǗșǴƾțƦŇȧƫǺǭŖǬȕŗȫƜǗǭǺƣǫȟǯƳȰƺǯȠǯȡŷĈȴţǦǪƞȃĈŋƾǭƝǹȁȚƾȥǲĈȁȪȏȂȿȬȞƪũŪɂƠǠǨũŭǲǕƞǱȇǿǤȢĎǴȣǞɋĳɌǚɍǟĶƜȘǜƽǖĄȸġƵȻǜǻȭȨǹɃƢɗŷɅȵəĄǦȉŘƜŴƜȜǡŶƜɉȊɎȤļǼļƜɒƝɤƲƾȂġƷȾǜȈɊȮɏǤǹǓȺȎĿɁąŬƠǮǢǠǪȄǪȄȉŵŷɡȊķǴĸƜǳǭƼɥȈɢȏƣɻɣȽļŀƷťƷɮɘȳŦȎɯʂɚɇȑȖŮȇǨȇɄȅƸʈȆɇȒȖŲȖŘȶɴƞɞ","s":["ɠɊɵɏ","ɠɶɵɷ","ǲȢǳɐȣǙȤɸ","ɉǳȥɡɸ","ɠɢǽĉǸȤȊɣ","ɠľǴɵĿƜ","ǲȢƝŀƵƣȚǽłǬǗɸ","ɑńȦŅƜ","ɑĶȦņƜ","ȨƼȕŉȦŊƜ","ƽɹȂȘǽŌȹ","ǲɹǩȚǽōȹ","ƽɹșǚǒƿȸǛȋȩ","ȨƼȺȦŏƜ","ɑŐɦȘǽőȹ","ǲǖŐȻǽŒȹ","ɑŐȼŐǻȋȩ","ǲǖļȦœƜ","ɑĿȦŔƜ","ƽǰƣĸɦȍǜĸǬȜɧ","ƽǰƣĸƾƝɓɐĸǬȜǔǗƝɓǭ","ǤǰȺȈɎȔǓȊŕǺǩĉƜ","ǲɓƣȓǳțȣȜǥ","ƽɓɥȍǓȂɒǛȃ","ƽɓƣŐȦŐǻȃ","ȝȓȊȪǜĉǸȤǳȬ","ȝńɦɐńǧŘǾǛȭ","Ƚńɔřɕ","ȎńȼŚȩ","ȝĶɨĶɀ","ȝĸɨĸɀ","Ƚĸɔśɕ","Ȏĸɩķɪ","Ȏĸȼķȩ","ȝĸɺǜĸɼ","ǤňŉȾǓȕŉɀ","ɫȾɬɀ","ɫɦȘɬǧŘǾǛȭ","ƦŜƫǹɔŝɕ","ɫȁŞǬɬȏǭ","ɖɩŕɪ","ɖȈɶŕȮɷ","ɖƾɐŏȹ","ɖȼŕȩ","ɫɺɬɼ","ɖȈľǴŕȮĿƜ","ȝļɨļɀ","ɽɔşɕ","ɽɩŠɪ","ɽȼŠȩ","ȝĿɨĿɀ","ȽĿɔšɕ","ɭɩľɪ","ɭȈɶľȮɷ","ɭƾɐŔȹ","ɭȼľȩ","ȝĿɺǜĿɼ","Ȟɧ","ȯɾ","ǦǨ","ȱɿ","Ǧǿ","ȲŦƷ","ȄǨ","ȳŨƷ","Ȅǿ","ȯɧ","ɮɃƤǡ","ȱɾ","ʀǨ","Ȳɿ","ʀǿ","ǦȀƠɘǨ","ʁƷ","ʀɄ","ǦȀƠɘǿ","ȯǡ","ƦūƫĈɯɅƠƢƜ","ȱɧ","ʃǨ","Ȳɾ","ʃǿ","ǦƧȵƝɚǨ","ȳɿ","ʃɄ","ǦƧȵƝɚǿ","ɆǱȑ","ɆǪȑ","ɰȟȐǱȑ","Ɇȉȑ","ɰȔƺůʄ","Ɇɱȑ","ʅʆ","ɰƨȠŰʄ","ɆǠȉȑ","ʅɈ","ɰƨȡűʄ","ɆǠɱȑ","ʅʇ","ʉŮɈ","ǦǱȒ","ȶȒ","ȯȐǱȒ","ɛȒ","ȱůʊ","ɲȒ","ʋʆ","ȲŰʊ","ɳȒ","ʋɈ","ȳűʊ","ȄɱȒ","ʋʇ","ʉŲɈ","Ȟǔȃ","ȶɜ","ȯŀȷ","ɛɜ","ȱťȷ","ɲɜ","ʌʆ","ȲŦȷ","ɳɜ","ʌɈ","ȳŨȷ","Ȅɱɜ","ʌʇ","ʉŘɈ","Ɂȃ","ƦųƣĺĄǪɝ","ȯǔȃ","ȶɝ","ȱŀȷ","ɛɝ","Ȳťȷ","ɲɝ","ʁȷ","ɳɝ","ʍǨ","ʍǿ","ʍɄ","ɛɴǿ","Ɂɞ","ƦųƣĺĄǪɟ","ȯǔɞ","ȶɟ","ȱŀʎ","ɛɟ","Ȳťʎ","ɲɟ","ʁʎ","ɳɟ"],"k":["\\ce{2Al + 3CuSO4 -> Al2(SO4)3 + 3Cu}","\\ce{2Al + 3FeSO4 -> Al2(SO4)3 + 3Fe}","\\ce{2Al + 3H2O -> Al2O3 + 3H2}","\\ce{2Al + 3H2SO4 -> Al2(SO4)3 + 3H2}","\\ce{2Al + 3Pb(NO3)2 -> 2Al(NO3)3 + 3Pb}","\\ce{2Al + 3ZnSO4 -> Al2(SO4)3 + 3Zn}","\\ce{2Al + 6HCl -> 2AlCl3 + 3H2}","\\ce{2Ca + O2 -> 2CaO}","\\ce{2Cu + O2 -> 2CuO}","\\ce{2Hg + O2 -> 2HgO}","\\ce{2K + 2H2O -> 2KOH + H2}","\\ce{2K + 2HCl -> 2KCl + H2}","\\ce{2K + H2SO4 -> K2SO4 + H2}","\\ce{2Mg + O2 -> 2MgO}","\\ce{2Na + 2H2O -> 2NaOH + H2}","\\ce{2Na + 2HCl -> 2NaCl + H2}","\\ce{2Na + H2SO4 -> Na2SO4 + H2}","\\ce{2Pb + O2 -> 2PbO}","\\ce{2Zn + O2 -> 2ZnO}","\\ce{3Fe + 2O2 -> Fe3O4}","\\ce{3Fe + 4H2O -> Fe3O4 + 4H2}","\\ce{3Mg + Al2(SO4)3 -> 3MgSO4 + 2Al}","\\ce{4Al + 3O2 -> 2Al2O3}","\\ce{4K + O2 -> 2K2O}","\\ce{4Na + O2 -> 2Na2O}","\\ce{Al + 3AgNO3 -> Al(NO3)3 + 3Ag}","\\ce{Ca + 2H2O -> Ca(OH)2 + H2}","\\ce{Ca + 2HCl -> CaCl2 + H2}","\\ce{Ca + H2SO4 -> CaSO4 + H2}","\\ce{Cu + 2AgNO3 -> Cu(NO3)2 + 2Ag}","\\ce{Fe + 2AgNO3 -> Fe(NO3)2 + 2Ag}","\\ce{Fe + 2HCl -> FeCl2 + H2}","\\ce{Fe + CuSO4 -> FeSO4 + Cu}","\\ce{Fe + H2SO4 -> FeSO4 + H2}","\\ce{Fe + Pb(NO3)2 -> Fe(NO3)2 + Pb}","\\ce{Hg + 2AgNO3 -> Hg(NO3)2 + 2Ag}","\\ce{Mg + 2AgNO3 -> Mg(NO3)2 + 2Ag}","\\ce{Mg + 2H2O -> Mg(OH)2 + H2}","\\ce{Mg + 2HCl -> MgCl2 + H2}","\\ce{Mg + 2HNO3 -> Mg(NO3)2 + H2}","\\ce{Mg + CuSO4 -> MgSO4 + Cu}","\\ce{Mg + FeSO4 -> MgSO4 + Fe}","\\ce{Mg + H2O -> MgO + H2}","\\ce{Mg + H2SO4 -> MgSO4 + H2}","\\ce{Mg + Pb(NO3)2 -> Mg(NO3)2 + Pb}","\\ce{Mg + ZnSO4 -> MgSO4 + Zn}","\\ce{Pb + 2AgNO3 -> Pb(NO3)2 + 2Ag}","\\ce{Pb + 2HCl -> PbCl2 + H2}","\\ce{Pb + CuSO4 -> PbSO4 + Cu}","\\ce{Pb + H2SO4 -> PbSO4 + H2}","\\ce{Zn + 2AgNO3 -> Zn(NO3)2 + 2Ag}","\\ce{Zn + 2HCl -> ZnCl2 + H2}","\\ce{Zn + CuSO4 -> ZnSO4 + Cu}","\\ce{Zn + FeSO4 -> ZnSO4 + Fe}","\\ce{Zn + H2O -> ZnO + H2}","\\ce{Zn + H2SO4 -> ZnSO4 + H2}","\\ce{Zn + Pb(NO3)2 -> Zn(NO3)2 + Pb}","\\ce{CH4}","\\ce{C2H6}","\\ce{CH3-CH3}","\\ce{C3H8}","\\ce{CH3-CH2-CH3}","\\ce{C4H10}","\\ce{CH3-CH2-CH2-CH3}","\\ce{C5H12}","\\ce{CH3-CH2-CH2-CH2-CH3}","\\ce{C2H4}","\\ce{CH2=CH2}","\\ce{C3H6}","\\ce{CH2=CH-CH3}","\\ce{C4H8}","\\ce{CH2=CH-CH2-CH3}","\\ce{CH3-CH=CH-CH3}","\\ce{C5H10}","\\ce{CH2=CH-CH2-CH2-CH3}","\\ce{CH3-CH=CH-CH2-CH3}","\\ce{C2H2}","\\ce{HC#CH}","\\ce{C3H4}","\\ce{HC#C-CH3}","\\ce{C4H6}","\\ce{HC#C-CH2-CH3}","\\ce{CH3-C#C-CH3}","\\ce{C5H8}","\\ce{HC#C-CH2-CH2-CH3}","\\ce{CH3-C#C-CH2-CH3}","\\ce{CH3Cl}","\\ce{CH3-Cl}","\\ce{C2H5Cl}","\\ce{CH3-CH2-Cl}","\\ce{C3H7Cl}","\\ce{CH3-CH2-CH2-Cl}","\\ce{CH3-CH(Cl)-CH3}","\\ce{C4H9Cl}","\\ce{CH3-CH2-CH2-CH2-Cl}","\\ce{CH3-CH(Cl)-CH2-CH3}","\\ce{C5H11Cl}","\\ce{CH3-CH2-CH2-CH2-CH2-Cl}","\\ce{CH3-CH(Cl)-CH2-CH2-CH3}","\\ce{CH3-CH2-CH(Cl)-CH2-CH3}","\\ce{CH3Br}","\\ce{CH3-Br}","\\ce{C2H5Br}","\\ce{CH3-CH2-Br}","\\ce{C3H7Br}","\\ce{CH3-CH2-CH2-Br}","\\ce{CH3-CH(Br)-CH3}","\\ce{C4H9Br}","\\ce{CH3-CH2-CH2-CH2-Br}","\\ce{CH3-CH(Br)-CH2-CH3}","\\ce{C5H11Br}","\\ce{CH3-CH2-CH2-CH2-CH2-Br}","\\ce{CH3-CH(Br)-CH2-CH2-CH3}","\\ce{CH3-CH2-CH(Br)-CH2-CH3}","\\ce{CH4O}","\\ce{CH3-OH}","\\ce{C2H6O}","\\ce{CH3-CH2-OH}","\\ce{C3H8O}","\\ce{CH3-CH2-CH2-OH}","\\ce{CH3-CH(OH)-CH3}","\\ce{C4H10O}","\\ce{CH3-CH2-CH2-CH2-OH}","\\ce{CH3-CH(OH)-CH2-CH3}","\\ce{C5H12O}","\\ce{CH3-CH2-CH2-CH2-CH2-OH}","\\ce{CH3-CH(OH)-CH2-CH2-CH3}","\\ce{CH3-CH2-CH(OH)-CH2-CH3}","\\ce{CH2O}","\\ce{H-CHO}","\\ce{C2H4O}","\\ce{CH3-CHO}","\\ce{C3H6O}","\\ce{CH3-CH2-CHO}","\\ce{C4H8O}","\\ce{CH3-CH2-CH2-CHO}","\\ce{C5H10O}","\\ce{CH3-CH2-CH2-CH2-CHO}","\\ce{CH3-CO-CH3}","\\ce{CH3-CO-CH2-CH3}","\\ce{CH3-CO-CH2-CH2-CH3}","\\ce{CH3-CH2-CO-CH2-CH3}","\\ce{CH2O2}","\\ce{H-COOH}","\\ce{C2H4O2}","\\ce{CH3-COOH}","\\ce{C3H6O2}","\\ce{CH3-CH2-COOH}","\\ce{C4H8O2}","\\ce{CH3-CH2-CH2-COOH}","\\ce{C5H10O2}","\\ce{CH3-CH2-CH2-CH2-COOH}"]};/*END-CHEM-TEX*/
  var chemMemo = {};
  function chemTex(i) {
    /* KaTeX + mhchem HTML pre-rendered at build time (content/C10-SCI-CH03/diagrams/_src/chem_tex.py): tokens + merged pairs */
    if (chemMemo[i] != null) return chemMemo[i];
    var d = CHEM_TEX, nt = d.t.length, base = 0x100;
    function code(c) { var n = c.charCodeAt(0); return n - base - (n > 0xDFFF ? 0x800 : 0) - (n > 0x2029 ? 2 : 0); }
    function ex(c) {
      var k = code(c);
      if (k < nt) return d.t[k];
      k = (k - nt) * 2;
      return ex(d.r.charAt(k)) + ex(d.r.charAt(k + 1));
    }
    var s = d.s[i], out = '';
    for (var j = 0; j < s.length; j++) out += ex(s.charAt(j));
    return (chemMemo[i] = out);
  }

  /* ---------------------------------------------------- similarity explorer (Maths Ch 6, T03-V8)
     svg[data-sx] is the static first view (content/C10-MATH-CH06/diagrams, _src/tri_b.py v8); initSx replaces it.
     Topic 3 and the revision pack open in "Parallel line" mode; Topic 4 (figure block id …-T04.…) opens in "Scale" mode.
     Mode 1: D = A + (k/12)(B − A); E is the intersection of AC with the line through D parallel to BC (computed, not taken
     from k). AD : DB is k : (12 − k) reduced; AE : EC is read from the drawn lengths and matched to the nearest p/q with
     q ≤ 12 (checked to 1e-9). Decimals are rounded half-up from the reduced fraction with integers only. Mode 2: copy sides
     are q × side / 4 (exact quarters); angles from the cosine rule, shown to 0.1° by the largest-remainder rule (sum 180.0°).
     The drawing uses real pixels (viewBox = container size) so the label-collision rule works in px. Nothing is stored. */
  var SX_TRI = [['acute', [2, 6], [0, 0], [8, 0]], ['obtuse', [-2, 5], [0, 0], [9, 0]], ['right', [6, 7], [0, 0], [6, 0]]];
  var SX_BASE = [['4, 5, 6', [4, 5, 6]], ['3, 4, 5', [3, 4, 5]], ['5, 5, 8', [5, 5, 8]]];   /* BC, CA, AB (AB longest) */
  var SX_NOTE = 'D must lie strictly between A and B: at A there is no triangle ADE, and at B the piece DB is 0, so AD/DB has no value.';
  var SX_NOTE_E = 'E must lie strictly between A and C: at A there is no triangle ADE, and at C the piece EC is 0, so AE/EC has no value.';
  function sxRed(p, q) { var g = mGcd(p, q) || 1; return [p / g, q / g]; }
  function sxDec(p, q) {               /* p/q rounded half-up to 2 decimal places, integers only */
    var h = Math.floor((200 * p + q) / (2 * q)), c = h % 100;
    return Math.floor(h / 100) + '.' + (c < 10 ? '0' : '') + c;
  }
  function sxNear(r) {                 /* nearest p/q (q ≤ 12) to r, in lowest terms */
    var best = null;
    for (var q = 1; q <= 12; q++) {
      var p = Math.round(r * q), e = Math.abs(p / q - r);
      if (!best || e < best.e - 1e-15) best = { p: p, q: q, e: e };
    }
    var f = sxRed(best.p, best.q);
    return { p: f[0], q: f[1], e: best.e };
  }
  function sxAngles(s) {               /* s = [BC, CA, AB]; angles at A, B, C in tenths of a degree, summing to 1800 */
    var a = s[0], b = s[1], c = s[2];
    var d = [Math.acos((b * b + c * c - a * a) / (2 * b * c)), Math.acos((a * a + c * c - b * b) / (2 * a * c)), Math.acos((a * a + b * b - c * c) / (2 * a * b))]
      .map(function (x) { return x * 1800 / Math.PI; });
    var f = d.map(Math.floor), left = 1800 - f[0] - f[1] - f[2];
    var order = [0, 1, 2].sort(function (i, j) { return (d[j] - f[j]) - (d[i] - f[i]) || i - j; });
    for (var i = 0; i < left; i++) f[order[i]]++;
    return f;
  }
  function sxTenths(t) { return Math.floor(t / 10) + '.' + (t % 10) + '°'; }
  function sxQ(n) {                    /* n quarters -> exact decimal string (at most 2 decimals) */
    var w = Math.floor(n / 4), r = n % 4;
    return w + ['', '.25', '.5', '.75'][r];
  }
  function initSx() {
    $$('svg[data-sx="explorer"]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-sx-on')) return;
      art.setAttribute('data-sx-on', '1');
      var fig = svg.closest('.fig'), t4 = /-T04\./.test(fig ? fig.getAttribute('data-block-id') || '' : '');
      sxBuild(art, t4 ? 'scale' : 'par');
    });
  }
  function sxBuild(art, mode0) {
    var uid = 'sx' + Math.random().toString(36).slice(2, 7);
    var S = { mode: mode0, tri: 0, k: 4, j: 4, unlock: false, base: 0, q: 6, noteD: false, noteE: false };
    var INK = 'var(--ink, #1F2328)', SOFT = 'var(--ink-soft, #57554D)', CARD = 'var(--card, #FFF)';
    var C1 = 'var(--dg-m-opp, #C2410C)', C2 = 'var(--dg-m-adj, #1D5FBF)', C1BG = 'var(--dg-m-opp-bg, #FCE7DA)', NO = 'var(--wrong, #8A2B0E)';
    var root = document.createElement('div');
    root.className = 'sx';
    function slider(cls, lab, min, max, step) {
      return '<div class="sx-c ' + cls + '"><label class="sx-lab" for="' + uid + '-' + cls + '">' + lab + '</label>' +
        '<input class="sx-range" type="range" role="slider" id="' + uid + '-' + cls + '" min="' + min + '" max="' + max + '" step="' + step + '">' +
        '<output class="sx-out" for="' + uid + '-' + cls + '"></output></div>';
    }
    root.innerHTML =
      '<div class="sx-seg" role="group" aria-label="Mode"><button type="button" class="sx-m" data-m="par" aria-pressed="false">Parallel line</button>' +
      '<button type="button" class="sx-m" data-m="scale" aria-pressed="false">Scale</button></div>' +
      '<svg class="sx-svg" role="group" aria-labelledby="' + uid + '-t"><title id="' + uid + '-t"></title><defs>' +
      '<pattern id="' + uid + '-h" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(-45)">' +
      '<path d="M0,0 L0,7" stroke="' + C2 + '" stroke-width="1.3"/></pattern></defs><g class="sx-g"></g></svg>' +
      '<div class="sx-p1">' +
      '<p class="sx-hint">drag D</p>' +
      '<div class="sx-read" aria-live="polite"><div class="sx-rows">' +
      '<p class="sx-r sx-rd"><span class="sx-k">AD : DB</span><b class="sx-v"></b><span class="sx-dec"></span></p>' +
      '<p class="sx-r sx-re"><span class="sx-k">AE : EC</span><b class="sx-v"></b><span class="sx-dec"></span></p></div>' +
      '<p class="sx-st"></p><p class="sx-note" hidden></p><p class="sx-leg" hidden></p></div>' +
      '<div class="sx-chips" role="group" aria-label="Triangle">' + SX_TRI.map(function (t, i) {
        return '<button type="button" class="sx-chip sx-tc" data-i="' + i + '" aria-pressed="false">' + t[0] + '</button>';
      }).join('') + '</div>' +
      '<div class="sx-ctl">' + slider('sx-sd', 'AD : DB', 1, 11, 1) +
      '<div class="sx-tg"><button type="button" class="fig-toggle sx-unlock" aria-pressed="false">unlock E</button></div>' +
      slider('sx-se', 'AE : EC', 1, 11, 1) + '</div></div>' +
      '<div class="sx-p2">' +
      '<div class="sx-read2" aria-live="polite"><p class="sx-cap"></p>' +
      '<table class="sx-t"><thead><tr><th scope="col">side</th><th scope="col">base</th><th scope="col">copy</th><th scope="col">copy ÷ base</th></tr></thead><tbody class="sx-ts"></tbody></table>' +
      '<table class="sx-t sx-ta"><thead><tr><th scope="col">angle</th><th scope="col">base</th><th scope="col">copy</th></tr></thead><tbody class="sx-tan"></tbody></table>' +
      '<p class="sx-unch">angles unchanged</p></div>' +
      '<div class="sx-chips" role="group" aria-label="Base triangle (sides)">' + SX_BASE.map(function (t, i) {
        return '<button type="button" class="sx-chip sx-bc" data-i="' + i + '" aria-pressed="false">' + t[0] + '</button>';
      }).join('') + '</div>' +
      '<div class="sx-ctl">' + slider('sx-sk', 'scale factor <i>k</i>', 0.25, 3, 0.25) + '</div></div>';
    art.innerHTML = '';
    art.appendChild(root);
    var q = function (c) { return $('.' + c, root); }, svg = q('sx-svg'), g = q('sx-g');
    var rD = $('.sx-sd .sx-range', root), rE = $('.sx-se .sx-range', root), rK = $('.sx-sk .sx-range', root);
    var cv = document.createElement('canvas').getContext('2d');
    function ts() { var f = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; return f / 16; }
    function tw(s, sz) { if (!cv) return s.length * sz * 0.62; cv.font = '600 ' + sz + 'px Lexend, sans-serif'; return cv.measureText(s).width; }
    function f1(v) { return v.toFixed(1); }
    function P(d, st, o) {
      o = o || {};
      return '<path d="' + d + '" fill="' + (o.fill || 'none') + '" stroke="' + (st || INK) + '" stroke-width="' + (o.sw || 2.2) + '"' +
        (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + (o.cls ? ' class="' + o.cls + '"' : '') + ' stroke-linecap="round" stroke-linejoin="round"/>';
    }
    function T(x, y, s, sz, o) {
      o = o || {};
      return '<text x="' + f1(x) + '" y="' + f1(y) + '" font-family="' + (o.fam || 'Lexend, sans-serif') + '" font-size="' + sz.toFixed(1) + '"' +
        (o.bold === false ? '' : ' font-weight="600"') + ' text-anchor="middle" fill="' + (o.fill || INK) + '"' + (o.cls ? ' class="' + o.cls + '"' : '') +
        (o.name ? ' data-name="' + o.name + '"' : '') + '>' + s + '</text>';
    }
    function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], n = Math.sqrt(dx * dx + dy * dy) || 1; return [dx / n, dy / n]; }
    function dist(a, b) { return Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])); }
    function sup(hw, hh, n) { return hw * Math.abs(n[0]) + hh * Math.abs(n[1]); }
    function hit(a, b) { return a && b && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
    function lbox(s, c, sz) { var hw = (tw(s, sz) + 4) / 2, hh = 8 * sz / 14; return { s: s, cx: c[0], cy: c[1], x0: c[0] - hw, x1: c[0] + hw, y0: c[1] - hh, y1: c[1] + hh, hw: hw, hh: hh, sz: sz }; }
    function move(b, n, d) { b.cx += n[0] * d; b.cy += n[1] * d; b.x0 += n[0] * d; b.x1 += n[0] * d; b.y0 += n[1] * d; b.y1 += n[1] * d; }
    function vlab(s, v, n1, n2, sz) {           /* vertex label: outward bisector, 14 px (more only if the box would touch the vertex) */
      var u1 = unit(v, n1), u2 = unit(v, n2), b = [-(u1[0] + u2[0]), -(u1[1] + u2[1])], nb = Math.sqrt(b[0] * b[0] + b[1] * b[1]) || 1;
      b = [b[0] / nb, b[1] / nb];
      var x = lbox(s, v, sz), d = Math.max(14, sup(x.hw, x.hh, b) + 3);
      move(x, b, d);
      return x;
    }
    function plab(s, p, a, c, away, sz, d0) {    /* point label on the outward normal of the segment ac */
      var u = unit(a, c), n = [-u[1], u[0]];
      if ((away[0] - p[0]) * n[0] + (away[1] - p[1]) * n[1] > 0) n = [-n[0], -n[1]];
      var x = lbox(s, p, sz);
      move(x, n, Math.max(d0, sup(x.hw, x.hh, n) + 2));
      x.n = n;
      return x;
    }
    function chevron(p, u, sz) {
      var n = [-u[1], u[0]], tip = [p[0] + u[0] * sz * 0.5, p[1] + u[1] * sz * 0.5];
      return 'M' + f1(tip[0] - u[0] * sz + n[0] * sz * 0.75) + ',' + f1(tip[1] - u[1] * sz + n[1] * sz * 0.75) + ' L' + f1(tip[0]) + ',' + f1(tip[1]) +
        ' L' + f1(tip[0] - u[0] * sz - n[0] * sz * 0.75) + ',' + f1(tip[1] - u[1] * sz - n[1] * sz * 0.75);
    }
    function arcs(v, a, b, n, r, col, gap) {
      var a1 = Math.atan2(a[1] - v[1], a[0] - v[0]), a2 = Math.atan2(b[1] - v[1], b[0] - v[0]);
      var d = ((a2 - a1 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI, sw = d > 0 ? 1 : 0, out = '';
      for (var i = 0; i < n; i++) {
        var rr = r + i * (gap || 3.5);
        out += P('M' + f1(v[0] + rr * Math.cos(a1)) + ',' + f1(v[1] + rr * Math.sin(a1)) + ' A' + f1(rr) + ',' + f1(rr) + ' 0 0 ' + sw + ' ' +
          f1(v[0] + rr * Math.cos(a1 + d)) + ',' + f1(v[1] + rr * Math.sin(a1 + d)), col || INK, { sw: 1.6 });
      }
      return out;
    }
    /* ---------------------------------------------------------------- mode 1 geometry (world, then px) */
    function geo1(W, H) {
      var t = SX_TRI[S.tri], A = t[1], B = t[2], C = t[3];
      var xs = [A[0], B[0], C[0]], ys = [A[1], B[1], C[1]];
      var mx = Math.min.apply(0, xs), Mx = Math.max.apply(0, xs), my = Math.min.apply(0, ys), My = Math.max.apply(0, ys);
      var s = Math.min((W - 48) / (Mx - mx), (H - 48) / (My - my));
      var ox = 24 + ((W - 48) - (Mx - mx) * s) / 2, oy = 24 + ((H - 48) - (My - my) * s) / 2;
      function X(p) { return [ox + (p[0] - mx) * s, oy + (My - p[1]) * s]; }
      var D = [A[0] + S.k / 12 * (B[0] - A[0]), A[1] + S.k / 12 * (B[1] - A[1])];
      /* E: AC met with the line through D parallel to BC */
      var r = [C[0] - A[0], C[1] - A[1]], v = [C[0] - B[0], C[1] - B[1]], w = [D[0] - A[0], D[1] - A[1]];
      var tt = (w[0] * v[1] - w[1] * v[0]) / (r[0] * v[1] - r[1] * v[0]);
      var Ep = [A[0] + tt * r[0], A[1] + tt * r[1]];
      var E = S.unlock ? [A[0] + S.j / 12 * r[0], A[1] + S.j / 12 * r[1]] : Ep;
      return { A: A, B: B, C: C, D: D, E: E, Ep: Ep, X: X, s: s };
    }
    function ratios(G) {
      var rd = sxRed(S.k, 12 - S.k), ae = dist(G.A, G.E), ec = dist(G.E, G.C), n = sxNear(ae / ec), ok = n.e < 1e-9;
      if (!ok && window.console) console.error('similarity explorer: AE/EC = ' + (ae / ec) + ' is not a fraction with denominator ≤ 12');
      return { rd: rd, re: [n.p, n.q], ok: ok, val: ae / ec, eq: ok && n.p * rd[1] === n.q * rd[0] };
    }
    function draw1() {
      var W = Math.max(200, Math.round(root.clientWidth)), H = Math.min(Math.round(0.75 * W), 420), sc = ts(), sz = 14 * sc;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
      var G = geo1(W, H), a = G.X(G.A), b = G.X(G.B), c = G.X(G.C), d = G.X(G.D), e = G.X(G.E), ep = G.X(G.Ep), r = ratios(G);
      var par = !S.unlock || S.j === S.k, out = '', legend = [];
      /* labels: vertices, then D and E with the collision rule */
      var LA = vlab('A', a, b, c, sz), LB = vlab('B', b, a, c, sz), LC = vlab('C', c, a, b, sz);
      var LD = plab('D', d, a, b, c, sz, 12), LE = plab('E', e, a, c, b, sz, 12);
      if (dist(d, e) < 24) { move(LD, LD.n, 6); move(LE, LE.n, 6); }
      function settle(L, p, q, pn, qn) {
        for (var i = 0; i < 3 && (hit(L, p) || hit(L, q)); i++) move(L, L.n, 6);
        if (hit(L, p) || hit(L, q)) { legend.push(L.s + ' (next to ' + (hit(L, p) ? pn : qn) + ')'); return null; }
        return L;
      }
      LD = settle(LD, LA, LB, 'A', 'B');
      LE = settle(LE, LA, LC, 'A', 'C');
      if (LD && LE && hit(LD, LE)) {
        for (var i = 0; i < 3 && hit(LD, LE); i++) { move(LD, LD.n, 6); move(LE, LE.n, 6); }
        if (hit(LD, LE) || hit(LD, LA) || hit(LD, LB)) { legend.push('E (next to D)'); LE = null; }
      }
      if (LD && (hit(LD, LA) || hit(LD, LB))) { legend.push('D (next to ' + (hit(LD, LA) ? 'A' : 'B') + ')'); LD = null; }
      if (LE && (hit(LE, LA) || hit(LE, LC))) { legend.push('E (next to ' + (hit(LE, LA) ? 'A' : 'C') + ')'); LE = null; }
      var labs = [LA, LB, LC, LD, LE].filter(Boolean);
      /* segment names (≥ 48 px, offset outward, never on another label) */
      var segs = [['AD', a, d, c], ['DB', d, b, c], ['AE', a, e, b], ['EC', e, c, b]], sl = [];
      segs.forEach(function (z) {
        if (dist(z[1], z[2]) < 48) return;
        var m = [(z[1][0] + z[2][0]) / 2, (z[1][1] + z[2][1]) / 2], u = unit(z[1], z[2]), n = [-u[1], u[0]];
        if ((z[3][0] - m[0]) * n[0] + (z[3][1] - m[1]) * n[1] > 0) n = [-n[0], -n[1]];
        var x = lbox(z[0], m, 13 * sc);
        move(x, n, Math.max(10, sup(x.hw, x.hh, n) + 3));
        if (labs.concat(sl).some(function (o) { return hit(o, x); })) return;
        sl.push(x);
      });
      /* arrow-heads (BC and DE when parallel), moved 8 px along the segment when a label covers them */
      function arrowAt(p1, p2, cls) {
        var u = unit(p1, p2), L = dist(p1, p2), m = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], off = 0, tries = [0, 8, -8, 16, -16, 24, -24, 32, -32, 40, -40];
        for (var i = 0; i < tries.length; i++) {
          var c0 = [m[0] + u[0] * tries[i], m[1] + u[1] * tries[i]], bx = { x0: c0[0] - 8, x1: c0[0] + 8, y0: c0[1] - 8, y1: c0[1] + 8 };
          if (Math.abs(tries[i]) > L / 2 - 8) continue;
          if (!labs.concat(sl).some(function (o) { return hit(o, bx); })) { off = tries[i]; break; }
        }
        var cc = [m[0] + u[0] * off, m[1] + u[1] * off];
        return P(chevron(cc, u, 7), INK, { sw: 1.8, cls: cls });
      }
      out += P('M' + f1(b[0]) + ',' + f1(b[1]) + ' L' + f1(d[0]) + ',' + f1(d[1]) + ' L' + f1(e[0]) + ',' + f1(e[1]) + ' L' + f1(c[0]) + ',' + f1(c[1]) + ' Z', 'none', { fill: C1BG, sw: 0 });
      out += P('M' + f1(a[0]) + ',' + f1(a[1]) + ' L' + f1(b[0]) + ',' + f1(b[1]) + ' L' + f1(c[0]) + ',' + f1(c[1]) + ' Z', INK, { sw: 2.2, cls: 'sx-abc' });
      out += arrowAt(b, c, 'sx-ar sx-ar-bc');
      if (!par) out += P('M' + f1(d[0]) + ',' + f1(d[1]) + ' L' + f1(ep[0]) + ',' + f1(ep[1]), SOFT, { sw: 1.5, dash: '1.5 5', cls: 'sx-cmp' });
      out += P('M' + f1(d[0]) + ',' + f1(d[1]) + ' L' + f1(e[0]) + ',' + f1(e[1]), par ? C1 : NO, { sw: 2.8, dash: par ? null : '7 5', cls: 'sx-de' });
      if (par) out += arrowAt(d, e, 'sx-ar sx-ar-de');
      labs.forEach(function (L) { out += T(L.cx, L.cy + L.sz * 0.36, L.s, L.sz, { cls: 'sx-lab', name: L.s }); });
      sl.forEach(function (L) { out += T(L.cx, L.cy + L.sz * 0.36, L.s, L.sz, { cls: 'sx-sl', name: L.s, fill: SOFT, bold: false }); });
      /* draggable points (44 × 44 px hit area) */
      function handle(cls, p, w, lab, txt, key) {
        return '<g class="sx-hd ' + cls + '" tabindex="0" role="slider" aria-label="' + lab + '" aria-valuemin="1" aria-valuemax="11" aria-valuenow="' + key +
          '" aria-valuetext="' + txt + '" data-wx="' + w[0].toFixed(9) + '" data-wy="' + w[1].toFixed(9) + '">' +
          '<circle class="sx-hit" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="22" fill="transparent"/>' +
          '<circle class="sx-ring" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="12" fill="none" stroke-width="2.5"/>' +
          '<circle cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="6.5" fill="' + C1 + '" stroke="' + CARD + '" stroke-width="2"/></g>';
      }
      [a, b, c].forEach(function (p) { out += '<circle cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="3.5" fill="' + INK + '"/>'; });
      if (!S.unlock) out += '<circle class="sx-e" cx="' + f1(e[0]) + '" cy="' + f1(e[1]) + '" r="5" fill="' + INK + '" stroke="' + CARD + '" stroke-width="1.5" data-wx="' + G.E[0].toFixed(9) + '" data-wy="' + G.E[1].toFixed(9) + '"/>';
      else out += handle('sx-he', e, G.E, 'point E', 'AE to EC is ' + r.re[0] + ' to ' + r.re[1], S.j);
      out += handle('sx-hdd', d, G.D, 'point D', 'AD to DB is ' + r.rd[0] + ' to ' + r.rd[1], S.k);
      var focused = document.activeElement && root.contains(document.activeElement) && document.activeElement.classList.contains('sx-hd') ?
        (document.activeElement.classList.contains('sx-he') ? 'sx-he' : 'sx-hdd') : null;
      g.innerHTML = out;
      if (focused) { var fe = $('.' + focused, g); if (fe) fe.focus(); }
      bindHandles();
      $('title', svg).textContent = 'Triangle ABC (' + SX_TRI[S.tri][0] + ') with D on AB and E on AC; DE ' + (par ? 'parallel to BC' : 'not parallel to BC');
      svg.setAttribute('data-legend', legend.join('; '));
      S.legend = legend;
      S.r = r;
      S.par = par;
    }
    /* ---------------------------------------------------------------- mode 2 */
    function draw2() {
      var W = Math.max(200, Math.round(root.clientWidth)), sc = ts(), sz = 14 * sc, sd = SX_BASE[S.base][1], a = sd[0], b = sd[1], c = sd[2];
      var cx = (b * b + c * c - a * a) / (2 * c), cy = Math.sqrt(b * b - cx * cx), k = S.q / 4, side = W >= 520, s, H, oA, oA2;
      if (side) {
        s = (W - 48 - 24) / (4 * c);
        H = Math.min(Math.round(0.75 * W), 420);
        var base = H - 24 - 22 * sc;
        oA = [24, base]; oA2 = [24 + c * s + 24, base];
      } else {
        s = (W - 48) / (3 * c);
        H = Math.round(24 + 20 * sc + cy * s + 34 + 22 * sc + 3 * cy * s + 22 * sc + 24);
        oA = [24, 24 + 20 * sc + cy * s]; oA2 = [24, H - 24 - 22 * sc];
      }
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
      function tri(o, f) { return [[o[0], o[1]], [o[0] + c * s * f, o[1]], [o[0] + cx * s * f, o[1] - cy * s * f]]; }
      var t1 = tri(oA, 1), t2 = tri(oA2, k), out = '';
      var small = Math.min(a, b, c) * k * s < 40;
      out += P('M' + t1.map(function (p) { return f1(p[0]) + ',' + f1(p[1]); }).join(' L') + ' Z', INK, { fill: C1BG, sw: 2.2, cls: 'sx-base' });
      out += P('M' + t2.map(function (p) { return f1(p[0]) + ',' + f1(p[1]); }).join(' L') + ' Z', INK, { fill: 'url(#' + uid + '-h)', sw: 2.2, cls: 'sx-copy' });
      function marks(t, f) {
        if (f * Math.min(a, b, c) * s < 30) return '';
        var r = Math.min(16, f * s * 0.9);
        return arcs(t[0], t[1], t[2], 1, r) + arcs(t[1], t[2], t[0], 2, r - 3) + arcs(t[2], t[0], t[1], 3, r - 5);
      }
      out += marks(t1, 1) + marks(t2, k);
      function names(t, pr, lens) {
        var o2 = '';
        ['A', 'B', 'C'].forEach(function (nm, i) {
          var L = vlab(nm + pr, t[i], t[(i + 1) % 3], t[(i + 2) % 3], sz);
          o2 += T(L.cx, L.cy + L.sz * 0.36, nm + pr, sz, { cls: 'sx-lab', name: nm + pr });
        });
        if (lens) [[0, 1, lens[2]], [1, 2, lens[0]], [2, 0, lens[1]]].forEach(function (z) {
          var p1 = t[z[0]], p2 = t[z[1]], m = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], u = unit(p1, p2), n = [u[1], -u[0]];
          var cen = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3];
          if ((cen[0] - m[0]) * n[0] + (cen[1] - m[1]) * n[1] > 0) n = [-n[0], -n[1]];
          var x = lbox(z[2], m, 13 * sc);
          move(x, n, sup(x.hw, x.hh, n) + 4);
          o2 += T(x.cx, x.cy + x.sz * 0.36, z[2], x.sz, { cls: 'sx-sl', bold: false });
        });
        return o2;
      }
      out += names(t1, '', [String(a), String(b), String(c)]);
      if (small) {
        var lx = t2[0][0] + 4, ly = t2[0][1] + 18 * sc;
        out += '<text x="' + f1(lx) + '" y="' + f1(ly) + '" font-family="Lexend, sans-serif" font-size="' + (13 * sc).toFixed(1) + '" fill="' + INK + '" class="sx-small">A′B′C′ (small — see the table)</text>';
      } else out += names(t2, '′', [sxQ(S.q * a), sxQ(S.q * b), sxQ(S.q * c)]);
      g.innerHTML = out;
      svg.setAttribute('data-s', s.toFixed(4));
      svg.setAttribute('data-layout', side ? 'side' : 'stacked');
      svg.removeAttribute('data-legend');
      $('title', svg).textContent = 'Base triangle ABC with sides ' + SX_BASE[S.base][0] + ' and its copy A′B′C′ scaled by k = ' + sxQ(S.q);
    }
    function read1() {
      var r = S.r;
      if (!r) return;
      var rows = $$('.sx-r', root);
      $('.sx-v', rows[0]).textContent = r.rd[0] + ' : ' + r.rd[1];
      $('.sx-dec', rows[0]).textContent = 'AD/DB = ' + sxDec(r.rd[0], r.rd[1]);
      $('.sx-v', rows[1]).textContent = r.ok ? r.re[0] + ' : ' + r.re[1] : r.val.toFixed(3);
      $('.sx-dec', rows[1]).textContent = 'AE/EC = ' + (r.ok ? sxDec(r.re[0], r.re[1]) : r.val.toFixed(3));
      var st = q('sx-st');
      st.textContent = !S.unlock ? 'AD/DB = AE/EC ✓ — DE ∥ BC' : r.eq ? 'ratios equal → DE ∥ BC (converse of BPT)' : 'ratios differ → DE is not parallel to BC';
      st.className = 'sx-st ' + (S.unlock && !r.eq ? 'sx-st--no' : 'sx-st--ok');
      var nt = q('sx-note'), msg = S.noteD ? SX_NOTE : S.noteE ? SX_NOTE_E : '';
      nt.hidden = !msg; nt.textContent = msg;
      var lg = q('sx-leg');
      lg.hidden = !S.legend.length; lg.textContent = S.legend.length ? 'Labels not drawn: ' + S.legend.join(', ') : '';
    }
    function read2() {
      var sd = SX_BASE[S.base][1], k = sxQ(S.q), names = [['AB', 'A′B′', 2], ['BC', 'B′C′', 0], ['CA', 'C′A′', 1]], ang = sxAngles(sd);
      q('sx-ts').innerHTML = names.map(function (n) {
        return '<tr><th scope="row">' + n[0] + ' / ' + n[1] + '</th><td>' + sd[n[2]] + '</td><td>' + sxQ(S.q * sd[n[2]]) + '</td><td>' + k + '</td></tr>';
      }).join('');
      q('sx-tan').innerHTML = ['A', 'B', 'C'].map(function (n, i) {
        return '<tr><th scope="row">∠' + n + ' / ∠' + n + '′</th><td>' + sxTenths(ang[i]) + '</td><td>' + sxTenths(ang[i]) + '</td></tr>';
      }).join('') + '<tr class="sx-sum"><th scope="row">sum</th><td>' + sxTenths(ang[0] + ang[1] + ang[2]) + '</td><td>' + sxTenths(ang[0] + ang[1] + ang[2]) + '</td></tr>';
      q('sx-cap').textContent = S.q === 4 ? 'scale factor 1: the copy is congruent — a special case of similar' : S.q < 4 ? 'k < 1: a reduction' : 'k > 1: an enlargement';
    }
    var readT1 = mThrottle(read1, 250), readT2 = mThrottle(read2, 250);
    function sync() {
      var r = S.r;
      rD.value = String(S.k); rE.value = String(S.j); rK.value = String(S.q / 4);
      if (r) {
        rD.setAttribute('aria-valuetext', 'AD to DB is ' + r.rd[0] + ' to ' + r.rd[1]);
        $('.sx-sd .sx-out', root).textContent = r.rd[0] + ' : ' + r.rd[1];
        var je = sxRed(S.j, 12 - S.j);
        rE.setAttribute('aria-valuetext', 'AE to EC is ' + je[0] + ' to ' + je[1]);
        $('.sx-se .sx-out', root).textContent = je[0] + ' : ' + je[1];
      }
      rK.setAttribute('aria-valuetext', 'scale factor ' + sxQ(S.q));
      $('.sx-sk .sx-out', root).textContent = sxQ(S.q);
      $$('.sx-m', root).forEach(function (bt) { bt.setAttribute('aria-pressed', bt.getAttribute('data-m') === S.mode ? 'true' : 'false'); });
      $$('.sx-tc', root).forEach(function (bt) { bt.setAttribute('aria-pressed', +bt.getAttribute('data-i') === S.tri ? 'true' : 'false'); });
      $$('.sx-bc', root).forEach(function (bt) { bt.setAttribute('aria-pressed', +bt.getAttribute('data-i') === S.base ? 'true' : 'false'); });
      q('sx-unlock').setAttribute('aria-pressed', S.unlock ? 'true' : 'false');
      $('.sx-se', root).hidden = !S.unlock;
      q('sx-hint').textContent = S.unlock ? 'drag D or E' : 'drag D';
      q('sx-p1').hidden = S.mode !== 'par';
      q('sx-p2').hidden = S.mode !== 'scale';
      root.setAttribute('data-mode', S.mode);
    }
    function render(now) {
      if (S.mode === 'par') { draw1(); sync(); if (now) read1(); else readT1(); }
      else { draw2(); sync(); if (now) read2(); else readT2(); }
    }
    /* ---------------------------------------------------------------- input */
    function setK(which, v) {             /* which: 'k' (D) or 'j' (E); v may run past the ends: clamp and show the note */
      var nv = Math.max(1, Math.min(11, v)), note = nv !== v;
      var changed = nv !== S[which];
      S[which] = nv;
      if (which === 'k') { S.noteD = note; if (note || changed) S.noteE = false; } else { S.noteE = note; if (note || changed) S.noteD = false; }
      render();
    }
    function keyStep(e, cur) {
      var k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowUp') return cur + 1;
      if (k === 'ArrowLeft' || k === 'ArrowDown') return cur - 1;
      if (k === 'PageUp') return cur + 3;
      if (k === 'PageDown') return cur - 3;
      if (k === 'Home') return 1;
      if (k === 'End') return 11;
      return null;
    }
    function onKey(which) {
      return function (e) {
        var n = keyStep(e, S[which]);
        if (n === null) return;
        e.preventDefault();
        setK(which, n);
      };
    }
    function bindHandles() {
      $$('.sx-hd', g).forEach(function (h) {
        var which = h.classList.contains('sx-he') ? 'j' : 'k';
        on(h, 'keydown', onKey(which));
        on(h, 'pointerdown', function (e) {
          e.preventDefault();
          var drag = which;
          h.focus();
          try { svg.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
          S.drag = { which: drag, id: e.pointerId };
          dragTo(e);
        });
      });
    }
    function dragTo(e) {
      if (!S.drag) return;
      var rc = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, x = (e.clientX - rc.left) * vb.width / rc.width, y = (e.clientY - rc.top) * vb.height / rc.height;
      var W = vb.width, H = vb.height, G = geo1(W, H), a = G.X(G.A), p2 = S.drag.which === 'k' ? G.X(G.B) : G.X(G.C);
      var dx = p2[0] - a[0], dy = p2[1] - a[1], t = ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), v = Math.round(t * 12);
      if (v === S[S.drag.which] && v >= 1 && v <= 11) return;
      setK(S.drag.which, v);
    }
    on(svg, 'pointermove', dragTo);
    on(svg, 'pointerup', function () { S.drag = null; });
    on(svg, 'pointercancel', function () { S.drag = null; });
    on(rD, 'input', function () { setK('k', +rD.value); });
    on(rE, 'input', function () { setK('j', +rE.value); });
    on(rD, 'keydown', onKey('k'));
    on(rE, 'keydown', onKey('j'));
    on(rK, 'input', function () { S.q = Math.round(+rK.value * 4); render(); });
    on(rK, 'keydown', function (e) {
      var k = e.key, n = null;
      if (k === 'ArrowRight' || k === 'ArrowUp') n = S.q + 1; else if (k === 'ArrowLeft' || k === 'ArrowDown') n = S.q - 1;
      else if (k === 'PageUp') n = S.q + 3; else if (k === 'PageDown') n = S.q - 3; else if (k === 'Home') n = 1; else if (k === 'End') n = 12;
      if (n === null) return;
      e.preventDefault();
      S.q = Math.max(1, Math.min(12, n));
      render();
    });
    $$('.sx-m', root).forEach(function (bt) { on(bt, 'click', function () { S.mode = bt.getAttribute('data-m'); render(true); }); });
    $$('.sx-tc', root).forEach(function (bt) { on(bt, 'click', function () { S.tri = +bt.getAttribute('data-i'); S.noteD = S.noteE = false; render(); }); });
    $$('.sx-bc', root).forEach(function (bt) { on(bt, 'click', function () { S.base = +bt.getAttribute('data-i'); render(); }); });
    on(q('sx-unlock'), 'click', function () {
      S.unlock = !S.unlock;
      S.j = S.k;                             /* unlocking starts E at j = k; re-locking returns E to the parallel position */
      S.noteE = false;
      render();
    });
    var lastW = 0, lastF = 0;
    function onResize() {
      var w = Math.round(root.clientWidth), f = ts();
      if (w === lastW && f === lastF) return;
      lastW = w; lastF = f;
      render(true);
    }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(root);
    on(window, 'resize', onResize);
    lastW = Math.round(root.clientWidth); lastF = ts();
    render(true);
  }

  /* ---------------------------------------------------- coordinate explorer (Maths Ch 7, T02-V8)
     svg[data-cx] is the static first view (content/C10-MATH-CH07/diagrams, _src/coord_b.py v8); initCx replaces it.
     Topic 2 and the revision pack open in "Distance" mode with A (−3, 4), B (5, −2); Topic 4 (figure block id …-T04.…) opens
     in "Ratio" mode with A (−2, 5), B (8, −5), m : n = 2 : 3 (the brief's worked line, P (2, 1)). Switching mode keeps A and B.
     Exact arithmetic: coordinates are whole numbers from −8 to 8; n = (x₂ − x₁)² + (y₂ − y₁)² ≤ 512; the surd is found by
     testing the perfect square first, then the largest q² dividing n; the 2-place decimal is 100√n rounded half-up, found
     with integer square roots only. P = ((m·x_B + n·x_A)/(m + n), …) is kept as a reduced fraction; its decimal is rounded
     half-up (away from zero) from the fraction with integers. Floats are used only to draw. The drawing's viewBox is the
     container's real size (square, at most 420 px), s = (W − 32)/16 px per unit. Nothing is stored. */
  /*CX-TEX*/var CX_TEX = {"dist":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>A</mi><mi>B</mi><mo>=</mo><msqrt><mrow><mo stretchy=\"false\">(</mo><msub><mi>x</mi><mn>2</mn></msub><mo>−</mo><msub><mi>x</mi><mn>1</mn></msub><msup><mo stretchy=\"false\">)</mo><mn>2</mn></msup><mo>+</mo><mo stretchy=\"false\">(</mo><msub><mi>y</mi><mn>2</mn></msub><mo>−</mo><msub><mi>y</mi><mn>1</mn></msub><msup><mo stretchy=\"false\">)</mo><mn>2</mn></msup></mrow></msqrt></mrow><annotation encoding=\"application/x-tex\">AB = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6833em;\"></span><span class=\"mord mathnormal\">A</span><span class=\"mord mathnormal\" style=\"margin-right:0.05017em;\">B</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:1.24em;vertical-align:-0.305em;\"></span><span class=\"mord sqrt\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.935em;\"><span class=\"svg-align\" style=\"top:-3.2em;\"><span class=\"pstrut\" style=\"height:3.2em;\"></span><span class=\"mord\" style=\"padding-left:1em;\"><span class=\"mopen\">(</span><span class=\"mord\"><span class=\"mord mathnormal\">x</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">x</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mclose\"><span class=\"mclose\">)</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.7401em;\"><span style=\"top:-2.989em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mopen\">(</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">y</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.0359em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">y</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.0359em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mclose\"><span class=\"mclose\">)</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.7401em;\"><span style=\"top:-2.989em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span></span></span><span style=\"top:-2.895em;\"><span class=\"pstrut\" style=\"height:3.2em;\"></span><span class=\"hide-tail\" style=\"min-width:1.02em;height:1.28em;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400em\" height=\"1.28em\" viewBox=\"0 0 400000 1296\" preserveAspectRatio=\"xMinYMin slice\"><path d=\"M263,681c0.7,0,18,39.7,52,119\nc34,79.3,68.167,158.7,102.5,238c34.3,79.3,51.8,119.3,52.5,120\nc340,-704.7,510.7,-1060.3,512,-1067\nl0 -0\nc4.7,-7.3,11,-11,19,-11\nH40000v40H1012.3\ns-271.3,567,-271.3,567c-38.7,80.7,-84,175,-136,283c-52,108,-89.167,185.3,-111.5,232\nc-22.3,46.7,-33.8,70.3,-34.5,71c-4.7,4.7,-12.3,7,-23,7s-12,-1,-12,-1\ns-109,-253,-109,-253c-72.7,-168,-109.3,-252,-110,-252c-10.7,8,-22,16.7,-34,26\nc-22,17.3,-33.3,26,-34,26s-26,-26,-26,-26s76,-59,76,-59s76,-60,76,-60z\nM1001 80h400000v40h-400000z\"/></svg></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.305em;\"><span></span></span></span></span></span></span></span></span>","secx":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>x</mi><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mrow><msub><mi>m</mi><mn>1</mn></msub><msub><mi>x</mi><mn>2</mn></msub><mo>+</mo><msub><mi>m</mi><mn>2</mn></msub><msub><mi>x</mi><mn>1</mn></msub></mrow><mrow><msub><mi>m</mi><mn>1</mn></msub><mo>+</mo><msub><mi>m</mi><mn>2</mn></msub></mrow></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">x = \\dfrac{m_1 x_2 + m_2 x_1}{m_1 + m_2}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.4306em;\"></span><span class=\"mord mathnormal\">x</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0963em;vertical-align:-0.836em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.2603em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\"><span class=\"mord mathnormal\">m</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">m</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\"><span class=\"mord mathnormal\">m</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mord\"><span class=\"mord mathnormal\">x</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">m</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mord\"><span class=\"mord mathnormal\">x</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.836em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","secy":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>y</mi><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mrow><msub><mi>m</mi><mn>1</mn></msub><msub><mi>y</mi><mn>2</mn></msub><mo>+</mo><msub><mi>m</mi><mn>2</mn></msub><msub><mi>y</mi><mn>1</mn></msub></mrow><mrow><msub><mi>m</mi><mn>1</mn></msub><mo>+</mo><msub><mi>m</mi><mn>2</mn></msub></mrow></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">y = \\dfrac{m_1 y_2 + m_2 y_1}{m_1 + m_2}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.625em;vertical-align:-0.1944em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">y</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0963em;vertical-align:-0.836em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.2603em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\"><span class=\"mord mathnormal\">m</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">m</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\"><span class=\"mord mathnormal\">m</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">y</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.0359em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">m</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">y</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.0359em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.836em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>"};/*END-CX-TEX*/
  var CX_NOTE = 'A and B must be different points';
  function cxIsqrt(n) { var r = Math.floor(Math.sqrt(n)); while (r * r > n) r--; while ((r + 1) * (r + 1) <= n) r++; return r; }
  function cxSurd(n) {                 /* perfect square first; else the largest q² dividing n */
    var r = cxIsqrt(n);
    if (r * r === n) return { q: r, r: 1, whole: true };
    for (var q = r; q > 1; q--) if (n % (q * q) === 0) return { q: q, r: n / (q * q), whole: false };
    return { q: 1, r: n, whole: false };
  }
  function cxRootDec(n) {              /* √n to 2 places, half-up: v = round(100√n) with integers only */
    var v = Math.floor((cxIsqrt(40000 * n) + 1) / 2), c = v % 100;
    return Math.floor(v / 100) + '.' + (c < 10 ? '0' : '') + c;
  }
  function cxFr(p, q) { if (q < 0) { p = -p; q = -q; } var g = mGcd(p, q) || 1; return [p / g, q / g]; }
  function cxFrDec(p, q) {             /* p/q (q > 0) to 2 places, half-up away from zero, integers only */
    var a = Math.abs(p), h = Math.floor((200 * a + q) / (2 * q)), c = h % 100;
    return (p < 0 ? '−' : '') + Math.floor(h / 100) + '.' + (c < 10 ? '0' : '') + c;
  }
  function cxN(v) { return mMinus(String(v)); }
  function cxB(v) { return v < 0 ? '(' + cxN(v) + ')' : cxN(v); }          /* a negative number substituted: in brackets */
  function cxSay(v) { return v < 0 ? 'minus ' + (-v) : String(v); }
  function cxSq(v) { return (v <= 0 ? '(' + cxN(v) + ')' : cxN(v)) + '<sup>2</sup>'; }   /* (−6)², (0)², 8² */
  function cxRt(inner) { return '<span class="gx-rt">√<span>' + inner + '</span></span>'; }
  function cxFrH(n, d) { return '<span class="gx-fr"><span>' + n + '</span><span class="sr">/</span><span>' + d + '</span></span>'; }
  function cxSub(s) {                  /* SVG text: x₂ → x<tspan …>2</tspan> (the site fonts have no subscript digits) */
    return s.replace(/([xy])([₁₂])/g, function (m, l, d) {
      return l + '<tspan dy="0.3em" font-size="0.72em">' + (d === '₁' ? '1' : '2') + '</tspan><tspan dy="-0.3em"></tspan>';
    });
  }
  function initCx() {
    $$('svg[data-cx="explorer"]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-cx-on')) return;
      art.setAttribute('data-cx-on', '1');
      var fig = svg.closest('.fig'), t4 = /-T04\./.test(fig ? fig.getAttribute('data-block-id') || '' : '');
      cxBuild(art, t4 ? 'ratio' : 'dist');
    });
  }
  function cxBuild(art, mode0) {
    var uid = 'cx' + Math.random().toString(36).slice(2, 7);
    var S = mode0 === 'ratio' ? { mode: 'ratio', A: [-2, 5], B: [8, -5], m: 2, n: 3 } : { mode: 'dist', A: [-3, 4], B: [5, -2], m: 2, n: 3 };
    var INK = 'var(--ink, #1F2328)', SOFT = 'var(--ink-soft, #57554D)', CARD = 'var(--card, #FFF)', GRIDC = 'var(--dg-m-grid, #D6E0EC)';
    var C1 = 'var(--dg-m-opp, #C2410C)', C2 = 'var(--dg-m-adj, #1D5FBF)', C1BG = 'var(--dg-m-opp-bg, #FCE7DA)', ACC = 'var(--acc, #0A6C74)';
    var root = document.createElement('div');
    root.className = 'cx';
    function inp(pt, ax) {
      return '<label class="cx-in"><span class="cx-ax">' + ax + '</span><input type="number" inputmode="numeric" min="-8" max="8" step="1" ' +
        'class="cx-' + pt + ax + '" aria-label="' + pt + ' ' + ax + '-coordinate (whole number from minus 8 to 8)"></label>';
    }
    function stepper(k) {
      return '<div class="cx-st" role="group" aria-label="' + k + '"><span class="cx-stk"><i>' + k + '</i></span>' +
        '<button type="button" class="cx-dec" data-k="' + k + '" aria-label="decrease ' + k + '">−</button>' +
        '<output class="cx-v-' + k + '" aria-live="off"></output>' +
        '<button type="button" class="cx-inc" data-k="' + k + '" aria-label="increase ' + k + '">+</button></div>';
    }
    root.innerHTML =
      '<div class="cx-seg" role="group" aria-label="Mode"><button type="button" class="cx-m" data-m="dist" aria-pressed="false">Distance</button>' +
      '<button type="button" class="cx-m" data-m="ratio" aria-pressed="false">Ratio</button></div>' +
      '<svg class="cx-svg" role="group" aria-labelledby="' + uid + '-t"><title id="' + uid + '-t"></title><defs>' +
      '<pattern id="' + uid + '-h" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">' +
      '<path d="M0,0 L0,6" stroke="' + C2 + '" stroke-width="1.6"/></pattern></defs><g class="cx-g"></g></svg>' +
      '<p class="cx-hint"><span>drag A</span><span>drag B</span></p>' +
      '<p class="cx-note" role="status" hidden></p>' +
      '<div class="cx-ratio"><p class="cx-rt-line"><span class="cx-k">AP : PB</span> = <b class="cx-mn"></b></p>' +
      '<div class="cx-sts">' + stepper('m') + stepper('n') + '</div></div>' +
      '<div class="cx-work" aria-live="polite"></div>' +
      '<div class="cx-move"><fieldset><legend>Move A</legend>' + inp('A', 'x') + inp('A', 'y') + '</fieldset>' +
      '<fieldset><legend>Move B</legend>' + inp('B', 'x') + inp('B', 'y') + '</fieldset></div>';
    art.innerHTML = '';
    art.appendChild(root);
    var svgEl = $('.cx-svg', root), g = $('.cx-g', root), work = $('.cx-work', root), note = $('.cx-note', root), noteT = null;
    var cv = document.createElement('canvas').getContext('2d');
    function ts() { var f = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; return f / 16; }
    function tw(s, sz, bold) { var t = s.replace(/[₁₂]/g, '1'); if (!cv) return t.length * sz * 0.6; cv.font = (bold ? '600 ' : '') + sz + 'px Lexend, sans-serif'; return cv.measureText(t).width; }
    function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
    function P(d, st, o) {
      o = o || {};
      return '<path d="' + d + '" fill="' + (o.fill || 'none') + '" stroke="' + (st || INK) + '" stroke-width="' + (o.sw || 2) + '"' +
        (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + (o.cls ? ' class="' + o.cls + '"' : '') + ' stroke-linecap="round" stroke-linejoin="round"/>';
    }
    function T(x, y, s, sz, o) {
      o = o || {};
      return '<text x="' + f1(x) + '" y="' + f1(y) + '" font-family="Lexend, sans-serif" font-size="' + sz.toFixed(1) + '"' +
        (o.bold ? ' font-weight="600"' : '') + ' text-anchor="' + (o.anchor || 'middle') + '" fill="' + (o.fill || INK) + '"' + (o.cls ? ' class="' + o.cls + '"' : '') +
        (o.name ? ' data-name="' + o.name + '"' : '') + '>' + cxSub(s) + '</text>';
    }
    function hit(a, b) { return a && b && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
    function inside(b, W) { return b.x0 >= 2 && b.y0 >= 2 && b.x1 <= W - 2 && b.y1 <= W - 2; }
    function boxAt(cx, cy, w, h) { return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, cx: cx, cy: cy, w: w, h: h }; }
    function geo() {
      var W = Math.min(420, Math.max(200, Math.round(root.clientWidth))), s = (W - 32) / 16;
      return { W: W, s: s, X: function (x) { return 16 + (x + 8) * s; }, Y: function (y) { return 16 + (8 - y) * s; } };
    }
    function tagOf(p) { return p[0] === 0 && p[1] === 0 ? 'origin' : p[1] === 0 ? 'on the x-axis' : p[0] === 0 ? 'on the y-axis' : ''; }
    /* point label: 10 px from the dot (r = 5) on the side facing away from `other` (px); flipped if it would leave */
    function plabel(nm, p, wp, other, sz, taken, W) {
      var txt = nm + ' (' + cxN(wp[0]) + ', ' + cxN(wp[1]) + ')', tag = tagOf(wp), szT = Math.max(12, sz - 2);
      var w = Math.max(tw(txt, sz, true), tag ? tw(tag, szT) : 0) + 4, h = tag ? sz * 1.2 + szT * 1.2 : sz * 1.25;
      var ux = p[0] - other[0], uy = p[1] - other[1], L = Math.sqrt(ux * ux + uy * uy) || 1;
      ux /= L; uy /= L;
      var cands = [[ux, uy], [-ux, -uy], [uy, -ux], [-uy, ux]], best = null, i, u, d, b;
      function free(bx) { return !taken.some(function (t) { return hit(t, bx); }) && !hit(bx, boxAt(p[0], p[1], 10, 10)) && !hit(bx, boxAt(other[0], other[1], 10, 10)); }
      for (i = 0; i < cands.length; i++) {
        u = cands[i]; d = 5 + 10 + (w / 2) * Math.abs(u[0]) + (h / 2) * Math.abs(u[1]);
        b = boxAt(p[0] + u[0] * d, p[1] + u[1] * d, w, h);
        if (inside(b, W) && free(b)) { best = b; break; }
      }
      for (i = 0; !best && i < cands.length; i++) {      /* near a corner: slide the box back inside the drawing */
        u = cands[i]; d = 5 + 10 + (w / 2) * Math.abs(u[0]) + (h / 2) * Math.abs(u[1]);
        b = boxAt(Math.min(W - 2 - w / 2, Math.max(2 + w / 2, p[0] + u[0] * d)), Math.min(W - 2 - h / 2, Math.max(2 + h / 2, p[1] + u[1] * d)), w, h);
        if (free(b)) best = b;
      }
      if (!best) {                                       /* clamp the preferred box into the drawing */
        var d0 = 15 + (w / 2) * Math.abs(ux) + (h / 2) * Math.abs(uy);
        best = boxAt(Math.min(W - 2 - w / 2, Math.max(2 + w / 2, p[0] + ux * d0)), Math.min(W - 2 - h / 2, Math.max(2 + h / 2, p[1] + uy * d0)), w, h);
      }
      best.txt = txt; best.tag = tag; best.sz = sz; best.szT = szT; best.nm = nm;
      return best;
    }
    function drawLabel(b) {
      var y1 = b.y0 + b.sz * 0.98;
      var out = '<rect x="' + f1(b.x0) + '" y="' + f1(b.y0) + '" width="' + f1(b.w) + '" height="' + f1(b.h) + '" rx="3" fill="' + CARD + '"/>' +
        T(b.cx, y1, b.txt, b.sz, { bold: true, cls: 'cx-plab', name: b.nm });
      if (b.tag) out += T(b.cx, y1 + b.szT * 1.2, b.tag, b.szT, { fill: ACC, bold: true, cls: 'cx-tag', name: b.nm });
      return out;
    }
    function legLabel(lines, cands, sz, taken, W) {   /* first candidate inside the drawing and clear of the point labels */
      var w = 0, h = lines.length * sz * 1.25;
      lines.forEach(function (l) { w = Math.max(w, tw(l, sz, true) + 4); });
      var pick = null, first = null;
      function clampB(cx, cy) { return boxAt(Math.min(W - 2 - w / 2, Math.max(2 + w / 2, cx)), Math.min(W - 2 - h / 2, Math.max(2 + h / 2, cy)), w, h); }
      for (var step = 0; step < 8 && !pick; step++) {   /* each candidate, then each pushed further out by 14 px steps */
        for (var i = 0; i < cands.length; i++) {
          var c = cands[i], dd = step * 14, ex = c[2] || 0, ey = c[3] || 0;
          var b = clampB(c[0] + ex * (w / 2 + dd), c[1] + ey * (h / 2 + dd));
          if (!first) first = b;
          if (!taken.some(function (t) { return hit(t, b); })) { pick = b; break; }
        }
      }
      for (var r = 12; r <= 160 && !pick; r += 12) {   /* still crowded: the nearest free spot round the first candidate */
        for (var k = 0; k < 16; k++) {
          var bb = clampB(first.cx + r * Math.cos(k * Math.PI / 8), first.cy + r * Math.sin(k * Math.PI / 8));
          if (!taken.some(function (t) { return hit(t, bb); })) { pick = bb; break; }
        }
      }
      if (!pick) pick = first;
      if (!pick) { var c0 = cands[0]; pick = boxAt(Math.min(W - 2 - w / 2, Math.max(2 + w / 2, c0[0] + c0[2] * w / 2)), Math.min(W - 2 - h / 2, Math.max(2 + h / 2, c0[1] + c0[3] * h / 2)), w, h); }
      var out = '<rect x="' + f1(pick.x0) + '" y="' + f1(pick.y0) + '" width="' + f1(pick.w) + '" height="' + f1(pick.h) + '" rx="3" fill="' + CARD + '"/>';
      lines.forEach(function (l, i) { out += T(pick.cx, pick.y0 + sz * (0.98 + 1.25 * i), l, sz, { bold: true, cls: 'cx-leg' }); });
      taken.push(pick);
      return out;
    }
    function section() {
      var m = S.m, n = S.n, A = S.A, B = S.B;
      return { x: cxFr(m * B[0] + n * A[0], m + n), y: cxFr(m * B[1] + n * A[1], m + n), xn: m * B[0] + n * A[0], yn: m * B[1] + n * A[1], d: m + n };
    }
    function draw() {
      var G = geo(), W = G.W, s = G.s, sc = ts(), sz = 13 * sc, out = '';
      svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + W); svgEl.setAttribute('width', W); svgEl.setAttribute('height', W);
      svgEl.setAttribute('data-s', String(s)); svgEl.setAttribute('data-w', String(W));
      /* grid, axes (arrow-heads at the positive ends), tick numbers every 2 units (12 px), x, y, O */
      var gp = '';
      for (var i = -8; i <= 8; i++) gp += 'M' + f1(G.X(i)) + ',' + f1(G.Y(8)) + ' V' + f1(G.Y(-8)) + ' M' + f1(G.X(-8)) + ',' + f1(G.Y(i)) + ' H' + f1(G.X(8)) + ' ';
      out += P(gp, GRIDC, { sw: 0.8 });
      var x0 = G.X(0), y0 = G.Y(0);
      out += P('M' + f1(G.X(-8)) + ',' + f1(y0) + ' H' + f1(W - 4) + ' M' + f1(W - 10) + ',' + f1(y0 - 5) + ' L' + f1(W - 4) + ',' + f1(y0) + ' L' + f1(W - 10) + ',' + f1(y0 + 5), INK, { sw: 1.5 });
      out += P('M' + f1(x0) + ',' + f1(G.Y(-8)) + ' V4 M' + f1(x0 - 5) + ',10 L' + f1(x0) + ',4 L' + f1(x0 + 5) + ',10', INK, { sw: 1.5 });
      var fz = 12 * sc;
      out += T(W - 6, y0 - 8, 'x', 14 * sc, { anchor: 'end', bold: true }) + T(x0 + 9, 14, 'y', 14 * sc, { anchor: 'start', bold: true });
      for (var k = -8; k <= 8; k += 2) {
        if (k === 0) continue;
        out += T(G.X(k), y0 + fz + 3, cxN(k), fz, { fill: SOFT, cls: 'cx-tick' }) + T(x0 - 4, G.Y(k) + fz * 0.36, cxN(k), fz, { fill: SOFT, anchor: 'end', cls: 'cx-tick' });
      }
      out += T(x0 - 4, y0 + fz + 3, 'O', fz, { fill: SOFT, anchor: 'end', cls: 'cx-tick' });
      var A = S.A, B = S.B, a = [G.X(A[0]), G.Y(A[1])], b = [G.X(B[0]), G.Y(B[1])], taken = [];
      var dx = B[0] - A[0], dy = B[1] - A[1];
      if (S.mode === 'dist') {
        var t = [G.X(B[0]), G.Y(A[1])];
        if (dx !== 0 && dy !== 0) {
          out += P('M' + f1(a[0]) + ',' + f1(a[1]) + ' L' + f1(t[0]) + ',' + f1(t[1]) + ' L' + f1(b[0]) + ',' + f1(b[1]) + ' Z', 'none', { fill: C1BG, sw: 0, cls: 'cx-tri' });
          out += P('M' + f1(a[0]) + ',' + f1(a[1]) + ' L' + f1(t[0]) + ',' + f1(t[1]), INK, { sw: 2, dash: '6 4', cls: 'cx-legh' });
          out += P('M' + f1(t[0]) + ',' + f1(t[1]) + ' L' + f1(b[0]) + ',' + f1(b[1]), INK, { sw: 2, dash: '6 4', cls: 'cx-legv' });
          var q = 9, sx = a[0] < t[0] ? -1 : 1, sy = b[1] < t[1] ? -1 : 1;
          out += P('M' + f1(t[0] + sx * q) + ',' + f1(t[1]) + ' L' + f1(t[0] + sx * q) + ',' + f1(t[1] + sy * q) + ' L' + f1(t[0]) + ',' + f1(t[1] + sy * q), INK, { sw: 1.4, cls: 'cx-corner' });
        }
        out += P('M' + f1(a[0]) + ',' + f1(a[1]) + ' L' + f1(b[0]) + ',' + f1(b[1]), C1, { sw: 3.4, cls: 'cx-ab' });
      } else {
        var sec = section(), p = [G.X(sec.x[0] / sec.x[1]), G.Y(sec.y[0] / sec.y[1])];
        var ux = b[0] - p[0], uy = b[1] - p[1], L = Math.sqrt(ux * ux + uy * uy) || 1, nx = -uy / L * 5, ny = ux / L * 5;
        out += P('M' + f1(a[0]) + ',' + f1(a[1]) + ' L' + f1(p[0]) + ',' + f1(p[1]), C1, { sw: 6, cls: 'cx-ap' });
        out += P('M' + f1(p[0] + nx) + ',' + f1(p[1] + ny) + ' L' + f1(b[0] + nx) + ',' + f1(b[1] + ny) + ' L' + f1(b[0] - nx) + ',' + f1(b[1] - ny) + ' L' + f1(p[0] - nx) + ',' + f1(p[1] - ny) + ' Z',
          C2, { fill: 'url(#' + uid + '-h)', sw: 1, cls: 'cx-pb' });
        S.p = p;
      }
      /* point labels first (they are what the brief fixes), then the leg / ratio labels around them */
      var LA = plabel('A', a, A, b, sz, [], W); taken.push(LA);
      var LB = plabel('B', b, B, a, sz, taken, W); taken.push(LB);
      [a, b].forEach(function (z) { taken.push(boxAt(z[0], z[1], 12, 12)); });
      if (S.mode === 'dist') {
        var hl = dx === 0 ? ['x₂ − x₁ = 0'] : ['x₂ − x₁ = ' + cxN(B[0]) + ' − ' + cxB(A[0]) + ' = ' + cxN(dx)];
        var vl = dy === 0 ? ['y₂ − y₁ = 0'] : ['y₂ − y₁', '= ' + cxN(B[1]) + ' − ' + cxB(A[1]), '= ' + cxN(dy)];
        var away = dy > 0 ? 1 : -1;            /* horizontal leg: on the side away from B (up on screen when B is lower) */
        var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, ty = a[1];
        if (dx !== 0 && dy !== 0) {
          var hc = [[(a[0] + t[0]) / 2, ty + away * 6, 0, away], [(a[0] + t[0]) / 2, ty - away * 6, 0, -away]];
          var sdx = t[0] > a[0] ? 1 : -1, vm = (t[1] + b[1]) / 2;
          var vc = [[t[0] + sdx * 8, vm, sdx, 0], [t[0] - sdx * 8, vm, -sdx, 0], [t[0] + sdx * 8, vm - 30, sdx, 0], [t[0] - sdx * 8, vm + 30, -sdx, 0]];
          out += legLabel(hl, hc, sz, taken, W) + legLabel(vl, vc, sz, taken, W);
        } else if (dx === 0) {
          out += legLabel([hl[0]], [[mx + 10, my, 1, 0], [mx - 10, my, -1, 0]], sz, taken, W);
          out += legLabel(['y₂ − y₁ = ' + cxN(B[1]) + ' − ' + cxB(A[1]) + ' = ' + cxN(dy)], [[mx - 10, my + 26, -1, 0], [mx + 10, my + 26, 1, 0], [mx + 10, my - 26, 1, 0]], sz, taken, W);
        } else {
          out += legLabel([vl[0]], [[mx, my - 8, 0, -1], [mx, my + 8, 0, 1]], sz, taken, W);
          out += legLabel(['x₂ − x₁ = ' + cxN(B[0]) + ' − ' + cxB(A[0]) + ' = ' + cxN(dx)], [[mx, my + 8, 0, 1], [mx, my - 8, 0, -1], [mx, my + 30, 0, 1]], sz, taken, W);
        }
      } else {
        var sp = S.p, nxu = -(b[1] - a[1]), nyu = b[0] - a[0], nl = Math.sqrt(nxu * nxu + nyu * nyu) || 1;
        nxu /= nl; nyu /= nl;
        var ptxt = 'P (' + cxPs(section().x) + ', ' + cxPs(section().y) + ')';
        var w = tw(ptxt, sz, true) + 4, h = sz * 1.25, cands = [[nxu, nyu], [-nxu, -nyu]], pick = null;
        for (var c = 0; c < 2; c++) {
          var d = 5 + 10 + (w / 2) * Math.abs(cands[c][0]) + (h / 2) * Math.abs(cands[c][1]);
          var bx = boxAt(sp[0] + cands[c][0] * d, sp[1] + cands[c][1] * d, w, h);
          if (inside(bx, W) && !taken.some(function (z) { return hit(z, bx); })) { pick = bx; break; }
          if (!pick && inside(bx, W)) pick = bx;
        }
        if (!pick) pick = boxAt(Math.min(W - 2 - w / 2, Math.max(2 + w / 2, sp[0] + 40)), Math.min(W - 2 - h / 2, Math.max(2 + h / 2, sp[1])), w, h);
        taken.push(pick);
        out += '<rect x="' + f1(pick.x0) + '" y="' + f1(pick.y0) + '" width="' + f1(pick.w) + '" height="' + f1(pick.h) + '" rx="3" fill="' + CARD + '"/>' +
          T(pick.cx, pick.y0 + sz * 0.98, ptxt, sz, { bold: true, cls: 'cx-plab', name: 'P' });
        /* "m" beside AP and "n" beside PB, on the side away from the P label */
        var side = (pick.cx - sp[0]) * nxu + (pick.cy - sp[1]) * nyu > 0 ? -1 : 1;
        [[a, sp, 'm', C1], [sp, b, 'n', C2]].forEach(function (z) {
          var mx2 = (z[0][0] + z[1][0]) / 2 + side * nxu * 16, my2 = (z[0][1] + z[1][1]) / 2 + side * nyu * 16;
          var bx = boxAt(mx2, my2, tw(z[2], 15 * sc, true) + 6, 15 * sc * 1.2);
          if (taken.some(function (q2) { return hit(q2, bx); })) { mx2 += side * nxu * 14; my2 += side * nyu * 14; }
          out += T(mx2, my2 + 15 * sc * 0.36, '<tspan font-style="italic">' + z[2] + '</tspan>', 15 * sc, { bold: true, fill: z[3], cls: 'cx-mlab' });
        });
        out += '<circle class="cx-p" cx="' + f1(sp[0]) + '" cy="' + f1(sp[1]) + '" r="5" fill="' + CARD + '" stroke="' + INK + '" stroke-width="2"/>';
      }
      out += drawLabel(LA) + drawLabel(LB);
      /* the two draggable points: 44 × 44 px hit area centred on the 10 px dot */
      [['A', a, A], ['B', b, B]].forEach(function (z) {
        out += '<g class="cx-hd cx-h' + z[0] + '" tabindex="0" role="application" aria-roledescription="draggable point" data-pt="' + z[0] + '" aria-label="Point ' + z[0] + ' at ' + cxSay(z[2][0]) + ', ' + cxSay(z[2][1]) + '">' +
          '<rect class="cx-hit" x="' + f1(z[1][0] - 22) + '" y="' + f1(z[1][1] - 22) + '" width="44" height="44" fill="transparent"/>' +
          '<circle class="cx-ring" cx="' + f1(z[1][0]) + '" cy="' + f1(z[1][1]) + '" r="11" fill="none" stroke-width="2.5"/>' +
          '<circle cx="' + f1(z[1][0]) + '" cy="' + f1(z[1][1]) + '" r="5" fill="' + C1 + '" stroke="' + CARD + '" stroke-width="1.5"/></g>';
      });
      var focused = document.activeElement && root.contains(document.activeElement) && document.activeElement.getAttribute('data-pt');
      g.innerHTML = out;
      if (focused) { var fe = $('.cx-h' + focused, g); if (fe) fe.focus(); }
      $('title', svgEl).textContent = S.mode === 'dist' ? 'A (' + cxN(A[0]) + ', ' + cxN(A[1]) + ') and B (' + cxN(B[0]) + ', ' + cxN(B[1]) + ') with the right triangle of the distance formula'
        : 'A and B with P dividing AB in the ratio ' + S.m + ' : ' + S.n;
    }
    function cxPs(f) { return f[1] === 1 ? cxN(f[0]) : (f[0] < 0 ? '−' : '') + Math.abs(f[0]) + '/' + f[1]; }
    function frLine(f) {               /* exact value in HTML: whole number, or stacked fraction ≈ 2-place decimal */
      if (f[1] === 1) return cxN(f[0]);
      return (f[0] < 0 ? '−' : '') + cxFrH(Math.abs(f[0]), f[1]) + ' ≈ ' + cxFrDec(f[0], f[1]);
    }
    function working() {
      var A = S.A, B = S.B, h = '';
      function line(s, cls) { h += '<div class="cx-l' + (cls ? ' ' + cls : '') + '"><span class="mx">' + s + '</span></div>'; }
      if (S.mode === 'dist') {
        var dx = B[0] - A[0], dy = B[1] - A[1], n = dx * dx + dy * dy, r = cxSurd(n);
        h += '<div class="cx-l cx-l0">' + (CX_TEX.dist || '<span class="mx"><i>AB</i> = ' + cxRt('(<i>x</i><sub>2</sub> − <i>x</i><sub>1</sub>)<sup>2</sup> + (<i>y</i><sub>2</sub> − <i>y</i><sub>1</sub>)<sup>2</sup>') + '</span>') + '</div>';
        line('= ' + cxRt('(' + cxN(B[0]) + ' − ' + cxB(A[0]) + ')<sup>2</sup> + (' + cxN(B[1]) + ' − ' + cxB(A[1]) + ')<sup>2</sup>'));
        line('= ' + cxRt(cxSq(dx) + ' + ' + cxSq(dy)));
        line('= ' + cxRt(dx * dx + ' + ' + dy * dy));
        if (r.whole) { line('= ' + cxRt(String(n))); line('= ' + r.q, 'cx-ans'); }
        else if (r.q === 1) line('= ' + cxRt(String(n)) + ' ≈ ' + cxRootDec(n), 'cx-ans');
        else { line('= ' + cxRt(String(n))); line('= ' + r.q + cxRt(String(r.r)) + ' ≈ ' + cxRootDec(n), 'cx-ans'); }
        if (dx === 0) h += '<p class="cx-cap">same x: AB is just the difference of the y-coordinates</p>';
        else if (dy === 0) h += '<p class="cx-cap">same y: AB is just the difference of the x-coordinates</p>';
        S.read = { n: n, ans: r.whole ? String(r.q) : (r.q > 1 ? r.q : '') + '√' + r.r + ' ≈ ' + cxRootDec(n) };
      } else {
        var sec = section(), m = S.m, nn = S.n;
        ['x', 'y'].forEach(function (ax, i) {
          var num = sec[ax + 'n'], f = sec[ax];
          h += '<div class="cx-l cx-l0">' + (CX_TEX['sec' + ax] || '') + '</div>';
          line('= ' + cxFrH(m + ' × ' + cxB(B[i]) + ' + ' + nn + ' × ' + cxB(A[i]), m + ' + ' + nn));
          var simple = f[1] === sec.d && f[0] === num;
          line('= ' + (simple ? frLine(f) : cxFrH(cxN(num), sec.d) + ' = ' + frLine(f)), 'cx-ans');
        });
        h += '<p class="cx-cap cx-pv">P = (' + cxPs(sec.x) + ', ' + cxPs(sec.y) + ')</p>';
        h += '<p class="cx-cap">P is between A and B</p><p class="cx-cap cx-cross">m (next to A) multiplies B\'s coordinates</p>';
        if (m === nn) h += '<p class="cx-cap cx-midc">m = n: P is the mid-point</p>';
        S.read = { P: [cxPs(sec.x), cxPs(sec.y)] };
      }
      work.innerHTML = h;
    }
    var workT = mThrottle(working, 250);
    function sync() {
      ['A', 'B'].forEach(function (k) {
        ['x', 'y'].forEach(function (ax, i) { var e = $('.cx-' + k + ax, root); if (document.activeElement !== e) e.value = String(S[k][i]); });
      });
      $('.cx-v-m', root).textContent = String(S.m);
      $('.cx-v-n', root).textContent = String(S.n);
      var gg = mGcd(S.m, S.n);
      $('.cx-mn', root).textContent = S.m + ' : ' + S.n + (gg > 1 ? ' = ' + S.m / gg + ' : ' + S.n / gg : '');
      $$('.cx-dec', root).forEach(function (bt) { bt.disabled = S[bt.getAttribute('data-k')] <= 1; });
      $$('.cx-inc', root).forEach(function (bt) { bt.disabled = S[bt.getAttribute('data-k')] >= 9; });
      $$('.cx-m', root).forEach(function (bt) { bt.setAttribute('aria-pressed', bt.getAttribute('data-m') === S.mode ? 'true' : 'false'); });
      $('.cx-ratio', root).hidden = S.mode !== 'ratio';
      root.setAttribute('data-mode', S.mode);
      root.setAttribute('data-a', S.A.join(',')); root.setAttribute('data-b', S.B.join(','));
    }
    function render(now) { draw(); sync(); if (now) working(); else workT(); }
    function refuse() {
      note.textContent = CX_NOTE; note.hidden = false;
      clearTimeout(noteT);
      noteT = setTimeout(function () { note.hidden = true; note.textContent = ''; }, 3000);
    }
    function setPt(k, p, now) {        /* whole numbers −8…8 only; refuse to put A on B */
      p = [Math.max(-8, Math.min(8, p[0])), Math.max(-8, Math.min(8, p[1]))];
      var o = S[k === 'A' ? 'B' : 'A'];
      if (p[0] === o[0] && p[1] === o[1]) { refuse(); sync(); return false; }
      if (p[0] === S[k][0] && p[1] === S[k][1]) return true;
      S[k] = p;
      render(now);
      return true;
    }
    /* ---- pointer: the nearer point whose 44 × 44 box holds the pointer */
    function svgPt(e) {
      var rc = svgEl.getBoundingClientRect(), vb = svgEl.viewBox.baseVal;
      return [(e.clientX - rc.left) * vb.width / rc.width, (e.clientY - rc.top) * vb.height / rc.height];
    }
    on(svgEl, 'pointerdown', function (e) {
      var G = geo(), q = svgPt(e), best = null, bd = 1e9;
      ['A', 'B'].forEach(function (k) {
        var px = G.X(S[k][0]), py = G.Y(S[k][1]), dx = q[0] - px, dy = q[1] - py;
        if (Math.abs(dx) <= 22 && Math.abs(dy) <= 22 && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = k; }
      });
      if (!best) return;
      e.preventDefault();
      var h = $('.cx-h' + best, g); if (h) h.focus();
      try { svgEl.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      S.drag = best;
    });
    on(svgEl, 'pointermove', function (e) {
      if (!S.drag) return;
      var G = geo(), q = svgPt(e), x = Math.round((q[0] - 16) / G.s - 8), y = Math.round(8 - (q[1] - 16) / G.s);
      var k = S.drag, cur = S[k];
      x = Math.max(-8, Math.min(8, x)); y = Math.max(-8, Math.min(8, y));
      if (x === cur[0] && y === cur[1]) return;
      var o = S[k === 'A' ? 'B' : 'A'];
      if (x === o[0] && y === o[1]) { if (!S.refused) refuse(); S.refused = true; return; }
      S.refused = false;
      setPt(k, [x, y]);
    });
    function endDrag() { if (S.drag) { S.drag = null; S.refused = false; workT(); } }
    on(svgEl, 'pointerup', endDrag);
    on(svgEl, 'pointercancel', endDrag);
    /* ---- keyboard: Tab between A and B, arrows move 1 unit (stop at ±8, refuse to land on the other point) */
    on(g, 'keydown', function (e) {
      var h = e.target.closest && e.target.closest('.cx-hd'); if (!h) return;
      var k = h.getAttribute('data-pt'), p = S[k].slice(), key = e.key;
      if (key === 'ArrowLeft') p[0]--; else if (key === 'ArrowRight') p[0]++; else if (key === 'ArrowUp') p[1]++; else if (key === 'ArrowDown') p[1]--; else return;
      e.preventDefault();
      if (p[0] < -8 || p[0] > 8 || p[1] < -8 || p[1] > 8) return;
      setPt(k, p);
    });
    /* ---- number inputs: whole numbers −8…8; anything else is ignored and the previous value restored */
    $$('.cx-move input', root).forEach(function (e) {
      var k = /cx-A/.test(e.className) ? 'A' : 'B', i = /x$/.test(e.className) ? 0 : 1;
      function apply(final) {
        var v = String(e.value).trim().replace('−', '-');
        if (/^-?\d+$/.test(v) && +v >= -8 && +v <= 8) {
          var p = S[k].slice(); p[i] = +v;
          if (!setPt(k, p, true) || final) e.value = String(S[k][i]);
        } else if (final) e.value = String(S[k][i]);
      }
      on(e, 'change', function () { apply(true); });           /* committed on Enter / leaving the box, so "1.5" never half-applies */
      on(e, 'blur', function () { e.value = String(S[k][i]); });
    });
    /* ---- steppers m and n (1 to 9) */
    $$('.cx-dec, .cx-inc', root).forEach(function (bt) {
      on(bt, 'click', function () {
        var k = bt.getAttribute('data-k'), v = S[k] + (bt.classList.contains('cx-inc') ? 1 : -1);
        if (v < 1 || v > 9) return;
        S[k] = v; render(true);
      });
    });
    $$('.cx-m', root).forEach(function (bt) { on(bt, 'click', function () { S.mode = bt.getAttribute('data-m'); render(true); }); });
    var lastW = 0, lastF = 0;
    function onResize() {
      var w = Math.round(root.clientWidth), f = ts();
      if (w === lastW && f === lastF) return;
      lastW = w; lastF = f;
      render(true);
    }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(root);
    on(window, 'resize', onResize);
    lastW = Math.round(root.clientWidth); lastF = ts();
    render(true);
  }

  /* ---------------------------------------------------- heights-and-distances explorer (Maths Ch 9, T03-V5)
     svg[data-hd] is the static first view (content/C10-MATH-CH09/diagrams/_src/hd_b.py v5); initHd replaces it. Topic 3 opens
     in "One observer" mode, Topic 4 (figure block id …-T04.…) in "Two positions" mode. Tower height H = 12…48 m (step 6),
     eye height e = 0 or 1.5 m. The observers snap to the three places where the angle of elevation of the top is 60°, 45° or
     30°: d = (H − e)/tan θ. Exact arithmetic: k = H − e is kept in halves (k2 = 2k, always a multiple of 3), so every exact
     form is a whole number of halves; the 2-place decimal is found in thousandths with integers (√3 = 1.732, half-up).
     Floats are used only to draw. Drawing: W = container width (at most 640 px), height round(0.65 W), ground 32 px above
     the bottom, tower foot at x = 32, s = (W − 64)/(H√3) px per metre. Nothing is stored. */
  /*HD-TEX*/var HD_TEX = {"tan":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>tan</mi><mo>⁡</mo><mi>θ</mi><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mtext>height</mtext><mtext>distance</mtext></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\tan \\theta = \\dfrac{\\text{height}}{\\text{distance}}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6944em;\"></span><span class=\"mop\">tan</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">θ</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0574em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3714em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord text\"><span class=\"mord\">distance</span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord text\"><span class=\"mord\">height</span></span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","d":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>d</mi><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mrow><mi>H</mi><mo>−</mo><mi>e</mi></mrow><mrow><mi>tan</mi><mo>⁡</mo><mi>θ</mi></mrow></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">d = \\dfrac{H - e}{\\tan \\theta}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6944em;\"></span><span class=\"mord mathnormal\">d</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0463em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3603em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mop\">tan</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">θ</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.08125em;\">H</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord mathnormal\">e</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","walk":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mtext>walk</mtext><mrow><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><mrow><mi>tan</mi><mo>⁡</mo><msub><mi>θ</mi><mn>1</mn></msub></mrow></mfrac></mstyle><mo>−</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><mrow><mi>tan</mi><mo>⁡</mo><msub><mi>θ</mi><mn>2</mn></msub></mrow></mfrac></mstyle></mrow></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\dfrac{\\text{walk}}{\\dfrac{1}{\\tan \\theta_1} - \\dfrac{1}{\\tan \\theta_2}}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:3.4189em;vertical-align:-2.0474em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3714em;\"><span style=\"top:-2.11em;\"><span class=\"pstrut\" style=\"height:3.3214em;\"></span><span class=\"mord\"><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mop\">tan</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">θ</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.0278em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.836em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mop\">tan</span><span class=\"mspace\" style=\"margin-right:0.1667em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">θ</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.0278em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.836em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span><span style=\"top:-3.5514em;\"><span class=\"pstrut\" style=\"height:3.3214em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.9984em;\"><span class=\"pstrut\" style=\"height:3.3214em;\"></span><span class=\"mord\"><span class=\"mord text\"><span class=\"mord\">walk</span></span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:2.0474em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>"};/*END-HD-TEX*/
  var HD_NOTE = 'Pick two different angles';
  var HD_ANG = [60, 45, 30];
  function hdHalf(n2) { return (n2 % 2 ? (n2 - 1) / 2 + '.5' : String(n2 / 2)); }          /* 33 -> "16.5" */
  function hdCo(n2) { return n2 === 2 ? '' : hdHalf(n2); }                                     /* coefficient of √3 */
  function hdDec(th) {                                                                          /* thousandths -> 2 places, half-up */
    var h = Math.floor((th + 5) / 10), c = h % 100;
    return Math.floor(h / 100) + '.' + (c < 10 ? '0' : '') + c;
  }
  function hdRt(x) { return '<span class="gx-rt">√<span>' + x + '</span></span>'; }
  function hdFr(n, d) { return '<span class="gx-fr"><span>' + n + '</span><span class="sr">/</span><span>' + d + '</span></span>'; }
  /* distance from the tower for angle a (k2 = 2(H − e)): exact {t: text, h: html, say: words, v: number of metres} */
  function hdDist(k2, a) {
    var c2 = k2 / 3, kS = hdHalf(k2), k = k2 / 2;
    if (a === 45) return { t: kS, h: kS, say: kS, v: k, th: k2 * 500 };
    if (a === 60) return { t: hdCo(c2) + '√3', h: hdCo(c2) + hdRt('3'), say: hdCo(c2) + ' root 3', v: k / Math.sqrt(3), th: c2 * 866 };
    return { t: hdCo(k2) + '√3', h: hdCo(k2) + hdRt('3'), say: hdCo(k2) + ' root 3', v: k * Math.sqrt(3), th: k2 * 866 };
  }
  function initHd() {
    $$('svg[data-hd="explorer"]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-hd-on')) return;
      art.setAttribute('data-hd-on', '1');
      var fig = svg.closest('.fig'), t4 = /-T04\./.test(fig ? fig.getAttribute('data-block-id') || '' : '');
      if (fig) fig.classList.add('fig--hd');
      hdBuild(art, t4 ? 'two' : 'one');
    });
  }
  function hdBuild(art, mode0) {
    var uid = 'hd' + Math.random().toString(36).slice(2, 7);
    var S = { mode: mode0, H: 18, e2: 0, one: { a: { id: 'a', ang: 60 } }, two: { a: { id: 'a', ang: 30 }, b: { id: 'b', ang: 60 } }, drag: null, anim: null };
    var INK = 'var(--ink, #1F2328)', SOFT = 'var(--ink-soft, #57554D)', CARD = 'var(--card, #FFF)', ACC = 'var(--acc, #0A6C74)';
    var C1 = 'var(--dg-m-opp, #C2410C)', C2 = 'var(--dg-m-adj, #1D5FBF)', C1BG = 'var(--dg-m-opp-bg, #FCE7DA)', HYP = 'var(--dg-m-hyp-bg, #EFEDE6)';
    var root = document.createElement('div');
    root.className = 'hd';
    function seg(cls, label, items) {
      return '<div class="hd-seg ' + cls + '" role="group" aria-label="' + label + '">' + items.map(function (it) {
        return '<button type="button" data-v="' + it[0] + '" aria-pressed="false">' + it[1] + '</button>'; }).join('') + '</div>';
    }
    function pick(row, lab) {
      return '<div class="hd-pick" data-row="' + row + '" role="group" aria-label="' + lab + ': angle of elevation"><span class="hd-pl">' + lab + '</span>' +
        HD_ANG.map(function (a) { return '<button type="button" data-a="' + a + '" aria-pressed="false">' + a + '°</button>'; }).join('') + '</div>';
    }
    root.innerHTML =
      '<div class="hd-top">' + seg('hd-mode', 'Mode', [['one', 'One observer'], ['two', 'Two positions']]) +
      '<div class="hd-st" role="group" aria-label="Tower height"><span class="hd-stl">Tower height</span>' +
      '<button type="button" class="hd-dec" aria-label="lower tower (6 m less)">−</button><output class="hd-hv" aria-live="off"></output>' +
      '<button type="button" class="hd-inc" aria-label="taller tower (6 m more)">+</button></div>' +
      seg('hd-eye', 'Eye height', [['0', 'Eye at ground level'], ['3', 'Eye 1.5 m above the ground']]) + '</div>' +
      '<svg class="hd-svg" role="group" aria-labelledby="' + uid + '-t"><title id="' + uid + '-t"></title><defs>' +
      '<pattern id="' + uid + '-h" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(-50)">' +
      '<path d="M0,0 L0,7" stroke="' + C2 + '" stroke-width="1.3"/></pattern></defs><g class="hd-g"></g></svg>' +
      '<p class="hd-hint">drag the observer</p>' +
      pick('a', 'angle of elevation') + pick('b', 'second') +
      '<p class="hd-note" role="status" hidden></p>' +
      '<div class="hd-work" aria-live="polite"></div>';
    art.innerHTML = '';
    art.appendChild(root);
    var svgEl = $('.hd-svg', root), g = $('.hd-g', root), work = $('.hd-work', root), note = $('.hd-note', root), noteT = null;
    var cv = document.createElement('canvas').getContext('2d');
    function tw(s, sz, bold) { if (!cv) return s.length * sz * 0.6; cv.font = (bold ? '600 ' : '') + sz + 'px Lexend, sans-serif'; return cv.measureText(s).width; }
    function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
    function P(d, st, o) {
      o = o || {};
      return '<path d="' + d + '" fill="' + (o.fill || 'none') + '" stroke="' + (st || 'none') + '" stroke-width="' + (o.sw || 2) + '"' +
        (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + (o.cls ? ' class="' + o.cls + '"' : '') + ' stroke-linecap="round" stroke-linejoin="round"/>';
    }
    function T(x, y, s, sz, o) {
      o = o || {};
      return '<text x="' + f1(x) + '" y="' + f1(y) + '" font-family="Lexend, sans-serif" font-size="' + sz + '"' + (o.bold ? ' font-weight="600"' : '') +
        ' text-anchor="' + (o.anchor || 'middle') + '" fill="' + (o.fill || INK) + '"' + (o.rot ? ' transform="rotate(' + o.rot + ' ' + f1(x) + ' ' + f1(y) + ')"' : '') +
        (o.cls ? ' class="' + o.cls + '"' : '') + '>' + s + '</text>';
    }
    function halo(x, y, w, sz) { return '<rect x="' + f1(x - w / 2 - 2) + '" y="' + f1(y - sz * 0.85) + '" width="' + f1(w + 4) + '" height="' + f1(sz * 1.15) + '" rx="3" fill="' + CARD + '"/>'; }
    function obs() { return S.mode === 'one' ? [S.one.a] : [S.two.a, S.two.b]; }
    function ordered() {                 /* mode 2: the farther observer (smaller angle) is always "first" */
      var o = obs();
      if (o.length === 2 && o[0].ang < o[1].ang) return [o[0], o[1]];
      return o.length === 2 ? [o[1], o[0]] : o;
    }
    function k2() { return 2 * S.H - S.e2; }
    function geo() {
      var W = Math.min(640, Math.max(240, Math.round(root.clientWidth))), Hd = Math.round(0.65 * W), gy = Hd - 32;
      var s = (W - 64) / (S.H * Math.sqrt(3));
      return { W: W, Hd: Hd, gy: gy, s: s, x0: 32 };
    }
    function xOf(G, a) { return G.x0 + hdDist(k2(), a).v * G.s; }
    function draw() {
      var G = geo(), W = G.W, gy = G.gy, s = G.s, out = '', e = S.e2 / 2, ye = gy - e * s, top = gy - S.H * s, sz = 13;
      svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + G.Hd); svgEl.setAttribute('width', W); svgEl.setAttribute('height', G.Hd);
      svgEl.setAttribute('data-w', String(W)); svgEl.setAttribute('data-s', String(s));
      var list = ordered(), two = list.length === 2;
      /* triangles first (tint for the first / only observer, hatching for the second) */
      list.forEach(function (ob, i) {
        var x = S.anim && S.anim.id === ob.id ? S.anim.x : xOf(G, ob.ang);
        ob._x = x;
        var d = 'M' + f1(x) + ',' + f1(ye) + ' L' + f1(G.x0) + ',' + f1(ye) + ' L' + f1(G.x0) + ',' + f1(top) + ' Z';
        out += i === 0 ? P(d, 'none', { fill: C1BG, sw: 0, cls: 'hd-tri' }) : P(d, C2, { fill: 'url(#' + uid + '-h)', sw: 0.8, cls: 'hd-tri2' });
      });
      /* ground with hatching, tower with right-angle box */
      var hp = '';
      for (var hx = 8; hx <= W - 4; hx += 8) hp += 'M' + hx + ',' + (gy + 3) + ' l-6,7 ';
      out += P(hp, SOFT, { sw: 1 }) + P('M4,' + gy + ' H' + (W - 4), INK, { sw: 2.8 });
      out += '<rect x="' + (G.x0 - 8) + '" y="' + f1(top) + '" width="8" height="' + f1(gy - top) + '" fill="' + HYP + '" stroke="' + INK + '" stroke-width="1.2"/>';
      out += P('M' + G.x0 + ',' + gy + ' V' + f1(top), INK, { sw: 2.8, cls: 'hd-tower' });
      out += P('M' + (G.x0 + 8) + ',' + gy + ' V' + (gy - 8) + ' H' + G.x0, INK, { sw: 1.3 });
      if (e) out += P('M' + (G.x0 + 8) + ',' + f1(ye) + ' V' + f1(ye - 8) + ' H' + G.x0, INK, { sw: 1.3 });
      /* left labels: the triangle's vertical side (and the eye height below it) */
      var lx = 16, lab;
      if (two) lab = 'shared height ' + hdHalf(k2()) + ' m';
      else lab = e ? 'H − 1.5 = ' + hdHalf(k2()) + ' m' : 'height ' + S.H + ' m';
      out += P('M' + (lx + 6) + ',' + f1(top) + ' V' + f1(ye) + ' M' + (lx + 3) + ',' + f1(top) + ' h6 M' + (lx + 3) + ',' + f1(ye) + ' h6', SOFT, { sw: 1.2 });
      if (tw(lab, sz, true) > ye - top - 4) lab = two ? 'shared height' : e ? 'H − 1.5' : 'height';   /* short tower: shorter label */
      out += T(lx - 3, (top + ye) / 2, lab, sz, { bold: true, rot: -90, fill: two ? ACC : INK, cls: 'hd-hlab' });
      var taken = [];
      if (e) {
        out += P('M' + (lx + 6) + ',' + gy + ' V' + f1(ye), C1, { sw: 2.2 });
        var et = 'eye height 1.5 m', ew = tw(et, 12.5, true);
        out += T(4, gy + 26, et, 12.5, { anchor: 'start', bold: true, fill: C1, cls: 'hd-elab' });
        taken.push([2, 4 + ew + 4]);
      }
      /* each observer: dashed horizontal, line of sight with arrow-head, arc and value, stick figure / eye dot */
      list.forEach(function (ob, i) {
        var x = ob._x, moving = S.anim && S.anim.id === ob.id;
        out += P('M' + f1(x) + ',' + f1(ye) + ' H' + G.x0, INK, { sw: 1.5, dash: '6 4' });
        out += P('M' + x.toFixed(2) + ',' + ye.toFixed(2) + ' L' + G.x0 + ',' + top.toFixed(2), INK, { sw: 1.7, cls: 'hd-sight' });
        var t = Math.atan2(top - ye, G.x0 - x), hd = 7;
        out += P('M' + f1(G.x0 - hd * Math.cos(t - 0.42)) + ',' + f1(top - hd * Math.sin(t - 0.42)) + ' L' + G.x0 + ',' + f1(top) +
          ' L' + f1(G.x0 - hd * Math.cos(t + 0.42)) + ',' + f1(top - hd * Math.sin(t + 0.42)), INK, { sw: 1.7 });
        if (!moving) {
          var a = ob.ang * Math.PI / 180, r = 24 + (i ? 0 : 0);
          out += P('M' + f1(x - r) + ',' + f1(ye) + ' A' + r + ',' + r + ' 0 0 1 ' + f1(x - r * Math.cos(a)) + ',' + f1(ye - r * Math.sin(a)), INK, { sw: 1.6, cls: 'hd-arc' });
          var lr = 41, lxp = x - lr * Math.cos(a / 2), lyp = ye - lr * Math.sin(a / 2) + 4.5, at = ob.ang + '°';
          out += halo(lxp, lyp, tw(at, 13, true), 13) + T(lxp, lyp, at, 13, { bold: true, cls: 'hd-ang', fill: INK });
        }
        /* figure: eye dot at the true eye height; body only when the eye is above the ground */
        var fig = '';
        if (e) {
          var hh = gy - ye, rr = Math.max(2.4, Math.min(5, hh * 0.22));
          fig += '<circle cx="' + f1(x) + '" cy="' + f1(ye + rr * 0.15) + '" r="' + f1(rr) + '" fill="' + CARD + '" stroke="' + INK + '" stroke-width="1.3"/>';
          var hip = gy - Math.max(2.5, hh * 0.4);
          fig += P('M' + f1(x) + ',' + f1(ye + rr * 1.15) + ' V' + f1(hip) + ' L' + f1(x - 3) + ',' + gy + ' M' + f1(x) + ',' + f1(hip) + ' L' + f1(x + 3) + ',' + gy, INK, { sw: 1.3 });
        } else {
          fig += P('M' + f1(x - 6) + ',' + (gy + 11) + ' L' + f1(x) + ',' + (gy + 4) + ' L' + f1(x + 6) + ',' + (gy + 11) + ' Z', INK, { fill: two && i ? C2 : C1, sw: 1 });
        }
        fig += '<circle cx="' + f1(x) + '" cy="' + f1(ye) + '" r="3.2" fill="' + INK + '"/>';
        out += fig;
        if (two) {
          var nm = i ? 'second' : 'first', w = tw(nm, 13, true), cx = Math.min(W - w / 2 - 2, x + 10);
          out += halo(cx, ye - 34, w, 13) + T(cx, ye - 34, nm, 13, { bold: true, fill: i ? C2 : C1, cls: 'hd-olab' });
        }
      });
      /* mode 2: the bracket between the observers on the ground */
      if (two && !S.anim) {
        var xa = list[1]._x, xb = list[0]._x, by = gy + 9, bt = 'distance between the observers', bw = tw(bt, 12.5, true);
        out += P('M' + f1(xa) + ',' + (by - 4) + ' V' + (by + 4) + ' M' + f1(xa) + ',' + by + ' H' + f1(xb) + ' M' + f1(xb) + ',' + (by - 4) + ' V' + (by + 4), ACC, { sw: 1.6, cls: 'hd-gap' });
        var cxm = Math.max(2 + bw / 2, Math.min(W - 2 - bw / 2, (xa + xb) / 2)), ty = gy + 26;
        if (taken.some(function (t) { return cxm - bw / 2 < t[1] + 4; })) {
          cxm = Math.max(taken[0][1] + 8 + bw / 2, cxm);
          if (cxm + bw / 2 > W - 2) { cxm = Math.max(2 + bw / 2, Math.min(W - 2 - bw / 2, (xa + xb) / 2)); ty = gy - 8; }
        }
        out += (ty < gy ? halo(cxm, ty, bw, 12.5) : '') + T(cxm, ty, bt, 12.5, { bold: true, fill: ACC, cls: 'hd-gaplab' });
      }
      /* drag ghost */
      if (S.drag && S.drag.gx != null) {
        out += '<circle class="hd-ghost" cx="' + f1(S.drag.gx) + '" cy="' + f1(gy) + '" r="9" fill="none" stroke="' + ACC + '" stroke-width="2" stroke-dasharray="3 3"/>';
      }
      /* the draggable observers: 44 × 44 px hit area centred on the feet */
      list.forEach(function (ob, i) {
        var x = ob._x, dd = hdDist(k2(), ob.ang), nm = two ? (i ? 'second observer' : 'first observer') : 'observer';
        out += '<g class="hd-ob" tabindex="0" role="slider" data-ob="' + ob.id + '" data-x="' + (x - G.x0).toFixed(2) + '" aria-label="' + nm + '" aria-valuemin="30" aria-valuemax="60" aria-valuenow="' + ob.ang +
          '" aria-valuetext="angle of elevation ' + ob.ang + ' degrees, distance ' + dd.say + ' metres" aria-orientation="horizontal">' +
          '<rect class="hd-hit" x="' + f1(x - 22) + '" y="' + f1(gy - 22) + '" width="44" height="44" fill="transparent"/>' +
          '<circle class="hd-ring" cx="' + f1(x) + '" cy="' + gy + '" r="15" fill="none" stroke-width="2.5"/></g>';
      });
      var focused = document.activeElement && root.contains(document.activeElement) && document.activeElement.getAttribute('data-ob');
      g.innerHTML = out;
      if (focused) { var fe = $('[data-ob="' + focused + '"]', g); if (fe) fe.focus(); }
      $('title', svgEl).textContent = two ? 'A tower ' + S.H + ' m tall seen from two places, at ' + list[0].ang + '° and ' + list[1].ang + '°'
        : 'A tower ' + S.H + ' m tall seen at an angle of elevation of ' + list[0].ang + '°';
    }
    function L(h, cls) { return '<div class="hd-l' + (cls ? ' ' + cls : '') + '"><span class="mx">' + h + '</span></div>'; }
    var TV = { 60: hdRt('3'), 45: '1', 30: hdFr('1', hdRt('3')) };
    function working() {
      var K2 = k2(), kS = hdHalf(K2), e = S.e2, h = '', list = ordered();
      var eyeLine = e ? '<p class="hd-cap hd-other">height above the eye</p>' + L('= ' + S.H + ' − 1.5 = ' + kS) : '';
      if (list.length === 1) {
        var a = list[0].ang, dd = hdDist(K2, a), dI = '<i>d</i>';
        h += '<div class="hd-l hd-l0">' + (HD_TEX.tan || '<span class="mx">tan <i>θ</i> = ' + hdFr('height', 'distance') + '</span>') + '</div>';
        h += eyeLine;
        h += L('tan ' + a + '° = ' + hdFr(kS, dI));
        h += L(TV[a] + ' = ' + hdFr(kS, dI));
        if (a === 60) h += L(dI + ' = ' + hdFr(kS, hdRt('3')) + ' = ' + dd.h);
        else if (a === 45) h += L(dI + ' = ' + kS);
        else h += L(dI + ' = ' + kS + ' × ' + hdRt('3') + ' = ' + dd.h);
        h += a === 45 ? L('distance = ' + kS + ' m', 'hd-ans') : L('distance = ' + dd.h, 'hd-ans') + L('≈ ' + hdDec(dd.th) + ' m', 'hd-ans') + '<p class="hd-cap">(' + hdRt('3') + ' = 1.732)</p>';
        h += '<p class="hd-cap hd-other">the other way round: height = <i>d</i> × tan <i>θ</i></p>';
        h += L('= ' + dd.h + ' × ' + TV[a] + ' = ' + kS + ' m');
        if (e) h += '<p class="hd-cap">that is above the eye; add the eye height:</p>' + L('tower = ' + kS + ' + 1.5 = ' + S.H + ' m');
        S.read = { exact: dd.t, dec: a === 45 ? '' : hdDec(dd.th) };
      } else {
        var a1 = list[0].ang, a2 = list[1].ang, d1 = hdDist(K2, a1), d2 = hdDist(K2, a2), c2 = K2 / 3, ex, exH, th;
        h += '<div class="hd-l hd-l0">' + (HD_TEX.d || '<span class="mx"><i>d</i> = ' + hdFr('<i>H</i> − <i>e</i>', 'tan <i>θ</i>') + '</span>') + '</div>';
        h += eyeLine;
        h += L('first: <i>d</i><sub>1</sub> = ' + hdFr(kS, 'tan ' + a1 + '°') + ' = ' + d1.h);
        h += L('second: <i>d</i><sub>2</sub> = ' + hdFr(kS, 'tan ' + a2 + '°') + ' = ' + d2.h);
        h += L('distance between = <i>d</i><sub>1</sub> − <i>d</i><sub>2</sub>');
        h += L('= ' + d1.h + ' − ' + d2.h);
        if (a1 === 30 && a2 === 60) { ex = hdCo(2 * c2) + '√3'; exH = hdCo(2 * c2) + hdRt('3'); th = 2 * c2 * 866; }
        else if (a1 === 30) { ex = kS + '(√3 − 1)'; exH = kS + '(' + hdRt('3') + ' − 1)'; th = K2 * 366; }
        else { ex = hdHalf(c2) + '(3 − √3)'; exH = hdHalf(c2) + '(3 − ' + hdRt('3') + ')'; th = c2 * 634; }
        h += L('= ' + exH);
        h += L('≈ ' + hdDec(th) + ' m', 'hd-ans') + '<p class="hd-cap">(' + hdRt('3') + ' = 1.732)</p>';
        h += '<p class="hd-cap hd-other">so if you know the distance walked, height above the eye =</p>';
        h += '<div class="hd-l hd-l0">' + (HD_TEX.walk || '<span class="mx">walk ÷ (1/tan <i>θ</i><sub>1</sub> − 1/tan <i>θ</i><sub>2</sub>)</span>') + '</div>';
        h += '<p class="hd-cap hd-other">add the eye height for the tower</p>';
        S.read = { exact: ex, dec: hdDec(th) };
      }
      work.innerHTML = h;
      root.setAttribute('data-exact', S.read.exact); root.setAttribute('data-dec', S.read.dec);
    }
    var workT = mThrottle(working, 250);
    function sync() {
      $$('.hd-mode button', root).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === S.mode ? 'true' : 'false'); });
      $$('.hd-eye button', root).forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-v') === S.e2 ? 'true' : 'false'); });
      $('.hd-hv', root).textContent = S.H + ' m';
      $('.hd-dec', root).disabled = S.H <= 12; $('.hd-inc', root).disabled = S.H >= 48;
      var list = ordered(), two = list.length === 2;
      $$('.hd-pick', root).forEach(function (row, i) {
        row.hidden = !two && i === 1;
        $('.hd-pl', row).textContent = two ? (i ? 'second' : 'first') : 'angle of elevation';
        row.setAttribute('aria-label', (two ? (i ? 'second observer' : 'first observer') : 'observer') + ': angle of elevation');
        if (!list[i]) return;
        row.setAttribute('data-ob', list[i].id);
        $$('button', row).forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-a') === list[i].ang ? 'true' : 'false'); });
      });
      $('.hd-hint', root).textContent = two ? 'drag the observers' : 'drag the observer';
      root.setAttribute('data-mode', S.mode); root.setAttribute('data-h', String(S.H)); root.setAttribute('data-e', hdHalf(S.e2));
      root.setAttribute('data-angs', list.map(function (o) { return o.ang; }).join(','));
    }
    function render(now) { draw(); sync(); if (now) working(); else workT(); }
    function refuse() {
      note.textContent = HD_NOTE; note.hidden = false;
      clearTimeout(noteT);
      noteT = setTimeout(function () { note.hidden = true; note.textContent = ''; }, 3000);
    }
    function other(ob) { var o = obs(); return o.length === 2 ? (o[0] === ob ? o[1] : o[0]) : null; }
    function slide(ob, from, to, done) {               /* sliding snap; instant with reduced motion */
      if (reduced || Math.abs(from - to) < 1) { S.anim = null; done(); return; }
      var t0 = null, dur = 220;
      function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur), q = 1 - (1 - p) * (1 - p);
        S.anim = { id: ob.id, x: from + (to - from) * q };
        draw();
        if (p < 1) requestAnimationFrame(step); else { S.anim = null; done(); }
      }
      requestAnimationFrame(step);
    }
    function setAng(ob, a, now) {                     /* refuse to put the two observers together */
      if (a === ob.ang) { render(now); return true; }
      var o2 = other(ob);
      if (o2 && o2.ang === a) { refuse(); render(true); return false; }
      var G = geo(), from = S.anim && S.anim.id === ob.id ? S.anim.x : xOf(G, ob.ang);
      ob.ang = a;
      slide(ob, from, xOf(G, a), function () { render(now); });
      if (!reduced) { sync(); workT(); }
      return true;
    }
    /* ---- pointer: the nearer observer whose 44 × 44 box (centred on its feet) holds the pointer */
    function svgPt(ev) {
      var rc = svgEl.getBoundingClientRect(), vb = svgEl.viewBox.baseVal;
      return [(ev.clientX - rc.left) * vb.width / rc.width, (ev.clientY - rc.top) * vb.height / rc.height];
    }
    function nearestAng(G, x) {
      var best = 60, bd = 1e9;
      HD_ANG.forEach(function (a) { var d = Math.abs(xOf(G, a) - x); if (d < bd) { bd = d; best = a; } });
      return best;
    }
    on(svgEl, 'pointerdown', function (ev) {
      var G = geo(), q = svgPt(ev), best = null, bd = 1e9;
      obs().forEach(function (ob) {
        var dx = q[0] - xOf(G, ob.ang), dy = q[1] - G.gy;
        if (Math.abs(dx) <= 22 && Math.abs(dy) <= 22 && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = ob; }
      });
      if (!best) return;
      ev.preventDefault();
      var h = $('[data-ob="' + best.id + '"]', g); if (h) h.focus();
      try { svgEl.setPointerCapture(ev.pointerId); } catch (er) { /* ignore */ }
      S.drag = { ob: best, gx: null, last: 0, refused: false, start: best.ang };
    });
    on(svgEl, 'pointermove', function (ev) {
      if (!S.drag) return;
      var G = geo(), q = svgPt(ev), x = Math.max(G.x0 + 6, Math.min(G.W - 6, q[0]));   /* horizontal only */
      S.drag.gx = x;
      var now = Date.now(), ob = S.drag.ob;
      if (now - S.drag.last >= 250) {               /* snap while dragging, at most every 250 ms */
        S.drag.last = now;
        var a = nearestAng(G, x), o2 = other(ob);
        if (a !== ob.ang) {
          if (o2 && o2.ang === a) { if (!S.drag.refused) refuse(); S.drag.refused = true; }
          else { S.drag.refused = false; ob.ang = a; render(); return; }
        }
      }
      draw();
    });
    function endDrag(ev) {
      if (!S.drag) return;
      var G = geo(), d = S.drag, ob = d.ob;
      S.drag = null;
      if (d.gx != null) {
        var a = nearestAng(G, d.gx), o2 = other(ob);
        if (o2 && o2.ang === a) { ob.ang = d.start; refuse(); render(true); return; }   /* refused: back to where it was */
        if (a !== ob.ang) { setAng(ob, a, true); return; }
      }
      render(true);
    }
    on(svgEl, 'pointerup', endDrag);
    on(svgEl, 'pointercancel', endDrag);
    /* ---- keyboard: Left = one place nearer the tower (bigger angle), Right = farther, Home = 60°, End = 30° */
    on(g, 'keydown', function (ev) {
      var hEl = ev.target.closest && ev.target.closest('.hd-ob'); if (!hEl) return;
      var ob = obs().filter(function (o) { return o.id === hEl.getAttribute('data-ob'); })[0]; if (!ob) return;
      var i = HD_ANG.indexOf(ob.ang), k = ev.key, a;
      if (k === 'ArrowLeft' || k === 'ArrowUp') a = HD_ANG[Math.max(0, i - 1)];
      else if (k === 'ArrowRight' || k === 'ArrowDown') a = HD_ANG[Math.min(2, i + 1)];
      else if (k === 'Home') a = 60; else if (k === 'End') a = 30; else return;
      ev.preventDefault();
      setAng(ob, a, true);
    });
    $$('.hd-pick', root).forEach(function (row, i) {
      $$('button', row).forEach(function (b) {
        on(b, 'click', function () {
          var list = ordered(), ob = list[i]; if (!ob) return;
          setAng(ob, +b.getAttribute('data-a'), true);
        });
      });
    });
    $$('.hd-mode button', root).forEach(function (b) { on(b, 'click', function () { S.mode = b.getAttribute('data-v'); S.anim = null; render(true); }); });
    $$('.hd-eye button', root).forEach(function (b) { on(b, 'click', function () { S.e2 = +b.getAttribute('data-v'); render(true); }); });
    on($('.hd-dec', root), 'click', function () { if (S.H > 12) { S.H -= 6; render(true); } });
    on($('.hd-inc', root), 'click', function () { if (S.H < 48) { S.H += 6; render(true); } });
    var lastW = 0;
    function onResize() { var w = Math.round(root.clientWidth); if (w === lastW) return; lastW = w; render(true); }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(root);
    on(window, 'resize', onResize);
    lastW = Math.round(root.clientWidth);
    render(true);
  }

  /* ---------------------------------------------------- checkerboard builder (Science Ch 8, T02-V9)
     svg[data-cb] is the static first view (content/C10-SCI-CH08/diagrams/_src/cb8.py, the Tt x Tt cross worked through);
     initCb replaces it. The rules (gametes, boxes, looks, groups, ratios, percentages, expected numbers) are the same as
     the cross engine in _src/c8lib.py, which checks every drawn checkerboard. Topic 3 (figure id -T03.) opens in
     "Two traits" mode; Topic 2 and the wrap-up in "One trait". Nothing is stored. */
  var CB_T = { T: ['Plant height', 'tall', 'short'], V: ['Flower colour', 'violet', 'white'], R: ['Seed shape', 'round', 'wrinkled'], Y: ['Seed colour', 'yellow', 'green'] };
  var CB_ONE = ['T', 'V', 'R', 'Y'];
  var CB_TWO = [['R', 'Y'], ['T', 'V'], ['T', 'R']];
  var CB_PICK = {
    one: [['Pure × pure', [[0], [2]]], ['F1 × F1', [[1], [1]]], ['F1 × recessive', [[1], [2]]]],
    two: [['Fig 8.5 parents', [[0, 2], [2, 0]]], ['F1 × F1', [[1, 1], [1, 1]]], ['F1 × double recessive', [[1, 1], [2, 2]]]]
  };
  function cbGene(L, k) { var l = L.toLowerCase(); return [L + L, L + l, l + l][k]; }
  function cbGametes(genes) {                 /* genes = ['Rr', 'Yy'] -> each DIFFERENT gamete once, one letter per gene */
    var out = [''];
    genes.forEach(function (g) {
      var cps = g[0] === g[1] ? [g[0]] : [g[0], g[1]], nx = [];
      out.forEach(function (o) { cps.forEach(function (c) { if (nx.indexOf(o + c) < 0) nx.push(o + c); }); });
      out = nx;
    });
    return out;
  }
  function cbCombine(a, b) {                  /* gene by gene, capital first: T + t -> Tt; t + T -> Tt */
    var s = '';
    for (var i = 0; i < a.length; i++) { var x = a[i], y = b[i]; s += (x === x.toUpperCase() || y !== y.toUpperCase()) ? x + y : y + x; }
    return s;
  }
  function cbDom(make, i) { return make[2 * i] === make[2 * i].toUpperCase(); }
  function cbPct(boxes, n) {                  /* at most 2 decimals, no trailing zeros (n divides 10 000) */
    var h = boxes * 10000 / n, w = Math.floor(h / 100), r = h % 100;
    return w + (r ? '.' + (r < 10 ? '0' + r : String(r)).replace(/0$/, '') : '') + '%';
  }
  function cbExpected(boxes, n, total) {      /* whole -> '600'; else up to 4 decimals, then '(about N)', .5 rounded up */
    var num = boxes * total, w = Math.floor(num / n), rem = num % n;
    if (!rem) return { t: String(w), whole: true };
    var d = String(rem * 10000 / n);
    while (d.length < 4) d = '0' + d;
    return { t: w + '.' + d.replace(/0+$/, '') + ' (about ' + (w + (2 * rem >= n ? 1 : 0)) + ')', whole: false };
  }
  function initCb() {
    $$('svg[data-cb]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-cb-on')) return;
      art.setAttribute('data-cb-on', '1');
      var fig = svg.closest('.fig'), t3 = /-T03\./.test(fig ? fig.getAttribute('data-block-id') || '' : '');
      if (fig) fig.classList.add('fig--cb');
      cbBuild(art, t3 ? 'two' : 'one');
    });
  }
  function cbBuild(art, mode0) {
    var uid = 'cb' + Math.random().toString(36).slice(2, 7);
    var S = {};
    var root = document.createElement('div');
    root.className = 'cb';
    root.innerHTML =
      '<div class="cb-seg" role="group" aria-label="Mode"><button type="button" class="cb-m" data-m="one" aria-pressed="false">One trait</button>' +
      '<button type="button" class="cb-m" data-m="two" aria-pressed="false">Two traits</button></div>' +
      '<div class="cb-sel"><label class="cb-lab" for="' + uid + '-t"></label><select class="cb-tsel" id="' + uid + '-t"></select></div>' +
      '<div class="cb-pars"></div>' +
      '<div class="cb-quick" role="group" aria-label="Quick picks"></div>' +
      '<div class="cb-acts"><button type="button" class="cb-b cb-make">Make gametes</button>' +
      '<button type="button" class="cb-b cb-fill" disabled>Fill the checkerboard</button>' +
      '<button type="button" class="cb-b cb-next" disabled>Next box</button>' +
      '<button type="button" class="cb-b cb-all" disabled>Fill all</button></div>' +
      '<p class="cb-msg" hidden></p>' +
      '<div class="cb-gam" hidden></div>' +
      '<div class="cb-boardw" hidden><table class="cb-board"><caption>Checkerboard: Parent 1\'s gametes down the side, Parent 2\'s gametes along the top</caption>' +
      '<thead></thead><tbody></tbody></table></div>' +
      '<div class="cb-res" tabindex="-1" hidden></div>' +
      '<div class="cb-tot"><label for="' + uid + '-n">Out of a total of</label>' +
      '<input type="number" class="cb-n" id="' + uid + '-n" min="1" max="100000" step="1" inputmode="numeric" autocomplete="off" aria-describedby="' + uid + '-e">' +
      '<span>offspring</span><p class="cb-err" id="' + uid + '-e" hidden>Enter a whole number from 1 to 100 000.</p></div>' +
      '<button type="button" class="cb-b cb-reset">Start again</button>' +
      '<div class="cb-live sr" aria-live="polite"></div>';
    art.innerHTML = '';
    art.appendChild(root);
    var q = function (c) { return $('.' + c, root); };
    var sel = q('cb-tsel'), pars = q('cb-pars'), quick = q('cb-quick'), live = q('cb-live'), msg = q('cb-msg');
    var bFill = q('cb-fill'), bNext = q('cb-next'), bAll = q('cb-all'), wrap = q('cb-boardw'), res = q('cb-res'), inp = q('cb-n'), err = q('cb-err');
    function letters() { return S.mode === 'one' ? [CB_ONE[S.ti]] : CB_TWO[S.pi]; }
    function make(p) { var L = letters(); return L.map(function (l, i) { return cbGene(l, S.P[p][i]); }); }
    function lookOf(m) {
      return letters().map(function (L, i) { return cbDom(m, i) ? CB_T[L][1] : CB_T[L][2]; });
    }
    function groupOf(m) {
      if (S.mode === 'one') return cbDom(m, 0) ? 'A' : 'B';
      return ['D', 'C', 'B', 'A'][(cbDom(m, 0) ? 2 : 0) + (cbDom(m, 1) ? 1 : 0)];
    }
    function say(t) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 30); }
    function defaults(mode) {
      S = { mode: mode, ti: 0, pi: 0, P: mode === 'one' ? [[1], [1]] : [[1, 1], [1, 1]], made: false, g: null, shown: false, filled: null, total: null };
    }
    /* ---- controls */
    function buildControls() {
      $$('.cb-m', root).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === S.mode ? 'true' : 'false'); });
      $('.cb-lab', root).textContent = S.mode === 'one' ? 'Trait' : 'Pair of traits';
      sel.innerHTML = S.mode === 'one'
        ? CB_ONE.map(function (L, i) { var t = CB_T[L]; return '<option value="' + i + '">' + t[0] + ' (' + L + ' ' + t[1] + ' / ' + L.toLowerCase() + ' ' + t[2] + ')</option>'; }).join('')
        : CB_TWO.map(function (p, i) { return '<option value="' + i + '">' + CB_T[p[0]][0] + ' + ' + CB_T[p[1]][0].toLowerCase() + ' (' + p[0] + ', ' + p[1] + ')</option>'; }).join('');
      sel.value = String(S.mode === 'one' ? S.ti : S.pi);
      var L = letters(), h = '';
      for (var p = 0; p < 2; p++) {
        h += '<fieldset class="cb-par"><legend>Parent ' + (p + 1) + '</legend>';
        L.forEach(function (l, gi) {
          var t = CB_T[l];
          h += '<fieldset class="cb-gene"><legend>' + t[0] + '</legend><div class="cb-rs">';
          for (var k = 0; k < 3; k++) {
            h += '<label class="cb-r"><input type="radio" name="' + uid + '-p' + p + 'g' + gi + '" value="' + k + '" data-p="' + p + '" data-g="' + gi + '"' +
              (S.P[p][gi] === k ? ' checked' : '') + '><span>' + cbGene(l, k) + ' (' + (k < 2 ? t[1] : t[2]) + ')</span></label>';
          }
          h += '</div></fieldset>';
        });
        h += '</fieldset>';
      }
      pars.innerHTML = h;
      quick.innerHTML = CB_PICK[S.mode].map(function (pk, i) { return '<button type="button" class="cb-b cb-qp" data-i="' + i + '">' + pk[0] + '</button>'; }).join('') +
        '<button type="button" class="cb-b cb-swap">Swap parents</button>';
      $$('input[type=radio]', pars).forEach(function (r) {
        on(r, 'change', function () { if (!r.checked) return; S.P[+r.getAttribute('data-p')][+r.getAttribute('data-g')] = +r.value; changed(); });
      });
      $$('.cb-qp', quick).forEach(function (b) {
        on(b, 'click', function () {
          var v = CB_PICK[S.mode][+b.getAttribute('data-i')][1];
          if (JSON.stringify(v) === JSON.stringify(S.P)) return;
          S.P = JSON.parse(JSON.stringify(v)); syncRadios(); changed();
        });
      });
      on($('.cb-swap', quick), 'click', swap);
    }
    function syncRadios() { $$('input[type=radio]', pars).forEach(function (r) { r.checked = S.P[+r.getAttribute('data-p')][+r.getAttribute('data-g')] === +r.value; }); }
    function clearWork() { S.made = false; S.g = null; S.shown = false; S.filled = null; }
    function changed() {                      /* a parent, the trait or the pair changed */
      if (S.made) { clearWork(); msg.textContent = 'Parents changed — make the gametes again.'; msg.hidden = false; say(msg.textContent); }
      render();
    }
    function swap() {
      S.P = [S.P[1], S.P[0]]; syncRadios();
      if (S.made) {                           /* not a parent change: the board is transposed and kept */
        S.g = [S.g[1], S.g[0]];
        if (S.filled) S.filled = S.filled[0].map(function (_, j) { return S.filled.map(function (row) { return row[j]; }); });
        say('Parents swapped: rows and columns are swapped; the results are the same.');
      }
      render();
    }
    /* ---- the work */
    function boxes() { return S.g[0].map(function (r) { return S.g[1].map(function (c) { return cbCombine(r, c); }); }); }
    function full() { return S.filled && S.filled.every(function (row) { return row.every(Boolean); }); }
    function lookTxt(m, sep) { return lookOf(m).join(sep); }
    function boxSay(i, j) {
      var m = boxes()[i][j];
      return 'Row ' + S.g[0][i] + ', column ' + S.g[1][j] + ': ' + m + ', ' + lookTxt(m, ', ') + ' — group ' + groupOf(m);
    }
    function stats() {
      var bx = boxes(), flat = [].concat.apply([], bx), n = flat.length, order = S.mode === 'one' ? ['A', 'B'] : ['A', 'B', 'C', 'D'];
      var cnt = {}, lk = {};
      order.forEach(function (g) { cnt[g] = 0; });
      flat.forEach(function (m) { var g = groupOf(m); cnt[g]++; lk[g] = lk[g] || m; });
      var shown = order.filter(function (g) { return cnt[g]; });
      var h = shown.reduce(function (a, g) { return mGcd(a, cnt[g]); }, 0);
      return { n: n, cnt: cnt, lk: lk, shown: shown, ratio: shown.map(function (g) { return cnt[g] / h; }), flat: flat };
    }
    function summary() {
      var s = stats();
      var t = s.n + ' box' + (s.n === 1 ? '' : 'es') + ': ' + s.shown.map(function (g) { return s.cnt[g] + ' ' + lookTxt(s.lk[g], ' '); }).join(', ') + '. ';
      if (s.shown.length === 1) return t + 'All offspring look the same: ' + lookTxt(s.lk[s.shown[0]], ', ') + ' (100%).';
      return t + 'Ratio ' + s.ratio.join(' : ') + '.';
    }
    function fillOne() {
      for (var i = 0; i < S.filled.length; i++) for (var j = 0; j < S.filled[i].length; j++) if (!S.filled[i][j]) { S.filled[i][j] = 2; return [i, j]; }
      return null;
    }
    on(q('cb-make'), 'click', function () {
      S.g = [cbGametes(make(0)), cbGametes(make(1))];
      S.made = true; S.shown = false; S.filled = null;
      msg.hidden = true;
      render();
      say([0, 1].map(function (p) { return 'Parent ' + (p + 1) + ' (' + make(p).join('') + ') gametes: ' + S.g[p].join(', ') + '.'; }).join(' '));
    });
    on(bFill, 'click', function () {
      if (!S.made) return;
      S.shown = true;
      S.filled = S.g[0].map(function () { return S.g[1].map(function () { return 0; }); });
      render();
      say('Checkerboard ready: ' + S.g[0].length * S.g[1].length + ' box' + (S.g[0].length * S.g[1].length === 1 ? '' : 'es') + ' to fill.');
    });
    on(bNext, 'click', function () {
      if (!S.shown || full()) return;
      var ij = fillOne();
      render();
      var t = boxSay(ij[0], ij[1]);
      if (full()) { t += '. ' + summary(); res.focus(); }
      say(t);
    });
    on(bAll, 'click', function () {
      if (!S.shown || full()) return;
      while (fillOne()) { /* fill the rest */ }
      render();
      res.focus();
      say(summary());
    });
    on(q('cb-reset'), 'click', function () {
      defaults(S.mode); inp.value = ''; msg.hidden = true; buildControls(); render(); say('Started again.');
    });
    $$('.cb-m', root).forEach(function (b) {
      on(b, 'click', function () {
        var m = b.getAttribute('data-m'); if (m === S.mode) return;
        defaults(m); inp.value = ''; msg.hidden = true; buildControls(); render();
      });
    });
    on(sel, 'change', function () { if (S.mode === 'one') S.ti = +sel.value; else S.pi = +sel.value; buildControls(); changed(); });
    function readTotal() {
      var v = inp.value.trim(), bad = inp.validity && inp.validity.badInput;
      if (!v && !bad) { S.total = null; err.hidden = true; inp.removeAttribute('aria-invalid'); return; }
      if (!bad && /^\d+$/.test(v) && +v >= 1 && +v <= 100000) { S.total = +v; err.hidden = true; inp.removeAttribute('aria-invalid'); return; }
      S.total = null; err.hidden = false; inp.setAttribute('aria-invalid', 'true');
    }
    on(inp, 'input', function () { readTotal(); renderRes(); });
    on(inp, 'change', function () { readTotal(); renderRes(); });
    /* ---- drawing */
    function cellW() {
      var W = wrap.clientWidth, n = S.g[1].length + 1;
      return Math.min(120, Math.floor((W - (n - 1) * 2) / n));
    }
    function renderBoard() {
      wrap.hidden = !S.shown;
      if (!S.shown) return;
      var c = cellW(), n = S.g[1].length + 1, words = c >= 64, one = c >= 112, bx = boxes();
      root.setAttribute('data-cell', c);
      var tb = $('.cb-board', root);
      tb.style.width = (n * c + (n + 1) * 2) + 'px';
      var hd = '<tr><td class="cb-corner" style="width:' + c + 'px"></td>' + S.g[1].map(function (g) { return '<th scope="col" style="width:' + c + 'px">' + g + '</th>'; }).join('') + '</tr>';
      $('thead', tb).innerHTML = hd;
      var body = '';
      S.g[0].forEach(function (rg, i) {
        body += '<tr><th scope="row">' + rg + '</th>';
        S.g[1].forEach(function (cg, j) {
          var f = S.filled[i][j];
          if (!f) { body += '<td class="cb-box cb-empty"><span class="sr">empty</span></td>'; return; }
          var m = bx[i][j], g = groupOf(m), lk = lookOf(m);
          var w = lk.length === 1 ? lk[0] : (one ? lk.join(', ') : lk[0] + ',<br>' + lk[1]);
          body += '<td class="cb-box cb-g-' + g + (f === 2 && !reduced ? ' cb-new' : '') + '" data-m="' + m + '"><span class="cb-gm" aria-hidden="true">' + g + '</span>' +
            '<span class="cb-l">' + m + '</span>' + (words ? '<span class="cb-w">' + w + '</span>' : '<span class="sr">' + lk.join(', ') + '</span>') +
            '<span class="sr"> group ' + g + '</span></td>';
          S.filled[i][j] = 1;
        });
        body += '</tr>';
      });
      $('tbody', tb).innerHTML = body;
      root.classList.toggle('cb-nowords', !words);
    }
    function frH(a, b) { return '<span class="gx-fr cb-fr"><span>' + a + '</span><span class="sr">/</span><span>' + b + '</span></span>'; }
    function renderRes() {
      var ok = S.shown && full();
      res.hidden = !ok;
      if (!ok) { res.innerHTML = ''; res.classList.remove('has-exp'); return; }
      var s = stats(), exp = S.total !== null, rounded = false, rows = '';
      s.shown.forEach(function (g) {
        var k = s.cnt[g], d = mGcd(k, s.n), lk = lookTxt(s.lk[g], ', ');
        var e = exp ? cbExpected(k, s.n, S.total) : null;
        if (e && !e.whole) rounded = true;
        rows += '<tr data-g="' + g + '"><td data-h="How they look"><span class="cb-sw cb-g-' + g + '" aria-hidden="true">' + g + '</span>' + lk + '</td>' +
          '<td data-h="Boxes">' + k + '</td><td data-h="Fraction">' + frH(k / d, s.n / d) + '</td><td data-h="Percentage">' + cbPct(k, s.n) + '</td>' +
          (exp ? '<td data-h="Expected number" class="cb-exp">' + e.t + '</td>' : '') + '</tr>';
      });
      var h = '<table class="cb-tab"><thead><tr><th scope="col">How they look</th><th scope="col">Boxes</th><th scope="col">Fraction</th><th scope="col">Percentage</th>' +
        (exp ? '<th scope="col">Expected number</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table>';
      if (rounded) h += '<p class="cb-note">Rounded numbers may not add up exactly to the total.</p>';
      if (s.shown.length === 1) h += '<p class="cb-ratio">All offspring look the same: ' + lookTxt(s.lk[s.shown[0]], ', ') + ' (100%)</p>';
      else h += '<p class="cb-ratio">' + s.shown.map(function (g) { return lookTxt(s.lk[g], ' '); }).join(' : ') + ' = ' + s.ratio.join(' : ') + '</p>';
      /* genetic make-up: capital-capital, capital-small, small-small for each gene; make-ups with 0 boxes left out */
      var L = letters(), mk = [], cnt = {};
      s.flat.forEach(function (m) { cnt[m] = (cnt[m] || 0) + 1; });
      var cls = function (l) { var x = l.toLowerCase(); return [l + l, l + x, x + x]; };
      if (L.length === 1) mk = cls(L[0]);
      else cls(L[0]).forEach(function (a) { cls(L[1]).forEach(function (b) { mk.push(a + b); }); });
      mk = mk.filter(function (m) { return cnt[m]; });
      var hc = mk.reduce(function (a, m) { return mGcd(a, cnt[m]); }, 0);
      var line = mk.length === 1 ? 'all ' + mk[0] + ' (' + cnt[mk[0]] + ' box' + (cnt[mk[0]] === 1 ? '' : 'es') + ')'
        : mk.join(' : ') + ' = ' + mk.map(function (m) { return cnt[m] / hc; }).join(' : ') + ' (boxes: ' + mk.map(function (m) { return m + ' ' + cnt[m]; }).join(', ') + ')';
      if (L.length === 1) h += '<p class="cb-mk">Genetic make-up: ' + line + '</p>';
      else h += '<details class="cb-mkd"><summary>Show genetic make-up</summary><ul>' +
        mk.map(function (m) { return '<li>' + m + ': ' + cnt[m] + ' box' + (cnt[m] === 1 ? '' : 'es') + '</li>'; }).join('') + '</ul>' +
        (mk.length > 1 ? '<p class="cb-mk">' + mk.join(' : ') + ' = ' + mk.map(function (m) { return cnt[m] / hc; }).join(' : ') + '</p>' : '') + '</details>';
      var open = $('.cb-mkd', res) && $('.cb-mkd', res).open;
      res.innerHTML = h;
      if (open && $('.cb-mkd', res)) $('.cb-mkd', res).open = true;
      res.classList.toggle('has-exp', exp);
    }
    function renderGam() {
      var gm = q('cb-gam');
      gm.hidden = !S.made;
      if (!S.made) { gm.innerHTML = ''; return; }
      gm.innerHTML = [0, 1].map(function (p) {
        var k = S.g[p].length;
        return '<div class="cb-gp"><p class="cb-gh">Parent ' + (p + 1) + ' (' + make(p).join('') + ') gametes:</p><p class="cb-chips">' +
          S.g[p].map(function (g) { return '<span class="cb-chip">' + g + '</span>'; }).join('') + '</p>' +
          '<p class="cb-gn">Parent ' + (p + 1) + ' makes ' + k + (k === 1 ? ' kind of gamete.' : ' kinds of gametes, in equal numbers.') + '</p></div>';
      }).join('');
    }
    function render() {
      bFill.disabled = !S.made || S.shown;
      bNext.disabled = bAll.disabled = !S.shown || full();
      renderGam();
      renderBoard();
      renderRes();
    }
    var lastW = 0;
    function onResize() { var w = wrap.clientWidth || root.clientWidth; if (w === lastW) return; lastW = w; if (S.shown) renderBoard(); }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(root); else on(window, 'resize', onResize);
    defaults(mode0);
    buildControls();
    render();
  }


  /* ---------------------------------------------------- defect-and-correction explorer (Science Ch 10, T02-V5)
     svg[data-ey] is the static first view (content/C10-SCI-CH10/diagrams/_src/d10_eye.py: normal eye, far object, no lens);
     its .ey-dyn group is redrawn here and its .ey-nojs readout is hidden. Model of the brief: the eye is ONE lens 2.0 cm
     from the retina whose power P_eye can be set between P_min and P_max; light arrives with vergence V (0 D far, −4 D for
     a book at 25 cm, plus the spectacle lens when on). P_eye = clamp(50 − V, P_min, P_max); v = 100 / (P_eye + V) cm.
     All powers are kept as whole numbers of 1/30 D, so the clamp and the sharp test are exact (50 D = 1500).
     The figure's data-block-id picks the opening state: the wrap-up opens on Presbyopia + Near. Nothing is stored. */
  var EY_EYES = [ /* name, P_min, P_max, spectacle power (1/30 D), lens words, power words, lens kind */
    ['Normal', 1500, 1620, null, '', '', ''],
    ['Myopia', 1575, 1695, -75, 'Concave lens, −2.5 D', '−2.5 D', 'concave'],
    ['Hypermetropia', 1440, 1540, 80, 'Convex lens, +2.67 D', '+2.67 D', 'convex'],
    ['Presbyopia', 1500, 1524, 96, 'Convex lens, +3.2 D', '+3.2 D', 'convex']];
  var EY_OBJ = [['Far away (a tree)', 0, 'far away (a tree)'], ['Near (a book at 25 cm)', -120, 'near (a book at 25 cm)']];
  var EY_WORDS = { on: 'Sharp — the image is on the retina', front: 'Blurred — the image is in front of the retina',
    behind: 'Blurred — the image is behind the retina' };
  var EY_NOTE = 'Simplified model, not to scale — the gap between the image and the retina is drawn larger so that you can see it.';
  function eyCase(e, o, on) {
    var E = EY_EYES[e], V = EY_OBJ[o][1] + (on && E[3] !== null ? E[3] : 0);
    var pe = Math.min(Math.max(1500 - V, E[1]), E[2]), s = pe + V;   /* s = P_eye + V in 1/30 D */
    var v = 3000 / s, gap = v - 2, x = 330 + 450 * gap;
    return { V: V, pe: pe, v: v, gap: gap, x: x, xc: Math.min(Math.max(x, 160), 396),
      state: s === 1500 ? 'on' : (s < 1500 ? 'behind' : 'front') };
  }
  function eyD(p) { return (p / 30).toFixed(p % 30 === 0 ? 0 : (p % 3 === 0 ? 1 : 2)).replace('-', '−'); }
  function initEy() {
    $$('svg[data-ey]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-ey-on')) return;
      art.setAttribute('data-ey-on', '1');
      var fig = svg.closest('.fig'), wrap = /-WRAPUP\./.test(fig ? fig.getAttribute('data-block-id') || '' : '');
      if (fig) fig.classList.add('fig--ey');
      eyBuild(art, svg, wrap ? 3 : 0, wrap ? 1 : 0);
    });
  }
  function eyBuild(art, svg, e0, o0) {
    var S = { e: e0, o: o0, on: false };
    var root = document.createElement('div');
    root.className = 'ey';
    root.innerHTML =
      '<p class="ey-model">Simplified model: the eye lens and cornea act as one lens, 2.0 cm in front of the retina. ' +
      'The eye can change its power only between two limits.</p>' +
      '<div class="ey-seg ey-eyes" role="group" aria-label="Eye">' + EY_EYES.map(function (E, i) {
        return '<button type="button" data-e="' + i + '" aria-pressed="false">' + E[0] + '</button>'; }).join('') + '</div>' +
      '<div class="ey-seg ey-objs" role="group" aria-label="Look at">' + EY_OBJ.map(function (O, i) {
        return '<button type="button" data-o="' + i + '" aria-pressed="false">' + O[0] + '</button>'; }).join('') + '</div>' +
      '<div class="ey-lens"><button type="button" class="ey-sw" role="switch" aria-checked="false" aria-describedby="">' +
      '<span class="ey-track" aria-hidden="true"><span class="ey-knob"></span></span><span class="ey-swl">Spectacle lens</span></button>' +
      '<span class="ey-ln"></span></div>';
    var box = document.createElement('div'); box.className = 'ey-art';
    var note = document.createElement('p'); note.className = 'ey-note'; note.textContent = EY_NOTE;
    var read = document.createElement('div'); read.className = 'ey-read'; read.setAttribute('aria-live', 'polite');
    read.innerHTML = '<b class="ey-r1"></b><span class="ey-r2"></span><span class="ey-r3"></span>';
    var how = document.createElement('details'); how.className = 'ey-how';
    how.innerHTML = '<summary>Show the numbers</summary><p class="ey-num"></p>';
    art.parentNode.insertBefore(root, art);
    art.insertBefore(box, svg); box.appendChild(svg);
    art.appendChild(note); art.appendChild(read); art.appendChild(how);
    svg.setAttribute('viewBox', '0 0 400 220');
    svg.classList.add('ey-live');
    var nojs = $('.ey-nojs', svg); if (nojs) nojs.setAttribute('display', 'none');
    var dyn = $('.ey-dyn', svg), sw = $('.ey-sw', root), ln = $('.ey-ln', root);
    var lid = 'ey-ln-' + Math.random().toString(36).slice(2, 7); ln.id = lid; sw.setAttribute('aria-describedby', lid);
    var RA = 'var(--dg-ray-a, #C2410C)', INK = 'var(--ink, #1F2328)', SOFT = 'var(--ink-soft, #57554D)';
    function f2(v) { return v.toFixed(2); }
    function seg(a, b, col, dash) {
      return '<path d="M' + f2(a[0]) + ',' + f2(a[1]) + ' L' + f2(b[0]) + ',' + f2(b[1]) + '" fill="none" stroke="' + col + '" stroke-width="' +
        (dash ? 1.5 : 1.8) + '"' + (dash ? ' stroke-dasharray="4 3"' : '') + '/>';
    }
    function ray(a, b, col, at, head) {
      var o = seg(a, b, col), L = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
      if (head === false || L <= 20) return o;
      var an = Math.atan2(b[1] - a[1], b[0] - a[0]), s = 7, mx = a[0] + (b[0] - a[0]) * at + Math.cos(an) * s * 0.45, my = a[1] + (b[1] - a[1]) * at + Math.sin(an) * s * 0.45;
      return o + '<path d="M' + f2(mx + s * Math.cos(an + Math.PI - 0.42)) + ',' + f2(my + s * Math.sin(an + Math.PI - 0.42)) + ' L' + f2(mx) + ',' + f2(my) +
        ' L' + f2(mx + s * Math.cos(an + Math.PI + 0.42)) + ',' + f2(my + s * Math.sin(an + Math.PI + 0.42)) + '" fill="none" stroke="' + col + '" stroke-width="1.8"/>';
    }
    function hitFar(p, d) {          /* ray p + t d meets the eyeball circle (242, 110), r 88: far intersection */
      var fx = p[0] - 242, fy = p[1] - 110, B = 2 * (fx * d[0] + fy * d[1]), C = fx * fx + fy * fy - 88 * 88;
      var t = (-B + Math.sqrt(Math.max(B * B - 4 * C, 0))) / 2;
      return [p[0] + d[0] * t, p[1] + d[1] * t];
    }
    function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy); return [dx / L, dy / L]; }
    function lensPath(kind) {
      var x = 110, y = 110, half = 35, e = 6, c = 1.6, rr, d;
      if (kind === 'concave') {
        rr = (half * half + (e - c) * (e - c)) / (2 * (e - c));
        d = 'M' + (x - e) + ',' + (y - half) + ' L' + (x + e) + ',' + (y - half) + ' A' + f2(rr) + ',' + f2(rr) + ' 0 0 0 ' + (x + e) + ',' + (y + half) +
          ' L' + (x - e) + ',' + (y + half) + ' A' + f2(rr) + ',' + f2(rr) + ' 0 0 0 ' + (x - e) + ',' + (y - half) + ' Z';
      } else {
        rr = (half * half + e * e) / (2 * e);
        d = 'M' + x + ',' + (y - half) + ' A' + f2(rr) + ',' + f2(rr) + ' 0 0 1 ' + x + ',' + (y + half) + ' A' + f2(rr) + ',' + f2(rr) + ' 0 0 1 ' + x + ',' + (y - half) + ' Z';
      }
      return '<path class="ey-spec" data-kind="' + kind + '" d="' + d + '" fill="var(--dg-glass, #DDF1F2)" stroke="' + INK + '" stroke-width="1.6"/>';
    }
    function draw() {
      var E = EY_EYES[S.e], lensOn = S.on && E[3] !== null, c = eyCase(S.e, S.o, lensOn), img = [c.xc, 110], out = [];
      var first = lensOn ? 110 : 150, k = lensOn ? 1 - 0.06 * E[3] / 30 : 1;
      [80, 110, 140].forEach(function (y) {
        var a = S.o === 0 ? [20, y] : [20, 110], b = [first, y], e = b;
        out.push(ray(a, b, RA, 0.5));
        if (lensOn) { e = [150, 110 + (y - 110) * k]; out.push(ray(b, e, RA, 0.6, false)); }
        var axis = Math.abs(e[1] - 110) < 1e-9;
        if (c.state === 'on') out.push(ray(e, [330, 110], RA, 0.5));
        else if (c.state === 'front') {
          out.push(ray(e, img, RA, 0.5));
          out.push(seg(img, axis ? [330, 110] : hitFar(img, unit(e, img)), RA));
        } else {
          var h = axis ? [330, 110] : hitFar(e, unit(e, img));
          out.push(ray(e, h, RA, 0.5)); out.push(seg(h, img, RA, true));
        }
      });
      if (lensOn) {
        out.push(lensPath(E[6]));
        out.push('<text x="110" y="54" font-family="Kalam, cursive" font-size="14" text-anchor="middle" fill="' + INK + '">Spectacle lens</text>');
        out.push('<path d="M110,58 L110,73" fill="none" stroke="' + SOFT + '" stroke-width="1.1"/>');
      }
      out.push('<path d="M' + f2(c.xc) + ',117 L' + f2(c.xc) + ',196" fill="none" stroke="' + SOFT + '" stroke-width="1" stroke-dasharray="2 3"/>');
      out.push('<text x="' + f2(Math.min(c.xc, 378)) + '" y="212" font-family="Kalam, cursive" font-size="14" text-anchor="middle" fill="' + INK + '">Image</text>');
      out.push('<circle class="ey-img" cx="' + f2(c.xc) + '" cy="110" r="4" fill="' + (c.state === 'on' ? 'var(--dg-img-sharp, #15803D)' : 'var(--dg-img-blur, #B45309)') +
        '" stroke="' + INK + '" stroke-width="1"/>');
      dyn.innerHTML = out.join('');
      /* controls */
      $$('.ey-eyes button', root).forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-e') === S.e ? 'true' : 'false'); });
      $$('.ey-objs button', root).forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-o') === S.o ? 'true' : 'false'); });
      sw.disabled = E[3] === null;
      sw.setAttribute('aria-checked', lensOn ? 'true' : 'false');
      ln.textContent = E[3] === null ? 'No spectacles needed' : E[4];
      /* readout */
      var r1 = EY_WORDS[c.state], mm = Math.abs(c.gap) * 10;
      $('.ey-r1', read).textContent = r1;
      $('.ey-r2', read).textContent = c.state === 'on' ? '' : 'Image: ' + mm.toFixed(2) + ' mm ' + (c.state === 'front' ? 'in front of' : 'behind') + ' the retina';
      $('.ey-r3', read).textContent = lensOn ? 'With a ' + E[6] + ' lens of ' + E[5] : '';
      svg.setAttribute('aria-label', r1);
      $('.ey-num', how).innerHTML = 'Eye lens power: ' + eyD(c.pe) + ' D (it can go from ' + eyD(E[1]) + ' D to ' + eyD(E[2]) + ' D)<br>' +
        'Power the light arrives with, V: ' + eyD(c.V) + ' D<br>Image distance: <i>v</i> = 100 ÷ (' + eyD(c.pe) + ' + (' + eyD(c.V) + ')) = ' +
        c.v.toFixed(4) + ' cm; the retina is at 2.0000 cm';
      root.setAttribute('data-state', c.state); root.setAttribute('data-x', c.x.toFixed(4)); root.setAttribute('data-v', c.v.toFixed(6));
      root.setAttribute('data-pe', String(c.pe / 30));
    }
    $$('.ey-eyes button', root).forEach(function (b) {
      on(b, 'click', function () { var e = +b.getAttribute('data-e'); if (e !== S.e) { S.e = e; S.on = false; } draw(); });
    });
    $$('.ey-objs button', root).forEach(function (b) { on(b, 'click', function () { S.o = +b.getAttribute('data-o'); draw(); }); });
    on(sw, 'click', function () { if (EY_EYES[S.e][3] === null) return; S.on = !S.on; draw(); });
    draw();
  }


  /* ---------------------------------------------------- tangent explorer (Maths Ch 10, T02-V6)
     svg[data-te] is the static first view (content/C10-MATH-CH10/diagrams/_src/c10b.py: P at 10 cm); initTe replaces it.
     Topic 2 opens in "count" mode; Topic 4 (figure block id …-T04.…) in "kite" mode (kite OAPB shaded, halves of ∠APB
     marked, area line). Drawing: W = container width (240…640 px), H = 0.75W, O at (0.38W, 0.5H), circle radius 0.18W
     (6 cm), s = 0.03W px per cm; P kept 16 px inside the SVG. Exact state: the distance d is held as a whole number n of
     hundredths of a cm (plus 6√2 when the "d = 6√2" button set it), so inside / on / outside is an exact integer test
     (n < 600, n = 600, n > 600) and keyboard steps (±10, Shift ±100) are exact and never snap. A pointer drag gives
     n = round(100 × pixel distance ÷ s); on release 585 ≤ n ≤ 615 snaps to 600. A and B are the points of the circle at
     α = arccos(6/d) either side of the ray O → P. Panel values: 2 decimals (half-up), exact form where there is one.
     Nothing is stored. */
  /*TE-TEX*/var TE_TEX = {"pa":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mrow><mi mathvariant=\"normal\">P</mi><mi mathvariant=\"normal\">A</mi></mrow><mo>=</mo><msqrt><mrow><msup><mrow><mi mathvariant=\"normal\">O</mi><mi mathvariant=\"normal\">P</mi></mrow><mn>2</mn></msup><mo>−</mo><msup><mi>r</mi><mn>2</mn></msup></mrow></msqrt></mrow><annotation encoding=\"application/x-tex\">\\mathrm{PA} = \\sqrt{\\mathrm{OP}^2 - r^2}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6833em;\"></span><span class=\"mord\"><span class=\"mord mathrm\">PA</span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:1.24em;vertical-align:-0.153em;\"></span><span class=\"mord sqrt\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.087em;\"><span class=\"svg-align\" style=\"top:-3.2em;\"><span class=\"pstrut\" style=\"height:3.2em;\"></span><span class=\"mord\" style=\"padding-left:1em;\"><span class=\"mord\"><span class=\"mord\"><span class=\"mord mathrm\">OP</span></span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8873em;\"><span style=\"top:-3.1362em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.7401em;\"><span style=\"top:-2.989em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span></span></span><span style=\"top:-3.047em;\"><span class=\"pstrut\" style=\"height:3.2em;\"></span><span class=\"hide-tail\" style=\"min-width:1.02em;height:1.28em;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400em\" height=\"1.28em\" viewBox=\"0 0 400000 1296\" preserveAspectRatio=\"xMinYMin slice\"><path d=\"M263,681c0.7,0,18,39.7,52,119\nc34,79.3,68.167,158.7,102.5,238c34.3,79.3,51.8,119.3,52.5,120\nc340,-704.7,510.7,-1060.3,512,-1067\nl0 -0\nc4.7,-7.3,11,-11,19,-11\nH40000v40H1012.3\ns-271.3,567,-271.3,567c-38.7,80.7,-84,175,-136,283c-52,108,-89.167,185.3,-111.5,232\nc-22.3,46.7,-33.8,70.3,-34.5,71c-4.7,4.7,-12.3,7,-23,7s-12,-1,-12,-1\ns-109,-253,-109,-253c-72.7,-168,-109.3,-252,-110,-252c-10.7,8,-22,16.7,-34,26\nc-22,17.3,-33.3,26,-34,26s-26,-26,-26,-26s76,-59,76,-59s76,-60,76,-60z\nM1001 80h400000v40h-400000z\"/></svg></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.153em;\"><span></span></span></span></span></span></span></span></span>","sum":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi mathvariant=\"normal\">∠</mi><mrow><mi mathvariant=\"normal\">A</mi><mi mathvariant=\"normal\">P</mi><mi mathvariant=\"normal\">B</mi></mrow><mo>+</mo><mi mathvariant=\"normal\">∠</mi><mrow><mi mathvariant=\"normal\">A</mi><mi mathvariant=\"normal\">O</mi><mi mathvariant=\"normal\">B</mi></mrow><mo>=</mo><mn>18</mn><msup><mn>0</mn><mo>∘</mo></msup></mrow><annotation encoding=\"application/x-tex\">\\angle \\mathrm{APB} + \\angle \\mathrm{AOB} = 180^\\circ</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.7756em;vertical-align:-0.0833em;\"></span><span class=\"mord\">∠</span><span class=\"mord\"><span class=\"mord mathrm\">APB</span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6922em;\"></span><span class=\"mord\">∠</span><span class=\"mord\"><span class=\"mord mathrm\">AOB</span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6741em;\"></span><span class=\"mord\">18</span><span class=\"mord\"><span class=\"mord\">0</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6741em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mbin mtight\">∘</span></span></span></span></span></span></span></span></span></span></span>"};/*END-TE-TEX*/
  var TE_MSG_IN = 'No tangent can be drawn from a point inside the circle.';
  var TE_MSG_ON = 'Exactly one tangent at a point on the circle.';
  var TE_R2 = 6 * Math.SQRT2;
  function teSurd(m) {                       /* √m = a√b, b square-free (m a positive integer) */
    var a = 1, b = m;
    for (var k = 2; k * k <= b; k++) while (b % (k * k) === 0) { b /= k * k; a *= k; }
    return [a, b];
  }
  function teRt(x) { return '<span class="gx-rt">√<span>' + x + '</span></span>'; }
  function teF2(v) {                         /* 2 decimals, half-up; whole numbers without decimals */
    var h = Math.floor(v * 100 + 0.5 + 1e-9);
    return h % 100 === 0 ? String(h / 100) : (Math.floor(h / 100) + '.' + (h % 100 < 10 ? '0' : '') + (h % 100));
  }
  function teH(n) {                           /* hundredths -> text: 1000 -> "10", 610 -> "6.10" */
    var neg = n < 0; n = Math.abs(n);
    return (neg ? '−' : '') + (n % 100 === 0 ? String(n / 100) : Math.floor(n / 100) + '.' + (n % 100 < 10 ? '0' : '') + (n % 100));
  }
  function teSurdH(a, b) { return (a === 1 ? '' : a) + teRt(b); }
  function teSurdT(a, b) { return (a === 1 ? '' : a) + '√' + b; }
  /* the model: state {n, r2} -> {pos, d, op, pa, apb, aob, area} (texts: h = html, t = plain) */
  function teModel(n, r2) {
    var d = (r2 ? TE_R2 : 0) + n / 100, M = { d: d, n: n, r2: r2 };
    M.pos = r2 ? (d < 6 ? 'inside' : 'outside') : (n < 600 ? 'inside' : n === 600 ? 'on' : 'outside');
    function ex(h, t) { return { h: '= ' + h, t: '= ' + t }; }
    function ap(v) { return { h: '≈ ' + teF2(v), t: '≈ ' + teF2(v) }; }
    if (r2 && n === 0) M.op = { h: '= 6' + teRt(2) + ' ≈ ' + teF2(d), t: '= 6√2 ≈ ' + teF2(d) };
    else if (r2) M.op = ap(d);
    else M.op = ex(teH(n), teH(n));
    M.valuenow = r2 ? teF2(d) : String(n / 100);
    if (M.pos !== 'outside') return M;
    var pa = Math.sqrt(d * d - 36), apb = 2 * Math.asin(6 / d) * 180 / Math.PI;
    M.paV = pa; M.apbV = apb;
    if (r2 && n === 0) { M.pa = ex('6', '6'); M.area = ex('36', '36'); M.apb = ex('90°', '90°'); M.aob = ex('90°', '90°'); M.apbT = '90°'; M.aobT = '90°'; return M; }
    if (!r2) {
      var m = n * n - 360000, k = Math.round(Math.sqrt(m));
      if (k * k === m) { M.pa = ex(teH(k), teH(k)); M.area = ex(teH(6 * k), teH(6 * k)); }
      else if (n % 100 === 0) {
        var D = n / 100, s = teSurd(D * D - 36), a = s[0], b = s[1];
        M.pa = { h: '= ' + teSurdH(a, b) + ' ≈ ' + teF2(pa), t: '= ' + teSurdT(a, b) + ' ≈ ' + teF2(pa) };
        M.area = { h: '= ' + teSurdH(6 * a, b) + ' ≈ ' + teF2(6 * pa), t: '= ' + teSurdT(6 * a, b) + ' ≈ ' + teF2(6 * pa) };
      } else { M.pa = ap(pa); M.area = ap(6 * pa); }
    } else { M.pa = ap(pa); M.area = ap(6 * pa); }
    if (!r2 && n === 1200) { M.apb = ex('60°', '60°'); M.aob = ex('120°', '120°'); M.apbT = '60°'; M.aobT = '120°'; return M; }
    var h = Math.floor(apb * 100 + 0.5 + 1e-9);          /* ∠AOB = 180° − ∠APB, in hundredths, so the two shown add to 180 */
    M.apbT = teH(h) + '°'; M.aobT = teH(18000 - h) + '°';
    M.apb = { h: '≈ ' + M.apbT, t: '≈ ' + M.apbT }; M.aob = { h: '≈ ' + M.aobT, t: '≈ ' + M.aobT };
    return M;
  }
  function initTe() {
    $$('svg[data-te="explorer"]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-te-on')) return;
      art.setAttribute('data-te-on', '1');
      var fig = svg.closest('.fig'), t4 = /-T04\./.test(fig ? fig.getAttribute('data-block-id') || '' : '');
      if (fig) fig.classList.add('fig--te');
      teBuild(art, t4 ? 'kite' : 'count');
    });
  }
  function teBuild(art, mode) {
    var uid = 'te' + Math.random().toString(36).slice(2, 7);
    var S = { n: 1000, r2: false, th: 0, anim: null, drag: false };
    var INK = 'var(--ink, #1F2328)', SOFT = 'var(--ink-soft, #57554D)', CARD = 'var(--card, #FFF)', ACC = 'var(--acc, #0A6C74)';
    var TINT = 'var(--dg-m-shade, #F1EEFB)';
    var root = document.createElement('div');
    root.className = 'te';
    root.setAttribute('data-mode', mode);
    var BTN = [['1000', '<span class="mx"><i>d</i> = 10</span>', 'd = 10'], ['r2', '<span class="mx"><i>d</i> = 6' + teRt(2) + '</span>', 'd = 6 root 2'],
      ['1200', '<span class="mx"><i>d</i> = 12</span>', 'd = 12'], ['400', 'inside', 'inside, d = 4'], ['600', 'on', 'on the circle, d = 6']];
    root.innerHTML =
      '<div class="te-art"><svg class="te-svg" role="group" aria-labelledby="' + uid + '-t"><title id="' + uid + '-t"></title>' +
      '<g class="te-g"></g>' +
      '<g class="te-p" tabindex="0" role="slider" aria-label="Point P, distance from O in cm" aria-valuemin="0" aria-orientation="horizontal">' +
      '<circle class="te-hit" r="22" fill="transparent"/><circle class="te-ring" r="13" fill="none" stroke-width="2.5"/>' +
      '<circle class="te-dot" r="7"/></g></svg></div>' +
      '<p class="te-hint">Drag P, or use the arrow keys (Shift: 1 cm).</p>' +
      '<div class="te-snap" role="group" aria-label="Move P">' + BTN.map(function (b) {
        return '<button type="button" data-v="' + b[0] + '" aria-label="' + b[2] + '">' + b[1] + '</button>'; }).join('') + '</div>' +
      '<div class="te-read" aria-live="polite"></div>';
    art.innerHTML = '';
    art.appendChild(root);
    var svgEl = $('.te-svg', root), g = $('.te-g', root), pEl = $('.te-p', root), read = $('.te-read', root);
    function f1(v) { return (Math.round(v * 100) / 100).toFixed(2); }
    function rm() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function geo() {
      var W = Math.min(640, Math.max(240, Math.round($('.te-art', root).clientWidth || 358)));
      var H = 0.75 * W;
      return { W: W, H: H, ox: 0.38 * W, oy: 0.5 * H, R: 0.18 * W, s: 0.03 * W, m: 16 };
    }
    function dmax(G, th) {                    /* largest d (cm) along the ray at angle th that keeps P 16 px inside */
      var c = Math.cos(th), s = -Math.sin(th), t = 1e9;
      if (c > 1e-9) t = Math.min(t, (G.W - G.m - G.ox) / c); else if (c < -1e-9) t = Math.min(t, (G.m - G.ox) / c);
      if (s > 1e-9) t = Math.min(t, (G.H - G.m - G.oy) / s); else if (s < -1e-9) t = Math.min(t, (G.m - G.oy) / s);
      return t / G.s;
    }
    function nmax(G, th) { return Math.floor(dmax(G, th) * 100 + 1e-6); }
    function P_(d, o) {
      o = o || {};
      return '<path d="' + d + '" fill="' + (o.fill || 'none') + '" stroke="' + (o.st || INK) + '" stroke-width="' + (o.sw || 2) + '"' +
        (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + (o.cls ? ' class="' + o.cls + '"' : '') + ' stroke-linecap="round" stroke-linejoin="round"/>';
    }
    function L_(a, b) { return 'M' + a[0].toFixed(2) + ',' + a[1].toFixed(2) + ' L' + b[0].toFixed(2) + ',' + b[1].toFixed(2); }
    function T_(x, y, s, o) {
      o = o || {};
      return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-family="Lexend, sans-serif" font-size="15" font-weight="600" text-anchor="middle" fill="' + INK + '"' +
        (o.cls ? ' class="' + o.cls + '"' : '') + '>' + s + '</text>';
    }
    function uv(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; }
    function box(v, a, b, sz) {               /* right-angle box at v between v->a and v->b */
      var ua = uv(v, a), ub = uv(v, b);
      var p1 = [v[0] + ua[0] * sz, v[1] + ua[1] * sz], p2 = [p1[0] + ub[0] * sz, p1[1] + ub[1] * sz], p3 = [v[0] + ub[0] * sz, v[1] + ub[1] * sz];
      return P_('M' + p1[0].toFixed(2) + ',' + p1[1].toFixed(2) + ' L' + p2[0].toFixed(2) + ',' + p2[1].toFixed(2) + ' L' + p3[0].toFixed(2) + ',' + p3[1].toFixed(2), { sw: 1.4, cls: 'te-ra' });
    }
    function ticks2(a, b) {
      var u = uv(a, b), nx = -u[1], ny = u[0], cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, d = '';
      [-2.25, 2.25].forEach(function (off) { var x = cx + u[0] * off, y = cy + u[1] * off; d += 'M' + (x - nx * 6).toFixed(1) + ',' + (y - ny * 6).toFixed(1) + ' L' + (x + nx * 6).toFixed(1) + ',' + (y + ny * 6).toFixed(1) + ' '; });
      return P_(d, { sw: 1.6 });
    }
    function arcAt(v, a, b, r) {
      var a1 = Math.atan2(a[1] - v[1], a[0] - v[0]), a2 = Math.atan2(b[1] - v[1], b[0] - v[0]);
      var dd = (a2 - a1 + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      var p0 = [v[0] + r * Math.cos(a1), v[1] + r * Math.sin(a1)], p1 = [v[0] + r * Math.cos(a1 + dd), v[1] + r * Math.sin(a1 + dd)];
      return P_('M' + p0[0].toFixed(2) + ',' + p0[1].toFixed(2) + ' A' + r + ',' + r + ' 0 0 ' + (dd > 0 ? 1 : 0) + ' ' + p1[0].toFixed(2) + ',' + p1[1].toFixed(2), { sw: 1.6, cls: 'te-arc' });
    }
    function lab(p, dir, s, gap, G, cls) {     /* letter centred `gap` px beyond p along dir, kept inside the SVG */
      var x = p[0] + dir[0] * (gap + 6), y = p[1] + dir[1] * (gap + 6) + 5.3;
      x = Math.max(10, Math.min(G.W - 10, x)); y = Math.max(16, Math.min(G.H - 4, y));
      return T_(x, y, s, { cls: cls });
    }
    function draw(view) {
      var G = geo(), W = G.W, H = G.H, O = [G.ox, G.oy], out = '';
      var d = view.d, th = view.th, M = teModel(S.n, S.r2), pos = view.pos || M.pos;
      svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H.toFixed(2)); svgEl.setAttribute('width', W); svgEl.setAttribute('height', H.toFixed(2));
      svgEl.setAttribute('data-w', String(W)); svgEl.setAttribute('data-s', String(G.s));
      var u = [Math.cos(th), -Math.sin(th)], P = [O[0] + u[0] * d * G.s, O[1] + u[1] * d * G.s];
      var A = null, B = null;
      if (pos === 'outside') {
        var al = Math.acos(6 / d), R = G.R;
        A = [O[0] + R * Math.cos(th + al), O[1] - R * Math.sin(th + al)];
        B = [O[0] + R * Math.cos(th - al), O[1] - R * Math.sin(th - al)];
        if (mode === 'kite') out += P_('M' + O[0].toFixed(2) + ',' + O[1].toFixed(2) + ' L' + A[0].toFixed(2) + ',' + A[1].toFixed(2) + ' L' + P[0].toFixed(2) + ',' + P[1].toFixed(2) + ' L' + B[0].toFixed(2) + ',' + B[1].toFixed(2) + ' Z', { st: 'none', fill: TINT, sw: 0, cls: 'te-kite' });
      }
      out += '<circle class="te-circle" cx="' + O[0].toFixed(2) + '" cy="' + O[1].toFixed(2) + '" r="' + G.R.toFixed(2) + '" fill="none" stroke="' + INK + '" stroke-width="1.8"/>';
      if (pos === 'outside') {
        [A, B].forEach(function (T, i) {
          var e = uv(P, T);
          out += P_(L_(P, [T[0] + e[0] * 24, T[1] + e[1] * 24]), { sw: 2.2, cls: 'te-tan te-tan' + (i ? 'b' : 'a') });
          out += P_(L_(O, T), { sw: 1.8, cls: 'te-rad' });
          out += box(T, O, P, 7);
          out += ticks2(P, T);
          out += '<circle class="te-pt" data-pt="' + (i ? 'B' : 'A') + '" cx="' + T[0].toFixed(2) + '" cy="' + T[1].toFixed(2) + '" r="3" fill="' + INK + '"/>';
        });
        out += P_(L_(O, P), { sw: 1.8, cls: 'te-op' });
        if (mode === 'kite') { out += arcAt(P, A, O, 30) + arcAt(P, O, B, 30); }
        out += lab(A, uv(O, A), 'A', 7, G, 'te-la') + lab(B, uv(O, B), 'B', 7, G, 'te-lb');
      } else if (pos === 'on') {
        var t = [-u[1], u[0]], L = G.R * 0.95;
        out += P_(L_([P[0] - t[0] * L, P[1] - t[1] * L], [P[0] + t[0] * L, P[1] + t[1] * L]), { sw: 2.4, cls: 'te-tan te-tan1' });
        out += P_(L_(O, P), { sw: 1.8, cls: 'te-rad' });
        out += box(P, O, [P[0] + t[0] * 20, P[1] + t[1] * 20], 12);
      } else if (d > 0.3) {
        out += P_(L_(O, P), { sw: 1.6, dash: '5 4', st: SOFT, cls: 'te-op' });
      }
      out += '<circle cx="' + O[0].toFixed(2) + '" cy="' + O[1].toFixed(2) + '" r="2.8" fill="' + INK + '"/>';
      out += lab(O, d > 0.5 ? [-u[0], -u[1]] : [-1, 0], 'O', 6, G, 'te-lo');
      out += lab(P, d > 0.5 ? u : [1, -1], 'P', pos === 'on' ? 16 : 14, G, 'te-lp');
      g.innerHTML = out;
      $('.te-hit', pEl).setAttribute('cx', P[0].toFixed(2)); $('.te-hit', pEl).setAttribute('cy', P[1].toFixed(2));
      $('.te-ring', pEl).setAttribute('cx', P[0].toFixed(2)); $('.te-ring', pEl).setAttribute('cy', P[1].toFixed(2));
      $('.te-dot', pEl).setAttribute('cx', P[0].toFixed(2)); $('.te-dot', pEl).setAttribute('cy', P[1].toFixed(2));
      pEl.setAttribute('data-x', P[0].toFixed(3)); pEl.setAttribute('data-y', P[1].toFixed(3));
    }
    function L(h, cls) { return '<p class="te-l' + (cls ? ' ' + cls : '') + '">' + h + '</p>'; }
    function mx(h) { return '<span class="mx">' + h + '</span>'; }
    function panel() {
      var M = teModel(S.n, S.r2), h = '';
      if (M.pos === 'inside') h += L(TE_MSG_IN, 'te-msg') + L(mx('OP ' + M.op.h) + ' (less than the radius, 6)');
      else if (M.pos === 'on') h += L(TE_MSG_ON, 'te-msg') + L(mx('OP = 6') + ' (the radius)');
      else {
        h += L(mx('OP ' + M.op.h));
        h += L(TE_TEX.pa ? TE_TEX.pa : mx('PA = ' + teRt('OP² − r²')), 'te-tex');
        h += L(mx('PA = PB ' + M.pa.h), 'te-pa');
        h += L(mx('∠APB ' + M.apb.h) + '<span class="te-gap"></span>' + mx('∠AOB ' + M.aob.h), 'te-ang');
        h += L(TE_TEX.sum ? TE_TEX.sum : mx('∠APB + ∠AOB = 180°'), 'te-tex te-sum');
        h += L(mx(M.apbT + ' + ' + M.aobT + ' = 180°'), 'te-sum2');
        if (mode === 'kite') h += L(mx('area of OAPB = 6 × PA'), 'te-area') + L(mx(M.area.h), 'te-area2');
      }
      read.innerHTML = h;
      attrs();
    }
    function attrs() {                         /* state on the root at once (the panel text is throttled while dragging) */
      var M = teModel(S.n, S.r2);
      root.setAttribute('data-pos', M.pos); root.setAttribute('data-n', String(S.n)); root.setAttribute('data-r2', S.r2 ? '1' : '0');
      root.setAttribute('data-op', M.op.t); root.setAttribute('data-pa', M.pa ? M.pa.t : ''); root.setAttribute('data-apb', M.apb ? M.apb.t : '');
      root.setAttribute('data-aob', M.aob ? M.aob.t : ''); root.setAttribute('data-area', M.area ? M.area.t : '');
    }
    var panelT = mThrottle(panel, 250);
    function aria() {
      var G = geo(), M = teModel(S.n, S.r2);
      pEl.setAttribute('aria-valuemax', String(nmax(G, S.th) / 100));
      pEl.setAttribute('aria-valuenow', M.valuenow);
      pEl.setAttribute('aria-valuetext', (S.r2 && S.n === 0 ? '6 root 2, about ' + teF2(M.d) : M.r2 ? 'about ' + teF2(M.d) : teH(S.n)) + ' cm, ' +
        (M.pos === 'on' ? 'on' : M.pos) + ' the circle');
      $('title', svgEl).textContent = 'Circle of radius 6 cm with centre O; P is ' + (M.r2 ? 'about ' + teF2(M.d) : teH(S.n)) + ' cm from O, ' + M.pos +
        (M.pos === 'on' ? ' the circle' : ' the circle');
    }
    function view() { return { d: teModel(S.n, S.r2).d, th: S.th }; }
    function render(now) { if (!S.anim) draw(view()); aria(); attrs(); if (now) panel(); else panelT(); }
    function setState(n, r2, th, glide) {
      var from = S.anim ? S.anim.cur : view();
      S.n = n; S.r2 = r2; S.th = th;
      var to = view();
      if (S.anim) { cancelAnimationFrame(S.anim.raf); S.anim = null; }
      if (!glide || rm()) { render(true); return; }
      var t0 = null, dur = 260, dth = ((to.th - from.th + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      S.anim = { cur: from };
      aria(); panel();
      function step(ts) {
        if (!S.anim) return;
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur), q = 1 - (1 - p) * (1 - p);
        var cur = { d: from.d + (to.d - from.d) * q, th: from.th + dth * q };
        if (p >= 1) { S.anim = null; draw(view()); return; }
        cur.pos = cur.d < 6 ? 'inside' : cur.d > 6.0001 ? 'outside' : 'on';
        S.anim.cur = cur;
        draw(cur);
        S.anim.raf = requestAnimationFrame(step);
      }
      S.anim.raf = requestAnimationFrame(step);
    }
    function fits(G, d, th) { return d <= dmax(G, th) + 1e-9; }
    /* ---- buttons: keep the direction of OP if the new distance fits along it, else go to the right of O */
    $$('.te-snap button', root).forEach(function (b) {
      on(b, 'click', function () {
        var v = b.getAttribute('data-v'), G = geo(), r2 = v === 'r2', n = r2 ? 0 : +v, d = r2 ? TE_R2 : n / 100;
        var th = fits(G, d, S.th) ? S.th : 0;
        setState(n, r2, th, true);
      });
    });
    /* ---- keyboard: exact steps along the ray O -> P, never a snap */
    on(pEl, 'keydown', function (ev) {
      var k = ev.key, step = ev.shiftKey ? 100 : 10, G = geo(), mx_ = nmax(G, S.th), n = S.n, r2 = S.r2, dlt = null;
      if (k === 'ArrowRight' || k === 'ArrowUp') dlt = step;
      else if (k === 'ArrowLeft' || k === 'ArrowDown') dlt = -step;
      else if (k === 'PageUp') dlt = 100; else if (k === 'PageDown') dlt = -100;
      else if (k === 'Home') { ev.preventDefault(); setState(0, false, S.th, false); return; }
      else if (k === 'End') { ev.preventDefault(); setState(mx_, false, S.th, false); return; }
      else return;
      ev.preventDefault();
      n += dlt;
      var d = (r2 ? TE_R2 : 0) + n / 100;
      if (d < 0) { n = 0; r2 = false; }
      else if (d > mx_ / 100 + 1e-9) { n = mx_; r2 = false; }
      setState(n, r2, S.th, false);
    });
    /* ---- pointer: drag P anywhere in the SVG (16 px margin); snap to the circle only on release */
    function svgPt(ev) {
      var rc = svgEl.getBoundingClientRect(), vb = svgEl.viewBox.baseVal;
      return [(ev.clientX - rc.left) * vb.width / rc.width, (ev.clientY - rc.top) * vb.height / rc.height];
    }
    on(svgEl, 'pointerdown', function (ev) {
      var q = svgPt(ev), px = +pEl.getAttribute('data-x'), py = +pEl.getAttribute('data-y');
      if (Math.hypot(q[0] - px, q[1] - py) > 22) return;
      ev.preventDefault();
      pEl.focus();
      try { svgEl.setPointerCapture(ev.pointerId); } catch (er) { /* ignore */ }
      if (S.anim) { cancelAnimationFrame(S.anim.raf); S.anim = null; }
      S.drag = true; root.classList.add('is-drag');
    });
    on(svgEl, 'pointermove', function (ev) {
      if (!S.drag) return;
      var G = geo(), q = svgPt(ev);
      var x = Math.max(G.m, Math.min(G.W - G.m, q[0])), y = Math.max(G.m, Math.min(G.H - G.m, q[1]));
      var dx = x - G.ox, dy = y - G.oy, dpx = Math.hypot(dx, dy);
      if (dpx > 0.5) S.th = Math.atan2(-dy, dx);
      S.n = Math.min(Math.round(dpx / G.s * 100), nmax(G, S.th)); S.r2 = false;
      render(false);
    });
    function endDrag() {
      if (!S.drag) return;
      S.drag = false; root.classList.remove('is-drag');
      if (!S.r2 && S.n >= 585 && S.n <= 615) S.n = 600;
      render(true);
    }
    on(svgEl, 'pointerup', endDrag);
    on(svgEl, 'pointercancel', endDrag);
    var lastW = 0;
    function onResize() {
      var w = geo().W; if (w === lastW) return; lastW = w;
      var G = geo(), mx_ = nmax(G, S.th), d = teModel(S.n, S.r2).d;
      if (d > mx_ / 100 + 1e-9) { S.n = mx_; S.r2 = false; }
      render(true);
    }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(root);
    on(window, 'resize', onResize);
    lastW = geo().W;
    render(true);
  }

  /* ---------------------------------------------------- wide tables (all chapters): a table wider than its box scrolls
     sideways inside .table-wrap. Then the box gets .is-overflow (CSS fades the edge that has more to see), its region
     label says it scrolls, and a small cue line "Scroll the table sideways →" (aria-hidden; the label carries it for
     screen readers) shows under it. The table itself is not touched. Re-checked on scroll, resize and fonts loading. */
  function tcUpdate(w) {
    var over = w.scrollWidth > w.clientWidth + 2;
    w.classList.toggle('is-overflow', over);
    w.classList.toggle('is-scrolled', over && w.scrollLeft > 2);
    w.classList.toggle('at-end', over && w.scrollLeft + w.clientWidth >= w.scrollWidth - 2);
    if (w._tcLabel === undefined) w._tcLabel = w.getAttribute('aria-label');
    if (w._tcLabel !== null) w.setAttribute('aria-label', over ? w._tcLabel + ', scrolls sideways' : w._tcLabel);
    if (w._cue) show(w._cue, over);
  }
  function initTableCue(scope) {
    $$('.table-wrap', scope).forEach(function (w) {
      if (!w._tc) {
        w._tc = 1;
        var cue = document.createElement('p');
        cue.className = 'table-cue'; cue.setAttribute('aria-hidden', 'true'); cue.hidden = true;
        cue.textContent = 'Scroll the table sideways →';
        w.parentNode.insertBefore(cue, w.nextSibling);
        w._cue = cue;
        on(w, 'scroll', function () { tcUpdate(w); });
        if (window.ResizeObserver) new ResizeObserver(function () { tcUpdate(w); }).observe(w);
      }
      tcUpdate(w);
    });
  }

  /* ---------------------------------------------------- circuit virtual lab (Science Ch 11, T03-V8; Practicals 4 and 5)
     svg[data-cv] is the static first view (content/C10-SCI-CH11/diagrams/_src/d11_lab.py), with three page variants shown
     by CSS. initCv() replaces its contents with the live circuit (viewBox 0 0 400 200) and adds the controls above it and
     the readout, the V–I graph (its own SVG, viewBox 0 0 400 240) and the note below it. The drawing pieces (circuit frame
     for each circuit type, the battery for 1–4 cells, the graph axes) are CV_ART, written by _src/cv_js.py from the same
     netlist that the chapter's circuit engine solves and checks; the formulas are pre-rendered KaTeX (CV_TEX).
     Model (ideal, as the brief): V = 1.5 V × cells; R = R1, R1 + R2, or R1R2 ÷ (R1 + R2); I = V ÷ R; series V1 = IR1,
     V2 = IR2; parallel I1 = V ÷ R1, I2 = V ÷ R2. Every value is an exact fraction [numerator, denominator] of integers;
     shown to 2 decimal places, half up, trailing zeros dropped. Graph point: x = 50 + 50I, y = 210 − 30V. Changing the
     circuit type or a resistor clears the graph; changing the cells does not. The figure's data-block-id picks the
     opening state: Topic 3 one resistor, Topic 5 two in series, the wrap-up two in parallel with 4 cells. Nothing is stored. */
  /*CV-ART*/var CV_ART = {"frame":{"One":"<path d=\"M160,40 L24,40 L24,112 L60,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M240,40 L376,40 L376,60\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M376,90 L376,112 L315,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M250,112 L285,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M60,112 L125,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M185,112 L250,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M60,112 L60,186 L144,186\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M166,186 L250,186 L250,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><g transform=\"rotate(90 376 75)\"><path d=\"M361,75 L370,75\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M382,75 L391,75\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M374.51,67.49 A8.5,8.5 0 0 0 374.51,82.51\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.7\"/><path d=\"M377.49,67.49 A8.5,8.5 0 0 1 377.49,82.51\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.7\"/><circle cx=\"376\" cy=\"75\" r=\"2.4\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/></g><path d=\"M285,112 L289,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M311,112 L315,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><circle cx=\"300\" cy=\"112\" r=\"11\" fill=\"var(--card, #FFFFFF)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.7\"/><text x=\"300\" y=\"117.04\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">A</text><text x=\"283\" y=\"102\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">+</text><text x=\"317\" y=\"102\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">−</text><path d=\"M125,112 L134,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M176,112 L185,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M134.00,112.00 L137.50,105.50 L144.50,118.50 L151.50,105.50 L158.50,118.50 L165.50,105.50 L172.50,118.50 L176.00,112.00\" fill=\"none\" stroke=\"var(--dg-res11, #B45309)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\"/><path d=\"M144,186 L144,186\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M166,186 L166,186\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><circle cx=\"155\" cy=\"186\" r=\"11\" fill=\"var(--card, #FFFFFF)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.7\"/><text x=\"155\" y=\"191.04\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">V</text><text x=\"138\" y=\"176\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">+</text><text x=\"172\" y=\"176\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">−</text><circle cx=\"60\" cy=\"112\" r=\"3\" fill=\"var(--dg-wire11, #4A4F57)\" stroke=\"none\"/><circle cx=\"250\" cy=\"112\" r=\"3\" fill=\"var(--dg-wire11, #4A4F57)\" stroke=\"none\"/><path d=\"M24.00,84.00 L20.50,77.00 L27.50,77.00 Z\" fill=\"var(--dg-cur11, #1D4ED8)\" stroke=\"var(--dg-cur11, #1D4ED8)\" stroke-width=\"1\"/><text x=\"32\" y=\"80\" font-family=\"Lexend, sans-serif\" font-size=\"14\" fill=\"var(--ink, #1F2328)\">I</text><text x=\"364\" y=\"80\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"end\" fill=\"var(--ink, #1F2328)\">K</text><text x=\"155\" y=\"98\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\" class=\"cv-l-r1\">R<tspan dy=\"3.6\" font-size=\"10.1\">1</tspan><tspan dy=\"-3.6\"> = 3 </tspan><tspan font-family=\"KaTeX_Main, 'Times New Roman', serif\" font-weight=\"400\">Ω</tspan></text>","Series":"<path d=\"M160,40 L24,40 L24,112 L60,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M240,40 L376,40 L376,60\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M376,90 L376,112 L315,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M250,112 L285,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M60,112 L75,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M125,112 L175,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M225,112 L250,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M60,112 L60,186 L144,186\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M166,186 L250,186 L250,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><g transform=\"rotate(90 376 75)\"><path d=\"M361,75 L370,75\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M382,75 L391,75\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M374.51,67.49 A8.5,8.5 0 0 0 374.51,82.51\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.7\"/><path d=\"M377.49,67.49 A8.5,8.5 0 0 1 377.49,82.51\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.7\"/><circle cx=\"376\" cy=\"75\" r=\"2.4\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/></g><path d=\"M285,112 L289,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M311,112 L315,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><circle cx=\"300\" cy=\"112\" r=\"11\" fill=\"var(--card, #FFFFFF)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.7\"/><text x=\"300\" y=\"117.04\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">A</text><text x=\"283\" y=\"102\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">+</text><text x=\"317\" y=\"102\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">−</text><path d=\"M75,112 L80,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M120,112 L125,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M80.00,112.00 L83.33,105.50 L90.00,118.50 L96.67,105.50 L103.33,118.50 L110.00,105.50 L116.67,118.50 L120.00,112.00\" fill=\"none\" stroke=\"var(--dg-res11, #B45309)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\"/><path d=\"M175,112 L180,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M220,112 L225,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M180.00,112.00 L183.33,105.50 L190.00,118.50 L196.67,105.50 L203.33,118.50 L210.00,105.50 L216.67,118.50 L220.00,112.00\" fill=\"none\" stroke=\"var(--dg-res11, #B45309)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\"/><path d=\"M144,186 L144,186\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M166,186 L166,186\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><circle cx=\"155\" cy=\"186\" r=\"11\" fill=\"var(--card, #FFFFFF)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.7\"/><text x=\"155\" y=\"191.04\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">V</text><text x=\"138\" y=\"176\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">+</text><text x=\"172\" y=\"176\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">−</text><circle cx=\"60\" cy=\"112\" r=\"3\" fill=\"var(--dg-wire11, #4A4F57)\" stroke=\"none\"/><circle cx=\"250\" cy=\"112\" r=\"3\" fill=\"var(--dg-wire11, #4A4F57)\" stroke=\"none\"/><path d=\"M24.00,84.00 L20.50,77.00 L27.50,77.00 Z\" fill=\"var(--dg-cur11, #1D4ED8)\" stroke=\"var(--dg-cur11, #1D4ED8)\" stroke-width=\"1\"/><text x=\"32\" y=\"80\" font-family=\"Lexend, sans-serif\" font-size=\"14\" fill=\"var(--ink, #1F2328)\">I</text><text x=\"364\" y=\"80\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"end\" fill=\"var(--ink, #1F2328)\">K</text><text x=\"100\" y=\"78\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\" class=\"cv-l-r1\">R<tspan dy=\"3.6\" font-size=\"10.1\">1</tspan><tspan dy=\"-3.6\"> = 3 </tspan><tspan font-family=\"KaTeX_Main, 'Times New Roman', serif\" font-weight=\"400\">Ω</tspan></text><text x=\"100\" y=\"98\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--dg-cur11, #1D4ED8)\" class=\"cv-l-x1\">V<tspan dy=\"3.6\" font-size=\"10.1\">1</tspan><tspan dy=\"-3.6\"> = 0.5 V</tspan></text><text x=\"200\" y=\"78\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\" class=\"cv-l-r2\">R<tspan dy=\"3.6\" font-size=\"10.1\">2</tspan><tspan dy=\"-3.6\"> = 6 </tspan><tspan font-family=\"KaTeX_Main, 'Times New Roman', serif\" font-weight=\"400\">Ω</tspan></text><text x=\"200\" y=\"98\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--dg-cur11, #1D4ED8)\" class=\"cv-l-x2\">V<tspan dy=\"3.6\" font-size=\"10.1\">2</tspan><tspan dy=\"-3.6\"> = 1 V</tspan></text>","Parallel":"<path d=\"M160,40 L24,40 L24,112 L60,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M240,40 L376,40 L376,60\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M376,90 L376,112 L315,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M250,112 L285,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M60,88 L60,136\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M250,88 L250,136\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M60,88 L125,88\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M185,88 L250,88\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M60,136 L125,136\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M185,136 L250,136\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M60,136 L60,186 L144,186\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M166,186 L250,186 L250,136\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><g transform=\"rotate(90 376 75)\"><path d=\"M361,75 L370,75\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M382,75 L391,75\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M374.51,67.49 A8.5,8.5 0 0 0 374.51,82.51\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.7\"/><path d=\"M377.49,67.49 A8.5,8.5 0 0 1 377.49,82.51\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.7\"/><circle cx=\"376\" cy=\"75\" r=\"2.4\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/></g><path d=\"M285,112 L289,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M311,112 L315,112\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><circle cx=\"300\" cy=\"112\" r=\"11\" fill=\"var(--card, #FFFFFF)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.7\"/><text x=\"300\" y=\"117.04\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">A</text><text x=\"283\" y=\"102\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">+</text><text x=\"317\" y=\"102\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">−</text><path d=\"M125,88 L134,88\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M176,88 L185,88\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M134.00,88.00 L137.50,81.50 L144.50,94.50 L151.50,81.50 L158.50,94.50 L165.50,81.50 L172.50,94.50 L176.00,88.00\" fill=\"none\" stroke=\"var(--dg-res11, #B45309)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\"/><path d=\"M125,136 L134,136\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M176,136 L185,136\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M134.00,136.00 L137.50,129.50 L144.50,142.50 L151.50,129.50 L158.50,142.50 L165.50,129.50 L172.50,142.50 L176.00,136.00\" fill=\"none\" stroke=\"var(--dg-res11, #B45309)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\"/><path d=\"M144,186 L144,186\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M166,186 L166,186\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><circle cx=\"155\" cy=\"186\" r=\"11\" fill=\"var(--card, #FFFFFF)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.7\"/><text x=\"155\" y=\"191.04\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">V</text><text x=\"138\" y=\"176\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">+</text><text x=\"172\" y=\"176\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">−</text><circle cx=\"60\" cy=\"136\" r=\"3\" fill=\"var(--dg-wire11, #4A4F57)\" stroke=\"none\"/><circle cx=\"250\" cy=\"136\" r=\"3\" fill=\"var(--dg-wire11, #4A4F57)\" stroke=\"none\"/><circle cx=\"60\" cy=\"112\" r=\"3\" fill=\"var(--dg-wire11, #4A4F57)\" stroke=\"none\"/><circle cx=\"250\" cy=\"112\" r=\"3\" fill=\"var(--dg-wire11, #4A4F57)\" stroke=\"none\"/><path d=\"M24.00,84.00 L20.50,77.00 L27.50,77.00 Z\" fill=\"var(--dg-cur11, #1D4ED8)\" stroke=\"var(--dg-cur11, #1D4ED8)\" stroke-width=\"1\"/><text x=\"32\" y=\"80\" font-family=\"Lexend, sans-serif\" font-size=\"14\" fill=\"var(--ink, #1F2328)\">I</text><path d=\"M100.00,88.00 L93.00,91.50 L93.00,84.50 Z\" fill=\"var(--dg-cur11, #1D4ED8)\" stroke=\"var(--dg-cur11, #1D4ED8)\" stroke-width=\"1\"/><path d=\"M100.00,136.00 L93.00,139.50 L93.00,132.50 Z\" fill=\"var(--dg-cur11, #1D4ED8)\" stroke=\"var(--dg-cur11, #1D4ED8)\" stroke-width=\"1\"/><text x=\"364\" y=\"80\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"end\" fill=\"var(--ink, #1F2328)\">K</text><text x=\"155\" y=\"76\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\" class=\"cv-l-r1\">R<tspan dy=\"3.6\" font-size=\"10.1\">1</tspan><tspan dy=\"-3.6\"> = 3 </tspan><tspan font-family=\"KaTeX_Main, 'Times New Roman', serif\" font-weight=\"400\">Ω</tspan></text><text x=\"220\" y=\"76\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--dg-cur11, #1D4ED8)\" class=\"cv-l-x1\">I<tspan dy=\"3.6\" font-size=\"10.1\">1</tspan><tspan dy=\"-3.6\"> = 0.5 A</tspan></text><text x=\"155\" y=\"156\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\" class=\"cv-l-r2\">R<tspan dy=\"3.6\" font-size=\"10.1\">2</tspan><tspan dy=\"-3.6\"> = 6 </tspan><tspan font-family=\"KaTeX_Main, 'Times New Roman', serif\" font-weight=\"400\">Ω</tspan></text><text x=\"220\" y=\"156\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--dg-cur11, #1D4ED8)\" class=\"cv-l-x2\">I<tspan dy=\"3.6\" font-size=\"10.1\">2</tspan><tspan dy=\"-3.6\"> = 0.25 A</tspan></text>"},"bat":{"1":"<path d=\"M203.5,40 L240,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M160,40 L196.5,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M196.5,27 L196.5,53\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.6\"/><path d=\"M203.5,33.5 L203.5,46.5\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"4.2\" stroke-linecap=\"butt\"/><text x=\"191.5\" y=\"24\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">+</text><text x=\"208.5\" y=\"24\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">−</text>","2":"<path d=\"M212,40 L240,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M160,40 L188,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M188,27 L188,53\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.6\"/><path d=\"M195,33.5 L195,46.5\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"4.2\" stroke-linecap=\"butt\"/><path d=\"M205,27 L205,53\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.6\"/><path d=\"M212,33.5 L212,46.5\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"4.2\" stroke-linecap=\"butt\"/><path d=\"M195,40 L205,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><text x=\"183\" y=\"24\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">+</text><text x=\"217\" y=\"24\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">−</text>","3":"<path d=\"M220.5,40 L240,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M160,40 L179.5,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M179.5,27 L179.5,53\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.6\"/><path d=\"M186.5,33.5 L186.5,46.5\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"4.2\" stroke-linecap=\"butt\"/><path d=\"M196.5,27 L196.5,53\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.6\"/><path d=\"M203.5,33.5 L203.5,46.5\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"4.2\" stroke-linecap=\"butt\"/><path d=\"M186.5,40 L196.5,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M213.5,27 L213.5,53\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.6\"/><path d=\"M220.5,33.5 L220.5,46.5\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"4.2\" stroke-linecap=\"butt\"/><path d=\"M203.5,40 L213.5,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><text x=\"174.5\" y=\"24\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">+</text><text x=\"225.5\" y=\"24\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">−</text>","4":"<path d=\"M229,40 L240,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M160,40 L171,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M171,27 L171,53\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.6\"/><path d=\"M178,33.5 L178,46.5\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"4.2\" stroke-linecap=\"butt\"/><path d=\"M188,27 L188,53\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.6\"/><path d=\"M195,33.5 L195,46.5\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"4.2\" stroke-linecap=\"butt\"/><path d=\"M178,40 L188,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M205,27 L205,53\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.6\"/><path d=\"M212,33.5 L212,46.5\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"4.2\" stroke-linecap=\"butt\"/><path d=\"M195,40 L205,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><path d=\"M222,27 L222,53\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.6\"/><path d=\"M229,33.5 L229,46.5\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"4.2\" stroke-linecap=\"butt\"/><path d=\"M212,40 L222,40\" fill=\"none\" stroke=\"var(--dg-wire11, #4A4F57)\" stroke-width=\"1.8\" stroke-linejoin=\"miter\" stroke-linecap=\"butt\"/><text x=\"166\" y=\"24\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">+</text><text x=\"234\" y=\"24\" font-family=\"Lexend, sans-serif\" font-size=\"15\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">−</text>"},"axes":"<path d=\"M100,210 L100,30\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.5\" opacity=\"0.45\"/><path d=\"M100,210 L100,215\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><text x=\"100\" y=\"223\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">1</text><path d=\"M150,210 L150,30\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.5\" opacity=\"0.45\"/><path d=\"M150,210 L150,215\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><text x=\"150\" y=\"223\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">2</text><path d=\"M200,210 L200,30\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.5\" opacity=\"0.45\"/><path d=\"M200,210 L200,215\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><text x=\"200\" y=\"223\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">3</text><path d=\"M250,210 L250,30\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.5\" opacity=\"0.45\"/><path d=\"M250,210 L250,215\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><text x=\"250\" y=\"223\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">4</text><path d=\"M300,210 L300,30\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.5\" opacity=\"0.45\"/><path d=\"M300,210 L300,215\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><text x=\"300\" y=\"223\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">5</text><path d=\"M350,210 L350,30\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.5\" opacity=\"0.45\"/><path d=\"M350,210 L350,215\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><text x=\"350\" y=\"223\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">6</text><path d=\"M50,180 L350,180\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.5\" opacity=\"0.45\"/><path d=\"M45,180 L50,180\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><text x=\"42\" y=\"185\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"end\" fill=\"var(--ink, #1F2328)\">1</text><path d=\"M50,150 L350,150\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.5\" opacity=\"0.45\"/><path d=\"M45,150 L50,150\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><text x=\"42\" y=\"155\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"end\" fill=\"var(--ink, #1F2328)\">2</text><path d=\"M50,120 L350,120\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.5\" opacity=\"0.45\"/><path d=\"M45,120 L50,120\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><text x=\"42\" y=\"125\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"end\" fill=\"var(--ink, #1F2328)\">3</text><path d=\"M50,90 L350,90\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.5\" opacity=\"0.45\"/><path d=\"M45,90 L50,90\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><text x=\"42\" y=\"95\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"end\" fill=\"var(--ink, #1F2328)\">4</text><path d=\"M50,60 L350,60\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.5\" opacity=\"0.45\"/><path d=\"M45,60 L50,60\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><text x=\"42\" y=\"65\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"end\" fill=\"var(--ink, #1F2328)\">5</text><path d=\"M50,30 L350,30\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.5\" opacity=\"0.45\"/><path d=\"M45,30 L50,30\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><text x=\"42\" y=\"35\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"end\" fill=\"var(--ink, #1F2328)\">6</text><text x=\"42\" y=\"223\" font-family=\"Lexend, sans-serif\" font-size=\"14\" text-anchor=\"end\" fill=\"var(--ink, #1F2328)\">0</text><path d=\"M50,210 L356,210 M50,210 L50,24\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.6\"/><text x=\"200\" y=\"238.5\" font-family=\"Lexend, sans-serif\" font-size=\"14\" font-weight=\"600\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">Current (A)</text><g transform=\"rotate(-90 15 120)\"><text x=\"15\" y=\"125\" font-family=\"Lexend, sans-serif\" font-size=\"14\" font-weight=\"600\" text-anchor=\"middle\" fill=\"var(--ink, #1F2328)\">Potential difference (V)</text></g>"};/*END-CV-ART*/
  /*CV-TEX*/var CV_TEX = {"i":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>I</mi><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mi>V</mi><mi>R</mi></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">I = \\dfrac{V}{R}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.07847em;\">I</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0463em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3603em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.00773em;\">R</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.22222em;\">V</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","rs":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><msub><mi>R</mi><mi>s</mi></msub><mo>=</mo><msub><mi>R</mi><mn>1</mn></msub><mo>+</mo><msub><mi>R</mi><mn>2</mn></msub></mrow><annotation encoding=\"application/x-tex\">R_s = R_1 + R_2</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.8333em;vertical-align:-0.15em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.00773em;\">R</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.1514em;\"><span style=\"top:-2.55em;margin-left:-0.0077em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mathnormal mtight\">s</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8333em;vertical-align:-0.15em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.00773em;\">R</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.0077em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8333em;vertical-align:-0.15em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.00773em;\">R</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.0077em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span></span>","rp":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><msub><mi>R</mi><mi>p</mi></msub></mfrac></mstyle><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><msub><mi>R</mi><mn>1</mn></msub></mfrac></mstyle><mo>+</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><msub><mi>R</mi><mn>2</mn></msub></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\dfrac{1}{R_p} = \\dfrac{1}{R_1} + \\dfrac{1}{R_2}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:2.2935em;vertical-align:-0.9721em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.00773em;\">R</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.1514em;\"><span style=\"top:-2.55em;margin-left:-0.0077em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mathnormal mtight\">p</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.2861em;\"><span></span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.9721em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.1574em;vertical-align:-0.836em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.00773em;\">R</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.0077em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.836em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.1574em;vertical-align:-0.836em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.00773em;\">R</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.0077em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.836em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>"};/*END-CV-TEX*/
  var CV_MODES = [['One', 'One resistor'], ['Series', 'Two in series'], ['Parallel', 'Two in parallel']];
  var CV_R = [2, 3, 6];
  var CV_NOTE = 'Ideal cells and meters — a real cell has a little resistance of its own, so real readings are slightly smaller.';
  var CV_KM = "KaTeX_Main, 'Times New Roman', serif";
  function cvEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function cvF2(f) {                         /* exact [p, q] -> 2 dp, half up, trailing zeros dropped */
    var p = f[0], q = f[1], h = Math.floor((200 * p + q) / (2 * q)), r = h % 100, s = String(Math.floor(h / 100));
    if (r) s += ('.' + (r < 10 ? '0' : '') + r).replace(/0$/, '');
    return s;
  }
  function cvNum(f) { return f[0] / f[1]; }
  function cvCase(m, r1, r2, n) {
    var R = m === 0 ? [r1, 1] : m === 1 ? [r1 + r2, 1] : [r1 * r2, r1 + r2], V = [3 * n, 2], I = [V[0] * R[1], V[1] * R[0]];
    var o = { V: V, R: R, I: I, x: 50 + 50 * cvNum(I), y: 210 - 30 * cvNum(V) };
    if (m === 1) { o.V1 = [I[0] * r1, I[1]]; o.V2 = [I[0] * r2, I[1]]; }
    if (m === 2) { o.I1 = [V[0], V[1] * r1]; o.I2 = [V[0], V[1] * r2]; }
    return o;
  }
  function cvTx(s) {                         /* SVG text content: ₁ ₂ as subscripts, Ω in KaTeX_Main (as the drawings) */
    var out = '', low = false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i), sb = c === '₁' || c === '₂';
      if (sb) { out += '<tspan dy="3.6" font-size="10.1">' + (c === '₁' ? '1' : '2') + '</tspan>'; low = true; continue; }
      var t = c === 'Ω' ? '<tspan font-family="' + CV_KM + '" font-weight="400">Ω</tspan>' : cvEsc(c);
      if (low) { out += '<tspan dy="-3.6">' + t + '</tspan>'; low = false; } else out += t;
    }
    return out;
  }
  function cvH(s) {                          /* HTML: numbers and Ω in KaTeX_Main */
    return cvEsc(s).replace(/(\d+(?:\.\d+)?|Ω)/g, '<span class="cv-n">$1</span>');
  }
  function initCv() {
    $$('svg[data-cv]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-cv-on')) return;
      art.setAttribute('data-cv-on', '1');
      var fig = svg.closest('.fig'), bid = fig ? fig.getAttribute('data-block-id') || '' : '';
      if (fig) fig.classList.add('fig--cv');
      var S = /-WRAPUP\./.test(bid) ? { m: 2, r1: 3, r2: 6, n: 4 } : /-T05\./.test(bid) ? { m: 1, r1: 3, r2: 6, n: 1 } : { m: 0, r1: 3, r2: 6, n: 1 };
      cvBuild(art, svg, S);
    });
  }
  function cvBuild(art, svg, S) {
    S.pts = [];
    var uid = Math.random().toString(36).slice(2, 7);
    function seg(cls, label, items, attr) {
      return '<div class="cv-ctl ' + cls + '"><span class="cv-lbl" id="cv-' + cls + '-' + uid + '">' + label + '</span>' +
        '<div class="cv-seg" role="group" aria-labelledby="cv-' + cls + '-' + uid + '">' + items.map(function (it, i) {
          return '<button type="button" ' + attr + '="' + it[0] + '" aria-pressed="false">' + it[1] + '</button>'; }).join('') + '</div></div>';
    }
    var rItems = CV_R.map(function (r) { return [r, r + ' Ω']; });
    var root = document.createElement('div');
    root.className = 'cv';
    root.innerHTML =
      '<p class="cv-model">Ideal model: each cell gives exactly 1.5 V and has no resistance of its own; the ammeter and ' +
      'voltmeter are ideal. Supply p.d. V = 1.5 V × number of cells.</p>' +
      '<p class="cv-eqs"><span>' + (CV_TEX.i || 'I = V ÷ R') + '</span><span>' + (CV_TEX.rs || 'Rs = R1 + R2') + '</span><span>' +
      (CV_TEX.rp || '1/Rp = 1/R1 + 1/R2') + '</span></p>' +
      seg('cv-modes', 'Circuit', CV_MODES.map(function (m, i) { return [i, m[1]]; }), 'data-m') +
      '<div class="cv-rs">' + seg('cv-r1', 'R<sub>1</sub>', rItems, 'data-r') + seg('cv-r2', 'R<sub>2</sub>', rItems, 'data-r') + '</div>' +
      seg('cv-cells', 'Cells', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], 'data-n') +
      '<div class="cv-acts"><button type="button" class="cv-add">Add reading</button><button type="button" class="cv-clear">Clear graph</button></div>';
    var box = document.createElement('div'); box.className = 'cv-art';
    var read = document.createElement('div'); read.className = 'cv-read'; read.setAttribute('aria-live', 'polite');
    read.innerHTML = '<b class="cv-l1"></b><span class="cv-l2"></span><span class="cv-l3"></span><span class="cv-msg"></span>';
    var gbox = document.createElement('div'); gbox.className = 'cv-art cv-gbox';
    gbox.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" role="img" class="dg cv-graph" ' +
      'stroke-linecap="round" stroke-linejoin="round"><title>V–I graph</title>' + (CV_ART.axes || '') + '<g class="cv-gdyn"></g></svg>';
    var note = document.createElement('p'); note.className = 'cv-note'; note.textContent = CV_NOTE;
    art.parentNode.insertBefore(root, art);
    art.insertBefore(box, svg); box.appendChild(svg);
    art.appendChild(read); art.appendChild(gbox); art.appendChild(note);
    $$('.cv-v1, .cv-v2, .cv-v3', svg).forEach(function (g) { g.parentNode.removeChild(g); });
    var live = document.createElementNS('http://www.w3.org/2000/svg', 'g'); live.setAttribute('class', 'cv-live'); svg.appendChild(live);
    svg.setAttribute('viewBox', '0 0 400 200');
    svg.classList.add('cv-on');
    var gsvg = $('.cv-graph', gbox), gdyn = $('.cv-gdyn', gbox);
    function lines() {
      var c = cvCase(S.m, S.r1, S.r2, S.n);
      var l1 = 'Ammeter: ' + cvF2(c.I) + ' A · Voltmeter: ' + cvF2(c.V) + ' V', l2 = 'Equivalent resistance: ' + cvF2(c.R) + ' Ω';
      var l3 = S.m === 1 ? 'Across R1: ' + cvF2(c.V1) + ' V · across R2: ' + cvF2(c.V2) + ' V' :
        S.m === 2 ? 'Through R1: ' + cvF2(c.I1) + ' A · through R2: ' + cvF2(c.I2) + ' A' : '';
      return { c: c, l1: l1, l2: l2, l3: l3 };
    }
    function drawCircuit(L) {
      var c = L.c;
      live.innerHTML = (CV_ART.bat ? CV_ART.bat[S.n] : '') + (CV_ART.frame ? CV_ART.frame[CV_MODES[S.m][0]] : '');
      var set = function (cls, s) { var t = $('.' + cls, live); if (t) t.innerHTML = cvTx(s); };
      set('cv-l-r1', 'R₁ = ' + S.r1 + ' Ω'); set('cv-l-r2', 'R₂ = ' + S.r2 + ' Ω');
      if (S.m === 1) { set('cv-l-x1', 'V₁ = ' + cvF2(c.V1) + ' V'); set('cv-l-x2', 'V₂ = ' + cvF2(c.V2) + ' V'); }
      if (S.m === 2) { set('cv-l-x1', 'I₁ = ' + cvF2(c.I1) + ' A'); set('cv-l-x2', 'I₂ = ' + cvF2(c.I2) + ' A'); }
    }
    function drawGraph() {
      var o = [], n = S.pts.length;
      if (n >= 2) {
        var p = S.pts[n - 1], I = cvNum(p.I), V = cvNum(p.V), t = Math.min(300 / (50 * I), 180 / (30 * V));
        var x2 = 50 + 50 * I * t, y2 = 210 - 30 * V * t, R = [p.V[0] * p.I[1], p.V[1] * p.I[0]];
        o.push('<path class="cv-slope" d="M50,210 L' + x2.toFixed(2) + ',' + y2.toFixed(2) + '" fill="none" stroke="var(--acc, #0A6C74)" stroke-width="1.8" stroke-dasharray="6 4"/>');
        o.push('<text class="cv-sl" x="346" y="196" font-family="Lexend, sans-serif" font-size="14" text-anchor="end" fill="var(--acc, #0A6C74)">' +
          cvTx('slope = V ÷ I = R = ' + cvF2(R) + ' Ω') + '</text>');
      }
      S.pts.forEach(function (p, i) {
        o.push('<circle class="cv-pt' + (i === n - 1 && S.fresh ? ' cv-new' : '') + '" cx="' + +p.x.toFixed(4) + '" cy="' + +p.y.toFixed(4) + '" r="4.5" ' +
          'fill="var(--dg-cv-pt11, #B91C1C)" stroke="var(--ink, #1F2328)" stroke-width="1.2"/>');
      });
      gdyn.innerHTML = o.join('');
      S.fresh = false;
    }
    function draw(msg) {
      var L = lines();
      drawCircuit(L);
      drawGraph();
      $('.cv-l1', read).innerHTML = cvH(L.l1); $('.cv-l2', read).innerHTML = cvH(L.l2); $('.cv-l3', read).innerHTML = cvH(L.l3);
      $('.cv-msg', read).textContent = msg || '';
      var txt = L.l1 + '. ' + L.l2 + '.' + (L.l3 ? ' ' + L.l3 + '.' : '');
      svg.setAttribute('aria-label', 'Circuit: ' + CV_MODES[S.m][1].toLowerCase() + ', ' + S.n + ' cell' + (S.n > 1 ? 's' : '') + '. ' + txt);
      gsvg.setAttribute('aria-label', 'V–I graph, ' + S.pts.length + ' reading' + (S.pts.length === 1 ? '' : 's') + ' plotted' +
        (S.pts.length >= 2 ? ', slope = V ÷ I = R = ' + cvF2([S.pts[S.pts.length - 1].V[0] * S.pts[S.pts.length - 1].I[1], S.pts[S.pts.length - 1].V[1] * S.pts[S.pts.length - 1].I[0]]) + ' Ω' : '') + '. ' + txt);
      $$('.cv-modes button', root).forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-m') === S.m ? 'true' : 'false'); });
      $$('.cv-r1 button', root).forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-r') === S.r1 ? 'true' : 'false'); });
      $$('.cv-r2 button', root).forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-r') === S.r2 ? 'true' : 'false'); });
      $$('.cv-cells button', root).forEach(function (b) { b.setAttribute('aria-pressed', +b.getAttribute('data-n') === S.n ? 'true' : 'false'); });
      $('.cv-r2', root).hidden = S.m === 0;
      $('.cv-clear', root).disabled = !S.pts.length;
      var c = L.c;
      root.setAttribute('data-state', [S.m, S.r1, S.r2, S.n].join(' '));
      root.setAttribute('data-v', String(cvNum(c.V))); root.setAttribute('data-r', String(cvNum(c.R))); root.setAttribute('data-i', String(cvNum(c.I)));
      root.setAttribute('data-x', String(c.x)); root.setAttribute('data-y', String(c.y));
      root.setAttribute('data-x1', S.m === 1 ? String(cvNum(c.V1)) : S.m === 2 ? String(cvNum(c.I1)) : '');
      root.setAttribute('data-x2', S.m === 1 ? String(cvNum(c.V2)) : S.m === 2 ? String(cvNum(c.I2)) : '');
    }
    function clearIf(changed) { if (changed && S.pts.length) { S.pts = []; return 'Graph cleared — the readings belonged to a different resistance.'; } return ''; }
    $$('.cv-modes button', root).forEach(function (b) {
      on(b, 'click', function () { var m = +b.getAttribute('data-m'), ch = m !== S.m; S.m = m; draw(clearIf(ch)); });
    });
    ['r1', 'r2'].forEach(function (k) {
      $$('.cv-' + k + ' button', root).forEach(function (b) {
        on(b, 'click', function () { var r = +b.getAttribute('data-r'), ch = r !== S[k] && (k === 'r1' || S.m !== 0); S[k] = r; draw(clearIf(ch)); });
      });
    });
    $$('.cv-cells button', root).forEach(function (b) { on(b, 'click', function () { S.n = +b.getAttribute('data-n'); draw(); }); });
    on($('.cv-add', root), 'click', function () {
      var c = lines().c;
      if (S.pts.some(function (p) { return Math.abs(p.x - c.x) < 1e-9 && Math.abs(p.y - c.y) < 1e-9; })) {
        draw('This reading is already on the graph.'); return;
      }
      S.pts.push({ I: c.I, V: c.V, x: c.x, y: c.y }); S.fresh = true;
      draw('Reading added: ' + cvF2(c.I) + ' A, ' + cvF2(c.V) + ' V (' + S.pts.length + ' on the graph).');
    });
    on($('.cv-clear', root), 'click', function () {
      S.pts = []; draw('Graph cleared.');
      $('.cv-add', root).focus();
    });
    draw();
  }

  /* ---------------------------------------------------- sector and segment explorer (Maths Ch 11, T02-V6)
     svg[data-se] is the static first view (content/C10-MATH-CH11/diagrams/_src/a11b.py v6: r = 7, θ = 60°); initSe replaces
     it. Topic 2 opens in "sector" mode (slider 0°…360° in steps of 5°); Topic 3 (figure block id …-T03.…) in "segment" mode
     (only 60°, 90°, 120°: the angles of the 2026-27 syllabus). Slider: pointer and arrow keys in steps of 5°, Shift + arrow 1°
     (so worked example 1's 72° can be set), Page Up / Page Down 30°, Home / End. Drawing: W = container width (240…640 px), H = 0.75W, O at
     (0.5W, 0.5H), circle radius 0.3W whatever r is (only the "r = … cm" label changes). Exact arithmetic: every value is
     a + b√3 + cπ with a, b, c fractions of integers (θ is a multiple of 5, r is 7, 14 or 21), π = 22/7 folded into a unless
     "in terms of π" is on; 2 decimals half-up (exact for fractions). Nothing is stored. */
  /*SE-TEX*/var SE_TEX = {"arc":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>l</mi><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mi>θ</mi><mn>360</mn></mfrac></mstyle><mo>×</mo><mn>2</mn><mi>π</mi><mi>r</mi></mrow><annotation encoding=\"application/x-tex\">l = \\dfrac{\\theta}{360} \\times 2\\pi r</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6944em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.01968em;\">l</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0574em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3714em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">360</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">θ</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">×</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6444em;\"></span><span class=\"mord\">2</span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span></span></span></span>","sector":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mtext>sector</mtext><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mi>θ</mi><mn>360</mn></mfrac></mstyle><mo>×</mo><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup></mrow><annotation encoding=\"application/x-tex\">\\text{sector} = \\dfrac{\\theta}{360} \\times \\pi r^2</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6151em;\"></span><span class=\"mord text\"><span class=\"mord\">sector</span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0574em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3714em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">360</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">θ</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">×</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8141em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span></span></span></span>","segment":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mtext>segment</mtext><mo>=</mo><mtext>sector</mtext><mo>−</mo><mi mathvariant=\"normal\">△</mi><mrow><mi mathvariant=\"normal\">O</mi><mi mathvariant=\"normal\">A</mi><mi mathvariant=\"normal\">B</mi></mrow></mrow><annotation encoding=\"application/x-tex\">\\text{segment} = \\text{sector} - \\triangle \\mathrm{OAB}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.8095em;vertical-align:-0.1944em;\"></span><span class=\"mord text\"><span class=\"mord\">segment</span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6984em;vertical-align:-0.0833em;\"></span><span class=\"mord text\"><span class=\"mord\">sector</span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8889em;vertical-align:-0.1944em;\"></span><span class=\"mord\">△</span><span class=\"mord\"><span class=\"mord mathrm\">OAB</span></span></span></span></span>"};/*END-SE-TEX*/
  var SE_NOTE = 'Segment questions in the exam use only 60°, 90° and 120°.';
  function seQ(n, d) { if (d < 0) { n = -n; d = -d; } var g = mGcd(n, d) || 1; return [n / g, d / g]; }
  function seAdd(p, q) { return seQ(p[0] * q[1] + q[0] * p[1], p[1] * q[1]); }
  function seNeg(p) { return [-p[0], p[1]]; }
  /* a value: {a: [n, d], b: [n, d] (×√3), c: [n, d] (×π)} */
  function seV(a, b, c) { return { a: a || [0, 1], b: b || [0, 1], c: c || [0, 1] }; }
  function seNum(v) { return v.a[0] / v.a[1] + v.b[0] / v.b[1] * Math.sqrt(3) + v.c[0] / v.c[1] * Math.PI; }
  function seR2(v) {                         /* 2 decimals, half-up; exact when the value is a fraction */
    var h;
    if (v.b[0] === 0 && v.c[0] === 0) { var n = v.a[0], d = v.a[1], s = n < 0 ? -1 : 1; n = Math.abs(n); h = s * Math.floor((200 * n + d) / (2 * d)); }
    else h = Math.floor(seNum(v) * 100 + 0.5 + 1e-9);
    var neg = h < 0; h = Math.abs(h);
    return (neg ? '−' : '') + Math.floor(h / 100) + '.' + (h % 100 < 10 ? '0' : '') + (h % 100);
  }
  function seFr(n, d, sym, html) {           /* |n|/d with an optional symbol (π, √3) after the numerator */
    n = Math.abs(n);
    var top = (n === 1 && sym ? '' : String(n)) + (sym || '');
    if (!html) return d === 1 ? top : top + '/' + d;
    var th = top.replace('√3', '<span class="gx-rt">√<span>3</span></span>').replace('π', '<i>π</i>');
    return d === 1 ? th : '<span class="se-fr"><span class="se-fn">' + th + '</span><span class="se-sr">/</span><span class="se-fd">' + d + '</span></span>';
  }
  function seExact(v, html) {                /* "77/3 − 49√3/4", "49π/5", "0" */
    var parts = [[v.c, 'π'], [v.a, ''], [v.b, '√3']], out = '';
    parts.forEach(function (p) {
      var q = p[0]; if (q[0] === 0) return;
      var t = seFr(q[0], q[1], p[1], html);
      out += out ? (q[0] < 0 ? ' − ' : ' + ') + t : (q[0] < 0 ? '−' : '') + t;
    });
    return out || '0';
  }
  function seIsInt(v) { return v.b[0] === 0 && v.c[0] === 0 && v.a[1] === 1; }
  function seShow(v, piMode, html) {          /* "= 44/5 = 8.80", "= 22/3 ≈ 7.33", "= 154", "= 49π/5" */
    var ex = seExact(v, html);
    if (piMode || seIsInt(v)) return '= ' + ex;
    var r2 = seR2(v), terminates = v.b[0] === 0 && v.c[0] === 0 && (v.a[0] * 100) % v.a[1] === 0;
    return '= ' + ex + (terminates ? ' = ' : ' ≈ ') + r2;
  }
  /* the model: (r, θ, mode, π kept?) -> values */
  function seModel(r, t, mode, piMode) {
    var r2 = r * r, M = { r: r, t: t };
    function pi(n, d) { return piMode ? seV(null, null, seQ(n, d)) : seV(seQ(22 * n, 7 * d)); }
    M.frac = seQ(t, 360);
    M.arc = pi(2 * r * t, 360);
    M.sector = pi(r2 * t, 360);
    M.major = pi(r2 * (360 - t), 360);
    if (mode === 'segment') {
      M.tri = t === 90 ? seV(seQ(r2, 2)) : seV(null, seQ(r2, 4));
      M.seg = seV(seAdd(M.sector.a, seNeg(M.tri.a)), seNeg(M.tri.b), M.sector.c);
      var whole = pi(r2, 1);
      M.majseg = seV(seAdd(whole.a, seNeg(M.seg.a)), seNeg(M.seg.b), seAdd(whole.c, seNeg(M.seg.c)));
      M.chordK = t === 60 ? '' : t === 90 ? '√2' : '√3';
    }
    return M;
  }
  function initSe() {
    $$('svg[data-se="explorer"]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-se-on')) return;
      art.setAttribute('data-se-on', '1');
      var fig = svg.closest('.fig'), t3 = /-T03\./.test(fig ? fig.getAttribute('data-block-id') || '' : '');
      if (fig) fig.classList.add('fig--se');
      seBuild(art, t3 ? 'segment' : 'sector');
    });
  }
  function seBuild(art, mode) {
    var uid = 'se' + Math.random().toString(36).slice(2, 7);
    var S = { r: 7, t: 60, pi: false, shown: 60, anim: null };
    var INK = 'var(--ink, #1F2328)', SOFT = 'var(--ink-soft, #57554D)', C1 = 'var(--dg-m-opp, #C2410C)', C2 = 'var(--dg-m-adj, #1D5FBF)';
    var C1BG = 'var(--dg-m-opp-bg, #FCE7DA)', C2BG = 'var(--dg-m-adj-bg, #DEE9FB)', NEU = 'var(--dg-m-hyp-bg, #EFEDE6)', CARD = 'var(--card, #FFF)';
    var root = document.createElement('div');
    root.className = 'se';
    root.setAttribute('data-mode', mode);
    var rBtns = [7, 14, 21].map(function (r) {
      return '<button type="button" data-r="' + r + '" aria-pressed="' + (r === 7) + '"><span class="mx"><i>r</i> = ' + r + '</span></button>'; }).join('');
    var ctlAngle = mode === 'sector' ?
      '<div class="se-ctl"><label class="se-lbl" for="' + uid + '-a">Angle <span class="mx"><i>θ</i></span>: <b class="se-tv">60°</b></label>' +
      '<input class="se-range" type="range" id="' + uid + '-a" min="0" max="360" step="1" value="60" aria-label="Angle of the sector in degrees">' +
      '<p class="se-hint">Keys: ← → or ↑ ↓ change <span class="mx"><i>θ</i></span> by 5° (with Shift: 1°); Page Up / Page Down by 30°; Home 0°, End 360°.</p></div>' :
      '<div class="se-ctl"><span class="se-lbl" id="' + uid + '-al">Angle <span class="mx"><i>θ</i></span></span>' +
      '<div class="se-seg se-ang" role="group" aria-labelledby="' + uid + '-al">' + [60, 90, 120].map(function (t) {
        return '<button type="button" data-t="' + t + '" aria-pressed="' + (t === 60) + '">' + t + '°</button>'; }).join('') + '</div>' +
      '<p class="se-note">' + SE_NOTE + '</p></div>';
    var eqs = ['arc', 'sector'].concat(mode === 'segment' ? ['segment'] : []).map(function (k) {
      return SE_TEX[k] ? '<span class="se-eq">' + SE_TEX[k] + '</span>' : ''; }).join('');
    root.innerHTML =
      '<div class="se-art"><svg class="se-svg" role="img" aria-labelledby="' + uid + '-t"><title id="' + uid + '-t"></title>' +
      '<defs>' +
      '<pattern id="' + uid + '-h1" patternUnits="userSpaceOnUse" width="6.5" height="6.5" patternTransform="rotate(45)"><path d="M0,0 L0,6.5" stroke="' + C1 + '" stroke-width="2.2"/></pattern>' +
      '<pattern id="' + uid + '-h2" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(-45)"><path d="M0,0 L0,5" stroke="' + C2 + '" stroke-width="2.6"/></pattern>' +
      '<pattern id="' + uid + '-h3" patternUnits="userSpaceOnUse" width="7" height="7"><path d="M0,0 L7,0" stroke="' + SOFT + '" stroke-width="1.8"/></pattern>' +
      '</defs><g class="se-g"></g></svg></div>' +
      '<div class="se-ctls"><div class="se-ctl"><span class="se-lbl" id="' + uid + '-rl">Radius</span>' +
      '<div class="se-seg se-rad" role="group" aria-labelledby="' + uid + '-rl">' + rBtns + '</div></div>' + ctlAngle +
      '<button type="button" class="se-pi" aria-pressed="false">in terms of <span class="mx"><i>π</i></span></button></div>' +
      (eqs ? '<div class="se-eqs">' + eqs + '</div>' : '') +
      '<div class="se-read" aria-live="polite"></div>';
    art.innerHTML = '';
    art.appendChild(root);
    var svgEl = $('.se-svg', root), g = $('.se-g', root), read = $('.se-read', root), range = $('.se-range', root);
    function rm() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function geo() {
      var W = Math.min(640, Math.max(240, Math.round($('.se-art', root).clientWidth || 358)));
      return { W: W, H: 0.75 * W, ox: 0.5 * W, oy: 0.375 * W, R: 0.3 * W };
    }
    function at(G, r, deg) { var a = deg * Math.PI / 180; return [G.ox + r * Math.cos(a), G.oy - r * Math.sin(a)]; }
    function f(p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }
    function arcD(G, r, a0, a1) {            /* anticlockwise from a0 to a1 (degrees) */
      if (a1 - a0 >= 360 - 1e-9) { var p = at(G, r, a0), q = at(G, r, a0 + 180); return 'M' + f(p) + ' A' + r.toFixed(2) + ',' + r.toFixed(2) + ' 0 0 0 ' + f(q) + ' A' + r.toFixed(2) + ',' + r.toFixed(2) + ' 0 0 0 ' + f(p); }
      return 'M' + f(at(G, r, a0)) + ' A' + r.toFixed(2) + ',' + r.toFixed(2) + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 0 ' + f(at(G, r, a1));
    }
    function P_(d, o) {
      o = o || {};
      return '<path d="' + d + '" fill="' + (o.fill || 'none') + '" stroke="' + (o.st || 'none') + '" stroke-width="' + (o.sw || 0) + '"' +
        (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + (o.cls ? ' class="' + o.cls + '"' : '') + ' stroke-linecap="round" stroke-linejoin="round"/>';
    }
    function T_(p, s, o) {
      o = o || {};
      return '<text x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" font-family="' + (o.it ? 'KaTeX_Math, serif' : 'Lexend, sans-serif') + '" font-size="' + (o.size || 15) +
        '"' + (o.it ? ' font-style="italic"' : ' font-weight="600"') + ' text-anchor="middle" fill="' + INK + '" paint-order="stroke" stroke="' + CARD + '" stroke-width="4" stroke-linejoin="round" class="se-t' + (o.cls ? ' ' + o.cls : '') + '">' + s + '</text>';
    }
    function lab(G, p, dir, s, gap, cls) {   /* a point letter centred gap px beyond p along dir, kept inside */
      var x = p[0] + dir[0] * (gap + 6), y = p[1] + dir[1] * (gap + 6) + 5.3;
      x = Math.max(10, Math.min(G.W - 10, x)); y = Math.max(16, Math.min(G.H - 4, y));
      return T_([x, y], s, { cls: cls });
    }
    function box(v, a, b, sz) {
      function uv(p, q) { var dx = q[0] - p[0], dy = q[1] - p[1], n = Math.hypot(dx, dy) || 1; return [dx / n, dy / n]; }
      var ua = uv(v, a), ub = uv(v, b), p1 = [v[0] + ua[0] * sz, v[1] + ua[1] * sz], p2 = [p1[0] + ub[0] * sz, p1[1] + ub[1] * sz], p3 = [v[0] + ub[0] * sz, v[1] + ub[1] * sz];
      return P_('M' + f(p1) + ' L' + f(p2) + ' L' + f(p3), { st: INK, sw: 1.4, cls: 'se-ra' });
    }
    function draw(t) {                       /* t: the angle drawn (may be between states while gliding) */
      var G = geo(), O = [G.ox, G.oy], R = G.R, A = at(G, R, 0), B = at(G, R, t), out = '';
      svgEl.setAttribute('viewBox', '0 0 ' + G.W + ' ' + G.H.toFixed(2)); svgEl.setAttribute('width', G.W); svgEl.setAttribute('height', G.H.toFixed(2));
      svgEl.setAttribute('data-w', String(G.W));
      var secD = t <= 0 ? '' : t >= 360 ? arcD(G, R, 0, 360) + ' Z' : 'M' + f(O) + ' L' + f(A) + ' ' + arcD(G, R, 0, t).replace(/^M[^A]*/, '') + ' Z';
      if (mode === 'sector') {
        if (secD) out += P_(secD, { fill: C1BG, cls: 'se-sec' }) + P_(secD, { fill: 'url(#' + uid + '-h1)', cls: 'se-sech' });
      } else {
        var triD = 'M' + f(O) + ' L' + f(A) + ' L' + f(B) + ' Z', segD = arcD(G, R, 0, t) + ' Z';
        out += P_(triD, { fill: NEU, cls: 'se-tri' }) + P_(triD, { fill: 'url(#' + uid + '-h3)' });
        out += P_(segD, { fill: C2BG, cls: 'se-segm' }) + P_(segD, { fill: 'url(#' + uid + '-h2)' });
      }
      out += '<circle class="se-circle" cx="' + O[0].toFixed(2) + '" cy="' + O[1].toFixed(2) + '" r="' + R.toFixed(2) + '" fill="none" stroke="' + INK + '" stroke-width="1.8"/>';
      if (t > 0) out += P_(arcD(G, R, 0, t), { st: C1, sw: 3.4, cls: 'se-arc' });
      out += P_('M' + f(O) + ' L' + f(A), { st: INK, sw: 2 }) + P_('M' + f(O) + ' L' + f(B), { st: INK, sw: 2, cls: 'se-ob' });
      if (mode === 'segment') {
        var Mm = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], um = [Mm[0] - O[0], Mm[1] - O[1]], nm = Math.hypot(um[0], um[1]) || 1;
        out += P_('M' + f(A) + ' L' + f(B), { st: INK, sw: 2, cls: 'se-chord' });
        out += P_('M' + f(O) + ' L' + f(Mm), { st: INK, sw: 1.6, dash: '5 4', cls: 'se-om' });
        out += box(Mm, O, B, 7);
        out += '<circle cx="' + Mm[0].toFixed(2) + '" cy="' + Mm[1].toFixed(2) + '" r="2.6" fill="' + INK + '" class="se-m"/>';
        out += lab(G, Mm, [-um[0] / nm + 0.35 * um[1] / nm, -um[1] / nm - 0.35 * um[0] / nm], 'M', 7, 'se-lm');
      }
      if (t > 0 && t < 360) {
        var ar = 18;
        out += P_(arcD(G, ar, 0, t), { st: INK, sw: 1.6, cls: 'se-angarc' });
      }
      var tl = t < 30 ? t + 16 : t > 330 ? t - 16 : mode === 'segment' ? t * 0.27 : t / 2, rt = t < 30 || t > 330 ? 46 : mode === 'segment' ? 42 : 38;
      out += T_(at(G, rt, tl).map(function (v, i) { return i ? v + 5 : v; }), Math.round(t) + '°', { cls: 'se-tval' });
      out += '<circle cx="' + O[0].toFixed(2) + '" cy="' + O[1].toFixed(2) + '" r="3" fill="' + INK + '"/>';
      [A, B].forEach(function (p, i) { out += '<circle cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="3" fill="' + INK + '" class="se-pt" data-pt="' + 'AB'[i] + '"/>'; });
      var bd = t < 14 ? 14 : t > 346 ? 346 : t, ad = t < 14 || t > 346 ? (t < 14 ? -12 : 12) : 0;
      var uA = [Math.cos(ad * Math.PI / 180), -Math.sin(ad * Math.PI / 180)], uB = [Math.cos(bd * Math.PI / 180), -Math.sin(bd * Math.PI / 180)];
      out += lab(G, at(G, R, ad), uA, 'A', 6, 'se-la') + lab(G, at(G, R, bd), uB, 'B', 6, 'se-lb');
      out += lab(G, O, t > 120 && t < 240 ? [0.7, 0.7] : [-1, 0], 'O', 5, 'se-lo');
      var rl = [(O[0] + A[0]) / 2, O[1] + 20];
      out += '<text x="' + rl[0].toFixed(1) + '" y="' + rl[1].toFixed(1) + '" font-family="Lexend, sans-serif" font-size="15" text-anchor="middle" fill="' + INK +
        '" class="se-t se-rl" paint-order="stroke" stroke="' + CARD + '" stroke-width="4" stroke-linejoin="round"><tspan font-family="KaTeX_Math, serif" font-style="italic">r</tspan> = ' + S.r + ' cm</text>';
      g.innerHTML = out;
      svgEl.setAttribute('data-t', String(t)); svgEl.setAttribute('data-bx', B[0].toFixed(3)); svgEl.setAttribute('data-by', B[1].toFixed(3));
    }
    function L(k, h, cls) { return '<p class="se-l' + (cls ? ' ' + cls : '') + '"><span class="se-k">' + k + '</span> ' + h + '</p>'; }
    function mx(h) { return '<span class="mx">' + h + '</span>'; }
    function panel() {
      var M = seModel(S.r, S.t, mode, S.pi), h = '';
      h += L('fraction of the circle', mx('= ' + (M.frac[0] === 0 ? '0' : M.frac[1] === 1 ? String(M.frac[0]) : seFr(M.frac[0], M.frac[1], '', true))), 'se-frac');
      h += L('arc', mx('<i>l</i> ' + seShow(M.arc, S.pi, true)) + ' cm', 'se-arcl');
      h += L('sector', mx(seShow(M.sector, S.pi, true)) + ' cm²', 'se-secl');
      h += L('major sector', mx(seShow(M.major, S.pi, true)) + ' cm²', 'se-majl');
      if (mode === 'segment') {
        var tf = S.t === 90 ? seFr(1, 2, '', true) + ' <i>r</i>²' : '(' + seFr(1, 4, '√3', true) + ') <i>r</i>²';
        h += L('triangle OAB', mx('= ' + tf + ' ' + seShow(M.tri, S.pi, true)) + ' cm²', 'se-tril');
        h += L('segment', mx('= sector − triangle ' + seShow(M.seg, S.pi, true)) + ' cm²', 'se-segl');
        h += L('major segment', mx('= ' + (S.pi ? '<i>π</i>' : seFr(22, 7, '', true) + ' ×') + ' <i>r</i>² − segment ' + seShow(M.majseg, S.pi, true)) + ' cm²', 'se-majsegl');
        var k = M.chordK ? +M.chordK.slice(1) : 0, rt = k ? '<span class="gx-rt">√<span>' + k + '</span></span>' : '';
        h += L('chord AB', mx('= <i>r</i>' + rt + (k ? ' = ' + S.r + rt + (S.pi ? '' : ' ≈ ' + (Math.floor(S.r * Math.sqrt(k) * 100 + 0.5) / 100).toFixed(2)) : ' = ' + S.r)) + ' cm', 'se-chl');
      }
      read.innerHTML = h;
    }
    function attrs() {                       /* the state on the root at once (the panel text is throttled while sliding) */
      var M = seModel(S.r, S.t, mode, S.pi);
      var A = { r: String(S.r), t: String(S.t), pi: S.pi ? '1' : '0', frac: M.frac[1] === 1 ? String(M.frac[0]) : M.frac[0] + '/' + M.frac[1],
        arc: seShow(M.arc, S.pi), sector: seShow(M.sector, S.pi), major: seShow(M.major, S.pi) };
      if (mode === 'segment') { A.tri = seShow(M.tri, S.pi); A.seg = seShow(M.seg, S.pi); A.majseg = seShow(M.majseg, S.pi); A.chord = 'r' + M.chordK; }
      Object.keys(A).forEach(function (k) { root.setAttribute('data-' + k, A[k]); });
      $('title', svgEl).textContent = 'Circle with centre O, radius ' + S.r + ' cm; the ' + (mode === 'segment' ? 'chord AB cuts off a segment; ' : '') +
        'sector AOB has angle ' + S.t + ' degrees, ' + A.frac + ' of the circle.';
      if (range) {
        range.value = String(S.t);
        range.setAttribute('aria-valuetext', S.t + '°, ' + (M.frac[0] === 0 ? 'none' : A.frac === '1' ? 'the whole' : A.frac) + ' of the circle');
        $('.se-tv', root).textContent = S.t + '°';
      }
      $$('.se-rad button', root).forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-r') === S.r)); });
      $$('.se-ang button', root).forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-t') === S.t)); });
      $('.se-pi', root).setAttribute('aria-pressed', String(S.pi));
    }
    var panelT = mThrottle(panel, 250);
    function setT(t, glide, now) {
      t = Math.max(0, Math.min(360, Math.round(t)));
      if (mode === 'segment' && [60, 90, 120].indexOf(t) < 0) return;
      var from = S.anim ? S.anim.cur : S.shown;
      S.t = t;
      attrs();
      if (now) panel(); else panelT();
      if (S.anim) { cancelAnimationFrame(S.anim.raf); S.anim = null; }
      if (!glide || rm() || from === t) { S.shown = t; draw(t); return; }
      var t0 = null, dur = 240;
      S.anim = { cur: from };
      function step(ts) {
        if (!S.anim) return;
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur), q = 1 - (1 - p) * (1 - p), cur = from + (t - from) * q;
        if (p >= 1) { S.anim = null; S.shown = t; draw(t); return; }
        S.anim.cur = cur; S.shown = cur; draw(cur);
        S.anim.raf = requestAnimationFrame(step);
      }
      S.anim.raf = requestAnimationFrame(step);
    }
    if (range) {
      on(range, 'input', function () { setT(Math.round(+range.value / 5) * 5, false, false); });   /* pointer: steps of 5° */
      on(range, 'keydown', function (e) {
        var k = e.key, n = null, st = e.shiftKey ? 1 : 5;
        if (k === 'ArrowRight' || k === 'ArrowUp') n = S.t + st;
        else if (k === 'ArrowLeft' || k === 'ArrowDown') n = S.t - st;
        else if (k === 'PageUp') n = S.t + 30; else if (k === 'PageDown') n = S.t - 30;
        else if (k === 'Home') n = 0; else if (k === 'End') n = 360;
        if (n === null) return;
        e.preventDefault();
        setT(n, Math.abs(n - S.t) >= 30, true);
      });
      on(range, 'change', function () { panel(); });
    }
    $$('.se-ang button', root).forEach(function (b) { on(b, 'click', function () { setT(+b.getAttribute('data-t'), true, true); }); });
    $$('.se-rad button', root).forEach(function (b) { on(b, 'click', function () { S.r = +b.getAttribute('data-r'); attrs(); panel(); draw(S.anim ? S.anim.cur : S.shown); }); });
    on($('.se-pi', root), 'click', function () { S.pi = !S.pi; attrs(); panel(); });
    var lastW = 0;
    function onResize() { var w = geo().W; if (w === lastW) return; lastW = w; draw(S.anim ? S.anim.cur : S.shown); }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(root);
    on(window, 'resize', onResize);
    lastW = geo().W;
    attrs(); panel(); draw(S.t);
  }

  /*DR*/
  /* ---------------------------------------------------- direction-rule trainer (Science Ch 12, T02-V9; initDr)
     svg[data-dr] is the static first view and the no-JS view (content/C10-SCI-CH12/diagrams/_src/d12_dr.py: a worked
     question per page, drawn by this same core). initDr() hides it and builds the trainer above it: mode buttons
     (aria-pressed), a live drawing (viewBox 0 0 300 300), the question, six answer buttons (3 rows x 2), Check and New
     question, and a polite live region with the feedback and the running score (not stored). The figure's
     data-block-id picks the opening mode: Topic 4 'Force on a wire', the wrap-up 'Mixed', otherwise 'Field round a
     wire'. Nothing is stored. */
/*DR-CORE*/
  /* direction-rule trainer core (Science Ch 12, T02-V9): the model and the drawing, no DOM. Written into site.js by
     content/C10-SCI-CH12/diagrams/_src/dr_js.py; the same code (run in node) draws the trainer's static first view.
     Page frame: right (1,0,0), left (-1,0,0), up the page (0,1,0), down the page (0,-1,0), out of the page (0,0,1),
     into the page (0,0,-1). Field round a wire: B = I x r (r: from the wire to P, always at right angles to I and in
     the page). Force on a wire or protons: F = I x B. Electrons moving along v: F = -(v x B). Integers only. */
  var DR_V = { right: [1, 0, 0], left: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0], out: [0, 0, 1], 'in': [0, 0, -1] };
  var DR_KEYS = ['right', 'left', 'up', 'down', 'in', 'out'];
  var DR_WORD = { right: 'right', left: 'left', up: 'up the page', down: 'down the page', 'in': 'into the page', out: 'out of the page' };
  var DR_BTN = { right: 'Right', left: 'Left', up: 'Up the page', down: 'Down the page', 'in': 'Into the page ⊗', out: 'Out of the page ⊙' };
  var DR_MODES = [['field', 'Field round a wire'], ['force', 'Force on a wire'], ['mixed', 'Mixed']];
  function drCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function drDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function drName(v) {
    for (var i = 0; i < DR_KEYS.length; i++) { var u = DR_V[DR_KEYS[i]]; if (u[0] === v[0] && u[1] === v[1] && u[2] === v[2]) return DR_KEYS[i]; }
    return null;
  }
  function drAnswer(q) {
    var a = DR_V[q.a], b = DR_V[q.b], c = drCross(a, b);
    if (q.kind === 'electrons') c = [-c[0], -c[1], -c[2]];
    return drName(c);
  }
  function drKey(q) { return q.mode + ' ' + q.kind + ' ' + q.a + ' ' + q.b; }
  /* every question of a mode: field — the point beside the wire in the page; force — every perpendicular pair */
  function drAll(mode) {
    var out = [];
    DR_KEYS.forEach(function (a) {
      DR_KEYS.forEach(function (b) {
        if (drDot(DR_V[a], DR_V[b]) !== 0) return;
        if (mode === 'field') { if (b !== 'in' && b !== 'out') out.push({ mode: 'field', kind: 'current', a: a, b: b }); }
        else ['current', 'protons', 'electrons'].forEach(function (k) { out.push({ mode: 'force', kind: k, a: a, b: b }); });
      });
    });
    return out;
  }
  /* a random question; electron beams in about a third of force questions; never the same question twice in a row */
  function drPick(mode, prevKey, rnd) {
    rnd = rnd || Math.random;
    for (var t = 0; t < 200; t++) {
      var m = mode === 'mixed' ? (rnd() < 0.5 ? 'field' : 'force') : mode, q;
      if (m === 'field') { var F = drAll('field'); q = F[Math.floor(rnd() * F.length)]; }
      else {
        var r = rnd(), kind = r < 1 / 3 ? 'electrons' : r < 1 / 2 ? 'protons' : 'current';
        var L = drAll('force').filter(function (x) { return x.kind === kind; });
        q = L[Math.floor(rnd() * L.length)];
      }
      if (drKey(q) !== prevKey) return q;
    }
    return q;
  }
  function drQuestion(q) {
    if (q.mode === 'field') return 'The current in the wire flows ' + DR_WORD[q.a] + '. Which way does the field point at P?';
    if (q.kind === 'current') return 'The wire carries a current ' + DR_WORD[q.a] + ' in a field that points ' + DR_WORD[q.b] + '. Which way is the force on the wire?';
    return 'A beam of ' + q.kind + ' moves ' + DR_WORD[q.a] + ' in a field that points ' + DR_WORD[q.b] + '. Which way is the force on the beam?';
  }
  function drSteps(q) {
    var ans = DR_WORD[drAnswer(q)];
    if (q.mode === 'field') return 'Right hand. Thumb along the current (' + DR_WORD[q.a] + '). At P the fingers point ' + ans + '.';
    var cur = q.kind === 'electrons' ? DR_WORD[drName([-DR_V[q.a][0], -DR_V[q.a][1], -DR_V[q.a][2]])] : DR_WORD[q.a];
    return 'Left hand. Forefinger along the field (' + DR_WORD[q.b] + '). Middle finger along the current (' + cur + ')' +
      (q.kind === 'electrons' ? ', opposite to the electrons' : '') + '. Thumb: ' + ans + '.';
  }
  /* ---- drawing: viewBox 0 0 300 300; screen vector of a page direction (y down) */
  var DR_C = { ink: 'var(--ink, #1F2328)', soft: 'var(--ink-soft, #57554D)', card: 'var(--card, #FFFFFF)', paper: 'var(--dg-paper12, #FBFAF6)',
    fl: 'var(--dg-fl12, #0F766E)', cu: 'var(--dg-copper11, #C2410C)', cur: 'var(--dg-cur11, #1D4ED8)', el: 'var(--dg-elec11, #7C3AED)',
    ok: 'var(--dg-dr-ok12, #15803D)' };
  function drS(k) { var v = DR_V[k]; return [v[0], -v[1]]; }
  function drF(n) { return (Math.round(n * 100) / 100).toString(); }
  function drHead(x, y, dx, dy, col, s, cls) {         /* solid head, tip at (x, y), pointing (dx, dy) */
    var px = -dy * s * 0.5, py = dx * s * 0.5, bx = x - dx * s, by = y - dy * s;
    return '<path' + (cls ? ' class="' + cls + '"' : '') + ' d="M' + drF(x) + ',' + drF(y) + ' L' + drF(bx + px) + ',' + drF(by + py) + ' L' + drF(bx - px) + ',' + drF(by - py) +
      ' Z" fill="' + col + '" stroke="' + col + '" stroke-width="1"/>';
  }
  function drArrow(x1, y1, x2, y2, col, sw, s, cls, halo) {
    var L = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)), dx = (x2 - x1) / L, dy = (y2 - y1) / L;
    var ex = x2 - dx * s * 0.7, ey = y2 - dy * s * 0.7, o = '';
    if (halo) o += '<path d="M' + drF(x1) + ',' + drF(y1) + ' L' + drF(ex) + ',' + drF(ey) + '" stroke="' + DR_C.card + '" stroke-width="' + (sw + 6) + '" fill="none" stroke-linecap="round"/>';
    o += '<path d="M' + drF(x1) + ',' + drF(y1) + ' L' + drF(ex) + ',' + drF(ey) + '" stroke="' + col + '" stroke-width="' + sw + '" fill="none" stroke-linecap="round"/>';
    return '<g' + (cls ? ' class="' + cls + '"' : '') + ' data-dx="' + drF(dx) + '" data-dy="' + drF(dy) + '">' + o + drHead(x2, y2, dx, dy, col, s) + '</g>';
  }
  function drSym(cx, cy, r, k, col, sw, fill, cls) {   /* ⊗ (k 'in') or ⊙ ('out') as geometry */
    var o = '<circle cx="' + drF(cx) + '" cy="' + drF(cy) + '" r="' + r + '" fill="' + (fill || 'none') + '" stroke="' + col + '" stroke-width="' + sw + '"/>';
    if (k === 'in') { var a = r * 0.62; o += '<path d="M' + drF(cx - a) + ',' + drF(cy - a) + ' L' + drF(cx + a) + ',' + drF(cy + a) + ' M' + drF(cx - a) + ',' + drF(cy + a) + ' L' + drF(cx + a) + ',' + drF(cy - a) + '" stroke="' + col + '" stroke-width="' + sw + '"/>'; }
    else o += '<circle cx="' + drF(cx) + '" cy="' + drF(cy) + '" r="' + Math.max(r * 0.24, 2) + '" fill="' + col + '"/>';
    return '<g' + (cls ? ' class="' + cls + '"' : '') + ' data-sym="' + k + '">' + o + '</g>';
  }
  function drText(x, y, s, size, col, anchor, bold) {
    return '<text x="' + drF(x) + '" y="' + drF(y) + '" font-family="Lexend, sans-serif" font-size="' + size + '"' + (bold ? ' font-weight="600"' : '') +
      (anchor ? ' text-anchor="' + anchor + '"' : '') + ' fill="' + col + '" paint-order="stroke" stroke="' + DR_C.paper + '" stroke-width="4" stroke-linejoin="round">' + s + '</text>';
  }
  function drSvg(q, showAns) {
    var o = ['<rect x="1" y="1" width="298" height="298" rx="10" fill="' + DR_C.paper + '" stroke="' + DR_C.soft + '" stroke-width="1"/>'];
    var C = 150, ans = drAnswer(q);
    if (q.mode === 'force') {                          /* the field B across the whole square */
      if (q.b === 'in' || q.b === 'out') {
        for (var i = 0; i < 5; i++) for (var j = 0; j < 5; j++) o.push(drSym(30 + 60 * i, 30 + 60 * j, 8, q.b, DR_C.fl, 1.6, 'none', 'dr-b'));
        o.push(drText(52, 36, 'B', 17, DR_C.fl, 'start', true));
      } else {
        var b = drS(q.b), n = [-b[1], b[0]];
        [-120, -60, 0, 60, 120].forEach(function (off) {
          var mx = C + n[0] * off, my = C + n[1] * off;
          o.push(drArrow(mx - b[0] * 134, my - b[1] * 134, mx + b[0] * 134, my + b[1] * 134, DR_C.fl, 1.8, 10, 'dr-b'));
        });
        o.push(drText(C + n[0] * -98 + b[0] * 108, C + n[1] * -98 + b[1] * 108 + 6, 'B', 17, DR_C.fl, 'middle', true));
      }
    }
    /* the wire (or the beam) through the middle */
    var beam = q.kind !== 'current', col = q.kind === 'electrons' ? DR_C.el : q.kind === 'protons' ? DR_C.cur : DR_C.cu;
    var lab = q.kind === 'current' ? 'I' : q.kind;
    if (q.a === 'in' || q.a === 'out') {
      o.push(drSym(C, C, 14, q.a, beam ? col : DR_C.ink, 2.2, DR_C.card, 'dr-w'));
      o.push(drText(C + 20, C - 18, lab, beam ? 15 : 18, beam ? col : DR_C.ink, 'start', true));
    } else {
      var d = drS(q.a), m = [-d[1], d[0]];
      if (beam) {
        var dots = '';
        for (var t = -132; t <= 132; t += 12) dots += '<circle cx="' + drF(C + d[0] * t) + '" cy="' + drF(C + d[1] * t) + '" r="2.6" fill="' + col + '"/>';
        o.push('<g class="dr-w">' + dots + '</g>');
        o.push(drArrow(C + d[0] * 40, C + d[1] * 40, C + d[0] * 96, C + d[1] * 96, col, 3, 16, 'dr-i', true));
      } else {
        o.push('<path class="dr-w" d="M' + drF(C - d[0] * 136) + ',' + drF(C - d[1] * 136) + ' L' + drF(C + d[0] * 136) + ',' + drF(C + d[1] * 136) +
          '" stroke="' + DR_C.card + '" stroke-width="11" fill="none"/><path d="M' + drF(C - d[0] * 136) + ',' + drF(C - d[1] * 136) + ' L' + drF(C + d[0] * 136) + ',' + drF(C + d[1] * 136) +
          '" stroke="' + col + '" stroke-width="5" fill="none"/>');
        o.push(drArrow(C + d[0] * 60, C + d[1] * 60, C + d[0] * 104, C + d[1] * 104, col, 5, 20, 'dr-i'));
      }
      var lx = d[0] ? C + d[0] * 84 : C + 18, ly = d[0] ? C - 20 : C + d[1] * 84 + 6;
      o.push(drText(lx, ly, lab, beam ? 15 : 18, col, d[0] ? 'middle' : 'start', true));
    }
    if (q.mode === 'field') {                          /* the point P, 60 units from the wire */
      var r = drS(q.b), px = C + r[0] * 60, py = C + r[1] * 60;
      o.push('<circle class="dr-p" cx="' + drF(px) + '" cy="' + drF(py) + '" r="5" fill="' + DR_C.ink + '"/>');
      o.push(drText(px + (r[0] ? r[0] * 26 : 24), py + (r[1] ? r[1] * 26 + 6 : -16), 'P', 18, DR_C.ink, 'middle', true));
    }
    if (showAns) {
      var g = '';
      if (q.mode === 'field') {
        var rr = drS(q.b), qx = C + rr[0] * 60, qy = C + rr[1] * 60;
        if (ans === 'in' || ans === 'out') g += drSym(qx, qy, 13, ans, DR_C.ok, 2.8, DR_C.card);
        else { var a = drS(ans); g += drArrow(qx, qy, qx + a[0] * 52, qy + a[1] * 52, DR_C.ok, 3.4, 15, '', true); }
        var fa = (ans === 'in' || ans === 'out') ? [0, 0] : drS(ans);
        g += drText(qx + fa[0] * 52 + (fa[0] ? 0 : -30), qy + fa[1] * 52 + (fa[1] > 0 ? 22 : fa[1] < 0 ? -10 : 34), 'Field', 15, DR_C.ok, 'middle', true);
      } else {
        if (ans === 'in' || ans === 'out') { g += drSym(C, C, 16, ans, DR_C.ok, 3, DR_C.card); g += drText(C, C + 40, 'Force', 15, DR_C.ok, 'middle', true); }
        else {
          var f = drS(ans);
          g += drArrow(C, C, C + f[0] * 74, C + f[1] * 74, DR_C.ok, 4, 16, '', true);
          g += drText(C + f[0] * 74 + (f[0] ? 0 : 26), C + f[1] * 74 + (f[1] > 0 ? 22 : f[1] < 0 ? -10 : 26), 'Force', 15, DR_C.ok, 'middle', true);
        }
      }
      o.push('<g class="dr-ans" data-ans="' + ans + '">' + g + '</g>');
    }
    return o.join('');
  }
  function drLabel(q, showAns) {                       /* the drawing in words (the SVG's accessible name) */
    var s = q.mode === 'field' ? 'A wire with a current ' + DR_WORD[q.a] + '; the point P is ' + (q.b === 'up' ? 'up the page from' : q.b === 'down' ? 'down the page from' : 'to the ' + q.b + ' of') + ' the wire.'
      : (q.kind === 'current' ? 'A wire with a current ' + DR_WORD[q.a] : 'A beam of ' + q.kind + ' moving ' + DR_WORD[q.a]) + ', in a field B pointing ' + DR_WORD[q.b] + '.';
    if (showAns) s += ' Answer: the ' + (q.mode === 'field' ? 'field at P' : 'force') + ' points ' + DR_WORD[drAnswer(q)] + '.';
    return s;
  }
/*END-DR-CORE*/
  function initDr() {
    $$('svg[data-dr]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-dr-on')) return;
      art.setAttribute('data-dr-on', '1');
      var fig = svg.closest('.fig'), bid = fig ? fig.getAttribute('data-block-id') || '' : '';
      if (fig) fig.classList.add('fig--dr');
      drBuild(art, svg, /-WRAPUP\./.test(bid) ? 'mixed' : /-T04\./.test(bid) ? 'force' : 'field');
    });
  }
  function drBuild(art, svg0, mode0) {
    var uid = 'dr' + Math.random().toString(36).slice(2, 7);
    var S = { mode: mode0, q: null, pick: null, checked: false, right: 0, total: 0 };
    var root = document.createElement('div');
    root.className = 'dr';
    root.innerHTML =
      '<div class="dr-seg dr-modes" role="group" aria-label="Practise">' + DR_MODES.map(function (m) {
        return '<button type="button" data-m="' + m[0] + '" aria-pressed="false">' + m[1] + '</button>'; }).join('') + '</div>' +
      '<div class="dr-art"><svg class="dr-live" viewBox="0 0 300 300" role="img" aria-labelledby="' + uid + '-t"><title id="' + uid + '-t"></title><g class="dr-dyn"></g></svg></div>' +
      '<p class="dr-q" id="' + uid + '-q"></p>' +
      '<div class="dr-ans-grid" role="group" aria-labelledby="' + uid + '-q">' +
        ['right', 'left', 'up', 'down', 'in', 'out'].map(function (k) {
          var t = DR_BTN[k], sym = /[⊗⊙]$/.test(t);
          return '<button type="button" data-k="' + k + '" aria-pressed="false">' +
            (sym ? t.slice(0, -2) + ' <span class="dr-sym">' + t.slice(-1) + '</span>' : t) + '</button>'; }).join('') + '</div>' +
      '<div class="dr-acts"><button type="button" class="dr-check" disabled>Check</button><button type="button" class="dr-new">New question</button></div>' +
      '<div class="dr-live-region" aria-live="polite"><p class="dr-fb"></p><p class="dr-score">Correct: 0 of 0</p></div>';
    art.parentNode.insertBefore(root, art);
    svg0.classList.add('dr-static');
    art.setAttribute('hidden', '');                    /* the static first view stays for no-JS only */
    var live = $('.dr-live', root), dyn = $('.dr-dyn', root), title = $('title', live);
    var qp = $('.dr-q', root), fb = $('.dr-fb', root), sc = $('.dr-score', root), chk = $('.dr-check', root), nw = $('.dr-new', root);
    var ansBtns = $$('.dr-ans-grid button', root), modeBtns = $$('.dr-modes button', root);
    function draw() {
      var q = S.q;
      dyn.innerHTML = drSvg(q, S.checked);
      title.textContent = drLabel(q, S.checked);
      qp.textContent = drQuestion(q);
      modeBtns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === S.mode ? 'true' : 'false'); });
      ansBtns.forEach(function (b) {
        var k = b.getAttribute('data-k');
        b.setAttribute('aria-pressed', k === S.pick ? 'true' : 'false');
        b.disabled = S.checked;
        b.classList.toggle('is-right', S.checked && k === drAnswer(q));
        b.classList.toggle('is-wrong', S.checked && k === S.pick && k !== drAnswer(q));
      });
      chk.disabled = S.checked || !S.pick;
      sc.textContent = 'Correct: ' + S.right + ' of ' + S.total;
      root.setAttribute('data-q', drKey(q)); root.setAttribute('data-ans', drAnswer(q));
      root.setAttribute('data-mode', S.mode); root.setAttribute('data-checked', S.checked ? '1' : '0');
    }
    function fresh() {
      S.q = drPick(S.mode, S.q ? drKey(S.q) : null); S.pick = null; S.checked = false;
      fb.textContent = ''; fb.className = 'dr-fb';
      draw();
    }
    modeBtns.forEach(function (b) {
      on(b, 'click', function () { var m = b.getAttribute('data-m'); if (m === S.mode) return; S.mode = m; fresh(); });
    });
    ansBtns.forEach(function (b) {
      on(b, 'click', function () { if (S.checked) return; S.pick = b.getAttribute('data-k'); draw(); });
    });
    on(chk, 'click', function () {
      if (S.checked || !S.pick) return;
      var ok = S.pick === drAnswer(S.q);
      S.checked = true; S.total += 1; if (ok) S.right += 1;
      fb.textContent = (ok ? 'Correct — ' : 'Not quite — ') + drSteps(S.q);
      fb.className = 'dr-fb ' + (ok ? 'is-right' : 'is-wrong');
      draw();
      nw.focus();
    });
    on(nw, 'click', function () { fresh(); ansBtns[0].focus(); });
    fresh();
  }
  /*END-DR*/

  /* ---------------------------------------------------- solid builder (Maths Ch 12, T02-V9; initSb)
     svg[data-sb] is the static first view and the no-JS view (content/C10-MATH-CH12/diagrams/_src/s12b.py v9: .sb-v1 joined
     cone + hemisphere, r 3, h 4; .sb-v2 cube 14 with a hemisphere 7 cut out). initSb replaces it. Topic 2 opens in "joined"
     mode (cone + hemisphere, r 3, cone height 4); Topics 3 and 4 (figure block id …-T03. / …-T04.) in "cut out" mode (cube
     14, hemisphere 7). Two lists choose the pieces (four pairs); a switch (role="switch", Enter / Space) chooses joined or
     cut out (disabled for cone + hemisphere); sliders: r 1…10, heights 1…15, cube edge a 2…20, whole cm, arrow keys ±1.
     Limits: r ≤ a ÷ 2 (cube); cut out: r ≤ h (cylinder + hemisphere), cone height ≤ cylinder height. A slider that would
     break a limit stops at the limit and the live panel says why. Drawing: side view, W = container (240…640 px), H = 0.75W,
     s = 0.015W px per cm, the solid centred (so the tallest, 30 cm, is 0.45W with 0.15W above and below). A change of pieces
     or mode shows the pieces apart for 1 s, then joined / cut with the hidden faces flashing twice, then dashed; with
     reduced motion the final state at once. Exact arithmetic: a value is A + Bπ + Cπ√k with fractions A, B, C; π = 22/7
     unless "in terms of π"; 2 decimals half-up. Nothing is stored. */
  /*SB-TEX*/var SB_TEX = {"l":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>l</mi><mo>=</mo><msqrt><mrow><msup><mi>r</mi><mn>2</mn></msup><mo>+</mo><msup><mi>h</mi><mn>2</mn></msup></mrow></msqrt></mrow><annotation encoding=\"application/x-tex\">l = \\sqrt{r^2 + h^2}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6944em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.01968em;\">l</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:1.04em;vertical-align:-0.1266em;\"></span><span class=\"mord sqrt\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.9134em;\"><span class=\"svg-align\" style=\"top:-3em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\" style=\"padding-left:0.833em;\"><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.7401em;\"><span style=\"top:-2.989em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">h</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.7401em;\"><span style=\"top:-2.989em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span></span></span><span style=\"top:-2.8734em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"hide-tail\" style=\"min-width:0.853em;height:1.08em;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400em\" height=\"1.08em\" viewBox=\"0 0 400000 1080\" preserveAspectRatio=\"xMinYMin slice\"><path d=\"M95,702\nc-2.7,0,-7.17,-2.7,-13.5,-8c-5.8,-5.3,-9.5,-10,-9.5,-14\nc0,-2,0.3,-3.3,1,-4c1.3,-2.7,23.83,-20.7,67.5,-54\nc44.2,-33.3,65.8,-50.3,66.5,-51c1.3,-1.3,3,-2,5,-2c4.7,0,8.7,3.3,12,10\ns173,378,173,378c0.7,0,35.3,-71,104,-213c68.7,-142,137.5,-285,206.5,-429\nc69,-144,104.5,-217.7,106.5,-221\nl0 -0\nc5.3,-9.3,12,-14,20,-14\nH400000v40H845.2724\ns-225.272,467,-225.272,467s-235,486,-235,486c-2.7,4.7,-9,7,-19,7\nc-6,0,-10,-1,-12,-3s-194,-422,-194,-422s-65,47,-65,47z\nM834 80h400000v40h-400000z\"/></svg></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.1266em;\"><span></span></span></span></span></span></span></span></span>","l2":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>l</mi><mo>=</mo><msqrt><mrow><msup><mi>r</mi><mn>2</mn></msup><mo>+</mo><msubsup><mi>h</mi><mn>2</mn><mn>2</mn></msubsup></mrow></msqrt></mrow><annotation encoding=\"application/x-tex\">l = \\sqrt{r^2 + h_2^2}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6944em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.01968em;\">l</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:1.24em;vertical-align:-0.2902em;\"></span><span class=\"mord sqrt\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.9498em;\"><span class=\"svg-align\" style=\"top:-3.2em;\"><span class=\"pstrut\" style=\"height:3.2em;\"></span><span class=\"mord\" style=\"padding-left:1em;\"><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.7401em;\"><span style=\"top:-2.989em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">h</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.7959em;\"><span style=\"top:-2.4337em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span><span style=\"top:-3.0448em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.2663em;\"><span></span></span></span></span></span></span></span></span><span style=\"top:-2.9098em;\"><span class=\"pstrut\" style=\"height:3.2em;\"></span><span class=\"hide-tail\" style=\"min-width:1.02em;height:1.28em;\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400em\" height=\"1.28em\" viewBox=\"0 0 400000 1296\" preserveAspectRatio=\"xMinYMin slice\"><path d=\"M263,681c0.7,0,18,39.7,52,119\nc34,79.3,68.167,158.7,102.5,238c34.3,79.3,51.8,119.3,52.5,120\nc340,-704.7,510.7,-1060.3,512,-1067\nl0 -0\nc4.7,-7.3,11,-11,19,-11\nH40000v40H1012.3\ns-271.3,567,-271.3,567c-38.7,80.7,-84,175,-136,283c-52,108,-89.167,185.3,-111.5,232\nc-22.3,46.7,-33.8,70.3,-34.5,71c-4.7,4.7,-12.3,7,-23,7s-12,-1,-12,-1\ns-109,-253,-109,-253c-72.7,-168,-109.3,-252,-110,-252c-10.7,8,-22,16.7,-34,26\nc-22,17.3,-33.3,26,-34,26s-26,-26,-26,-26s76,-59,76,-59s76,-60,76,-60z\nM1001 80h400000v40h-400000z\"/></svg></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.2902em;\"><span></span></span></span></span></span></span></span></span>","sa-cone-hemi-joined":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>π</mi><mi>r</mi><mi>l</mi><mo>+</mo><mn>2</mn><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup></mrow><annotation encoding=\"application/x-tex\">\\pi r l + 2\\pi r^2</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.7778em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"mord mathnormal\" style=\"margin-right:0.01968em;\">l</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8141em;\"></span><span class=\"mord\">2</span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span></span></span></span>","v-cone-hemi-joined":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>3</mn></mfrac></mstyle><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup><mi>h</mi><mo>+</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>2</mn><mn>3</mn></mfrac></mstyle><mi>π</mi><msup><mi>r</mi><mn>3</mn></msup></mrow><annotation encoding=\"application/x-tex\">\\dfrac{1}{3}\\pi r^2 h + \\dfrac{2}{3}\\pi r^3</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:2.0074em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">3</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mord mathnormal\">h</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0074em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">3</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">3</span></span></span></span></span></span></span></span></span></span></span>","sa-cyl-hemi-joined":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mn>2</mn><mi>π</mi><mi>r</mi><mi>h</mi><mo>+</mo><mn>2</mn><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup><mo>+</mo><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup></mrow><annotation encoding=\"application/x-tex\">2\\pi r h + 2\\pi r^2 + \\pi r^2</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.7778em;vertical-align:-0.0833em;\"></span><span class=\"mord\">2</span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"mord mathnormal\">h</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8974em;vertical-align:-0.0833em;\"></span><span class=\"mord\">2</span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8141em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span></span></span></span>","v-cyl-hemi-joined":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup><mi>h</mi><mo>+</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>2</mn><mn>3</mn></mfrac></mstyle><mi>π</mi><msup><mi>r</mi><mn>3</mn></msup></mrow><annotation encoding=\"application/x-tex\">\\pi r^2 h + \\dfrac{2}{3}\\pi r^3</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.8974em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mord mathnormal\">h</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0074em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">3</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">3</span></span></span></span></span></span></span></span></span></span></span>","sa-cyl-hemi-cut":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mn>2</mn><mi>π</mi><mi>r</mi><mi>h</mi><mo>+</mo><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup><mo>+</mo><mn>2</mn><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup></mrow><annotation encoding=\"application/x-tex\">2\\pi r h + \\pi r^2 + 2\\pi r^2</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.7778em;vertical-align:-0.0833em;\"></span><span class=\"mord\">2</span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"mord mathnormal\">h</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8974em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8141em;\"></span><span class=\"mord\">2</span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span></span></span></span>","v-cyl-hemi-cut":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup><mi>h</mi><mo>−</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>2</mn><mn>3</mn></mfrac></mstyle><mi>π</mi><msup><mi>r</mi><mn>3</mn></msup></mrow><annotation encoding=\"application/x-tex\">\\pi r^2 h - \\dfrac{2}{3}\\pi r^3</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.8974em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mord mathnormal\">h</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0074em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">3</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">3</span></span></span></span></span></span></span></span></span></span></span>","sa-cone-cyl-joined":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>π</mi><mi>r</mi><mi>l</mi><mo>+</mo><mn>2</mn><mi>π</mi><mi>r</mi><msub><mi>h</mi><mn>1</mn></msub><mo>+</mo><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup></mrow><annotation encoding=\"application/x-tex\">\\pi r l + 2\\pi r h_1 + \\pi r^2</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.7778em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"mord mathnormal\" style=\"margin-right:0.01968em;\">l</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8444em;vertical-align:-0.15em;\"></span><span class=\"mord\">2</span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"mord\"><span class=\"mord mathnormal\">h</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8141em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span></span></span></span>","v-cone-cyl-joined":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup><msub><mi>h</mi><mn>1</mn></msub><mo>+</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>3</mn></mfrac></mstyle><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup><msub><mi>h</mi><mn>2</mn></msub></mrow><annotation encoding=\"application/x-tex\">\\pi r^2 h_1 + \\dfrac{1}{3}\\pi r^2 h_2</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.9641em;vertical-align:-0.15em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mord\"><span class=\"mord mathnormal\">h</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0074em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">3</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mord\"><span class=\"mord mathnormal\">h</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span></span>","sa-cone-cyl-cut":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mn>2</mn><mi>π</mi><mi>r</mi><msub><mi>h</mi><mn>1</mn></msub><mo>+</mo><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup><mo>+</mo><mi>π</mi><mi>r</mi><mi>l</mi></mrow><annotation encoding=\"application/x-tex\">2\\pi r h_1 + \\pi r^2 + \\pi r l</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.8444em;vertical-align:-0.15em;\"></span><span class=\"mord\">2</span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"mord\"><span class=\"mord mathnormal\">h</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8974em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6944em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"mord mathnormal\" style=\"margin-right:0.01968em;\">l</span></span></span></span>","v-cone-cyl-cut":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup><msub><mi>h</mi><mn>1</mn></msub><mo>−</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>1</mn><mn>3</mn></mfrac></mstyle><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup><msub><mi>h</mi><mn>2</mn></msub></mrow><annotation encoding=\"application/x-tex\">\\pi r^2 h_1 - \\dfrac{1}{3}\\pi r^2 h_2</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.9641em;vertical-align:-0.15em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mord\"><span class=\"mord mathnormal\">h</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0074em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">3</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mord\"><span class=\"mord mathnormal\">h</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span></span>","sa-cube-hemi-joined":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mn>6</mn><msup><mi>a</mi><mn>2</mn></msup><mo>−</mo><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup><mo>+</mo><mn>2</mn><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup></mrow><annotation encoding=\"application/x-tex\">6a^2 - \\pi r^2 + 2\\pi r^2</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.8974em;vertical-align:-0.0833em;\"></span><span class=\"mord\">6</span><span class=\"mord\"><span class=\"mord mathnormal\">a</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8974em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8141em;\"></span><span class=\"mord\">2</span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span></span></span></span>","v-cube-hemi-joined":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><msup><mi>a</mi><mn>3</mn></msup><mo>+</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>2</mn><mn>3</mn></mfrac></mstyle><mi>π</mi><msup><mi>r</mi><mn>3</mn></msup></mrow><annotation encoding=\"application/x-tex\">a^3 + \\dfrac{2}{3}\\pi r^3</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.8974em;vertical-align:-0.0833em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">a</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">3</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0074em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">3</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">3</span></span></span></span></span></span></span></span></span></span></span>","sa-cube-hemi-cut":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mn>6</mn><msup><mi>a</mi><mn>2</mn></msup><mo>−</mo><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup><mo>+</mo><mn>2</mn><mi>π</mi><msup><mi>r</mi><mn>2</mn></msup></mrow><annotation encoding=\"application/x-tex\">6a^2 - \\pi r^2 + 2\\pi r^2</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.8974em;vertical-align:-0.0833em;\"></span><span class=\"mord\">6</span><span class=\"mord\"><span class=\"mord mathnormal\">a</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8974em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.8141em;\"></span><span class=\"mord\">2</span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span></span></span></span></span></span></span></span>","v-cube-hemi-cut":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><msup><mi>a</mi><mn>3</mn></msup><mo>−</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mn>2</mn><mn>3</mn></mfrac></mstyle><mi>π</mi><msup><mi>r</mi><mn>3</mn></msup></mrow><annotation encoding=\"application/x-tex\">a^3 - \\dfrac{2}{3}\\pi r^3</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.8974em;vertical-align:-0.0833em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\">a</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">3</span></span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.0074em;vertical-align:-0.686em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3214em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">3</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.686em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mord mathnormal\" style=\"margin-right:0.03588em;\">π</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.02778em;\">r</span><span class=\"msupsub\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8141em;\"><span style=\"top:-3.063em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">3</span></span></span></span></span></span></span></span></span></span></span>"};/*END-SB-TEX*/
  var SB_PAIRS = { 'cyl-hemi': ['cyl', 'hemi'], 'cone-hemi': ['cone', 'hemi'], 'cone-cyl': ['cone', 'cyl'], 'cube-hemi': ['cube', 'hemi'] };
  var SB_FIRST = [['cyl', 'Cylinder'], ['cone', 'Cone'], ['cube', 'Cube']];
  var SB_SECOND = { cyl: [['hemi', 'Hemisphere']], cone: [['hemi', 'Hemisphere'], ['cyl', 'Cylinder']], cube: [['hemi', 'Hemisphere']] };
  var SB_SL = { r: [1, 10, 'Radius', '<i>r</i>', 'Radius r in cm'], h1: [1, 15, 'Height of the cylinder', '<i>h</i>', 'Height of the cylinder in cm'],
    h2: [1, 15, 'Height of the cone', '<i>h</i>', 'Height of the cone in cm'], a: [2, 20, 'Edge of the cube', '<i>a</i>', 'Edge of the cube in cm'] };
  var SB_USE = { 'cyl-hemi': ['r', 'h1'], 'cone-hemi': ['r', 'h2'], 'cone-cyl': ['r', 'h1', 'h2'], 'cube-hemi': ['a', 'r'] };
  var SB_WORDS = {
    'cone-hemi joined': ['the cone’s base and the hemisphere’s flat face', 'CSA of cone + CSA of hemisphere', 'volume of cone + volume of hemisphere'],
    'cyl-hemi joined': ['the top of the cylinder and the hemisphere’s flat face', 'CSA of cylinder + CSA of hemisphere + base of cylinder', 'volume of cylinder + volume of hemisphere'],
    'cyl-hemi cut': ['the opening is gone (the top circle of the cylinder)', 'CSA of cylinder + base + inside of the hollow (CSA of hemisphere)', 'volume of cylinder − volume of hemisphere'],
    'cone-cyl joined': ['the top of the cylinder and the cone’s base', 'CSA of cone + CSA of cylinder + base of cylinder', 'volume of cylinder + volume of cone'],
    'cone-cyl cut': ['the opening is gone (the top circle of the cylinder)', 'CSA of cylinder + base + inside of the hollow (CSA of cone)', 'volume of cylinder − volume of cone'],
    'cube-hemi joined': ['a circle of the cube’s top face and the hemisphere’s flat face', 'TSA of cube − circle under the hemisphere + CSA of hemisphere', 'volume of cube + volume of hemisphere'],
    'cube-hemi cut': ['the opening is gone (a circle of the cube’s top face)', 'TSA of cube − opening + CSA of hemisphere (inside)', 'volume of cube − volume of hemisphere']
  };
  function sbQ(n, d) { return seQ(n, d || 1); }
  function sbSurd(N) {                      /* √N = k√n, n square-free */
    var k = 1, n = N;
    for (var f = 2; f * f <= n; f++) while (n % (f * f) === 0) { n /= f * f; k *= f; }
    return [k, n];
  }
  /* a value: { a: rational, b: rational (× π), c: rational (× π√k), k } */
  function sbV(a, b, c, k) { return { a: a || [0, 1], b: b || [0, 1], c: c || [0, 1], k: k || 1 }; }
  function sbAdd(p, q) { return sbV(seAdd(p.a, q.a), seAdd(p.b, q.b), seAdd(p.c, q.c), p.c[0] ? p.k : q.k); }
  function sbModel(S) {
    var r = S.r, h1 = S.h1, h2 = S.h2, a = S.a, key = S.pair + ' ' + S.mode, M = { key: key };
    var cone = S.pair === 'cone-hemi' || S.pair === 'cone-cyl';
    if (cone) {
      var sl = sbSurd(r * r + h2 * h2);
      M.l = sl; M.lsq = r * r + h2 * h2;
      /* πrl = π r k √n */
      M.prl = sl[1] === 1 ? sbV(null, sbQ(r * sl[0])) : sbV(null, null, sbQ(r * sl[0]), sl[1]);
    }
    var pr2 = sbV(null, sbQ(r * r)), hemV = sbV(null, sbQ(2 * r * r * r, 3));
    switch (key) {
      case 'cone-hemi joined': M.sa = sbAdd(M.prl, sbV(null, sbQ(2 * r * r))); M.vol = sbV(null, sbQ(r * r * h2 + 2 * r * r * r, 3)); break;
      case 'cyl-hemi joined': M.sa = sbV(null, sbQ(2 * r * h1 + 3 * r * r)); M.vol = sbV(null, sbQ(3 * r * r * h1 + 2 * r * r * r, 3)); break;
      case 'cyl-hemi cut': M.sa = sbV(null, sbQ(2 * r * h1 + 3 * r * r)); M.vol = sbV(null, sbQ(3 * r * r * h1 - 2 * r * r * r, 3)); break;
      case 'cone-cyl joined': M.sa = sbAdd(M.prl, sbV(null, sbQ(2 * r * h1 + r * r))); M.vol = sbV(null, sbQ(3 * r * r * h1 + r * r * h2, 3)); break;
      case 'cone-cyl cut': M.sa = sbAdd(M.prl, sbV(null, sbQ(2 * r * h1 + r * r))); M.vol = sbV(null, sbQ(3 * r * r * h1 - r * r * h2, 3)); break;
      case 'cube-hemi joined': M.sa = sbV(sbQ(6 * a * a), sbQ(r * r)); M.vol = sbV(sbQ(a * a * a), sbQ(2 * r * r * r, 3)); break;
      case 'cube-hemi cut': M.sa = sbV(sbQ(6 * a * a), sbQ(r * r)); M.vol = sbV(sbQ(a * a * a), sbQ(-2 * r * r * r, 3)); break;
    }
    void pr2; void hemV;
    return M;
  }
  function sbFrac(q, sym, html) { return seFr(q[0], q[1], sym, html); }
  function sbExact(v, html) {                /* "1176 + 49π", "33π", "2744 − 686π/3", "15π + 3√5π" */
    var out = '', rt = html ? '<span class="gx-rt">√<span>' + v.k + '</span></span>' : '√' + v.k;
    [[v.a, ''], [v.b, 'π'], [v.c, rt + 'π']].forEach(function (p) {
      var q = p[0]; if (q[0] === 0) return;
      var t = sbFrac([Math.abs(q[0]), q[1]], p[1], html);
      out += out ? (q[0] < 0 ? ' − ' : ' + ') + t : (q[0] < 0 ? '−' : '') + t;
    });
    return out || '0';
  }
  function sbDec(v) {                        /* π = 22/7: [text, exact?] */
    var R = seAdd(v.a, seQ(22 * v.b[0], 7 * v.b[1]));
    if (v.c[0] === 0) {
      var n = R[0], d = R[1], neg = n < 0, h = Math.floor((200 * Math.abs(n) + d) / (2 * d));
      var txt = (neg ? '−' : '') + Math.floor(h / 100) + '.' + (h % 100 < 10 ? '0' : '') + (h % 100);
      if (d === 1) return [String(n), true];
      return [txt, (n * 100) % d === 0];
    }
    var x = R[0] / R[1] + 22 / 7 * v.c[0] / v.c[1] * Math.sqrt(v.k), hh = Math.floor(Math.abs(x) * 100 + 0.5 + 1e-9);
    return [(x < 0 ? '−' : '') + Math.floor(hh / 100) + '.' + (hh % 100 < 10 ? '0' : '') + (hh % 100), false];
  }
  function sbShow(v, piMode, html) {
    var ex = sbExact(v, html);
    if (piMode) return ex;
    var dd = sbDec(v);
    if (v.b[0] === 0 && v.c[0] === 0) return dd[0];
    return ex + (dd[1] ? ' = ' : ' ≈ ') + dd[0];
  }
  function initSb() {
    $$('svg[data-sb="builder"]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-sb-on')) return;
      art.setAttribute('data-sb-on', '1');
      var fig = svg.closest('.fig'), id = fig ? fig.getAttribute('data-block-id') || '' : '', cut = /-T0[34]\./.test(id);
      if (fig) fig.classList.add('fig--sb');
      sbBuild(art, cut ? { pair: 'cube-hemi', mode: 'cut', r: 7, h1: 10, h2: 4, a: 14 } : { pair: 'cone-hemi', mode: 'joined', r: 3, h1: 10, h2: 4, a: 14 });
    });
  }
  function sbBuild(art, S0) {
    var uid = 'sb' + Math.random().toString(36).slice(2, 7);
    var S = { pair: S0.pair, mode: S0.mode, r: S0.r, h1: S0.h1, h2: S0.h2, a: S0.a, pi: false, why: '', phase: 'done', timers: [] };
    var INK = 'var(--ink, #1F2328)', SOFT = 'var(--ink-soft, #57554D)', C1 = 'var(--dg-m-opp, #C2410C)', C1BG = 'var(--dg-m-opp-bg, #FCE7DA)';
    var C2 = 'var(--dg-m-adj, #1D5FBF)', NEU = 'var(--dg-m-hyp-bg, #EFEDE6)', ACC = 'var(--acc, #5B3FC4)', CARD = 'var(--card, #FFF)', PAPER = 'var(--paper-deep, #F6F1E3)';
    var root = document.createElement('div');
    root.className = 'se sb';
    function opt(list, sel) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }
    var sl = ['r', 'h1', 'h2', 'a'].map(function (k) {
      var d = SB_SL[k];
      return '<div class="sb-ctl sb-s" data-k="' + k + '"><label class="se-lbl" for="' + uid + '-' + k + '">' + d[2] + ' <span class="mx">' + d[3] + '</span>: <b class="sb-sv"></b></label>' +
        '<input class="se-range sb-range" type="range" id="' + uid + '-' + k + '" data-k="' + k + '" min="' + d[0] + '" max="' + d[1] + '" step="1" value="' + S[k] + '" aria-label="' + d[4] + '"></div>';
    }).join('');
    root.innerHTML =
      '<div class="se-art sb-art"><svg class="sb-svg" role="img" aria-labelledby="' + uid + '-t"><title id="' + uid + '-t"></title><defs>' +
      '<pattern id="' + uid + '-h1" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><path d="M0,0 L0,7" stroke="' + C1 + '" stroke-width="1.6"/></pattern>' +
      '<pattern id="' + uid + '-h2" patternUnits="userSpaceOnUse" width="4.5" height="4.5" patternTransform="rotate(-45)"><path d="M0,0 L0,4.5" stroke="' + SOFT + '" stroke-width="1.2"/></pattern>' +
      '</defs><g class="sb-g"></g></svg></div>' +
      '<div class="sb-ctls">' +
      '<div class="sb-ctl"><label class="se-lbl" for="' + uid + '-p1">First piece</label><select class="sb-sel sb-p1" id="' + uid + '-p1">' + opt(SB_FIRST, SB_PAIRS[S.pair][0]) + '</select></div>' +
      '<div class="sb-ctl"><label class="se-lbl" for="' + uid + '-p2">Second piece</label><select class="sb-sel sb-p2" id="' + uid + '-p2"></select></div>' +
      '<div class="sb-ctl sb-mctl"><span class="se-lbl" id="' + uid + '-ml">Joined or cut out</span>' +
      '<button type="button" class="sb-mode" role="switch" aria-checked="false" aria-label="Cut out (off: joined)"><span class="sb-mj">Joined</span><span class="sb-mc">Cut out</span></button>' +
      '<p class="se-note sb-mnote"></p></div>' + sl +
      '<p class="se-hint sb-hint">Keys: Tab moves between the lists, the switch and the sliders; ← → or ↑ ↓ change a slider by 1 cm; Enter or Space works the switch.</p>' +
      '<div class="sb-btns"><button type="button" class="sb-again">Show it again</button><button type="button" class="se-pi sb-pi" aria-pressed="false">in terms of <span class="mx"><i>π</i></span></button></div></div>' +
      '<div class="se-read sb-read" aria-live="polite"></div>';
    art.innerHTML = '';
    art.appendChild(root);
    var svgEl = $('.sb-svg', root), g = $('.sb-g', root), read = $('.sb-read', root), p1 = $('.sb-p1', root), p2 = $('.sb-p2', root), sw = $('.sb-mode', root);
    function rm() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function geo() {
      var W = Math.min(640, Math.max(240, Math.round($('.sb-art', root).clientWidth || 358)));
      return { W: W, H: 0.75 * W, s: 0.015 * W };
    }
    function n2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
    function P_(d, o) {
      o = o || {};
      return '<path d="' + d + '" fill="' + (o.fill || 'none') + '" stroke="' + (o.st || 'none') + '" stroke-width="' + (o.sw || 0) + '"' +
        (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + (o.cls ? ' class="' + o.cls + '"' : '') + ' stroke-linecap="round" stroke-linejoin="round"/>';
    }
    /* pieces in cm (y up): each {d: [commands], kind: 'solid'|'hollow'|'face'|'hid'} -> path at offset dy */
    function shapes(final) {
      var r = S.r, h1 = S.h1, h2 = S.h2, a = S.a, k = S.pair + ' ' + S.mode, out = [], gap = 3;
      function poly(pts, close) { return { pts: pts, close: close !== false }; }
      /* path items: ['M', x, y], ['L', x, y], ['A', r, sweep, x, y] (circle arc in cm), 'Z' */
      function dome(y0, up) { return [['M', r, y0], ['A', r, up ? 0 : 1, -r, y0], 'Z']; }
      if (S.mode === 'joined') {
        var lower, upper, yj, lo, hi;
        if (S.pair === 'cone-hemi') { yj = 0; lower = [['M', -r, 0], ['A', r, 1, r, 0], 'Z']; upper = [['M', -r, 0], ['L', 0, h2], ['L', r, 0], 'Z']; lo = -r; hi = h2; }
        else if (S.pair === 'cyl-hemi') { yj = h1; lower = [['M', -r, 0], ['L', r, 0], ['L', r, h1], ['L', -r, h1], 'Z']; upper = dome(h1, true); lo = 0; hi = h1 + r; }
        else if (S.pair === 'cone-cyl') { yj = h1; lower = [['M', -r, 0], ['L', r, 0], ['L', r, h1], ['L', -r, h1], 'Z']; upper = [['M', -r, h1], ['L', 0, h1 + h2], ['L', r, h1], 'Z']; lo = 0; hi = h1 + h2; }
        else { yj = a; lower = [['M', -a / 2, 0], ['L', a / 2, 0], ['L', a / 2, a], ['L', -a / 2, a], 'Z']; upper = dome(a, true); lo = 0; hi = a + r; }
        if (!final) {
          out.push({ d: lower, kind: 'solid', dy: -gap / 2 }, { d: upper, kind: 'solid', dy: gap / 2 });
          out.push({ d: [['M', -r, yj], ['L', r, yj]], kind: 'face', dy: -gap / 2 }, { d: [['M', -r, yj], ['L', r, yj]], kind: 'face', dy: gap / 2 });
          return { items: out, lo: lo - gap / 2, hi: hi + gap / 2, flo: lo, fhi: hi };
        }
        var whole;
        if (S.pair === 'cone-hemi') whole = [['M', -r, 0], ['L', 0, h2], ['L', r, 0], ['A', r, 1, -r, 0], 'Z'];
        else if (S.pair === 'cyl-hemi') whole = [['M', -r, 0], ['L', r, 0], ['L', r, h1], ['A', r, 0, -r, h1], 'Z'];
        else if (S.pair === 'cone-cyl') whole = [['M', -r, 0], ['L', r, 0], ['L', r, h1], ['L', 0, h1 + h2], ['L', -r, h1], 'Z'];
        else whole = [['M', -a / 2, 0], ['L', a / 2, 0], ['L', a / 2, a], ['L', r, a], ['A', r, 0, -r, a], ['L', -a / 2, a], 'Z'];
        out.push({ d: whole, kind: 'solid', dy: 0 }, { d: [['M', -r, yj], ['L', r, yj]], kind: 'hid', dy: 0 });
        return { items: out, lo: lo, hi: hi, flo: lo, fhi: hi };
      }
      /* cut out: block + cutter (depth below the block's top) */
      var top = S.pair === 'cube-hemi' ? a : h1, hw = S.pair === 'cube-hemi' ? a / 2 : r, depth = S.pair === 'cone-cyl' ? h2 : r;
      var block = [['M', -hw, 0], ['L', hw, 0], ['L', hw, top], ['L', -hw, top], 'Z'];
      var cutter = S.pair === 'cone-cyl' ? [['M', -r, top], ['L', 0, top - h2], ['L', r, top], 'Z'] : [['M', -r, top], ['A', r, 0, r, top], 'Z'];
      if (!final) {
        var up = depth + gap;
        out.push({ d: block, kind: 'solid', dy: 0 }, { d: cutter, kind: 'cutter', dy: up });
        return { items: out, lo: 0, hi: top + depth + gap, flo: 0, fhi: top };
      }
      var outer = S.pair === 'cone-cyl' ? [['M', -hw, 0], ['L', hw, 0], ['L', hw, top], ['L', r, top], ['L', 0, top - h2], ['L', -r, top], ['L', -hw, top], 'Z']
        : [['M', -hw, 0], ['L', hw, 0], ['L', hw, top], ['L', r, top], ['A', r, 0, -r, top], ['L', -hw, top], 'Z'];
      out.push({ d: outer, kind: 'solid', dy: 0 }, { d: cutter, kind: 'hollow', dy: 0 }, { d: [['M', -r, top], ['L', r, top]], kind: 'hid', dy: 0 });
      void poly;
      return { items: out, lo: 0, hi: top, flo: 0, fhi: top };
    }
    function pathD(cmds, X, Y, s) {
      return cmds.map(function (c) {
        if (c === 'Z') return 'Z';
        if (c[0] === 'A') { var rr = (c[1] * s).toFixed(2); return 'A' + rr + ',' + rr + ' 0 0 ' + c[2] + ' ' + X(c[3]).toFixed(2) + ',' + Y(c[4]).toFixed(2); }
        return c[0] + X(c[1]).toFixed(2) + ',' + Y(c[2]).toFixed(2);
      }).join(' ');
    }
    function draw() {
      var G = geo(), final = S.phase !== 'apart', sh = shapes(final), s = G.s;
      var mid = (sh.lo + sh.hi) / 2, oy = G.H / 2 + s * mid, ox = G.W / 2;
      svgEl.setAttribute('viewBox', '0 0 ' + G.W + ' ' + G.H.toFixed(2)); svgEl.setAttribute('width', G.W); svgEl.setAttribute('height', G.H.toFixed(2));
      var out = '<rect x="0.5" y="0.5" width="' + (G.W - 1) + '" height="' + (G.H - 1).toFixed(2) + '" rx="10" fill="' + PAPER + '" stroke="var(--grid-border, #D9E3EE)" stroke-width="1"/>';
      sh.items.forEach(function (it) {
        var X = function (x) { return ox + s * x; }, Y = function (y) { return oy - s * (y + it.dy); }, d = pathD(it.d, X, Y, s);
        if (it.kind === 'solid') out += P_(d, { fill: C1BG, cls: 'sb-solid' }) + P_(d, { fill: 'url(#' + uid + '-h1)' }) + P_(d, { st: INK, sw: 2 });
        else if (it.kind === 'cutter') out += P_(d, { fill: NEU, cls: 'sb-cutter' }) + P_(d, { st: INK, sw: 1.8, dash: '6 4' });
        else if (it.kind === 'hollow') out += P_(d, { fill: NEU, cls: 'sb-hollow' }) + P_(d, { fill: 'url(#' + uid + '-h2)' }) + P_(d, { st: INK, sw: 1.6 });
        else if (it.kind === 'face') out += P_(d, { st: C2, sw: 5, cls: 'sb-face' });
        else if (it.kind === 'hid') out += S.phase === 'flash' ? P_(d, { st: ACC, sw: 5, cls: 'sb-hid sb-flash' }) : P_(d, { st: ACC, sw: 2.4, dash: '5 4', cls: 'sb-hid' });
      });
      /* the sizes, top left */
      var lab = SB_USE[S.pair].map(function (k) { return { r: 'r = ', h1: (S.pair === 'cone-cyl' ? 'cylinder h = ' : 'h = '), h2: (S.pair === 'cone-cyl' ? 'cone h = ' : 'h = '), a: 'a = ' }[k] + S[k] + ' cm'; });
      lab.forEach(function (t, i) {
        out += '<text x="12" y="' + (22 + 19 * i) + '" font-family="Lexend, sans-serif" font-size="14" fill="' + INK + '" class="sb-t">' + t + '</text>';
      });
      out += '<text x="' + (G.W - 12) + '" y="22" text-anchor="end" font-family="Lexend, sans-serif" font-size="14" fill="' + SOFT + '" class="sb-t">' +
        (S.phase === 'apart' ? 'apart' : S.mode === 'joined' ? 'joined' : 'cut out') + '</text>';
      g.innerHTML = out;
      svgEl.setAttribute('data-w', String(G.W)); svgEl.setAttribute('data-s', String(s));
      svgEl.setAttribute('data-top', (oy - s * sh.fhi).toFixed(3)); svgEl.setAttribute('data-bot', (oy - s * sh.flo).toFixed(3));
      svgEl.setAttribute('data-phase', S.phase);
      root.setAttribute('data-phase', S.phase);
    }
    function fillSecond() {
      var f = p1.value, list = SB_SECOND[f], cur = p2.value;
      p2.innerHTML = opt(list, list.some(function (o) { return o[0] === cur; }) ? cur : list[0][0]);
    }
    function lim(k) {                        /* [min, max, why-if-max, why-if-min] for slider k now */
      var d = SB_SL[k], mn = d[0], mx = d[1], wmx = '', wmn = '';
      if (S.pair === 'cube-hemi') {
        if (k === 'r') { mx = Math.min(mx, Math.floor(S.a / 2)); wmx = '<i>r</i> stops at ' + mx + ' cm: the hemisphere’s circle must fit on a face of the cube (<i>r</i> ≤ <i>a</i> ÷ 2).'; }
        if (k === 'a') { mn = Math.max(mn, 2 * S.r); wmn = '<i>a</i> stops at ' + mn + ' cm: a face of the cube must hold the hemisphere’s circle (<i>r</i> ≤ <i>a</i> ÷ 2).'; }
      }
      if (S.mode === 'cut' && S.pair === 'cyl-hemi') {
        if (k === 'r') { mx = Math.min(mx, S.h1); wmx = '<i>r</i> stops at ' + mx + ' cm: the hollow must fit inside the cylinder (<i>r</i> ≤ <i>h</i>).'; }
        if (k === 'h1') { mn = Math.max(mn, S.r); wmn = '<i>h</i> stops at ' + mn + ' cm: the hollow must fit inside the cylinder (<i>r</i> ≤ <i>h</i>).'; }
      }
      if (S.mode === 'cut' && S.pair === 'cone-cyl') {
        if (k === 'h2') { mx = Math.min(mx, S.h1); wmx = 'The cone’s height stops at ' + mx + ' cm: the cone can be no taller than the cylinder.'; }
        if (k === 'h1') { mn = Math.max(mn, S.h2); wmn = 'The cylinder’s height stops at ' + mn + ' cm: the cone can be no taller than the cylinder.'; }
      }
      return [mn, mx, wmx, wmn];
    }
    function fix() {                         /* after a change of pieces or mode: bring every value inside its limits */
      var msg = [];
      ['h2', 'r', 'h1', 'a'].filter(function (k) { return SB_USE[S.pair].indexOf(k) >= 0; }).forEach(function (k) {   /* shrink the hollowed piece first */
        var L = lim(k);
        if (S[k] > L[1]) { S[k] = L[1]; msg.push(L[2].replace('stops at', 'is set to')); }
        if (S[k] < L[0]) { S[k] = L[0]; msg.push(L[3].replace('stops at', 'is set to')); }
      });
      return msg.join(' ');
    }
    function syncCtl() {
      var cone2 = S.pair === 'cone-hemi';
      sw.setAttribute('aria-checked', S.mode === 'cut' ? 'true' : 'false');
      sw.disabled = cone2;
      $('.sb-mnote', root).textContent = cone2 ? 'A cone and a hemisphere can only be joined.' : S.mode === 'cut' ? 'The second piece is hollowed out of the first.' : 'The second piece sits on the first.';
      $$('.sb-s', root).forEach(function (el) {
        var k = el.getAttribute('data-k'), use = SB_USE[S.pair].indexOf(k) >= 0, inp = $('input', el);
        el.hidden = !use;
        inp.value = String(S[k]);
        inp.setAttribute('aria-valuetext', S[k] + ' cm');
        $('.sb-sv', el).textContent = S[k] + ' cm';
      });
      $('.sb-pi', root).setAttribute('aria-pressed', String(S.pi));
      var M = sbModel(S);
      var A = { pair: S.pair, mode: S.mode, r: S.r, h1: S.h1, h2: S.h2, a: S.a, pi: S.pi ? '1' : '0', sa: sbShow(M.sa, S.pi, false), vol: sbShow(M.vol, S.pi, false),
        hidden: SB_WORDS[M.key][0], l: M.l ? (M.l[1] === 1 ? String(M.l[0]) : (M.l[0] === 1 ? '' : M.l[0]) + '√' + M.l[1]) : '' };
      Object.keys(A).forEach(function (k) { root.setAttribute('data-' + k, String(A[k])); });
      $('title', svgEl).textContent = 'Side view: ' + p1.options[p1.selectedIndex].text.toLowerCase() + ' and ' + p2.options[p2.selectedIndex].text.toLowerCase() + ', ' +
        (S.mode === 'joined' ? 'joined' : 'cut out') + '. Hidden faces: ' + A.hidden + '.';
    }
    function L_(k, h, cls) { return '<p class="se-l' + (cls ? ' ' + cls : '') + '"><span class="se-k">' + k + '</span> ' + h + '</p>'; }
    function mx(h) { return '<span class="mx">' + h + '</span>'; }
    function panel() {
      var M = sbModel(S), w = SB_WORDS[M.key], h = '', tk = S.pair + '-' + S.mode, un2 = ' cm²', un3 = ' cm³';
      h += L_('hidden faces:', w[0], 'sb-hidl');
      if (M.l) {
        var lt = M.l[1] === 1 ? String(M.l[0]) : (M.l[0] === 1 ? '' : M.l[0]) + '<span class="gx-rt">√<span>' + M.l[1] + '</span></span>';
        var lv = M.l[1] === 1 ? ' = ' + lt : (M.l[0] === 1 ? '' : ' = ' + lt) + ' ≈ ' + n2(M.l[0] * Math.sqrt(M.l[1]));
        h += L_('slant height:', (SB_TEX[S.pair === 'cone-cyl' ? 'l2' : 'l'] ? '<span class="sb-eq">' + SB_TEX[S.pair === 'cone-cyl' ? 'l2' : 'l'] + '</span> ' : '') +
          mx('= <span class="gx-rt">√<span>' + M.lsq + '</span></span>' + lv) + ' cm', 'sb-ll');
      }
      h += L_('surface =', w[1], 'sb-saw');
      h += '<p class="se-l sb-saf">' + (SB_TEX['sa-' + tk] ? '<span class="sb-eq">= ' + SB_TEX['sa-' + tk] + '</span>' : '') + '</p>';
      h += '<p class="se-l sb-san">' + mx('= ' + sbShow(M.sa, S.pi, true)) + un2 + '</p>';
      h += L_('volume =', w[2], 'sb-vw');
      h += '<p class="se-l sb-vf">' + (SB_TEX['v-' + tk] ? '<span class="sb-eq">= ' + SB_TEX['v-' + tk] + '</span>' : '') + '</p>';
      h += '<p class="se-l sb-vn">' + mx('= ' + sbShow(M.vol, S.pi, true)) + un3 + '</p>';
      h += '<p class="se-l sb-pinote">' + (S.pi ? 'In terms of <span class="mx"><i>π</i></span>.' : 'With <span class="mx"><i>π</i> = 22/7</span>.') + '</p>';
      if (S.why) h += '<p class="se-l sb-why">' + S.why + '</p>';
      read.innerHTML = h;
    }
    var panelT = mThrottle(panel, 250);
    function stop() { S.timers.forEach(clearTimeout); S.timers = []; }
    function play() {                        /* apart (1 s) -> joined / cut with the hidden faces flashing twice -> dashed */
      stop();
      if (rm()) { S.phase = 'done'; draw(); return; }
      S.phase = 'apart'; draw();
      S.timers.push(setTimeout(function () {
        S.phase = 'flash'; draw();
        var n = 0;
        (function blink() {
          if (n >= 4) { S.phase = 'done'; draw(); return; }
          $$('.sb-flash', g).forEach(function (e) { e.style.opacity = n % 2 ? '1' : '0.15'; });
          n++;
          S.timers.push(setTimeout(blink, 200));
        })();
      }, 1000));
    }
    function changed(again) {
      syncCtl(); panel();
      if (again) play(); else { if (S.phase !== 'done') { stop(); S.phase = 'done'; } draw(); }
    }
    on(p1, 'change', function () {
      fillSecond();
      S.pair = { 'cyl hemi': 'cyl-hemi', 'cone hemi': 'cone-hemi', 'cone cyl': 'cone-cyl', 'cube hemi': 'cube-hemi' }[p1.value + ' ' + p2.value];
      if (S.pair === 'cone-hemi') S.mode = 'joined';
      S.why = fix() || (S.pair === 'cone-hemi' && sw.getAttribute('aria-checked') === 'true' ? 'A cone and a hemisphere can only be joined, so they are shown joined.' : '');
      changed(true);
    });
    on(p2, 'change', function () {
      S.pair = { 'cyl hemi': 'cyl-hemi', 'cone hemi': 'cone-hemi', 'cone cyl': 'cone-cyl', 'cube hemi': 'cube-hemi' }[p1.value + ' ' + p2.value];
      var was = S.mode;
      if (S.pair === 'cone-hemi') S.mode = 'joined';
      S.why = fix() || (was === 'cut' && S.mode === 'joined' ? 'A cone and a hemisphere can only be joined, so they are shown joined.' : '');
      changed(true);
    });
    on(sw, 'click', function () {
      if (sw.disabled) return;
      S.mode = S.mode === 'cut' ? 'joined' : 'cut';
      S.why = fix();
      changed(true);
    });
    $$('.sb-range', root).forEach(function (inp) {
      var k = inp.getAttribute('data-k');
      function take(final) {
        var v = Math.round(+inp.value), L = lim(k);
        S.why = '';
        if (v > L[1]) { v = L[1]; S.why = L[2]; }
        if (v < L[0]) { v = L[0]; S.why = L[3]; }
        inp.value = String(v);
        S[k] = v;
        syncCtl();
        if (final || S.why) panel(); else panelT();
        stop(); S.phase = 'done'; draw();
      }
      on(inp, 'input', function () { take(false); });
      on(inp, 'change', function () { take(true); });
      on(inp, 'keydown', function (e) {       /* arrow keys: exactly 1 cm; a limit stops the slider and says why */
        var d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        var n = S[k] + d, L = lim(k), D = SB_SL[k];
        if (n < D[0] || n > D[1]) return;
        if (n > L[1] || n < L[0]) { S.why = n > L[1] ? L[2] : L[3]; inp.value = String(S[k]); syncCtl(); panel(); return; }
        inp.value = String(n);
        take(true);
      });
    });
    on($('.sb-again', root), 'click', function () { play(); });
    on($('.sb-pi', root), 'click', function () { S.pi = !S.pi; syncCtl(); panel(); });
    fillSecond();
    p2.value = SB_PAIRS[S.pair][1];
    var lastW = 0;
    function onResize() { var w = geo().W; if (w === lastW) return; lastW = w; draw(); }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(root);
    on(window, 'resize', onResize);
    lastW = geo().W;
    syncCtl(); panel(); draw();
  }
  /*END-SB*/

  /*EF*/
  /* ---------------------------------------------------- energy-flow explorer (Science Ch 13, T03-V9; initEf)
     svg[data-ef] is the static first view and the no-JS view (content/C10-SCI-CH13/diagrams/_src/d13_ef.py: the page's
     own worked case, drawn by this same core). initEf() hides it and builds the explorer above it: chain buttons and
     start-from buttons (aria-pressed), a labelled number box with a J / kJ list, the chain drawn as picture cards from
     the bottom upwards (phone) or left to right (wide screens, when the cards fit), Show step, Check the other way, and
     a polite live region that announces each level ("Frog: 750 J") above a readout list of every level shown. The
     figure's data-block-id picks the opening case: the wrap-up 'Work backwards' (grassland, eagle 4 J), otherwise 'From
     the producers' (grassland, grass 75 000 J). Reduced motion: the replay is shown at once. Nothing is stored. */
  /*EF-ART*/var EF_ART = {"trees":{"svg":"<g transform=\"translate(-21 5.28) scale(0.78)\"><path d=\"M-4,0 L-5,24 L5,24 L4,0 Z\" fill=\"var(--dg-trunk13, #8B5A2B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><circle cx=\"-11\" cy=\"-10\" r=\"12\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.6\"/><circle cx=\"11\" cy=\"-10\" r=\"12\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.6\"/><circle cx=\"0\" cy=\"-22\" r=\"14\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.6\"/><circle cx=\"0\" cy=\"-4\" r=\"11\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.6\"/><circle cx=\"-11\" cy=\"-10\" r=\"12\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"none\"/><circle cx=\"11\" cy=\"-10\" r=\"12\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"none\"/><circle cx=\"0\" cy=\"-22\" r=\"14\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"none\"/><circle cx=\"0\" cy=\"-4\" r=\"11\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"none\"/><path d=\"M-6,-12 Q-2,-16 2,-12 M4,-4 Q8,-8 12,-4\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"1\"/></g><g transform=\"translate(21 5.28) scale(0.78)\"><path d=\"M-4,0 L-5,24 L5,24 L4,0 Z\" fill=\"var(--dg-trunk13, #8B5A2B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><circle cx=\"-11\" cy=\"-10\" r=\"12\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.6\"/><circle cx=\"11\" cy=\"-10\" r=\"12\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.6\"/><circle cx=\"0\" cy=\"-22\" r=\"14\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.6\"/><circle cx=\"0\" cy=\"-4\" r=\"11\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.6\"/><circle cx=\"-11\" cy=\"-10\" r=\"12\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"none\"/><circle cx=\"11\" cy=\"-10\" r=\"12\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"none\"/><circle cx=\"0\" cy=\"-22\" r=\"14\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"none\"/><circle cx=\"0\" cy=\"-4\" r=\"11\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"none\"/><path d=\"M-6,-12 Q-2,-16 2,-12 M4,-4 Q8,-8 12,-4\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"1\"/></g><g transform=\"translate(0 0) scale(1.0)\"><path d=\"M-4,0 L-5,24 L5,24 L4,0 Z\" fill=\"var(--dg-trunk13, #8B5A2B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><circle cx=\"-11\" cy=\"-10\" r=\"12\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.6\"/><circle cx=\"11\" cy=\"-10\" r=\"12\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.6\"/><circle cx=\"0\" cy=\"-22\" r=\"14\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.6\"/><circle cx=\"0\" cy=\"-4\" r=\"11\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.6\"/><circle cx=\"-11\" cy=\"-10\" r=\"12\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"none\"/><circle cx=\"11\" cy=\"-10\" r=\"12\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"none\"/><circle cx=\"0\" cy=\"-22\" r=\"14\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"none\"/><circle cx=\"0\" cy=\"-4\" r=\"11\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"none\"/><path d=\"M-6,-12 Q-2,-16 2,-12 M4,-4 Q8,-8 12,-4\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"1\"/></g>","b":[-39,-36,39,24]},"deer":{"svg":"<path d=\"M-18,-2 Q-20,8 -12,10 L12,10 Q20,8 18,-4 Q10,-10 -2,-9 Q-14,-9 -18,-2 Z\" fill=\"var(--dg-fur13, #C98B4E)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><path d=\"M-13,8 L-15,24\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2\"/><path d=\"M-7,8 L-6,24\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2\"/><path d=\"M8,8 L7,24\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2\"/><path d=\"M14,8 L16,24\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2\"/><path d=\"M12,-4 L17,-18 L22,-16 L19,-2 Z\" fill=\"var(--dg-fur13, #C98B4E)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><path d=\"M15,-20 Q20,-25 28,-20 Q27,-15 21,-14 Q16,-14 15,-20 Z\" fill=\"var(--dg-fur13, #C98B4E)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><circle cx=\"21\" cy=\"-19\" r=\"1.1\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/><path d=\"M17,-22 L13,-32 M15,-27 L10,-30 M20,-23 L22,-33 M21,-28 L26,-31\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.4\"/><ellipse cx=\"-6\" cy=\"-4\" rx=\"4\" ry=\"2\" fill=\"var(--dg-cream13, #F4EADA)\" stroke=\"none\"/><path d=\"M-18,-2 L-22,-6\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.6\"/>","b":[-22,-33,28,24]},"tiger":{"svg":"<path d=\"M-22,-2 Q-32,-6 -30,-16\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"2.4\"/><path d=\"M-23,0 Q-24,-10 -8,-10 L12,-10 Q22,-8 20,4 Q18,10 6,10 L-14,10 Q-24,10 -23,0 Z\" fill=\"var(--dg-tiger13, #F08A24)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><path d=\"M-20.5,8 L-20.5,20 L-15.5,20 L-15.5,8 Z\" fill=\"var(--dg-tiger13, #F08A24)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.1\"/><path d=\"M-13.5,8 L-13.5,20 L-8.5,20 L-8.5,8 Z\" fill=\"var(--dg-tiger13, #F08A24)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.1\"/><path d=\"M5.5,8 L5.5,20 L10.5,20 L10.5,8 Z\" fill=\"var(--dg-tiger13, #F08A24)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.1\"/><path d=\"M12.5,8 L12.5,20 L17.5,20 L17.5,8 Z\" fill=\"var(--dg-tiger13, #F08A24)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.1\"/><path d=\"M-14,-9 Q-11,-2 -15,4\" fill=\"none\" stroke=\"var(--dg-stripe13, #2B2118)\" stroke-width=\"1.6\"/><path d=\"M-6,-9 Q-3,-2 -7,4\" fill=\"none\" stroke=\"var(--dg-stripe13, #2B2118)\" stroke-width=\"1.6\"/><path d=\"M2,-9 Q5,-2 1,4\" fill=\"none\" stroke=\"var(--dg-stripe13, #2B2118)\" stroke-width=\"1.6\"/><path d=\"M10,-9 Q13,-2 9,4\" fill=\"none\" stroke=\"var(--dg-stripe13, #2B2118)\" stroke-width=\"1.6\"/><path d=\"M18,-15 Q20,-19 23,-17 Q28,-19 30,-15 Q34,-10 31,-4 Q27,1 22,0 Q17,-2 17,-8 Z\" fill=\"var(--dg-tiger13, #F08A24)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><circle cx=\"23\" cy=\"-10\" r=\"1.1\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/><circle cx=\"28\" cy=\"-10\" r=\"1.1\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/><ellipse cx=\"26\" cy=\"-5\" rx=\"3\" ry=\"2.2\" fill=\"var(--dg-white13, #FFFFFF)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"0.9\"/><path d=\"M21,-15 L22,-12 M27,-16 L27,-13\" fill=\"none\" stroke=\"var(--dg-stripe13, #2B2118)\" stroke-width=\"1.1\"/>","b":[-31,-19,33,20]},"aquatic plant":{"svg":"<path d=\"M-14,4 Q-10,14 -6,22 M0,0 Q2,12 0,22 M14,5 Q10,14 7,22\" fill=\"none\" stroke=\"var(--dg-leafdk13, #3C7D32)\" stroke-width=\"1.4\"/><path d=\"M-27,4 Q-20,1 -13,4 T1,4 T15,4 T27,4\" fill=\"none\" stroke=\"var(--dg-waterln13, #3B8CC4)\" stroke-width=\"1.3\"/><path d=\"M-24,5 A11,4 0 1 1 -4,5 L-12,4 Z\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.1\"/><path d=\"M6,6 A10,3.6 0 1 1 25,6 L15,4 Z\" fill=\"var(--dg-leaf13, #5FA84A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.1\"/><path d=\"M0,-1 Q-2.4,-7.8 -7.8,-8.5 Q-5.4,-2.7 0,-1 Z\" fill=\"var(--dg-petal13, #E8638C)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M0,-1 Q0.8,-8.3 -3.8,-12.2 Q-4.6,-5.8 0,-1 Z\" fill=\"var(--dg-petal13, #E8638C)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M0,-1 Q3.0,-7.5 0.0,-13.0 Q-3.0,-7.5 0,-1 Z\" fill=\"var(--dg-petal13, #E8638C)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M0,-1 Q4.6,-5.8 3.8,-12.2 Q-0.8,-8.3 0,-1 Z\" fill=\"var(--dg-petal13, #E8638C)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M0,-1 Q5.4,-2.7 7.8,-8.5 Q2.4,-7.8 0,-1 Z\" fill=\"var(--dg-petal13, #E8638C)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><circle cx=\"0\" cy=\"-3\" r=\"2.4\" fill=\"var(--dg-sunfl13, #F5C431)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"0.9\"/>","b":[-27,-14,27,22]},"aquatic insect":{"svg":"<path d=\"M-4,-1 Q-14,-12 -24,-8 M4,-1 Q14,-12 24,-8\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.8\"/><path d=\"M-6,4 L-14,10 M6,4 L14,10\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.2\"/><ellipse cx=\"0\" cy=\"2\" rx=\"7\" ry=\"11\" fill=\"var(--dg-aqbug13, #8C6A3F)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><path d=\"M0,-6 L0,12\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"0.9\"/><circle cx=\"0\" cy=\"-10\" r=\"4\" fill=\"var(--dg-aqbug13, #8C6A3F)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.8\"/><circle cx=\"-2\" cy=\"-11\" r=\"1.1\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/><circle cx=\"2\" cy=\"-11\" r=\"1.1\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/>","b":[-24,-14,24,13]},"fish":{"svg":"<path d=\"M-14,0 L-25,-8 L-23,0 L-25,8 Z\" fill=\"var(--dg-fish13, #5B9BD5)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.1\"/><path d=\"M-15,0 Q-4,-11 10,-6 Q17,-3 17,0 Q17,3 10,6 Q-4,11 -15,0 Z\" fill=\"var(--dg-fish13, #5B9BD5)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><path d=\"M-4,-7 Q0,-13 6,-7 Z\" fill=\"var(--dg-fin13, #2F6FB0)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"0.9\"/><circle cx=\"10\" cy=\"-2\" r=\"1.5\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/><path d=\"M3,-5 Q6,0 3,5\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.9\"/>","b":[-25,-11,17,9]},"heron":{"svg":"<path d=\"M-2,6 L-4,30 M3,6 L4,30 M-4,30 L-9,31 M4,30 L9,31\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.4\"/><path d=\"M-14,-4 Q-8,-12 4,-8 Q10,-4 8,2 Q2,8 -8,5 Q-16,3 -14,-4 Z\" fill=\"var(--dg-heron13, #C9D3DC)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><path d=\"M6,-6 Q14,-12 8,-20 Q4,-26 10,-30\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"4.2\"/><path d=\"M6,-6 Q14,-12 8,-20 Q4,-26 10,-30\" fill=\"none\" stroke=\"var(--dg-heron13, #C9D3DC)\" stroke-width=\"2.2\"/><circle cx=\"11\" cy=\"-30\" r=\"3.6\" fill=\"var(--dg-heron13, #C9D3DC)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.8\"/><path d=\"M13,-31 L26,-28 L13,-28.5 Z\" fill=\"var(--dg-beak13, #F2C230)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"0.9\"/><circle cx=\"11\" cy=\"-31\" r=\"0.9\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/><path d=\"M9,-33 Q2,-34 -2,-31\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M-10,-2 Q-2,-4 4,0\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.9\"/>","b":[-15,-35,26,31]},"grass":{"svg":"<path d=\"M-24.6,14 Q-7.04,-7 -26,-14 Q-4.96,-7 -19.4,14 Z\" fill=\"var(--dg-grass13, #7DBB4B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M-16.6,14 Q-3.04,-11 -18,-22 Q-0.96,-11 -11.4,14 Z\" fill=\"var(--dg-grass13, #7DBB4B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M-9.6,14 Q-5.04,-13 -4,-26 Q-2.96,-13 -4.4,14 Z\" fill=\"var(--dg-grass13, #7DBB4B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M-2.6,14 Q-1.04,-10 2,-20 Q1.04,-10 2.6,14 Z\" fill=\"var(--dg-grass13, #7DBB4B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M3.4,14 Q-3.04,-13.5 10,-27 Q-0.96,-13.5 8.6,14 Z\" fill=\"var(--dg-grass13, #7DBB4B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M10.4,14 Q-1.04,-9 18,-18 Q1.04,-9 15.6,14 Z\" fill=\"var(--dg-grass13, #7DBB4B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M17.4,14 Q-5.04,-6 26,-12 Q-2.96,-6 22.6,14 Z\" fill=\"var(--dg-grass13, #7DBB4B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M-5.6,14 Q-3.04,-8 -10,-16 Q-0.96,-8 -0.3999999999999999,14 Z\" fill=\"var(--dg-grass13, #7DBB4B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M6.4,14 Q-5.04,-7 4,-14 Q-2.96,-7 11.6,14 Z\" fill=\"var(--dg-grass13, #7DBB4B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M-27,14 L27,14\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.4\"/>","b":[-27,-27,27,14]},"grasshopper":{"svg":"<path d=\"M17,-3 Q24,-16 32,-14 M16,-4 Q20,-18 27,-20\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><path d=\"M-18,2 Q-16,-5 0,-5 L14,-5 Q20,-3 19,2 Q14,6 0,5 Q-14,6 -18,2 Z\" fill=\"var(--dg-frog13, #7CC35B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><circle cx=\"16\" cy=\"-1\" r=\"4.6\" fill=\"var(--dg-frog13, #7CC35B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.8\"/><circle cx=\"17\" cy=\"-2\" r=\"1.2\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/><path d=\"M-4,-4 L-12,-15 L-15,-13 L-8,-3 Z\" fill=\"var(--dg-frog13, #7CC35B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.1\"/><path d=\"M-12,-15 L-20,8 M4,4 L1,11 M9,4 L11,11\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.4\"/><path d=\"M-6,-3 Q2,-1 10,-3\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.9\"/>","b":[-21,-20,32,11]},"frog":{"svg":"<path d=\"M-14,6 Q-24,6 -22,14 L-12,14 Z\" fill=\"var(--dg-frog13, #7CC35B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.1\"/><path d=\"M14,6 Q24,6 22,14 L12,14 Z\" fill=\"var(--dg-frog13, #7CC35B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.1\"/><path d=\"M-15,6 Q-16,-6 0,-7 Q16,-6 15,6 Q12,13 0,13 Q-12,13 -15,6 Z\" fill=\"var(--dg-frog13, #7CC35B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><circle cx=\"-7\" cy=\"-8\" r=\"4.4\" fill=\"var(--dg-frog13, #7CC35B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.8\"/><circle cx=\"7\" cy=\"-8\" r=\"4.4\" fill=\"var(--dg-frog13, #7CC35B)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.8\"/><circle cx=\"-7\" cy=\"-8\" r=\"1.8\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/><circle cx=\"7\" cy=\"-8\" r=\"1.8\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/><path d=\"M-6,4 Q0,7 6,4\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.1\"/><path d=\"M-8,12 L-10,15 M8,12 L10,15\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.4\"/>","b":[-23,-13,23,15]},"snake":{"svg":"<path d=\"M-24,10 C-14,-6 -4,22 6,4 S16,-12 22,-6\" fill=\"none\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"7.2\"/><path d=\"M-24,10 C-14,-6 -4,22 6,4 S16,-12 22,-6\" fill=\"none\" stroke=\"var(--dg-snake13, #9BAF3A)\" stroke-width=\"4.6\"/><ellipse cx=\"24\" cy=\"-7\" rx=\"5.6\" ry=\"3.8\" fill=\"var(--dg-snake13, #9BAF3A)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\" transform=\"rotate(-20 24 -7)\"/><circle cx=\"25\" cy=\"-8.5\" r=\"0.9\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/><path d=\"M29,-9 L33,-10 M33,-10 L35,-12 M33,-10 L35,-8\" fill=\"none\" stroke=\"var(--dg-red13, #D33A2C)\" stroke-width=\"1\"/><circle cx=\"-14\" cy=\"3\" r=\"0.9\" fill=\"var(--ink-soft, #57554D)\" stroke=\"none\"/><circle cx=\"-4\" cy=\"11\" r=\"0.9\" fill=\"var(--ink-soft, #57554D)\" stroke=\"none\"/><circle cx=\"8\" cy=\"2\" r=\"0.9\" fill=\"var(--ink-soft, #57554D)\" stroke=\"none\"/><circle cx=\"15\" cy=\"-6\" r=\"0.9\" fill=\"var(--ink-soft, #57554D)\" stroke=\"none\"/>","b":[-27,-13,35,14]},"eagle":{"svg":"<path d=\"M-4,-2 Q-16,-18 -32,-14 Q-22,-10 -24,-4 Q-16,-6 -12,2 Z\" fill=\"var(--dg-eagle13, #7A5230)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><path d=\"M4,-2 Q16,-18 32,-14 Q22,-10 24,-4 Q16,-6 12,2 Z\" fill=\"var(--dg-eagle13, #7A5230)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><path d=\"M-26,-12 L-22,-8 M-20,-14 L-17,-8 M26,-12 L22,-8 M20,-14 L17,-8\" fill=\"none\" stroke=\"var(--ink-soft, #57554D)\" stroke-width=\"0.9\"/><path d=\"M-6,0 Q-7,12 0,18 Q7,12 6,0 Q0,-4 -6,0 Z\" fill=\"var(--dg-eagle13, #7A5230)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/><path d=\"M-5,18 L0,24 L5,18 Z\" fill=\"var(--dg-eagle13, #7A5230)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1\"/><circle cx=\"0\" cy=\"-5\" r=\"5.4\" fill=\"var(--dg-white13, #FFFFFF)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.8\"/><path d=\"M2,-4 Q7,-4 6,1 L3,-1 Z\" fill=\"var(--dg-beak13, #F2C230)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"0.9\"/><circle cx=\"0\" cy=\"-6\" r=\"1\" fill=\"var(--ink, #1F2328)\" stroke=\"none\"/>","b":[-32,-16,32,24]},"sun":{"svg":"<path d=\"M16.0,0.0 L22.0,0.0\" fill=\"none\" stroke=\"var(--dg-ray13, #E08A12)\" stroke-width=\"1.8\"/><path d=\"M13.9,8.0 L19.1,11.0\" fill=\"none\" stroke=\"var(--dg-ray13, #E08A12)\" stroke-width=\"1.8\"/><path d=\"M8.0,13.9 L11.0,19.1\" fill=\"none\" stroke=\"var(--dg-ray13, #E08A12)\" stroke-width=\"1.8\"/><path d=\"M0.0,16.0 L0.0,22.0\" fill=\"none\" stroke=\"var(--dg-ray13, #E08A12)\" stroke-width=\"1.8\"/><path d=\"M-8.0,13.9 L-11.0,19.1\" fill=\"none\" stroke=\"var(--dg-ray13, #E08A12)\" stroke-width=\"1.8\"/><path d=\"M-13.9,8.0 L-19.1,11.0\" fill=\"none\" stroke=\"var(--dg-ray13, #E08A12)\" stroke-width=\"1.8\"/><path d=\"M-16.0,0.0 L-22.0,0.0\" fill=\"none\" stroke=\"var(--dg-ray13, #E08A12)\" stroke-width=\"1.8\"/><path d=\"M-13.9,-8.0 L-19.1,-11.0\" fill=\"none\" stroke=\"var(--dg-ray13, #E08A12)\" stroke-width=\"1.8\"/><path d=\"M-8.0,-13.9 L-11.0,-19.1\" fill=\"none\" stroke=\"var(--dg-ray13, #E08A12)\" stroke-width=\"1.8\"/><path d=\"M-0.0,-16.0 L-0.0,-22.0\" fill=\"none\" stroke=\"var(--dg-ray13, #E08A12)\" stroke-width=\"1.8\"/><path d=\"M8.0,-13.9 L11.0,-19.1\" fill=\"none\" stroke=\"var(--dg-ray13, #E08A12)\" stroke-width=\"1.8\"/><path d=\"M13.9,-8.0 L19.1,-11.0\" fill=\"none\" stroke=\"var(--dg-ray13, #E08A12)\" stroke-width=\"1.8\"/><circle cx=\"0\" cy=\"0\" r=\"13\" fill=\"var(--dg-sun13, #F6B73C)\" stroke=\"var(--ink, #1F2328)\" stroke-width=\"1.3\"/>","b":[-22,-22,22,22]}};
/*EF-CORE*/
  /* energy-flow explorer core (Science Ch 13, T03-V9): the model and the drawing, no DOM. Written into site.js by
     content/C10-SCI-CH13/diagrams/_src/ef_js.py; the same code (run in node) draws the explorer's static first view.
     Level 0 = sunlight falling on the leaves (not a trophic level); level 1 = producers; level k = k-th trophic level.
     Producers = 1 % of level 0 (÷ 100); each next level = 10 % of the level below (÷ 10); going down × 10 (× 100 from
     the producers to the sunlight). Exact decimal arithmetic: a value is {n: BigInt, s: places} = n ÷ 10^s.
     Whole numbers are grouped in threes with a thin space (U+2009: 24 000), decimals with a point (7.5). */
  var EF_CHAINS = {
    forest: { name: 'Forest', orgs: [['trees', 'Trees'], ['deer', 'Deer'], ['tiger', 'Tiger']] },
    pond: { name: 'Pond', orgs: [['aquatic plant', 'Aquatic plants'], ['aquatic insect', 'Aquatic insects'], ['fish', 'Fish'], ['heron', 'Heron']] },
    grassland: { name: 'Grassland', orgs: [['grass', 'Grass'], ['grasshopper', 'Grasshopper'], ['frog', 'Frog'], ['snake', 'Snake'], ['eagle', 'Eagle']] }
  };
  var EF_ORDER = ['forest', 'pond', 'grassland'];
  var EF_MODES = [['prod', 'From the producers'], ['sun', 'From sunlight'], ['back', 'Work backwards']];
  var EF_TS = ' ';
  function efNorm(v) { var n = v.n, s = v.s; while (s > 0 && n % 10n === 0n) { n = n / 10n; s--; } return { n: n, s: s }; }
  function efParse(t) {
    t = String(t == null ? '' : t).replace(/[\s   ,]/g, '');
    var m = /^(\d{1,13})(?:\.(\d{1,6}))?$/.exec(t);
    if (!m) return null;
    var fr = m[2] || '', v = efNorm({ n: BigInt(m[1] + fr), s: fr.length });
    return v.n > 0n ? v : null;
  }
  function efShift(v, k) {               /* v × 10^k */
    if (k >= 0) { var p = 1n; for (var i = 0; i < k; i++) p *= 10n; return efNorm({ n: v.n * p, s: v.s }); }
    return efNorm({ n: v.n, s: v.s - k });
  }
  function efSub(a, b) {
    var s = Math.max(a.s, b.s), x = a.n, y = b.n, i;
    for (i = a.s; i < s; i++) x *= 10n;
    for (i = b.s; i < s; i++) y *= 10n;
    return efNorm({ n: x - y, s: s });
  }
  function efEq(a, b) { return efSub(a, b).n === 0n; }
  function efFmt(v) {
    var d = v.n.toString(), neg = d.charAt(0) === '-';
    if (neg) d = d.slice(1);
    while (d.length <= v.s) d = '0' + d;
    var ip = v.s ? d.slice(0, d.length - v.s) : d, fp = v.s ? d.slice(d.length - v.s) : '';
    if (ip.length >= 4) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, EF_TS);
    return (neg ? '−' : '') + ip + (fp ? '.' + fp : '');
  }
  /* the power of ten that takes level a to level b */
  function efPow(a, b) {
    var k = 0, lo = Math.min(a, b), hi = Math.max(a, b);
    for (var i = lo; i < hi; i++) k += (i === 0 ? 2 : 1);
    return b > a ? -k : k;
  }
  function efN(chain) { return EF_CHAINS[chain].orgs.length; }
  function efGiven(mode, chain) { return mode === 'prod' ? 1 : mode === 'sun' ? 0 : efN(chain); }
  /* the energy at every level 0..n from the given value */
  function efLevels(chain, mode, v) {
    var g = efGiven(mode, chain), out = [];
    for (var k = 0; k <= efN(chain); k++) out.push(efShift(v, efPow(g, k)));
    return out;
  }
  /* the order in which the levels are shown (the given level first) */
  function efOrder(chain, mode) {
    var n = efN(chain), out = [], k;
    if (mode === 'back') for (k = n; k >= 1; k--) out.push(k);
    else for (k = mode === 'sun' ? 0 : 1; k <= n; k++) out.push(k);
    return out;
  }
  function efName(chain, k) { return k === 0 ? 'Sunlight' : EF_CHAINS[chain].orgs[k - 1][1]; }
  /* the operation written on the arrow between levels k and k+1 (dir: the way the numbers are being worked) */
  function efOp(k, down) { return down ? (k === 0 ? '× 100' : '× 10') : (k === 0 ? '÷ 100' : '÷ 10'); }
  function efLost(E, k) { return efSub(E[k], E[k + 1]); }
  function efInputLabel(chain, mode) {
    if (mode === 'sun') return 'Sunlight falling on the leaves';
    var k = efGiven(mode, chain);
    return 'Energy of the ' + efName(chain, k).toLowerCase() + (mode === 'prod' ? ' (producers)' : ' (top level)');
  }
  /* ------------------------------------------------------------- drawing
     st: {chain, mode, v, unit, shown (how many levels of efOrder are shown), back (replay: how many levels re-worked,
     or -1), backV (the replayed values by level), W (drawing width), wide (left to right)}. Returns {svg, w, h}. */
  var EF_C = { ink: 'var(--ink, #1F2328)', soft: 'var(--ink-soft, #57554D)', card: 'var(--card, #FFFFFF)', mark: 'var(--dg-ef-mark13, #0A6C74)',
    sun: 'var(--dg-ray13, #E08A12)', sunbg: 'var(--dg-fprod13, #F9EFA6)', heat: 'var(--dg-force12, #B45309)', ok: 'var(--correct, #145C32)',
    paper: 'var(--paper-deep, #F6F1E3)' };
  function efEsc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function efT(x, y, t, o) {
    o = o || {};
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-family="Lexend, sans-serif" font-size="' + (o.size || 15) + '"' +
      (o.bold ? ' font-weight="600"' : '') + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + ' fill="' + (o.fill || EF_C.ink) + '"' +
      (o.cls ? ' class="' + o.cls + '"' : '') + '>' + efEsc(t) + '</text>';
  }
  function efIcon(kind, cx, cy, bw, bh) {
    var a = EF_ART[kind], b = a.b, s = Math.min(bw / (b[2] - b[0]), bh / (b[3] - b[1]), 1.5);
    var tx = cx - s * (b[0] + b[2]) / 2, ty = cy - s * (b[1] + b[3]) / 2;
    return '<g transform="translate(' + tx.toFixed(2) + ' ' + ty.toFixed(2) + ') scale(' + s.toFixed(3) + ')">' + a.svg + '</g>';
  }
  function efArrow(x1, y1, x2, y2, col, sw, cls) {
    var a = Math.atan2(y2 - y1, x2 - x1), s = 9, ex = x2 - Math.cos(a) * s * 0.6, ey = y2 - Math.sin(a) * s * 0.6;
    var px = -Math.sin(a) * s * 0.5, py = Math.cos(a) * s * 0.5, bx = x2 - Math.cos(a) * s, by = y2 - Math.sin(a) * s;
    return '<g class="' + (cls || 'ef-arr') + '" data-x1="' + x1.toFixed(1) + '" data-y1="' + y1.toFixed(1) + '" data-x2="' + x2.toFixed(1) + '" data-y2="' + y2.toFixed(1) + '">' +
      '<path d="M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' L' + ex.toFixed(1) + ',' + ey.toFixed(1) + '" stroke="' + col + '" stroke-width="' + sw + '" fill="none"/>' +
      '<path d="M' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' L' + (bx + px).toFixed(1) + ',' + (by + py).toFixed(1) + ' L' + (bx - px).toFixed(1) + ',' + (by - py).toFixed(1) + ' Z" fill="' + col + '" stroke="' + col + '" stroke-width="1"/></g>';
  }
  function efTick(cx, cy, s, col) {
    return '<path class="ef-tick" d="M' + (cx - s * 0.55).toFixed(1) + ',' + cy.toFixed(1) + ' L' + (cx - s * 0.12).toFixed(1) + ',' + (cy + s * 0.42).toFixed(1) +
      ' L' + (cx + s * 0.6).toFixed(1) + ',' + (cy - s * 0.5).toFixed(1) + '" stroke="' + col + '" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  /* can the chain be drawn left to right in width W? */
  function efFitsWide(n, W) { return W >= 20 + n * 112 + (n - 1) * 44; }
  function efSvg(st) {
    var chain = st.chain, mode = st.mode, E = efLevels(chain, mode, st.v), ord = efOrder(chain, mode), n = efN(chain);
    var lv = mode === 'sun' ? [0].concat(ord.slice(1)) : ord.slice().sort(function (a, b) { return a - b; });
    var shownSet = {}, i;
    for (i = 0; i < Math.min(st.shown, ord.length); i++) shownSet[ord[i]] = true;
    var down = mode === 'back', g = efGiven(mode, chain), unit = ' ' + st.unit, out = '', W = st.W || 300, H;
    var replaying = st.back >= 0, rset = {};
    if (replaying) { var rord = ord.slice().reverse(); for (i = 0; i < Math.min(st.back, rord.length); i++) rset[rord[i]] = true; }
    var boxes = {};
    function val(k) { return shownSet[k] ? efFmt(E[k]) + unit : '?'; }
    if (!st.wide) {
      var ch = 54, gap = 50, x0 = 8, cw = W - 16, top = 8;
      H = top + lv.length * ch + (lv.length - 1) * gap + 8;
      lv.forEach(function (k, j) { var y = H - 8 - ch - j * (ch + gap); boxes[k] = { x: x0, y: y, w: cw, h: ch }; });
      lv.forEach(function (k) {
        var b = boxes[k], sh = shownSet[k], isG = k === g;
        out += '<g class="ef-card' + (sh ? ' is-shown' : '') + (isG ? ' is-given' : '') + (st.newest === k ? ' is-new' : '') + '" data-level="' + k + '">' +
          '<rect x="' + b.x + '" y="' + b.y.toFixed(1) + '" width="' + b.w + '" height="' + b.h + '" rx="10" fill="' + (k === 0 ? EF_C.sunbg : EF_C.card) + '" stroke="' + (isG ? EF_C.mark : EF_C.soft) + '" stroke-width="' + (isG ? 3 : 1.2) + '"/>' +
          efIcon(k === 0 ? 'sun' : EF_CHAINS[chain].orgs[k - 1][0], b.x + 38, b.y + b.h / 2, 60, 42) +
          efT(b.x + 78, b.y + 22, efName(chain, k), { bold: true, size: 15 }) +
          efT(b.x + 78, b.y + 43, val(k), { size: 15, cls: 'ef-val', fill: sh ? EF_C.ink : EF_C.soft }) +
          (isG ? efT(b.x + b.w - 10, b.y + 20, 'given', { size: 14, anchor: 'end', fill: EF_C.mark, bold: true }) : '') +
          (k === 0 ? efT(b.x + b.w - 10, b.y + 44, 'not a level', { size: 14, anchor: 'end', fill: EF_C.soft }) :
            efT(b.x + b.w - 10, b.y + 44, 'level ' + k, { size: 14, anchor: 'end', fill: EF_C.soft })) +
          (replaying && rset[k] && isG && st.backOk ? efTick(b.x + b.w - 70, b.y + 16, 14, EF_C.ok) : '') +
          (replaying && rset[k] ? '<rect class="ef-ring" x="' + (b.x + 3) + '" y="' + (b.y + 3).toFixed(1) + '" width="' + (b.w - 6) + '" height="' + (b.h - 6) + '" rx="8" fill="none" stroke="' + EF_C.mark + '" stroke-width="1.6" stroke-dasharray="5 4"/>' : '') +
          '</g>';
      });
      for (var j = 0; j < lv.length - 1; j++) {
        var k = lv[j], lo = boxes[k], up = boxes[lv[j + 1]], ax = 58, y1 = lo.y - 2, y2 = up.y + up.h + 1;
        var known = shownSet[k] && shownSet[k + 1];
        out += efArrow(ax, y1, ax, y2, k === 0 ? EF_C.sun : EF_C.ink, k === 0 ? 2.4 : 2, 'ef-arr');
        var ym = (y1 + y2) / 2;
        if (known) {
          var op = replaying && rset[k] && rset[k + 1] ? efOp(k, !down) : efOp(k, down);
          out += efT(ax - 10, ym + 5, op, { size: 15, bold: true, anchor: 'end', cls: 'ef-op' });
          if (k > 0) out += efT(ax + 14, ym - 4, 'not passed on', { size: 14, fill: EF_C.soft }) +
            efT(ax + 14, ym + 14, efFmt(efLost(E, k)) + unit, { size: 14, cls: 'ef-lost', fill: EF_C.heat, bold: true });
          else out += efT(ax + 14, ym + 5, 'about 1 % is captured', { size: 14, fill: EF_C.soft });
        }
      }
    } else {
      var cw2 = Math.min(150, (W - 20 - (lv.length - 1) * 44) / lv.length), gap2 = 44, ch2 = 128, x00 = (W - (lv.length * cw2 + (lv.length - 1) * gap2)) / 2;
      H = ch2 + 70;
      lv.forEach(function (k, j) { boxes[k] = { x: x00 + j * (cw2 + gap2), y: 8, w: cw2, h: ch2 }; });
      lv.forEach(function (k) {
        var b = boxes[k], sh = shownSet[k], isG = k === g, nm = efName(chain, k), parts = nm.split(' ');
        out += '<g class="ef-card' + (sh ? ' is-shown' : '') + (isG ? ' is-given' : '') + (st.newest === k ? ' is-new' : '') + '" data-level="' + k + '">' +
          '<rect x="' + b.x.toFixed(1) + '" y="' + b.y + '" width="' + b.w.toFixed(1) + '" height="' + b.h + '" rx="10" fill="' + (k === 0 ? EF_C.sunbg : EF_C.card) + '" stroke="' + (isG ? EF_C.mark : EF_C.soft) + '" stroke-width="' + (isG ? 3 : 1.2) + '"/>' +
          efIcon(k === 0 ? 'sun' : EF_CHAINS[chain].orgs[k - 1][0], b.x + b.w / 2, b.y + 32, b.w - 20, 44) +
          (parts.length > 1 && b.w < 130 ? efT(b.x + b.w / 2, b.y + 74, parts[0], { bold: true, size: 14, anchor: 'middle' }) + efT(b.x + b.w / 2, b.y + 91, parts.slice(1).join(' '), { bold: true, size: 14, anchor: 'middle' })
            : efT(b.x + b.w / 2, b.y + 80, nm, { bold: true, size: 14, anchor: 'middle' })) +
          efT(b.x + b.w / 2, b.y + 113, val(k), { size: 14, anchor: 'middle', cls: 'ef-val', fill: sh ? EF_C.ink : EF_C.soft }) +
          (isG ? efT(b.x + b.w / 2, b.y + b.h + 18, 'given', { size: 14, anchor: 'middle', fill: EF_C.mark, bold: true }) : '') +
          (replaying && rset[k] && isG && st.backOk ? efTick(b.x + b.w - 14, b.y + 16, 14, EF_C.ok) : '') +
          (replaying && rset[k] ? '<rect class="ef-ring" x="' + (b.x + 3).toFixed(1) + '" y="' + (b.y + 3) + '" width="' + (b.w - 6).toFixed(1) + '" height="' + (b.h - 6) + '" rx="8" fill="none" stroke="' + EF_C.mark + '" stroke-width="1.6" stroke-dasharray="5 4"/>' : '') +
          '</g>';
      });
      for (var q = 0; q < lv.length - 1; q++) {
        var kk = lv[q], L1 = boxes[kk], R1 = boxes[lv[q + 1]], ay = 48, x1 = L1.x + L1.w + 2, x2 = R1.x - 1;
        var kn = shownSet[kk] && shownSet[kk + 1];
        out += efArrow(x1, ay, x2, ay, kk === 0 ? EF_C.sun : EF_C.ink, kk === 0 ? 2.4 : 2, 'ef-arr');
        if (kn) {
          var op2 = replaying && rset[kk] && rset[kk + 1] ? efOp(kk, !down) : efOp(kk, down), xm = (x1 + x2) / 2;
          out += efT(xm, ay - 10, op2, { size: 14, bold: true, anchor: 'middle', cls: 'ef-op' });
          if (kk > 0) out += efT(xm, H - 26, 'not passed on', { size: 14, anchor: 'middle', fill: EF_C.soft }) +
            efT(xm, H - 8, efFmt(efLost(E, kk)) + unit, { size: 14, anchor: 'middle', cls: 'ef-lost', fill: EF_C.heat, bold: true });
        }
      }
    }
    return { svg: out, w: W, h: H };
  }
  /* the drawing's accessible name */
  function efLabel(st) {
    var E = efLevels(st.chain, st.mode, st.v), ord = efOrder(st.chain, st.mode), lv = ord.slice().sort(function (a, b) { return a - b; });
    var sh = {};
    ord.slice(0, st.shown).forEach(function (k) { sh[k] = true; });
    return EF_CHAINS[st.chain].name + ' food chain, from the bottom: ' + lv.map(function (k) {
      return efName(st.chain, k).toLowerCase() + ' ' + (sh[k] ? efFmt(E[k]) + ' ' + st.unit : 'not worked out yet'); }).join('; ') + '.';
  }
/*END-EF-CORE*/
  function initEf() {
    $$('svg[data-ef]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-ef-on')) return;
      art.setAttribute('data-ef-on', '1');
      var fig = svg.closest('.fig'), bid = fig ? fig.getAttribute('data-block-id') || '' : '';
      if (fig) fig.classList.add('fig--ef');
      efBuild(art, /-WRAPUP\./.test(bid) ? { chain: 'grassland', mode: 'back', text: '4', unit: 'J' }
                                          : { chain: 'grassland', mode: 'prod', text: '75' + EF_TS + '000', unit: 'J' });
    });
  }
  function efBuild(art, S0) {
    var uid = 'ef' + Math.random().toString(36).slice(2, 7);
    var S = { newest: -1, chain: S0.chain, mode: S0.mode, text: S0.text, v: efParse(S0.text), unit: S0.unit, shown: 1, back: -1, backV: {}, backOk: false, timers: [] };
    function seg(list, cls, lab) {
      return '<span class="ef-lbl" id="' + uid + '-' + cls + '">' + lab + '</span><div class="ef-seg ef-' + cls + '" role="group" aria-labelledby="' + uid + '-' + cls + '">' +
        list.map(function (m) { return '<button type="button" data-k="' + m[0] + '" aria-pressed="false">' + m[1] + '</button>'; }).join('') + '</div>';
    }
    var root = document.createElement('div');
    root.className = 'ef';
    root.innerHTML =
      '<div class="ef-ctl">' + seg(EF_ORDER.map(function (c) { return [c, EF_CHAINS[c].name]; }), 'chains', 'Food chain') +
      seg(EF_MODES, 'modes', 'Start from') +
      '<div class="ef-in"><div class="ef-field"><label class="ef-lbl ef-vl" for="' + uid + '-v"></label>' +
      '<input class="ef-num" id="' + uid + '-v" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-describedby="' + uid + '-e"></div>' +
      '<div class="ef-field ef-uf"><label class="ef-lbl" for="' + uid + '-u">Unit</label><select class="ef-unit" id="' + uid + '-u"><option value="J">J</option><option value="kJ">kJ</option></select></div></div>' +
      '<p class="ef-err" id="' + uid + '-e"></p></div>' +
      '<div class="ef-art"><svg class="ef-live" role="img" aria-labelledby="' + uid + '-t"><title id="' + uid + '-t"></title><g class="ef-g"></g></svg></div>' +
      '<div class="ef-acts"><button type="button" class="ef-step">Show step</button><button type="button" class="ef-other">Check the other way</button></div>' +
      '<p class="ef-hint">Keys: Tab moves between the buttons, the number box and the unit list; Enter or Space presses a button; Enter in the number box shows the next step.</p>' +
      '<div class="ef-out"><p class="ef-say" aria-live="polite"></p><ol class="ef-read"></ol></div>';
    art.parentNode.insertBefore(root, art);
    art.setAttribute('hidden', '');                     /* the static first view stays for no-JS only */
    var live = $('.ef-live', root), g = $('.ef-g', root), title = $('title', live), inp = $('.ef-num', root), sel = $('.ef-unit', root);
    var say = $('.ef-say', root), read = $('.ef-read', root), err = $('.ef-err', root), stepB = $('.ef-step', root), otherB = $('.ef-other', root);
    var box = $('.ef-art', root);
    inp.value = S.text; sel.value = S.unit;
    function rm() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function stop() { S.timers.forEach(clearTimeout); S.timers = []; }
    function ord() { return efOrder(S.chain, S.mode); }
    function line(k, E, back) {
      var nm = efName(S.chain, k), h = '<li data-level="' + k + '"' + (back ? ' class="ef-r-back"' : '') + '><b>' + nm + ':</b> <span class="ef-nv">' + efFmt(back ? S.backV[k] : E[k]) + ' ' + S.unit + '</span>';
      if (back) return h + '</li>';
      if (k === efGiven(S.mode, S.chain)) return h + ' <span class="ef-note">(given)</span></li>';
      var o = ord(), i = o.indexOf(k), prev = o[i - 1], lo = Math.min(prev, k);
      h += ' <span class="ef-note">(' + efOp(lo, S.mode === 'back') + ')</span>';
      if (lo > 0) h += '; not passed on from ' + efName(S.chain, lo).toLowerCase() + ' to ' + efName(S.chain, lo + 1).toLowerCase() + ': <span class="ef-lv">' + efFmt(efLost(E, lo)) + ' ' + S.unit + '</span>';
      return h + '</li>';
    }
    function geo() {
      var cw = Math.round(box.clientWidth || 358), n = efN(S.chain) + (S.mode === 'sun' ? 1 : 0);
      return cw >= 600 && efFitsWide(n, Math.min(cw, 900)) ? { W: Math.min(cw, 900), wide: true } : { W: 300, wide: false };
    }
    function draw() {
      var G = geo();
      if (!S.v) { g.innerHTML = ''; live.setAttribute('viewBox', '0 0 300 40'); title.textContent = 'No energy typed yet.'; return; }
      var d = efSvg({ chain: S.chain, mode: S.mode, v: S.v, unit: S.unit, shown: S.shown, back: S.back, backV: S.backV, backOk: S.backOk, W: G.W, wide: G.wide, newest: S.newest });
      S.newest = -1;
      live.setAttribute('viewBox', '0 0 ' + d.w + ' ' + d.h);
      live.classList.toggle('is-wide', G.wide);
      root.classList.toggle('ef--wide', G.wide);
      g.innerHTML = d.svg;
      title.textContent = efLabel({ chain: S.chain, mode: S.mode, v: S.v, unit: S.unit, shown: S.shown });
    }
    function sync() {
      $$('.ef-chains button', root).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-k') === S.chain ? 'true' : 'false'); });
      $$('.ef-modes button', root).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-k') === S.mode ? 'true' : 'false'); });
      $('.ef-vl', root).textContent = efInputLabel(S.chain, S.mode);
      var n = ord().length, done = S.v && S.shown >= n;
      stepB.disabled = !S.v || done || S.back >= 0;
      otherB.disabled = !done;
      err.textContent = S.v ? '' : 'Type a number greater than 0, such as 24' + EF_TS + '000 or 7.5.';
      inp.setAttribute('aria-invalid', S.v ? 'false' : 'true');
      var h = '';
      if (S.v) {
        var E = efLevels(S.chain, S.mode, S.v);
        ord().slice(0, S.shown).forEach(function (k) { h += line(k, E, false); });
        if (S.back >= 0) ord().slice().reverse().slice(1, S.back).forEach(function (k) { h += line(k, E, true); });
        if (S.back >= ord().length && S.backOk) h += '<li class="ef-ok">Back to ' + efFmt(S.v) + ' ' + S.unit + ' ✓ — the same as the start.</li>';
      }
      read.innerHTML = h;
      root.setAttribute('data-chain', S.chain); root.setAttribute('data-mode', S.mode); root.setAttribute('data-shown', String(S.shown));
      root.setAttribute('data-back', String(S.back)); root.setAttribute('data-ok', S.backOk ? '1' : '0');
      draw();
    }
    function reset(msg) { stop(); S.shown = 1; S.back = -1; S.backV = {}; S.backOk = false; say.textContent = msg || ''; sync(); }
    function startMsg() {
      if (!S.v) return '';
      var k = efGiven(S.mode, S.chain);
      return EF_CHAINS[S.chain].name + ', ' + EF_MODES.filter(function (m) { return m[0] === S.mode; })[0][1].toLowerCase() + '. ' + efName(S.chain, k) + ': ' + efFmt(S.v) + ' ' + S.unit + '.';
    }
    $$('.ef-chains button', root).forEach(function (b) {
      on(b, 'click', function () { var c = b.getAttribute('data-k'); if (c === S.chain) return; S.chain = c; reset(); say.textContent = startMsg(); });
    });
    $$('.ef-modes button', root).forEach(function (b) {
      on(b, 'click', function () { var m = b.getAttribute('data-k'); if (m === S.mode) return; S.mode = m; reset(); say.textContent = startMsg(); });
    });
    on(inp, 'input', function () {
      var v = efParse(inp.value);
      S.text = inp.value;
      if (v && S.v && efEq(v, S.v)) return;
      S.v = v; reset();
    });
    on(inp, 'keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (!stepB.disabled) stepB.click(); } });
    on(sel, 'change', function () { S.unit = sel.value; sync(); });
    on(stepB, 'click', function () {
      if (!S.v || S.back >= 0) return;
      var o = ord();
      if (S.shown >= o.length) return;
      S.shown += 1;
      var k = o[S.shown - 1], E = efLevels(S.chain, S.mode, S.v);
      say.textContent = efName(S.chain, k) + ': ' + efFmt(E[k]) + ' ' + S.unit;
      S.newest = k;
      sync();
      if (S.shown >= o.length) otherB.focus();
    });
    on(otherB, 'click', function () {
      if (otherB.disabled) return;
      stop();
      var r = ord().slice().reverse(), E = efLevels(S.chain, S.mode, S.v);
      S.backV = {}; S.backV[r[0]] = E[r[0]]; S.back = 1; S.backOk = false;
      for (var j = 1; j < r.length; j++) S.backV[r[j]] = efShift(S.backV[r[j - 1]], efPow(r[j - 1], r[j]));
      function next() {
        S.back += 1;
        var k = r[S.back - 1];
        if (S.back >= r.length) {
          S.backOk = efEq(S.backV[k], S.v);
          say.textContent = 'Back to ' + efFmt(S.backV[k]) + ' ' + S.unit + (S.backOk ? ' ✓ — the same as the start.' : ' — not the same as the start.');
          sync();
          return;
        }
        say.textContent = efName(S.chain, k) + ': ' + efFmt(S.backV[k]) + ' ' + S.unit;
        sync();
        S.timers.push(setTimeout(next, 700));
      }
      say.textContent = 'Working back from ' + efName(S.chain, r[0]).toLowerCase() + ': ' + efFmt(E[r[0]]) + ' ' + S.unit;
      sync();
      stop();
      if (rm()) { S.back = r.length - 1; next(); }
      else S.timers.push(setTimeout(next, 700));
    });
    var lastG = '';
    function onResize() { var G = geo(), k = G.W + (G.wide ? 'w' : 'n'); if (k === lastG) return; lastG = k; draw(); }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(box);
    on(window, 'resize', onResize);
    sync();
    lastG = geo().W + (geo().wide ? 'w' : 'n');
  }
  /*END-EF*/

  /* ---------------------------------------------------- grouped-data explorer (Maths Ch 13, T02-V5; initGd)
     svg[data-gd] is the static first view and the no-JS view (content/C10-MATH-CH13/diagrams/_src/st13b.py v5: .gd-v1 Topic 2,
     .gd-v2 Topic 3, .gd-v4 Topic 4, .gd-v5 Topic 5; site.css shows the page's own). initGd replaces it with an editable
     table of 3 to 7 equal classes: first lower limit (0 … 1000), class size h (1 … 500), each frequency (whole numbers
     0 … 99; ↑ ↓ change it by 1), the assumed mean a (any class mark; the middle one by default). The explorer fills x,
     f × x, u = (x − a) ÷ h, f × u and cf with a Total row, and three panels: the mean by the direct and the step-deviation
     methods (always equal), the mode (modal class tinted and named) and the median (median class tinted and named), each
     with its formula filled in. Exact arithmetic: every value is a fraction [n, d]; shown to 2 decimals half up, or
     exactly when it ends sooner. Refusals: two or more classes share the largest f; the modal class is the first or the
     last class; all frequencies 0. The page picks the starting table: Topic 2 (block id …-T02.) worked example 1, Topic 3
     the wages table (a = 4250), Topic 4 the waiting times, Topic 5 the data table. Under 600 px the panels stack under the
     table, which scrolls sideways (.table-wrap, with the cue). A polite live region repeats the three values after each
     change. Nothing is stored. */
  /*GD-TEX*/var GD_TEX = {"mean":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mover accent=\"true\"><mi>x</mi><mo>ˉ</mo></mover><mo>=</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mrow><mi mathvariant=\"normal\">Σ</mi><msub><mi>f</mi><mi>i</mi></msub><msub><mi>x</mi><mi>i</mi></msub></mrow><mrow><mi mathvariant=\"normal\">Σ</mi><msub><mi>f</mi><mi>i</mi></msub></mrow></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\bar{x} = \\dfrac{\\Sigma f_i x_i}{\\Sigma f_i}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.5678em;\"></span><span class=\"mord accent\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.5678em;\"><span style=\"top:-3em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord mathnormal\">x</span></span><span style=\"top:-3em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"accent-body\" style=\"left:-0.2222em;\"><span class=\"mord\">ˉ</span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.2519em;vertical-align:-0.8804em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3714em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">Σ</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.10764em;\">f</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3117em;\"><span style=\"top:-2.55em;margin-left:-0.1076em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mathnormal mtight\">i</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">Σ</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.10764em;\">f</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3117em;\"><span style=\"top:-2.55em;margin-left:-0.1076em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mathnormal mtight\">i</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mord\"><span class=\"mord mathnormal\">x</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3117em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mathnormal mtight\">i</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8804em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","step":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mover accent=\"true\"><mi>x</mi><mo>ˉ</mo></mover><mo>=</mo><mi>a</mi><mo>+</mo><mi>h</mi><mo>×</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mrow><mi mathvariant=\"normal\">Σ</mi><msub><mi>f</mi><mi>i</mi></msub><msub><mi>u</mi><mi>i</mi></msub></mrow><mrow><mi mathvariant=\"normal\">Σ</mi><msub><mi>f</mi><mi>i</mi></msub></mrow></mfrac></mstyle></mrow><annotation encoding=\"application/x-tex\">\\bar{x} = a + h \\times \\dfrac{\\Sigma f_i u_i}{\\Sigma f_i}</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.5678em;\"></span><span class=\"mord accent\"><span class=\"vlist-t\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.5678em;\"><span style=\"top:-3em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord mathnormal\">x</span></span><span style=\"top:-3em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"accent-body\" style=\"left:-0.2222em;\"><span class=\"mord\">ˉ</span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6667em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\">a</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.7778em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\">h</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">×</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.2519em;vertical-align:-0.8804em;\"></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3714em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">Σ</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.10764em;\">f</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3117em;\"><span style=\"top:-2.55em;margin-left:-0.1076em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mathnormal mtight\">i</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">Σ</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.10764em;\">f</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3117em;\"><span style=\"top:-2.55em;margin-left:-0.1076em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mathnormal mtight\">i</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mord\"><span class=\"mord mathnormal\">u</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3117em;\"><span style=\"top:-2.55em;margin-left:0em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mathnormal mtight\">i</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8804em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span></span></span></span>","mode":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mtext>Mode</mtext><mo>=</mo><mi>l</mi><mo>+</mo><mrow><mo fence=\"true\">(</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mrow><msub><mi>f</mi><mn>1</mn></msub><mo>−</mo><msub><mi>f</mi><mn>0</mn></msub></mrow><mrow><mn>2</mn><msub><mi>f</mi><mn>1</mn></msub><mo>−</mo><msub><mi>f</mi><mn>0</mn></msub><mo>−</mo><msub><mi>f</mi><mn>2</mn></msub></mrow></mfrac></mstyle><mo fence=\"true\">)</mo></mrow><mo>×</mo><mi>h</mi></mrow><annotation encoding=\"application/x-tex\">\\text{Mode} = l + \\left(\\dfrac{f_1 - f_0}{2f_1 - f_0 - f_2}\\right) \\times h</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6944em;\"></span><span class=\"mord text\"><span class=\"mord\">Mode</span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.7778em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.01968em;\">l</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.4em;vertical-align:-0.95em;\"></span><span class=\"minner\"><span class=\"mopen delimcenter\" style=\"top:0em;\"><span class=\"delimsizing size3\">(</span></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.3714em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\">2</span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.10764em;\">f</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.1076em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.10764em;\">f</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.1076em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">0</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.10764em;\">f</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.1076em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">2</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.677em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.10764em;\">f</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.1076em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">1</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.10764em;\">f</span><span class=\"msupsub\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.3011em;\"><span style=\"top:-2.55em;margin-left:-0.1076em;margin-right:0.05em;\"><span class=\"pstrut\" style=\"height:2.7em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\">0</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.15em;\"><span></span></span></span></span></span></span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8804em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mclose delimcenter\" style=\"top:0em;\"><span class=\"delimsizing size3\">)</span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">×</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6944em;\"></span><span class=\"mord mathnormal\">h</span></span></span></span>","median":"<span class=\"katex\"><span class=\"katex-mathml\"><math xmlns=\"http://www.w3.org/1998/Math/MathML\"><semantics><mrow><mtext>Median</mtext><mo>=</mo><mi>l</mi><mo>+</mo><mrow><mo fence=\"true\">(</mo><mstyle displaystyle=\"true\" scriptlevel=\"0\"><mfrac><mrow><mfrac><mi>n</mi><mn>2</mn></mfrac><mo>−</mo><mi>c</mi><mi>f</mi></mrow><mi>f</mi></mfrac></mstyle><mo fence=\"true\">)</mo></mrow><mo>×</mo><mi>h</mi></mrow><annotation encoding=\"application/x-tex\">\\text{Median} = l + \\left(\\dfrac{\\frac{n}{2} - cf}{f}\\right) \\times h</annotation></semantics></math></span><span class=\"katex-html\" aria-hidden=\"true\"><span class=\"base\"><span class=\"strut\" style=\"height:0.6944em;\"></span><span class=\"mord text\"><span class=\"mord\">Median</span></span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span><span class=\"mrel\">=</span><span class=\"mspace\" style=\"margin-right:0.2778em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.7778em;vertical-align:-0.0833em;\"></span><span class=\"mord mathnormal\" style=\"margin-right:0.01968em;\">l</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">+</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:2.4em;vertical-align:-0.95em;\"></span><span class=\"minner\"><span class=\"mopen delimcenter\" style=\"top:0em;\"><span class=\"delimsizing size3\">(</span></span><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:1.4304em;\"><span style=\"top:-2.314em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord mathnormal\" style=\"margin-right:0.10764em;\">f</span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.735em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"mord\"><span class=\"mord\"><span class=\"mopen nulldelimiter\"></span><span class=\"mfrac\"><span class=\"vlist-t vlist-t2\"><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.6954em;\"><span style=\"top:-2.655em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\"><span class=\"mord mtight\">2</span></span></span></span><span style=\"top:-3.23em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"frac-line\" style=\"border-bottom-width:0.04em;\"></span></span><span style=\"top:-3.394em;\"><span class=\"pstrut\" style=\"height:3em;\"></span><span class=\"sizing reset-size6 size3 mtight\"><span class=\"mord mtight\"><span class=\"mord mathnormal mtight\">n</span></span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.345em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">−</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mord mathnormal\">c</span><span class=\"mord mathnormal\" style=\"margin-right:0.10764em;\">f</span></span></span></span><span class=\"vlist-s\">​</span></span><span class=\"vlist-r\"><span class=\"vlist\" style=\"height:0.8804em;\"><span></span></span></span></span></span><span class=\"mclose nulldelimiter\"></span></span><span class=\"mclose delimcenter\" style=\"top:0em;\"><span class=\"delimsizing size3\">)</span></span></span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span><span class=\"mbin\">×</span><span class=\"mspace\" style=\"margin-right:0.2222em;\"></span></span><span class=\"base\"><span class=\"strut\" style=\"height:0.6944em;\"></span><span class=\"mord mathnormal\">h</span></span></span></span>"};/*END-GD-TEX*/
  var GD_START = {
    T02: { L: 0, h: 20, f: [4, 9, 15, 8, 4], t: 'Topic 2, Worked example 1: homework time (minutes)' },
    T03: { L: 3000, h: 500, f: [6, 11, 17, 10, 6], t: 'Topic 3, Worked example 1: weekly wages (₹)' },
    T04: { L: 0, h: 5, f: [6, 11, 18, 13, 7, 5], t: 'Topic 4, Worked example 1: waiting time (minutes)' },
    T05: { L: 0, h: 5, f: [5, 8, 16, 11, 4, 6], t: 'Topic 5, Worked example 1: mobile data (GB)' }
  };
  var GD_MSG = {
    two: 'Two classes share the largest frequency — this table has no single modal class, and the mode formula cannot be used.',
    end: 'The modal class needs a class on each side for this formula — the chapter’s questions always have one.',
    zero: 'Enter some frequencies'
  };
  function gdG(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function gdQ(n, d) { if (d === undefined) d = 1; if (d < 0) { n = -n; d = -d; } var g = gdG(n, d) || 1; return [n / g, d / g]; }
  function gdAdd(p, q) { return gdQ(p[0] * q[1] + q[0] * p[1], p[1] * q[1]); }
  function gdSub(p, q) { return gdQ(p[0] * q[1] - q[0] * p[1], p[1] * q[1]); }
  function gdMul(p, q) { return gdQ(p[0] * q[0], p[1] * q[1]); }
  function gdDiv(p, q) { return gdQ(p[0] * q[1], p[1] * q[0]); }
  function gdTxt(p) {                      /* exact: "12.5", "−3", "4240"; only for values that end within 2 places */
    var n = p[0], d = p[1], neg = n < 0; n = Math.abs(n);
    if (d === 1) return (neg ? '−' : '') + n;
    var k = d === 2 || d === 5 || d === 10 ? 1 : 2, m = Math.round(n * Math.pow(10, k) / d), s = String(m);
    while (s.length <= k) s = '0' + s;
    s = s.slice(0, s.length - k) + '.' + s.slice(s.length - k);
    s = s.replace(/0+$/, '').replace(/\.$/, '');
    return (neg ? '−' : '') + s;
  }
  function gdEnds(p) { return (p[0] * 100) % p[1] === 0; }
  function gdR2(p) {                       /* {s: '=' | '≈', v: '49.33'} — exact when it ends within 2 places */
    if (gdEnds(p)) return { s: '=', v: gdTxt(p) };
    var n = p[0], d = p[1], neg = n < 0; n = Math.abs(n);
    var h = Math.floor((200 * n + d) / (2 * d));
    return { s: '≈', v: (neg ? '−' : '') + Math.floor(h / 100) + '.' + (h % 100 < 10 ? '0' : '') + (h % 100) };
  }
  function gdNum(p) { return gdEnds(p) ? gdTxt(p) : gdR2(p).v; }
  function gdModel(L, h, fs, ai) {
    var k = fs.length, M = { k: k, L: L, h: h, f: fs.slice(), lo: [], hi: [], x: [], fx: [], u: [], fu: [], cf: [] };
    var n = 0, sfx = [0, 1], sfu = 0;
    if (ai === null || ai === undefined || ai >= k) ai = Math.floor((k - 1) / 2);
    M.ai = ai;
    for (var i = 0; i < k; i++) {
      M.lo.push(L + i * h); M.hi.push(L + (i + 1) * h);
      M.x.push(gdQ(2 * L + (2 * i + 1) * h, 2));
    }
    M.a = M.x[ai];
    for (i = 0; i < k; i++) {
      var f = fs[i]; n += f;
      M.fx.push(gdMul([f, 1], M.x[i])); sfx = gdAdd(sfx, M.fx[i]);
      M.u.push(i - ai); M.fu.push(f * (i - ai)); sfu += f * (i - ai);
      M.cf.push(n);
    }
    M.n = n; M.sfx = sfx; M.sfu = sfu;
    if (!n) { M.zero = true; return M; }
    M.mean = gdDiv(sfx, [n, 1]);
    M.meanStep = gdAdd(M.a, gdMul([h, 1], gdQ(sfu, n)));
    /* median: the first class whose cf is greater than n ÷ 2 */
    var half = gdQ(n, 2), m = 0;
    while (M.cf[m] * 2 <= n) m++;
    M.mi = m; M.cfb = m ? M.cf[m - 1] : 0; M.half = half;
    M.median = gdAdd([M.lo[m], 1], gdMul(gdDiv(gdSub(half, [M.cfb, 1]), [fs[m], 1]), [h, 1]));
    /* mode */
    var mx = Math.max.apply(null, fs), ks = [];
    fs.forEach(function (f, j) { if (f === mx) ks.push(j); });
    if (ks.length > 1) M.modeWhy = 'two';
    else if (ks[0] === 0 || ks[0] === k - 1) { M.modeWhy = 'end'; M.oi = ks[0]; }
    else {
      var o = ks[0], f1 = fs[o], f0 = fs[o - 1], f2 = fs[o + 1];
      M.oi = o; M.f1 = f1; M.f0 = f0; M.f2 = f2;
      M.mode = gdAdd([M.lo[o], 1], gdMul(gdQ(f1 - f0, 2 * f1 - f0 - f2), [h, 1]));
    }
    return M;
  }
  function initGd() {
    $$('svg[data-gd="explorer"]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-gd-on')) return;
      art.setAttribute('data-gd-on', '1');
      var fig = svg.closest('.fig'), id = fig ? fig.getAttribute('data-block-id') || '' : '';
      var m = /-(T0[2345])\./.exec(id), key = m ? m[1] : 'T02';
      if (fig) fig.classList.add('fig--gd');
      gdBuild(art, GD_START[key] || GD_START.T02);
    });
  }
  function gdBuild(art, S0) {
    var uid = 'gd' + Math.random().toString(36).slice(2, 7);
    var S = { L: S0.L, h: S0.h, f: S0.f.slice(), ai: null };
    var root = document.createElement('div');
    root.className = 'se gd';
    function mx(h) { return '<span class="mx">' + h + '</span>'; }
    function fr(n, d) { return '<span class="se-fr"><span class="se-fn">' + n + '</span><span class="se-sr"> over </span><span class="se-fd">' + d + '</span></span>'; }
    root.innerHTML =
      '<p class="gd-src">' + S0.t + '</p>' +
      '<div class="gd-ctls">' +
      '<div class="gd-ctl"><label class="se-lbl" for="' + uid + '-L">First lower limit</label>' +
      '<input class="gd-num gd-L" id="' + uid + '-L" type="number" inputmode="numeric" min="0" max="1000" step="1" value="' + S.L + '"></div>' +
      '<div class="gd-ctl"><label class="se-lbl" for="' + uid + '-h">Class size ' + mx('<i>h</i>') + '</label>' +
      '<input class="gd-num gd-h" id="' + uid + '-h" type="number" inputmode="numeric" min="1" max="500" step="1" value="' + S.h + '"></div>' +
      '<div class="gd-ctl"><span class="se-lbl" id="' + uid + '-kl">Classes</span><div class="gd-kbtns" role="group" aria-labelledby="' + uid + '-kl">' +
      '<button type="button" class="gd-less" aria-label="Remove the last class">−</button><output class="gd-k" aria-live="off"></output>' +
      '<button type="button" class="gd-more" aria-label="Add a class">+</button></div></div>' +
      '<div class="gd-ctl"><label class="se-lbl" for="' + uid + '-a">Assumed mean ' + mx('<i>a</i>') + '</label><select class="gd-a" id="' + uid + '-a"></select></div>' +
      '</div>' +
      '<p class="se-hint gd-hint">Type a frequency in the ' + mx('<i>f</i>') + ' column, or use ↑ ↓ to change it by 1. Tab moves between the boxes.</p>' +
      '<p class="se-note gd-err" hidden></p>' +
      '<div class="table-wrap gd-tw" role="region" aria-label="Grouped frequency table" tabindex="0"><table class="gd-table">' +
      '<thead><tr><th scope="col">Class</th><th scope="col">' + mx('<i>f</i>') + '</th><th scope="col">' + mx('<i>x</i>') + '</th>' +
      '<th scope="col">' + mx('<i>f</i> × <i>x</i>') + '</th><th scope="col">' + mx('<i>u</i> = (<i>x</i> − <i>a</i>) ÷ <i>h</i>') + '</th>' +
      '<th scope="col">' + mx('<i>f</i> × <i>u</i>') + '</th><th scope="col">' + mx('<i>cf</i>') + '</th></tr></thead><tbody></tbody>' +
      '<tfoot><tr><th scope="row">Total</th><td class="gd-sf"></td><td></td><td class="gd-sfx"></td><td></td><td class="gd-sfu"></td><td></td></tr></tfoot></table></div>' +
      '<div class="gd-panels">' +
      '<section class="gd-p gd-p-mean" aria-label="Mean"><h4 class="gd-ph">Mean</h4><div class="gd-pb"></div></section>' +
      '<section class="gd-p gd-p-mode" aria-label="Mode"><h4 class="gd-ph"><span class="gd-sw gd-sw-mode" aria-hidden="true"></span>Mode</h4><div class="gd-pb"></div></section>' +
      '<section class="gd-p gd-p-med" aria-label="Median"><h4 class="gd-ph"><span class="gd-sw gd-sw-med" aria-hidden="true"></span>Median</h4><div class="gd-pb"></div></section>' +
      '</div>' +
      '<p class="se-sr gd-live" aria-live="polite"></p>';
    art.innerHTML = '';
    art.appendChild(root);
    var inL = $('.gd-L', root), inH = $('.gd-h', root), selA = $('.gd-a', root), tb = $('tbody', root), err = $('.gd-err', root);
    var bLess = $('.gd-less', root), bMore = $('.gd-more', root), live = $('.gd-live', root);
    function cls(M, i) { return M.lo[i] + ' – ' + M.hi[i]; }
    function rows() {                         /* (re)build the body rows: one frequency box per class */
      var h = '';
      for (var i = 0; i < S.f.length; i++) {
        h += '<tr data-i="' + i + '"><th scope="row"><span class="gd-cls"></span><span class="gd-tag"></span></th>' +
          '<td><input class="gd-f" type="number" inputmode="numeric" min="0" max="99" step="1" data-i="' + i + '" value="' + S.f[i] + '"></td>' +
          '<td class="gd-x"></td><td class="gd-fx"></td><td class="gd-u"></td><td class="gd-fu"></td><td class="gd-cf"></td></tr>';
      }
      tb.innerHTML = h;
      $$('.gd-f', tb).forEach(function (inp) { wire(inp, 0, 99, function (v) { S.f[+inp.getAttribute('data-i')] = v; }); });
    }
    function opts(M) {
      selA.innerHTML = M.x.map(function (x, i) { return '<option value="' + i + '"' + (i === M.ai ? ' selected' : '') + '>' + gdTxt(x) + '</option>'; }).join('');
    }
    function setErr(msg) { err.textContent = msg || ''; show(err, !!msg); }
    /* a number box: typing updates at once when the value is valid; ↑ ↓ ±1 within the range; leaving the box puts a
       valid number back (empty -> the smallest allowed, out of range -> the nearest end) */
    function wire(inp, lo, hi, set) {
      function valid(s) { return /^\d+$/.test(s) && +s >= lo && +s <= hi; }
      on(inp, 'input', function () {
        var s = inp.value.trim();
        if (valid(s)) { inp.removeAttribute('aria-invalid'); setErr(''); set(+s); update(); }
        else { inp.setAttribute('aria-invalid', 'true'); setErr('Enter a whole number from ' + lo + ' to ' + hi + '.'); }
      });
      on(inp, 'change', function () {
        var s = inp.value.trim(), v = /^-?\d+(\.\d*)?$/.test(s) ? Math.floor(+s) : lo;
        v = Math.max(lo, Math.min(hi, v));
        inp.value = String(v); inp.removeAttribute('aria-invalid'); setErr(''); set(v); update();
      });
      on(inp, 'keydown', function (ev) {
        if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
        ev.preventDefault();
        var cur = /^\d+$/.test(inp.value.trim()) ? +inp.value : lo;
        var v = Math.max(lo, Math.min(hi, cur + (ev.key === 'ArrowUp' ? 1 : -1)));
        inp.value = String(v); inp.removeAttribute('aria-invalid'); setErr(''); set(v); update();
      });
    }
    wire(inL, 0, 1000, function (v) { S.L = v; });
    wire(inH, 1, 500, function (v) { S.h = v; });
    on(selA, 'change', function () { S.ai = +selA.value; update(); });
    on(bMore, 'click', function () { if (S.f.length < 7) { S.f.push(0); S.ai = null; rows(); update(true); var b = $$('.gd-f', tb); b[b.length - 1].focus(); } });
    on(bLess, 'click', function () { if (S.f.length > 3) { S.f.pop(); S.ai = null; rows(); update(true); } });
    function panels(M) {
      var pm = $('.gd-p-mean .gd-pb', root), po = $('.gd-p-mode .gd-pb', root), pd = $('.gd-p-med .gd-pb', root);
      if (M.zero) {
        [pm, po, pd].forEach(function (p) { p.innerHTML = '<p class="gd-msg">' + GD_MSG.zero + '</p>'; });
        return;
      }
      var r = gdR2(M.mean), rs = gdR2(M.meanStep), aT = gdTxt(M.a);
      pm.innerHTML =
        '<p class="gd-big">' + mx('<span class="gd-xbar"><i>x</i></span>') + ' <span class="gd-v" data-v="mean">' + r.s + ' ' + r.v + '</span></p>' +
        '<p class="gd-k2">Direct method</p><p class="gd-tex">' + (GD_TEX.mean || mx('Σfx ÷ Σf')) + '</p>' +
        '<p class="gd-l">' + mx('= ' + fr(gdTxt(M.sfx), M.n) + ' ' + r.s + ' ' + r.v) + '</p>' +
        '<p class="gd-k2">Step-deviation method (' + mx('<i>a</i> = ' + aT + ', <i>h</i> = ' + M.h) + ')</p><p class="gd-tex">' + (GD_TEX.step || mx('a + h × Σfu ÷ Σf')) + '</p>' +
        '<p class="gd-l">' + mx('= ' + aT + ' + ' + M.h + ' × ' + (M.sfu < 0 ? '(−' + fr(-M.sfu, M.n) + ')' : fr(M.sfu, M.n)) + ' ' + rs.s + ' ' + rs.v) + '</p>' +
        '<p class="gd-same">Both methods give the same mean.</p>';
      if (M.modeWhy) {
        po.innerHTML = (M.modeWhy === 'end' ? '<p class="gd-k2">Modal class: ' + cls(M, M.oi) + ' (the largest ' + mx('<i>f</i>') + ', ' + M.f[M.oi] + ')</p>' : '') +
          '<p class="gd-msg gd-refuse">' + GD_MSG[M.modeWhy] + '</p>';
      } else {
        var o = M.oi, ro = gdR2(M.mode), l = M.lo[o];
        po.innerHTML =
          '<p class="gd-big">Mode <span class="gd-v" data-v="mode">' + ro.s + ' ' + ro.v + '</span></p>' +
          '<p class="gd-k2">Modal class: <b>' + cls(M, o) + '</b> (the largest ' + mx('<i>f</i>') + ')</p>' +
          '<p class="gd-list">' + mx('<i>l</i> = ' + l + ', <i>h</i> = ' + M.h + ', <i>f</i><sub>1</sub> = ' + M.f1 + ', <i>f</i><sub>0</sub> = ' + M.f0 + ', <i>f</i><sub>2</sub> = ' + M.f2) + '</p>' +
          '<p class="gd-tex">' + (GD_TEX.mode || '') + '</p>' +
          '<p class="gd-l">' + mx('= ' + l + ' + ' + fr(M.f1 + ' − ' + M.f0, '2 × ' + M.f1 + ' − ' + M.f0 + ' − ' + M.f2) + ' × ' + M.h + ' ' + ro.s + ' ' + ro.v) + '</p>';
      }
      var m = M.mi, rd = gdR2(M.median);
      pd.innerHTML =
        '<p class="gd-big">Median <span class="gd-v" data-v="median">' + rd.s + ' ' + rd.v + '</span></p>' +
        '<p class="gd-k2">' + mx('<i>n</i> = ' + M.n + ', <i>n</i> ÷ 2 = ' + gdTxt(M.half)) + '; median class: <b>' + cls(M, m) + '</b> (the first ' + mx('<i>cf</i>') + ' greater than ' + mx('<i>n</i> ÷ 2') + ')</p>' +
        '<p class="gd-list">' + mx('<i>l</i> = ' + M.lo[m] + ', <i>cf</i> = ' + M.cfb + ', <i>f</i> = ' + M.f[m] + ', <i>h</i> = ' + M.h) + '</p>' +
        '<p class="gd-tex">' + (GD_TEX.median || '') + '</p>' +
        '<p class="gd-l">' + mx('= ' + M.lo[m] + ' + ' + fr(gdTxt(M.half) + ' − ' + M.cfb, M.f[m]) + ' × ' + M.h + ' ' + rd.s + ' ' + rd.v) + '</p>';
    }
    function say(M) {
      if (M.zero) return GD_MSG.zero + '.';
      function w(p) { var r = gdR2(p); return (r.s === '≈' ? 'about ' : '') + r.v.replace('−', 'minus '); }
      return 'Mean ' + w(M.mean) + '. Median ' + w(M.median) + '. ' + (M.mode ? 'Mode ' + w(M.mode) + '.' : M.modeWhy === 'two' ? 'Mode: no single modal class.' : 'Mode: the modal class is at an end of the table.');
    }
    var liveT = null;
    function update(now) {
      var M = gdModel(S.L, S.h, S.f, S.ai);
      S.ai = M.ai;
      opts(M);
      $('.gd-k', root).textContent = String(M.k);
      bLess.disabled = M.k <= 3; bMore.disabled = M.k >= 7;
      $$('tr[data-i]', tb).forEach(function (tr, i) {
        $('.gd-cls', tr).textContent = cls(M, i);
        var inp = $('.gd-f', tr);
        inp.setAttribute('aria-label', 'Frequency of the class ' + M.lo[i] + ' to ' + M.hi[i]);
        if (document.activeElement !== inp && inp.value !== String(S.f[i])) inp.value = String(S.f[i]);
        $('.gd-x', tr).textContent = gdTxt(M.x[i]);
        $('.gd-fx', tr).textContent = gdTxt(M.fx[i]);
        $('.gd-u', tr).textContent = gdTxt([M.u[i], 1]);
        $('.gd-fu', tr).textContent = gdTxt([M.fu[i], 1]);
        $('.gd-cf', tr).textContent = String(M.cf[i]);
        var isMo = !M.zero && M.mode && M.oi === i, isMe = !M.zero && M.mi === i;
        tr.classList.toggle('is-modal', !!isMo); tr.classList.toggle('is-median', !!isMe);
        $('.gd-tag', tr).innerHTML = (isMo ? '<b class="gd-t gd-t-mode">modal class</b>' : '') + (isMe ? '<b class="gd-t gd-t-med">median class</b>' : '');
      });
      $('.gd-sf', root).textContent = String(M.n);
      $('.gd-sfx', root).textContent = gdTxt(M.sfx);
      $('.gd-sfu', root).textContent = gdTxt([M.sfu, 1]);
      panels(M);
      root.setAttribute('data-n', String(M.n)); root.setAttribute('data-sfx', gdTxt(M.sfx)); root.setAttribute('data-sfu', gdTxt([M.sfu, 1]));
      root.setAttribute('data-a', gdTxt(M.a)); root.setAttribute('data-cf', M.cf.join(','));
      root.setAttribute('data-mean', M.zero ? '' : gdR2(M.mean).v); root.setAttribute('data-mean-step', M.zero ? '' : gdR2(M.meanStep).v);
      root.setAttribute('data-median', M.zero ? '' : gdR2(M.median).v); root.setAttribute('data-mode', M.mode ? gdR2(M.mode).v : '');
      root.setAttribute('data-mode-why', M.modeWhy || ''); root.setAttribute('data-modal', M.mode ? cls(M, M.oi) : '');
      root.setAttribute('data-median-class', M.zero ? '' : cls(M, M.mi));
      var msg = say(M);
      if (liveT) clearTimeout(liveT);
      if (now !== 'init') liveT = setTimeout(function () { live.textContent = msg; }, now ? 0 : 450);
      if (typeof tcUpdate === 'function') tcUpdate($('.gd-tw', root));
    }
    function fit() { root.classList.toggle('is-wide', root.clientWidth >= 600); }
    if (window.ResizeObserver) new ResizeObserver(fit).observe(root); else on(window, 'resize', fit);
    rows();
    update('init');
    fit();
    initTableCue(root);
  }
  /*END-GD*/

  /* ---------------------------------------------------- sample-space explorer (Maths Ch 14, T05-V10; initSs)
     svg[data-ss] is the static first view (content/C10-MATH-CH14/diagrams/_src/p14b.py v10); initSs() replaces it with the
     explorer. Seven experiments (one / two / three coins, one die, two dice, a spinner with 2–12 equal sectors, numbered
     cards 1 to N with N 2–100). Tiles are buttons (aria-pressed): tap to mark favourable, or pick a rule (quantity +
     condition + k, optionally "or" a second condition). The panel shows favourable = f, all = n, P(E) = f/n in lowest
     terms, P(not E) = (n − f)/n and P(E) + P(not E) = 1; f = 0 and f = n get the brief's messages. The figure's
     data-block-id picks the start (Topic 3: spinner 10, at least 7; Topic 5: two dice, sum a multiple of 3). A polite
     live region says "f favourable out of n; probability f over n". Under 600 px the panel sits under the tiles. Nothing
     is stored. Source: content/C10-MATH-CH14/diagrams/_src/ss_core.js (written in by ss_js.py). */
  var SS_EXP = [
    ['coin1', 'One coin'], ['coin2', 'Two coins'], ['coin3', 'Three coins'], ['die', 'One die'], ['dice2', 'Two dice'],
    ['spin', 'Spinner'], ['cards', 'Numbered cards']
  ];
  var SS_COND = {
    eq: '=', ge: 'at least', le: 'at most', lt: 'less than', gt: 'more than', mul: 'is a multiple of', prime: 'is prime',
    sq: 'is a perfect square', cube: 'is a perfect cube', odd: 'is odd', even: 'is even'
  };
  var SS_NEEDK = { eq: 1, ge: 1, le: 1, lt: 1, gt: 1, mul: 1 };
  var SS_START = {
    T03: { exp: 'spin', k: 10, N: 20, show: 'sum', q: 'n', c1: 'ge', k1: 7, src: 'Topic 3, Worked example 4: a spinner with 10 equal sectors' },
    T05: { exp: 'dice2', k: 10, N: 20, show: 'sum', q: 'sum', c1: 'mul', k1: 3, src: 'Topic 5, Worked example 3: two dice' }
  };
  function ssPrime(n) { if (n < 2) return false; for (var p = 2; p * p <= n; p++) if (n % p === 0) return false; return true; }
  function ssSq(n) { if (n < 0) return false; var r = Math.round(Math.sqrt(n)); return r * r === n; }
  function ssCube(n) { if (n < 0) return false; var r = Math.round(Math.cbrt(n)); return r * r * r === n; }
  function ssTest(c, v, k) {
    switch (c) {
      case 'eq': return v === k; case 'ge': return v >= k; case 'le': return v <= k; case 'lt': return v < k; case 'gt': return v > k;
      case 'mul': return k > 0 && v % k === 0; case 'prime': return ssPrime(v); case 'sq': return ssSq(v); case 'cube': return ssCube(v);
      case 'odd': return v % 2 === 1; case 'even': return v % 2 === 0;
    }
    return false;
  }
  function ssQs(exp) {                       /* the quantities a rule can be about */
    if (exp === 'dice2') return [['sum', 'the sum'], ['prod', 'the product'], ['diff', 'the difference (larger − smaller)']];
    if (exp.indexOf('coin') === 0) return [['h', 'the number of heads']];
    return [['n', 'the number']];
  }
  function ssConds(exp) {
    if (exp.indexOf('coin') === 0) return ['eq', 'ge', 'le', 'lt', 'gt'];
    if (exp === 'dice2') return ['eq', 'ge', 'le', 'lt', 'gt', 'mul', 'prime', 'sq', 'odd', 'even'];
    return ['eq', 'ge', 'le', 'lt', 'gt', 'mul', 'prime', 'sq', 'cube', 'odd', 'even'];
  }
  function ssOutcomes(S) {
    var out = [], i, a, b;
    if (S.exp.indexOf('coin') === 0) {
      var m = +S.exp.charAt(4), tot = 1 << m;
      for (i = 0; i < tot; i++) {
        var s = '';
        for (b = m - 1; b >= 0; b--) s += (i >> b) & 1 ? 'T' : 'H';
        var h = s.split('H').length - 1;
        out.push({ id: s, t: s, v: { h: h }, say: s.split('').join(' ') + ', ' + h + (h === 1 ? ' head' : ' heads') });
      }
    } else if (S.exp === 'dice2') {
      for (a = 1; a <= 6; a++) for (b = 1; b <= 6; b++)
        out.push({ id: a + '-' + b, a: a, b: b, v: { sum: a + b, prod: a * b, diff: Math.abs(a - b) },
                   say: 'first die ' + a + ', second die ' + b });
    } else {
      var hi = S.exp === 'die' ? 6 : S.exp === 'spin' ? S.k : S.N;
      for (i = 1; i <= hi; i++) out.push({ id: String(i), t: String(i), v: { n: i }, say: (S.exp === 'die' ? 'face ' : S.exp === 'spin' ? 'sector ' : 'card ') + i });
    }
    return out;
  }
  function ssLow(f, n) { var g = mGcd(f, n) || 1; return [f / g, n / g]; }
  function ssFr(p, q) {
    return '<span class="se-fr"><span class="se-fn">' + p + '</span><span class="se-sr"> over </span><span class="se-fd">' + q + '</span></span>';
  }
  function ssVal(p, q) { return q === 1 ? String(p) : ssFr(p, q); }
  function initSs() {
    $$('svg[data-ss="explorer"]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-ss-on')) return;
      art.setAttribute('data-ss-on', '1');
      var fig = svg.closest('.fig'), id = fig ? fig.getAttribute('data-block-id') || '' : '';
      var m = /-(T0[35])\./.exec(id), key = m ? m[1] : 'T05';
      if (fig) fig.classList.add('fig--ss');
      ssBuild(art, SS_START[key] || SS_START.T05);
    });
  }
  function ssBuild(art, S0) {
    var uid = 'ss' + Math.random().toString(36).slice(2, 7);
    var S = { exp: S0.exp, k: S0.k, N: S0.N, show: S0.show, q: S0.q, c1: S0.c1, k1: S0.k1, or: false, c2: 'prime', k2: 2, mode: 'rule', marks: {} };
    var root = document.createElement('div');
    root.className = 'se ss';
    var opts = SS_EXP.map(function (e) { return '<option value="' + e[0] + '">' + e[1] + '</option>'; }).join('');
    function mx(h) { return '<span class="mx">' + h + '</span>'; }
    var PE = mx('<i>P</i>(<i>E</i>)'), PN = mx('<i>P</i>(not <i>E</i>)');
    root.innerHTML =
      '<p class="ss-src">' + S0.src + '</p>' +
      '<div class="ss-ctls">' +
      '<div class="ss-ctl"><label class="se-lbl" for="' + uid + '-e">Experiment</label><select class="ss-sel ss-exp" id="' + uid + '-e">' + opts + '</select></div>' +
      '<div class="ss-ctl ss-c-k"><label class="se-lbl" for="' + uid + '-k">Sectors (2 to 12)</label>' +
      '<input class="ss-num ss-k" id="' + uid + '-k" type="number" inputmode="numeric" min="2" max="12" step="1"></div>' +
      '<div class="ss-ctl ss-c-n"><label class="se-lbl" for="' + uid + '-n">Cards 1 to <i>N</i> (<i>N</i> from 2 to 100)</label>' +
      '<input class="ss-num ss-n" id="' + uid + '-n" type="number" inputmode="numeric" min="2" max="100" step="1"></div>' +
      '<div class="ss-ctl ss-c-show"><span class="se-lbl" id="' + uid + '-sl">Show in each cell</span>' +
      '<div class="se-seg ss-show" role="group" aria-labelledby="' + uid + '-sl">' +
      '<button type="button" data-v="pair" aria-pressed="false">pair</button><button type="button" data-v="sum" aria-pressed="false">sum</button>' +
      '<button type="button" data-v="prod" aria-pressed="false">product</button><button type="button" data-v="diff" aria-pressed="false">difference</button></div></div>' +
      '</div>' +
      '<p class="se-note ss-err" role="alert" hidden></p>' +
      '<fieldset class="ss-rule"><legend class="se-lbl">Mark the favourable outcomes</legend>' +
      '<div class="ss-rrow">' +
      '<select class="ss-sel ss-q" aria-label="Quantity"></select>' +
      '<select class="ss-sel ss-c1" aria-label="Rule"></select>' +
      '<input class="ss-num ss-k1" type="number" inputmode="numeric" step="1" aria-label="The number k in the rule">' +
      '</div>' +
      '<div class="ss-rrow ss-orrow">' +
      '<button type="button" class="se-pi ss-or" aria-pressed="false">or another rule</button>' +
      '<select class="ss-sel ss-c2" aria-label="Second rule"></select>' +
      '<input class="ss-num ss-k2" type="number" inputmode="numeric" step="1" aria-label="The number k in the second rule">' +
      '</div>' +
      '<div class="ss-rrow"><button type="button" class="se-pi ss-clear">Clear all marks</button></div>' +
      '<p class="se-hint ss-hint">Or tap tiles to mark them yourself (Tab reaches every tile; Space or Enter marks it).</p>' +
      '</fieldset>' +
      '<div class="ss-main"><div class="ss-tw"><div class="ss-pie" aria-hidden="true"></div><div class="ss-tiles" role="group" aria-label="Outcomes"></div></div>' +
      '<div class="ss-panel"><p class="ss-l ss-count"></p><p class="ss-l ss-pe"></p><p class="ss-l ss-pn"></p><p class="ss-l ss-one"></p><p class="ss-l ss-msg" hidden></p></div></div>' +
      '<p class="se-sr ss-live" aria-live="polite"></p>';
    art.innerHTML = '';
    art.appendChild(root);
    var eSel = $('.ss-exp', root), kIn = $('.ss-k', root), nIn = $('.ss-n', root), err = $('.ss-err', root);
    var qSel = $('.ss-q', root), c1Sel = $('.ss-c1', root), k1In = $('.ss-k1', root), orB = $('.ss-or', root), c2Sel = $('.ss-c2', root), k2In = $('.ss-k2', root);
    var tiles = $('.ss-tiles', root), pie = $('.ss-pie', root), live = $('.ss-live', root), liveT = null;
    function fillQ() {
      qSel.innerHTML = ssQs(S.exp).map(function (q) { return '<option value="' + q[0] + '">' + q[1] + '</option>'; }).join('');
      if (!ssQs(S.exp).some(function (q) { return q[0] === S.q; })) S.q = ssQs(S.exp)[0][0];
      qSel.value = S.q;
      qSel.hidden = S.exp !== 'dice2';
      var cs = ssConds(S.exp);
      c1Sel.innerHTML = '<option value="tap">tap tiles (no rule)</option>' + cs.map(function (c) { return '<option value="' + c + '">' + SS_COND[c] + '</option>'; }).join('');
      c2Sel.innerHTML = cs.map(function (c) { return '<option value="' + c + '">' + SS_COND[c] + '</option>'; }).join('');
      if (cs.indexOf(S.c1) < 0 && S.c1 !== 'tap') S.c1 = 'eq';
      if (cs.indexOf(S.c2) < 0) S.c2 = 'eq';
      c1Sel.value = S.mode === 'tap' ? 'tap' : S.c1;
      c2Sel.value = S.c2;
    }
    function showErr(msg) { err.textContent = msg || ''; show(err, !!msg); }
    function ctls() {
      eSel.value = S.exp;
      show($('.ss-c-k', root), S.exp === 'spin'); show($('.ss-c-n', root), S.exp === 'cards'); show($('.ss-c-show', root), S.exp === 'dice2');
      if (document.activeElement !== kIn) kIn.value = String(S.k);
      if (document.activeElement !== nIn) nIn.value = String(S.N);
      $$('.ss-show button', root).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === S.show)); });
      var rule = S.mode === 'rule';
      c1Sel.value = rule ? S.c1 : 'tap';
      k1In.hidden = !rule || !SS_NEEDK[S.c1];
      orB.hidden = !rule; orB.setAttribute('aria-pressed', String(S.or));
      c2Sel.hidden = !rule || !S.or; k2In.hidden = !rule || !S.or || !SS_NEEDK[S.c2];
      if (document.activeElement !== k1In) k1In.value = String(S.k1);
      if (document.activeElement !== k2In) k2In.value = String(S.k2);
      root.setAttribute('data-mode', S.mode);
    }
    function kOk(c, k) { return !SS_NEEDK[c] || (Number.isInteger(k) && k >= (c === 'mul' ? 1 : 0) && k <= 144); }
    function fav(o) {
      if (S.mode === 'tap') return !!S.marks[o.id];
      var v = o.v[S.q];
      var r = ssTest(S.c1, v, S.k1);
      if (S.or) r = r || ssTest(S.c2, v, S.k2);
      return r;
    }
    function ruleText() {
      if (S.mode === 'tap') return 'tiles marked by tapping';
      var q = ssQs(S.exp).filter(function (x) { return x[0] === S.q; })[0][1];
      function one(c, k) { return SS_COND[c] + (SS_NEEDK[c] ? ' ' + k : ''); }
      return q + ' ' + one(S.c1, S.k1) + (S.or ? ' or ' + one(S.c2, S.k2) : '');
    }
    var OUT = [];
    function build() {
      OUT = ssOutcomes(S);
      var h = '';
      tiles.className = 'ss-tiles ss-t-' + (S.exp === 'dice2' ? 'grid' : S.exp.indexOf('coin') === 0 ? 'coin' : 'num');
      if (S.exp === 'dice2') {
        h += '<span class="ss-hd ss-corner" aria-hidden="true">' + ({ pair: '', sum: '+', prod: '×', diff: '−' }[S.show]) + '</span>';
        for (var b = 1; b <= 6; b++) h += '<span class="ss-hd" aria-hidden="true">' + b + '</span>';
      }
      OUT.forEach(function (o, i) {
        if (S.exp === 'dice2' && o.b === 1) h += '<span class="ss-hd" aria-hidden="true">' + o.a + '</span>';
        var inner = o.t;
        if (S.exp === 'dice2') {
          inner = S.show === 'pair' ? '<span class="ss-pr ss-pr-big">' + o.a + ', ' + o.b + '</span>'
            : '<span class="ss-pr">' + o.a + ' ' + o.b + '</span><span class="ss-v">' + o.v[S.show] + '</span>';
        }
        h += '<button type="button" class="ss-tile" data-i="' + i + '" aria-pressed="false">' + inner + '</button>';
      });
      tiles.innerHTML = h;
      root.setAttribute('data-exp', S.exp);
    }
    function drawPie(flags) {
      if (S.exp !== 'spin') { pie.innerHTML = ''; pie.hidden = true; return; }
      pie.hidden = false;
      var k = S.k, r = 70, c = 76, s = '<svg viewBox="0 0 152 152" width="152" height="152">';
      for (var i = 0; i < k; i++) {
        var a0 = (-90 + 360 * i / k) * Math.PI / 180, a1 = (-90 + 360 * (i + 1) / k) * Math.PI / 180, am = (a0 + a1) / 2;
        s += '<path d="M' + c + ',' + c + ' L' + (c + r * Math.cos(a0)).toFixed(2) + ',' + (c + r * Math.sin(a0)).toFixed(2) +
          ' A' + r + ',' + r + ' 0 0,1 ' + (c + r * Math.cos(a1)).toFixed(2) + ',' + (c + r * Math.sin(a1)).toFixed(2) + ' Z" class="' + (flags[i] ? 'ss-sec is-fav' : 'ss-sec') + '"/>';
        s += '<text x="' + (c + r * 0.7 * Math.cos(am)).toFixed(1) + '" y="' + (c + r * 0.7 * Math.sin(am) + 5).toFixed(1) + '" text-anchor="middle" class="ss-st">' + (i + 1) + '</text>';
      }
      s += '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" class="ss-rim"/></svg>';
      pie.innerHTML = s;
    }
    function update(now) {
      var flags = OUT.map(fav), f = flags.filter(Boolean).length, n = OUT.length;
      $$('.ss-tile', tiles).forEach(function (t, i) {
        t.setAttribute('aria-pressed', String(flags[i]));
        var o = OUT[i], extra = S.exp === 'dice2' && S.show !== 'pair' ? ', ' + { sum: 'sum ', prod: 'product ', diff: 'difference ' }[S.show] + o.v[S.show] : '';
        t.setAttribute('aria-label', o.say + extra + (flags[i] ? ', favourable' : ''));
      });
      drawPie(flags);
      var pe = ssLow(f, n), pn = ssLow(n - f, n);
      $('.ss-count', root).innerHTML = '<b>favourable = ' + f + ', all = ' + n + '</b>';
      $('.ss-pe', root).innerHTML = PE + ' = ' + ssFr(f, n) + ' = ' + ssVal(pe[0], pe[1]);
      $('.ss-pn', root).innerHTML = PN + ' = ' + ssFr(n - f, n) + ' = ' + ssVal(pn[0], pn[1]);
      $('.ss-one', root).innerHTML = PE + ' + ' + PN + ' = 1 <span class="ss-tick" aria-label="checked">✔</span>';
      var msg = $('.ss-msg', root), mt = '';
      if (f === 0) mt = 'No favourable outcome — ' + PE + ' = 0: an impossible event';
      else if (f === n) mt = 'Every outcome is favourable — ' + PE + ' = 1: a sure event';
      msg.innerHTML = mt; show(msg, !!mt);
      root.setAttribute('data-f', String(f)); root.setAttribute('data-n', String(n));
      root.setAttribute('data-pe', pe[1] === 1 ? String(pe[0]) : pe[0] + '/' + pe[1]);
      root.setAttribute('data-pn', pn[1] === 1 ? String(pn[0]) : pn[0] + '/' + pn[1]);
      root.setAttribute('data-rule', ruleText());
      var say = f + ' favourable out of ' + n + '; probability ' + f + ' over ' + n +
        (pe[1] !== n && f ? ', which is ' + pe[0] + ' over ' + pe[1] : '') + '.' +
        (f === 0 ? ' An impossible event.' : f === n ? ' A sure event.' : '');
      if (liveT) clearTimeout(liveT);
      if (now !== 'init') liveT = setTimeout(function () { live.textContent = say; }, now ? 0 : 300);
    }
    function full(now) { fillQ(); ctls(); build(); update(now); }
    function toRule() { if (S.mode === 'tap') S.mode = 'rule'; }
    on(eSel, 'change', function () {
      S.exp = eSel.value; S.marks = {}; S.or = false; showErr('');
      if (S.exp === 'dice2') { S.q = 'sum'; S.show = 'sum'; }
      if (S.mode === 'rule' && ssConds(S.exp).indexOf(S.c1) < 0) S.c1 = 'eq';
      full();
    });
    function numBox(inp, lo, hi, msg, set) {
      on(inp, 'input', function () {
        var v = inp.value.trim() === '' ? NaN : +inp.value;
        if (Number.isInteger(v) && v >= lo && v <= hi) { inp.removeAttribute('aria-invalid'); showErr(''); set(v); S.marks = {}; ctls(); build(); update(); }
        else { inp.setAttribute('aria-invalid', 'true'); showErr(msg); }
      });
      on(inp, 'change', function () {
        if (inp.getAttribute('aria-invalid')) { inp.removeAttribute('aria-invalid'); }
        ctls();
      });
      on(inp, 'blur', function () { inp.removeAttribute('aria-invalid'); ctls(); });
    }
    numBox(kIn, 2, 12, 'Choose 2 to 12 sectors', function (v) { S.k = v; });
    numBox(nIn, 2, 100, 'Choose N from 2 to 100', function (v) { S.N = v; });
    $$('.ss-show button', root).forEach(function (b) {
      on(b, 'click', function () { S.show = b.getAttribute('data-v'); ctls(); build(); update(); });
    });
    on(qSel, 'change', function () { S.q = qSel.value; toRule(); if (S.exp === 'dice2') S.show = S.q; ctls(); build(); update(); });
    on(c1Sel, 'change', function () {
      if (c1Sel.value === 'tap') {                 /* keep what the rule marked; taps change it from there */
        var m0 = {}; OUT.forEach(function (o) { if (fav(o)) m0[o.id] = 1; }); S.marks = m0; S.mode = 'tap';
      } else { S.mode = 'rule'; S.c1 = c1Sel.value; if (S.c1 === 'mul' && S.k1 < 1) S.k1 = 2; }
      ctls(); update();
    });
    function kBox(inp, which, cname) {
      on(inp, 'input', function () {
        var v = inp.value.trim() === '' ? NaN : +inp.value;
        if (kOk(S[cname], v)) { inp.removeAttribute('aria-invalid'); showErr(''); S[which] = v; update(); }
        else { inp.setAttribute('aria-invalid', 'true'); showErr(S[cname] === 'mul' ? 'Choose k from 1 to 144 for “is a multiple of”' : 'Choose a whole number k from 0 to 144'); }
      });
      on(inp, 'blur', function () { inp.removeAttribute('aria-invalid'); showErr(''); ctls(); });
    }
    kBox(k1In, 'k1', 'c1'); kBox(k2In, 'k2', 'c2');
    on(orB, 'click', function () { S.or = !S.or; ctls(); update(); });
    on(c2Sel, 'change', function () { S.c2 = c2Sel.value; if (S.c2 === 'mul' && S.k2 < 1) S.k2 = 2; ctls(); update(); });
    on($('.ss-clear', root), 'click', function () { S.mode = 'tap'; S.marks = {}; ctls(); update(); });
    on(tiles, 'click', function (e) {
      var t = e.target.closest('.ss-tile'); if (!t) return;
      var i = +t.getAttribute('data-i');
      if (S.mode === 'rule') { var m0 = {}; OUT.forEach(function (o) { if (fav(o)) m0[o.id] = 1; }); S.marks = m0; S.mode = 'tap'; }
      var id = OUT[i].id;
      if (S.marks[id]) delete S.marks[id]; else S.marks[id] = 1;
      ctls(); update();
    });
    function fit() { root.classList.toggle('is-wide', root.clientWidth >= 600); }
    if (window.ResizeObserver) new ResizeObserver(fit).observe(root); else on(window, 'resize', fit);
    full('init');
    fit();
  }
  /*END-SS*/

/*MP*/
  /* ---------------------------------------------------- map-points trainer (History Ch 2, T07-V12; content/C10-HIST-CH02/diagrams/_src)
     svg[data-mp] is the static first view (numbered points, no names) and carries the model: the two maps' sizes and point
     positions (computed in Python on the Survey of India outline, EPSG:7755), and per place its number, name, state, date,
     event and clue. Learn: tap a point to see name, state, date and event. Test: eight clues in a random order, one tap
     answers; points are named only "Point N of 8" and no state name is shown anywhere. List view: the eight place names as
     buttons. Topic 7 opens in Learn, the wrap-up in Test (the figure's data-block-id). Nothing is stored.
     Generic options in the model (all optional; without them the trainer is exactly the History Ch 2 one):
       inset   absent -> one map only (no enlarged box);   list: false -> no List view button;   txt {...} -> UI wording;
       kind: "choose" + choices [...] -> the test step is 'choose the answer' (Geography Ch 1, T07-V14 soil trainer,
       content/C10-GEO-CH01/diagrams/_src): one point is highlighted (random order, each once), the learner picks its
       answer (place.soil) from the fixed buttons; points leave the tab order in Test and are named only "Point N of 8";
       the location words (place.loc) are read to screen readers; focus goes to the first answer button, then to
       "Next point" after an answer.
       More generic options for the 'clue -> tap a point' step (Geography Ch 2, T03-V8 tiger-reserve trainer,
       content/C10-GEO-CH02/diagrams/_src); without them the History Ch 2 behaviour is unchanged:
       any number of places N (default texts say "of N");   place.loc -> in Test a point is named "Point N of M — <loc>";
       place.line -> the card shows that one line (the part before its first ': ' in bold) instead of date and event,
       followed by txt.note;   txt.allRight -> the all-right message;   hiRight: true -> after a wrong tap the right point
       is also highlighted (thick ring, larger, pulsing unless reduced motion);   lockPts: true -> the points are disabled
       after an answer until "Next clue";   place.lab "l" -> its label goes left of the dot.
       Always (generic, for every trainer): a point label that would run out of its map is moved to the other side or
       below the dot; two 44 px targets closer than 44 px (narrow screens) are trimmed at their mid-line so they never
       overlap; with one map and no answer buttons (class mp--one) the card goes beside the map in landscape.
       More generic options (Geography Ch 3, T07-V16 dam trainer, content/C10-GEO-CH03/diagrams/_src); without them the
       earlier trainers are unchanged:   side: true (with an inset, no answer buttons) -> class mp--side: in landscape
       (>= 560 px) the main map takes the left column and the enlarged box and the result card share the right one.
       More generic options for the 'choose' step (Geography Ch 4, T08-V16 crop-state trainer, content/C10-GEO-CH04/diagrams/_src);
       without them the earlier trainers are unchanged:   showLoc: true -> in Test the highlighted point's place.loc words
       are shown in the clue line (by default they are read to screen readers only);   txt.rightIs -> the wrong-answer
       words before the right answer (default 'The right soil is');   txt.kind -> the word after the answer in the
       screen-reader texts (default 'soil'; '' -> '<answer>, an example location'). */
  function initMp() {
    $$('svg[data-mp]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-mp-on')) return;
      var D; try { D = JSON.parse(svg.getAttribute('data-mp')); } catch (e) { return; }
      art.setAttribute('data-mp-on', '1');
      mpBuild(art, svg, D);
    });
  }
  function mpShuffle(a, avoid) {
    for (var t = 0; t < 20; t++) {
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; }
      if (!avoid || a.join() !== avoid) break;
    }
    return a;
  }
  function mpEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function mpBuild(art, src, D) {
    var uid = 'mp' + Math.random().toString(36).slice(2, 7);
    var fig = art.closest('.fig'), bid = fig ? fig.getAttribute('data-block-id') || '' : '';
    if (fig) fig.classList.add('fig--mp');
    var CH = D.kind === 'choose' && D.choices, HAS_INS = !!D.inset, TX = D.txt || {}, N = D.places.length;
    var RIGHT_IS = TX.rightIs != null ? TX.rightIs : 'The right soil is', KIND = TX.kind != null ? TX.kind : 'soil';
    function ans(p) { return p.soil + (KIND ? ' ' + KIND : ''); }
    var P = {}, ORDER = [];
    D.places.forEach(function (p) { P[p.key] = p; ORDER.push(p.key); });
    var S = { mode: /-WRAPUP\./.test(bid) ? 'test' : 'learn', list: false, sel: null, order: [], i: 0, done: {}, score: 0, wrong: [], last: '' };
    var mainG = src.querySelector('.mp-main'), insG = src.querySelector('.mp-ins');
    var insHTML = insG ? insG.innerHTML.replace(/mpclip0/g, uid + '-clip') : '';
    var root = document.createElement('div');
    var SIDE = !CH && HAS_INS && D.side === true;
    root.className = 'mp' + (CH ? ' mp--choose' : '') + (!CH && !HAS_INS ? ' mp--one' : '') + (SIDE ? ' mp--side' : '');
    function ptBtn(k, where) {
      var p = P[k], xy = where === 'main' ? D.main.pts[k] : D.inset.pts[k], w = where === 'main' ? D.main.w : D.inset.w, h = where === 'main' ? D.main.h : D.inset.h;
      return '<button type="button" class="mp-pt' + (p.lab === 'l' ? ' mp-pt--l' : '') + '" data-k="' + k + '" style="left:' + (100 * xy[0] / w).toFixed(3) + '%;top:' + (100 * xy[1] / h).toFixed(3) + '%">' +
        '<span class="mp-ring" aria-hidden="true"></span><span class="mp-mark" aria-hidden="true"></span><span class="mp-lab" aria-hidden="true"></span></button>';
    }
    var mainKeys = ORDER.filter(function (k) { return !P[k].gujarat; }), insKeys = ORDER.filter(function (k) { return P[k].gujarat; });
    root.innerHTML =
      '<div class="mp-top"><div class="mp-modes" role="group" aria-label="Mode">' +
        '<button type="button" class="mp-mode" data-m="learn" aria-pressed="false">Learn</button>' +
        '<button type="button" class="mp-mode" data-m="test" aria-pressed="false">Test</button></div>' +
        (D.list === false ? '' : '<button type="button" class="mp-listbtn" aria-pressed="false">List view</button>') + '</div>' +
      '<div class="mp-cluebar"><p class="mp-clue"></p></div>' +
      '<div class="mp-stage">' +
        '<div class="mp-mapw mp-mainw"><svg class="dg mp-map" viewBox="0 0 ' + D.main.w + ' ' + D.main.h + '" aria-hidden="true" focusable="false">' + (mainG ? mainG.innerHTML : '') + '</svg>' +
          mainKeys.map(function (k) { return ptBtn(k, 'main'); }).join('') +
          (HAS_INS ? '<button type="button" class="mp-gbox" style="left:' + (100 * D.main.gbox[0] / D.main.w).toFixed(3) + '%;top:' + (100 * D.main.gbox[1] / D.main.h).toFixed(3) + '%" aria-label="Enlarged box: three places close together. Go to the enlarged map">' +
          '<span class="mp-ring" aria-hidden="true"></span></button>' : '') + '</div>' +
        (HAS_INS ? '<div class="mp-mapw mp-insw" id="' + uid + '-ins" style="max-width:' + D.inset.w + 'px;--iw:' + D.inset.w + 'px"><p class="mp-instl" aria-hidden="true">Enlarged box</p><svg class="dg mp-map" viewBox="0 0 ' + D.inset.w + ' ' + D.inset.h + '" aria-hidden="true" focusable="false">' + insHTML + '</svg>' +
          insKeys.map(function (k) { return ptBtn(k, 'inset'); }).join('') + '</div>' : '') +
        (CH ? '<div class="mp-choose" role="group" aria-label="' + mpEsc(TX.choicesLabel || 'Choose the answer') + '" hidden>' +
          D.choices.map(function (c) { return '<button type="button" class="mp-ch" data-c="' + mpEsc(c) + '">' + mpEsc(c) + '</button>'; }).join('') + '</div>' : '') +
      '</div>' +
      '<div class="mp-list" hidden><p class="mp-listhd"></p><div class="mp-lbtns"></div></div>' +
      '<div class="mp-out" hidden><div class="mp-fb"></div>' +
        '<div class="mp-acts"><button type="button" class="mp-next" hidden>' + mpEsc(TX.next || 'Next clue') + '</button><button type="button" class="mp-again" hidden>' + mpEsc(TX.again || 'Try again') + '</button></div></div>' +
      '<p class="mp-attr">' + mpEsc(D.attr) + '</p>' +
      '<div class="mp-live" aria-live="polite"></div>';
    art.removeChild(src);
    art.appendChild(root);
    var clue = $('.mp-clue', root), fb = $('.mp-fb', root), live = $('.mp-live', root), next = $('.mp-next', root), again = $('.mp-again', root);
    var stage = $('.mp-stage', root), listW = $('.mp-list', root), lbtns = $('.mp-lbtns', root), listBtn = $('.mp-listbtn', root);
    var out = $('.mp-out', root), mainW = $('.mp-mainw', root), insW = $('.mp-insw', root), chooseW = $('.mp-choose', root);
    var chBtns = CH ? $$('.mp-ch', root) : [];
    var wideMq = window.matchMedia ? window.matchMedia('(min-width: 720px)') : null;
    var sideMq = SIDE && window.matchMedia ? window.matchMedia('(orientation: landscape) and (min-width: 560px)') : null;
    /* the result panel sits right under the map that was tapped (phones), under both maps (wide), under the list (list
       view); in the 'choose' trainer always under the stage (the map and the answer buttons) */
    function placeOut(k) {
      var after = S.list ? listW : !CH && !HAS_INS ? mainW : sideMq && sideMq.matches ? insW : CH || (wideMq && wideMq.matches) || !k ? stage : (P[k].gujarat ? insW : mainW);
      if (after === stage || after === listW) after.parentNode.insertBefore(out, after.nextSibling);
      else after.parentNode.insertBefore(out, after.nextSibling);
      show(out, !!fb.innerHTML);
      if (fb.innerHTML && out.scrollIntoView) out.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    }
    var pts = {};
    $$('.mp-pt', root).forEach(function (b) { pts[b.getAttribute('data-k')] = b; });
    function say(t) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 30); }
    function sorted() { return ORDER.slice().sort(function (a, b) { return P[a].name < P[b].name ? -1 : 1; }); }
    function card(k, withState) {
      var p = P[k];
      if (CH) {
        return '<p class="mp-card"><b>' + mpEsc(p.name) + ' · ' + mpEsc(p.soil) + '</b> <span class="mp-ex">(example location)</span><br>' +
          '<span class="mp-when">Region:</span> ' + mpEsc(p.region) + '<br><span class="mp-when">Clue:</span> ' + mpEsc(p.clue) + '</p>';
      }
      if (p.line) {
        var ci = p.line.indexOf(': ');
        return '<p class="mp-card">' + (ci > 0 ? '<b>' + mpEsc(p.line.slice(0, ci + 1)) + '</b> ' + mpEsc(p.line.slice(ci + 2)) : mpEsc(p.line)) +
          (TX.note ? ' <span class="mp-ex">' + mpEsc(TX.note) + '</span>' : '') + '</p>';
      }
      return '<p class="mp-card"><b>' + mpEsc(p.name) + '</b>' + (withState ? ' · ' + mpEsc(p.state) : '') + '<br>' +
        '<span class="mp-when">' + mpEsc(p.when) + '</span> — ' + mpEsc(p.what) + '</p>';
    }
    function cardSay(k) {
      var p = P[k];
      if (!CH && p.line) return p.line + (TX.note ? ' ' + TX.note : '');
      return CH ? p.name + ': ' + ans(p) + ', an example location. Region: ' + p.region + '. Clue: ' + p.clue
        : p.name + ', ' + p.state + '. ' + p.when + ': ' + p.what + '.';
    }
    function names() {
      ORDER.forEach(function (k) {
        var p = P[k], b = pts[k];
        if (CH) {
          b.setAttribute('aria-label', S.mode === 'learn' ? 'Point ' + p.n + ' of ' + N + ': ' + ans(p) + ', ' + p.loc : 'Point ' + p.n + ' of ' + N);
          if (S.mode === 'test') b.setAttribute('tabindex', '-1'); else b.removeAttribute('tabindex');
        } else b.setAttribute('aria-label', S.mode === 'learn' ? 'Point ' + p.n + ' of ' + N + ': ' + p.name + ', ' + p.state : 'Point ' + p.n + ' of ' + N + (p.loc ? ' — ' + p.loc : ''));
      });
    }
    function clearMarks() {
      ORDER.forEach(function (k) {
        var b = pts[k]; b.classList.remove('is-sel', 'is-right', 'is-wrong', 'is-cur'); b.removeAttribute('aria-pressed');
        $('.mp-lab', b).textContent = ''; $('.mp-mark', b).textContent = ''; if (D.lockPts) b.disabled = false;
      });
    }
    function listRender() {
      if (!lbtns) return;
      var keys = S.mode === 'learn' ? ORDER : sorted();
      $('.mp-listhd', root).textContent = S.mode === 'learn' ? 'The eight places (north to south):' : 'Choose the place for this clue:';
      lbtns.innerHTML = keys.map(function (k) { return '<button type="button" class="mp-lb" data-k="' + k + '">' + mpEsc(P[k].name) + '</button>'; }).join('');
    }
    function render() {
      root.setAttribute('data-mode', S.mode);
      $$('.mp-mode', root).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === S.mode ? 'true' : 'false'); });
      if (listBtn) listBtn.setAttribute('aria-pressed', S.list ? 'true' : 'false');
      show(stage, !S.list); show(listW, S.list);
      if (chooseW) show(chooseW, S.mode === 'test');
      names();
      listRender();
    }
    function focusFirst() { if (chBtns[0]) chBtns[0].focus({ preventScroll: true }); }
    function startTest(focus) {
      S.order = mpShuffle(ORDER.slice(), S.last); S.last = S.order.join(); S.i = 0; S.done = {}; S.score = 0; S.wrong = [];
      clearMarks(); askClue(false, focus);
    }
    function askText(k) { var p = P[k]; return 'Point ' + p.n + ' of ' + N + ' — ' + p.loc + '. ' + (TX.ask || ''); }
    function askClue(announce, focus) {
      var k = S.order[S.i];
      if (CH) {
        var p = P[k];
        clue.innerHTML = '<span class="mp-cn">Point ' + p.n + ' of ' + N + '</span><span class="' + (D.showLoc ? 'mp-loc' : 'mp-sr') + '"> — ' + mpEsc(p.loc) + '.</span> ' +
          mpEsc(TX.ask || '') + ' <span class="mp-prog">(question ' + (S.i + 1) + ' of ' + N + ')</span>';
      } else clue.innerHTML = '<span class="mp-cn">Clue ' + (S.i + 1) + ' of ' + N + '</span> ' + mpEsc(P[k].clue);
      clearMarks(); fb.innerHTML = ''; show(next, false); show(again, false); show(out, false);
      $$('.mp-lb', root).forEach(function (b) { b.disabled = false; b.classList.remove('is-right', 'is-wrong'); });
      if (CH) {
        pts[k].classList.add('is-cur');
        chBtns.forEach(function (b) { b.disabled = false; b.classList.remove('is-right', 'is-wrong'); b.removeAttribute('aria-describedby'); });
        if (focus) focusFirst();
        if (announce) say(askText(k));
      } else if (announce) say('Clue ' + (S.i + 1) + ' of ' + N + ': ' + P[k].clue);
    }
    function revisePart() {
      if (CH) return S.wrong.map(function (w) { return P[w].name + ' (' + P[w].loc + ')'; });
      return S.wrong.map(function (w) { return P[w].name; });
    }
    function finish(last) {
      if (last) {
        var rev = revisePart();
        fb.innerHTML += '<p class="mp-score"><b>' + mpEsc(TX.score || 'Your score') + ': ' + S.score + ' out of ' + N + '</b></p>' +
          '<p class="mp-rev">' + (rev.length ? mpEsc(TX.revise || 'Places to revise') + ': ' + mpEsc(rev.join(', ')) + '.' : mpEsc(TX.allRight || 'All eight right. Well done!')) + '</p>';
        show(again, true);
      } else show(next, true);
    }
    function answerChoice(c) {
      var want = S.order[S.i];
      if (S.mode !== 'test' || S.done[S.i]) return;
      S.done[S.i] = true;
      var p = P[want], ok = c === p.soil;
      if (ok) S.score++; else S.wrong.push(want);
      pts[want].classList.add(ok ? 'is-right' : 'is-wrong'); $('.mp-mark', pts[want]).textContent = ok ? '✔' : '✘';
      chBtns.forEach(function (b) {
        b.disabled = true; var bc = b.getAttribute('data-c');
        if (bc === p.soil) b.classList.add('is-right'); else if (bc === c && !ok) b.classList.add('is-wrong');
      });
      var head = ok ? '<span class="mp-ok">✔ Right!</span>' : '<span class="mp-no">✘ Not quite.</span> ' + mpEsc(RIGHT_IS) + ' <b>' + mpEsc(p.soil) + '</b>.';
      fb.innerHTML = '<p class="mp-verdict">' + head + '</p>' + card(want);
      var last = S.i === N - 1;
      finish(last);
      say((ok ? 'Right! ' : 'Not quite. ' + RIGHT_IS + ' ' + p.soil + '. ') + cardSay(want) +
        (last ? ' ' + (TX.score || 'Your score') + ': ' + S.score + ' out of ' + N + '.' + (S.wrong.length ? ' ' + (TX.revise || 'Places to revise') + ': ' + revisePart().join(', ') + '.' : '') : ''));
      placeOut(want);
      setTimeout(function () { (last ? again : next).focus({ preventScroll: true }); }, 0);
    }
    function answer(k) {
      var want = S.order[S.i];
      if (S.done[S.i]) return;
      S.done[S.i] = true;
      var ok = k === want, p = P[want];
      if (ok) S.score++; else S.wrong.push(want);
      pts[want].classList.add('is-right'); $('.mp-lab', pts[want]).textContent = p.name; $('.mp-mark', pts[want]).textContent = '✔';
      if (!ok) { pts[k].classList.add('is-wrong'); $('.mp-mark', pts[k]).textContent = '✘'; if (D.hiRight) pts[want].classList.add('is-cur'); }
      fitLab(pts[want]);
      if (D.lockPts) ORDER.forEach(function (q) { pts[q].disabled = true; });
      $$('.mp-lb', root).forEach(function (b) {
        b.disabled = true; var bk = b.getAttribute('data-k');
        if (bk === want) b.classList.add('is-right'); else if (bk === k && !ok) b.classList.add('is-wrong');
      });
      var head = ok ? '<span class="mp-ok">✔ Right!</span>' : '<span class="mp-no">✘ Not quite.</span> The right place is shown on the map:';
      fb.innerHTML = '<p class="mp-verdict">' + head + '</p>' + card(want, false);
      var last = S.i === N - 1;
      finish(last);
      say((ok ? 'Right! ' : 'Not quite. The right place is ') + (p.line ? (ok ? '' : p.name + ', shown on the map. ') + cardSay(want) : p.name + '. ' + p.when + ': ' + p.what + '.') +
        (last ? ' ' + (TX.score || 'Your score') + ': ' + S.score + ' out of ' + N + '.' + (S.wrong.length ? ' ' + (TX.revise || 'Places to revise') + ': ' + S.wrong.map(function (w) { return P[w].name; }).join(', ') + '.' : '') : ''));
      placeOut(k);
      setTimeout(function () { (last ? again : next).focus({ preventScroll: true }); }, 0);
    }
    function learn(k) {
      clearMarks();
      var b = pts[k]; b.classList.add('is-sel'); b.setAttribute('aria-pressed', 'true'); $('.mp-lab', b).textContent = CH ? P[k].soil : P[k].name;
      fitLab(b);
      fb.innerHTML = card(k, true);
      placeOut(k);
      say(cardSay(k));
    }
    function pick(k) { if (S.mode === 'learn') learn(k); else if (!CH) answer(k); }
    function setMode(m, focus) {
      S.mode = m; clearMarks(); fb.innerHTML = ''; show(out, false);
      render();
      if (m === 'learn') { clue.textContent = TX.learn || 'Tap any point to see its name, state, date and event.'; show(next, false); show(again, false); }
      else startTest(focus);
    }
    $$('.mp-mode', root).forEach(function (b) {
      on(b, 'click', function () {
        var m = b.getAttribute('data-m'); if (m === S.mode) return;
        setMode(m, CH);
        if (CH) say(m === 'learn' ? 'Learn mode. ' + (TX.learn || '') : 'Test mode. ' + askText(S.order[0]));
        else say(m === 'learn' ? 'Learn mode. Tap any point.' : 'Test mode. Clue 1 of ' + N + ': ' + P[S.order[0]].clue);
      });
    });
    on(listBtn, 'click', function () {
      S.list = !S.list; render(); if (fb.innerHTML) placeOut(null);
      if (S.mode === 'test') { var k = S.order[S.i]; if (S.done[S.i]) $$('.mp-lb', root).forEach(function (b) { b.disabled = true; if (b.getAttribute('data-k') === k) b.classList.add('is-right'); }); }
      say(S.list ? 'List view: the eight place names.' : 'Map view.');
    });
    on(root, 'click', function (e) {
      var c = CH && e.target.closest('.mp-ch');
      if (c && root.contains(c)) { if (!c.disabled) answerChoice(c.getAttribute('data-c')); return; }
      var b = e.target.closest('.mp-pt, .mp-lb'); if (b && root.contains(b) && !b.disabled) pick(b.getAttribute('data-k'));
    });
    on($('.mp-gbox', root), 'click', function () {
      var ins = $('.mp-insw', root);
      ins.classList.add('is-focus');
      if (ins.scrollIntoView) ins.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
      var first = pts[insKeys[0]]; if (first) first.focus({ preventScroll: true });
      setTimeout(function () { ins.classList.remove('is-focus'); }, reduced ? 0 : 1200);
      say('Enlarged map: three points.');
    });
    function toTop(el) { if (el.scrollIntoView) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' }); }
    on(next, 'click', function () {
      S.i++; askClue(true, CH);
      if (CH) { toTop($('.mp-cluebar', root)); return; }
      clue.setAttribute('tabindex', '-1'); clue.focus({ preventScroll: true }); toTop(clue);
    });
    on(again, 'click', function () {
      startTest(CH);
      if (CH) { say('New order. ' + askText(S.order[0])); toTop($('.mp-cluebar', root)); return; }
      say('New order. Clue 1 of ' + N + ': ' + P[S.order[0]].clue); clue.setAttribute('tabindex', '-1'); clue.focus({ preventScroll: true }); toTop(clue);
    });
    /* a label that would run out of its map goes to the other side of the dot, else centred below it (kept inside) */
    function fitLab(b) {
      var lab = $('.mp-lab', b), wrap = b.parentNode; if (!lab || !lab.textContent) return;
      lab.style.left = lab.style.right = lab.style.top = lab.style.transform = '';
      var W = wrap.getBoundingClientRect(), r = lab.getBoundingClientRect();
      if (r.right <= W.right - 1 && r.left >= W.left + 1) return;
      lab.style.left = r.right > W.right - 1 ? 'auto' : '38px'; lab.style.right = r.right > W.right - 1 ? '38px' : 'auto';
      r = lab.getBoundingClientRect();
      if (r.right <= W.right - 1 && r.left >= W.left + 1) return;
      var bb = b.getBoundingClientRect(), cx = bb.left + bb.width / 2, half = r.width / 2;
      var shift = Math.max(W.left + 2 + half - cx, Math.min(0, W.right - 2 - half - cx));
      lab.style.left = '50%'; lab.style.right = 'auto'; lab.style.top = 'calc(100% + 13px)';
      lab.style.transform = 'translate(calc(-50% + ' + shift.toFixed(1) + 'px), -50%)';
    }
    /* two 44 px targets closer than 44 px (narrow screens): trim each at the mid-line between the two centres */
    function clipPoly(poly, nx, ny, c) {          /* keep the part of the polygon with nx*x + ny*y <= c */
      var out = [];
      for (var i = 0; i < poly.length; i++) {
        var a = poly[i], b = poly[(i + 1) % poly.length], da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
        if (da <= 0) out.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) { var t = da / (da - db); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
      }
      return out;
    }
    function trimTargets() {
      var bs = ORDER.map(function (k) { return pts[k]; }).filter(function (b) { return b && b.offsetParent; });
      var cs = bs.map(function (b) { var r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; });
      bs.forEach(function (b, i) {
        var poly = [[0, 0], [cs[i][2], 0], [cs[i][2], cs[i][3]], [0, cs[i][3]]], cut = false;
        bs.forEach(function (o, j) {
          if (j === i || o.parentNode !== b.parentNode) return;
          var dx = cs[j][0] - cs[i][0], dy = cs[j][1] - cs[i][1];
          if (Math.hypot(dx, dy) >= Math.min(cs[i][2], cs[i][3]) - 0.01) return;   /* round targets: they meet only when closer than 44 px */
          cut = true;   /* local coordinates: centre (w/2, h/2); keep the points nearer to this centre */
          poly = clipPoly(poly, dx, dy, dx * (cs[i][2] / 2 + dx / 2) + dy * (cs[i][3] / 2 + dy / 2));
        });
        var hit = $('.mp-hit', b);
        if (cut) {
          if (!hit) { hit = document.createElement('span'); hit.className = 'mp-hit'; hit.setAttribute('aria-hidden', 'true'); b.insertBefore(hit, b.firstChild); }
          hit.style.clipPath = 'polygon(' + poly.map(function (q) { return q[0].toFixed(1) + 'px ' + q[1].toFixed(1) + 'px'; }).join(', ') + ')';
          b.classList.add('is-trim');
        } else if (hit) { b.removeChild(hit); b.classList.remove('is-trim'); }
      });
    }
    var trimT;
    function trimSoon() { clearTimeout(trimT); trimT = setTimeout(trimTargets, 60); }
    on(window, 'resize', trimSoon);
    if (window.ResizeObserver) new ResizeObserver(trimSoon).observe(mainW);
    setMode(S.mode, false);
    trimTargets();
  }
/*END-MP*/
/*NS*/
  /* ---------------------------------------------------- three roads sorter (History Ch 1, T08-V12; content/C10-HIST-CH01/diagrams/_src)
     svg[data-ns] is the static first view (a numbered practice sheet) and carries the model: three lanes (Germany 4,
     Italy 5, Britain 6 slots), fifteen cards (text, lane, position, the textbook line) and the time-order pairs.
     Modes: "Sort by country" (lanes checked, order free) and "Sort by country and time" (lanes and order checked, by the
     pairs: an undated card is right anywhere its pairs allow). Topic 8 opens in country mode, the wrap-up in time mode
     (the figure's data-block-id). Move a card by drag (mouse anywhere on the card; touch on its grip), by tap (tap a card,
     then a slot) or by keyboard (Tab to a card, Enter to pick up, arrow keys to choose lane and slot, Enter to drop,
     Escape to cancel). A card dropped on a full slot swaps with it. Check marks every placed card with a tick or a cross
     and its textbook line. Nothing is stored.
     WORDING FROM THE DATA (History Ch 3 reuses this sorter, T08-V12 -> C10-HIST-CH03-WRAPUP-V14): the optional D.ui
     object sets the heading, the modes (one mode is shown as a plain "Sort by ..." line, not a button), the help line,
     the tray title, the lane ends, which checked cards show their textbook line ('all' / 'wrong'), the visible words
     under a right card, the score line ('{n} of {total} right', total = cards.length), the all-right and Show-answer
     lines. Every default reproduces History Ch 1 exactly. A card without "pos" is placed by Show answer in data order. */
  function initNs() {
    $$('svg[data-ns]').forEach(function (svg) {
      var art = svg.closest('.fig-art'); if (!art || art.getAttribute('data-ns-on')) return;
      var D; try { D = JSON.parse(svg.getAttribute('data-ns')); } catch (e) { return; }
      art.setAttribute('data-ns-on', '1');
      nsBuild(art, svg, D);
    });
  }
  function nsEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function nsShuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  var NS_NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
    'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  function nsUi(D) {
    var u = D.ui || {}, n = D.cards.length;
    var modes = u.modes || [
      { key: 'country', label: 'Sort by country', help: 'Put each card in its country’s lane. Only the lane is checked; the order inside a lane is free.', order: false, note: ' (lane)' },
      { key: 'time', label: 'Sort by country and time', help: 'Put each card in its country’s lane, earliest first. Both the lane and the order are checked.', order: true, note: ' (lane and order)' }];
    function has(k) { return modes.some(function (m) { return m.key === k; }); }
    return {
      heading: u.heading || '', modes: modes, tray: u.tray || 'Cards', ends: u.ends !== false, why: u.why || 'all',
      rightWords: u.rightWords || '', wrongLane: u.wrongLane || 'Wrong lane.', wrongTime: u.wrongTime || 'Wrong place in time.',
      score: u.score || '{n} of {total} right', total: n,
      allRight: u.allRight || 'All ' + (NS_NUM[n] || n) + ' right. Well done!',
      readWhy: u.readWhy || 'Read the textbook line under each ✘ card, then move it.',
      shown: u.shown || 'Answer shown: the three lanes in time order.',
      startTopic: u.startTopic || (has('country') ? 'country' : modes[0].key),
      startWrap: u.startWrap || (has('time') ? 'time' : modes[0].key)
    };
  }
  function nsBuild(art, src, D) {
    var fig = art.closest('.fig'), bid = fig ? fig.getAttribute('data-block-id') || '' : '';
    if (fig) fig.classList.add('fig--ns');
    var CARD = {}, IDS = [], LANE = {}, U = nsUi(D), MODE = {}, LPOS = {};
    U.modes.forEach(function (m) { MODE[m.key] = m; });
    D.cards.forEach(function (c) { CARD[c.id] = c; IDS.push(c.id); if (c.pos == null) { LPOS[c.lane] = (LPOS[c.lane] || 0) + 1; c.pos = LPOS[c.lane]; } });
    D.lanes.forEach(function (l, i) { LANE[l.key] = l; l.i = i; });
    D.order = D.order || [];
    function ordered() { var m = MODE[S.mode]; return !!(m && (m.order != null ? m.order : m.key === 'time')); }
    var S = { mode: /-WRAPUP\./.test(bid) ? U.startWrap : U.startTopic, at: {}, tray: [], held: null, marks: null, shown: false };
    var root = document.createElement('div');
    root.className = 'ns';
    root.innerHTML =
      (U.heading ? '<h3 class="ns-hd">' + nsEsc(U.heading) + '</h3>' : '') +
      (U.modes.length > 1 ? '<div class="ns-modes" role="group" aria-label="What to check">' + U.modes.map(function (m) {
        return '<button type="button" class="ns-mode" data-m="' + nsEsc(m.key) + '" aria-pressed="false">' + nsEsc(m.label) + '</button>'; }).join('') + '</div>'
        : '<p class="ns-mode1">' + nsEsc(U.modes[0].label) + '</p>') +
      '<p class="ns-help"></p>' +
      '<div class="ns-trayw"><div class="ns-trayhd"><b class="ns-traytl">' + nsEsc(U.tray) + '</b>' +
        '<button type="button" class="ns-back" hidden>Put the card back</button></div>' +
        '<ul class="ns-tray" aria-label="Cards still to sort"></ul></div>' +
      '<div class="ns-lanes">' + D.lanes.map(function (l) {
        return '<section class="ns-lane" data-lane="' + l.key + '"><div class="ns-lhd"><h3 class="ns-lname">' + nsEsc(l.name) + '</h3>' +
          (U.ends ? '<span class="ns-ends" aria-hidden="true"><span>earlier</span><span>later</span></span>' : '') + '</div>' +
          '<ol class="ns-slots" aria-label="' + nsEsc(l.name) + ' lane, ' + l.n + ' slots' + (U.ends ? ', earlier to later' : '') + '"></ol></section>';
      }).join('') + '</div>' +
      '<div class="ns-acts"><button type="button" class="ns-check">Check</button>' +
        '<button type="button" class="ns-show">Show answer</button><button type="button" class="ns-again">Try again</button></div>' +
      '<div class="ns-out" hidden></div>' +
      '<div class="ns-live" aria-live="polite"></div>';
    art.removeChild(src);
    art.appendChild(root);
    var tray = $('.ns-tray', root), out = $('.ns-out', root), live = $('.ns-live', root), back = $('.ns-back', root), help = $('.ns-help', root);
    function say(t) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 30); }
    function slotName(lk, s) { return 'lane ' + LANE[lk].name + ', slot ' + (s + 1) + ' of ' + LANE[lk].n; }
    function occupant(lk, s) { for (var k in S.at) if (S.at[k] && S.at[k].lane === lk && S.at[k].slot === s) return k; return null; }
    function reset() {
      S.at = {}; S.tray = nsShuffle(IDS.slice()); S.held = null; S.marks = null; S.shown = false;
    }
    /* ---- correctness */
    function judge() {
      var m = {};
      IDS.forEach(function (id) {
        var p = S.at[id]; if (!p) return;
        var c = CARD[id], okLane = p.lane === c.lane, ok = okLane;
        if (ok && ordered()) {
          D.order.forEach(function (pr) {
            var a = pr[0], b = pr[1]; if (a !== id && b !== id) return;
            var o = a === id ? b : a, po = S.at[o];
            if (!po || po.lane !== CARD[o].lane || po.lane !== p.lane) return;
            if (S.at[a].slot > S.at[b].slot) ok = false;
          });
        }
        m[id] = { ok: ok, lane: okLane };
      });
      return m;
    }
    /* ---- rendering */
    function cardHTML(id, where) {
      var c = CARD[id], p = S.at[id], mk = S.marks && S.marks[id];
      var label = c.text + (p ? '. ' + slotName(p.lane, p.slot) : '. In the cards') + (mk ? (mk.ok ? '. Right' : '. Not right') : '') +
        (S.held === id ? '. Picked up' : '');
      var cls = 'ns-card' + (S.held === id ? ' is-held' : '') + (mk ? (mk.ok ? ' is-right' : ' is-wrong') : '');
      return '<div class="ns-item" data-id="' + id + '">' +
        '<button type="button" class="' + cls + '" data-id="' + id + '" aria-pressed="' + (S.held === id) + '" aria-label="' + nsEsc(label) + '">' +
          '<span class="ns-grip" aria-hidden="true"></span><span class="ns-txt">' + nsEsc(c.text) + '</span>' +
          (mk ? '<span class="ns-mark" aria-hidden="true">' + (mk.ok ? '✔' : '✘') + '</span>' : '') + '</button>' +
        (mk && (!mk.ok || U.why === 'all') ? '<p class="ns-why' + (mk.ok ? '' : ' is-wrong') + '">' + (mk.ok ? '' : '<b>' + (mk.lane ? nsEsc(U.wrongTime) : nsEsc(U.wrongLane)) + '</b> ') + nsEsc(c.why) + '</p>' : '') +
        (mk && mk.ok && U.why !== 'all' && U.rightWords ? '<p class="ns-why is-right"><b>' + nsEsc(U.rightWords) + '</b></p>' : '') +
        '</div>';
    }
    function render(focusSel) {
      root.setAttribute('data-mode', S.mode);
      $$('.ns-mode', root).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-m') === S.mode ? 'true' : 'false'); });
      help.textContent = MODE[S.mode].help || '';
      var inTray = S.tray.filter(function (id) { return !S.at[id]; });
      tray.innerHTML = inTray.map(function (id) { return '<li>' + cardHTML(id, 'tray') + '</li>'; }).join('');
      $('.ns-traytl', root).textContent = inTray.length ? U.tray + ' (' + inTray.length + ' to sort)' : 'All cards are in the lanes';
      root.classList.toggle('is-empty', !inTray.length);
      D.lanes.forEach(function (l) {
        var ol = $('.ns-lane[data-lane="' + l.key + '"] .ns-slots', root), h = '';
        for (var s = 0; s < l.n; s++) {
          var id = occupant(l.key, s);
          h += '<li class="ns-slot' + (id ? ' is-full' : '') + '" data-lane="' + l.key + '" data-slot="' + s + '">' +
            (id ? cardHTML(id, 'slot') : '<button type="button" class="ns-empty" data-lane="' + l.key + '" data-slot="' + s + '" aria-label="' +
              nsEsc(slotName(l.key, s) + ', empty') + '"><span aria-hidden="true">' + (s + 1) + '</span></button>') + '</li>';
        }
        ol.innerHTML = h;
      });
      root.classList.toggle('is-holding', !!S.held);
      show(back, !!S.held && !!S.at[S.held]);
      if (focusSel) { var f = $(focusSel, root); if (f) f.focus({ preventScroll: false }); }
    }
    function result() {
      if (!S.marks) { out.innerHTML = ''; show(out, false); return; }
      var n = 0, placed = 0;
      for (var k in S.marks) { placed++; if (S.marks[k].ok) n++; }
      var left = IDS.length - placed;
      var sh = U.shown.split(':'), m = MODE[S.mode];
      var h = S.shown ? '<p>' + (sh.length > 1 ? '<b>' + nsEsc(sh[0]) + ':</b>' + nsEsc(sh.slice(1).join(':')) : nsEsc(U.shown)) + '</p>' :
        '<p class="ns-score"><b>' + nsEsc(U.score.replace('{n}', n).replace('{total}', U.total)) + '</b>' + nsEsc(m.note != null ? m.note : (ordered() ? ' (lane and order)' : ' (lane)')) + '.</p>' +
        (left ? '<p>' + left + (left === 1 ? ' card is' : ' cards are') + ' still to sort.</p>' : '') +
        (n === U.total ? '<p>' + nsEsc(U.allRight) + '</p>' : (placed > n ? '<p>' + nsEsc(U.readWhy) + '</p>' : ''));
      out.innerHTML = h; show(out, true);
    }
    function clearMarks() { if (S.marks) { S.marks = null; S.shown = false; result(); } }
    /* ---- moving */
    function pick(id) {
      S.held = id; render('.ns-card[data-id="' + id + '"]');
      var p = S.at[id];
      say('Picked up: ' + CARD[id].text + '. Use the arrow keys to choose a lane and slot, then Enter to drop. Escape cancels.');
      if (!p) { var f = firstTarget(); if (f) f.focus(); }
    }
    function firstTarget() {
      for (var i = 0; i < D.lanes.length; i++) for (var s = 0; s < D.lanes[i].n; s++) if (!occupant(D.lanes[i].key, s)) return $('.ns-empty[data-lane="' + D.lanes[i].key + '"][data-slot="' + s + '"]', root);
      return $('.ns-slot .ns-card', root);
    }
    function targetSel(lk, s) {
      var id = occupant(lk, s);
      return id ? '.ns-slot .ns-card[data-id="' + id + '"]' : '.ns-empty[data-lane="' + lk + '"][data-slot="' + s + '"]';
    }
    function drop(id, lk, s) {
      var from = S.at[id] || null, o = occupant(lk, s);
      if (from && from.lane === lk && from.slot === s) { S.held = null; render('.ns-card[data-id="' + id + '"]'); say('Put down in the same place.'); return; }
      if (o) { if (from) S.at[o] = { lane: from.lane, slot: from.slot }; else delete S.at[o]; }
      S.at[id] = { lane: lk, slot: s }; S.held = null;
      clearMarks();
      render('.ns-card[data-id="' + id + '"]');
      say(CARD[id].text + ': ' + slotName(lk, s) + '.' + (o ? ' Swapped with: ' + CARD[o].text + '.' : ''));
    }
    function toTray(id) {
      delete S.at[id]; S.held = null; if (S.tray.indexOf(id) < 0) S.tray.push(id);
      clearMarks(); render('.ns-tray .ns-card[data-id="' + id + '"]'); say(CARD[id].text + ': back with the cards.');
    }
    function cancel() { var id = S.held; S.held = null; render(id ? '.ns-card[data-id="' + id + '"]' : null); say('Cancelled.'); }
    /* ---- clicks (tap and keyboard Enter / Space) */
    var skipClick = false;
    on(root, 'click', function (e) {
      if (skipClick) { skipClick = false; return; }
      var b = e.target.closest('button'); if (!b || !root.contains(b)) return;
      if (b.classList.contains('ns-mode')) { var m = b.getAttribute('data-m'); if (m !== S.mode) { S.mode = m; clearMarks(); render(); say(b.textContent + '. ' + help.textContent); } return; }
      if (b.classList.contains('ns-check')) { S.marks = judge(); S.shown = false; S.held = null; render(); result(); var n = 0; for (var k in S.marks) if (S.marks[k].ok) n++; say(out.textContent); if (out.scrollIntoView) out.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' }); return; }
      if (b.classList.contains('ns-show')) {
        S.at = {}; IDS.forEach(function (id) { S.at[id] = { lane: CARD[id].lane, slot: CARD[id].pos - 1 }; });
        S.held = null; S.marks = judge(); S.shown = true; render(); result(); say(U.shown); return;
      }
      if (b.classList.contains('ns-again')) { reset(); render(); result(); say('New start: the cards are shuffled again.'); var f = $('.ns-tray .ns-card', root); if (f) f.focus(); return; }
      if (b.classList.contains('ns-back')) { if (S.held) toTray(S.held); return; }
      if (b.classList.contains('ns-empty')) { if (S.held) drop(S.held, b.getAttribute('data-lane'), +b.getAttribute('data-slot')); else say(slotName(b.getAttribute('data-lane'), +b.getAttribute('data-slot')) + ', empty. Pick up a card first.'); return; }
      if (b.classList.contains('ns-card')) {
        var id = b.getAttribute('data-id'), p = S.at[id];
        if (S.held === id) { cancel(); return; }
        if (S.held && p) { drop(S.held, p.lane, p.slot); return; }
        pick(id);
      }
    });
    /* ---- keyboard while holding: arrows move between slots (lane up/down, slot left/right), Escape cancels */
    on(root, 'keydown', function (e) {
      if (e.key === 'Escape' && S.held) { e.preventDefault(); cancel(); return; }
      if (!S.held) return;
      var k = e.key; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(k) < 0) return;
      var a = document.activeElement, slot = a && a.closest ? a.closest('.ns-slot') : null, li, si;
      if (slot) { li = LANE[slot.getAttribute('data-lane')].i; si = +slot.getAttribute('data-slot'); }
      else { li = 0; si = -1; }
      e.preventDefault();
      if (k === 'ArrowUp') li = Math.max(0, li - 1);
      else if (k === 'ArrowDown') li = Math.min(D.lanes.length - 1, li + 1);
      else if (k === 'ArrowLeft') si = Math.max(0, si - 1);
      else si = si + 1;
      var l = D.lanes[li]; si = Math.max(0, Math.min(l.n - 1, si));
      var t = $(targetSel(l.key, si), root); if (t) t.focus();
      say(slotName(l.key, si) + (occupant(l.key, si) ? ': ' + CARD[occupant(l.key, si)].text : ', empty'));
    });
    /* ---- drag (pointer events: a mouse drags from anywhere on a card; touch and pen from the grip, so the page still scrolls) */
    var drag = null;
    on(root, 'pointerdown', function (e) {
      var b = e.target.closest('.ns-card'); if (!b || e.button) return;
      if (e.pointerType !== 'mouse' && !e.target.closest('.ns-grip')) return;
      drag = { id: b.getAttribute('data-id'), x: e.clientX, y: e.clientY, on: false, el: b, pid: e.pointerId };
    });
    function hit(x, y) {
      var el = document.elementFromPoint(x, y); if (!el || !root.contains(el)) return null;
      var s = el.closest('.ns-slot'); if (s) return { lane: s.getAttribute('data-lane'), slot: +s.getAttribute('data-slot'), el: s };
      if (el.closest('.ns-trayw')) return { tray: true, el: $('.ns-trayw', root) };
      return null;
    }
    on(document, 'pointermove', function (e) {
      if (!drag || e.pointerId !== drag.pid) return;
      if (!drag.on) {
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 8) return;
        drag.on = true;
        var r = drag.el.getBoundingClientRect();
        drag.dx = drag.x - r.left; drag.dy = drag.y - r.top;
        drag.ghost = drag.el.cloneNode(true); drag.ghost.className += ' ns-ghost'; drag.ghost.removeAttribute('aria-label');
        drag.ghost.setAttribute('aria-hidden', 'true'); drag.ghost.style.width = r.width + 'px';
        document.body.appendChild(drag.ghost);
        drag.el.classList.add('is-dragging'); root.classList.add('is-dragging');
      }
      e.preventDefault();
      drag.ghost.style.left = (e.clientX - drag.dx) + 'px'; drag.ghost.style.top = (e.clientY - drag.dy) + 'px';
      var t = hit(e.clientX, e.clientY);
      $$('.is-over', root).forEach(function (n) { n.classList.remove('is-over'); });
      if (t) t.el.classList.add('is-over');
    });
    function endDrag(e, cancelled) {
      if (!drag || e.pointerId !== drag.pid) return;
      var d = drag; drag = null;
      if (!d.on) return;
      d.ghost.parentNode.removeChild(d.ghost);
      root.classList.remove('is-dragging');
      $$('.is-over', root).forEach(function (n) { n.classList.remove('is-over'); });
      skipClick = true; setTimeout(function () { skipClick = false; }, 0);
      if (cancelled) { render(); return; }
      var t = hit(e.clientX, e.clientY);
      if (t && t.tray) { if (S.at[d.id]) toTray(d.id); else render(); }
      else if (t) drop(d.id, t.lane, t.slot);
      else render();
    }
    on(document, 'pointerup', function (e) { endDrag(e, false); });
    on(document, 'pointercancel', function (e) { endDrag(e, true); });
    function fit() { root.classList.toggle('is-wide', root.clientWidth >= 600); }
    if (window.ResizeObserver) new ResizeObserver(fit).observe(root); else on(window, 'resize', fit);
    reset(); render(); fit();
  }
/*END-NS*/
  function init() {
    initHeader(); initSteps(document); initMcq(document); initSelf(document); initPyq(); initSkip();
    initNcert(); initPractice(); initTest(); initRecall(); initReview(); initSubject(); initEq(document); initFig(document); initXp(); initAe(); initPh(); initReveal(); initHl(); initGx(); initTl(); initAp(); initRx(); initNi(); initLdt(); initResp(); initVl(); initSx(); initCx(); initCb(); initHd(); initEy(); initTe(); initCv(); initSe(); initDr(); initSb(); initEf(); initGd(); initSs(); initMp(); initNs(); initTableCue(document);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { initEq(document); initTableCue(document); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

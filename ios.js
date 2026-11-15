/* ==========================================================================
   iOS 26 · движение и жесты. Подключается ПОСЛЕ app.js.
   Ничего не ломает: каждый блок изолирован и тихо отключается при ошибке.
   Состав: хаптики · шапка и таб-бар · меню «+» · жест «назад» · свайп-шиты ·
           свайп по чату · экран приветствия (звезда из частиц)
   ========================================================================== */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var root = document.documentElement;
  var mobile = function () { return matchMedia('(max-width:899.98px)').matches; };
  var noMotion = function () { return matchMedia('(prefers-reduced-motion:reduce)').matches || root.classList.contains('reduce-motion'); };
  var guard = function (name, fn) { try { fn(); } catch (e) { console.warn('[ios:' + name + ']', e); } };

  /* ---------- хаптики: Android — vibrate, iPhone — «переключатель» Safari ---------- */
  var hap = (function () {
    var lab = null;
    return function (kind) {
      try {
        if (navigator.vibrate) { navigator.vibrate(kind === 'heavy' ? 18 : kind === 'medium' ? 11 : 6); return; }
        if (!lab) {
          lab = document.createElement('label');
          lab.setAttribute('aria-hidden', 'true');
          lab.style.cssText = 'position:fixed;left:-99px;top:-99px;width:1px;height:1px;opacity:0;pointer-events:none';
          var i = document.createElement('input');
          i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
          lab.appendChild(i); document.body.appendChild(lab);
        }
        lab.click();
      } catch (_) {}
    };
  })();
  window.IOS = { haptic: hap };
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#nav button,.ib,.btn,.srow,.pitem,.cx-i,#chips button,.seg button,.wl-btn,.sw-act button')) hap('light');
  }, true);

  /* ---------- шапка списка: большой заголовок → компактный, отступ списка ---------- */
  guard('header', function () {
    var home = $('#home'), hh = $('#hhead'), cl = $('#clist'), nav = $('#nav');
    if (!home || !hh || !cl) return;
    var setH = function () { home.style.setProperty('--hh', hh.offsetHeight + 'px'); };
    if (window.ResizeObserver) new ResizeObserver(setH).observe(hh); else setH();
    var last = 0, scrolled = false;
    cl.addEventListener('scroll', function () {
      var y = cl.scrollTop;
      if (!scrolled && y > 14) { scrolled = true; home.classList.add('scrolled'); }
      else if (scrolled && y < 4) { scrolled = false; home.classList.remove('scrolled'); }
      if (nav) {
        var dy = y - last;
        if (dy > 8 && y > 90) nav.classList.add('min');
        else if (dy < -6 || y < 40) nav.classList.remove('min');
      }
      last = y;
    }, { passive: true });
    if (nav) nav.addEventListener('click', function () { nav.classList.remove('min'); }, true);
  });

  /* ---------- таб-бар: «линза» едет за выбранной вкладкой, её можно тянуть пальцем ---------- */
  guard('tabbar', function () {
    var nav = $('#nav'); if (!nav) return;
    var lens = document.createElement('i'); lens.className = 'lens'; nav.insertBefore(lens, nav.firstChild);
    var btns = function () { return Array.prototype.slice.call(nav.querySelectorAll('button[data-tab]')); };
    function place(instant) {
      var on = nav.querySelector('button.on'); if (!on || !nav.offsetWidth) return;
      var nr = nav.getBoundingClientRect(), r = on.getBoundingClientRect();
      if (instant) lens.style.transition = 'none';
      lens.style.width = r.width + 'px';
      var t = 'translateX(' + (r.left - nr.left) + 'px)';
      nav.style.setProperty('--lx', t); lens.style.transform = t;
      if (instant) { void lens.offsetWidth; lens.style.transition = ''; }
    }
    new MutationObserver(function () { if (!drag) place(); }).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'] });
    if (window.ResizeObserver) new ResizeObserver(function () { place(true); }).observe(nav);
    addEventListener('resize', function () { place(true); });
    place(true);

    var drag = null, programmatic = false, swallow = false;
    function nearest(x) {
      var nr = nav.getBoundingClientRect(), bs = btns(), best = 0, bd = 1e9;
      bs.forEach(function (b, i) { var r = b.getBoundingClientRect(), d = Math.abs(x - (r.left + r.width / 2)); if (d < bd) { bd = d; best = i; } });
      return best;
    }
    nav.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var b = e.target.closest('button[data-tab]'); if (!b) return;
      drag = { x: e.clientX, moved: false, idx: -1 };
      nav.classList.add('hold');
    });
    addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (!drag.moved && Math.abs(e.clientX - drag.x) > 8) { drag.moved = true; nav.classList.remove('hold'); nav.classList.add('drag'); }
      if (drag.moved) {
        var nr = nav.getBoundingClientRect(), w = lens.offsetWidth;
        var x = Math.max(6, Math.min(nr.width - w - 6, e.clientX - nr.left - w / 2));
        lens.style.transform = 'translateX(' + x + 'px) scale(1.12)';
        var i = nearest(e.clientX);
        if (i !== drag.idx) { if (drag.idx !== -1) hap('light'); drag.idx = i; }
      }
    });
    function end(e) {
      if (!drag) return;
      var d = drag; drag = null; nav.classList.remove('hold', 'drag');
      if (d.moved) {
        swallow = true; setTimeout(function () { swallow = false; }, 400);
        var b = btns()[nearest(e.clientX)];
        if (b && !b.classList.contains('on')) { programmatic = true; try { b.click(); } finally { programmatic = false; } }
        place();
      } else place();
    }
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    nav.addEventListener('click', function (e) { if (swallow && !programmatic) { e.stopPropagation(); e.preventDefault(); } }, true);
  });

  /* ---------- высота композера → отступ списка сообщений ---------- */
  guard('composer-size', function () {
    var cw = $('#cw'), chat = $('#chat'); if (!cw || !chat || !window.ResizeObserver) return;
    new ResizeObserver(function () { chat.style.setProperty('--cwh', cw.offsetHeight + 'px'); }).observe(cw);
  });

  /* ---------- кнопка отправки: стрелка вверх ---------- */
  guard('send-icon', function () {
    var s = $('#sendb'); if (!s) return;
    s.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>';
  });

  /* ---------- меню «+» (из демо): пружина, плашка, перетаскивание пальцем ---------- */
  guard('plus-menu', function () {
    var chat = $('#chat'), cw = $('#cw'), att = $('#att'), fileIn = $('#fileIn');
    if (!chat || !cw || !att || !fileIn) return;
    var I = {
      photo: '<path d="M4 5h11M4 5v14h16v-8"/><path d="M4 17l5-5 4 4 3-3 4 4"/><circle cx="9" cy="9.5" r="1.2"/><path d="M19 3v5M16.5 5.5h5"/>',
      video: '<rect x="3.5" y="7" width="12" height="10" rx="1"/><path d="M15.5 10.5l5-3v9l-5-3"/>',
      file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
      voice: '<rect x="9" y="3.5" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5"/><path class="spark" d="M19 3v4M17 5h4"/>'
    };
    var LAB = { photo: 'Фото', video: 'Видео', file: 'Файл', voice: 'Голос' };
    att.classList.add('pplus'); att.innerHTML = '<i></i>';
    att.setAttribute('aria-haspopup', 'menu'); att.setAttribute('aria-expanded', 'false'); att.setAttribute('aria-label', 'Вложения');
    var scrim = document.createElement('div'); scrim.id = 'pscrim'; chat.insertBefore(scrim, cw);
    var menu = document.createElement('div'); menu.className = 'pmenu'; menu.id = 'pmenu'; menu.setAttribute('role', 'menu');
    var html = '<div class="plist"><div class="ppill" id="ppill"></div>';
    Object.keys(I).forEach(function (k, i) {
      html += '<button class="pitem" role="menuitem" type="button" data-kind="' + k + '" style="--i:' + i + '"><svg class="pic" viewBox="0 0 24 24" aria-hidden="true">' + I[k] + '</svg>' + LAB[k] + '</button>';
    });
    menu.innerHTML = html + '</div>'; chat.insertBefore(menu, cw);
    var pill = $('#ppill', menu), items = Array.prototype.slice.call(menu.querySelectorAll('.pitem'));
    var open = false, pd = null, skip = false;

    function setHover(i) {
      items.forEach(function (el, k) { el.classList.toggle('hover', k === i); });
      if (i === null || i < 0) { pill.classList.remove('on'); return; }
      var y = (i * 56) + 'px';
      if (!pill.classList.contains('on')) { pill.style.transition = 'none'; pill.style.setProperty('--y', y); void pill.offsetWidth; pill.style.transition = ''; }
      pill.style.setProperty('--y', y); pill.classList.add('on');
    }
    function set(v) {
      if (open === v) return; open = v;
      chat.classList.toggle('plus-open', v); att.setAttribute('aria-expanded', v ? 'true' : 'false');
      if (!v) setHover(null);
    }
    function choose(kind) {
      pill.classList.add('tap'); setTimeout(function () { pill.classList.remove('tap'); }, 180);
      if (kind === 'voice') { var m = $('#mic'); if (m) m.click(); }
      else {
        if (kind === 'photo') fileIn.setAttribute('accept', 'image/*');
        else if (kind === 'video') fileIn.setAttribute('accept', 'video/*');
        else fileIn.removeAttribute('accept');
        fileIn.click();                      /* синхронно: Safari требует жест пользователя */
      }
      setTimeout(function () { set(false); }, 120);
    }
    fileIn.addEventListener('change', function () { setTimeout(function () { fileIn.removeAttribute('accept'); }, 0); });
    function itemAt(x, y) { var el = document.elementFromPoint(x, y); var it = el && el.closest && el.closest('.pitem'); return it ? items.indexOf(it) : -1; }

    att.onclick = function (e) {
      if (skip) { skip = false; return; }
      if (pd && pd.opened) { pd = null; return; }
      set(!open);
    };
    att.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pd = { x: e.clientX, y: e.clientY, moved: false, opened: !open };
      if (!open) { set(true); hap('light'); }
    });
    att.addEventListener('pointermove', function (e) {
      if (!pd || e.pointerType === 'mouse') return;
      if (!pd.moved && Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 12) pd.moved = true;
      if (pd.moved) { var i = itemAt(e.clientX, e.clientY); if (i !== pd.hov) { pd.hov = i; setHover(i); if (i >= 0) hap('light'); } }
    });
    function up(e) {
      if (!pd) return;
      var d = pd;
      if (d.moved && e.pointerType !== 'mouse') {
        skip = true; setTimeout(function () { skip = false; }, 350);
        var i = itemAt(e.clientX, e.clientY);
        if (i >= 0) choose(items[i].getAttribute('data-kind')); else set(false);
        pd = null;
      }
    }
    addEventListener('pointerup', up); addEventListener('pointercancel', function () { pd = null; });
    items.forEach(function (it, i) {
      it.addEventListener('mouseenter', function () { setHover(i); });
      it.addEventListener('focus', function () { setHover(i); });
      it.addEventListener('click', function () { choose(it.getAttribute('data-kind')); });
    });
    menu.addEventListener('mouseleave', function () { setHover(null); });
    scrim.addEventListener('click', function () { set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) set(false); });
    new MutationObserver(function () { if (chat.hidden) set(false); }).observe(chat, { attributes: true, attributeFilter: ['hidden'] });
    window.IOS.closePlus = function () { set(false); };
  });

  /* ---------- жест «назад»: тянем чат от левого края, список подъезжает снизу ---------- */
  guard('swipe-back', function () {
    var chat = $('#chat'), home = $('#home'), back = $('#back'); if (!chat || !home || !back) return;
    var g = null, ZONE = 48;
    chat.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || !mobile() || chat.hidden || e.clientX > ZONE) return;
      if (typeof SEL !== 'undefined' && SEL) return;
      g = { x: e.clientX, y: e.clientY, on: false, id: e.pointerId, lx: e.clientX, lt: performance.now(), v: 0 };
    }, { passive: true });
    function begin() {
      g.on = true; root.classList.add('no-nav-anim');
      var a = document.activeElement; if (a && a.blur && /INPUT|TEXTAREA/.test(a.tagName)) a.blur();
      home.hidden = false; home.classList.add('swipe-under'); chat.classList.add('swiping');
      chat.style.transition = 'none'; home.style.transition = 'none';
      home.style.setProperty('--ux', '-28%'); home.style.opacity = '.6';
    }
    addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      var dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }
        if (dx > 10) begin(); else return;
      }
      var W = innerWidth, x = Math.max(0, dx - 10), p = Math.min(1, x / W), now = performance.now();
      g.v = (e.clientX - g.lx) / Math.max(1, now - g.lt); g.lx = e.clientX; g.lt = now;
      chat.style.transform = 'translate3d(' + x + 'px,0,0)';
      home.style.setProperty('--ux', (-28 * (1 - p)) + '%'); home.style.opacity = String(.6 + .4 * p);
    }, { passive: true });
    function finish(cancelled) {
      if (!g) return; var s = g; g = null; if (!s.on) return;
      var W = innerWidth, cur = new DOMMatrixReadOnly(getComputedStyle(chat).transform).m41;
      var commit = !cancelled && (cur > W * .38 || s.v > .55);
      var ms = noMotion() ? 1 : 460, ease = 'cubic-bezier(.32,.72,0,1)';
      chat.style.transition = 'transform ' + ms + 'ms ' + ease; home.style.transition = 'transform ' + ms + 'ms ' + ease + ',opacity ' + ms + 'ms';
      if (commit) {
        chat.style.transform = 'translate3d(' + W + 'px,0,0)'; home.style.setProperty('--ux', '0%'); home.style.opacity = '1';
        hap('light');
        setTimeout(function () {
          try { back.click(); } catch (_) {}
          cleanup();
        }, ms);
      } else {
        chat.style.transform = 'translate3d(0,0,0)'; home.style.setProperty('--ux', '-28%'); home.style.opacity = '.6';
        setTimeout(function () { home.hidden = true; cleanup(); }, ms);
      }
    }
    function cleanup() {
      chat.style.transition = chat.style.transform = ''; home.style.transition = home.style.opacity = '';
      home.style.removeProperty('--ux'); home.classList.remove('swipe-under'); chat.classList.remove('swiping');
      setTimeout(function () { root.classList.remove('no-nav-anim'); }, 80);
    }
    addEventListener('pointerup', function () { finish(false); });
    addEventListener('pointercancel', function () { finish(true); });
  });

  /* ---------- шиты: тянем вниз, чтобы закрыть ---------- */
  guard('sheet-drag', function () {
    var ov = $('#sheet'); if (!ov) return;
    var g = null;
    ov.addEventListener('pointerdown', function (e) {
      var sh = e.target.closest('.sh'); if (!sh || e.pointerType === 'mouse' || !mobile()) return;
      if (e.target.closest('input,textarea,select,[contenteditable],audio,video')) return;
      var r = sh.getBoundingClientRect();
      if (e.clientY - r.top > 64 && sh.scrollTop > 0) return;
      g = { sh: sh, x: e.clientX, y: e.clientY, id: e.pointerId, on: false, ly: e.clientY, lt: performance.now(), v: 0 };
    }, { passive: true });
    addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      var dy = e.clientY - g.y, dx = e.clientX - g.x;
      if (!g.on) {
        if (dy < -8 || Math.abs(dx) > 14) { g = null; return; }
        if (dy > 8 && g.sh.scrollTop <= 0) { g.on = true; g.sh.classList.add('dragging'); } else return;
      }
      var now = performance.now(); g.v = (e.clientY - g.ly) / Math.max(1, now - g.lt); g.ly = e.clientY; g.lt = now;
      var y = dy > 0 ? dy : dy / (1 + Math.abs(dy) / 60);
      g.sh.style.transform = 'translate3d(0,' + y + 'px,0)';
      ov.style.setProperty('--so', String(Math.max(.15, 1 - dy / 420)));
      ov.style.opacity = ov.style.getPropertyValue('--so');
    }, { passive: true });
    function end(cancel) {
      if (!g) return; var s = g; g = null; if (!s.on) return;
      var dy = (new DOMMatrixReadOnly(getComputedStyle(s.sh).transform)).m42;
      var commit = !cancel && (dy > 110 || s.v > .6);
      if (commit) {
        s.sh.style.transition = 'transform .38s cubic-bezier(.32,.72,0,1)'; ov.style.transition = 'opacity .38s';
        s.sh.style.transform = 'translate3d(0,115%,0)'; ov.style.opacity = '0';
        setTimeout(function () {
          root.classList.add('reduce-motion');
          try { closeSheet(); } finally { root.classList.remove('reduce-motion'); }
          ov.style.transition = ov.style.opacity = ''; ov.style.removeProperty('--so');
        }, 380);
      } else {
        s.sh.classList.remove('dragging');
        s.sh.style.transition = 'transform .55s var(--spring)'; s.sh.style.transform = '';
        ov.style.transition = 'opacity .4s'; ov.style.opacity = '';
        setTimeout(function () { s.sh.style.transition = ''; ov.style.transition = ''; ov.style.removeProperty('--so'); }, 560);
      }
    }
    addEventListener('pointerup', function () { end(false); });
    addEventListener('pointercancel', function () { end(true); });
  });

  /* ---------- свайп по чату в списке: закрепить / без звука / в архив ---------- */
  guard('row-swipe', function () {
    var CLL = $('#clist'); if (!CLL) return;
    var W = 212, g = null;
    var SVG = {
      pin: '<path d="M9 4h6l-1 6 3 3v2h-5v5l-1 1-1-1v-5H5v-2l3-3z"/>',
      mute: '<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4M4 4l16 16"/>',
      arch: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>'
    };
    function acts(row) {
      var a = row.querySelector('.sw-act'); if (a) return a;
      var c = (typeof C !== 'undefined') && C[row.dataset.c], m = c && c.my; if (!m) return null;
      a = document.createElement('div'); a.className = 'sw-act';
      a.innerHTML = '<button class="a-pin" data-f="pinned" type="button"><svg viewBox="0 0 24 24">' + SVG.pin + '</svg>' + (m.pinned ? 'Открепить' : 'Закрепить') + '</button>' +
        '<button class="a-mute" data-f="muted" type="button"><svg viewBox="0 0 24 24">' + SVG.mute + '</svg>' + (m.muted ? 'Звук' : 'Без звука') + '</button>' +
        '<button class="a-arch" data-f="archived" type="button"><svg viewBox="0 0 24 24">' + SVG.arch + '</svg>Архив</button>';
      a.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-f]'); if (!b) return;
        ev.stopPropagation();
        var f = b.dataset.f, cc = C[row.dataset.c]; if (!cc || !cc.my) return;
        if (typeof flag === 'function') flag(cc, f, !cc.my[f]);
      });
      row.insertBefore(a, row.firstChild); return a;
    }
    function setX(row, x) { row.style.setProperty('--sx', x + 'px'); }
    function closeAll(except) {
      CLL.querySelectorAll('.crow.sw-open').forEach(function (r) { if (r !== except) { r.classList.remove('sw-open'); setX(r, 0); } });
    }
    CLL.addEventListener('pointerdown', function (e) {
      closeAll(e.target.closest('.crow'));
      if (e.pointerType === 'mouse' || !mobile() || (typeof TAB !== 'undefined' && TAB !== 'chats')) return;
      var r = e.target.closest('.crow[data-c]'); if (!r || r.classList.contains('arch') || e.target.closest('.sw-act')) return;
      g = { r: r, x: e.clientX, y: e.clientY, on: false, id: e.pointerId, base: r.classList.contains('sw-open') ? -W : 0, lx: e.clientX, lt: performance.now(), v: 0 };
    }, { passive: true });
    addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      var dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) { if (!acts(g.r)) { g = null; return; } g.on = true; g.r.classList.add('swiping'); }
        else return;
      }
      var now = performance.now(); g.v = (e.clientX - g.lx) / Math.max(1, now - g.lt); g.lx = e.clientX; g.lt = now;
      var x = g.base + dx; if (x > 0) x = x / 4; else if (x < -W) x = -W + (x + W) / 3;
      setX(g.r, x);
      if (typeof suppressChatClickUntil !== 'undefined') suppressChatClickUntil = Date.now() + 700;
    }, { passive: true });
    function end() {
      if (!g) return; var s = g; g = null; if (!s.on) return;
      var x = parseFloat(s.r.style.getPropertyValue('--sx')) || 0;
      s.r.classList.remove('swiping');
      var openIt = (x < -W * .45) || (s.v < -.5);
      if (s.v > .5) openIt = false;
      s.r.classList.toggle('sw-open', openIt); setX(s.r, openIt ? -W : 0);
      if (openIt) hap('light');
      if (typeof suppressChatClickUntil !== 'undefined') suppressChatClickUntil = Date.now() + 700;
    }
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    CLL.addEventListener('scroll', function () { closeAll(null); }, { passive: true });
  });

  /* ---------- вибро при открытии меню сообщения ---------- */
  guard('ctx-haptic', function () {
    var ctx = $('#ctx'); if (!ctx) return;
    new MutationObserver(function () { if (!ctx.hidden) hap('medium'); }).observe(ctx, { attributes: true, attributeFilter: ['hidden'] });
  });

  /* ==========================================================================
     Экран приветствия
     ========================================================================== */
  guard('welcome', function () {
    var wl = $('#wl'), auth = $('#auth'); if (!wl || !auth) return;
    var sheetEl = $('#wlSheet'), titleEl = $('#wlT'), subEl = $('#wlSub'), em = $('#em');
    var finePointer = matchMedia('(pointer:fine)').matches;
    function mode() { try { return authMode; } catch (_) { return 'in'; } }
    function setTitle() {
      var up = mode() === 'up';
      titleEl.textContent = up ? 'Создать аккаунт' : 'С возвращением';
      subEl.textContent = up ? 'Почта и пароль от 6 символов — этого достаточно' : 'Войдите по почте и паролю';
    }
    var orig = window.authUI;
    if (typeof orig === 'function') window.authUI = function () { var r = orig.apply(this, arguments); setTitle(); return r; };
    function openSheet(m) {
      try { authMode = m; } catch (_) {}
      try { authUI(); } catch (_) {}
      setTitle(); wl.classList.add('open'); sheetEl.setAttribute('aria-hidden', 'false');
      if (finePointer) setTimeout(function () { try { em.focus({ preventScroll: true }); } catch (_) {} }, 500);
    }
    function closeSheetW() {
      wl.classList.remove('open'); sheetEl.setAttribute('aria-hidden', 'true');
      var a = document.activeElement; if (a && a.blur && sheetEl.contains(a)) a.blur();
    }
    $('#wlIn').addEventListener('click', function () { openSheet('in'); });
    $('#wlUp').addEventListener('click', function () { openSheet('up'); });
    $('#wlX').addEventListener('click', closeSheetW);
    $('.wl-scrim', wl).addEventListener('click', closeSheetW);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && wl.classList.contains('open')) closeSheetW(); });
    em.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#pw').focus(); } });
    new MutationObserver(function () { if (auth.hidden) closeSheetW(); }).observe(auth, { attributes: true, attributeFilter: ['hidden'] });
    setTitle();

    /* свайп вниз по шиту закрывает его */
    var g = null;
    sheetEl.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || e.target.closest('input,button,a')) return;
      g = { y: e.clientY, id: e.pointerId, on: false };
    }, { passive: true });
    addEventListener('pointermove', function (e) {
      if (!g || e.pointerId !== g.id) return;
      var dy = e.clientY - g.y;
      if (dy > 6) { g.on = true; sheetEl.classList.add('drag'); sheetEl.style.transform = 'translateY(' + dy + 'px)'; }
    }, { passive: true });
    function gend() {
      if (!g) return; var s = g; g = null; if (!s.on) return;
      var dy = new DOMMatrixReadOnly(getComputedStyle(sheetEl).transform).m42;
      sheetEl.classList.remove('drag'); sheetEl.style.transform = '';
      if (dy > 90) closeSheetW();
    }
    addEventListener('pointerup', gend); addEventListener('pointercancel', gend);

    /* ---------- звезда из чёрточек: перетаскивание раздвигает, тап рассыпает ---------- */
    var box = $('#star'); if (!box) return;
    var stage = box.parentNode, cv = document.createElement('canvas'); box.appendChild(cv);
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var N = 17, T = 9.33, dashes = [], size = 0, dpr = 1;
    var rnd = Math.random, smooth = function (x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      dashes.push({ gx: (i / (N - 1)) * 2 - 1, gy: (j / (N - 1)) * 2 - 1, a: rnd() * Math.PI, ox: rnd() * 2 - 1, oy: rnd() * 2 - 1, len: .8 + rnd() * .5, al: .45 + rnd() * .5, ph: rnd() * 6.28, fx: 0, fy: 0 });
    }
    function resize() { dpr = Math.min(window.devicePixelRatio || 1, 2); size = box.clientWidth || 280; cv.width = cv.height = Math.round(size * 1.8 * dpr); }
    var ptr = { x: 0, y: 0, on: false }, tapT = 0, tapE = 0, timer = 0, down = null, phase = 1.2;
    function local(e) { var r = cv.getBoundingClientRect(), k = size * 1.8 / r.width; ptr.x = (e.clientX - r.left) * k; ptr.y = (e.clientY - r.top) * k; }
    function tap() { tapT = 1; hap('medium'); clearTimeout(timer); timer = setTimeout(function () { phase = .17 * T; tapT = 0; }, 1000); }
    stage.addEventListener('pointerdown', function (e) { local(e); ptr.on = true; down = { t: performance.now(), x: e.clientX, y: e.clientY }; });
    stage.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse' || down) { local(e); ptr.on = true; } });
    stage.addEventListener('pointerup', function (e) {
      if (down && performance.now() - down.t < 400 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12) tap();
      down = null; if (e.pointerType !== 'mouse') ptr.on = false;
    });
    stage.addEventListener('pointercancel', function () { down = null; ptr.on = false; });
    stage.addEventListener('pointerleave', function () { ptr.on = false; });
    function draw(dt) {
      phase += dt;
      tapE += (tapT - tapE) * Math.min(1, dt * (tapT ? 6 : 2.6));
      var wave = 1 - tapE, order = smooth((wave - .12) / .7), scale = (.42 + .58 * smooth((wave - .05) / .8)) * (1 - .35 * tapE);
      var R = size * .5 * .84, L = size * .034, c = size * .9, spin = phase * .35, chaosK = 1 - .35 * tapE;
      var rad = size * .24, push = size * .2 * (1 - tapE), chaos = 1 - order, ease = Math.min(1, dt * 9);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size * 1.8, size * 1.8);
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, size * .0042);
      for (var k = 0; k < dashes.length; k++) {
        var d = dashes[k];
        var x = c + d.gx * R * scale + chaos * d.ox * R * .34 * chaosK + Math.sin(phase * 1.7 + d.ph) * chaos * size * .012;
        var y = c + d.gy * R * scale + chaos * d.oy * R * .34 * chaosK + Math.cos(phase * 1.3 + d.ph) * chaos * size * .012;
        var tx = 0, ty = 0;
        if (ptr.on && push > 0) {
          var dx0 = x - ptr.x, dy0 = y - ptr.y, dist = Math.hypot(dx0, dy0);
          if (dist < rad) { var f = Math.pow(1 - dist / rad, 1.5) * push, u = dist || 1; tx = dx0 / u * f; ty = dy0 / u * f; }
        }
        d.fx += (tx - d.fx) * ease; d.fy += (ty - d.fy) * ease; x += d.fx; y += d.fy;
        var tan = Math.atan2(d.gy, d.gx) + Math.PI / 2 + Math.sin(spin + d.ph * .1) * .06;
        var rand = d.a + phase * .9 * chaos * (d.ph > 3 ? 1 : -1);
        var diff = Math.atan2(Math.sin(tan - rand), Math.cos(tan - rand)), ang = rand + diff * order;
        var hl = L * d.len * (.55 + .45 * scale) / 2;
        ctx.strokeStyle = 'rgba(255,255,255,' + (d.al * (.7 + .3 * order)) + ')';
        ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * hl, y - Math.sin(ang) * hl); ctx.lineTo(x + Math.cos(ang) * hl, y + Math.sin(ang) * hl); ctx.stroke();
      }
    }
    resize(); addEventListener('resize', function () { resize(); if (still) draw(0); });
    var still = matchMedia('(prefers-reduced-motion:reduce)').matches;
    if (still) { draw(0); return; }
    var last = performance.now(), running = false;
    function loop(now) {
      if (auth.hidden || document.hidden) { running = false; return; }
      var dt = Math.min(.05, (now - last) / 1000); last = now; draw(dt); requestAnimationFrame(loop);
    }
    function kick() { if (running || auth.hidden || document.hidden) return; running = true; last = performance.now(); resize(); requestAnimationFrame(loop); }
    new MutationObserver(kick).observe(auth, { attributes: true, attributeFilter: ['hidden'] });
    document.addEventListener('visibilitychange', kick);
    kick();
  });
})();

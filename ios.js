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

    /* ---------- кнопка «Войти или зарегистрироваться» → выбор ---------- */
    var enterBtn = $('#wlEnter'), noteEl = $('#wlNote'), choicesEl = $('#wlChoices'), h1 = $('#wlH');
    if (enterBtn && choicesEl) enterBtn.addEventListener('click', function () {
      enterBtn.classList.add('out'); if (noteEl) noteEl.style.opacity = 0;
      setTimeout(function () { enterBtn.style.display = 'none'; if (noteEl) noteEl.style.display = 'none'; choicesEl.classList.add('show'); }, 220);
    });

    /* ---------- цветок из палочек: оптимизированная отрисовка ----------
       • палочки сгруппированы по цвету → ~60 вызовов stroke() вместо ~1500
       • один requestAnimationFrame на цветок и фон, пауза при скрытии/закрытии
       • свечение двигается через transform/opacity (без перерисовки градиента)
       • авто-снижение качества, если кадры дольше ~40 мс */
    var box = $('#star'); if (!box) return;
    var stage = box.parentNode, cv = document.createElement('canvas'); box.appendChild(cv);
    var ctx = cv.getContext('2d'); if (!ctx) return;
    var glowEl = $('#wlGlow'), bgc = $('#wlBg'), bx = bgc && bgc.getContext('2d');
    var root = document.documentElement;
    var rnd = Math.random, PI2 = Math.PI * 2;
    var smooth = function (x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
    var LAY = 5, PET = 8, PER = 34, CEN = 150, bl = [0, 0, 0, 0, 0];
    var prof = function (u) { return Math.pow(Math.sin(Math.PI * Math.pow(u, .75)), .7); };
    var items = [], bins = [];

    for (var l = 0; l < LAY; l++) {
      var t0 = l / (LAY - 1), lr = .46 + .54 * t0, off = l * (PI2 / PET) * .37;
      for (var k = 0; k < PET; k++) for (var qq = 0; qq < PER; qq++) {
        var u = .1 + .9 * Math.pow(rnd(), .8), v = rnd() + rnd() - 1, hw = Math.PI / PET * 1.25 * prof(u), th = off + k * PI2 / PET;
        items.push({ c: 0, l: l, th: th, u: u, v: v, hw: hw, lr: lr, oj: rnd() * 2 - 1, ph: rnd() * 6.28, len: .8 + rnd() * .5,
          sat: Math.round((88 + t0 * 12) / 4) * 4, lt: Math.round((86 - t0 * 24 + rnd() * 8 - 4) / 5) * 5, h: 330, al: Math.round((.55 + rnd() * .45) * 4) / 4,
          ox: rnd() * 2 - 1, oy: rnd() * 2 - 1, fx: 0, fy: 0, tx: 0, ty: 0, tg: 0, bin: 0,
          hx: Math.cos(th + v * hw) * u * lr, hy: Math.sin(th + v * hw) * u * lr });
      }
    }
    for (var ci = 0; ci < CEN; ci++) {
      var a0 = rnd() * PI2, r0 = Math.sqrt(rnd()) * .17, w = rnd() < .25;
      items.push({ c: 1, a0: a0, r0: r0, a: rnd() * Math.PI, ph: rnd() * 6.28, len: .7 + rnd() * .5, al: Math.round((.7 + rnd() * .3) * 4) / 4,
        h: w ? 42 : 335, sat: 100, lt: w ? 82 : 93, ox: rnd() * 2 - 1, oy: rnd() * 2 - 1, fx: 0, fy: 0, tx: 0, ty: 0, tg: 0, bin: 0,
        hx: Math.cos(a0) * r0, hy: Math.sin(a0) * r0 });
    }

    /* цель для палочек при удержании: логотип «speekly.» */
    function buildLogo() {
      var W2 = 640, H2 = 200, c2 = document.createElement('canvas'); c2.width = W2; c2.height = H2;
      var g = c2.getContext('2d', { willReadFrequently: true }); if (!g) return false;
      g.font = '800 120px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'; g.textBaseline = 'alphabetic';
      var w1 = g.measureText('speekly').width, wd = g.measureText('.').width, x0 = (W2 - (w1 + wd - 6)) / 2;
      g.fillStyle = '#fff'; g.fillText('speekly', x0, 150); g.fillStyle = '#f0f'; g.fillText('.', x0 + w1 - 6, 150);
      var d = g.getImageData(0, 0, W2, H2).data, Lw = [], Dp = [], x1 = 1e9, x2 = -1e9, y1 = 1e9, y2 = -1e9;
      for (var y = 0; y < H2; y += 2) for (var x = 0; x < W2; x += 2) {
        var i = (y * W2 + x) * 4;
        if (d[i + 3] > 128) { (d[i + 1] < 128 ? Dp : Lw).push([x, y]); if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
      }
      if (!Lw.length) return false;
      var kk = 2 / (x2 - x1), cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, total = items.length;
      var dn = Dp.length ? Math.max(90, Math.round(total * Dp.length / (Lw.length + Dp.length))) : 0, ln = total - dn;
      function pick(arr, n, pink) { var out = []; for (var i = 0; i < n && arr.length; i++) { var p = arr[(rnd() * arr.length) | 0]; out.push({ x: (p[0] - cx + rnd() * 2 - 1) * kk, y: (p[1] - cy + rnd() * 2 - 1) * kk, pk: pink }); } return out; }
      var pts = pick(Lw, ln, 0).concat(pick(Dp, dn, 1));
      while (pts.length < total) pts.push(pts[pts.length - 1] || { x: 0, y: 0, pk: 0 });
      pts.sort(function (a, b) { return Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x); });
      items.slice().sort(function (a, b) { return Math.atan2(a.hy, a.hx) - Math.atan2(b.hy, b.hx); }).forEach(function (p, i) { p.tx = pts[i].x; p.ty = pts[i].y; p.tg = pts[i].pk; });
      return true;
    }
    var logoOk = false; try { logoOk = buildLogo(); } catch (_) {}

    /* группы по цвету: одинаковые палочки рисуются одним путём */
    (function () {
      var map = {};
      items.forEach(function (p) {
        var key = p.c + '|' + p.h + '|' + p.sat + '|' + p.lt + '|' + p.al + '|' + p.tg;
        if (map[key] === undefined) { map[key] = bins.length; bins.push({ h: p.h, sat: p.sat, lt: p.lt, al: p.al, tg: p.tg, base: 'hsl(' + p.h + ' ' + p.sat + '% ' + p.lt + '%)' }); }
        p.bin = map[key];
      });
      items.sort(function (a, b) { return a.bin - b.bin; });
    })();

    /* ---- качество ---- */
    var q = (root.classList.contains('perf-low') ? 2 : 0), DPR_CAP = [2, 1.5, 1, 1], KEEP = [20, 20, 20, 13];
    var size = 0, dpr = 1, rect = null;
    function resize() {
      var pw = stage.clientWidth || 300, ph = stage.clientHeight || 300;
      var s = Math.max(120, Math.min(pw * .88, 340, ph));
      box.style.width = box.style.height = s + 'px';
      size = s; dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP[q]);
      var px = Math.round(size * dpr); if (cv.width !== px) cv.width = cv.height = px;
      rect = null;
    }
    function getRect() { return rect || (rect = cv.getBoundingClientRect()); }

    /* ---- ввод ---- */
    var phrases = ['Тебе здесь рады', 'Давай начнём', 'Здесь тебя услышат', 'Твой голос важен', 'Твоё общение начинается здесь'], pi = 0;
    function say() { if (!h1) return; h1.classList.add('swap'); setTimeout(function () { h1.textContent = phrases[pi++ % phrases.length]; h1.classList.remove('swap'); }, 180); }
    var ptr = { x: 0, y: 0, on: false }, down = false, downAt = 0, holdT = 0, form = 0, sx = 0, sy = 0, dragging = false, held = false;
    var burst = 0, burstTarget = 0, timer = 0, sparks = [];
    function local(e) { var r = getRect(); ptr.x = (e.clientX - r.left) * size / r.width; ptr.y = (e.clientY - r.top) * size / r.height; }
    function tap() {
      burstTarget = 1; clearTimeout(timer); timer = setTimeout(function () { burstTarget = 0; }, 950);
      var hues = [330, 285, 200, 45], kk = size / 390, n = q >= 3 ? 18 : 30;
      for (var i = 0; i < n; i++) { var a = rnd() * PI2, sp = (90 + rnd() * 230) * kk, lf = .7 + rnd() * .5; sparks.push({ x: ptr.x, y: ptr.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40 * kk, life: lf, max: lf, h: hues[i % 4] + rnd() * 20 }); }
      hap('medium'); say(); kick();
    }
    stage.addEventListener('pointerdown', function (e) { rect = null; local(e); ptr.on = true; down = true; holdT = 0; held = false; downAt = performance.now(); sx = e.clientX; sy = e.clientY; dragging = false; try { stage.setPointerCapture(e.pointerId); } catch (_) {} kick(); });
    stage.addEventListener('pointermove', function (e) {
      if (down || e.pointerType === 'mouse' || e.buttons) { local(e); ptr.on = true; if (!running) kick(); }
      if (down && form < .5 && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) dragging = true;
    });
    stage.addEventListener('pointerup', function (e) { local(e); var short = performance.now() - downAt < 250; down = false; ptr.on = false; if (short && !dragging) tap(); });
    stage.addEventListener('pointercancel', function () { down = false; ptr.on = false; });
    stage.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') ptr.on = false; });

    /* ---- отрисовка цветка ---- */
    var phase = .2, glow = { x: 0, y: 0, a: 1 }, lgx = 1e9, lgy = 1e9, lga = 1e9;
    var keepN = KEEP[q];
    function draw(dt) {
      phase += dt;
      burst += (burstTarget - burst) * Math.min(1, dt * (burstTarget ? 6 : 2.6));
      if (down) holdT += dt; else holdT = 0;
      var ft = logoOk && down && !dragging && holdT > .35 ? 1 : 0;
      if (ft && !held) { held = true; hap('light'); } else if (!ft) held = false;
      form += (ft - form) * Math.min(1, dt * (ft ? 5 : 3.2));
      var c = size / 2, R = size * .40, push = size * .2 * (1 - burst), pulse = 1 + .015 * Math.sin(phase * 9) * form;
      var tc = (phase % 12) / 12, bloom = tc < .4 ? smooth(tc / .4) : tc < .66 ? 1 : 1 - .9 * smooth((tc - .66) / .34);
      var sp = 1 + .10 * bloom + .035 * Math.sin(phase * 2.4) * bloom + .12 * burst, puff = Math.min(1, bloom * (.7 + .3 * Math.sin(phase * 1.1 + 1)) + burst * .5);
      for (var l = 0; l < LAY; l++) bl[l] = smooth((bloom - l * .09) / .64);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, size * .0042);
      var fl = size * (.007 + .013 * puff), pr = size * .24, ease = Math.min(1, dt * 9), usePtr = ptr.on && form < .5;
      var t1 = phase * 1.7, t2 = phase * 1.3, bk = burst * .18 * R, Lb = size * .015, morph = form > .01, fa = form * .4;
      var cur = -1, n = items.length;
      for (var i = 0; i < n; i++) {
        if (keepN < 20 && (i % 20) >= keepN) continue;
        var p = items[i], x, y, ang;
        if (p.c) { var rr = p.r0 * R * (.55 + .45 * bloom) * sp, aa = p.a0 + Math.sin(phase * .5 + p.ph) * .15; x = c + Math.cos(aa) * rr; y = c + Math.sin(aa) * rr; ang = p.a + phase * .12; }
        else { var kb = bl[p.l], r = R * (.05 + .03 * p.l) * (1 - kb * .4) + p.u * p.lr * R * sp * kb, a = p.th + (1 - kb) * 1.4 * (1 + p.l * .25) + p.v * p.hw; x = c + Math.cos(a) * r; y = c + Math.sin(a) * r; ang = a + p.oj * (.3 + puff * .9); }
        x += Math.sin(t1 + p.ph) * fl + bk * p.ox; y += Math.cos(t2 + p.ph) * fl + bk * p.oy;
        if (usePtr) {
          var dx = x - ptr.x, dy = y - ptr.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < pr) { var f = Math.pow(1 - d / pr, 1.5) * push, uu = d || 1; p.fx += (dx / uu * f - p.fx) * ease; p.fy += (dy / uu * f - p.fy) * ease; } else { p.fx *= .88; p.fy *= .88; }
        } else { p.fx *= .9; p.fy *= .9; }
        x += p.fx; y += p.fy;
        if (morph) { x += (c + p.tx * R * .9 * pulse - x) * form; y += (c + p.ty * R * .9 * pulse - y) * form; }
        if (p.bin !== cur) {
          if (cur >= 0) ctx.stroke();
          cur = p.bin; var b = bins[cur];
          if (morph) {
            ctx.strokeStyle = b.tg ? 'hsl(' + (b.h + (324 - b.h) * form).toFixed(0) + ' ' + (b.sat + (100 - b.sat) * form).toFixed(0) + '% ' + (b.lt + (65 - b.lt) * form).toFixed(0) + '%)'
              : 'hsl(' + b.h + ' ' + (b.sat * (1 - form)).toFixed(0) + '% ' + (b.lt + (100 - b.lt) * form).toFixed(0) + '%)';
          } else ctx.strokeStyle = b.base;
          ctx.globalAlpha = Math.min(1, b.al + fa);
          ctx.beginPath();
        }
        var Ln = Lb * p.len * (1 - form * .3) * (p.c ? 1 : .85 + .35 * puff), ca = Math.cos(ang), sa = Math.sin(ang);
        ctx.moveTo(x, y); ctx.lineTo(x + ca * Ln, y + sa * Ln);
      }
      if (cur >= 0) ctx.stroke();
      /* искры при тапе */
      if (sparks.length) {
        ctx.lineWidth = Math.max(1.4, size * .007);
        for (var s = sparks.length - 1; s >= 0; s--) {
          var sk = sparks[s]; sk.life -= dt; if (sk.life <= 0) { sparks.splice(s, 1); continue; }
          sk.x += sk.vx * dt; sk.y += sk.vy * dt; sk.vx *= .97; sk.vy = sk.vy * .97 + size * .5 * dt;
          ctx.globalAlpha = sk.life / sk.max; ctx.strokeStyle = 'hsl(' + sk.h.toFixed(0) + ' 95% 65%)';
          ctx.beginPath(); ctx.moveTo(sk.x, sk.y); ctx.lineTo(sk.x - sk.vx * .03, sk.y - sk.vy * .03); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      /* свечение: только transform/opacity, и только при заметном сдвиге */
      var ge = Math.min(1, dt * 4), gxT = ptr.on ? (ptr.x - c) * .35 : 0, gyT = ptr.on ? (ptr.y - c) * .35 : 0, gaT = 1 + (ptr.on ? .35 : 0) + form * .5 + burst * .4;
      glow.x += (gxT - glow.x) * ge; glow.y += (gyT - glow.y) * ge; glow.a += (gaT - glow.a) * ge;
      if (glowEl && (Math.abs(glow.x - lgx) + Math.abs(glow.y - lgy) > .2 || Math.abs(glow.a - lga) > .006)) {
        glowEl.style.transform = 'translate3d(' + glow.x.toFixed(1) + 'px,' + glow.y.toFixed(1) + 'px,0)';
        glowEl.style.opacity = Math.min(1, glow.a / 2.25).toFixed(3);
        lgx = glow.x; lgy = glow.y; lga = glow.a;
      }
    }

    /* ---- фон: пылинки и пузыри (30 кадров/с, без ретина-разрешения) ---- */
    var W = 0, H = 0, bdpr = 1;
    var dust = [], msgs = [];
    for (var di = 0; di < 40; di++) dust.push({ x: rnd(), y: rnd(), r: .4 + rnd() * 1.2, s: .004 + rnd() * .012, a: .1 + rnd() * .3, ph: rnd() * 6.28 });
    for (var mi = 0; mi < 7; mi++) msgs.push({ x: rnd(), y: rnd(), w: .07 + rnd() * .07, s: .012 + rnd() * .016, a: .05 + rnd() * .05, ph: rnd() * 6.28, pink: rnd() < .5 });
    function rbg() { if (!bgc) return; W = wl.clientWidth; H = wl.clientHeight; bdpr = Math.min(window.devicePixelRatio || 1, q >= 2 ? 1 : 1.5); bgc.width = Math.round(W * bdpr); bgc.height = Math.round(H * bdpr); }
    function bubble(x, y, w, h) { var r = h * .35; bx.beginPath(); bx.moveTo(x + r, y); bx.arcTo(x + w, y, x + w, y + h, r); bx.arcTo(x + w, y + h, x, y + h, r); bx.lineTo(x + w * .28, y + h); bx.lineTo(x + w * .14, y + h * 1.3); bx.lineTo(x + w * .14, y + h); bx.arcTo(x, y + h, x, y, r); bx.arcTo(x, y, x + w, y, r); bx.closePath(); }
    function drawBg(dt, now) {
      if (!bx || !W) return;
      bx.setTransform(bdpr, 0, 0, bdpr, 0, 0); bx.clearRect(0, 0, W, H);
      bx.fillStyle = '#fff';
      for (var i = 0; i < dust.length; i++) {
        var d = dust[i]; d.y -= d.s * dt; if (d.y < -.02) { d.y = 1.02; d.x = rnd(); }
        bx.globalAlpha = d.a * (.6 + .4 * Math.sin(now / 1000 * 1.4 + d.ph));
        var dx = (d.x + Math.sin(now / 4000 + d.ph) * .01) * W, dy = d.y * H;
        bx.fillRect(dx - d.r, dy - d.r, d.r * 2, d.r * 2);
      }
      var u = Math.min(W, 520); bx.lineWidth = 1;
      for (var j = 0; j < msgs.length; j++) {
        var m = msgs[j]; m.y -= m.s * dt; if (m.y < -.1) { m.y = 1.1; m.x = rnd(); }
        var w = u * m.w * 1.7, h = w * .55;
        bx.globalAlpha = m.a; bx.strokeStyle = m.pink ? '#ff4db8' : '#ffffff'; bubble(m.x * W + Math.sin(now / 3000 + m.ph) * 10, m.y * H, w, h); bx.stroke();
      }
      bx.globalAlpha = 1;
    }

    /* ---- цикл ---- */
    var still = matchMedia('(prefers-reduced-motion:reduce)').matches || root.classList.contains('reduce-motion');
    var last = performance.now(), running = false, ema = 16.7, bad = 0, bgAcc = 0, skip = 0;
    function lower() { if (q >= 3) return; q++; keepN = KEEP[q]; resize(); rbg(); }
    function loop(now) {
      if (auth.hidden || document.hidden) { running = false; return; }
      var raw = (now - last) / 1000; last = now;
      if (raw > .25) raw = .016;
      var open = wl.classList.contains('open');
      /* пока открыт лист входа — цветок рисуем реже, фон не рисуем */
      if (open && (skip ^= 1)) { requestAnimationFrame(loop); return; }
      var dt = Math.min(.05, raw * (open ? 2 : 1));
      ema += (raw * 1000 - ema) * .1;
      if (ema > 40) { if (++bad > 45) { bad = 0; ema = 16.7; lower(); } } else if (bad > 0) bad--;
      draw(dt);
      if (!open) { bgAcc += raw; if (bgAcc >= .033) { drawBg(bgAcc, now); bgAcc = 0; } }
      requestAnimationFrame(loop);
    }
    function kick() {
      if (running || auth.hidden || document.hidden) return;
      if (still) { draw(0); return; }
      running = true; last = performance.now(); requestAnimationFrame(loop);
    }
    resize(); rbg();
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); rbg(); if (still) draw(0); }).observe(wl);
    else addEventListener('resize', function () { resize(); rbg(); if (still) draw(0); });
    new MutationObserver(function () { if (!auth.hidden) { resize(); rbg(); kick(); } }).observe(auth, { attributes: true, attributeFilter: ['hidden'] });
    document.addEventListener('visibilitychange', kick);
    if (still) { draw(0); drawBg(0, 0); return; }
    kick();
  });
})();
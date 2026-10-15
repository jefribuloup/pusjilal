/*!
 * nav-progress.js - Pusjilal
 *
 * Pindah halaman tanpa reload penuh + garis progress di bawah navbar.
 * Hanya <main id="konten"> yang diganti; navbar dan footer tetap di tempat.
 *
 * Jatuh ke navigasi biasa (aman) kalau:
 *   - link keluar situs, target="_blank", download, atau punya data-no-pjax
 *   - alamat di bawah /admin atau /static/, atau file (pdf, gambar, dll)
 *   - respons bukan HTML / status bukan 200 / jaringan gagal / timeout
 *   - halaman tujuan memuat script atau stylesheet berbeda di luar <main>
 *
 * Catatan untuk script di dalam <main>:
 *   script inline di dalam <main> dijalankan ulang setiap halaman tampil.
 *   Event DOMContentLoaded tidak akan terpicu lagi; pakai event 'pjax:load':
 *     document.addEventListener('pjax:load', function () { ... });
 */
(function () {
  'use strict';

  /* ---------- Pengaturan (silakan ubah) ---------- */
  var MAIN_ID = 'konten';
  var BAR_HEIGHT = 5;                         // px, makin besar makin tebal
  var BAR_COLOR = '#f59e0b';                  // warna dasar garis
  var BAR_LIGHT = '#f59e0b';                  // warna kilau
  // var BAR_LIGHT = '#fcd34d';                  // warna kilau
  var SHOW_LOADER = true;                     // animasi di tengah layar (false = matikan)
  var LOADER_SIZE = 84;                       // px, ukuran lingkaran di tengah layar
  var LOADER_LETTER = 'P';                    // huruf di tengah lingkaran
  var LOADER_TEXT = '#1f5c4a';                // warna huruf (hijau brand)
  var MIN_VISIBLE_MS = 450;                   // garis minimal terlihat sekian ms
  var TIMEOUT_MS = 15000;                     // lewat ini, pakai navigasi biasa
  var SKIP_EXT = /\.(pdf|zip|rar|docx?|xlsx?|pptx?|csv|png|jpe?g|gif|webp|svg|ico|mp3|mp4)$/i;

  /* ---------- Syarat minimal ---------- */
  if (!window.fetch || !window.AbortController || !window.DOMParser ||
      !window.history || !history.pushState) { return; }
  var main = document.getElementById(MAIN_ID);
  if (!main) { return; }

  /* ---------- Gaya garis progress ---------- */
  var style = document.createElement('style');
  style.textContent =
    '#nav-progress{position:fixed;left:0;right:0;top:0;height:' + BAR_HEIGHT + 'px;' +
      'z-index:9999;pointer-events:none;opacity:0;transition:opacity .3s ease}' +
    '#nav-progress.on{opacity:1}' +
    '#nav-progress>i{display:block;width:100%;height:100%;transform-origin:left center;' +
      'transform:scaleX(0);background-color:' + BAR_COLOR + ';' +
      'background-image:linear-gradient(90deg,' + BAR_COLOR + ',' + BAR_LIGHT + ',' + BAR_COLOR + ');' +
      'background-size:200px 100%;box-shadow:0 0 10px rgba(245,158,11,.6);' +
      'animation:nav-progress-shimmer 1s linear infinite}' +
    '@keyframes nav-progress-shimmer{from{background-position:0 0}to{background-position:200px 0}}' +
    'main[aria-busy="true"]{opacity:.6;transition:opacity .2s ease}' +
    '#nav-loader{position:fixed;left:50%;top:50%;z-index:9998;width:' + LOADER_SIZE + 'px;' +
      'height:' + LOADER_SIZE + 'px;margin:-' + (LOADER_SIZE / 2) + 'px 0 0 -' + (LOADER_SIZE / 2) + 'px;' +
      'border-radius:50%;background:#fff;box-shadow:0 8px 28px rgba(18,56,45,.22);' +
      'pointer-events:none;opacity:0;transform:scale(.85);' +
      'transition:opacity .25s ease,transform .25s ease}' +
    '#nav-loader.on{opacity:1;transform:scale(1)}' +
    '#nav-loader svg{position:absolute;left:0;top:0;width:100%;height:100%;transform:rotate(-90deg)}' +
    '#nav-loader circle{fill:none;stroke-width:5;stroke-linecap:round}' +
    '#nav-loader .nl-track{stroke:#fef3c7}' +
    '#nav-loader .nl-ring{stroke:' + BAR_COLOR + '}' +
    '#nav-loader b{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;' +
      'justify-content:center;font:700 ' + Math.round(LOADER_SIZE * 0.36) + 'px/1 Arial,sans-serif;' +
      'color:' + LOADER_TEXT + ';animation:nav-loader-pulse 1.2s ease-in-out infinite}' +
    '@keyframes nav-loader-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}' +
    '@media (prefers-reduced-motion:reduce){#nav-progress>i,#nav-loader b{animation:none}}';
  document.head.appendChild(style);

  var wrap = document.createElement('div');
  wrap.id = 'nav-progress';
  wrap.setAttribute('aria-hidden', 'true');
  var bar = document.createElement('i');
  wrap.appendChild(bar);
  document.body.appendChild(wrap);

  /* ---------- Animasi di tengah layar (mengikuti progress) ---------- */
  var RING_R = 27;
  var RING_C = 2 * Math.PI * RING_R;
  var loader = null, ring = null;
  if (SHOW_LOADER) {
    loader = document.createElement('div');
    loader.id = 'nav-loader';
    loader.setAttribute('aria-hidden', 'true');
    loader.innerHTML =
      '<svg viewBox="0 0 64 64"><circle class="nl-track" cx="32" cy="32" r="' + RING_R + '"/>' +
      '<circle class="nl-ring" cx="32" cy="32" r="' + RING_R + '"/></svg><b>' + LOADER_LETTER + '</b>';
    document.body.appendChild(loader);
    ring = loader.querySelector('.nl-ring');
    ring.style.strokeDasharray = RING_C;
    ring.style.strokeDashoffset = RING_C;
  }

  /* ---------- Navbar: tempat garis menempel ---------- */
  function findNav(root, mainEl) {
    var found = null;
    root.querySelectorAll('header, nav').forEach(function (el) {
      if (!found && !(mainEl && mainEl.contains(el)) && !el.closest('footer')) { found = el; }
    });
    return found;
  }
  var navEl = findNav(document, main);

  function place() {
    var top = 0;
    if (navEl) {
      var bottom = navEl.getBoundingClientRect().bottom;
      top = bottom > 0 ? Math.round(bottom) : 0;
    }
    wrap.style.top = top + 'px';
  }
  window.addEventListener('scroll', function () {
    if (wrap.classList.contains('on')) { place(); }
  }, { passive: true });
  window.addEventListener('resize', place);

  /* ---------- Animasi progress ---------- */
  var progress = 0, trickle = null, hideT = null, safeT = null, startedAt = 0, active = false;

  function setProgress(p) {
    progress = p;
    bar.style.transform = 'scaleX(' + p + ')';
    if (ring) { ring.style.strokeDashoffset = RING_C * (1 - p); }
  }

  function tr(d) {                                         // transisi garis + lingkaran serempak
    bar.style.transition = d ? 'transform ' + d + ' ease-out' : 'none';
    if (ring) { ring.style.transition = d ? 'stroke-dashoffset ' + d + ' ease-out' : 'none'; }
  }

  function ui(on) {
    wrap.classList[on ? 'add' : 'remove']('on');
    if (loader) { loader.classList[on ? 'add' : 'remove']('on'); }
  }

  function start() {
    clearInterval(trickle);
    clearTimeout(hideT);
    clearTimeout(safeT);
    active = true;
    startedAt = Date.now();
    place();
    tr(null);
    setProgress(0);
    ui(true);
    void bar.offsetWidth;                                  // paksa reflow
    tr('.35s');
    setProgress(0.12);
    main.setAttribute('aria-busy', 'true');
    trickle = setInterval(function () {
      var inc = (0.92 - progress) * (0.06 + Math.random() * 0.08);
      setProgress(Math.min(0.92, progress + inc));
    }, 220);
    safeT = setTimeout(finish, 20000);                     // jaga-jaga agar tidak menggantung
  }

  function finish() {
    if (!active) { return; }
    active = false;
    clearInterval(trickle);
    clearTimeout(safeT);
    main.removeAttribute('aria-busy');
    var wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt));
    hideT = setTimeout(function () {
      tr('.25s');
      setProgress(1);
      hideT = setTimeout(function () {
        ui(false);
        hideT = setTimeout(function () {
          tr(null);
          setProgress(0);
        }, 320);
      }, 280);
    }, wait);
  }

  function reset() {
    active = false;
    clearInterval(trickle);
    clearTimeout(hideT);
    clearTimeout(safeT);
    main.removeAttribute('aria-busy');
    ui(false);
    tr(null);
    setProgress(0);
  }

  /* ---------- Pembanding aset (script/stylesheet di luar <main>) ---------- */
  function assetSig(root, mainEl) {
    var out = [];
    root.querySelectorAll('script, link[rel="stylesheet"]').forEach(function (el) {
      if (mainEl && mainEl.contains(el)) { return; }
      out.push(el.tagName + ':' + (el.getAttribute('src') || el.getAttribute('href') ||
        (el.textContent || '').trim()));
    });
    return out.join('|');
  }
  var baseSig = assetSig(document, main);

  /* ---------- Sinkronisasi bagian di luar <main> ---------- */
  function flashOf(mainEl) {
    var prev = mainEl.previousElementSibling;
    return (prev && prev.getAttribute('role') === 'status') ? prev : null;
  }

  function syncFlash(newMain) {
    var oldF = flashOf(main);
    var newF = flashOf(newMain);
    if (oldF) { oldF.remove(); }
    if (newF) { main.parentNode.insertBefore(document.importNode(newF, true), main); }
  }

  function syncNav(doc, newMain) {
    var newNav = findNav(doc, newMain);
    if (!navEl || !newNav) { return; }
    var a = navEl.querySelectorAll('a[href]');
    var b = newNav.querySelectorAll('a[href]');
    if (a.length !== b.length) { return; }
    a.forEach(function (link, i) {
      if (link.getAttribute('href') !== b[i].getAttribute('href')) { return; }
      ['class', 'aria-current'].forEach(function (attr) {
        var v = b[i].getAttribute(attr);
        if (v === null) { link.removeAttribute(attr); }
        else if (link.getAttribute(attr) !== v) { link.setAttribute(attr, v); }
      });
    });
  }

  function runScripts(root) {
    root.querySelectorAll('script').forEach(function (old) {
      var src = old.getAttribute('src');
      if (src) {
        var exists = Array.prototype.some.call(document.scripts, function (x) {
          return x !== old && x.getAttribute('src') === src;
        });
        if (exists) { old.remove(); return; }
      }
      var s = document.createElement('script');
      Array.prototype.forEach.call(old.attributes, function (at) { s.setAttribute(at.name, at.value); });
      s.text = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
  }

  function swap(doc, newMain) {
    document.title = doc.title;
    var nd = doc.querySelector('meta[name="description"]');
    var cd = document.querySelector('meta[name="description"]');
    if (nd && cd) { cd.setAttribute('content', nd.getAttribute('content') || ''); }
    syncFlash(newMain);
    syncNav(doc, newMain);
    main.className = newMain.className;
    main.innerHTML = newMain.innerHTML;
    runScripts(main);
    main.setAttribute('tabindex', '-1');
    main.style.outline = 'none';
    main.focus({ preventScroll: true });
  }

  /* ---------- Navigasi ---------- */
  var navId = 0, controller = null;
  var lastKey = location.pathname + location.search;

  function bail(href, push) {                 // jatuh ke navigasi biasa
    if (push) { location.assign(href); } else { location.reload(); }
  }

  function go(url, push, y) {
    var target = new URL(url, location.href);
    if (push) { history.replaceState({ y: window.scrollY }, ''); }
    navId += 1;
    var id = navId;
    if (controller) { controller.abort(); }
    controller = new AbortController();
    var ctl = controller, timedOut = false;
    var tm = setTimeout(function () { timedOut = true; ctl.abort(); }, TIMEOUT_MS);
    start();

    fetch(target.href, {
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'pjax' },
      signal: ctl.signal
    }).then(function (res) {
      var type = res.headers.get('content-type') || '';
      var disp = res.headers.get('content-disposition') || '';
      if (!res.ok || type.indexOf('text/html') === -1 || /attachment/i.test(disp)) {
        clearTimeout(tm);
        return bail(target.href, push);
      }
      return res.text().then(function (html) {
        clearTimeout(tm);
        if (id !== navId) { return; }
        var finalUrl = new URL(res.url || target.href);
        if (finalUrl.origin !== location.origin) { return bail(finalUrl.href, push); }
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var newMain = doc.getElementById(MAIN_ID);
        if (!newMain || assetSig(doc, newMain) !== baseSig) { return bail(finalUrl.href, push); }

        swap(doc, newMain);

        if (push) {
          if (finalUrl.href === location.href) { history.replaceState({ y: 0 }, '', finalUrl.href); }
          else { history.pushState({ y: 0 }, '', finalUrl.href); }
          var anchor = finalUrl.hash ? document.getElementById(finalUrl.hash.slice(1)) : null;
          if (anchor) { anchor.scrollIntoView(); } else { window.scrollTo(0, 0); }
        } else {
          if (finalUrl.href !== location.href) { history.replaceState(history.state, '', finalUrl.href); }
          window.scrollTo(0, y || 0);
        }
        lastKey = finalUrl.pathname + finalUrl.search;
        finish();
        document.dispatchEvent(new CustomEvent('pjax:load', { detail: { url: finalUrl.href } }));
      });
    }).catch(function (err) {
      clearTimeout(tm);
      if (err && err.name === 'AbortError' && !timedOut) { return; }   // digantikan navigasi lain
      if (id === navId) { bail(target.href, push); }
    });
  }

  /* ---------- Penangkap klik link ---------- */
  function isAdminPath(p) { return p === '/admin' || p.indexOf('/admin/') === 0; }

  function eligible(a) {
    if (a.target && a.target !== '_self') { return false; }
    if (a.hasAttribute('download') || a.hasAttribute('data-no-pjax')) { return false; }
    if (a.protocol !== 'http:' && a.protocol !== 'https:') { return false; }
    if (a.origin !== location.origin) { return false; }
    var p = a.pathname;
    if (SKIP_EXT.test(p) || isAdminPath(p) || p.indexOf('/static/') === 0) { return false; }
    if (p === location.pathname && a.search === location.search && a.hash) { return false; }
    return true;
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) { return; }
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !eligible(a)) { return; }
    e.preventDefault();
    go(a.href, true);
  });

  /* Tombol Back / Forward (abaikan jika hanya hash yang berubah) */
  window.addEventListener('popstate', function (e) {
    if (location.pathname + location.search === lastKey) { return; }
    go(location.href, false, e.state && e.state.y);
  });

  /* Kirim formulir tetap reload penuh, tapi garis progress ikut tampil */
  document.addEventListener('submit', function (e) {
    if (e.defaultPrevented) { return; }
    var t = e.target && e.target.target;
    if (t && t !== '_self') { return; }
    start();
  });

  /* Kembali dari cache browser (bfcache): bersihkan garis yang tersisa */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) { reset(); }
  });
})();

/*
 * Android editör köprüsü. Web'deki editor/commands.ts ve editor/editor.ts ile aynı davranış:
 * aynı HTML alt kümesini üretir (div, h2, b, i, u, s, ul, ol, li, ul.check, li.done).
 * Android → JS: CamEditor.load / theme / fmt / focusEnd / insert / setAtt / html
 * JS → Android: Android.onChange(html), Android.onState(json), Android.needAtt(id), Android.openAtt(id, ad)
 *
 * Ekler: <img class="att" data-att="ID"> ve <span class="file" data-att="ID">ad</span>.
 * Görüntülemek için verilen src ve contenteditable öznitelikleri kaydedilen HTML'e girmez.
 */
(function () {
  'use strict';
  var ed = document.getElementById('ed');
  var stamp = document.getElementById('stamp');
  var timer = null;
  var bridge = window.Android || { onChange: function () {}, onState: function () {}, needAtt: function () {}, openAtt: function () {} };
  var attUrls = {};

  /** Kaydedilecek HTML: görüntüleme için eklenen öznitelikler çıkarılır. */
  function cleanHtml() {
    var c = ed.cloneNode(true);
    c.querySelectorAll('img.att').forEach(function (i) { i.removeAttribute('src'); i.classList.remove('loading', 'missing'); });
    c.querySelectorAll('span.file').forEach(function (f) { f.removeAttribute('contenteditable'); });
    return c.innerHTML;
  }

  /** Eklere adres verir (Android dosyayı bulup setAtt ile döner). */
  function hydrate() {
    ed.querySelectorAll('img.att[data-att]').forEach(function (img) {
      if (img.getAttribute('src')) return;
      var id = img.getAttribute('data-att');
      if (attUrls[id]) { img.src = attUrls[id]; return; }
      img.classList.add('loading');
      bridge.needAtt(id);
    });
    ed.querySelectorAll('span.file[data-att]').forEach(function (f) { f.contentEditable = 'false'; });
  }

  function exec(cmd, val) { try { return document.execCommand(cmd, false, val); } catch (e) { return false; } }
  exec('defaultParagraphSeparator', 'div');
  exec('styleWithCSS', 'false');

  function selLi() {
    var s = getSelection();
    if (!s || !s.rangeCount) return null;
    var n = s.anchorNode;
    var el = n && (n.nodeType === 1 ? n : n.parentElement);
    var li = el && el.closest('li');
    return li && ed.contains(li) ? li : null;
  }
  function inCheck() { var li = selLi(); return li && li.parentElement.classList.contains('check') ? li : null; }

  function changed() {
    clearTimeout(timer);
    timer = setTimeout(function () { bridge.onChange(cleanHtml()); }, 300);
  }
  function flush() { clearTimeout(timer); bridge.onChange(cleanHtml()); }

  function state() {
    var ck = !!inCheck();
    var st = {};
    try {
      st.h = String(document.queryCommandValue('formatBlock')).toLowerCase() === 'h2';
      st.bold = document.queryCommandState('bold');
      st.italic = document.queryCommandState('italic');
      st.underline = document.queryCommandState('underline');
      st.strikeThrough = document.queryCommandState('strikeThrough');
      st.check = ck;
      st.insertUnorderedList = !ck && document.queryCommandState('insertUnorderedList');
      st.insertOrderedList = document.queryCommandState('insertOrderedList');
    } catch (e) {}
    bridge.onState(JSON.stringify(st));
  }

  function fmt(c) {
    if (ed.contentEditable !== 'true') return;
    ed.focus();
    if (c === 'h') {
      var v = String(document.queryCommandValue('formatBlock')).toLowerCase();
      exec('formatBlock', v === 'h2' ? 'div' : 'h2');
    } else if (c === 'check') {
      var li = selLi(), ul = li && li.parentElement;
      if (ul && ul.classList.contains('check')) exec('insertUnorderedList');
      else {
        if (!(ul && ul.tagName === 'UL')) exec('insertUnorderedList');
        var l = selLi();
        if (l) l.parentElement.classList.add('check');
      }
    } else if (c === 'insertUnorderedList' && inCheck()) {
      inCheck().parentElement.classList.remove('check');
    } else exec(c);
    changed();
    state();
  }

  ed.addEventListener('input', changed);
  ed.addEventListener('blur', flush);
  document.addEventListener('selectionchange', state);
  ed.addEventListener('click', function (e) {
    var file = e.target.closest && e.target.closest('span.file[data-att]');
    if (file) { bridge.openAtt(file.getAttribute('data-att'), file.textContent || 'dosya'); return; }
    var li = e.target.closest && e.target.closest('ul.check>li');
    if (!li || ed.contentEditable !== 'true') return;
    if (e.clientX - li.getBoundingClientRect().left < 30) {
      li.classList.toggle('done');
      changed();
    }
  });
  ed.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      var li = inCheck();
      if (li) setTimeout(function () { var n = selLi(); if (n && n !== li) n.classList.remove('done'); });
    }
  });
  ed.addEventListener('paste', function (e) {
    e.preventDefault();
    exec('insertText', (e.clipboardData && e.clipboardData.getData('text/plain')) || '');
  });

  window.CamEditor = {
    load: function (html, editable, stampText) {
      if (cleanHtml() !== html) { ed.innerHTML = html; hydrate(); }
      ed.contentEditable = editable ? 'true' : 'false';
      stamp.textContent = stampText || '';
    },
    setStamp: function (t) { stamp.textContent = t; },
    theme: function (t) {
      var r = document.documentElement.style;
      Object.keys(t).forEach(function (k) { r.setProperty('--' + k, t[k]); });
    },
    fmt: fmt,
    html: cleanHtml,
    insert: function (html) {
      ed.focus();
      exec('insertHTML', html);
      hydrate();
      changed();
    },
    setAtt: function (id, url) {
      if (url) attUrls[id] = url;
      ed.querySelectorAll('img.att[data-att="' + id + '"]').forEach(function (img) {
        img.classList.remove('loading');
        if (url) img.src = url; else img.classList.add('missing');
      });
    },
    flush: flush,
    focusEnd: function () {
      ed.focus();
      var r = document.createRange();
      r.selectNodeContents(ed);
      r.collapse(false);
      var s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
    },
  };
})();

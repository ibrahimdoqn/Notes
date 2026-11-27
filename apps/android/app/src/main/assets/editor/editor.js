/*
 * Android editör köprüsü. Web'deki editor/commands.ts ve editor/editor.ts ile aynı davranış:
 * aynı HTML alt kümesini üretir (div, h2, b, i, u, s, ul, ol, li, ul.check, li.done).
 * Android → JS: CamEditor.load / theme / fmt / focusEnd
 * JS → Android: Android.onChange(html), Android.onState(json)
 */
(function () {
  'use strict';
  var ed = document.getElementById('ed');
  var stamp = document.getElementById('stamp');
  var timer = null;
  var bridge = window.Android || { onChange: function () {}, onState: function () {} };

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
    timer = setTimeout(function () { bridge.onChange(ed.innerHTML); }, 300);
  }
  function flush() { clearTimeout(timer); bridge.onChange(ed.innerHTML); }

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
      if (ed.innerHTML !== html) ed.innerHTML = html;
      ed.contentEditable = editable ? 'true' : 'false';
      stamp.textContent = stampText || '';
    },
    setStamp: function (t) { stamp.textContent = t; },
    theme: function (t) {
      var r = document.documentElement.style;
      Object.keys(t).forEach(function (k) { r.setProperty('--' + k, t[k]); });
    },
    fmt: fmt,
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

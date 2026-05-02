(function () {
  'use strict';

  var clipBtn = null;

  function removeClipBtn() {
    if (clipBtn) { clipBtn.remove(); clipBtn = null; }
  }

  document.addEventListener('mouseup', function () {
    setTimeout(function () {
      var sel = window.getSelection();
      var text = (sel ? sel.toString() : '').trim();
      if (text.length < 3) { removeClipBtn(); return; }

      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) { removeClipBtn(); return; }

      removeClipBtn();
      clipBtn = document.createElement('button');
      clipBtn.textContent = '\uD83D\uDCCB Clip to TabNotes';
      clipBtn.style.cssText = [
        'position:fixed',
        'top:' + Math.max(rect.top - 42, 8) + 'px',
        'left:' + Math.min(rect.left, Math.max(window.innerWidth - 180, 8)) + 'px',
        'z-index:2147483647',
        'background:#2b5be8',
        'color:#fff',
        'border:none',
        'border-radius:7px',
        'padding:5px 12px',
        'font-size:12px',
        'font-weight:500',
        'font-family:system-ui,-apple-system,sans-serif',
        'cursor:pointer',
        'box-shadow:0 3px 12px rgba(0,0,0,.28)',
        'white-space:nowrap',
        'line-height:1.6',
        'letter-spacing:.01em',
        'transition:background 120ms',
      ].join(';');

      clipBtn.addEventListener('mouseenter', function () { clipBtn.style.background = '#1e45c8'; });
      clipBtn.addEventListener('mouseleave', function () { clipBtn.style.background = '#2b5be8'; });

      clipBtn.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          chrome.runtime.sendMessage({
            type: 'CLIP_TEXT',
            text: text,
            sourceUrl: window.location.href,
            sourceTitle: document.title,
          });
        } catch (e) {}
        removeClipBtn();
        if (sel) sel.removeAllRanges();
      });

      document.body.appendChild(clipBtn);
    }, 10);
  });

  document.addEventListener('mousedown', function (e) {
    if (clipBtn && !clipBtn.contains(e.target)) removeClipBtn();
  });

  window.addEventListener('scroll', removeClipBtn, { passive: true });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') removeClipBtn();
  });
})();

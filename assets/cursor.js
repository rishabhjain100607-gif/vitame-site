/* Vitame bottle cursor: copies the flavour theme onto <html data-cursor="..."> so assets/cursor.css can colour the bottle.
 * On pages that switch theme (the shell sets data-flavour), it follows live. On other pages it uses the flavour saved in the browser. */
(function () {
  'use strict';
  var root = document.documentElement, OK = { orange: 1, beet: 1, green: 1, yuzu: 1 };
  function saved() {
    try { var v = localStorage.getItem('pp-flavour'); try { v = JSON.parse(v); } catch (e) { /* plain text */ } return typeof v === 'string' ? v : (v && v.id) || ''; } catch (e) { return ''; }
  }
  function sync() {
    var f = root.getAttribute('data-flavour') || saved();
    if (OK[f]) { if (root.getAttribute('data-cursor') !== f) root.setAttribute('data-cursor', f); } else root.removeAttribute('data-cursor');
  }
  sync();
  try { new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-flavour'] }); } catch (e) { /* old browser: stays on the saved flavour */ }
  window.addEventListener('storage', function (e) { if (e.key === 'pp-flavour') sync(); });
  document.addEventListener('DOMContentLoaded', sync);
})();

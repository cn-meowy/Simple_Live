(function () {
  'use strict';

  var PROTOCOL_PAGES = {
    'privacy-policy.html': { zh: 'privacy-policy.html', en: 'privacy-policy.en.html' },
    'privacy-policy.en.html': { zh: 'privacy-policy.html', en: 'privacy-policy.en.html' },
    'user-agreement.html': { zh: 'user-agreement.html', en: 'user-agreement.en.html' },
    'user-agreement.en.html': { zh: 'user-agreement.html', en: 'user-agreement.en.html' },
  };

  function currentFile() {
    var path = window.location.pathname.split('/').pop();
    return path || 'index.html';
  }

  function refresh() {
    var file = currentFile();
    var lang = document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'zh';
    document.querySelectorAll('[data-nav-page]').forEach(function (a) {
      var page = a.getAttribute('data-nav-page');
      var isCurrent = page === file || (file === '' && page === 'index.html');
      a.classList.toggle('active', !!isCurrent);
    });
    document.querySelectorAll('[data-nav-protocol]').forEach(function (a) {
      var key = a.getAttribute('data-nav-protocol');
      var map = PROTOCOL_PAGES[key];
      if (map) a.setAttribute('href', map[lang]);
    });
  }

  function bindLangSwitchOnProtocol() {
    var file = currentFile();
    if (!PROTOCOL_PAGES[file]) return;
    document.querySelectorAll('[data-lang-set]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetLang = btn.getAttribute('data-lang-set');
        var map = PROTOCOL_PAGES[file];
        var target = map[targetLang];
        if (target && target !== file) {
          window.location.href = target;
        }
      });
    });
  }

  window.MeowLiveNav = { refresh: refresh };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      refresh();
      bindLangSwitchOnProtocol();
    });
  } else {
    refresh();
    bindLangSwitchOnProtocol();
  }
})();
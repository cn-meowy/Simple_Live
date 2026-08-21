(function () {
  'use strict';

  var STORAGE_KEY = 'meowlive.lang';

  const dict = {
    'zh': {
      'nav.home': '首页',
      'nav.privacy': '隐私政策',
      'nav.agreement': '用户协议',
      'lang.zh': '中',
      'lang.en': 'EN',

      'home.tagline': '自建直播服务的播放客户端',
      'home.subtitle': '连接您自建的直播服务端，本应用作为客户端播放直播流。',
      'home.features.title': '主要功能',
      'home.features.multi.title': '多平台聚合',
      'home.features.multi.desc': '首页平台列表由后端驱动，配置一次即可访问多个直播平台。',
      'home.features.server.title': '自建服务端',
      'home.features.server.desc': '内置 Fastify + WebSocket 的 Node.js 服务端，支持 Docker 一键部署。',
      'home.features.js.title': 'JS 脚本扩展',
      'home.features.js.desc': '通过 JS 脚本动态添加自定义站点，弹幕仍走原生实现。',
      'home.features.sync.title': '设备同步',
      'home.features.sync.desc': '关注列表 / 观看记录 / 屏蔽词等配置经服务端多设备同步。',
      'home.features.tv.title': 'tvOS 原生',
      'home.features.tv.desc': 'Apple TV (tvOS 17+) 原生 Swift/SwiftUI 客户端。',
      'home.features.demo.title': '演示模式',
      'home.features.demo.desc': '服务端 Demo 模式仅暴露本地视频流，符合 App Store 审核要求。',

      'home.platforms.title': '平台支持',
      'home.platforms.note': '当前以 iOS / iPadOS / Apple TV 为 App Store 上架目标。',
      'home.platforms.ios': 'iOS',
      'home.platforms.ipados': 'iPadOS',
      'home.platforms.appletv': 'Apple TV (tvOS 17+)',
      'home.platforms.android': 'Android (Beta)',
      'home.platforms.desktop': 'Windows / macOS / Linux (Beta)',
      'home.platforms.androidtv': 'Android TV (Beta)',

      'home.download.title': '下载',
      'home.download.note': '正式版仅通过 App Store 安装；GitHub Releases 提供其他平台的开发构建。',
      'home.download.appstore': 'App Store 下载',
      'home.download.releases': 'GitHub Releases',

      'home.server.title': '服务地址配置',
      'home.server.desc': 'MeowLive 需要连接一个 simple_live_server_nodejs 后端。生产环境可使用 Docker 一键部署，本机调试可填写 127.0.0.1 启用内嵌服务模式。详细环境变量、演示模式、Docker 配置见后端 README。',
      'home.server.doc': '后端部署文档',

      'home.faq.title': '常见问题',
      'home.faq.q1': '为什么 App Store 版本只有演示模式？',
      'home.faq.a1': 'App Store 审核要求不能上架聚合类直播客户端，官方版本仅展示本地视频流以满足审核规范；连接自建服务端后可解锁全部平台。',
      'home.faq.q2': '为什么必须配置服务端地址？',
      'home.faq.a2': '本项目已移除直连模式，所有平台数据由后端统一提供。空地址将无法启动。',
      'home.faq.q3': '如何重置设备同步？',
      'home.faq.a3': '在 App 设置中关闭同步并清除设备 ID 后重新启用即可重置；服务端 SQLite 数据需自行清理。',
      'home.faq.q4': '为什么没有官方的二进制 Release？',
      'home.faq.a4': '受 App Store 审核与第三方平台版权要求约束，本项目仅通过 App Store 渠道发布 iOS 版本，其他平台需自行编译。',

      'home.contact.title': '技术支持',
      'home.legal.title': '法律文件',
      'home.contact.email': '邮箱',
      'home.contact.issues': 'GitHub Issues',

      'home.license': '本项目以 GPL-3.0 协议开源。',
      'footer.copy': '© 2026 MeowLive · 基于 xiaoyaocz/dart_simple_live fork',

      'privacy.title': 'MeowLive 隐私政策',
      'privacy.meta': '生效日期：2026年8月6日',

      'agreement.title': 'MeowLive 用户协议',
      'agreement.meta': '生效日期：2026年8月6日',
    },

    'en': {
      'nav.home': 'Home',
      'nav.privacy': 'Privacy Policy',
      'nav.agreement': 'Terms of Use',
      'lang.zh': '中',
      'lang.en': 'EN',

      'home.tagline': 'A playback client for self-hosted live streaming services',
      'home.subtitle': 'Connects to your self-hosted streaming services backend as a client to play live streams.',
      'home.features.title': 'Features',
      'home.features.multi.title': 'Multi-Platform Aggregation',
      'home.features.multi.desc': 'Home tab list is fully driven by the backend — configure once to access multiple platforms.',
      'home.features.server.title': 'Self-Hosted Server',
      'home.features.server.desc': 'A bundled Fastify + WebSocket Node.js backend, deployable with a single Docker command.',
      'home.features.js.title': 'JS Script Extensions',
      'home.features.js.desc': 'Add custom sites dynamically via JS scripts; danmaku use the built-in native implementation.',
      'home.features.sync.title': 'Device Sync',
      'home.features.sync.desc': 'Follows, watch history, blocklists and settings are synced across devices via the backend.',
      'home.features.tv.title': 'Native tvOS',
      'home.features.tv.desc': 'A native Swift/SwiftUI client for Apple TV (tvOS 17+).',
      'home.features.demo.title': 'Demo Mode',
      'home.features.demo.desc': 'In demo mode the backend exposes only a local HLS stream, meeting App Store review requirements.',

      'home.platforms.title': 'Supported Platforms',
      'home.platforms.note': 'iOS / iPadOS / Apple TV are the current App Store submission targets.',
      'home.platforms.ios': 'iOS',
      'home.platforms.ipados': 'iPadOS',
      'home.platforms.appletv': 'Apple TV (tvOS 17+)',
      'home.platforms.android': 'Android (Beta)',
      'home.platforms.desktop': 'Windows / macOS / Linux (Beta)',
      'home.platforms.androidtv': 'Android TV (Beta)',

      'home.download.title': 'Download',
      'home.download.note': 'The official release is installed via the App Store. GitHub Releases provides development builds for other platforms.',
      'home.download.appstore': 'Download on the App Store',
      'home.download.releases': 'GitHub Releases',

      'home.server.title': 'Server Setup',
      'home.server.desc': 'MeowLive requires a simple_live_server_nodejs backend. Use Docker for production deployments, or set the address to 127.0.0.1 to enable the embedded server mode for local debugging. See the backend README for environment variables, demo mode and Docker details.',
      'home.server.doc': 'Backend deployment guide',

      'home.faq.title': 'FAQ',
      'home.faq.q1': 'Why does the App Store version only show demo mode?',
      'home.faq.a1': 'App Store review does not allow aggregation live-streaming clients. The official build only exposes a local HLS stream to satisfy review requirements; connecting a self-hosted backend unlocks all platforms.',
      'home.faq.q2': 'Why is a server address required?',
      'home.faq.a2': 'Direct-to-platform mode has been removed. All platform data is provided by the backend; the app cannot start without a server address.',
      'home.faq.q3': 'How do I reset device sync?',
      'home.faq.a3': 'Disable sync and clear the device ID in app settings, then re-enable sync. Server-side SQLite data must be cleaned manually.',
      'home.faq.q4': 'Why are there no official binary releases?',
      'home.faq.a4': 'Due to App Store review constraints and third-party platform policies, the iOS build is distributed only through the App Store. Other platforms require self-compilation.',

      'home.contact.title': 'Technical Support',
      'home.legal.title': 'Legal',
      'home.contact.email': 'Email',
      'home.contact.issues': 'GitHub Issues',

      'home.license': 'This project is open-sourced under the GPL-3.0 license.',
      'footer.copy': '© 2026 MeowLive · A fork of xiaoyaocz/dart_simple_live',

      'privacy.title': 'MeowLive Privacy Policy',
      'privacy.meta': 'Effective Date: August 6, 2026',

      'agreement.title': 'MeowLive Terms of Use',
      'agreement.meta': 'Effective Date: August 6, 2026',
    },
  };

  function getLang() {
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
    var nav = (navigator.language || 'zh').toLowerCase();
    return nav.startsWith('zh') ? 'zh' : 'en';
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
    applyTranslations(lang);
    syncMeta(lang);
    syncLangToggle(lang);
    if (window.MeowLiveNav) window.MeowLiveNav.refresh();
    document.dispatchEvent(new CustomEvent('meowlive:lang', { detail: { lang: lang } }));
  }

  function applyTranslations(lang) {
    var d = dict[lang] || dict.zh;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (d[key] !== undefined) el.textContent = d[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (d[key] !== undefined) el.setAttribute('placeholder', d[key]);
    });
  }

  function syncMeta(lang) {
    document.querySelectorAll('[data-i18n-meta]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-meta');
      var d = dict[lang] || dict.zh;
      if (d[key] !== undefined) {
        if (el.tagName.toLowerCase() === 'meta') {
          el.setAttribute('content', d[key]);
        } else {
          el.textContent = d[key];
        }
      }
    });
  }

  function syncLangToggle(lang) {
    document.querySelectorAll('[data-lang-set]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-lang-set') === lang);
    });
  }

  function init() {
    var lang = getLang();
    setLang(lang);
    document.querySelectorAll('[data-lang-set]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setLang(btn.getAttribute('data-lang-set'));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
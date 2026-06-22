// WWMetrics DOM helpers
// Phase 1.2.1: dom操作の重複pattern を helper化。
// 使用例: WWMHelpers.dom.setText('heroScore', '11,295');

(function () {
  'use strict';

  const dom = {
    /**
     * id文字列 or element に textContent を set。 null安全。
     * @param {string|Element} target - element id (string) or Element
     * @param {string|number} text
     */
    setText(target, text) {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (el) el.textContent = text;
    },

    /**
     * id文字列 or element に innerHTML を set。 null安全。
     */
    setHTML(target, html) {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (el) el.innerHTML = html;
    },

    /**
     * getElementById short。 null返却で OK。
     */
    byId(id) {
      return document.getElementById(id);
    },

    /**
     * querySelector。 root省略 = document。
     */
    qs(selector, root) {
      return (root || document).querySelector(selector);
    },

    /**
     * querySelectorAll → Array変換 (forEach / map / filter利用容易)。
     */
    qsa(selector, root) {
      return Array.from((root || document).querySelectorAll(selector));
    },

    /**
     * addEventListener。 elOrId string なら byId、 null時 skip。
     * @param {string|Element} target
     * @param {string} event
     * @param {Function} handler
     * @param {object|boolean} [opts]
     */
    on(target, event, handler, opts) {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (el) el.addEventListener(event, handler, opts);
    },

    /**
     * createElement + 属性 + textContent。
     * @param {string} tag
     * @param {object} [attrs] - {class, id, style, data-*, etc}
     * @param {string} [text] - textContent
     */
    create(tag, attrs, text) {
      const el = document.createElement(tag);
      if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
          if (k === 'class' || k === 'className') el.className = v;
          else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
          else if (k.startsWith('data-')) el.setAttribute(k, v);
          else el.setAttribute(k, v);
        }
      }
      if (text !== undefined && text !== null) el.textContent = text;
      return el;
    },

    /**
     * element 表示/非表示 切替 (hidden属性使用)。
     */
    show(target) {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (el) el.hidden = false;
    },

    hide(target) {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (el) el.hidden = true;
    },

    /**
     * class追加/削除/toggle。 null安全。
     */
    addClass(target, ...names) {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (el) el.classList.add(...names);
    },

    removeClass(target, ...names) {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (el) el.classList.remove(...names);
    },

    toggleClass(target, name, force) {
      const el = typeof target === 'string' ? document.getElementById(target) : target;
      if (el) return el.classList.toggle(name, force);
      return false;
    }
  };

  window.WWMHelpers = window.WWMHelpers || {};
  window.WWMHelpers.dom = dom;
})();

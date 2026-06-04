// WWM-METRICS state hub
// Phase 2.1: window.__WWM_* (10+ globals) + SHARE mode (__WWM_SHARED_BUILD) 統一抽象化。
// 既存 window.__WWM_* に getter/setter proxy = breaking change なし、 段階置換可能。
// 旧 code は そのまま動作、 新 code は WWMState.X 経由でアクセス。

(function () {
  'use strict';

  const state = {
    // ── SHARE mode ─────────────────────────────────────
    /** SHARE Build mode 判定。 index.html inline で window.__WWM_SHARED_BUILD = payload セット済 */
    get isShared()       { return !!window.__WWM_SHARED_BUILD; },
    /** SHARE payload (data + state + baseline + optBest + lang) */
    get sharedPayload()  { return window.__WWM_SHARED_BUILD || null; },

    // ── core data state ────────────────────────────────
    get roleInfo()    { return window.__WWM_ROLEINFO || null; },
    set roleInfo(v)   { window.__WWM_ROLEINFO = v; },

    get params()      { return window.__WWM_PARAMS || null; },
    set params(v)     { window.__WWM_PARAMS = v; },

    get lastResult()  { return window.__WWM_LAST_RESULT || null; },
    set lastResult(v) { window.__WWM_LAST_RESULT = v; },

    get baseline()    { return window.__WWM_BASELINE || null; },
    set baseline(v)   { window.__WWM_BASELINE = v; },

    // ── virtual state (装備比較・心法tryout・武庫tryout) ──
    virtual: {
      get gear()    { return window.__WWM_VIRTUAL || null; },
      set gear(v)   { window.__WWM_VIRTUAL = v; },
      get kongfu()  { return window.__WWM_VIRTUAL_KONGFU || null; },
      set kongfu(v) { window.__WWM_VIRTUAL_KONGFU = v; },
      get xinfa()   { return window.__WWM_VIRTUAL_XINFA || null; },
      set xinfa(v)  { window.__WWM_VIRTUAL_XINFA = v; },
      get arsenal() { return window.__WWM_VIRTUAL_ARSENAL || null; },
      set arsenal(v){
        if (v == null) delete window.__WWM_VIRTUAL_ARSENAL;
        else window.__WWM_VIRTUAL_ARSENAL = v;
      },

      /** 全 virtual state リセット (装備/心法/武庫 全部) */
      clear() {
        window.__WWM_VIRTUAL = {};
        window.__WWM_VIRTUAL_KONGFU = {};
        window.__WWM_VIRTUAL_XINFA = null;
        delete window.__WWM_VIRTUAL_ARSENAL;
      },

      /** virtual差分 1つでもあるか */
      has() {
        const v  = window.__WWM_VIRTUAL;
        const k  = window.__WWM_VIRTUAL_KONGFU;
        const x  = window.__WWM_VIRTUAL_XINFA;
        return !!(
          (v && Object.keys(v).length) ||
          (k && Object.keys(k).length) ||
          (x && ((x.passive?.length) || Object.keys(x.tiers || {}).length)) ||
          window.__WWM_VIRTUAL_ARSENAL
        );
      }
    },

    // ── optimization state ─────────────────────────────
    opt: {
      get best()     { return window.__WWM_OPT_BEST || null; },
      set best(v)    { window.__WWM_OPT_BEST = v; },
      get locked()   { return !!window.__WWM_OPT_BEST_LOCKED; },
      set locked(v)  { window.__WWM_OPT_BEST_LOCKED = !!v; },
      get running()  { return !!window.__WWM_OPT_RUNNING; },
      set running(v) { window.__WWM_OPT_RUNNING = !!v; }
    },

    // ── runtime flags ──────────────────────────────────
    get allowDonut()  { return !!window.__WWM_ALLOW_DONUT; },
    set allowDonut(v) { window.__WWM_ALLOW_DONUT = !!v; },

    // ── SHARE mode protection helper ───────────────────
    /**
     * SHARE mode 時 alert + block。 戻り値 true = 処理続行禁止。
     * 使い方:
     *   if (WWMState.blockIfShared(window.T?.sharedBuildShareBlocked)) return;
     */
    blockIfShared(alertMsg) {
      if (!this.isShared) return false;
      if (alertMsg) alert(alertMsg);
      return true;
    }
  };

  window.WWMHelpers = window.WWMHelpers || {};
  window.WWMHelpers.state = state;
  // top-level alias (頻繁使用のため短縮アクセス)
  window.WWMState = state;
})();

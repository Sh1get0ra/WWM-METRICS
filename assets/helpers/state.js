// WWM-METRICS state hub
// Phase 2.7: 内部 _data object 化 = window.__WWM_* 切離し完了。
//   - params / lastResult / virtual.* / opt.* / allowDonut → 内部 _data 経由
//   - roleInfo / baseline → proxy 残置 (export.js / index.html inline 互換のため)
//   - SHARED_BUILD → proxy 永久維持 (index.html inline で受信時 set)
// Phase 2.8 で 残 proxy (roleInfo / baseline) も切離し予定 (export.js 工事完了時、 TODO.md 参照)

(function () {
  'use strict';

  // ── 内部 state (window.__WWM_* 切離し済) ──────────────
  const _data = {
    params: null,
    lastResult: null,
    virtual: {
      gear: null,
      kongfu: null,
      xinfa: null,
      arsenal: null,
    },
    opt: {
      best: null,
      locked: false,
      running: false,
    },
    allowDonut: false,
  };

  const state = {
    // ── SHARE mode (proxy 永久維持) ────────────────────
    /** SHARE Build mode 判定。 index.html inline で window.__WWM_SHARED_BUILD = payload セット済 */
    get isShared()       { return !!window.__WWM_SHARED_BUILD; },
    /** SHARE payload (data + state + baseline + optBest + lang) */
    get sharedPayload()  { return window.__WWM_SHARED_BUILD || null; },

    // ── roleInfo / baseline (proxy 残置 = Phase 2.8 で切離し) ──
    // 理由: export.js (line 82, 93) + index.html inline (line 219, 375, 742) が
    //       window.__WWM_ROLEINFO / __WWM_BASELINE 直接参照中。 export.js 工事完了時に Phase 2.8 着手
    get roleInfo()    { return window.__WWM_ROLEINFO || null; },
    set roleInfo(v)   { window.__WWM_ROLEINFO = v; },

    get baseline()    { return window.__WWM_BASELINE || null; },
    set baseline(v)   { window.__WWM_BASELINE = v; },

    // ── core data state (Phase 2.7 切離し済) ───────────
    get params()      { return _data.params; },
    set params(v)     { _data.params = v; },

    get lastResult()  { return _data.lastResult; },
    set lastResult(v) { _data.lastResult = v; },

    // ── virtual state (装備比較・心法tryout・武庫tryout) ──
    virtual: {
      get gear()    { return _data.virtual.gear; },
      set gear(v)   { _data.virtual.gear = v; },
      get kongfu()  { return _data.virtual.kongfu; },
      set kongfu(v) { _data.virtual.kongfu = v; },
      get xinfa()   { return _data.virtual.xinfa; },
      set xinfa(v)  { _data.virtual.xinfa = v; },
      get arsenal() { return _data.virtual.arsenal; },
      set arsenal(v){ _data.virtual.arsenal = (v == null) ? null : v; },

      /** 全 virtual state リセット (装備/心法/武庫 全部) */
      clear() {
        _data.virtual.gear = {};
        _data.virtual.kongfu = {};
        _data.virtual.xinfa = null;
        _data.virtual.arsenal = null;
      },

      /** virtual差分 1つでもあるか */
      has() {
        const v  = _data.virtual.gear;
        const k  = _data.virtual.kongfu;
        const x  = _data.virtual.xinfa;
        return !!(
          (v && Object.keys(v).length) ||
          (k && Object.keys(k).length) ||
          (x && ((x.passive?.length) || Object.keys(x.tiers || {}).length)) ||
          _data.virtual.arsenal
        );
      }
    },

    // ── optimization state ─────────────────────────────
    opt: {
      get best()     { return _data.opt.best; },
      set best(v)    { _data.opt.best = v; },
      get locked()   { return _data.opt.locked; },
      set locked(v)  { _data.opt.locked = !!v; },
      get running()  { return _data.opt.running; },
      set running(v) { _data.opt.running = !!v; }
    },

    // ── runtime flags ──────────────────────────────────
    get allowDonut()  { return _data.allowDonut; },
    set allowDonut(v) { _data.allowDonut = !!v; },

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

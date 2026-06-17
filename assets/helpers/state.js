// WWM-METRICS state hub
// Phase 2.7: 内部 _data object 化 = window.__WWM_* 切離し完了。
//   - params / lastResult / virtual.* / opt.* / allowDonut → 内部 _data 経由
// Phase 2.8 (2026-06-07 export.js v2 工事完了と同時): roleInfo / baseline も _data 化。
//   - window.__WWM_ROLEINFO / __WWM_BASELINE 参照は全廃 (export.js + index.html inline 移行済)
//   - SHARED_BUILD のみ proxy 永久維持 (index.html inline で受信時 set のため切離し不可)

(function () {
  'use strict';

  // ── 内部 state (window.__WWM_* 切離し済) ──────────────
  const _data = {
    roleInfo: null,
    baseline: null,
    params: null,
    lastResult: null,
    virtual: {
      gear: null,
      kongfu: null,
      xinfa: null,
      arsenal: null,
      qishu: null,    // [id × 8] 配列 — 兄貴入替済 奇術 (Phase B 2026-06-13)。 score 計算無関係 = cosmetic 専用。 import で reset (装備/心法と同列)
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

    // ── roleInfo / baseline (Phase 2.8 切離し済 = 内部 _data) ──
    get roleInfo()    { return _data.roleInfo; },
    set roleInfo(v)   { _data.roleInfo = v; },

    get baseline()    { return _data.baseline; },
    set baseline(v)   { _data.baseline = v; },

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
      get qishu()   { return _data.virtual.qishu; },
      set qishu(v)  { _data.virtual.qishu = v; },

      /** 全 virtual state リセット (装備/心法/武庫/奇術 全部) */
      clear() {
        _data.virtual.gear = {};
        _data.virtual.kongfu = {};
        _data.virtual.xinfa = null;
        _data.virtual.arsenal = null;
        _data.virtual.qishu = null;
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

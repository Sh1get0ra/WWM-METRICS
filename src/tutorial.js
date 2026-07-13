// WWMetrics Tutorial Tour — driver.js engine wrapper
// Phase 2-4 (2026-06-21): Ch.1-3 全 step 実装 + NOTE 再起動 + 墨×紙 CSS override
//
// 起動経路:
//   1. import 完了 → applyImport 末尾で WWMTutorial.maybeStart()
//   2. NOTE modal 内「ツアーを見る」 button → WWMTutorial.start(true)
//
// LocalStorage flag:
//   key   = 'wwm_tutorial_seen_version'
//   value = 整数 (例 1 = workspace v2 移行ツアー)
//   check = parseInt(stored||'0', 10) < CURRENT_TUTORIAL_VERSION → 表示
//   表示後 (Yes/No どちらでも) = CURRENT_TUTORIAL_VERSION で更新 → 以後 silent
//
// 公開: window.WWMTutorial = { CURRENT_TUTORIAL_VERSION, maybeStart, start, _markSeen }

(function () {
  'use strict';

  const FLAG_KEY = 'wwm_tutorial_seen_version';
  const CURRENT_TUTORIAL_VERSION = 1;
  const DB_FLAG_KEY = 'wwm_tutorial_seen_db_v1';

  function _getSeenVersion() {
    try {
      const raw = localStorage.getItem(FLAG_KEY);
      return parseInt(raw || '0', 10) || 0;
    } catch (_) { return 0; }
  }

  function _markSeen() {
    try { localStorage.setItem(FLAG_KEY, String(CURRENT_TUTORIAL_VERSION)); } catch (_) {}
  }

  function _getSeenDb() {
    try { return localStorage.getItem(DB_FLAG_KEY) === '1'; } catch (_) { return false; }
  }
  function _markSeenDb() {
    try { localStorage.setItem(DB_FLAG_KEY, '1'); } catch (_) {}
  }

  function _t(key, fb) {
    const T = window.T;
    if (T && T[key]) return T[key];
    return fb;
  }

  // ── 「ツアー受けますか?」 modal ───────────────────────────────────
  function _showAskModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'wwm-modal-backdrop';
    backdrop.innerHTML = `
      <div class="wwm-tool-modal wwm-tutorial-ask-modal" role="dialog" aria-modal="true" aria-labelledby="wwmTutorialAskTitle">
        <header class="wwm-modal-header">
          <h2 id="wwmTutorialAskTitle">${_t('tutorialAskTitle', 'ツアーを受けますか?')}</h2>
          <button class="wwm-modal-close" aria-label="${_t('close', '閉じる')}">×</button>
        </header>
        <div class="wwm-modal-body wwm-ws-paper">
          <p>${_t('tutorialAskBody', 'WWMetrics の主要機能を約 1-2 分で案内します。後で NOTE から再表示も可能。')}</p>
        </div>
        <footer class="wwm-modal-footer">
          <button class="wwm-btn-primary" id="wwmTutorialYesBtn">${_t('tutorialAskYes', 'ツアーを受ける')}</button>
          <button class="wwm-btn-secondary" id="wwmTutorialNoBtn">${_t('tutorialAskNo', 'スキップ')}</button>
        </footer>
      </div>
    `;
    const closeAndMark = () => { _markSeen(); backdrop.remove(); };
    backdrop.querySelector('.wwm-modal-close').addEventListener('click', closeAndMark);
    backdrop.querySelector('#wwmTutorialNoBtn').addEventListener('click', closeAndMark);
    backdrop.querySelector('#wwmTutorialYesBtn').addEventListener('click', () => {
      _markSeen();
      backdrop.remove();
      start(true);
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeAndMark();
    });
    document.body.appendChild(backdrop);
  }

  // ── 「DB画面を追加しました」 ask modal ───────────────────────────────
  function _showDbAskModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'wwm-modal-backdrop';
    backdrop.innerHTML = `
      <div class="wwm-tool-modal wwm-tutorial-ask-modal" role="dialog" aria-modal="true" aria-labelledby="wwmDbTutorialAskTitle">
        <header class="wwm-modal-header">
          <h2 id="wwmDbTutorialAskTitle">${_t('dbTutorialAskTitle', 'DB画面を追加しました')}</h2>
          <button class="wwm-modal-close" aria-label="${_t('close', '閉じる')}">×</button>
        </header>
        <div class="wwm-modal-body wwm-ws-paper">
          <p>${_t('dbTutorialAskBody', '装備/心法/武術のマスタデータを閲覧できるDB画面を追加しました。約1分でご案内します。')}</p>
        </div>
        <footer class="wwm-modal-footer">
          <button class="wwm-btn-primary" id="wwmDbTutorialYesBtn">${_t('dbTutorialAskYes', '見てみる')}</button>
          <button class="wwm-btn-secondary" id="wwmDbTutorialNoBtn">${_t('dbTutorialAskNo', 'スキップ')}</button>
        </footer>
      </div>
    `;
    const closeAndMark = () => { _markSeenDb(); backdrop.remove(); };
    backdrop.querySelector('.wwm-modal-close').addEventListener('click', closeAndMark);
    backdrop.querySelector('#wwmDbTutorialNoBtn').addEventListener('click', closeAndMark);
    backdrop.querySelector('#wwmDbTutorialYesBtn').addEventListener('click', () => {
      _markSeenDb();
      backdrop.remove();
      startDb(true);
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeAndMark();
    });
    document.body.appendChild(backdrop);
  }

  // ── 補助: 装備 build workspace 強制切替 + 最初の実在 slot 取得 ──
  function _ensureBuildWorkspace() {
    try {
      if (window.WWMWorkspace && typeof window.WWMWorkspace.activate === 'function') {
        window.WWMWorkspace.activate('build');
      }
    } catch (_) {}
  }
  // ステ rail 強制 open (閉じてるユーザー対策)。 PC = setRail(false)、 mobile = data-rail-mobile="open"
  function _ensureRailOpen() {
    try {
      if (window.WWMWorkspace && typeof window.WWMWorkspace.setRail === 'function') {
        window.WWMWorkspace.setRail(false);
      }
      if (document.body.classList.contains('mobile-mode')) {
        const app = document.getElementById('wwmApp');
        if (app) app.dataset.railMobile = 'open';
      }
    } catch (_) {}
  }
  // mobile rail 閉じる (ステ step 通過後、 後続 step の表示妨害回避)
  function _closeRailIfMobile() {
    try {
      if (!document.body.classList.contains('mobile-mode')) return;
      const app = document.getElementById('wwmApp');
      if (app && app.dataset.railMobile === 'open') delete app.dataset.railMobile;
    } catch (_) {}
  }
  function _firstGearSlot() {
    return document.querySelector('.wwm-equip-slot:not(.wwm-equip-empty)[data-slot]')
        || document.querySelector('.wwm-equip-slot[data-slot]');
  }
  // ── scroll lock 戦略 ──────────────────────────────────────────
  // driver.js は element.scrollIntoView() を呼ぶ = ancestor scrollable 全部 scroll される。
  // onHighlighted 後追い reset では driver 連打に追いつかない (popover 位置ズレ + scroll 残り)。
  // → tour 中は scrollable container の overflow を一時 hidden 化 = scroll そのものを禁止する。
  const _SCROLL_LOCK_SEL = '#wwmApp, #wsBuild, #wsEnbu, #wsHist, .wwm-ws-paper, .wwm-ws-main, .wwm-ws-body';
  const _lockedEls = [];
  function _scrollAllToTop() {
    try {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelectorAll(_SCROLL_LOCK_SEL).forEach(el => {
        try { el.scrollTop = 0; el.scrollLeft = 0; } catch (_) {}
      });
    } catch (_) {}
  }
  function _lockScroll() {
    if (_lockedEls.length) return; // 二重 lock 防止
    document.querySelectorAll(_SCROLL_LOCK_SEL).forEach(el => {
      const orig = el.style.overflow;
      _lockedEls.push({ el, orig });
      el.style.overflow = 'hidden';
    });
    // body/html も念のため
    _lockedEls.push({ el: document.body, orig: document.body.style.overflow });
    document.body.style.overflow = 'hidden';
  }
  function _unlockScroll() {
    while (_lockedEls.length) {
      const { el, orig } = _lockedEls.pop();
      try { el.style.overflow = orig || ''; } catch (_) {}
    }
  }

  // ── driver.js step 構築 ────────────────────────────────────
  function _buildSteps(driverRef) {
    const steps = [];
    // tour 開始時点の DOM snapshot で element を固定 (driver.js v1 = function 渡し非対応)
    const firstSlotEl = _firstGearSlot();
    const firstSlotSel = (firstSlotEl && firstSlotEl.dataset && firstSlotEl.dataset.slot)
      ? `.wwm-equip-slot[data-slot="${firstSlotEl.dataset.slot}"]`
      : '#wsBuild';
    // mobile/PC で selector 差替 (mobile = bottom-nav / mobile chip-bar の別 element)
    const isMobile = document.body.classList.contains('mobile-mode');
    const anlzSel   = isMobile ? '.wwm-bottom-nav .wwm-bn[data-anlz-popout-trigger]' : '#wwmAnlzPopoutBtn';
    const resetSel  = isMobile ? '.wwm-mobile-chip[aria-label="RESET"]' : '#wwmVirtResetBtn';
    const presetSel = isMobile ? '#wwmMobileChipPreset' : '#wwmPresetChip';

    // ── Ch.1 武格指数 (2 step) ──
    steps.push({
      element: '#heroRoot',
      popover: {
        title: _t('tutorialCh1Step1Title', '武格指数'),
        description: _t('tutorialCh1Step1Body', '武格指数とは風燕伝のダメージ計算式と装備データに基づいた火力指標となります。<br>現在使用している武術構成の最適装備スコアからの割合で、SS〜Cランクまでランクが自動で付与されます。<br>本ツールで装備を変更しても、ランク評価は変動しません。実際に最適な装備をゲーム内で整え武格指数を上げていきましょう。'),
        side: 'bottom',
        align: 'start'
      },
      onHighlightStarted: () => { _ensureBuildWorkspace(); _scrollAllToTop(); },
      onHighlighted: () => _scrollAllToTop()
    });

    // ── Ch.ステータス (2 step) ──
    steps.push({
      element: '#wwmWsRail',
      popover: {
        title: _t('tutorialChStatusTitle', 'ステータス'),
        description: _t('tutorialChStatusBody', 'インポートで取り込まれた情報でステータスを閲覧できます。<br>インポートで取り込めない情報は心法のレベル、観音のレベル、武庫のレベル、才能/五音太平楽の解放状況となります。'),
        side: 'right',
        align: 'start'
      },
      onHighlightStarted: () => { _ensureRailOpen(); _scrollAllToTop(); },
      onHighlighted: () => _scrollAllToTop()
    });

    steps.push({
      element: '#wwmWsRail',
      popover: {
        title: _t('tutorialChStatus2Title', 'ステータス補足'),
        description: _t('tutorialChStatus2Body', '心法のレベルと武庫のレベルについては、インポート時に選択をお願いします。<br>観音/才能/五音太平楽の解放状況についてはゲーム内パッチでの最高到達段階を適用しておりますので、各解放状況が追いついていない段階だとステータスに差異がございます。'),
        side: 'right',
        align: 'start'
      },
      onHighlightStarted: () => { _ensureRailOpen(); _scrollAllToTop(); },
      onHighlighted: () => _scrollAllToTop()
    });

    steps.push({
      element: '#wsBuild',
      popover: {
        title: _t('tutorialCh1Step2Title', '装備パネル'),
        description: _t('tutorialCh1Step2Body', '装備・心法・奇術を一覧表示する武備パネル。装備変更で武格指数とランクが動きます。<br>次は装備カードを開いて武具対照を見てみましょう。'),
        side: 'top',
        align: 'center'
      },
      onHighlightStarted: () => { _closeRailIfMobile(); _scrollAllToTop(); },
      onHighlighted: () => _scrollAllToTop()
    });

    // ── Ch.2 武具対照 + OCR (4 step) ──
    steps.push({
      element: firstSlotSel,
      popover: {
        title: _t('tutorialCh2Step1Title', '装備カード'),
        description: _t('tutorialCh2Step1Body', '装備カードを click すると武具対照 modal が開きます。<br>現有装備と新置装備を比較しながら、装備変更による武格指数の変動を確認できます。'),
        side: 'right',
        align: 'start',
        onNextClick: () => {
          const slot = firstSlotEl?.dataset?.slot;
          if (slot && window.WWMSidebar?.gear?.openEdit) {
            _resumeIntent = true;
            const cur = driverRef();
            if (cur && typeof cur.destroy === 'function') cur.destroy();
            setTimeout(() => {
              try { window.WWMSidebar.gear.openEdit(slot); } catch (_) {}
              setTimeout(() => _resumeFromIndex(5), 350);
            }, 100);
          } else {
            driverRef().moveNext();
          }
        }
      },
      onHighlightStarted: () => _scrollAllToTop(),
      onHighlighted: () => _scrollAllToTop()
    });

    steps.push({
      element: '.wwm-cmp-modal-a',
      popover: {
        title: _t('tutorialCh2Step2Title', '武具対照 modal'),
        description: _t('tutorialCh2Step2Body', '左 = 現有装備、右 = 新置装備。新置側の affix を編集すると武格指数の変動が即座に反映されます。<br>装備変更前のシミュレーションに使用してください。'),
        side: 'left',
        align: 'center'
      }
    });

    steps.push({
      element: '#wwmCmpOcrBtn',
      popover: {
        title: _t('tutorialCh2Step3Title', 'OCR'),
        description: isMobile
          ? _t('tutorialCh2Step3BodyMobile', 'アイコンクリックで写真を撮影、もしくは撮影済の画像を選択してください。<br>調律/定音の内容を自動取込します。')
          : _t('tutorialCh2Step3Body', 'ゲーム画面のスクリーンショットをドロップorCtrl+Vでの貼付、もしくはこちらのアイコンをクリックして選択すると、調律/定音の内容を自動取込します。手動入力の手間を省けますので、ご活用ください。'),
        side: 'top',
        align: 'center',
        onNextClick: () => {
          // OCR help button click → wwm-ocr-guide modal open → 新 driver で OCR 指南 step へ
          const helpBtn = document.querySelector('#wwmCmpOcrHelpBtn');
          if (helpBtn) {
            _resumeIntent = true;
            const cur = driverRef();
            if (cur && typeof cur.destroy === 'function') cur.destroy();
            setTimeout(() => {
              try { helpBtn.click(); } catch (_) {}
              setTimeout(() => _resumeFromIndex(7), 350);
            }, 100);
          } else {
            driverRef().moveNext();
          }
        }
      }
    });

    // ── Ch.OCR 指南 (新規 step、 wwm-ocr-guide modal 内) ──
    steps.push({
      element: '.wwm-ocr-guide',
      popover: {
        title: _t('tutorialChOcrGuideTitle', '画像取込指南'),
        description: _t('tutorialChOcrGuideBody', '実際の撮影例とステップ手順を確認できます。<br>装備詳細画面 (値が右端に並ぶ画面) を撮影するのがコツです。'),
        side: 'left',
        align: 'center',
        onNextClick: () => {
          // ocr guide modal close → 元の 武具対照 modal に戻る → Ch.同級承音 へ
          _resumeIntent = true;
          const guide = document.querySelector('.wwm-ocr-guide');
          const guideBd = guide?.closest('.wwm-modal-backdrop');
          const cur = driverRef();
          if (cur && typeof cur.destroy === 'function') cur.destroy();
          if (guideBd) guideBd.remove();
          setTimeout(() => _resumeFromIndex(8), 200);
        }
      }
    });

    steps.push({
      element: '#wwmEditShouon',
      popover: {
        title: _t('tutorialCh2Step4Title', '同級承音'),
        description: _t('tutorialCh2Step4Body', '同 Lv 帯の調律 affix を MAX 値×94% で一括埋めるショートカット。<br>「もし最大まで強化したら?」 を即座に試せます。'),
        side: 'top',
        align: 'center',
        onNextClick: () => {
          // 武具対照 modal close → driver 再起動で Ch.格析 へ
          _resumeIntent = true;
          const m = document.querySelector('.wwm-cmp-modal-a');
          const backdrop = m?.closest('.wwm-modal-backdrop');
          const cur = driverRef();
          if (cur && typeof cur.destroy === 'function') cur.destroy();
          if (backdrop) backdrop.remove();
          setTimeout(() => _resumeFromIndex(9), 200);
        }
      }
    });

    // ── Ch.3 格析 popout (1 step) ──
    // popout 起動「前」 に説明 = popout 後は DOM detach で driver.js が target 失う ([[document-pip-implementation-traps]])
    steps.push({
      element: anlzSel,
      popover: {
        title: _t('tutorialCh3Step1Title', '格析'),
        description: _t('tutorialCh3Step1Body', '格析 button から別 window で「期待値」「装備最適化」 2 tab を確認できます。<br>主画面で装備を弄りながら格析を別 window で常時表示する使い方が便利です。'),
        side: 'left',
        align: 'center'
      },
      onHighlightStarted: () => _scrollAllToTop(),
      onHighlighted: () => _scrollAllToTop()
    });

    // ── Ch.操作 (リセット + プリセット 2 step) ──
    steps.push({
      element: resetSel,
      popover: {
        title: _t('tutorialChResetTitle', 'リセット'),
        description: _t('tutorialChResetBody', '新装備/心法 として弄った内容を全て現装備値に戻すボタンです。<br>装備変更前の状態に戻したい時に使用してください。'),
        side: 'bottom',
        align: 'end'
      },
      onHighlightStarted: () => _scrollAllToTop(),
      onHighlighted: () => _scrollAllToTop()
    });

    steps.push({
      element: presetSel,
      popover: {
        title: _t('tutorialChPresetTitle', 'プリセット'),
        description: _t('tutorialChPresetBody', '現在の状態 (装備・心法・調律/定音 等) を 3 つまで保存できるプリセット機能です。<br>装備パターンを試したい時の保存場所として活用してください。'),
        side: 'bottom',
        align: 'end'
      },
      onHighlightStarted: () => _scrollAllToTop(),
      onHighlighted: () => _scrollAllToTop()
    });

    // ── Ch.再インポート (IMPORT FAB highlight) — mobile では FAB 非表示なので skip ──
    if (!document.body.classList.contains('mobile-mode') && document.querySelector('.wwm-import-fab')) {
      steps.push({
        element: '.wwm-import-fab',
        popover: {
          title: _t('tutorialChImportFabTitle', 'インポート'),
          description: _t('tutorialChImportFabBody', '再度インポートを行う場合は、 このインポートボタンをクリックしてください。<br>自由に動かせますので、 お好きな場所に設置してください。'),
          side: 'left',
          align: 'center'
        }
      });
    }

    // ── 完了 step (popover only、 element なし = 画面中央 modal 風) ──
    steps.push({
      popover: {
        title: _t('tutorialFinishTitle', 'ツアー完了'),
        description: _t('tutorialFinishBody', 'お疲れさまでした。NOTE 内の「ツアーを見る」 button からいつでも再表示できます。<br>素敵な風燕伝ライフを!'),
        showButtons: ['close']
      }
    });

    return steps;
  }

  // ── DB告知ミニツアー step構築 ──────────────────────────────
  // 対象心法/武学は固定ID (T2効果/武術技データが実在するIDを明示選択、database.md確認済み)
  const DB_XINFA_TARGET_ID = '4';      // 山月無影、T2 effectId=phys_min_blue、WorldLv 1-21 実在
  const DB_KONGFU_TARGET_ID = '10101'; // 才能テーブル + 武術技ダメージ係数 両方実在

  function _buildDbSteps(driverRef) {
    const steps = [];
    const isMobile = document.body.classList.contains('mobile-mode');
    const dbTabGearSel = isMobile ? '.wwm-bottom-nav [data-db-tab="gear"]' : '.wwm-database [data-db-tab="gear"]';

    // Step1: DBボタン紹介 → クリックしてDB画面起動
    steps.push({
      element: '#wwmDatabaseBtn',
      popover: {
        title: _t('dbTutorialStep1Title', 'DB画面'),
        description: _t('dbTutorialStep1Body', 'ヘッダーのこのボタンから、装備・心法・武術のマスタデータを閲覧できる専用画面に切り替えられます。'),
        side: 'bottom',
        align: 'start',
        onNextClick: () => {
          _resumeIntent = true;
          const cur = driverRef();
          if (cur && typeof cur.destroy === 'function') cur.destroy();
          try {
            if (!window.WWMSidebar.database.isOpen()) window.WWMSidebar.database.open();
            const gearTab = document.querySelector('[data-db-tab="gear"]');
            if (gearTab) gearTab.click();
            if (window.WWMSidebar.databaseGear) window.WWMSidebar.databaseGear.selectSlot('weapon');
          } catch (_) {}
          setTimeout(() => _resumeFromDbIndex(1), 250);
        }
      },
      onHighlightStarted: () => _scrollAllToTop(),
      onHighlighted: () => _scrollAllToTop()
    });

    // Step2: 3タブ紹介
    steps.push({
      element: dbTabGearSel,
      popover: {
        title: _t('dbTutorialStep2Title', '3タブ構成'),
        description: _t('dbTutorialStep2Body', '装備・心法・武術の3タブで、キャラクター非依存のマスタデータを閲覧できます。'),
        side: 'bottom',
        align: 'start'
      },
      onHighlightStarted: () => _scrollAllToTop(),
      onHighlighted: () => _scrollAllToTop()
    });

    // Step3: 装備タブ 調律%表示 (weapon slot = tuning1 セクション単独持ち)
    steps.push({
      element: '[data-db-section="tuning1"]',
      popover: {
        title: _t('dbTutorialStep3Title', '調律出現率'),
        description: _t('dbTutorialStep3Body', '装備タブでは、各Lv・Tierごとの調律オプションと出現確率(%)を一覧で確認できます。'),
        side: 'right',
        align: 'start',
        onNextClick: () => {
          _resumeIntent = true;
          const cur = driverRef();
          if (cur && typeof cur.destroy === 'function') cur.destroy();
          try {
            const xinfaTab = document.querySelector('[data-db-tab="xinfa"]');
            if (xinfaTab) xinfaTab.click();
            if (window.WWMSidebar.databaseXinfa) window.WWMSidebar.databaseXinfa.selectId(DB_XINFA_TARGET_ID);
          } catch (_) {}
          setTimeout(() => _resumeFromDbIndex(3), 250);
        }
      },
      onHighlightStarted: () => _scrollAllToTop(),
      onHighlighted: () => _scrollAllToTop()
    });

    // Step4: 心法タブ WorldLv別テーブル
    steps.push({
      element: '.wwm-db-xinfa-worldlv-table',
      popover: {
        title: _t('dbTutorialStep4Title', '心法WorldLv別数値'),
        description: _t('dbTutorialStep4Body', '心法タブのT2効果は、WorldLv別の数値を全部一覧表示します。ゲーム内進行度に応じた将来値も先取り確認できます。'),
        side: 'left',
        align: 'start',
        onNextClick: () => {
          _resumeIntent = true;
          const cur = driverRef();
          if (cur && typeof cur.destroy === 'function') cur.destroy();
          try {
            const kongfuTab = document.querySelector('[data-db-tab="kongfu"]');
            if (kongfuTab) kongfuTab.click();
            if (window.WWMSidebar.databaseKongfu) window.WWMSidebar.databaseKongfu.selectId(DB_KONGFU_TARGET_ID);
          } catch (_) {}
          setTimeout(() => _resumeFromDbIndex(4), 250);
        }
      },
      onHighlightStarted: () => _scrollAllToTop(),
      onHighlighted: () => _scrollAllToTop()
    });

    // Step5: 武術タブ「才能」サブタブ (selectId直後 = _selectedTab既定 'talent')
    steps.push({
      element: '.wwm-db-kongfu-slot-section',
      popover: {
        title: _t('dbTutorialStep5Title', '武術・才能'),
        description: _t('dbTutorialStep5Body', '武術タブでは、各武学の才能突破段階を、閾値・上限まで含めてテーブルで確認できます。'),
        side: 'left',
        align: 'start',
        onNextClick: () => {
          _resumeIntent = true;
          const cur = driverRef();
          if (cur && typeof cur.destroy === 'function') cur.destroy();
          const skillTabBtn = document.querySelector('[data-db-kongfu-tab="skill"]');
          if (skillTabBtn) skillTabBtn.click();
          setTimeout(() => _resumeFromDbIndex(5), 250);
        }
      },
      onHighlightStarted: () => _scrollAllToTop(),
      onHighlighted: () => _scrollAllToTop()
    });

    // Step6: 武術タブ「武術技」サブタブ ダメージ係数
    steps.push({
      element: '.wwm-db-kongfu-skill-table',
      popover: {
        title: _t('dbTutorialStep6Title', '武術技ダメージ係数'),
        description: _t('dbTutorialStep6Body', '「武術技」サブタブでは、各技の外功係数・外功付加・属性係数をLv別に一覧できます。'),
        side: 'left',
        align: 'start'
      },
      onHighlightStarted: () => _scrollAllToTop(),
      onHighlighted: () => _scrollAllToTop()
    });

    // Step7: 完了
    steps.push({
      popover: {
        title: _t('dbTutorialFinishTitle', 'DB画面紹介完了'),
        description: _t('dbTutorialFinishBody', '以上がDB画面の主な機能です。いつでもヘッダーのDBボタンから開けます。'),
        showButtons: ['close']
      }
    });

    return steps;
  }

  // ── driver.js engine 起動 ──────────────────────────────────────
  // _activeDriver = 現在の driver instance、 _allSteps = 構築済 step 配列 (mid-tour 再起動用)
  let _activeDriver = null;
  let _allSteps = [];
  let _allDbSteps = [];
  let _resumeIntent = false; // tour 中 destroy で flag を立てたくない (modal open 切替時)

  function _resumeFromIndex(idx) {
    if (!_allSteps.length) return;
    const remain = _allSteps.slice(idx);
    if (!remain.length) return;
    _resumeIntent = true;
    _activeDriver = window.driver.js.driver(_driverOpts(remain));
    _activeDriver.drive();
    _resumeIntent = false;
  }

  function _resumeFromDbIndex(idx) {
    if (!_allDbSteps.length) return;
    const remain = _allDbSteps.slice(idx);
    if (!remain.length) return;
    _resumeIntent = true;
    _activeDriver = window.driver.js.driver(_driverOpts(remain, _markSeenDb));
    _activeDriver.drive();
    _resumeIntent = false;
  }

  function _driverOpts(stepsArr, markFn) {
    const mark = markFn || _markSeen;
    return {
      showProgress: true,
      allowClose: true,
      smoothScroll: false,
      stagePadding: 6,
      stageRadius: 6,
      popoverClass: 'wwm-tutorial-popover',
      nextBtnText: _t('tutorialNext', '次へ'),
      prevBtnText: _t('tutorialPrev', '戻る'),
      doneBtnText: _t('tutorialFinish', '完了'),
      onDestroyStarted: () => {
        if (!_resumeIntent) { mark(); _unlockScroll(); }
        if (_activeDriver && typeof _activeDriver.destroy === 'function') _activeDriver.destroy();
      },
      steps: stepsArr
    };
  }

  function start(force) {
    if (!window.driver || typeof window.driver.js !== 'object') {
      console.warn('[WWMTutorial] driver.js not loaded');
      return;
    }
    _ensureBuildWorkspace();
    _scrollAllToTop();
    _lockScroll();
    const driverRef = () => _activeDriver;
    _allSteps = _buildSteps(driverRef);
    _activeDriver = window.driver.js.driver(_driverOpts(_allSteps));
    _activeDriver.drive();
  }

  function maybeStart() {
    if (_getSeenVersion() >= CURRENT_TUTORIAL_VERSION) return;
    requestAnimationFrame(() => requestAnimationFrame(() => _showAskModal()));
  }

  function startDb(force) {
    if (!window.driver || typeof window.driver.js !== 'object') {
      console.warn('[WWMTutorial] driver.js not loaded');
      return;
    }
    _scrollAllToTop();
    _lockScroll();
    const driverRef = () => _activeDriver;
    _allDbSteps = _buildDbSteps(driverRef);
    _activeDriver = window.driver.js.driver(_driverOpts(_allDbSteps, _markSeenDb));
    _activeDriver.drive();
  }

  function maybeStartDb() {
    if (_getSeenVersion() < CURRENT_TUTORIAL_VERSION) return; // フルツアー未読 = 次回訪問時まで待つ
    if (_getSeenDb()) return;
    // NOTE modal (changelog 自動表示、sidebar/index.js の 500ms setTimeout) 等、
    // 他の起動時 modal と表示タイミングが重なると2枚重ねになり両方読めなくなる (2026-07-13発覚)。
    // 既存 modal が開いてる間はポーリングで待つ
    if (document.querySelector('.wwm-modal-backdrop')) {
      setTimeout(maybeStartDb, 500);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => _showDbAskModal()));
  }

  // welcome-banner.js 同型 (DOMContentLoaded待ち + setTimeout、baseline/import状態確定を待つ)。
  // import.js側の既存 maybeStart() 呼び出しコードは変更せず、DB告知は自己完結で起動する。
  function _initDb() {
    const launch = () => setTimeout(maybeStartDb, 1500);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', launch, { once: true });
    } else {
      launch();
    }
  }
  _initDb();

  window.WWMTutorial = {
    CURRENT_TUTORIAL_VERSION,
    maybeStart,
    start,
    _markSeen,
    maybeStartDb,
    startDb
  };
})();

// vite移行 P2: ESM 副作用 module 化 (window expose は IIFE 内 keep)
export {};

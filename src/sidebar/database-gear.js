// ── WWMetrics データベース画面 - 装備タブ (2026-07-04 初版 → 2026-07-05 兄貴フィードバック反映) ──
// 左: 9項目一覧 (主武器/副武器は「武器」に統合、装備欄が2つあるだけで武器概念は1つ、兄貴指摘2026-07-05)
// 右: Lv/Tier(/武器種)共通セレクタ → 基本ステ(選択中1点)+調律1枚目+調律2〜5枚目+定音
(function () {
  'use strict';
  const _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => _ESC_MAP[c]); }

  // 主武器/副武器は装備欄が2つあるだけで「武器」概念は1つ (兄貴指摘 2026-07-05)。
  // 内部データは主武器(slot '1')を参照 (equip_base_by_lv.json上slot1/slot2は全Lv/Tier完全同値)
  // 3グループ (武器系/防具系/弓矢系) 構成、兄貴指示2026-07-06で並び替え
  const _DISPLAY_ITEMS = [
    { key: 'weapon', dataSlot: '1', isWeapon: true, group: 1 },
    { key: '10', dataSlot: '10', group: 1 },
    { key: '11', dataSlot: '11', group: 1 },
    { key: '3', dataSlot: '3', group: 2 },
    { key: '4', dataSlot: '4', group: 2 },
    { key: '5', dataSlot: '5', group: 2 },
    { key: '8', dataSlot: '8', group: 2 },
    { key: '21', dataSlot: '21', group: 3 },
    { key: '9', dataSlot: '9', group: 3 },
  ];
  let _selectedKey = 'weapon';

  function _findItem(key) { return _DISPLAY_ITEMS.find(i => i.key === key) || _DISPLAY_ITEMS[0]; }

  function _displayLabel(item) {
    if (item.isWeapon) return (window.T && window.T.dbSlotWeapon) || '武器';
    return (window.WWMSidebar.icons && window.WWMSidebar.icons.slotLabelI18n(item.dataSlot)) || item.dataSlot;
  }

  function _renderSlotList() {
    let lastGroup = null;
    return _DISPLAY_ITEMS.map(item => {
      const sel = item.key === _selectedKey ? 'true' : 'false';
      const divider = (lastGroup !== null && item.group !== lastGroup) ? '<div class="wwm-db-slot-divider" role="separator"></div>' : '';
      lastGroup = item.group;
      return `${divider}<button type="button" class="wwm-db-slot-item" data-db-slot="${_esc(item.key)}" aria-selected="${sel}">${_esc(_displayLabel(item))}</button>`;
    }).join('');
  }

  // ── base attr key → statKey ラベル解決 (既存パターン踏襲) ──
  const _BASE_ATTR_LABEL_KEYS = {
    MIN_W_ATK: 'minPhys', MAX_W_ATK: 'maxPhys', W_DEF: 'physDef', HP_MAX: 'maxHp',
    ARCHER_DAMAGE: 'archerDamage', ARCHER_WEAKPOINT_DAMAGE: 'archerWeakpointDamage'
  };
  const _BASE_ATTR_LABELS_JA = {
    MIN_W_ATK: '最小外功攻撃', MAX_W_ATK: '最大外功攻撃',
    W_DEF: '外功防御', HP_MAX: '気血最大値'
  };
  function _baseAttrLabel(key) {
    const sk = _BASE_ATTR_LABEL_KEYS[key];
    if (sk && window._AFFIX_DISPLAY_LABELS) {
      const v = window._AFFIX_DISPLAY_LABELS[sk];
      if (v) return v;
    }
    return _BASE_ATTR_LABELS_JA[key] || key;
  }
  // min/maxペアの共通見出し (「最小」「最大」prefixを剥がして一致すれば共通ラベルとして使う)
  function _commonAttrLabel(minKey, maxKey) {
    const minLabel = _baseAttrLabel(minKey);
    const maxLabel = _baseAttrLabel(maxKey);
    const stripMin = minLabel.replace(/^最小/, '');
    const stripMax = maxLabel.replace(/^最大/, '');
    return stripMin === stripMax ? stripMin : minLabel;
  }

  // 弓矢/射玦は基礎ダメ系keyのみ(表示不要、兄貴判断)+レシピ枠のみ
  const _NO_BASE_TABLE_SLOTS = new Set(['9', '21']);
  const _RECIPE_SLOTS = new Set(['9', '21']);
  const _RANK_ORDER = ['gold', 'purple', 'blue'];
  const _RANK_LABEL_JA = { gold: '金', purple: '紫', blue: '青' };
  const _RANK_TO_TIER = { gold: '5', purple: '4', blue: '3' };

  // weaponType (data/kongfu.json 内部キー) → wdbCat 文字列 (affix-utils.js の M テーブルと同一)
  const _WEAPON_TYPE_TO_WDB_CAT = {
    sword: 'Weapon-Sword', spear: 'Weapon-Spear', mo_blade: 'Weapon-Mo Blade',
    dual_blades: 'Weapon-Dual Blades', rope_dart: 'Weapon-Rope Dart',
    fan: 'Weapon-Fan', umbrella: 'Weapon-Umbrella',
    heng_blade: 'Weapon-Heng Blade', gauntlet: 'Weapon-Gauntlets',
  };
  const _WEAPON_TYPE_LABEL_JA = {
    sword: '剣', spear: '槍', mo_blade: '墨刀', dual_blades: '双剣',
    rope_dart: '縄鏢', fan: '扇', umbrella: '傘', heng_blade: '横刀', gauntlet: '拳甲',
  };

  // ── 共通セレクタ state (スロット選択+武器種+Lv+Tier で 基本ステ/調律/定音 全部連動) ──
  let _ctrlLv = 91;
  let _ctrlRank = 'gold';
  let _ctrlWeaponType = 'sword';

  function _renderControls(item, opts) {
    opts = opts || {};
    const tbl = window.WWM_EQUIP_BASE_BY_LV;
    const lvList = (tbl && tbl._lvList) || [71, 81, 86, 91, 96, 100, 105];
    const lvOpts = lvList.map(lv => `<option value="${lv}" ${lv === _ctrlLv ? 'selected' : ''}>Lv${lv}</option>`).join('');
    const rankOpts = _RANK_ORDER.map(r => `<option value="${r}" ${r === _ctrlRank ? 'selected' : ''}>${_RANK_LABEL_JA[r]}</option>`).join('');
    const weaponTypeHtml = item.isWeapon ? `
      <label class="wwm-db-ctrl-item"><span class="wwm-db-ctrl-label">${_esc((window.T && window.T.dbWeaponType) || '武器種')}</span><select data-db-ctrl-weapontype>${
        Object.keys(_WEAPON_TYPE_TO_WDB_CAT).map(wt => `<option value="${wt}" ${wt === _ctrlWeaponType ? 'selected' : ''}>${_esc(_WEAPON_TYPE_LABEL_JA[wt])}</option>`).join('')
      }</select></label>` : '';
    // レシピ枠 (弓矢/射玦) は Tier(gold/purple/blue) 概念が無い (rankName が Lv と1:1、兄貴指示2026-07-05)
    const tierHtml = opts.showTier === false ? '' : `<label class="wwm-db-ctrl-item"><span class="wwm-db-ctrl-label">Tier</span><select data-db-ctrl-rank>${rankOpts}</select></label>`;
    return `
      <div class="wwm-db-controls">
        ${weaponTypeHtml}
        <label class="wwm-db-ctrl-item"><span class="wwm-db-ctrl-label">Lv</span><select data-db-ctrl-lv>${lvOpts}</select></label>
        ${tierHtml}
      </div>
    `;
  }

  // ── 基本ステータス (選択中Lv/Tier 1点のみ、シンプル表示) ──
  function _renderBaseStat(dataSlot) {
    if (_NO_BASE_TABLE_SLOTS.has(dataSlot)) return '';
    const tbl = window.WWM_EQUIP_BASE_BY_LV;
    const slotData = tbl && tbl.slots && tbl.slots[dataSlot];
    if (!slotData) return '';
    const tier = _RANK_TO_TIER[_ctrlRank] || '5';
    const cell = slotData.table && slotData.table[String(_ctrlLv)] && slotData.table[String(_ctrlLv)][tier];
    let keys = (slotData._keys || []).slice();
    const rows = [];
    if (keys.includes('MIN_W_ATK') && keys.includes('MAX_W_ATK')) {
      const label = _commonAttrLabel('MIN_W_ATK', 'MAX_W_ATK');
      const v = cell ? `${cell.MIN_W_ATK} 〜 ${cell.MAX_W_ATK}` : '-';
      rows.push(`<div class="wwm-db-basestat-row"><span class="wwm-db-basestat-label">${_esc(label)}</span><span class="wwm-db-basestat-value">${_esc(v)}</span></div>`);
      keys = keys.filter(k => k !== 'MIN_W_ATK' && k !== 'MAX_W_ATK');
    }
    keys.forEach(k => {
      const label = _baseAttrLabel(k);
      const v = cell && cell[k] != null ? String(cell[k]) : '-';
      rows.push(`<div class="wwm-db-basestat-row"><span class="wwm-db-basestat-label">${_esc(label)}</span><span class="wwm-db-basestat-value">${_esc(v)}</span></div>`);
    });
    return `
      <section class="wwm-db-section">
        <h3 class="wwm-db-section-title">${_esc((window.T && window.T.dbBaseStatTitle) || '基本ステータス')}</h3>
        <div class="wwm-db-basestat">${rows.join('')}</div>
      </section>
    `;
  }

  // ── 調律 (1枚目=idx0単独 / 2〜5枚目=idx1-4共通プール) ──
  function _tuningKeysAndChance(dataSlot, idx) {
    const affixNs = window.WWMSidebar.affix;
    if (dataSlot === '1') {
      // 武器: roleInfo不要の直接データアクセス (slot経由の解決関数はroleInfo依存のため使えない)
      const wdbCat = _WEAPON_TYPE_TO_WDB_CAT[_ctrlWeaponType];
      const selectorData = window.WWM_AFFIX_SELECTOR && window.WWM_AFFIX_SELECTOR.data;
      const chanceData = window.WWM_AFFIX_CHANCE && window.WWM_AFFIX_CHANCE.data;
      const tier = _RANK_TO_TIER[_ctrlRank] || '5';
      const list = selectorData && wdbCat && selectorData[wdbCat] && selectorData[wdbCat][String(_ctrlLv)] && selectorData[wdbCat][String(_ctrlLv)][tier] && selectorData[wdbCat][String(_ctrlLv)][tier][String(idx)];
      const chance = (chanceData && wdbCat && chanceData[wdbCat] && chanceData[wdbCat][String(_ctrlLv)] && chanceData[wdbCat][String(_ctrlLv)][tier] && chanceData[wdbCat][String(_ctrlLv)][tier][String(idx)]) || {};
      return { keys: list ? new Set(list) : null, chance };
    }
    const keys = affixNs.selectorAllowedStatKeys(dataSlot, idx, _ctrlLv, _ctrlRank);
    const chance = affixNs.affixChanceMap(dataSlot, idx, _ctrlLv, _ctrlRank) || {};
    return { keys, chance };
  }

  // 出現率セルマークアップ (テキスト+バー表示、Claude Design相談経由で1c-light案採用 2026-07-05)
  function _pctCellHtml(pctVal, pctMax) {
    if (pctVal == null) return '<td></td>';
    const pctText = pctVal.toFixed(2) + '%';
    const barPct = pctMax > 0 ? (pctVal / pctMax) * 100 : 0;
    return `<td class="wwm-db-pct-cell"><span class="wwm-db-pct-bar-wrap"><span class="wwm-db-pct-bar" style="width:${barPct}%"></span></span><span class="wwm-db-pct-text">${_esc(pctText)}</span></td>`;
  }

  function _renderTuningRows(dataSlot, idxList) {
    const affixNs = window.WWMSidebar.affix;
    if (!affixNs) return '';
    const seen = new Set();
    const entries = [];
    idxList.forEach(idx => {
      const { keys, chance } = _tuningKeysAndChance(dataSlot, idx);
      if (!keys) return;
      keys.forEach(sk => {
        if (seen.has(sk)) return;
        seen.add(sk);
        const minMax = affixNs.getAffixMinMax(sk, _ctrlLv);
        const label = (window._AFFIX_DISPLAY_LABELS && window._AFFIX_DISPLAY_LABELS[sk]) || sk;
        const pctVal = chance[sk] != null ? chance[sk] : null;
        const range = minMax ? `${affixNs.fmtAffixVal(minMax.min, sk)} 〜 ${affixNs.fmtAffixVal(minMax.max, sk)}` : '-';
        entries.push({ label, range, pctVal });
      });
    });
    if (!entries.length) return `<p class="wwm-db-empty">${_esc((window.T && window.T.dbAffixEmpty) || 'データなし')}</p>`;
    const pctMax = Math.max(...entries.map(e => e.pctVal || 0));
    const rows = entries.map(e => `<tr><td>${_esc(e.label)}</td><td>${_esc(e.range)}</td>${_pctCellHtml(e.pctVal, pctMax)}</tr>`);
    return `
      <table class="wwm-db-table">
        <thead><tr>
          <th scope="col">${_esc((window.T && window.T.dbAffixColName) || '効果')}</th>
          <th scope="col">${_esc((window.T && window.T.dbAffixColRange) || '範囲')}</th>
          <th scope="col">${_esc((window.T && window.T.dbAffixColChance) || '出現率')}</th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    `;
  }

  function _renderTuningSection(dataSlot) {
    return `
      <section class="wwm-db-section" data-db-section="tuning1">
        <h3 class="wwm-db-section-title">${_esc((window.T && window.T.dbTuningSlot1) || '調律 1枠目')}</h3>
        ${_renderTuningRows(dataSlot, [0])}
      </section>
      <section class="wwm-db-section" data-db-section="tuning25">
        <h3 class="wwm-db-section-title">${_esc((window.T && window.T.dbTuningSlot25) || '調律 2〜5枠目')}</h3>
        ${_renderTuningRows(dataSlot, [1, 2, 3, 4])}
      </section>
    `;
  }

  // ── 定音 (idx5、武器/環/佩=貫通3種のみ、防具=武学固有全部を武術フィルタなしで一覧、兄貴指示2026-07-05) ──
  function _attuneStatKeys(dataSlot) {
    const affixNs = window.WWMSidebar.affix;
    if (!affixNs) return [];
    if (affixNs.SLOT6_WEAPON_LIKE.has(dataSlot)) return affixNs.SLOT6_PEN_STATS;
    if (affixNs.SLOT6_ARMOR.has(dataSlot)) {
      const all = window.WWM_AFFIX || {};
      const seen = new Set();
      Object.values(all).forEach(info => {
        const sk = info && info.statKey;
        if (!sk || seen.has(sk)) return;
        // 汎用武器種ダメ(swordDmg等)は「その武器種全体」の効果で武学固有ではない、
        // matchKongfuSpecificがprefix一致で誤検出するため除外 (兄貴指摘2026-07-05「定音じゃないものが紛れてる」)
        if (affixNs.WEAPON_DMG_KEYS && affixNs.WEAPON_DMG_KEYS.has(sk)) return;
        if (affixNs.matchKongfuSpecific(sk)) seen.add(sk);
      });
      return [...seen].sort();
    }
    return [];
  }

  function _renderAttuneSection(dataSlot) {
    const affixNs = window.WWMSidebar.affix;
    if (!affixNs) return '';
    const keys = _attuneStatKeys(dataSlot);
    if (!keys.length) return '';
    const rows = keys.map(sk => {
      const minMax = affixNs.getAffixMinMax(sk, _ctrlLv);
      const label = (window._AFFIX_DISPLAY_LABELS && window._AFFIX_DISPLAY_LABELS[sk]) || sk;
      const range = minMax ? `${affixNs.fmtAffixVal(minMax.min, sk)} 〜 ${affixNs.fmtAffixVal(minMax.max, sk)}` : '-';
      return `<tr><td>${_esc(label)}</td><td>${_esc(range)}</td><td></td></tr>`;
    }).join('');
    return `
      <section class="wwm-db-section" data-db-section="attune">
        <h3 class="wwm-db-section-title">${_esc((window.T && window.T.dbAttuneTitle) || '定音')}</h3>
        <table class="wwm-db-table">
          <thead><tr>
            <th scope="col">${_esc((window.T && window.T.dbAffixColName) || '効果')}</th>
            <th scope="col">${_esc((window.T && window.T.dbAffixColRange) || '範囲')}</th>
            <th scope="col"></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    `;
  }

  // 弓矢(slot 21)/射玦(slot 9) のみレシピ枠 (data/gear_recipe.jsonの recipe.slot 値と対応)
  const _RECIPE_SLOT_TO_TYPE = { '21': 'bow', '9': 'ring' };

  function _curLang() { return (window.currentLang) || 'ja'; }

  // access_no=255 = 「モンスター討伐全般/その他手段」の汎用sentinel (名前なし、data/gear_recipe.json _schema参照)
  function _materialAccessText(itemId) {
    const rec = window.WWM_GEAR_RECIPE;
    const arr = (rec && rec.materialAccess && rec.materialAccess[String(itemId)]) || [];
    const named = arr.filter(a => a !== 255).map(a => window.WWM_DS.name('material_access', a, _curLang()));
    const hasOther = arr.includes(255);
    if (!named.length) return hasOther ? _esc((window.T && window.T.dbRecipeAccessOther) || 'その他の入手方法') : '-';
    let text = named.join('、');
    if (hasOther) text += '、' + ((window.T && window.T.dbRecipeAccessOther) || 'その他の入手方法');
    return _esc(text);
  }

  function _renderRecipeMaterialsTable(materials) {
    const rows = materials.map(m => {
      const name = window.WWM_DS.name('material', m.itemId, _curLang());
      const desc = window.WWM_DS.name('material_desc', m.itemId, _curLang());
      return `<tr><td title="${_esc(desc)}">${_esc(name)}</td><td>×${m.qty}</td><td>${_materialAccessText(m.itemId)}</td></tr>`;
    }).join('');
    return `
      <table class="wwm-db-recipe-materials">
        <thead><tr>
          <th scope="col">${_esc((window.T && window.T.dbRecipeMaterialCol) || '材料')}</th>
          <th scope="col">${_esc((window.T && window.T.dbRecipeQtyCol) || '個数')}</th>
          <th scope="col">${_esc((window.T && window.T.dbRecipeAccessCol) || '獲得方法')}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function _renderRecipeItem(recipe) {
    // outputs(base/bonusT4/bonusT5)確率は全35レシピ共通固定(100%/10%/5%)、UI表示せず(兄貴指示2026-07-05)。
    // データ自体はgear_recipe.jsonに保持継続
    const outName = window.WWM_DS.name('gear_recipe_item', recipe.outputItemBase, _curLang());
    const variantLabel = (outName && outName.indexOf('[gear_recipe_item:') !== 0) ? outName : recipe.variant;
    return `
      <div class="wwm-db-recipe-item">
        <div class="wwm-db-recipe-variant">${_esc(variantLabel)}</div>
        ${_renderRecipeMaterialsTable(recipe.materials)}
      </div>
    `;
  }

  // 共通 Lv セレクタ(_ctrlLv)で絞り込み表示 (兄貴指示2026-07-05「これもレベル選択式にする」)。
  // gear_recipe.json が Lv71/81/86/91/96/100/105 の全7Lv分そろった (Homebound/Azurecloud追加確定) ため、
  // 他セクションと同じ _ctrlLv 共有で欠番なく成立する。
  function _renderRecipeSection(dataSlot) {
    const title = `<h3 class="wwm-db-section-title">${_esc((window.T && window.T.dbRecipeTitle) || '製作レシピ')}</h3>`;
    const wantType = _RECIPE_SLOT_TO_TYPE[dataSlot];
    const rec = window.WWM_GEAR_RECIPE;
    const recipes = wantType ? (rec && rec.recipes || []).filter(r => r.slot === wantType && r.lv === _ctrlLv) : [];
    if (!recipes.length) {
      return `<section class="wwm-db-section">${title}<p class="wwm-db-empty">${_esc((window.T && window.T.dbRecipeComingSoon) || '近日対応予定')}</p></section>`;
    }
    // rankName見出しは削除 (Lvは上のLVセレクタと重複、rankNameはカードタイトル= gear_recipe_item 正式名に
    // 既に日本語で埋め込み済み「東望の弓・剛腕」等、兄貴指摘2026-07-05で二重表示と判明)
    const itemsHtml = recipes.map(_renderRecipeItem).join('');
    return `
      <section class="wwm-db-section">
        ${title}
        <div class="wwm-db-recipe-rank">
          ${itemsHtml}
        </div>
      </section>
    `;
  }

  function _rerenderDetail(item) {
    const root = document.getElementById('dbGear');
    if (!root) return;
    const bodyEl = root.querySelector('[data-db-gear-detail-body]');
    if (!bodyEl) return;
    if (_RECIPE_SLOTS.has(item.dataSlot)) {
      bodyEl.innerHTML = `
        ${_renderControls(item, { showTier: false })}
        ${_renderRecipeSection(item.dataSlot)}
      `;
      _attachControls(item);
      return;
    }
    bodyEl.innerHTML = `
      ${_renderControls(item)}
      ${_renderBaseStat(item.dataSlot)}
      ${_renderTuningSection(item.dataSlot)}
      ${_renderAttuneSection(item.dataSlot)}
    `;
    _attachControls(item);
  }

  function _attachControls(item) {
    const root = document.getElementById('dbGear');
    if (!root) return;
    const lvSel = root.querySelector('[data-db-ctrl-lv]');
    const rankSel = root.querySelector('[data-db-ctrl-rank]');
    const wtSel = root.querySelector('[data-db-ctrl-weapontype]');
    const affixNs = window.WWMSidebar.affix;
    const rerenderAll = () => _rerenderDetail(item);
    // equip_max.json 遅延読込 (装備編集パネル経由でない直行時は未読込 = 範囲列が "-" 固定になる、明示load+再描画)
    if (affixNs && !affixNs.getCachedEquipMax()) {
      affixNs.loadEquipMax().then(rerenderAll);
    }
    if (lvSel) lvSel.addEventListener('change', () => { _ctrlLv = parseInt(lvSel.value, 10); rerenderAll(); });
    if (rankSel) rankSel.addEventListener('change', () => { _ctrlRank = rankSel.value; rerenderAll(); });
    if (wtSel) wtSel.addEventListener('change', () => { _ctrlWeaponType = wtSel.value; rerenderAll(); });
  }

  function _isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
  }

  function render() {
    const root = document.getElementById('dbGear');
    if (!root) return;
    root.innerHTML = `
      <div class="wwm-db-gear" data-db-gear-root>
        <div class="wwm-db-gear-list">
          <div class="wwm-db-gear-list-inner" data-db-gear-list></div>
        </div>
        <div class="wwm-db-gear-detail" data-db-gear-detail>
          <button type="button" class="wwm-db-gear-back" data-db-gear-back>${_esc((window.T && window.T.dbBackToList) || '← 一覧へ戻る')}</button>
          <div data-db-gear-detail-body></div>
        </div>
      </div>
    `;
    const listEl = root.querySelector('[data-db-gear-list]');
    listEl.innerHTML = _renderSlotList();
    listEl.querySelectorAll('[data-db-slot]').forEach(btn => {
      btn.addEventListener('click', () => selectSlot(btn.dataset.dbSlot));
    });
    const backBtn = root.querySelector('[data-db-gear-back]');
    if (backBtn) backBtn.addEventListener('click', () => {
      const gearRoot = root.querySelector('[data-db-gear-root]');
      if (gearRoot) gearRoot.removeAttribute('data-mobile-view');
    });
    selectSlot(_selectedKey);
    // render()末尾の初期選択呼び出し由来のdata-mobile-viewを即解除
    // (タブを開いた直後は一覧表示、スロットタップで初めて詳細へ。既存Task8仕様踏襲)
    const gearRootInit = root.querySelector('[data-db-gear-root]');
    if (gearRootInit) gearRootInit.removeAttribute('data-mobile-view');
  }

  function selectSlot(key) {
    _selectedKey = key;
    const item = _findItem(key);
    const root = document.getElementById('dbGear');
    if (!root) return;
    root.querySelectorAll('[data-db-slot]').forEach(btn => {
      btn.setAttribute('aria-selected', String(btn.dataset.dbSlot === key));
    });
    _rerenderDetail(item);
    if (_isMobile()) {
      const gearRoot = root.querySelector('[data-db-gear-root]');
      if (gearRoot) gearRoot.setAttribute('data-mobile-view', 'detail');
    }
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.databaseGear = { render, selectSlot };
})();

export {};

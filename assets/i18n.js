// ── 多言語辞書 ────────────────────────────────────────────────────
const TRANSLATIONS = {
  ja: {
    pageTitle:'風燕計 | WWMETRICS', headerTitle:'風燕計', brandVert:'風燕計',
    headerSub:'WWM-REAL-TIME-METRICS',
    sec1:'基本ステータス', sec2:'判定確率', sec3:'ダメージ増加効果',
    sec4:'スキルステータス', sec5:'その他ステータス', sec6:'エネミーデータ',
    minPhysATK:'最小物理ATK', maxPhysATK:'最大物理ATK',
    minElemMain:'最小属性ATK（主）', maxElemMain:'最大属性ATK（主）',
    minElemSub:'最小属性ATK（副）', maxElemSub:'最大属性ATK（副）',
    jgInputVal:'入力値', jgApplied:'適用値',
    hitRate:'命中率', critRate:'会心率', sympathyRate:'会意率',
    addCritRate:'付加会心率', addSympathyRate:'付加会意率',
    critBoost:'会心攻撃強化', allMartialBoost:'全武術効果増加',
    sympathyBoost:'会意攻撃強化', specMartialBoost:'指定武術効果強化',
    outerPen:'外功貫通', bossBoost:'首領ダメージ増加',
    elemPen:'属性貫通', elemAtkBoost:'属性攻撃強化',
    dmgReduce1:'ダメージ軽減１', dmgReduce2:'ダメージ軽減２',
    weaponBonus:'外功ダメージ強化', outerCoeff:'外功係数', statusCoeff:'ステータス攻撃係数',
    outerAdd:'外功付加', enemyDebuff:'デバフ（敵）',
    worldLv:'大世界等級（Lv）', martialLv:'武術等級（Lv）',
    elemBoostMain:'属性強化（主）', elemBoostSub:'属性強化（副）',
    enemyLevel:'エネミーレベル', physDef:'物理防御力', judgeRes:'審判耐性',
    physRes:'物理耐性値', elemRes:'属性耐性値',
    manualInput:'手動入力', enemyPresetTitle:'エネミーデータ（プリセット）',
    resultTitle:'期待ダメージ', resultHero:'EXPECTED · 期待値',
    resultHeroSub:'最終ダメージ期待値',
    breakdownPhys:'PHYSICAL', breakdownElem:'ELEMENTAL', breakdownExp:'EXPECTED',
    probCrit:'会心', probSympathy:'会意', probGraze:'かすり', probNormal:'通常',
    probPhys:'物理', probElem:'属性',
    donutCenter:'P · 確率分布', donutDmgCenter:'勁率',
    thHitType:'ヒット種', thAvgATK:'平均ATK', thMinATK:'最小ATK', thMaxATK:'最大ATK',
    thPhysPct:'物理%', thElemPct:'属性%', thTotal:'合計', thPhys:'物理', thElem:'属性',
    rowNormal:'通常DMG', rowCrit:'会心DMG', rowSympathy:'会意DMG',
    rowSympathySub:'最大ATK', rowGraze:'かすりDMG', rowGrazeSub:'最小ATK', rowExpected:'DMG期待値',
    detailsTitle:'詳細ダメージ表',
    presetTitle:'プリセット', presetSave:'保存', presetLoad:'読込', presetNamePlaceholder:'プリセット {n}',
    skillPresetTitle:'スキルプリセット', skillPresetPlaceholder:'— 選択 —', skillPresetNamePh:'名前を入力', skillPresetSave:'保存', skillPresetNeedName:'名前を入力してください',
    setEffect:'セット効果',
    setEff_none:'セット効果なし',
    setEff_jadeware_1:'碧玉一式', setEff_jadeware_2:'碧玉一式（敵真気<40%）',
    setEff_hawkwing_1:'飛鳥一式（1stack）', setEff_hawkwing_2:'飛鳥一式（2stack）', setEff_hawkwing_3:'飛鳥一式（3stack）', setEff_hawkwing_4:'飛鳥一式（4stack）', setEff_hawkwing_5:'飛鳥一式（5stack）',
    setEff_rainwhisper_1:'時雨一式', setEff_rainwhisper_2:'時雨一式（気血シールド時）',
    setEff_swallow_1:'帰燕一式（軽撃発動効果）', setEff_swallow_2:'帰燕一式（敵真気<40%）', setEff_swallow_3:'帰燕一式（軽撃発動効果 AND 敵真気<40%）',
    setEff_mountain_1:'斬岳一式', setEff_mountain_2:'斬岳一式（派生・協戦技）',
    setEff_willow_1:'霧柳一式（重撃命中後）', setEff_willow_2:'霧柳一式（軽撃/弾道命中後）', setEff_willow_3:'霧柳一式（両発動 霧柳重々）',
    setEff_ivory_1:'浄花一式（気血Max時）',
    setEff_sway_50:'山崩一式（敵気血50%）', setEff_sway_55:'山崩一式（敵気血55%）', setEff_sway_60:'山崩一式（敵気血60%）', setEff_sway_65:'山崩一式（敵気血65%）', setEff_sway_70:'山崩一式（敵気血70%）', setEff_sway_75:'山崩一式（敵気血75%以上）',
    xinfa:'心法', xinfa_none:'心法なし', xinfa_yishui_5:'易水の歌（5stack）', xinfa_yishui_5_cc:'易水の歌（5stack・妨害状態）',
    effTitle:'ステータス効率分析', effSub:'EFFICIENCY / +1 unit',
    effNote:'各ステータス＋装備1個あたりの期待DMG増加量。現在の入力値を基準に自動計算。',
    effThStat:'ステータス', effThMax:'X値', effThBase:'基準期待値',
    effThAfter:'+x後期待値', effThDelta:'増加量(+x)', effThPer1:'+1あたり',
    effThScore:'スコア', effThRating:'評価',
    effRateFire:'最優先', effRateStar:'優先', effRateGood:'良好', effRateLow:'低効率',
    effMinPhysATK:'最小物理ATK', effMaxPhysATK:'最大物理ATK',
    effMinElemATK:'最小属性ATK', effMaxElemATK:'最大属性ATK',
    effCritRate:'会心率', effSympathy:'会意率', effHitRate:'命中率',
    effAgility:'速 (Agility)', effPower:'会 (Power)', effStrength:'力 (Strength)',
    effBossBoost:'ダメージ増加', effPhysPen:'物理貫通', effElemPen:'属性貫通',
    toastSaved:'プリセット「{name}」を保存', toastLoaded:'プリセット「{name}」を読込', toastDeleted:'プリセット「{name}」を削除', toastExported:'画像を出力しました', toastImportWip:'工事中のため使用できません', scoreUpdateMsg:'計算データが更新されました。最新スコアを反映するには再インポートしてください', scoreUpdateBtn:'再インポート', importPrompt:'上部「IMPORT」ボタンからデータを取り込んでください', importHintLabel:'ここからインポート', importBtn:'IMPORT', exportBtn:'EXPORT', resetBtn:'RESET', shareBtn:'SHARE', noteBtn:'NOTE',
    importSetupTitle:'引燕 / DATA IMPORT', importSetupIntro:'公式データツールのデータを取り込むには、ブックマークレットの登録が必要です。',
    importOpenOfficial:'公式データツールを開く', importOpenSetup:'セットアップページを開く', importUsageHint:'設定完了後: 公式ツールを開いてブックマークレットをクリックしてください。',
    importLastLabel:'直前のインポート', importReapply:'再適用', importNoHistory:'直前のインポートはありません',
    importPreviewTitle:'引燕 / DATA IMPORT', importApplyBtn:'インポート実行', importCancelBtn:'キャンセル',
    importNextBtn:'次へ', importBackBtn:'戻る', importStep2Title:'観音 & 武庫 入力',
    importEnhanceTitle:'観音 (Enhance)', importArsenalTitle:'武庫 (Arsenal)',
    importArsenalPath:'武庫種別', importArsenalPeaked:'頂点',
    importConfirmMsg:'現在設定されている数値がインポートデータに差し変わりますがよろしいですか？', importDone:'インポート完了',
    affixRankingTab:'調律/定音番付', affixRankingTitle:'調律/定音番付',
    optimizationTitle:'装備最適化提案',
    diagTitle:'弱点指摘 / Diagnostics',
    diagHitOver:'命中率過多 (現 {0}% / cap {1}% / 超過 +{2}%)',
    diagHitUnder:'命中率不足 (現 {0}% / cap {1}% / 残 {2}%)',
    diagCritOver:'会心率過多 (適用 {0}% / cap 80% / 超過 +{1}%)',
    diagSymOver:'会意率過多 (適用 {0}% / cap 40% / 超過 +{1}%)',
    diagCritUnder:'会心率不足 (適用 {0}% / 最終会心+会意 {1}%)',
    diagGood:'主要ステータス は概ね良好',
    diagPenBoth:'外功/属性 どちらにも特化なし → 片方に特化推奨 (外功貫通+1={0} / 属性貫通+1={1} / 推奨 外功≥{2} or 属性≥{3})',
    diagAffix6Mismatch:'武器系定音オプション 全4スロット {0} だが {1} の方が期待値高 (外功貫通+1={2} / 属性貫通+1={3})',
    diagAffix6Mixed:'武器系定音オプション 混在 ({0}) → {1} 4スロット統一推奨 (外功貫通+1={2} / 属性貫通+1={3})',
    diagWasted:'無駄オプション ({0}件): {1}{2}',
    diagWastedMore:' 他{0}件',
    gearCompareTitle:'武具対照 / COMPARISON', cmpTitleJa:'武具対照', cmpTitleEn:'COMPARISON', cmpApply:'採用', cmpReset:'復元', cmpCancel:'離脱', cmpCurrent:'現有', cmpNew:'新置', cmpDeltaLabel:'武格変動',
    xinfaCompareTitle:'心法比較 / COMPARISON', xinfaTitleJa:'心法対照',
    pathAtkBellstrike:'鋼鳴攻撃', pathAtkStonesplit:'砕岩攻撃', pathAtkSilkbind:'糸操攻撃', pathAtkBamboocut:'瞬嵐攻撃', pathAtkVoid:'無相攻撃',
    pathPenBellstrike:'鋼鳴貫通', pathPenStonesplit:'砕岩貫通', pathPenSilkbind:'糸操貫通', pathPenBamboocut:'瞬嵐貫通', pathPenVoid:'無相貫通',
    pathDmgBellstrike:'鋼鳴ダメージ強化', pathDmgStonesplit:'砕岩ダメージ強化', pathDmgSilkbind:'糸操ダメージ強化', pathDmgBamboocut:'瞬嵐ダメージ強化', pathDmgVoid:'無相ダメージ強化',
    stMaxHp:'最大HP', stPhysDef:'外功防御', stCritHeal:'会心治癒',
    changelogTitle:'変更履歴', changelogLangNotice:'※ Changelog: Japanese only / 日本語のみ / 일본어 한정', close:'閉じる',
    noteTitleJa:'筆記', noteSeal:'記', noteTabSpec:'仕様', noteTabChangelog:'更新履歴', noteBugReport:'バグ報告', noteFeatureRequest:'追加要望',
    optSlotAll:'全装備', optSlotWeapon:'主/副武器', optSlotAccessory:'環/佩び物', optSlotArmor:'防具',
    optApplyAll:'全適用', optApplyOne:'適用', optRecalc:'再計算', optTargetRatio:'目標',
    railOpt:'最適', railRank:'期待値', railDiag:'弱点',
    slotMain:'主武器', slotSub:'副武器', slotHelm:'冠', slotChest:'胸当て', slotLegs:'膝鎧', slotHands:'小手', slotRing:'環', slotPendant:'佩び物', slotBow:'弓矢', slotDisc:'射玦',
    importStep1Title:'Step 1: ブックマークレット 初回セットアップ (未登録時のみ開く)',
    importTabPC:'PC', importTabMobile:'モバイル',
    importPcStep1:'ブックマークバー表示 (Chrome/Edge: <code>Ctrl+Shift+B</code>)',
    importPcStep2:'下のボタンを<b>ドラッグ</b>してブックマークバーへ:',
    importPcStep3:'下の「公式データツールを開く」 → ログイン後、登録したブックマークをクリック',
    importBmLabel:'風燕計インポート',
    importMobStep1:'下のコードをコピー:',
    importMobStep2:'公式ツールをブックマーク登録',
    importMobStep3:'ブックマーク編集 → URL をコピーしたコードに置換 → 名前「WWM インポート」',
    importMobStep4:'公式ツール開いた状態で アドレスバーに「WWM」入力 → 候補タップ',
    importCopy:'コピー', importCopied:'コピー完了 ✓',
    importReapplyNote:'前回データをそのまま再インポート。<br>最新装備で取り込むには 公式データツール から再度ブックマークレット実行。',
    importLabelUID:'UID', importLabelCharName:'キャラ名', importLabelMainKf:'主武術', importLabelSubKf:'副武術', importLabelXinfa:'心法', importLabelXiuwei:'武術進度',
    importBaseStats:'基本ステータス', importSubStats:'副ステータス', pvpExclusiveAffix:'PvP専用定音',
    noteSpec: `
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">ツール概要</h3>
      <p class="wwm-note-p">風燕伝 (Where Winds Meet) 装備強度の比較・最適化ツール。<b>武格指数</b> を中心に、装備/調律・定音オプション/武術/心法/装備一式効果を統合してダメージ期待値を算出し、装備改善方針を提示する。</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">データ取得 (前提)</h3>
      <p class="wwm-note-p">本ツールは <b>風燕伝公式・データツール</b> からインポートしたデータを元に動作する。インポートするまで装備情報・スコアは表示されない。インポートデータはブラウザの localStorage に保存され、再起動後も保持される。</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">武格指数 (Martial Index) とは</h3>
      <p class="wwm-note-p">装備/調律・定音オプション/武術/心法/装備一式効果を全て込みで、<b>全プレイヤー共通の固定係数</b> でダメージ期待値を算出した指標。大世界等級や敵側パラメータの個人差を排除しているため、装備の絶対強度を比較できる。</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">Tier 判定基準</h3>
      <p class="wwm-note-p"><b>装備最適化提案を全て適用した時の最大スコア</b> を 100% として、現在の武格指数の比率で判定。インポート時に基準確定、再インポートで更新。</p>
      <ul class="wwm-note-list">
        <li><b>SS:</b> 最大の 95% 以上</li>
        <li><b>S:</b> 90% 以上</li>
        <li><b>A:</b> 80% 以上</li>
        <li><b>B:</b> 65% 以上</li>
        <li><b>C:</b> 未満</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">計算に反映される効果</h3>
      <ul class="wwm-note-list">
        <li>装備 基本ステータス (外功攻撃力/属性攻撃力 等)</li>
        <li>調律/定音オプション (調律1〜5、 定音1〜5)</li>
        <li>武術才能効果 (会心率上限 +Δ、 武術属性別 攻撃/貫通/属性ダメ 強化 等)</li>
        <li>心法 Tier 効果 (Tier2/5 表示反映 + Tier0/1/3/4/6 裏加算)</li>
        <li>装備二点一式効果 (2点装備で発動する加算系)</li>
        <li>装備四点一式効果 (4点装備で +100 固定ボーナス、 各装備に均等配賦)</li>
        <li>基礎値 (体/力/防/速/会) → 派生 (基本ステータス・判定確率)</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">計算に反映されない効果</h3>
      <ul class="wwm-note-list">
        <li>装備四点一式効果の条件付効果 (気血/真気/受流/重撃 トリガー等) — 一律 +100 固定で代替</li>
        <li>観音 (ゲーム内ステータス非影響と判明、 ステ画面に反映されないため計算対象外)</li>
        <li>PvP 専用定音 (定音6枠) — 表示のみ、 計算寄与なし</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">計算前提値 (固定)</h3>
      <ul class="wwm-note-list">
        <li><b>外功攻撃係数:</b> ×1.5</li>
        <li><b>ステータス攻撃係数:</b> ×1.5</li>
        <li><b>付加外功:</b> +230</li>
        <li><b>属性強化 (主):</b> ×1.5</li>
        <li><b>属性強化 (副):</b> ×1.0</li>
        <li><b>大世界等級:</b> 現在のアップデート状況に応じた上限値 (グローバル基準)</li>
        <li><b>武術等級:</b> キャラクター Lv と同一</li>
        <li><b>敵パラメータ:</b> charLv ≥ 96 → 敵Lv96 (DEF 405 / 審判耐性 1.65)、 未満 → 敵Lv91 (DEF 350 / 審判耐性 1.45)</li>
        <li><b>キャラクター基本ステータス:</b> キャラクター才能/シングルプレイレベル ボーナス/五音太平楽 を含むステータス加算値を <b>振り切れているもの</b> として算出</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">データバージョン管理</h3>
      <p class="wwm-note-p">ゲーム側のバランス調整などでツール側の計算式が更新された際、既存の武格指数 (baseline) は破棄され、最上部に <b>再インポート促しバナー</b> が表示される。再インポート後、新しい計算式で武格指数が再算出される。</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">主要機能</h3>
      <ul class="wwm-note-list">
        <li><b>武具対照:</b> 現在装備と新規装備の調律/定音差分シミュレーション。スコア変動を即時プレビュー</li>
        <li><b>心法対照:</b> 心法の差替えシミュレーション。Tier 別効果と発動条件を比較</li>
        <li><b>装備最適化提案:</b> 調律/定音の理想配分を逆算し、 現在からの改善ステップを順に提示</li>
        <li><b>プリセット保存:</b> 試行中の装備構成を保存・呼出し可能</li>
        <li><b>OBS Share:</b> サイドバーのみ表示する配信用 URL を生成 (透明背景・色調カスタム対応)</li>
        <li><b>4言語対応 (日/英/中/韓) + ライト/ダーク切替</b></li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">計算式 (要約)</h3>
      <pre class="wwm-note-pre">expected = normalAvg × pNormal
         + critAvg × pCrit
         + sympathyDmg × pSympathy
         + grazeDmg × pGraze

各 dmg = (物理 + 属性) × 全武術ダメ × 外功増伤 × 軽減
statusScore = expected を固定係数で再計算したもの
finalScore  = statusScore + 4-set bonus (4点一式効果発動時)</pre>
    </div>`,
    importStep2XinfaTitle:'心法 Tier', importStep2XinfaHint:'各心法の到達Tier (1-5)。Tier2 で Tier2効果、Tier5 で Tier5効果 加算。',
    penPhys:'外功貫通', penVoid:'無相貫通', penPhysShort:'外功', penVoidShort:'無相', penOther:'他',
    pathPhys:'汎用', pathBellstrike:'鋼鳴', pathStonesplit:'砕岩', pathSilkbind:'糸操', pathBamboocut:'瞬嵐',
    martialIndex:'武格指数', martialIndexSub:'MARTIAL INDEX', sbEmptyTitle:'まだインポートデータがありません。', sbEmptyHint:'上部「IMPORT」ボタンから取り込みできます。', martialHistoryTab:'武格履歴', historyEmpty:'まだ履歴がありません。インポート時に自動記録されます。', qualityTab:'ロール品質', qualityEmpty:'インポート後 装備データから品質を表示', minElemSub:'最小属性攻撃(副)', maxElemSub:'最大属性攻撃(副)',
    effectUnset:'未代入', globalDmgBoost:'全ダメージ強化', effAnalysisTitle:'調律/定音効率分析',
    locale:'ja-JP',
  },
  en: {
    pageTitle:'Where Winds Metrics | WWMETRICS', headerTitle:'Where Winds Metrics', brandVert:'風燕計',
    headerSub:'WWM-REAL-TIME-METRICS',
    sec1:'Base Stats', sec2:'Hit Probability', sec3:'DMG Increase Effects',
    sec4:'Skill Stats', sec5:'Other Stats', sec6:'Enemy Data',
    minPhysATK:'Min Physical ATK', maxPhysATK:'Max Physical ATK',
    minElemMain:'Min Elemental ATK (Main)', maxElemMain:'Max Elemental ATK (Main)',
    minElemSub:'Min Elemental ATK (Sub)', maxElemSub:'Max Elemental ATK (Sub)',
    jgInputVal:'Input', jgApplied:'Applied',
    hitRate:'Hit Rate', critRate:'Critical Rate', sympathyRate:'Affinity Rate',
    addCritRate:'Added Critical Rate', addSympathyRate:'Added Affinity Rate',
    critBoost:'Critical DMG Bonus', allMartialBoost:'All Martial Arts Effect +',
    sympathyBoost:'Affinity DMG Bonus', specMartialBoost:'Designated Martial Arts Effect +',
    outerPen:'Outer Force Penetration', bossBoost:'Elite DMG Bonus',
    elemPen:'Elemental Penetration', elemAtkBoost:'Elemental ATK Boost',
    dmgReduce1:'DMG Reduction 1', dmgReduce2:'DMG Reduction 2',
    weaponBonus:'Outer Force DMG Boost', outerCoeff:'Outer Force Coeff.', statusCoeff:'Stat ATK Coeff.',
    outerAdd:'Outer Force Bonus', enemyDebuff:'Enemy Debuff',
    worldLv:'Open World Level (Lv)', martialLv:'Martial Level (Lv)',
    elemBoostMain:'Elemental Enhancement (Main)', elemBoostSub:'Elemental Enhancement (Sub)',
    enemyLevel:'Enemy Level', physDef:'Physical Defense', judgeRes:'Judgment Resistance',
    physRes:'Physical Resistance', elemRes:'Elemental Resistance',
    manualInput:'Manual Input', enemyPresetTitle:'Enemy Data (Preset)',
    resultTitle:'Expected Damage', resultHero:'EXPECTED · Forecast',
    resultHeroSub:'Final expected damage',
    breakdownPhys:'PHYSICAL', breakdownElem:'ELEMENTAL', breakdownExp:'EXPECTED',
    probCrit:'Critical', probSympathy:'Affinity', probGraze:'Glancing', probNormal:'Normal',
    probPhys:'Physical', probElem:'Element',
    donutCenter:'P · Distribution', donutDmgCenter:'勁率',
    thHitType:'Hit Type', thAvgATK:'Avg ATK', thMinATK:'Min ATK', thMaxATK:'Max ATK',
    thPhysPct:'Phys%', thElemPct:'Elem%', thTotal:'Total', thPhys:'Phys', thElem:'Elem',
    rowNormal:'Normal DMG', rowCrit:'Critical DMG', rowSympathy:'Affinity DMG',
    rowSympathySub:'Max ATK', rowGraze:'Glancing DMG', rowGrazeSub:'Min ATK', rowExpected:'Expected DMG',
    detailsTitle:'Damage Detail Table',
    presetTitle:'PRESETS', presetSave:'Save', presetLoad:'Load', presetNamePlaceholder:'Preset {n}',
    skillPresetTitle:'SKILL PRESET', skillPresetPlaceholder:'— Select —', skillPresetNamePh:'Enter name', skillPresetSave:'Save', skillPresetNeedName:'Please enter a name',
    setEffect:'Set Effect',
    setEff_none:'No Set Effect',
    setEff_jadeware_1:'Jadeware', setEff_jadeware_2:'Jadeware (enemy Qi<40%)',
    setEff_hawkwing_1:'Hawkwing (1 stack)', setEff_hawkwing_2:'Hawkwing (2 stack)', setEff_hawkwing_3:'Hawkwing (3 stack)', setEff_hawkwing_4:'Hawkwing (4 stack)', setEff_hawkwing_5:'Hawkwing (5 stack)',
    setEff_rainwhisper_1:'Rainwhisper', setEff_rainwhisper_2:'Rainwhisper (with HP shield)',
    setEff_swallow_1:'Swallow Return (light atk effect)', setEff_swallow_2:'Swallow Return (enemy Qi<40%)', setEff_swallow_3:'Swallow Return (both)',
    setEff_mountain_1:'Mountainsplit', setEff_mountain_2:'Mountainsplit (derived/co-op)',
    setEff_willow_1:'Veil of the Willow (after heavy)', setEff_willow_2:'Veil of the Willow (after light)', setEff_willow_3:'Veil of the Willow (both)',
    setEff_ivory_1:'Ivorybloom (at max HP)',
    setEff_sway_50:'Swaying Heights (HP 50%)', setEff_sway_55:'Swaying Heights (HP 55%)', setEff_sway_60:'Swaying Heights (HP 60%)', setEff_sway_65:'Swaying Heights (HP 65%)', setEff_sway_70:'Swaying Heights (HP 70%)', setEff_sway_75:'Swaying Heights (HP 75%+)',
    xinfa:'Heart Method', xinfa_none:'None', xinfa_yishui_5:'Song of Yishui (5 stack)', xinfa_yishui_5_cc:'Song of Yishui (5 stack, CC)',
    effTitle:'Stat Efficiency Analysis', effSub:'EFFICIENCY / +1 unit',
    effNote:'Expected DMG increase per +x from one equipment piece. Auto-calculated from current inputs.',
    effThStat:'Stat', effThMax:'X Value', effThBase:'Base Expected',
    effThAfter:'+x Expected', effThDelta:'Delta(+x)', effThPer1:'Per +1',
    effThScore:'Score', effThRating:'Rating',
    effRateFire:'Top Priority', effRateStar:'Priority', effRateGood:'Good', effRateLow:'Low',
    effMinPhysATK:'Min Physical ATK', effMaxPhysATK:'Max Physical ATK',
    effMinElemATK:'Min Elemental ATK', effMaxElemATK:'Max Elemental ATK',
    effCritRate:'Critical Rate', effSympathy:'Affinity Rate', effHitRate:'Hit Rate',
    effAgility:'Agility (速)', effPower:'Power (会)', effStrength:'Strength (力)',
    effBossBoost:'DMG Bonus', effPhysPen:'Physical Penetration', effElemPen:'Elemental Penetration',
    toastSaved:'Saved "{name}"', toastLoaded:'Loaded "{name}"', toastDeleted:'Deleted "{name}"', toastExported:'Image exported', toastImportWip:'Under construction — not yet available', scoreUpdateMsg:'Calculation data updated. Re-import to reflect the latest scores.', scoreUpdateBtn:'Re-import', importPrompt:'Click the IMPORT button at the top to load data', importHintLabel:'Import here first', importBtn:'IMPORT', exportBtn:'EXPORT', resetBtn:'RESET', shareBtn:'SHARE', noteBtn:'NOTE',
    importSetupTitle:'Import Setup', importSetupIntro:'To import data from the official tool, a bookmarklet needs to be installed.',
    importOpenOfficial:'Open Official Tool', importOpenSetup:'Open Setup Page', importUsageHint:'After setup: open the official tool and click the bookmarklet.',
    importLastLabel:'Last Import', importReapply:'Re-apply', importNoHistory:'No previous imports',
    importPreviewTitle:'Import Card', importApplyBtn:'Apply Import', importCancelBtn:'Cancel',
    importNextBtn:'Next', importBackBtn:'Back', importStep2Title:'Enhance & Arsenal',
    importEnhanceTitle:'Enhance', importArsenalTitle:'Arsenal',
    importArsenalPath:'Arsenal Type', importArsenalPeaked:'Peak',
    importConfirmMsg:'Current values will be replaced by the imported data. Continue?', importDone:'Import complete',
    affixRankingTab:'Tune/Attune Value', affixRankingTitle:'Tune/Attune Expected Value Ranking',
    optimizationTitle:'Gear Optimization',
    diagTitle:'Diagnostics',
    diagHitOver:'Precision overflow (cur {0}% / cap {1}% / +{2}% over)',
    diagHitUnder:'Precision low (cur {0}% / cap {1}% / {2}% remaining)',
    diagCritOver:'Crit Rate overflow (applied {0}% / cap 80% / +{1}% over)',
    diagSymOver:'Affinity overflow (applied {0}% / cap 40% / +{1}% over)',
    diagCritUnder:'Crit Rate low (applied {0}% / final Crit+Affinity {1}%)',
    diagGood:'Core stats look fine',
    diagPenBoth:'Neither Phys nor Elem path specialized → recommend focus (PhysPen+1={0} / ElemPen+1={1} / recommend Phys≥{2} or Elem≥{3})',
    diagAffix6Mismatch:'Weapon Attune (all 4 slots {0}) but {1} yields higher value (PhysPen+1={2} / ElemPen+1={3})',
    diagAffix6Mixed:'Weapon Attune mixed ({0}) → unify on {1} across 4 slots (PhysPen+1={2} / ElemPen+1={3})',
    diagWasted:'Wasted affixes ({0}): {1}{2}',
    diagWastedMore:' +{0} more',
    gearCompareTitle:'COMPARISON', cmpTitleJa:'COMPARE', cmpTitleEn:'COMPARISON', cmpApply:'Apply', cmpReset:'Revert', cmpCancel:'Cancel', cmpCurrent:'CURRENT', cmpNew:'NEW', cmpDeltaLabel:'MARTIAL Δ',
    xinfaCompareTitle:'INNER WAY COMPARISON', xinfaTitleJa:'INNER WAY',
    pathAtkBellstrike:'Bellstrike Atk', pathAtkStonesplit:'Stonesplit Atk', pathAtkSilkbind:'Silkbind Atk', pathAtkBamboocut:'Bamboocut Atk', pathAtkVoid:'Void Atk',
    pathPenBellstrike:'Bellstrike Pen', pathPenStonesplit:'Stonesplit Pen', pathPenSilkbind:'Silkbind Pen', pathPenBamboocut:'Bamboocut Pen', pathPenVoid:'Void Pen',
    pathDmgBellstrike:'Bellstrike DMG', pathDmgStonesplit:'Stonesplit DMG', pathDmgSilkbind:'Silkbind DMG', pathDmgBamboocut:'Bamboocut DMG', pathDmgVoid:'Void DMG',
    stMaxHp:'Max HP', stPhysDef:'Physical Defense', stCritHeal:'Critical Healing',
    changelogTitle:'Changelog', changelogLangNotice:'※ Changelog: Japanese only / 日本語のみ / 일본어 한정', close:'Close',
    noteTitleJa:'筆記', noteSeal:'NT', noteTabSpec:'Specs', noteTabChangelog:'Changelog', noteBugReport:'Report Bug', noteFeatureRequest:'Feature Req',
    optSlotAll:'All Gear', optSlotWeapon:'Main/Sub Weapon', optSlotAccessory:'Ring/Pendant', optSlotArmor:'Armor',
    optApplyAll:'Apply All', optApplyOne:'Apply', optRecalc:'Recalc', optTargetRatio:'Target',
    railOpt:'OPT', railRank:'RANK', railDiag:'DIAG',
    slotMain:'Main Weapon', slotSub:'Sub Weapon', slotHelm:'Helm', slotChest:'Chest', slotLegs:'Greaves', slotHands:'Gauntlets', slotRing:'Ring', slotPendant:'Pendant', slotBow:'Bow', slotDisc:'Archer Disc',
    importStep1Title:'Step 1: Bookmarklet Initial Setup (open only if not yet registered)',
    importTabPC:'PC', importTabMobile:'Mobile',
    importPcStep1:'Show bookmark bar (Chrome/Edge: <code>Ctrl+Shift+B</code>)',
    importPcStep2:'<b>Drag</b> the button below to your bookmark bar:',
    importPcStep3:'Click "Open Official Tool" → log in → click the registered bookmark',
    importBmLabel:'WWMetrics Import',
    importMobStep1:'Copy the code below:',
    importMobStep2:'Bookmark the official tool',
    importMobStep3:'Edit the bookmark → replace URL with the copied code → name "WWM Import"',
    importMobStep4:'With the official tool open, type "WWM" in the address bar → tap the suggestion',
    importCopy:'Copy', importCopied:'Copied ✓',
    importReapplyNote:'Re-import the previous data as-is.<br>To pull the latest gear, run the bookmarklet again from the official tool.',
    importLabelUID:'UID', importLabelCharName:'Character', importLabelMainKf:'Main Martial', importLabelSubKf:'Sub Martial', importLabelXinfa:'Inner Way', importLabelXiuwei:'Martial Progress',
    importBaseStats:'Base Stats', importSubStats:'Sub Stats', pvpExclusiveAffix:'PvP-Exclusive Engraving',
    noteSpec: `
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">Tool Overview</h3>
      <p class="wwm-note-p">A comparison and optimization tool for Where Winds Meet equipment. Centered on the <b>Martial Index</b>, integrates equipment / tuning &amp; engravings / martial arts / xinfa / set effects to compute expected damage and propose improvement directions.</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">Data Required (Prerequisite)</h3>
      <p class="wwm-note-p">This tool runs on data imported from the <b>Where Winds Meet - Official Data Tool</b>. Equipment info and scores are not displayed until import. Imported data is saved in your browser's localStorage and persists across restarts.</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">What is Martial Index</h3>
      <p class="wwm-note-p">An indicator that computes expected damage using <b>fixed coefficients common to all players</b>, including equipment / tuning &amp; engravings / martial arts talents / xinfa / set effects. It removes individual differences in Open World Level and enemy parameters, allowing absolute equipment strength comparison.</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">Tier Criteria</h3>
      <p class="wwm-note-p">Judged by ratio of the current Martial Index against <b>the maximum score achievable when all optimization suggestions are applied</b>. Locked at import time, updated on re-import.</p>
      <ul class="wwm-note-list">
        <li><b>SS:</b> 95% or more of max</li>
        <li><b>S:</b> 90% or more</li>
        <li><b>A:</b> 80% or more</li>
        <li><b>B:</b> 65% or more</li>
        <li><b>C:</b> below</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">Reflected in Calculation</h3>
      <ul class="wwm-note-list">
        <li>Equipment base stats (Outer ATK / Elemental ATK etc.)</li>
        <li>Tuning / Engraving options (Tuning 1-5, Engraving 1-5)</li>
        <li>Martial Arts Talents effects (crit cap +Δ, Martial Element-specific ATK/penetration/elem boost, etc.)</li>
        <li>Xinfa Tier effects (Tier 2/5 visible reflection + Tier 0/1/3/4/6 hidden additive)</li>
        <li>2 Pieces set bonus (additive when 2 pieces equipped)</li>
        <li>4 Pieces set bonus (+100 fixed when 4 pieces equipped, distributed evenly)</li>
        <li>Base stats (Body/Power/Defense/Agility/Awareness) → derived (Base Stats / Judgment Rates)</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">Not Reflected in Calculation</h3>
      <ul class="wwm-note-list">
        <li>4 Pieces conditional effects (HP/Inner Energy/Parry/Heavy triggers etc.) — replaced with flat +100</li>
        <li>Enhance (confirmed not to affect game stats, so excluded from calculation)</li>
        <li>PvP-Exclusive Engraving (Engraving slot 6) — display only, no contribution</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">Fixed Calculation Presets</h3>
      <ul class="wwm-note-list">
        <li><b>Outer ATK Coefficient:</b> ×1.5</li>
        <li><b>Status ATK Coefficient:</b> ×1.5</li>
        <li><b>Additional Outer:</b> +230</li>
        <li><b>Elem Enhancement (Main):</b> ×1.5</li>
        <li><b>Elem Enhancement (Sub):</b> ×1.0</li>
        <li><b>Open World Level:</b> capped at the current update version (global standard)</li>
        <li><b>Martial Level:</b> same as Character Lv</li>
        <li><b>Enemy parameters:</b> charLv ≥ 96 → Enemy Lv96 (DEF 405 / Judgment Res 1.65), below → Enemy Lv91 (DEF 350 / 1.45)</li>
        <li><b>Character base stats:</b> assumed maxed out, including Character Talents / Solo Mode Level bonus / Melodies of Peace stat gains</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">Data Version Management</h3>
      <p class="wwm-note-p">When the tool's calculation logic is updated due to game balance changes, the existing Martial Index (baseline) is invalidated and a <b>re-import prompt banner</b> appears at the top. After re-import, the Martial Index is recalculated with the new logic.</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">Main Features</h3>
      <ul class="wwm-note-list">
        <li><b>Equipment Compare:</b> Simulates tuning/engraving differences between current and new equipment with instant score preview</li>
        <li><b>Xinfa Compare:</b> Simulates xinfa swaps, comparing Tier effects and activation conditions</li>
        <li><b>Optimization Proposal:</b> Computes ideal tuning/engraving allocation and suggests step-by-step improvements</li>
        <li><b>Preset Save:</b> Save and recall in-progress equipment configurations</li>
        <li><b>OBS Share:</b> Generates a streaming URL showing only the sidebar (transparent background, color customizable)</li>
        <li><b>4 languages (ja/en/zh/ko) + Light/Dark theme switching</b></li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">Formula (Summary)</h3>
      <pre class="wwm-note-pre">expected = normalAvg × pNormal
         + critAvg × pCrit
         + sympathyDmg × pSympathy
         + grazeDmg × pGraze

each dmg = (phys + elem) × all-martial-boost × outer-boost × reduction
statusScore = expected recomputed with fixed coefficients
finalScore  = statusScore + 4-set bonus (when 4 Pieces active)</pre>
    </div>`,
    importStep2XinfaTitle:'Inner Way Tier', importStep2XinfaHint:'Tier reached for each Inner Way (1-5). Tier2 adds Tier2 effect, Tier5 adds Tier5 effect.',
    penPhys:'Phys Pen', penVoid:'Void Pen', penPhysShort:'Phys', penVoidShort:'Void', penOther:'other',
    pathPhys:'Universal', pathBellstrike:'Bellstrike', pathStonesplit:'Stonesplit', pathSilkbind:'Silkbind', pathBamboocut:'Bamboocut',
    martialIndex:'Martial Index', martialIndexSub:'MARTIAL INDEX', sbEmptyTitle:'No imported data yet.', sbEmptyHint:'Use the IMPORT button at the top.', martialHistoryTab:'Martial Record', historyEmpty:'No history yet. Will auto-record on import.', qualityTab:'Roll Quality', qualityEmpty:'Quality will display after import', minElemSub:'Sub Elem ATK Min', maxElemSub:'Sub Elem ATK Max',
    effectUnset:'Unset', globalDmgBoost:'Total DMG Boost', effAnalysisTitle:'Stat Efficiency Analysis',
    locale:'en-US',
  },
  zh: {
    pageTitle:'燕云计 | WWMETRICS', headerTitle:'燕云计', brandVert:'燕云计',
    headerSub:'WWM-REAL-TIME-METRICS',
    sec1:'基础属性', sec2:'判定概率', sec3:'伤害增加效果',
    sec4:'技能属性', sec5:'其他属性', sec6:'怪物数据',
    minPhysATK:'最小物理ATK', maxPhysATK:'最大物理ATK',
    minElemMain:'最小属性ATK（主）', maxElemMain:'最大属性ATK（主）',
    minElemSub:'最小属性ATK（副）', maxElemSub:'最大属性ATK（副）',
    jgInputVal:'输入值', jgApplied:'适用值',
    hitRate:'命中率', critRate:'会心率', sympathyRate:'会意率',
    addCritRate:'附加会心率', addSympathyRate:'附加会意率',
    critBoost:'会心伤害加成', allMartialBoost:'全武学技能效果增加',
    sympathyBoost:'会意伤害加成', specMartialBoost:'指定武学技能效果增加',
    outerPen:'外功穿透', bossBoost:'首领伤害增加',
    elemPen:'属性穿透', elemAtkBoost:'属性攻击强化',
    dmgReduce1:'伤害减免１', dmgReduce2:'伤害减免２',
    weaponBonus:'外功伤害强化', outerCoeff:'外功系数', statusCoeff:'属性攻击系数',
    outerAdd:'外功附加', enemyDebuff:'减益（敌）',
    worldLv:'大世界等级（Lv）', martialLv:'武学等级（Lv）',
    elemBoostMain:'属性强化（主）', elemBoostSub:'属性强化（副）',
    enemyLevel:'怪物等级', physDef:'物理防御', judgeRes:'审判耐性',
    physRes:'物理耐性', elemRes:'属性耐性',
    manualInput:'手动输入', enemyPresetTitle:'怪物数据（预设）',
    resultTitle:'期望伤害', resultHero:'EXPECTED · 期望值',
    resultHeroSub:'最终伤害期望值',
    breakdownPhys:'PHYSICAL', breakdownElem:'ELEMENTAL', breakdownExp:'EXPECTED',
    probCrit:'会心', probSympathy:'会意', probGraze:'擦击', probNormal:'普通',
    probPhys:'物理', probElem:'属性',
    donutCenter:'P · 概率分布', donutDmgCenter:'勁率',
    thHitType:'命中类型', thAvgATK:'平均ATK', thMinATK:'最小ATK', thMaxATK:'最大ATK',
    thPhysPct:'物理%', thElemPct:'属性%', thTotal:'合计', thPhys:'物理', thElem:'属性',
    rowNormal:'普通伤害', rowCrit:'会心伤害', rowSympathy:'会意伤害',
    rowSympathySub:'最大ATK', rowGraze:'擦击伤害', rowGrazeSub:'最小ATK', rowExpected:'期望伤害',
    detailsTitle:'伤害详情表',
    presetTitle:'预设', presetSave:'保存', presetLoad:'读取', presetNamePlaceholder:'预设 {n}',
    skillPresetTitle:'技能预设', skillPresetPlaceholder:'— 选择 —', skillPresetNamePh:'输入名称', skillPresetSave:'保存', skillPresetNeedName:'请输入名称',
    setEffect:'套装效果',
    setEff_none:'无套装效果',
    setEff_jadeware_1:'碧玉一式', setEff_jadeware_2:'碧玉一式（敌真气<40%）',
    setEff_hawkwing_1:'飞鸟一式（1层）', setEff_hawkwing_2:'飞鸟一式（2层）', setEff_hawkwing_3:'飞鸟一式（3层）', setEff_hawkwing_4:'飞鸟一式（4层）', setEff_hawkwing_5:'飞鸟一式（5层）',
    setEff_rainwhisper_1:'时雨一式', setEff_rainwhisper_2:'时雨一式（气血护盾时）',
    setEff_swallow_1:'归燕一式（轻击触发效果）', setEff_swallow_2:'归燕一式（敌真气<40%）', setEff_swallow_3:'归燕一式（同时满足）',
    setEff_mountain_1:'斩岳一式', setEff_mountain_2:'斩岳一式（派生/协战）',
    setEff_willow_1:'雾柳一式（重击命中后）', setEff_willow_2:'雾柳一式（轻击命中后）', setEff_willow_3:'雾柳一式（雾柳重重）',
    setEff_ivory_1:'净花一式（气血满时）',
    setEff_sway_50:'山崩一式（敌气血50%）', setEff_sway_55:'山崩一式（敌气血55%）', setEff_sway_60:'山崩一式（敌气血60%）', setEff_sway_65:'山崩一式（敌气血65%）', setEff_sway_70:'山崩一式（敌气血70%）', setEff_sway_75:'山崩一式（敌气血75%+）',
    xinfa:'心法', xinfa_none:'无心法', xinfa_yishui_5:'易水之歌（5层）', xinfa_yishui_5_cc:'易水之歌（5层·控制）',
    effTitle:'属性效率分析', effSub:'EFFICIENCY / +1 unit',
    effNote:'每件装备+x数值带来的期望伤害增量。基于当前输入值自动计算。',
    effThStat:'属性', effThMax:'X值', effThBase:'基准期望值',
    effThAfter:'+x后期望值', effThDelta:'增加量(+x)', effThPer1:'每+1',
    effThScore:'评分', effThRating:'评价',
    effRateFire:'最优先', effRateStar:'优先', effRateGood:'良好', effRateLow:'低效',
    effMinPhysATK:'最小物理ATK', effMaxPhysATK:'最大物理ATK',
    effMinElemATK:'最小属性ATK', effMaxElemATK:'最大属性ATK',
    effCritRate:'会心率', effSympathy:'会意率', effHitRate:'命中率',
    effAgility:'速 (Agility)', effPower:'会 (Power)', effStrength:'力 (Strength)',
    effBossBoost:'伤害增加', effPhysPen:'物理穿透', effElemPen:'属性穿透',
    toastSaved:'预设「{name}」已保存', toastLoaded:'预设「{name}」已读取', toastDeleted:'预设「{name}」已删除', toastExported:'图片已导出', toastImportWip:'施工中，暂不可用', scoreUpdateMsg:'计算数据已更新，请重新导入以反映最新分数。', scoreUpdateBtn:'重新导入', importPrompt:'请点击上方「导入」按钮加载数据', importHintLabel:'从这里导入', importBtn:'导入', exportBtn:'导出', resetBtn:'重置', shareBtn:'分享', noteBtn:'笔记',
    importSetupTitle:'导入设置', importSetupIntro:'要从官方数据工具导入数据，需要先安装书签小工具。',
    importOpenOfficial:'打开官方数据工具', importOpenSetup:'打开设置页面', importUsageHint:'设置完成后：打开官方工具并点击书签小工具。',
    importLastLabel:'上次导入', importReapply:'重新应用', importNoHistory:'无导入历史',
    importPreviewTitle:'导入卡', importApplyBtn:'执行导入', importCancelBtn:'取消',
    importNextBtn:'下一步', importBackBtn:'返回', importStep2Title:'观音 & 武库 输入',
    importEnhanceTitle:'观音', importArsenalTitle:'武库',
    importArsenalPath:'武库种类', importArsenalPeaked:'顶点',
    importConfirmMsg:'当前设置的数值将被导入数据替换，确认继续吗？', importDone:'导入完成',
    affixRankingTab:'调律/定音期待值', affixRankingTitle:'调律/定音期待值排行',
    optimizationTitle:'装备最优化提议',
    diagTitle:'弱点指摘 / Diagnostics',
    diagHitOver:'命中率过载 (当前 {0}% / cap {1}% / 超出 +{2}%)',
    diagHitUnder:'命中率不足 (当前 {0}% / cap {1}% / 还差 {2}%)',
    diagCritOver:'会心率过载 (适用 {0}% / cap 80% / 超出 +{1}%)',
    diagSymOver:'会意率过载 (适用 {0}% / cap 40% / 超出 +{1}%)',
    diagCritUnder:'会心率不足 (适用 {0}% / 最终会心+会意 {1}%)',
    diagGood:'主要属性良好',
    diagPenBoth:'外攻/属性 均未特化 → 建议专注其一 (外攻穿透+1={0} / 属性穿透+1={1} / 推荐 外攻≥{2} 或 属性≥{3})',
    diagAffix6Mismatch:'武器定音 4槽全 {0} 但 {1} 期待值更高 (外攻穿透+1={2} / 属性穿透+1={3})',
    diagAffix6Mixed:'武器定音 混合 ({0}) → 建议统一为 {1} (外攻穿透+1={2} / 属性穿透+1={3})',
    diagWasted:'无效选项 ({0}项): {1}{2}',
    diagWastedMore:' 其余{0}项',
    gearCompareTitle:'武具对照 / COMPARISON', cmpTitleJa:'武具对照', cmpTitleEn:'COMPARISON', cmpApply:'采用', cmpReset:'还原', cmpCancel:'退出', cmpCurrent:'现有', cmpNew:'新置', cmpDeltaLabel:'武格变动',
    xinfaCompareTitle:'心法对比 / COMPARISON', xinfaTitleJa:'心法对照',
    pathAtkBellstrike:'钢鸣攻击', pathAtkStonesplit:'碎岩攻击', pathAtkSilkbind:'丝操攻击', pathAtkBamboocut:'瞬岚攻击', pathAtkVoid:'无相攻击',
    pathPenBellstrike:'钢鸣穿透', pathPenStonesplit:'碎岩穿透', pathPenSilkbind:'丝操穿透', pathPenBamboocut:'瞬岚穿透', pathPenVoid:'无相穿透',
    pathDmgBellstrike:'钢鸣伤害强化', pathDmgStonesplit:'碎岩伤害强化', pathDmgSilkbind:'丝操伤害强化', pathDmgBamboocut:'瞬岚伤害强化', pathDmgVoid:'无相伤害强化',
    stMaxHp:'最大HP', stPhysDef:'外功防御', stCritHeal:'会心治疗',
    changelogTitle:'更新记录', changelogLangNotice:'※ Changelog: Japanese only / 日本語のみ / 일본어 한정', close:'关闭',
    noteTitleJa:'笔记', noteSeal:'记', noteTabSpec:'规格', noteTabChangelog:'更新历史', noteBugReport:'错误报告', noteFeatureRequest:'功能请求',
    optSlotAll:'全装备', optSlotWeapon:'主/副武器', optSlotAccessory:'环/佩', optSlotArmor:'防具',
    optApplyAll:'全部应用', optApplyOne:'应用', optRecalc:'重算', optTargetRatio:'目标',
    railOpt:'最优', railRank:'期待值', railDiag:'弱点',
    slotMain:'主武器', slotSub:'副武器', slotHelm:'冠胄', slotChest:'胸甲', slotLegs:'膝甲', slotHands:'腕甲', slotRing:'环', slotPendant:'佩', slotBow:'弓箭', slotDisc:'射玦',
    importStep1Title:'Step 1: 书签栏初始设置 (仅在未注册时打开)',
    importTabPC:'电脑', importTabMobile:'手机',
    importPcStep1:'显示书签栏 (Chrome/Edge: <code>Ctrl+Shift+B</code>)',
    importPcStep2:'将下方按钮<b>拖拽</b>到书签栏:',
    importPcStep3:'点击"打开官方工具" → 登录后 → 点击已注册的书签',
    importBmLabel:'燕云计导入',
    importMobStep1:'复制下方代码:',
    importMobStep2:'为官方工具添加书签',
    importMobStep3:'编辑书签 → URL 替换为复制的代码 → 命名"WWM 导入"',
    importMobStep4:'打开官方工具后,在地址栏输入"WWM" → 点击建议项',
    importCopy:'复制', importCopied:'已复制 ✓',
    importReapplyNote:'按原样重新导入上次数据。<br>如需获取最新装备,请从官方工具再次执行书签。',
    importLabelUID:'UID', importLabelCharName:'角色名', importLabelMainKf:'主武术', importLabelSubKf:'副武术', importLabelXinfa:'心法', importLabelXiuwei:'武术进度',
    importBaseStats:'基础属性', importSubStats:'副属性', pvpExclusiveAffix:'PvP专用定音',
    noteSpec: `
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">工具概览</h3>
      <p class="wwm-note-p">《燕雲十六聲》装备强度比较与优化工具。以 <b>武格指数</b> 为核心，将装备/调律·定音/武学/心法/装备一式效果综合计算伤害期望值，提出装备改进方向。</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">数据获取 (前提)</h3>
      <p class="wwm-note-p">本工具基于 <b>《燕雲十六聲》官方數據小工具</b> 导入的数据运行。在导入之前不显示装备信息和分数。导入数据保存在浏览器 localStorage 中，重启后保留。</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">武格指数 (Martial Index) 是什么</h3>
      <p class="wwm-note-p">包含装备/调律·定音/武学/心法/装备一式效果，使用 <b>所有玩家通用的固定系数</b> 计算伤害期望值的指标。排除了大世界等级和敌方参数的个体差异，因此可比较装备的绝对强度。</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">Tier 判定基准</h3>
      <p class="wwm-note-p">以 <b>装备最优化方案全部应用后的最大分数</b> 为 100%，按当前武格指数的比率判定。导入时确定基准，重新导入时更新。</p>
      <ul class="wwm-note-list">
        <li><b>SS:</b> 最大值的 95% 以上</li>
        <li><b>S:</b> 90% 以上</li>
        <li><b>A:</b> 80% 以上</li>
        <li><b>B:</b> 65% 以上</li>
        <li><b>C:</b> 以下</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">计算中反映的效果</h3>
      <ul class="wwm-note-list">
        <li>装备基础属性 (外功攻击力/属性攻击力 等)</li>
        <li>调律/定音 (调律 1~5、定音 1~5)</li>
        <li>武学天赋效果 (会心率上限 +Δ、 武学属性别 攻击/穿透/属性伤强化 等)</li>
        <li>心法 Tier 效果 (Tier 2/5 显示反映 + Tier 0/1/3/4/6 隐藏加算)</li>
        <li>二件套效果 (2件装备发动的加算系)</li>
        <li>四件套效果 (4件装备 +100 固定加成、 各装备均分)</li>
        <li>基础值 (体/力/防/速/会) → 派生 (基础属性·判定概率)</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">计算中未反映的效果</h3>
      <ul class="wwm-note-list">
        <li>四件套效果中的条件效果 (气血/真气/受流/重击 触发等) — 统一以 +100 固定代替</li>
        <li>观音 (证实不影响游戏内属性，角色面板不反映故不纳入计算)</li>
        <li>PvP 专用定音 (定音 6 槽) — 仅显示，不参与计算</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">计算前提值 (固定)</h3>
      <ul class="wwm-note-list">
        <li><b>外功攻击系数:</b> ×1.5</li>
        <li><b>属性攻击系数:</b> ×1.5</li>
        <li><b>附加外功:</b> +230</li>
        <li><b>属性强化 (主):</b> ×1.5</li>
        <li><b>属性强化 (副):</b> ×1.0</li>
        <li><b>大世界等级:</b> 按当前版本更新上限 (全局基准)</li>
        <li><b>武学等级:</b> 与角色 Lv 相同</li>
        <li><b>敌方参数:</b> charLv ≥ 96 → 敌Lv96 (DEF 405 / 判定抗性 1.65)、 以下 → 敌Lv91 (DEF 350 / 1.45)</li>
        <li><b>角色基础属性:</b> 角色天赋/单人模式等级奖励/五音启太平 等所有属性加成值 视为 <b>已满</b> 进行计算</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">数据版本管理</h3>
      <p class="wwm-note-p">当游戏侧平衡调整等导致本工具计算公式更新时，现有武格指数 (baseline) 被废弃，顶部显示 <b>重新导入提示横幅</b>。重新导入后以新公式重新计算武格指数。</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">主要功能</h3>
      <ul class="wwm-note-list">
        <li><b>武具对照:</b> 当前装备与新装备的调律/定音差异模拟。分数变动即时预览</li>
        <li><b>心法对照:</b> 心法替换模拟。比较 Tier 别效果和发动条件</li>
        <li><b>装备最适化提案:</b> 反向算出调律/定音的理想配置，按改进步骤逐项呈现</li>
        <li><b>预设保存:</b> 保存和呼出试行中的装备配置</li>
        <li><b>OBS Share:</b> 生成仅显示侧栏的直播用 URL (透明背景·色调自定义对应)</li>
        <li><b>4 语言对应 (日/英/中/韩) + 浅色/深色 切换</b></li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">计算公式 (摘要)</h3>
      <pre class="wwm-note-pre">expected = normalAvg × pNormal
         + critAvg × pCrit
         + sympathyDmg × pSympathy
         + grazeDmg × pGraze

各 dmg = (物理 + 属性) × 全武学伤害 × 外功增伤 × 减伤
statusScore = expected 用固定系数重新计算后的值
finalScore  = statusScore + 4-set bonus (四件套效果发动时)</pre>
    </div>`,
    importStep2XinfaTitle:'心法 Tier', importStep2XinfaHint:'各心法达到的 Tier (1-5)。Tier2 加 Tier2 效果,Tier5 加 Tier5 效果。',
    penPhys:'外功穿透', penVoid:'无相穿透', penPhysShort:'外功', penVoidShort:'无相', penOther:'其他',
    pathPhys:'通用', pathBellstrike:'钢鸣', pathStonesplit:'碎岩', pathSilkbind:'丝操', pathBamboocut:'瞬岚',
    martialIndex:'武格指数', martialIndexSub:'MARTIAL INDEX', sbEmptyTitle:'尚未导入数据。', sbEmptyHint:'请点击上方「导入」按钮加载。', martialHistoryTab:'武格历史', historyEmpty:'暂无记录。导入时将自动记录。', qualityTab:'装备品质', qualityEmpty:'导入后从装备数据显示品质', minElemSub:'最小属性攻击(副)', maxElemSub:'最大属性攻击(副)',
    effectUnset:'未填', globalDmgBoost:'全伤害强化', effAnalysisTitle:'状态效率分析',
    locale:'zh-CN',
  },
  ko: {
    pageTitle:'연운계 | WWMETRICS', headerTitle:'연운계', brandVert:'연운계',
    headerSub:'WWM-REAL-TIME-METRICS',
    sec1:'기본 스탯', sec2:'판정 확률', sec3:'피해 증가 효과',
    sec4:'스킬 스탯', sec5:'기타 스탯', sec6:'적 데이터',
    minPhysATK:'최소 물리 ATK', maxPhysATK:'최대 물리 ATK',
    minElemMain:'최소 속성 ATK（주）', maxElemMain:'최대 속성 ATK（주）',
    minElemSub:'최소 속성 ATK（부）', maxElemSub:'최대 속성 ATK（부）',
    jgInputVal:'입력값', jgApplied:'적용값',
    hitRate:'명중률', critRate:'치명타 확률', sympathyRate:'친화율',
    addCritRate:'부가 회심률', addSympathyRate:'부가 친화율',
    critBoost:'회심 피해 보너스', allMartialBoost:'모든 무술의 효과 증가',
    sympathyBoost:'친화 피해 보너스', specMartialBoost:'특정 무술 효과 증가',
    outerPen:'외공 관통', bossBoost:'BOSS 유닛에 대한 피해 증가',
    elemPen:'속성 관통', elemAtkBoost:'속성 공격 강화',
    dmgReduce1:'피해 경감 1', dmgReduce2:'피해 경감 2',
    weaponBonus:'외공 피해 강화', outerCoeff:'외공 계수', statusCoeff:'스탯 공격 계수',
    outerAdd:'외공 부가', enemyDebuff:'디버프（적）',
    worldLv:'대세계 등급（Lv）', martialLv:'무학 등급（Lv）',
    elemBoostMain:'속성 강화（주）', elemBoostSub:'속성 강화（부）',
    enemyLevel:'적 레벨', physDef:'물리 방어력', judgeRes:'심판 내성',
    physRes:'물리 내성', elemRes:'속성 내성',
    manualInput:'수동 입력', enemyPresetTitle:'적 데이터（프리셋）',
    resultTitle:'기대 피해', resultHero:'EXPECTED · 기대치',
    resultHeroSub:'최종 피해 기대치',
    breakdownPhys:'PHYSICAL', breakdownElem:'ELEMENTAL', breakdownExp:'EXPECTED',
    probCrit:'회심', probSympathy:'친화', probGraze:'스침', probNormal:'일반',
    probPhys:'물리', probElem:'속성',
    donutCenter:'P · 확률 분포', donutDmgCenter:'勁率',
    thHitType:'히트 유형', thAvgATK:'평균 ATK', thMinATK:'최소 ATK', thMaxATK:'최대 ATK',
    thPhysPct:'물리%', thElemPct:'속성%', thTotal:'합계', thPhys:'물리', thElem:'속성',
    rowNormal:'일반 피해', rowCrit:'회심 피해', rowSympathy:'친화 피해',
    rowSympathySub:'최대 ATK', rowGraze:'스침 피해', rowGrazeSub:'최소 ATK', rowExpected:'기대 피해',
    detailsTitle:'피해 상세표',
    presetTitle:'프리셋', presetSave:'저장', presetLoad:'불러오기', presetNamePlaceholder:'프리셋 {n}',
    skillPresetTitle:'스킬 프리셋', skillPresetPlaceholder:'— 선택 —', skillPresetNamePh:'이름 입력', skillPresetSave:'저장', skillPresetNeedName:'이름을 입력하세요',
    setEffect:'세트 효과',
    setEff_none:'세트 효과 없음',
    setEff_jadeware_1:'벽옥일식', setEff_jadeware_2:'벽옥일식 (적 진기<40%)',
    setEff_hawkwing_1:'비조일식 (1스택)', setEff_hawkwing_2:'비조일식 (2스택)', setEff_hawkwing_3:'비조일식 (3스택)', setEff_hawkwing_4:'비조일식 (4스택)', setEff_hawkwing_5:'비조일식 (5스택)',
    setEff_rainwhisper_1:'시우일식', setEff_rainwhisper_2:'시우일식 (기혈 보호막 시)',
    setEff_swallow_1:'귀연일식 (경격 발동 효과)', setEff_swallow_2:'귀연일식 (적 진기<40%)', setEff_swallow_3:'귀연일식 (둘 다 만족)',
    setEff_mountain_1:'참악일식', setEff_mountain_2:'참악일식 (파생/협전)',
    setEff_willow_1:'무류일식 (중격 명중 후)', setEff_willow_2:'무류일식 (경격 명중 후)', setEff_willow_3:'무류일식 (양쪽 발동)',
    setEff_ivory_1:'정화일식 (기혈 Max 시)',
    setEff_sway_50:'산붕일식 (적 기혈 50%)', setEff_sway_55:'산붕일식 (적 기혈 55%)', setEff_sway_60:'산붕일식 (적 기혈 60%)', setEff_sway_65:'산붕일식 (적 기혈 65%)', setEff_sway_70:'산붕일식 (적 기혈 70%)', setEff_sway_75:'산붕일식 (적 기혈 75%+)',
    xinfa:'심법', xinfa_none:'심법 없음', xinfa_yishui_5:'역수의 노래 (5스택)', xinfa_yishui_5_cc:'역수의 노래 (5스택·방해 상태)',
    effTitle:'스탯 효율 분석', effSub:'EFFICIENCY / +1 unit',
    effNote:'장비 1개의 +x 수치당 기대 피해 증가량. 현재 입력값 기준 자동 계산.',
    effThStat:'스탯', effThMax:'X값', effThBase:'기준 기대치',
    effThAfter:'+x 후 기대치', effThDelta:'증가량(+x)', effThPer1:'+1당',
    effThScore:'점수', effThRating:'평가',
    effRateFire:'최우선', effRateStar:'우선', effRateGood:'양호', effRateLow:'저효율',
    effMinPhysATK:'최소 물리 ATK', effMaxPhysATK:'최대 물리 ATK',
    effMinElemATK:'최소 속성 ATK', effMaxElemATK:'최대 속성 ATK',
    effCritRate:'치명타 확률', effSympathy:'친화율', effHitRate:'명중률',
    effAgility:'속 (Agility)', effPower:'회 (Power)', effStrength:'력 (Strength)',
    effBossBoost:'피해 증가', effPhysPen:'물리 관통', effElemPen:'속성 관통',
    toastSaved:'프리셋 「{name}」 저장됨', toastLoaded:'프리셋 「{name}」 불러옴', toastDeleted:'프리셋 「{name}」 삭제됨', toastExported:'이미지 내보내기 완료', toastImportWip:'공사 중 — 아직 사용할 수 없습니다', scoreUpdateMsg:'계산 데이터가 업데이트되었습니다. 최신 점수를 반영하려면 다시 가져오세요.', scoreUpdateBtn:'다시 가져오기', importPrompt:'상단 「IMPORT」 버튼에서 데이터를 가져와 주세요', importHintLabel:'여기서 가져오기', importBtn:'가져오기', exportBtn:'내보내기', resetBtn:'초기화', shareBtn:'공유', noteBtn:'노트',
    importSetupTitle:'가져오기 설정', importSetupIntro:'공식 데이터 도구의 데이터를 가져오려면 북마클릿 등록이 필요합니다.',
    importOpenOfficial:'공식 데이터 도구 열기', importOpenSetup:'설정 페이지 열기', importUsageHint:'설정 완료 후: 공식 도구를 열고 북마클릿을 클릭하세요.',
    importLastLabel:'직전 가져오기', importReapply:'재적용', importNoHistory:'이전 가져오기 없음',
    importPreviewTitle:'가져오기 카드', importApplyBtn:'가져오기 실행', importCancelBtn:'취소',
    importNextBtn:'다음', importBackBtn:'뒤로', importStep2Title:'첩음 & 무기고 입력',
    importEnhanceTitle:'첩음', importArsenalTitle:'무기고',
    importArsenalPath:'무기고 종류', importArsenalPeaked:'정점',
    importConfirmMsg:'현재 설정된 수치가 가져오기 데이터로 대체됩니다. 계속하시겠습니까?', importDone:'가져오기 완료',
    affixRankingTab:'조율/정음 기대값', affixRankingTitle:'조율/정음 기대값 랭킹',
    optimizationTitle:'장비 최적화 제안',
    diagTitle:'약점 진단 / Diagnostics',
    diagHitOver:'명중률 과다 (현재 {0}% / cap {1}% / 초과 +{2}%)',
    diagHitUnder:'명중률 부족 (현재 {0}% / cap {1}% / 잔 {2}%)',
    diagCritOver:'회심률 과다 (적용 {0}% / cap 80% / 초과 +{1}%)',
    diagSymOver:'회의률 과다 (적용 {0}% / cap 40% / 초과 +{1}%)',
    diagCritUnder:'회심률 부족 (적용 {0}% / 최종 회심+회의 {1}%)',
    diagGood:'주요 스탯은 양호',
    diagPenBoth:'외공/속성 모두 특화 없음 → 한쪽 특화 권장 (외공관통+1={0} / 속성관통+1={1} / 권장 외공≥{2} 또는 속성≥{3})',
    diagAffix6Mismatch:'무기 정음 4슬롯 전부 {0}이지만 {1}이(가) 더 효율적 (외공관통+1={2} / 속성관통+1={3})',
    diagAffix6Mixed:'무기 정음 혼재 ({0}) → {1}(으)로 4슬롯 통일 권장 (외공관통+1={2} / 속성관통+1={3})',
    diagWasted:'무효 옵션 ({0}개): {1}{2}',
    diagWastedMore:' 외 {0}개',
    gearCompareTitle:'무구대조 / COMPARISON', cmpTitleJa:'무구대조', cmpTitleEn:'COMPARISON', cmpApply:'적용', cmpReset:'복원', cmpCancel:'취소', cmpCurrent:'현재', cmpNew:'신규', cmpDeltaLabel:'무격 변동',
    xinfaCompareTitle:'심법 비교 / COMPARISON', xinfaTitleJa:'심법 대조',
    pathAtkBellstrike:'강명 공격', pathAtkStonesplit:'쇄암 공격', pathAtkSilkbind:'사조 공격', pathAtkBamboocut:'순람 공격', pathAtkVoid:'무상 공격',
    pathPenBellstrike:'강명 관통', pathPenStonesplit:'쇄암 관통', pathPenSilkbind:'사조 관통', pathPenBamboocut:'순람 관통', pathPenVoid:'무상 관통',
    pathDmgBellstrike:'강명 피해 강화', pathDmgStonesplit:'쇄암 피해 강화', pathDmgSilkbind:'사조 피해 강화', pathDmgBamboocut:'순람 피해 강화', pathDmgVoid:'무상 피해 강화',
    stMaxHp:'최대 HP', stPhysDef:'외공 방어', stCritHeal:'치명 치유',
    changelogTitle:'변경 이력', changelogLangNotice:'※ Changelog: Japanese only / 日本語のみ / 일본어 한정', close:'닫기',
    noteTitleJa:'필기', noteSeal:'기', noteTabSpec:'사양', noteTabChangelog:'업데이트 내역', noteBugReport:'버그 신고', noteFeatureRequest:'기능 요청',
    optSlotAll:'전체 장비', optSlotWeapon:'주/부 무기', optSlotAccessory:'환/패물', optSlotArmor:'방어구',
    optApplyAll:'전체 적용', optApplyOne:'적용', optRecalc:'재계산', optTargetRatio:'목표',
    railOpt:'최적', railRank:'기대값', railDiag:'약점',
    slotMain:'주무기', slotSub:'부무기', slotHelm:'투구', slotChest:'흉갑', slotLegs:'경갑', slotHands:'완갑', slotRing:'환', slotPendant:'패물', slotBow:'화살', slotDisc:'활깍지',
    importStep1Title:'Step 1: 북마크릿 초기 설정 (미등록 시에만 열기)',
    importTabPC:'PC', importTabMobile:'모바일',
    importPcStep1:'북마크 바 표시 (Chrome/Edge: <code>Ctrl+Shift+B</code>)',
    importPcStep2:'아래 버튼을 북마크 바로 <b>드래그</b>:',
    importPcStep3:'"공식 데이터 도구 열기" 클릭 → 로그인 후 → 등록한 북마크 클릭',
    importBmLabel:'연운계가져오기',
    importMobStep1:'아래 코드 복사:',
    importMobStep2:'공식 도구를 북마크 등록',
    importMobStep3:'북마크 편집 → URL을 복사한 코드로 교체 → 이름 "WWM 가져오기"',
    importMobStep4:'공식 도구를 연 상태에서 주소창에 "WWM" 입력 → 추천 항목 탭',
    importCopy:'복사', importCopied:'복사 완료 ✓',
    importReapplyNote:'이전 데이터를 그대로 재가져옵니다.<br>최신 장비를 가져오려면 공식 데이터 도구에서 북마크릿을 다시 실행하세요.',
    importLabelUID:'UID', importLabelCharName:'캐릭터명', importLabelMainKf:'주 무술', importLabelSubKf:'부 무술', importLabelXinfa:'심법', importLabelXiuwei:'무술 진도',
    importBaseStats:'기본 스탯', importSubStats:'부 스탯', pvpExclusiveAffix:'PvP 전용 정음',
    noteSpec: `
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">도구 개요</h3>
      <p class="wwm-note-p">연운 (Where Winds Meet) 장비 강도 비교·최적화 도구. <b>무격 지수</b> 를 중심으로 장비/조율·정음/무술/심법/장비 세트 효과를 통합하여 데미지 기댓값을 산출하고 장비 개선 방향을 제시합니다.</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">데이터 취득 (전제)</h3>
      <p class="wwm-note-p">본 도구는 <b>&lt;연운&gt; 공식-데이터 툴</b> 에서 가져온 데이터를 기반으로 동작합니다. 가져오기 전까지는 장비 정보·점수가 표시되지 않습니다. 가져온 데이터는 브라우저 localStorage 에 저장되어 재시작 후에도 유지됩니다.</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">무격 지수 (Martial Index) 란</h3>
      <p class="wwm-note-p">장비/조율·정음/무술/심법/장비 세트 효과를 모두 포함하여, <b>모든 플레이어 공통의 고정 계수</b> 로 데미지 기댓값을 산출한 지표. 대세계 등급과 적측 파라미터의 개인차를 배제하여 장비의 절대 강도를 비교할 수 있습니다.</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">Tier 판정 기준</h3>
      <p class="wwm-note-p"><b>장비 최적화 제안을 모두 적용했을 때의 최대 점수</b> 를 100%로 하여, 현재 무격 지수의 비율로 판정합니다. 가져오기 시 기준 확정, 다시 가져오기 시 갱신됩니다.</p>
      <ul class="wwm-note-list">
        <li><b>SS:</b> 최대의 95% 이상</li>
        <li><b>S:</b> 90% 이상</li>
        <li><b>A:</b> 80% 이상</li>
        <li><b>B:</b> 65% 이상</li>
        <li><b>C:</b> 미만</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">계산에 반영되는 효과</h3>
      <ul class="wwm-note-list">
        <li>장비 기본 스탯 (외공 공격력/속성 공격력 등)</li>
        <li>조율/정음 (조율 1~5, 정음 1~5)</li>
        <li>무술 천부 효과 (회심률 상한 +Δ, 무술 속성별 공격/관통/속성 데미지 강화 등)</li>
        <li>심법 Tier 효과 (Tier 2/5 표시 반영 + Tier 0/1/3/4/6 숨겨진 가산)</li>
        <li>2세트 효과 (2개 장비로 발동하는 가산계)</li>
        <li>4세트 효과 (4개 장비로 +100 고정 보너스, 각 장비에 균등 배분)</li>
        <li>기본 스탯 (체/력/방/속/회) → 파생 (기본 스탯·판정 확률)</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">계산에 반영되지 않는 효과</h3>
      <ul class="wwm-note-list">
        <li>4세트 효과의 조건부 효과 (기혈/진기/받아넘기/중타 트리거 등) — 일률 +100 고정으로 대체</li>
        <li>첩음 (게임 내 스탯에 영향 없음으로 판명, 스탯 화면에 반영되지 않으므로 계산 대상 외)</li>
        <li>PvP 전용 정음 (정음 6 슬롯) — 표시만, 계산 기여 없음</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">계산 전제값 (고정)</h3>
      <ul class="wwm-note-list">
        <li><b>외공 공격 계수:</b> ×1.5</li>
        <li><b>스탯 공격 계수:</b> ×1.5</li>
        <li><b>부가 외공:</b> +230</li>
        <li><b>속성 강화 (주):</b> ×1.5</li>
        <li><b>속성 강화 (부):</b> ×1.0</li>
        <li><b>대세계 등급:</b> 현재 업데이트 상태에 따른 상한값 (글로벌 기준)</li>
        <li><b>무술 등급:</b> 캐릭터 Lv 와 동일</li>
        <li><b>적 파라미터:</b> charLv ≥ 96 → 적Lv96 (DEF 405 / 판정 저항 1.65), 미만 → 적Lv91 (DEF 350 / 1.45)</li>
        <li><b>캐릭터 기본 스탯:</b> 캐릭터 천부/싱글 모드 레벨 보너스/오음지태평 을 포함한 모든 스탯 가산값을 <b>최대치까지 도달한 것</b> 으로 산출</li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">데이터 버전 관리</h3>
      <p class="wwm-note-p">게임 측 밸런스 조정 등으로 본 도구의 계산식이 갱신되면, 기존 무격 지수 (baseline) 가 무효화되어 상단에 <b>다시 가져오기 안내 배너</b> 가 표시됩니다. 다시 가져오기 후 새 계산식으로 무격 지수가 재산출됩니다.</p>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">주요 기능</h3>
      <ul class="wwm-note-list">
        <li><b>무구 대조:</b> 현재 장비와 신규 장비의 조율/정음 차분 시뮬레이션. 점수 변동을 즉시 프리뷰</li>
        <li><b>심법 대조:</b> 심법 교체 시뮬레이션. Tier 별 효과와 발동 조건을 비교</li>
        <li><b>장비 최적화 제안:</b> 조율/정음의 이상적 배분을 역산해, 현재로부터의 개선 스텝을 순차 제시</li>
        <li><b>프리셋 저장:</b> 시행 중인 장비 구성을 저장·호출 가능</li>
        <li><b>OBS Share:</b> 사이드바만 표시하는 방송용 URL 을 생성 (투명 배경·색조 커스텀 대응)</li>
        <li><b>4언어 대응 (일/영/중/한) + 라이트/다크 전환</b></li>
      </ul>
    </div>
    <div class="wwm-note-section">
      <h3 class="wwm-note-h3">계산식 (요약)</h3>
      <pre class="wwm-note-pre">expected = normalAvg × pNormal
         + critAvg × pCrit
         + sympathyDmg × pSympathy
         + grazeDmg × pGraze

각 dmg = (물리 + 속성) × 전 무술 데미지 × 외공 증댐 × 경감
statusScore = expected 를 고정 계수로 재계산한 값
finalScore  = statusScore + 4-set bonus (4세트 효과 발동 시)</pre>
    </div>`,
    importStep2XinfaTitle:'심법 Tier', importStep2XinfaHint:'각 심법의 도달 Tier (1-5). Tier2는 Tier2 효과, Tier5는 Tier5 효과 추가.',
    penPhys:'외공 관통', penVoid:'무상 관통', penPhysShort:'외공', penVoidShort:'무상', penOther:'기타',
    pathPhys:'범용', pathBellstrike:'명금', pathStonesplit:'열석', pathSilkbind:'견사', pathBamboocut:'파죽',
    martialIndex:'무격 지수', martialIndexSub:'무격 지수', sbEmptyTitle:'아직 가져온 데이터가 없습니다.', sbEmptyHint:'상단의 「가져오기」 버튼을 사용해 주세요.', martialHistoryTab:'무격 이력', historyEmpty:'아직 기록이 없습니다. 가져오기 시 자동 기록됩니다.', qualityTab:'롤 품질', qualityEmpty:'가져오기 후 장비 데이터로 품질 표시', minElemSub:'최소 속성 공격(부)', maxElemSub:'최대 속성 공격(부)',
    effectUnset:'미입력', globalDmgBoost:'전체 피해 증가', effAnalysisTitle:'스탯 효율 분석',
    locale:'ko-KR',
  },
};

let currentLang = 'ja';
let T = TRANSLATIONS.ja;
window.T = T;
window.currentLang = currentLang;

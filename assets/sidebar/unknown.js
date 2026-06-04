// ── WWM-METRICS / Sidebar / Unknown Report (Phase 3.9a 切出) ──
// 未対応 ID (kongfu / xinfa / affix) を modal で表示し、 GitHub Issue 起票テンプレを生成。
// 依存:
//   - WWMState.roleInfo
//   - window.WWMSidebar.anlz.detectUnknown
// 公開:
//   - window.WWMSidebar.unknown = { openReport }
//   - 後方互換: window.WWMSidebar.openUnknownReport (sidebar.js が代入)
(function () {
  'use strict';

  const _detectUnknown = window.WWMSidebar.anlz.detectUnknown;

  function openReport() {
    const ri = WWMState.roleInfo;
    if (!ri) return;
    const u = _detectUnknown(ri);
    const total = u.kongfu.length + u.xinfa.length + u.affix.length;
    if (!total) { alert('未対応データなし'); return; }
    // 報告用 snippet 生成
    const lines = ['## 未対応 ID 報告', ''];
    if (u.kongfu.length) {
      lines.push('### 武術 (kongfu) ' + u.kongfu.length + '件');
      for (const id of u.kongfu) {
        const slot = ri.kongfuMain === id ? '主' : (ri.kongfuSub === id ? '副' : '');
        lines.push(`- ID: ${id} (${slot})`);
      }
      lines.push('');
    }
    if (u.xinfa.length) {
      lines.push('### 心法 (xinfa) ' + u.xinfa.length + '件');
      for (const id of u.xinfa) lines.push(`- ID: ${id}`);
      lines.push('');
    }
    if (u.affix.length) {
      lines.push('### 装備 affix ' + u.affix.length + '件');
      const valSample = {};
      for (const eq of Object.values(ri.wearEquipsDetailed || {})) {
        for (const aff of (eq?.exVo?.baseAffixes || [])) {
          const d = aff?.equipmentDetails;
          if (d && u.affix.includes(d[0]) && !valSample[d[0]]) valSample[d[0]] = d;
        }
      }
      for (const id of u.affix) {
        const v = valSample[id];
        lines.push(`- ID: ${id}` + (v ? ` (val=${v[1]}, rank=${v[3]})` : ''));
      }
      lines.push('');
    }
    lines.push('### キャラ情報');
    lines.push(`- Lv: ${ri.level}, school: ${ri.school}, kongfuMain: ${ri.kongfuMain}, kongfuSub: ${ri.kongfuSub}`);
    lines.push('');
    lines.push('### 補足情報 (画像/詳細などあれば追記)');
    lines.push('');
    const body = lines.join('\n');
    const githubUrl = 'https://github.com/Sh1get0ra/WWM-METRICS/issues/new?title=' +
      encodeURIComponent('[Data] 未対応ID報告 (kongfu/xinfa/affix)') +
      '&body=' + encodeURIComponent(body);

    // Modal表示
    const m = document.createElement('div');
    m.className = 'wwm-modal-backdrop';
    m.innerHTML = `
      <div class="wwm-modal">
        <div class="wwm-modal-header">
          <h2>未対応データ報告 (${total}件)</h2>
          <button class="wwm-modal-close" aria-label="Close">×</button>
        </div>
        <div class="wwm-modal-body">
          <p>以下の内容をクリップボードコピー or GitHub Issue で報告してください。</p>
          <textarea class="wwm-bm-code" readonly style="min-height:200px;">${body.replace(/</g, '&lt;')}</textarea>
          <div class="wwm-btn-row" style="margin-top:12px;">
            <button class="wwm-btn-primary" id="wwmCopyReport">クリップボードにコピー</button>
            <a class="wwm-btn-secondary" href="${githubUrl}" target="_blank" rel="noopener">GitHub Issue を開く</a>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    m.querySelector('.wwm-modal-close').addEventListener('click', () => m.remove());
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    m.querySelector('#wwmCopyReport').addEventListener('click', (e) => {
      const ta = m.querySelector('textarea');
      ta.select(); ta.setSelectionRange(0, 99999);
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      if (navigator.clipboard) navigator.clipboard.writeText(body).then(() => { e.target.textContent = 'コピー完了 ✓'; }).catch(() => {});
      else if (ok) { e.target.textContent = 'コピー完了 ✓'; }
    });
  }

  window.WWMSidebar = window.WWMSidebar || {};
  window.WWMSidebar.unknown = { openReport };
})();

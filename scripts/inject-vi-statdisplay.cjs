// stat_display.json 64件の vi 抜けに vi 翻訳注入。
// 方針 = ステ画面準拠 (漢越語ベース)、 既採取 vi 部品 (path.vi / stat.vi / kongfu.vi / skilltype.vi) 再利用 + 残機械翻訳。
const fs = require('fs');
const PATH = 'data/stat_display.json';
const sd = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const stat = JSON.parse(fs.readFileSync('data/i18n/stat.json','utf8'));
const lex = JSON.parse(fs.readFileSync('data/i18n/game_lexicon.json','utf8'));
const ui = JSON.parse(fs.readFileSync('data/i18n/ui.json','utf8'));

// ja→vi 逆引き dict (i18n 既採取)
const jaToVi = {};
for (const src of [stat, lex, ui]) {
  for (const v of Object.values(src)) {
    if (v && typeof v === 'object' && v.ja && v.vi) jaToVi[v.ja] = v.vi;
  }
}

// 残 39 件 手翻訳 (兄貴方針: ステ画面準拠、 path/stat/skilltype 既採取語彙再利用)
const MANUAL_VI = {
  "防": "Phòng",
  "外功攻撃力": "Tấn công Ngoại công",
  "属性攻撃": "Tấn công thuộc tính",
  "鋼鳴攻撃力": "Tấn công Minh Kim",
  "砕岩攻撃力": "Tấn công Liệt Thạch",
  "糸操攻撃力": "Tấn công Khiên Ti",
  "瞬嵐攻撃力": "Tấn công Phá Trúc",
  "無相攻撃力": "Tấn công Vô Tướng",
  "判定確率": "Xác suất phán định",
  "実効会心率(ボーナス込み)": "Tỷ lệ Hội tâm thực hiệu (bao gồm thưởng)",
  "軽傷転換率": "Tỷ lệ chuyển đổi Trầy xước",
  "最終会心会意率": "Tỷ lệ Hội tâm Hội ý cuối cùng",
  "最終発動会心率": "Tỷ lệ Hội tâm phát động cuối cùng",
  "最終発動会意率": "Tỷ lệ Hội ý phát động cuối cùng",
  "最終発動軽傷率": "Tỷ lệ Trầy xước phát động cuối cùng",
  "最終発動並傷率": "Tỷ lệ thường phát động cuối cùng",
  "ダメージ増加効果": "Hiệu quả gia tăng sát thương",
  "外功貫通": "Xuyên thấu Ngoại công",
  "属性増強": "Tăng cường thuộc tính",
  "鋼鳴貫通": "Xuyên thấu Minh Kim",
  "砕岩貫通": "Xuyên thấu Liệt Thạch",
  "糸操貫通": "Xuyên thấu Khiên Ti",
  "瞬嵐貫通": "Xuyên thấu Phá Trúc",
  "無相貫通": "Xuyên thấu Vô Tướng",
  "鋼鳴ダメージ上昇": "Gia tăng Sát thương Minh Kim",
  "砕岩ダメージ上昇": "Gia tăng Sát thương Liệt Thạch",
  "糸操ダメージ上昇": "Gia tăng Sát thương Khiên Ti",
  "瞬嵐ダメージ上昇": "Gia tăng Sát thương Phá Trúc",
  "無相ダメージ上昇": "Gia tăng Sát thương Vô Tướng",
  "全武術効果増加": "Tăng hiệu quả toàn bộ võ học",
  "手甲武術ダメ": "Tăng sát thương võ học Giáp Tay",
  "首領に与えるダメージ増加": "Tăng sát thương đối với đơn vị thủ lĩnh",
  "プレイヤーに与える効果強化": "Tăng hiệu quả đối với đơn vị Người chơi",
  "単体系奇術ダメージ増加": "Tăng sát thương Kỳ thuật đơn thể",
  "単体制御系奇術ダメ": "Tăng sát thương Kỳ thuật đơn thể (Khống chế)",
  "単体爆発系奇術ダメ": "Tăng sát thương Kỳ thuật đơn thể (Bùng nổ)",
  "範囲系奇術ダメージ増加": "Tăng sát thương Kỳ thuật phạm vi",
  "範囲状態異常系奇術ダメ": "Tăng sát thương Kỳ thuật phạm vi (Trạng thái bất thường)",
  "範囲攻撃系奇術ダメ": "Tăng sát thương Kỳ thuật phạm vi (Sát thương)"
};

let auto = 0, manual = 0, miss = 0;
const missList = [];
function walk(obj) {
  if (!obj || typeof obj !== 'object') return;
  const has = ['ja','en','zh','ko'].every(L => typeof obj[L] === 'string');
  if (has) {
    if (typeof obj.vi !== 'string') {
      if (jaToVi[obj.ja]) { obj.vi = jaToVi[obj.ja]; auto++; }
      else if (MANUAL_VI[obj.ja]) { obj.vi = MANUAL_VI[obj.ja]; manual++; }
      else { miss++; missList.push(obj.ja); }
    }
    return;
  }
  for (const k of Object.keys(obj)) walk(obj[k]);
}
walk(sd);

if (miss > 0) {
  console.error('UNHANDLED:', missList);
  process.exit(1);
}

fs.writeFileSync(PATH, JSON.stringify(sd, null, 2) + '\n');
console.log(`stat_display.json vi 注入完了: auto=${auto}, manual=${manual}, miss=${miss}`);

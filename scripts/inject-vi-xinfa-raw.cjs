// xinfa.json 全 raw field (336件) を vi 機械翻訳して rawI18n.vi 注入。
// 方針 = 共通用語 regex 置換辞書 + 既採取 vi 部品 (path/skilltype/stat) 再利用。
// 「後で校正」 前提 (兄貴指示 2026-06-10)、 ja 原文は raw に保持 (fallback)。
// 既存 rawI18n.vi は上書きしない (人手校正済保護)。

const fs = require('fs');
const PATH = 'data/xinfa.json';
const x = JSON.parse(fs.readFileSync(PATH, 'utf8'));

// 長語優先 (短語が部分一致して壊さないよう)。 keys 文字数降順で処理。
const DICT = {
  // 心法/武術 用語
  '心法': 'tâm pháp',
  '武術': 'võ học',
  '武学': 'võ học',
  '流派': 'lưu phái',
  '武器': 'vũ khí',
  // ステ系
  '外功攻撃': 'tấn công ngoại công',
  '外功貫通': 'xuyên thấu ngoại công',
  '外功ダメージ': 'sát thương ngoại công',
  '外功': 'ngoại công',
  '内功': 'nội công',
  '属性攻撃': 'tấn công thuộc tính',
  '属性貫通': 'xuyên thấu thuộc tính',
  '属性ダメージ': 'sát thương thuộc tính',
  '属性': 'thuộc tính',
  '貫通': 'xuyên thấu',
  '攻撃力': 'sức tấn công',
  '攻撃': 'tấn công',
  '防御力': 'sức phòng ngự',
  '防御': 'phòng ngự',
  '速度': 'tốc độ',
  '会心率': 'tỷ lệ chí mạng',
  '会心': 'chí mạng',
  '会意率': 'tỷ lệ hiểu ý',
  '会意': 'hiểu ý',
  '軽傷': 'trầy xước',
  '並傷': 'thường',
  '気血最大値': 'sinh lực tối đa',
  '気血': 'sinh lực',
  '気力': 'thể lực',
  '生命': 'sinh mệnh',
  // path
  '鋼鳴': 'Minh Kim',
  '砕岩': 'Liệt Thạch',
  '糸操': 'Khiên Ti',
  '瞬嵐': 'Phá Trúc',
  '無相': 'Vô Tướng',
  '副属性': 'thuộc tính phụ',
  // skilltype
  '武術技': 'kỹ năng võ học',
  '溜め技': 'kỹ năng tích lực',
  '特殊技': 'kỹ năng đặc biệt',
  '重撃': 'đả nặng',
  '軽撃': 'đả nhẹ',
  '流血': 'chảy máu',
  // 武器種
  '剣': 'Kiếm',
  '槍': 'Súng',
  '扇': 'Quạt',
  '傘': 'Dù',
  '刀': 'Đao',
  '双刃': 'Song đao',
  '縄鏢': 'Dây phi tiêu',
  '手甲': 'Giáp Tay',
  // 動詞/状態
  'ダメージ強化': 'gia tăng sát thương',
  'ダメージ増加': 'gia tăng sát thương',
  'ダメージ上昇': 'gia tăng sát thương',
  'ダメージ': 'sát thương',
  '与ダメ': 'sát thương gây ra',
  '被ダメ': 'sát thương nhận vào',
  '回復値': 'lượng hồi phục',
  '回復量': 'lượng hồi phục',
  '回復': 'hồi phục',
  '治癒': 'trị liệu',
  '治療': 'trị liệu',
  '無敵化': 'trạng thái bất tử',
  '無敵': 'bất tử',
  '護盾': 'hộ thuẫn',
  'シールド': 'lá chắn',
  '撃破時': 'khi tiêu diệt',
  '撃破で': 'khi tiêu diệt',
  '撃破': 'tiêu diệt',
  '撃殺': 'tiêu diệt',
  '命中時': 'khi trúng đích',
  '命中後': 'sau khi trúng đích',
  '命中': 'trúng đích',
  '発動間隔': 'khoảng cách kích hoạt',
  '発動時': 'khi kích hoạt',
  '発動': 'kích hoạt',
  '持続時間': 'thời gian duy trì',
  '持続': 'duy trì',
  '上昇': 'tăng',
  '上限': 'giới hạn',
  '下限': 'giới hạn dưới',
  '増加': 'tăng',
  '減少': 'giảm',
  '軽減': 'giảm',
  '低減': 'giảm',
  '強化': 'tăng cường',
  '弱体': 'suy yếu',
  '短縮': 'rút ngắn',
  '延長': 'kéo dài',
  '連続': 'liên tục',
  '効果': 'hiệu quả',
  '与える': 'gây',
  '受ける': 'nhận',
  '攻撃時': 'khi tấn công',
  '攻撃中': 'trong tấn công',
  '戦闘開始': 'bắt đầu chiến đấu',
  '戦闘': 'chiến đấu',
  '雪見': 'Tuyết Kiến',
  '飛燕再翔': 'Phi Yến tái tường',
  '飛燕': 'Phi Yến',
  '再翔': 'tái tường',
  '突進': 'lao tới',
  '移動': 'di chuyển',
  '移動速度': 'tốc độ di chuyển',
  '飛行': 'bay',
  '落下': 'rơi',
  '着地': 'tiếp đất',
  '空中': 'trên không',
  '地上': 'trên đất',
  '距離': 'khoảng cách',
  '範囲': 'phạm vi',
  '周囲': 'xung quanh',
  '対象': 'mục tiêu',
  '敵': 'địch',
  '自身': 'bản thân',
  '味方': 'đồng đội',
  '対人': 'PvP',
  '非対人': 'phi PvP',
  '対BOSS': 'đối với BOSS',
  '対首領': 'đối với thủ lĩnh',
  '首領': 'thủ lĩnh',
  '消費': 'tiêu hao',
  '獲得': 'nhận',
  '付与': 'gắn',
  '解除': 'gỡ bỏ',
  '追加': 'bổ sung',
  '削除': 'xóa',
  '累計': 'tích lũy',
  '毎秒': 'mỗi giây',
  '秒': 'giây',
  '分': 'phút',
  '回': 'lần',
  '段': 'tầng',
  '層': 'tầng',
  '差分': 'chênh lệch',
  '固定': 'cố định',
  '永続': 'vĩnh viễn',
  '一時': 'tạm thời',
  '判定': 'phán định',
  '転換': 'chuyển đổi',
  '転化': 'chuyển hóa',
  '上書き': 'ghi đè',
  '置換': 'thay thế',
  '結合': 'kết hợp',
  '計算外': 'ngoài phạm vi tính',
  '計算': 'tính toán',
  '攻撃計算外': 'ngoài tính tấn công',
  '攻撃計算': 'tính tấn công',
  '被害減少': 'giảm sát thương nhận',
  '被害': 'sát thương nhận',
  '被撃後': 'sau khi nhận đả kích',
  '被撃': 'nhận đả kích',
  '被ダメージ': 'sát thương nhận vào',
  '保護': 'bảo vệ',
  'リセット': 'đặt lại',
  '解放': 'mở khóa',
  '達成': 'đạt được',
  '失敗': 'thất bại',
  '成功': 'thành công',
  '復活': 'hồi sinh',
  '消滅': 'biến mất',
  '出現': 'xuất hiện',
  '召喚': 'triệu hồi',
  // 副詞/助詞 残し (ja のまま)
  '以内': 'trong vòng',
  '以下': 'trở xuống',
  '以上': 'trở lên',
  '未満': 'dưới',
  '超過': 'vượt quá',
  '時': 'khi',
  '中': 'trong',
  '後': 'sau',
  '前': 'trước',
  // 形容詞
  '最大': 'tối đa',
  '最小': 'tối thiểu',
  '全ダメージ': 'toàn bộ sát thương',
  '全部': 'toàn bộ',
  '全': 'toàn bộ ',
  '高': 'cao',
  '低': 'thấp',
  '速': 'nhanh',
  '遅': 'chậm',
  '長': 'dài',
  '短': 'ngắn',
  // 数式記号は不変 (→ + - % 等)
  // よく出る固有 game 用語
  'cage debuff': 'cage debuff',  // ゲーム内英語そのまま
  'cage': 'cage',
  'marked target': 'mục tiêu đã đánh dấu',
  'marked': 'đã đánh dấu',
  'hit時': 'khi đánh trúng',
  'hit': 'đánh trúng',
  'ベース': 'cơ bản',
  'stack': 'stack',
  'CD': 'CD',
  'Solo Mode': 'Solo Mode',
  'Level scaled': 'theo cấp',
  'rank=blue': 'rank=blue',
  'rank=purple': 'rank=purple',
  'rank=gold': 'rank=gold',
  'Physical DMG Reduction': 'giảm sát thương ngoại công',
  'Physical': 'ngoại công',
  'DMG Reduction': 'giảm sát thương',
  'DMG': 'sát thương',
  'Reduction': 'giảm',
  'Max HP': 'Sinh lực tối đa',
  'HP': 'HP',
  'ATK': 'tấn công',
  'DEF': 'phòng ngự',
  'BOSS': 'BOSS',
  'PvP': 'PvP',
  // 矢印 助詞 残し
  'からの': ' từ ',
  'から': ' từ ',
  'まで': ' đến ',
  'ごと': ' mỗi ',
  'こと': '',
  'もの': '',
  'ため': ' để ',
  'および': ' và ',
  'または': ' hoặc ',
  'および/または': ' và/hoặc ',
  'の場合': ' trường hợp ',
  '場合': 'trường hợp'
};

// 追加 dict (Image #5 兄貴指摘 残 ja: 鼠系/獄炎/敵討令/恩文字の札/英語 stat label 等)
Object.assign(DICT, {
  '鼠ダメージ': 'sát thương Chuột',
  '鼠ダメ': 'sát thương Chuột',
  '鼠の威力': 'uy lực Chuột',
  '鼠': 'Chuột',
  'ねずみ': 'Chuột',
  '敵デバフ': 'debuff địch',
  'デバフ': 'debuff',
  'バフ': 'buff',
  '敵討令': 'Lệnh Trả Thù',
  '敵討': 'trả thù',
  '敵': 'địch',
  '令': 'lệnh',
  '威力': 'uy lực',
  '恩文字の札': 'lá bùa chữ Ân',
  '恩文字': 'chữ Ân',
  '札': 'lá bùa',
  '獄炎': 'Ngục Viêm',
  '同装備時': 'khi cùng trang bị',
  '同装備': 'cùng trang bị',
  '同': 'cùng',
  '装備': 'trang bị',
  '倍': 'nhân',
  '効果半減': 'hiệu quả giảm nửa',
  '半減': 'giảm một nửa',
  'なしで': 'nếu không có',
  'なし': 'không có',
  '枚': 'lá',
  '時限': 'giới hạn thời gian',
  'Min Physical Attack': 'Tấn công Ngoại công tối thiểu',
  'Min Physical': 'Ngoại công tối thiểu',
  'Physical Attack': 'Tấn công Ngoại công',
  'Physical Penetration': 'Xuyên thấu Ngoại công',
  'Min Magic Attack': 'Tấn công Phép tối thiểu',
  'Magic Attack': 'Tấn công Phép',
  'Magic Penetration': 'Xuyên thấu Phép',
  'Magic': 'Phép',
  'Attack': 'Tấn công',
  'Penetration': 'Xuyên thấu',
  'patch swap with': 'patch swap với',
  // 残 ja 単語 (Image #5 力溜め 等)
  '力溜め': 'tích lực',
  '溜める': 'tích lực',
  '溜め': 'tích',
  '完全': 'hoàn toàn',
  '一部': 'một phần',
  '低下': 'giảm',
  '上方': 'tăng',
  '抑制': 'kìm hãm',
  '解禁': 'mở',
  '封印': 'phong ấn',
  '対応': 'đối ứng',
  // 軽い接続 ja 残り
  'にて': ' tại ',
  'にも': ' cũng ',
  'では': ' thì ',
  'での': ' tại ',
  'での効果': ' hiệu quả tại ',
  'まで上昇': ' đến tăng ',
  'まで': ' đến '
});

// FORCE=1 環境変数で既存 rawI18n.vi 上書き許可 (dict 拡張後の再翻訳用)
const FORCE = process.env.FORCE === '1';

// keys 文字数降順 (長語先) で正規表現置換
const orderedKeys = Object.keys(DICT).sort((a, b) => b.length - a.length);

function translate(raw) {
  let s = raw;
  for (const k of orderedKeys) {
    // 単純 substring 置換 (正規表現メタ文字 escape)
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(esc, 'g'), DICT[k]);
  }
  // 全角句読点 → 半角 (vi 表記準拠)
  s = s
    .replace(/、/g, ', ')
    .replace(/。/g, '. ')
    .replace(/（/g, ' (')
    .replace(/）/g, ') ');
  // 連続空白圧縮 + 句読点直後の余分空白整理
  s = s.replace(/\s+/g, ' ').replace(/ ([,.):])/g, '$1').trim();
  return s;
}

let injected = 0, kept = 0, total = 0;
for (const [id, e] of Object.entries(x)) {
  if (!e || typeof e !== 'object' || !e.attributeBuff) continue;
  for (const tk of Object.keys(e.attributeBuff)) {
    const t = e.attributeBuff[tk];
    if (!t || typeof t !== 'object') continue;
    if (typeof t.raw !== 'string' || !t.raw.trim()) continue;
    total++;
    if (!t.rawI18n) t.rawI18n = {};
    if (!FORCE && typeof t.rawI18n.vi === 'string' && t.rawI18n.vi.trim()) { kept++; continue; }
    t.rawI18n.vi = translate(t.raw);
    injected++;
  }
}

fs.writeFileSync(PATH, JSON.stringify(x, null, 2) + '\n');
console.log(`xinfa raw vi 機械翻訳 注入: injected=${injected}, kept=${kept}, total=${total}`);

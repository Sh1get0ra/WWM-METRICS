// Node環境で calc.js をロードして computeExpected/_computeCoreLayer を export
// ブラウザ専用 window/document/DOM API をモック
const fs = require('fs');
const path = require('path');

const win = {};
global.window = win;
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
};
global.updateDonut = () => {};
// calc.js が参照する WWMState (lastResult 書込 / roleInfo 読取 / allowDonut 読取) を stub。
// allowDonut=false で DOM 副作用 (donut描画) 経路を skip。
global.WWMState = { lastResult: null, roleInfo: {}, allowDonut: false };

const code = fs.readFileSync(path.join(__dirname, '..', 'assets', 'calc.js'), 'utf8');
// 名前空間汚染を避けるためindirect eval
(0, eval)(code);

module.exports = {
  computeExpected: win.computeExpected || global.computeExpected,
  _computeCoreLayer: win._computeCoreLayer || global._computeCoreLayer,
};

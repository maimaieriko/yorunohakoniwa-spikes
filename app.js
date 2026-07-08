/* ============================================================
   ヨルノハコニワ Spike 1
   検証対象:
   1) 9×9盤の表示と駒配置
   2) タッチ選択 → 移動可能マス表示 → 移動(Pointer Events一本化)
   3) ビルドID照合によるキャッシュ混在の検出
   注意: これは使い捨ての検証コード。本実装はPhase 1で書き直す。
   ============================================================ */
'use strict';

const BUILD_JS = 's1-003'; // デプロイ時に必ず更新(index.html / style.css と揃える)

/* ---------------- 画面内ログ(iPhoneはdevtoolsが無いため必須) ---------------- */
const logEl = document.getElementById('log');
const logLines = [];
function log(msg, cls) {
  const t = new Date();
  const ts = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0')}`;
  const line = `[${ts}] ${msg}`;
  logLines.push(line);
  if (logLines.length > 300) logLines.shift();
  const div = document.createElement('div');
  if (cls) div.className = cls;
  div.textContent = line;
  logEl.appendChild(div);
  while (logEl.childNodes.length > 300) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
}
window.addEventListener('error', (e) => {
  log(`JSエラー: ${e.message} (${e.filename}:${e.lineno})`, 'warn');
});

/* ---------------- ビルドID照合(キャッシュ対策の検証) ---------------- */
function checkBuilds() {
  const htmlB = window.BUILD_HTML || '不明';
  const probe = document.getElementById('css-build-probe');
  let cssB = '不明';
  try {
    cssB = getComputedStyle(probe, '::after').content.replace(/["']/g, '');
    if (!cssB || cssB === 'none') cssB = '読込失敗';
  } catch (_) { cssB = '読込失敗'; }

  document.getElementById('build-html').textContent = htmlB;
  document.getElementById('build-js').textContent = BUILD_JS;
  document.getElementById('build-css').textContent = cssB;

  const same = (htmlB === BUILD_JS && BUILD_JS === cssB);
  document.getElementById('cache-warning').classList.toggle('hidden', same);
  log(`ビルド照合 HTML=${htmlB} JS=${BUILD_JS} CSS=${cssB} → ${same ? '一致' : '不一致!'}`, same ? 'ok' : 'warn');
}

/* ---------------- 盤面データ ----------------
   board[row][col] : row 0 = 一段目(上・後手側), col 0 = 9筋(左)
   駒 = { type, side }  side: 's'=先手(下) / 'g'=後手(上)          */
const KANJI = { K: '玉', k: '王', R: '飛', B: '角', G: '金', S: '銀', N: '桂', L: '香', P: '歩' };
const FILES = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];
const RANKS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

let board, turn; // turn: 's' | 'g'

function initialBoard() {
  const b = Array.from({ length: 9 }, () => Array(9).fill(null));
  const back = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'];
  for (let c = 0; c < 9; c++) {
    b[0][c] = { type: back[c], side: 'g' };
    b[2][c] = { type: 'P', side: 'g' };
    b[6][c] = { type: 'P', side: 's' };
    b[8][c] = { type: back[c], side: 's' };
  }
  b[1][1] = { type: 'R', side: 'g' }; // 後手飛 8二
  b[1][7] = { type: 'B', side: 'g' }; // 後手角 2二
  b[7][1] = { type: 'B', side: 's' }; // 先手角 8八
  b[7][7] = { type: 'R', side: 's' }; // 先手飛 2八
  return b;
}

/* ---------------- 移動可能マス計算 ----------------
   Spike 1の範囲: 駒種ごとの動き+味方駒ブロック+敵駒は取れる。
   王手放置・成り・打ちは対象外(V1/V2スパイクで扱う)。

   【座標系の定義(レビュー時の誤読防止のため明記)】
   ・row 0 = 一段目(画面の上・後手陣) / row 8 = 九段目(画面の下・先手陣)
   ・STEPS/SLIDESのdyは「先手視点」で定義し、dy = -1 が前進(row減少=画面上方向)
   ・後手は forward = -1 を掛けてdyを反転 → dy=-1×(-1)=+1でrow増加=画面下方向へ前進
   ・つまり: 先手 forward=+1(dyをそのまま使う)/ 後手 forward=-1(dyを反転)
   ・この定義の正しさは起動時セルフテスト(runSelfTests)が実機ログ上で毎回証明する */
const STEPS = {
  P: [[0, -1]],                                    // 歩: 前へ1
  N: [[-1, -2], [1, -2]],                          // 桂: 前へ2+横1
  S: [[-1, -1], [0, -1], [1, -1], [-1, 1], [1, 1]],
  G: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [0, 1]],
  K: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
};
const SLIDES = {
  L: [[0, -1]],                                    // 香: 前へ直進
  B: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  R: [[0, -1], [0, 1], [-1, 0], [1, 0]],
};

function movableSquares(r, c) {
  const pc = board[r][c];
  if (!pc) return [];
  // 先手: dy(-1=前進)をそのまま使う(+1) / 後手: 反転(-1)。上の座標系コメント参照
  const forward = pc.side === 's' ? 1 : -1;
  const out = [];
  const inBoard = (rr, cc) => rr >= 0 && rr < 9 && cc >= 0 && cc < 9;

  for (const [dx, dy] of (STEPS[pc.type] || [])) {
    const rr = r + dy * forward, cc = c + dx;
    if (!inBoard(rr, cc)) continue;
    const t = board[rr][cc];
    if (!t || t.side !== pc.side) out.push([rr, cc]);
  }
  for (const [dx, dy] of (SLIDES[pc.type] || [])) {
    let rr = r + dy * forward, cc = c + dx;
    while (inBoard(rr, cc)) {
      const t = board[rr][cc];
      if (!t) { out.push([rr, cc]); }
      else { if (t.side !== pc.side) out.push([rr, cc]); break; }
      rr += dy * forward; cc += dx;
    }
  }
  return out;
}

/* ---------------- 描画 ---------------- */
const boardEl = document.getElementById('board');
const cells = []; // cells[r][c] = div

function buildBoardDom() {
  const fileEl = document.getElementById('file-labels');
  const rankEl = document.getElementById('rank-labels');
  FILES.forEach(f => { const d = document.createElement('div'); d.textContent = f; fileEl.appendChild(d); });
  RANKS.forEach(rk => { const d = document.createElement('div'); d.textContent = rk; rankEl.appendChild(d); });

  for (let r = 0; r < 9; r++) {
    cells.push([]);
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      boardEl.appendChild(cell);
      cells[r].push(cell);
    }
  }
}

function squareName(r, c) { return `${FILES[c]}${RANKS[r]}`; }

function render() {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const cell = cells[r][c];
    const pc = board[r][c];
    cell.textContent = '';
    cell.classList.remove('selected', 'movable', 'capture');
    if (pc) {
      const span = document.createElement('span');
      span.className = 'pc' + (pc.side === 'g' ? ' gote' : '');
      span.textContent = pc.side === 'g' && pc.type === 'K' ? KANJI.k : KANJI[pc.type];
      cell.appendChild(span);
    }
  }
  if (sel) {
    cells[sel.r][sel.c].classList.add('selected');
    for (const [r, c] of sel.moves) {
      cells[r][c].classList.add('movable');
      if (board[r][c]) cells[r][c].classList.add('capture');
    }
  }
  const ti = document.getElementById('turn-indicator');
  ti.textContent = turn === 's' ? '☗ 先手の番' : '☖ 後手の番';
  ti.classList.toggle('gote', turn === 'g');
}

/* ---------------- タッチ状態機械 ----------------
   前作の「状態が止まる」対策:
   ・入力はPointer Eventsのみ(touch/clickと混在させない=二重発火防止)
   ・状態は sel ひとつだけ。どんな入力でも必ず有効な状態に遷移する
   ・多点タッチはprimaryのみ受理
   ・「選択解除」ボタンでいつでも初期状態へ戻れる                    */
let sel = null; // null | { r, c, moves: [[r,c],...] }

function onCellTap(r, c, pointerType) {
  const pc = board[r][c];

  if (!sel) {
    if (!pc) { flashReject(r, c, '空マス'); return; }
    if (turnCheckOn() && pc.side !== turn) { flashReject(r, c, '手番でない駒'); return; }
    select(r, c);
    return;
  }

  // 選択中 → 同じ駒: 解除
  if (sel.r === r && sel.c === c) { log(`選択解除 ${squareName(r, c)}`); sel = null; render(); return; }

  // 選択中 → 移動可能マス: 着手
  if (sel.moves.some(([rr, cc]) => rr === r && cc === c)) {
    doMove(sel.r, sel.c, r, c);
    return;
  }

  // 選択中 → 自分の別の駒: 選び直し
  if (pc && (!turnCheckOn() || pc.side === turn) && pc.side === board[sel.r][sel.c].side) {
    select(r, c);
    return;
  }

  flashReject(r, c, '移動できないマス');
}

function select(r, c) {
  const moves = movableSquares(r, c);
  sel = { r, c, moves };
  log(`選択 ${squareName(r, c)} ${KANJI[board[r][c].type]}(${board[r][c].side === 's' ? '先手' : '後手'}) 移動先${moves.length}箇所`);
  render();
}

function doMove(fr, fc, tr, tc) {
  const pc = board[fr][fc];
  const captured = board[tr][tc];
  board[tr][tc] = pc;
  board[fr][fc] = null;
  log(`着手 ${squareName(fr, fc)}→${squareName(tr, tc)} ${KANJI[pc.type]}${captured ? ` (${KANJI[captured.type]}を取る)` : ''}`, 'ok');
  if (captured && captured.type === 'K') log('王様を取りました(スパイクなので終局処理なし)', 'warn');
  sel = null;
  if (turnCheckOn()) turn = turn === 's' ? 'g' : 's';
  render();
}

function flashReject(r, c, reason) {
  log(`無効タップ ${squareName(r, c)} (${reason})`);
  const cell = cells[r][c];
  cell.classList.remove('reject');
  void cell.offsetWidth; // アニメーション再発火
  cell.classList.add('reject');
}

function turnCheckOn() { return document.getElementById('turn-check').checked; }

/* ---------------- 起動時セルフテスト ----------------
   進行方向とブロック処理の正しさを、実機のデバッグログ上で毎回証明する。
   (レビューで方向定義の解釈が割れたため、コードでなくテストを真実とする) */
function runSelfTests() {
  const saved = board;
  let fails = 0;
  const eq = (a, b) => {
    const norm = (x) => JSON.stringify(x.map(p => p.join(',')).sort());
    return norm(a) === norm(b);
  };
  const t = (name, got, want) => {
    const pass = (typeof want === 'number') ? got.length === want : eq(got, want);
    if (!pass) fails++;
    log(`テスト ${pass ? 'OK' : 'NG'}: ${name}${pass ? '' : ` got=${JSON.stringify(got)}`}`, pass ? 'ok' : 'warn');
  };
  const empty = () => Array.from({ length: 9 }, () => Array(9).fill(null));

  // 1) 初期局面での方向・ブロック
  board = initialBoard();
  t('先手歩7七→7六(前進=画面上へ)', movableSquares(6, 2), [[5, 2]]);
  t('後手歩3三→3四(前進=画面下へ)', movableSquares(2, 6), [[3, 6]]);
  t('先手香9九→9八のみ(9七の自歩でブロック)', movableSquares(8, 0), [[7, 0]]);
  t('後手香1一→1二のみ(1三の自歩でブロック)', movableSquares(0, 8), [[1, 8]]);
  t('先手桂8九は跳び先が自駒で0箇所', movableSquares(8, 1), []);
  t('先手飛2八は横5+右1の6箇所', movableSquares(7, 7), 6);
  t('先手角8八は0箇所(全方向自駒)', movableSquares(7, 1), []);

  // 2) 空盤の中央5五での方向(桂の前方跳びが先後で逆になること)
  board = empty(); board[4][4] = { type: 'N', side: 's' };
  t('先手桂5五→4三と6三(2段前へ跳ぶ)', movableSquares(4, 4), [[2, 3], [2, 5]]);
  board = empty(); board[4][4] = { type: 'N', side: 'g' };
  t('後手桂5五→4七と6七(2段前=画面下へ跳ぶ)', movableSquares(4, 4), [[6, 3], [6, 5]]);
  board = empty(); board[4][4] = { type: 'R', side: 's' };
  t('飛5五(空盤)は縦横16箇所', movableSquares(4, 4), 16);
  board = empty(); board[4][4] = { type: 'B', side: 'g' };
  t('角5五(空盤)は斜め16箇所', movableSquares(4, 4), 16);
  // 敵駒は取れて味方は不可
  board = empty();
  board[4][4] = { type: 'R', side: 's' };
  board[2][4] = { type: 'P', side: 'g' };  // 前方に敵
  board[4][6] = { type: 'P', side: 's' };  // 右に味方
  t('飛5五: 前は敵歩まで(取れる)・右は味方手前まで', movableSquares(4, 4), [[3, 4], [2, 4], [5, 4], [6, 4], [7, 4], [8, 4], [4, 3], [4, 2], [4, 1], [4, 0], [4, 5]]);

  board = saved;
  window.__selftestFailures = fails;
  log(`セルフテスト完了: ${fails === 0 ? '全12件OK' : `${fails}件NG!`}`, fails === 0 ? 'ok' : 'warn');
  return fails === 0;
}

/* ---------------- 入力(Pointer Eventsに一本化) ---------------- */
function setupInput() {
  boardEl.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary) { log('多点タッチを無視', 'warn'); return; }
    e.preventDefault();
    const cell = e.target.closest('.cell');
    if (!cell) return;
    onCellTap(Number(cell.dataset.r), Number(cell.dataset.c), e.pointerType);
  });

  // iOS Safariの既定動作を封じる(拡大・スクロール・長押し)
  boardEl.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

  document.getElementById('btn-reset-state').addEventListener('click', () => {
    sel = null; render(); log('状態リセット(選択解除)', 'ok');
  });
  document.getElementById('btn-reset-board').addEventListener('click', () => {
    board = initialBoard(); sel = null; turn = 's'; render(); log('初期配置に戻しました', 'ok');
  });
  document.getElementById('btn-size').addEventListener('click', (e) => {
    const b = document.body.classList.toggle('size-b');
    e.target.textContent = b ? '盤サイズ: B' : '盤サイズ: A';
    log(`盤サイズ${b ? 'B (min(10vw,60px)・駒0.62)' : 'A (min(10.2vw,52px)・駒0.58)'}に切替`, 'ok');
  });
  document.getElementById('btn-toggle-log').addEventListener('click', (e) => {
    const collapsed = logEl.classList.toggle('collapsed');
    e.target.textContent = collapsed ? 'ひらく' : 'たたむ';
  });
  document.getElementById('btn-copy-log').addEventListener('click', async () => {
    const text = [`Spike1 ログ (HTML=${window.BUILD_HTML} JS=${BUILD_JS})`, `UA: ${navigator.userAgent}`, ...logLines].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      log('ログをコピーしました', 'ok');
    } catch (_) {
      // iOSの旧挙動フォールバック
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
      log('ログをコピーしました(fallback)', 'ok');
    }
  });
}

/* ---------------- 起動 ---------------- */
function main() {
  checkBuilds();
  log(`UA: ${navigator.userAgent}`);
  log(`画面: ${window.innerWidth}x${window.innerHeight} dpr=${devicePixelRatio}`);
  buildBoardDom();
  board = initialBoard();
  turn = 's';
  sel = null;
  runSelfTests();       // 進行方向・ブロック処理を実機上で毎回検証
  render();
  setupInput();
  log('起動完了。駒をタップしてください', 'ok');
}
main();

/* ============================================================
   HAKONIWA Engine - core_data.js (教科非依存・DOM非依存)
   learning: 段階状態 + おさらいノート(間隔反復)
   inventory: 所持金・アイテム
   save: スキーマv1 / CRC32 / 外装ラップ / マイグレーション枠
   ※DOMに触れないためNodeで単体テスト可能
   ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.HakoniwaData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const BUILD = 'p1-003';

  // ---------- CRC32 ----------
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(str) {
    const b = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(str) : Buffer.from(str, 'utf8');
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
  }

  // ---------- セーブ スキーマ v1 ----------
  // GDD §15の全ブロックを枠として定義(Phase 1で実データが入るのは一部)
  function newSaveV1() {
    return {
      schemaVersion: 1,
      profile: { name: '', kanaMode: true, createdAt: null },
      progress: { stage: 'beginner', area: 0, kakera: 0, flags: {} },
      rpg: { lv: 1, exp: 0, hp: 20, hpMax: 20, gold: 0, items: {}, equipment: {}, titles: [] },
      quests: { active: [], done: [] },
      problems: { count: 0, attempts: [], corrects: [], hints: [], lastDay: [] },
      review: [],            // [{pid, dueAt, misses}]
      exams: [],
      collection: { zukan: [], cards: [], skins: [] },
      stats: { playMs: 0, exploreMs: 0, subjectMs: 0, sessions: 0, answered: 0, correct: 0 },
      world: { visited: [], shortcuts: [], defeated: [] },   // defeated: 浄化済み敵ID(P1-b)
      home: { furniture: [] },
      telemetry: { ratioSamples: [] },
      parent: { pinHash: null, alarmMin: 0 },
      routes: { challenge: {}, review: {} },
    };
  }
  // マイグレーション枠: 将来 v1→v2 はここに追加
  const MIGRATIONS = {};
  function migrate(save) {
    let s = save;
    while (MIGRATIONS[s.schemaVersion]) s = MIGRATIONS[s.schemaVersion](s);
    return s;
  }

  // ---------- 外装ラップ(Spike 3実証形式) ----------
  function wrapSave(save) {
    const body = JSON.stringify(save);
    return JSON.stringify({ app: 'yorunohakoniwa', schemaVersion: save.schemaVersion, savedAt: new Date().toISOString(), crc32: crc32(body), body });
  }
  function unwrapSave(text) {
    const obj = JSON.parse(text);
    if (obj.app !== 'yorunohakoniwa') throw new Error('アプリ識別子が違います');
    if (crc32(obj.body) !== obj.crc32) throw new Error('チェックサム不一致(データ破損の可能性)');
    return migrate(JSON.parse(obj.body));
  }

  // ---------- learning: おさらいノート(間隔反復) ----------
  const REVIEW_LADDER_DAYS = [1, 3, 7];   // 間違い→翌日→3日後→1週間後
  const DAY = 86400000;
  function registerMiss(save, pid, now) {
    now = now === undefined ? Date.now() : now;
    let e = save.review.find((r) => r.pid === pid);
    if (!e) { e = { pid, misses: 0, step: 0, dueAt: 0 }; save.review.push(e); }
    e.misses++;
    e.step = 0;                            // 間違えたら段階リセット
    e.dueAt = now + REVIEW_LADDER_DAYS[0] * DAY;
    return e;
  }
  function registerReviewSuccess(save, pid, now) {
    now = now === undefined ? Date.now() : now;
    const e = save.review.find((r) => r.pid === pid);
    if (!e) return null;
    e.step++;
    if (e.step >= REVIEW_LADDER_DAYS.length) {
      save.review = save.review.filter((r) => r.pid !== pid);  // 卒業
      return { graduated: true };
    }
    e.dueAt = now + REVIEW_LADDER_DAYS[e.step] * DAY;
    return e;
  }
  function dueReviews(save, now) {
    now = now === undefined ? Date.now() : now;
    return save.review.filter((r) => r.dueAt <= now);
  }

  // ---------- inventory ----------
  function addGold(save, n) { save.rpg.gold = Math.max(0, save.rpg.gold + n); return save.rpg.gold; }
  function addItem(save, id, n) { save.rpg.items[id] = (save.rpg.items[id] || 0) + n; return save.rpg.items[id]; }

  // ---------- 成績記録 ----------
  function recordAnswer(save, correct, hintsUsed) {
    save.stats.answered++;
    if (correct) save.stats.correct++;
    // hintsUsedは将来カテゴリ別集計に接続(保護者モードの元データ)
  }

  return {
    BUILD, crc32, newSaveV1, wrapSave, unwrapSave, migrate,
    registerMiss, registerReviewSuccess, dueReviews, REVIEW_LADDER_DAYS,
    addGold, addItem, recordAnswer,
  };
});

/* HAKONIWA Engine - save(ブラウザ層) + subjects/quiz_dummy + core(起動とループ結線) */
(function () {
  'use strict';
  const NS = (window.Hakoniwa = window.Hakoniwa || {});
  const D = window.HakoniwaData;

  /* ---------------- Save(ブラウザ層) ---------------- */
  NS.Save = (function () {
    const KEY = 'yorunohakoniwa-save';
    function load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        return D.unwrapSave(raw);
      } catch (e) { console.warn('セーブ読込失敗', e); return null; }
    }
    function store(save) {
      try { localStorage.setItem(KEY, D.wrapSave(save)); return true; }
      catch (e) { console.warn('セーブ書込失敗', e); return false; }
    }
    function exportText(save) { return D.wrapSave(save); }
    function importText(text) { return D.unwrapSave(text); }
    function bootMode() { return window.navigator.standalone === true ? 'ホーム画面(PWA)' : 'Safari/ブラウザ'; }
    function privateProbe() {
      try { localStorage.setItem('__probe', '1'); localStorage.removeItem('__probe'); return false; }
      catch (_) { return true; }
    }
    return { load, store, exportText, importText, bootMode, privateProbe };
  })();

  /* ---------------- SubjectModule: ダミー教科「かずあてクイズ」 ----------------
     目的: エンジンと教科の分離実証。コアはpayloadを解釈しない。 */
  NS.SubjectQuizDummy = {
    meta: { id: 'quiz-dummy', name: 'かずあてクイズ', schema: 1 },
    loadProblem(data) { return data; },   // payload = {choices:[…], answerIndex}
    createWidget(container, problem, callbacks) {
      const wrap = document.createElement('div');
      wrap.className = 'quiz-choices';
      problem.payload.choices.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'enc-btn choice';
        b.textContent = c;
        b.addEventListener('click', () => callbacks.onAnswer(i));
        wrap.appendChild(b);
      });
      container.appendChild(wrap);
    },
    judge(problem, answerIndex) {
      return { correct: answerIndex === problem.payload.answerIndex };
    },
    answerText(problem) { return String(problem.payload.choices[problem.payload.answerIndex]); },
    selfTest() { return true; },
  };

  /* ---------------- Core: 起動・メインループ ---------------- */
  NS.Core = (function () {
    let world, encounter, subject, problems, save;
    let inEncounter = false;
    const $ = (id) => document.getElementById(id);

    async function fetchJson(fname) {
      // 規約: tests/系と同じ2段フォールバック+絶対URLログ(データはdata/配下)
      const tried = [];
      for (const rel of [fname, `data/${fname}`]) {   // 平坦配置(p1-003): 直下を優先
        const url = new URL(`${rel}?v=${NS.BUILD_JS}`, location.href).href;
        tried.push(url);
        try {
          const r = await fetch(url, { cache: 'no-store' });
          if (r.ok) { NS.log(`取得成功: ${url}`, 'ok'); return await r.json(); }
          NS.log(`HTTP ${r.status}: ${url}`, 'warn');
        } catch (e) { NS.log(`ネットワークエラー: ${url}`, 'warn'); }
      }
      throw new Error(`${fname} を取得できません: ${tried.join(' / ')}`);
    }

    function refreshHud() {
      $('hud-gold').textContent = save.rpg.gold;
      $('hud-review').textContent = D.dueReviews(save).length + '/' + save.review.length;
      $('hud-left').textContent = world ? world.remainingEnemies() : '-';
    }

    async function onEncounter(enemy) {
      if (inEncounter) return;
      inEncounter = true;
      world.pause();
      const pdata = problems.find((p) => p.id === enemy.problemId) || problems[enemy.idx % problems.length];
      const problem = subject.loadProblem(pdata);
      const result = await encounter.run(subject, problem);
      D.recordAnswer(save, result.correct, result.hintsUsed);
      if (result.correct) {
        world.defeat(enemy.id);
        if (!save.world.defeated.includes(enemy.id)) save.world.defeated.push(enemy.id);
        const reward = (pdata.reward && pdata.reward.gold) || 10;
        D.addGold(save, Math.max(1, reward - result.hintsUsed * 3)); // ヒント使用で減額(GDD準拠)
        // 復習中の問題に正解したら段階を進める
        D.registerReviewSuccess(save, pdata.id);
        NS.log(`浄化! +${Math.max(1, reward - result.hintsUsed * 3)}かけら (ヒント${result.hintsUsed})`, 'ok');
      } else {
        world.pushBack();
        D.registerMiss(save, pdata.id);
        NS.log(`おさらいノートに登録: ${pdata.id}(あした もういちど)`, 'warn');
      }
      NS.Save.store(save);           // オートセーブ
      refreshHud();
      world.resume();
      inEncounter = false;
      if (world.remainingEnemies() === 0) {
        $('clear-banner').classList.remove('hidden');
        NS.log('テストマップの ヨドミを すべて浄化した!', 'ok');
      }
    }

    let last = 0;
    function loop(t) {
      const dt = Math.min(t - last, 100); last = t;
      const input = NS.Input.poll();
      world.update(dt, input, onEncounter);
      world.render(t);
      save.stats.playMs += dt;
      requestAnimationFrame(loop);
    }

    async function boot(subjectModule, problemFile) {
      subject = subjectModule;
      NS.log(`教科モジュール: ${subject.meta.name} (${subject.meta.id})`, 'ok');
      NS.log(`起動モード: ${NS.Save.bootMode()}${NS.Save.privateProbe() ? ' / ⚠️プライベートブラウズ(保存されません)' : ''}`);
      save = NS.Save.load();
      if (save) NS.log('セーブを復元しました', 'ok');
      else { save = D.newSaveV1(); save.profile.createdAt = new Date().toISOString(); NS.log('新しい冒険をはじめます'); }

      const mapData = await fetchJson('map_test.json');
      const pset = await fetchJson(problemFile || 'problems_dummy.json');
      problems = pset.problems;

      const canvas = $('field');
      world = NS.World(canvas, mapData, save.world.defeated);
      encounter = NS.Encounter($('enc-overlay'));
      NS.Input.attachField(canvas);
      refreshHud();

      // メニュー(書き出し/読み込み)
      $('btn-menu').addEventListener('click', () => $('menu-panel').classList.toggle('hidden'));
      $('btn-export').addEventListener('click', async () => {
        const text = NS.Save.exportText(save);
        try { await navigator.clipboard.writeText(text); NS.log(`書き出し(コピー)成功 ${(text.length/1024).toFixed(1)}KB`, 'ok'); }
        catch (e) { NS.log(`書き出し失敗: ${e.name}`, 'warn'); }
      });
      $('btn-import').addEventListener('click', () => {
        try {
          save = NS.Save.importText($('import-text').value.trim());
          NS.Save.store(save); refreshHud();
          NS.log('読み込み成功(チェックサム一致)', 'ok');
        } catch (e) { NS.log(`読み込み失敗: ${e.message}`, 'warn'); }
      });
      $('btn-reset').addEventListener('click', () => {
        save = D.newSaveV1(); save.profile.createdAt = new Date().toISOString();
        NS.Save.store(save); refreshHud(); NS.log('はじめから', 'ok');
      });

      requestAnimationFrame((t) => { last = t; requestAnimationFrame(loop); });
    }
    return { boot };
  })();
})();

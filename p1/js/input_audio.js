/* HAKONIWA Engine - input.js / audio.js 相当(ブラウザ専用・1ファイル集約) */
(function () {
  'use strict';
  const NS = (window.Hakoniwa = window.Hakoniwa || {});

  /* ---------------- 入力抽象化 ----------------
     4系統(タッチ/マウス/キーボード/ゲームパッド)を論理入力に統合:
       move: {dx, dy}(-1..1) / confirm / cancel (エッジ検出)
     - キーボード: 矢印+WASD / Z,Enter=決定 / X,Esc=キャンセル
     - タッチ・マウス: フィールドをドラッグ/ホールドした方向へ移動(仮想スティック)
     - パッド: 左スティック+十字キー / A=決定 / B=キャンセル(標準マッピング) */
  NS.Input = (function () {
    const keys = new Set();
    let pointerVec = null; // {dx,dy}
    let confirmQ = 0, cancelQ = 0;
    let fieldEl = null;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      keys.add(e.key);
      if (e.key === 'z' || e.key === 'Z' || e.key === 'Enter') confirmQ++;
      if (e.key === 'x' || e.key === 'X' || e.key === 'Escape') cancelQ++;
    });
    window.addEventListener('keyup', (e) => keys.delete(e.key));

    function attachField(el) {
      fieldEl = el;
      let origin = null;
      el.addEventListener('pointerdown', (e) => {
        if (!e.isPrimary) return;
        e.preventDefault();
        origin = { x: e.clientX, y: e.clientY };
        pointerVec = { dx: 0, dy: 0 };
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', (e) => {
        if (!origin || !e.isPrimary) return;
        const dx = e.clientX - origin.x, dy = e.clientY - origin.y;
        const len = Math.hypot(dx, dy);
        pointerVec = len < 8 ? { dx: 0, dy: 0 } : { dx: dx / Math.max(len, 24) , dy: dy / Math.max(len, 24) };
        pointerVec.dx = Math.max(-1, Math.min(1, pointerVec.dx));
        pointerVec.dy = Math.max(-1, Math.min(1, pointerVec.dy));
      });
      const end = () => { origin = null; pointerVec = null; };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    }

    let padConfirmPrev = false, padCancelPrev = false;
    function pollPad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p || !p.connected) continue;
        let dx = p.axes[0] || 0, dy = p.axes[1] || 0;
        if (Math.abs(dx) < 0.25) dx = 0;
        if (Math.abs(dy) < 0.25) dy = 0;
        if (p.buttons[14] && p.buttons[14].pressed) dx = -1; // 十字
        if (p.buttons[15] && p.buttons[15].pressed) dx = 1;
        if (p.buttons[12] && p.buttons[12].pressed) dy = -1;
        if (p.buttons[13] && p.buttons[13].pressed) dy = 1;
        const c = p.buttons[0] && p.buttons[0].pressed;   // A
        const b = p.buttons[1] && p.buttons[1].pressed;   // B
        if (c && !padConfirmPrev) confirmQ++;
        if (b && !padCancelPrev) cancelQ++;
        padConfirmPrev = c; padCancelPrev = b;
        if (dx || dy) return { dx, dy };
      }
      return null;
    }

    function poll() {
      let dx = 0, dy = 0;
      if (keys.has('ArrowLeft') || keys.has('a')) dx -= 1;
      if (keys.has('ArrowRight') || keys.has('d')) dx += 1;
      if (keys.has('ArrowUp') || keys.has('w')) dy -= 1;
      if (keys.has('ArrowDown') || keys.has('s')) dy += 1;
      const pad = pollPad();
      if (!dx && !dy && pad) { dx = pad.dx; dy = pad.dy; }
      if (!dx && !dy && pointerVec) { dx = pointerVec.dx; dy = pointerVec.dy; }
      const out = { dx, dy, confirm: confirmQ > 0, cancel: cancelQ > 0 };
      confirmQ = 0; cancelQ = 0;
      return out;
    }
    return { attachField, poll };
  })();

  /* ---------------- オーディオ(解錠+SE2種) ---------------- */
  NS.Audio = (function () {
    let ctx = null;
    function unlock() {
      if (ctx) return;
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
    }
    // iOS: 初回のユーザー操作で解錠(Phase 0方針)
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    function tone(freq, dur, type, gain) {
      if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(gain || 0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur);
    }
    return {
      seCorrect() { tone(880, 0.12, 'triangle'); setTimeout(() => tone(1318, 0.18, 'triangle'), 90); },
      seWrong() { tone(196, 0.25, 'square', 0.05); },
    };
  })();
})();

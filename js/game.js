"use strict";

(() => {
  /* ===== config ===== */
  const APPROACH = 1.25;    // seconds from note spawn to hit line
  const LEAD_IN = 3;        // countdown before t=0
  const RESULT_TAIL = 1.0;  // seconds after the last beat before results
  const KEY_TO_LANE = {
    d: 0, f: 1, j: 2, k: 3,
    arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3,
  };
  const LANE_COLORS = ["#ff5c8a", "#4fc3f7", "#7cff6b", "#ffd54f"];
  const HEALTH = { start: 100, perfect: 1, great: 0, good: -3, miss: -10 };
  const POPUP_MS = 700;

  /* ===== dom ===== */
  const $ = (id) => document.getElementById(id);
  const canvas = $("playfield");
  const ctx2d = canvas.getContext("2d");

  /* ===== state ===== */
  let state = "menu"; // menu | playing | paused | results
  let difficulty = "normal";
  let song = null;
  let notes = [];
  let stats = null;
  let songStart = 0;
  let ended = false;
  let lastFrame = performance.now();
  let particles = [];
  let popup = null; // { text, color, born }
  const laneFlash = [0, 0, 0, 0];
  let LAY = null;

  /* ===== helpers ===== */
  const songTime = () => AudioEngine.now() - songStart;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const colorFor = (r) =>
    ({ perfect: "#ffd740", great: "#4fc3f7", good: "#81c784", miss: "#ef5350" })[r];

  function freshStats(total) {
    return {
      total,
      counts: { perfect: 0, great: 0, good: 0, miss: 0 },
      combo: 0, maxCombo: 0,
      score: 0, accPoints: 0, judged: 0,
      health: HEALTH.start,
    };
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    $(id).classList.add("active");
  }

  function rr(x, y, w, h, r) {
    ctx2d.beginPath();
    ctx2d.moveTo(x + r, y);
    ctx2d.arcTo(x + w, y, x + w, y + h, r);
    ctx2d.arcTo(x + w, y + h, x, y + h, r);
    ctx2d.arcTo(x, y + h, x, y, r);
    ctx2d.arcTo(x, y, x + w, y, r);
    ctx2d.closePath();
  }

  /* ===== layout ===== */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fieldW = Math.min(w * 0.92, 460);
    const hitY = h - Math.max(88, h * 0.13);
    const topY = 64;
    LAY = {
      w, h,
      x0: (w - fieldW) / 2,
      fieldW, laneW: fieldW / 4,
      hitY, topY,
      pxPerSec: (hitY - topY) / APPROACH,
    };
  }
  window.addEventListener("resize", resize);

  /* ===== lifecycle ===== */
  function startGame() {
    song = Song.buildSong(difficulty);
    notes = song.notes.map((n) => ({ t: n.t, lane: n.lane, judged: false, result: null }));
    stats = freshStats(notes.length);
    particles = [];
    popup = null;
    ended = false;
    showScreen("screen-game");
    resize();
    $("song-title").textContent = "NEON BEATS · " + difficulty;
    updateHud();
    songStart = AudioEngine.start(song, LEAD_IN);
    state = "playing";
    lastFrame = performance.now();
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      AudioEngine.pause();
      $("pause-overlay").classList.remove("hidden");
    } else if (state === "paused") {
      state = "playing";
      AudioEngine.resume();
      lastFrame = performance.now();
      $("pause-overlay").classList.add("hidden");
    }
  }

  function quitToMenu() {
    AudioEngine.stop();
    ended = true;
    state = "menu";
    $("pause-overlay").classList.add("hidden");
    showScreen("screen-menu");
  }

  function finish(failed) {
    if (ended) return;
    ended = true;
    state = "results";
    AudioEngine.stop();
    const acc = stats.total ? stats.accPoints / stats.total : 0;
    stats.score = Math.round(1000000 * acc);
    const rank = failed ? "F" : Judge.rank(acc);
    const rankEl = $("result-rank");
    rankEl.textContent = rank;
    rankEl.className = "rank rank-" + rank.toLowerCase();
    $("result-verdict").textContent = failed ? "TRACK FAILED" : "TRACK CLEARED";
    $("result-score").textContent = stats.score.toLocaleString("en-US");
    $("result-accuracy").textContent = "Accuracy " + (acc * 100).toFixed(2) + "%";
    $("c-perfect").textContent = stats.counts.perfect;
    $("c-great").textContent = stats.counts.great;
    $("c-good").textContent = stats.counts.good;
    $("c-miss").textContent = stats.counts.miss;
    $("c-combo").textContent = stats.maxCombo;
    showScreen("screen-results");
  }

  /* ===== judging ===== */
  function applyJudgement(n, result) {
    n.judged = true;
    n.result = result;
    const w = Judge.WEIGHTS[result];
    stats.counts[result] += 1;
    stats.judged += 1;
    stats.accPoints += w;
    if (result === "miss") {
      stats.combo = 0;
      AudioEngine.sfx("miss");
    } else {
      stats.combo += 1;
      stats.maxCombo = Math.max(stats.maxCombo, stats.combo);
      popup = { text: result.toUpperCase(), color: colorFor(result), born: performance.now() };
      spawnParticles(n.lane, colorFor(result));
      AudioEngine.sfx("hit");
    }
    stats.score += Math.round((1000000 * w) / stats.total);
    stats.health = clamp(stats.health + HEALTH[result], 0, 100);
  }

  function press(lane) {
    if (state !== "playing") return;
    laneFlash[lane] = performance.now();
    const t = songTime();
    if (t < 0) return;
    const window_ = Judge.WINDOWS.good;
    let best = null;
    let bestDt = Infinity;
    for (const n of notes) {
      if (n.t - t > window_) break; // time-sorted: nothing later can match either
      if (n.lane !== lane || n.judged) continue;
      const dt = Math.abs(n.t - t);
      if (dt <= window_ && dt < bestDt) { bestDt = dt; best = n; }
    }
    if (best) applyJudgement(best, Judge.classify(bestDt));
  }

  /* ===== update ===== */
  function update(t, dt) {
    updateHud();

    const cd = $("countdown");
    if (t < 0.6) {
      const text = t < 0 ? String(Math.ceil(-t)) : "GO!";
      if (cd.textContent !== text) cd.textContent = text;
      cd.classList.remove("hidden");
    } else {
      cd.classList.add("hidden");
    }

    updateParticles(dt);
    if (t < 0) return;

    for (const n of notes) {
      if (n.judged) continue;
      if (n.t + Judge.WINDOWS.good >= t) break; // not expired, and neither is anything after it
      applyJudgement(n, "miss");
      if (state !== "playing") return;
    }

    if (stats.health <= 0) { finish(true); return; }
    if (t > song.duration + RESULT_TAIL) finish(false);
  }

  function updateHud() {
    if (!stats) return;
    const t = songTime();
    $("score").textContent = stats.score.toLocaleString("en-US");
    const acc = stats.judged ? (stats.accPoints / stats.judged) * 100 : 100;
    $("accuracy").textContent = acc.toFixed(2) + "%";
    $("health-fill").style.width = stats.health + "%";
    $("health").classList.toggle("low", stats.health < 30);
    $("progress-fill").style.width = clamp(t / song.duration, 0, 1) * 100 + "%";
  }

  /* ===== particles ===== */
  function spawnParticles(lane, color) {
    const cx = LAY.x0 + lane * LAY.laneW + LAY.laneW / 2;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      particles.push({
        x: cx, y: LAY.hitY,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80,
        life: 1, color,
      });
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 500 * dt;
      p.life -= dt * 2.2;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  /* ===== render ===== */
  function drawNote(n, y) {
    const L = LAY;
    const x = L.x0 + n.lane * L.laneW + 8;
    const w = L.laneW - 16;
    const h = 20;
    ctx2d.save();
    ctx2d.shadowColor = LANE_COLORS[n.lane];
    ctx2d.shadowBlur = 14;
    ctx2d.fillStyle = LANE_COLORS[n.lane];
    rr(x, y - h / 2, w, h, 8);
    ctx2d.fill();
    ctx2d.restore();
    ctx2d.fillStyle = "rgba(255,255,255,0.55)";
    rr(x + 5, y - h / 2 + 3, w - 10, 4, 2);
    ctx2d.fill();
  }

  function render(t) {
    const L = LAY;
    const now = performance.now();
    ctx2d.clearRect(0, 0, L.w, L.h);

    // playfield background
    ctx2d.fillStyle = "rgba(10, 10, 24, 0.92)";
    ctx2d.fillRect(L.x0, 0, L.fieldW, L.hitY + 30);

    // pressed-lane flash
    for (let lane = 0; lane < 4; lane++) {
      const age = now - laneFlash[lane];
      if (age > 150) continue;
      ctx2d.save();
      ctx2d.globalAlpha = 0.3 * (1 - age / 150);
      ctx2d.fillStyle = LANE_COLORS[lane];
      ctx2d.fillRect(L.x0 + lane * L.laneW, 0, L.laneW, L.hitY + 30);
      ctx2d.restore();
    }

    // lane dividers
    ctx2d.strokeStyle = "rgba(255,255,255,0.08)";
    ctx2d.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = L.x0 + i * L.laneW;
      ctx2d.beginPath();
      ctx2d.moveTo(x, 0);
      ctx2d.lineTo(x, L.hitY + 30);
      ctx2d.stroke();
    }

    // falling notes
    if (t >= 0) {
      for (const n of notes) {
        if (n.judged) continue;
        const dtNote = n.t - t;
        if (dtNote > APPROACH) break;
        if (dtNote < -Judge.WINDOWS.good) continue;
        drawNote(n, L.hitY - dtNote * L.pxPerSec);
      }
    }

    // hit line
    ctx2d.save();
    ctx2d.shadowColor = "#7c5cff";
    ctx2d.shadowBlur = 20;
    ctx2d.fillStyle = "#d9d0ff";
    ctx2d.fillRect(L.x0, L.hitY - 2, L.fieldW, 4);
    ctx2d.restore();

    // receptors
    for (let lane = 0; lane < 4; lane++) {
      const pressed = now - laneFlash[lane] <= 150;
      ctx2d.save();
      ctx2d.globalAlpha = pressed ? 0.55 : 0.2;
      ctx2d.fillStyle = LANE_COLORS[lane];
      rr(L.x0 + lane * L.laneW + 6, L.hitY + 8, L.laneW - 12, 22, 8);
      ctx2d.fill();
      ctx2d.restore();
    }

    // hit particles
    for (const p of particles) {
      ctx2d.save();
      ctx2d.globalAlpha = Math.max(0, p.life);
      ctx2d.fillStyle = p.color;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.restore();
    }

    // combo counter
    if (stats && stats.combo >= 3) {
      ctx2d.save();
      ctx2d.textAlign = "center";
      ctx2d.shadowColor = "#7c5cff";
      ctx2d.shadowBlur = 16;
      ctx2d.fillStyle = "#ffffff";
      ctx2d.font = "900 52px 'Segoe UI', sans-serif";
      ctx2d.fillText(String(stats.combo), L.w / 2, L.hitY * 0.55);
      ctx2d.font = "700 15px 'Segoe UI', sans-serif";
      ctx2d.fillStyle = "rgba(255,255,255,0.75)";
      ctx2d.shadowBlur = 0;
      ctx2d.fillText("COMBO", L.w / 2, L.hitY * 0.55 + 24);
      ctx2d.restore();
    }

    // judgment popup
    if (popup) {
      const age = (now - popup.born) / POPUP_MS;
      if (age >= 1) popup = null;
      else {
        ctx2d.save();
        ctx2d.globalAlpha = 1 - age;
        ctx2d.textAlign = "center";
        ctx2d.font = "900 34px 'Segoe UI', sans-serif";
        ctx2d.fillStyle = popup.color;
        ctx2d.shadowColor = popup.color;
        ctx2d.shadowBlur = 14;
        ctx2d.fillText(popup.text, L.w / 2, L.hitY - 100 - age * 40);
        ctx2d.restore();
      }
    }
  }

  /* ===== main loop ===== */
  function frame(ts) {
    requestAnimationFrame(frame);
    if (state !== "playing" || !song) return;
    const dt = Math.min(0.05, (ts - lastFrame) / 1000);
    lastFrame = ts;
    const t = songTime();
    update(t, dt);
    if (state === "playing") render(t);
  }

  /* ===== input ===== */
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { togglePause(); return; }
    if (state !== "playing" || e.repeat) return;
    const lane = KEY_TO_LANE[e.key] !== undefined
      ? KEY_TO_LANE[e.key]
      : KEY_TO_LANE[String(e.key).toLowerCase()];
    if (lane === undefined) return;
    e.preventDefault();
    press(lane);
  });

  canvas.addEventListener("pointerdown", (e) => {
    if (state !== "playing") return;
    const rect = canvas.getBoundingClientRect();
    const lane = Math.floor((e.clientX - rect.left - LAY.x0) / LAY.laneW);
    if (lane >= 0 && lane < 4) {
      e.preventDefault();
      press(lane);
    }
  });

  window.addEventListener("blur", () => { if (state === "playing") togglePause(); });

  /* ===== ui wiring ===== */
  document.querySelectorAll(".diff-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".diff-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      difficulty = btn.dataset.diff;
    });
  });
  $("btn-start").addEventListener("click", startGame);
  $("btn-retry").addEventListener("click", startGame);
  $("btn-menu").addEventListener("click", () => { state = "menu"; showScreen("screen-menu"); });
  $("btn-pause").addEventListener("click", togglePause);
  $("btn-resume").addEventListener("click", togglePause);
  $("btn-restart").addEventListener("click", () => {
    $("pause-overlay").classList.add("hidden");
    startGame();
  });
  $("btn-quit").addEventListener("click", quitToMenu);

  /* QA handle: lets a browser test drive a frame-accurate hit */
  window.RhythmDebug = {
    press,
    songTime,
    state: () => state,
    stats: () => stats,
    nextNote: () => notes.find((n) => !n.judged) || null,
    laneFlash: () => laneFlash.slice(),
    difficulty: () => difficulty,
  };

  resize();
  requestAnimationFrame(frame);
})();

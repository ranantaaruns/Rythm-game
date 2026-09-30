"use strict";

const Song = (() => {
  const LANES = 4;
  const BPM = 132;
  const SPB = 60 / BPM; // seconds per beat ~0.4545
  // A-minor-ish scale used by bass (÷2) and lead (×2)
  const SCALE = [220.0, 246.94, 261.63, 293.66, 329.63, 392.0, 440.0];

  const DIFFICULTIES = {
    easy:   { beats: 64,  seed: 1337, density: 0.5,  eighths: 0.0,  chords: 0.0  },
    normal: { beats: 96,  seed: 2024, density: 0.7,  eighths: 0.35, chords: 0.05 },
    hard:   { beats: 128, seed: 9001, density: 0.9,  eighths: 0.7,  chords: 0.15 },
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const msKey = (t, lane) => Math.round(t * 1000) + "|" + lane;

  function buildSong(difficulty) {
    const cfg = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
    const name = DIFFICULTIES[difficulty] ? difficulty : "normal";
    const rand = mulberry32(cfg.seed);
    const duration = cfg.beats * SPB;
    const notes = [];
    const music = [];
    const used = new Set();
    let lastLane = -1;

    // Place one note at time t on a free lane, preferring a different lane than
    // the previous note so the player's fingers move around.
    const addNote = (t) => {
      let lane = -1;
      for (let i = 0; i < 16 && lane === -1; i++) {
        const cand = Math.floor(rand() * LANES);
        if (cand !== lastLane && !used.has(msKey(t, cand))) lane = cand;
      }
      if (lane === -1) {
        for (let cand = 0; cand < LANES && lane === -1; cand++) {
          if (!used.has(msKey(t, cand))) lane = cand;
        }
      }
      if (lane === -1) return false;
      used.add(msKey(t, lane));
      notes.push({ t, lane });
      lastLane = lane;
      return true;
    };

    for (let b = 0; b < cfg.beats; b++) {
      const t = b * SPB;

      // --- music track (shared with the chart so both stay in sync) ---
      music.push({ t, kind: "kick" });
      if (b % 4 === 1 || b % 4 === 3) music.push({ t, kind: "snare" });
      music.push({ t: t + SPB / 2, kind: "hat", gain: 0.12 });
      music.push({ t, kind: "bass", freq: SCALE[b % SCALE.length] / 2 });
      if (b >= cfg.beats / 2) {
        music.push({ t, kind: "lead", freq: SCALE[(b * 3) % SCALE.length] * 2 });
        music.push({ t: t + SPB / 2, kind: "lead", freq: SCALE[(b * 3 + 2) % SCALE.length] * 2 });
      }

      // --- chart ---
      if (rand() < cfg.density) addNote(t);
      if (cfg.eighths > 0 && b < cfg.beats - 2 && rand() < cfg.eighths) addNote(t + SPB / 2);
      if (rand() < cfg.chords) addNote(t); // second note on the same beat -> chord
    }

    notes.sort((a, b2) => a.t - b2.t || a.lane - b2.lane);
    music.sort((a, b2) => a.t - b2.t);
    return { bpm: BPM, spb: SPB, duration, difficulty: name, lanes: LANES, notes, music };
  }

  return { buildSong, DIFFICULTIES, LANES, BPM };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildSong: Song.buildSong,
    DIFFICULTIES: Song.DIFFICULTIES,
    LANES: Song.LANES,
    BPM: Song.BPM,
  };
} else {
  window.Song = Song;
}

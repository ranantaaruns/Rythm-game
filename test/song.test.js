"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildSong, LANES } = require("../js/song.js");

const DIFFS = ["easy", "normal", "hard"];
const msKey = (n) => Math.round(n.t * 1000) + "|" + n.lane;

test("same difficulty always produces an identical song", () => {
  assert.equal(JSON.stringify(buildSong("normal")), JSON.stringify(buildSong("normal")));
});

test("unknown difficulty falls back to normal", () => {
  assert.equal(buildSong("nope").difficulty, "normal");
});

test("every note lane is 0..3 and no (time,lane) pair repeats", () => {
  for (const d of DIFFS) {
    const seen = new Set();
    for (const n of buildSong(d).notes) {
      assert.ok(Number.isInteger(n.lane) && n.lane >= 0 && n.lane < LANES, `bad lane ${n.lane}`);
      assert.ok(!seen.has(msKey(n)), `duplicate note t=${n.t} lane=${n.lane}`);
      seen.add(msKey(n));
    }
  }
});

test("notes are time-sorted and lie inside [0, duration)", () => {
  for (const d of DIFFS) {
    const s = buildSong(d);
    assert.ok(s.notes.length > 0);
    for (let i = 0; i < s.notes.length; i++) {
      assert.ok(s.notes[i].t >= 0 && s.notes[i].t < s.duration, `note ${i} outside song`);
      if (i > 0) assert.ok(s.notes[i - 1].t <= s.notes[i].t, "notes not sorted");
    }
  }
});

test("a lane never receives two notes closer than 0.15s (physically playable)", () => {
  for (const d of DIFFS) {
    const last = new Map();
    for (const n of buildSong(d).notes) {
      if (last.has(n.lane)) {
        assert.ok(n.t - last.get(n.lane) >= 0.15, `lane ${n.lane} too dense at t=${n.t}`);
      }
      last.set(n.lane, n.t);
    }
  }
});

test("hard is denser than normal, normal denser than easy", () => {
  const e = buildSong("easy").notes.length;
  const n = buildSong("normal").notes.length;
  const h = buildSong("hard").notes.length;
  assert.ok(e > 0 && n > e && h > n, `easy=${e} normal=${n} hard=${h}`);
});

test("music track: one kick per beat, sorted by time, inside the song", () => {
  const s = buildSong("normal");
  const kicks = s.music.filter((e) => e.kind === "kick");
  assert.equal(kicks.length, Math.round(s.duration / s.spb));
  for (let i = 1; i < s.music.length; i++) {
    assert.ok(s.music[i - 1].t <= s.music[i].t, "music not sorted");
  }
  for (const e of s.music) {
    assert.ok(e.t >= 0 && e.t < s.duration + 0.01, `music event out of range t=${e.t}`);
    assert.ok(["kick", "snare", "hat", "bass", "lead"].includes(e.kind), `bad kind ${e.kind}`);
  }
  assert.ok(s.music.some((e) => e.kind === "bass" && e.freq > 0));
});

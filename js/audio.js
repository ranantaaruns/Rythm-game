"use strict";

const AudioEngine = (() => {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let noiseBuffer = null;

  let song = null;
  let nextEvent = 0;
  let startTime = 0; // ctx time at which song t=0 happens
  let timer = null;
  const active = new Set(); // scheduled sources, so stop() can kill them

  function makeNoise(c) {
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.55;
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.4;
      sfxBus.connect(master);
      noiseBuffer = makeNoise(ctx);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function track(node) {
    active.add(node);
    node.onended = () => active.delete(node);
  }

  function env(g, t, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    env(g, t, 1.0, 0.22);
    o.connect(g).connect(musicBus);
    o.start(t); o.stop(t + 0.25); track(o);
  }

  function snare(t) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1400;
    const g = ctx.createGain();
    env(g, t, 0.5, 0.16);
    src.connect(hp).connect(g).connect(musicBus);
    src.start(t); src.stop(t + 0.2); track(src);

    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 180;
    env(og, t, 0.25, 0.1);
    o.connect(og).connect(musicBus);
    o.start(t); o.stop(t + 0.12); track(o);
  }

  function hat(t, gain) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    const g = ctx.createGain();
    env(g, t, gain, 0.05);
    src.connect(hp).connect(g).connect(musicBus);
    src.start(t); src.stop(t + 0.08); track(src);
  }

  function bass(t, freq, dur) {
    const o = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.value = freq;
    lp.type = "lowpass";
    lp.frequency.value = 500;
    env(g, t, 0.35, dur);
    o.connect(lp).connect(g).connect(musicBus);
    o.start(t); o.stop(t + dur + 0.02); track(o);
  }

  function lead(t, freq, dur) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    env(g, t, 0.12, dur);
    o.connect(g).connect(musicBus);
    o.start(t); o.stop(t + dur + 0.02); track(o);
  }

  const VOICES = {
    kick: (e, t) => kick(t),
    snare: (e, t) => snare(t),
    hat: (e, t) => hat(t, e.gain || 0.12),
    bass: (e, t) => bass(t, e.freq, 0.3),
    lead: (e, t) => lead(t, e.freq, 0.16),
  };

  // Schedule everything starting within the next 150 ms; runs every 25 ms.
  function tick() {
    if (!song || !ctx) return;
    const horizon = ctx.currentTime + 0.15;
    while (nextEvent < song.music.length) {
      const e = song.music[nextEvent];
      const at = startTime + e.t;
      if (at > horizon) break;
      (VOICES[e.kind] || (() => {}))(e, at);
      nextEvent++;
    }
  }

  /** Starts the song `leadIn` seconds from now; returns ctx time of song t=0. */
  function start(songData, leadIn) {
    ensure();
    stop();
    song = songData;
    nextEvent = 0;
    startTime = ctx.currentTime + (leadIn || 0);
    tick();
    timer = setInterval(tick, 25);
    return startTime;
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    for (const node of active) { try { node.stop(); } catch (_) { /* already stopped */ } }
    active.clear();
    song = null;
  }

  function pause() { if (ctx && ctx.state === "running") ctx.suspend(); }
  function resume() { if (ctx && ctx.state === "suspended") ctx.resume(); }
  function now() { return ctx ? ctx.currentTime : 0; }

  /** Short feedback sound: "hit" on a judged note, "miss" when one is dropped. */
  function sfx(kind) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (kind === "hit") {
      o.type = "sine"; o.frequency.value = 880; env(g, t, 0.1, 0.06);
    } else {
      o.type = "sawtooth";
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
      env(g, t, 0.16, 0.18);
    }
    o.connect(g).connect(sfxBus);
    o.start(t); o.stop(t + 0.25); track(o);
  }

  /** QA handle: how far the scheduler has got, and whether it is still ticking. */
  function debug() {
    return {
      scheduled: nextEvent,
      total: song ? song.music.length : 0,
      ticking: timer !== null,
      state: ctx ? ctx.state : "none",
    };
  }

  return { start, stop, pause, resume, now, sfx, debug };
})();

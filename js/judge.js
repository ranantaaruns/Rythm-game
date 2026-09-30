"use strict";

const Judge = (() => {
  const WINDOWS = { perfect: 0.05, great: 0.1, good: 0.15 }; // seconds
  const WEIGHTS = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };

  /** dt = signed or absolute seconds between input and note time. */
  function classify(dt) {
    const e = Math.abs(dt);
    if (e <= WINDOWS.perfect) return "perfect";
    if (e <= WINDOWS.great) return "great";
    if (e <= WINDOWS.good) return "good";
    return "miss";
  }

  /** acc = accuracy ratio in [0,1] -> letter rank. */
  function rank(acc) {
    if (acc >= 0.95) return "S";
    if (acc >= 0.9) return "A";
    if (acc >= 0.8) return "B";
    if (acc >= 0.7) return "C";
    return "D";
  }

  return { WINDOWS, WEIGHTS, classify, rank };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Judge;
else window.Judge = Judge;

"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Judge = require("../js/judge.js");

test("classify maps absolute timing error to a judgment", () => {
  assert.equal(Judge.classify(0.0), "perfect");
  assert.equal(Judge.classify(0.05), "perfect");
  assert.equal(Judge.classify(0.051), "great");
  assert.equal(Judge.classify(0.1), "great");
  assert.equal(Judge.classify(0.101), "good");
  assert.equal(Judge.classify(0.15), "good");
  assert.equal(Judge.classify(0.151), "miss");
});

test("classify accepts signed offset (early or late)", () => {
  assert.equal(Judge.classify(-0.04), "perfect");
  assert.equal(Judge.classify(-0.12), "good");
  assert.equal(Judge.classify(-0.3), "miss");
});

test("rank thresholds", () => {
  assert.equal(Judge.rank(1), "S");
  assert.equal(Judge.rank(0.95), "S");
  assert.equal(Judge.rank(0.949), "A");
  assert.equal(Judge.rank(0.9), "A");
  assert.equal(Judge.rank(0.899), "B");
  assert.equal(Judge.rank(0.799), "C");
  assert.equal(Judge.rank(0.699), "D");
});

test("weights: miss contributes zero and good < great", () => {
  assert.equal(Judge.WEIGHTS.miss, 0);
  assert.equal(Judge.WEIGHTS.perfect, 1);
  assert.ok(Judge.WEIGHTS.good < Judge.WEIGHTS.great);
});

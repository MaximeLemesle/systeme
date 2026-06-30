const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");

test("l'application Express se charge sans démarrer de serveur", () => {
  assert.equal(typeof app, "function");
});

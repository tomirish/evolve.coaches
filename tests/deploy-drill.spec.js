const { test, expect } = require('@playwright/test');

// Deliberate failure: proves the deploy job is skipped when tests fail.
// This file is removed in the next commit.
test('deploy gate drill — this failure must block the deploy', () => {
  expect(1).toBe(2);
});

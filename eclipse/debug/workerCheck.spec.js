import { test, expect } from '@playwright/test';

test('local Eclipse debugger worker check', () => {
  const inspection = { role: 'worker', answer: 42 };
  const answer = inspection.answer; // Source breakpoint.
  expect(answer).toBe(42);
});

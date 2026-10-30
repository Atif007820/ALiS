import { test, expect } from '@playwright/test';

test('local Eclipse debugger worker check', () => {
  const inspection = { role: 'worker', answer: 42 };
  debugger;
  expect(inspection.answer).toBe(42);
});

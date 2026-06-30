import TC01 from './TC01_Tabs.js';
import TC02 from './TC02_SectionHeaders.js';
import TC03 from './TC03_FieldLabels.js';
import TC04 from './TC04_TableColumnHeaders.js';
import TC05 from './TC05_InformativeText.js';

export const testCaseRegistry = {
  TC01,
  TC02,
  TC03,
  TC04,
  TC05,
};

export function resolveTestCases(selection) {
  const ids = selection?.length ? selection : Object.keys(testCaseRegistry);
  return ids.map((id) => {
    const normalizedId = id.trim().toUpperCase();
    const testCase = testCaseRegistry[normalizedId];

    if (!testCase) {
      throw new Error(`Unknown test case "${id}". Available: ${Object.keys(testCaseRegistry).join(', ')}`);
    }

    return testCase;
  });
}

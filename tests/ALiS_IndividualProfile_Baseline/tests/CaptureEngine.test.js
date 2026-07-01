import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptureEngine } from '../core/CaptureEngine.js';
import { baselineConfig } from '../config/baseline.config.js';

test('detailTabs excludes Additional Information unless explicitly enabled', () => {
  const engine = new CaptureEngine({ ...baselineConfig.capture, enableAdditionalInformationTab: false });

  assert.deepEqual(
    engine.detailTabs(['Entity Information', 'Additional Information', 'Permit(s)']),
    ['Entity Information', 'Permit(s)'],
  );
});

test('shouldIgnoreCapturedText filters noisy labels and masked values', () => {
  const engine = new CaptureEngine({ ...baselineConfig.capture });

  assert.equal(engine.shouldIgnoreCapturedText('Business Unit: MAMMO', 'fieldLabel'), true);
  assert.equal(engine.shouldIgnoreCapturedText('Business Unit', 'fieldLabel'), true);
  assert.equal(engine.shouldIgnoreCapturedText('View Individual', 'fieldLabel'), true);
  assert.equal(engine.shouldIgnoreCapturedText('Modify Individual', 'fieldLabel'), true);
  assert.equal(engine.shouldIgnoreCapturedText('View Individual', 'sectionHeader'), true);
  assert.equal(engine.shouldIgnoreCapturedText('Modify Individual', 'sectionHeader'), true);
  assert.equal(engine.shouldIgnoreCapturedText('Entity Name: IND_2642 MAMMO_2642', 'fieldLabel'), true);
  assert.equal(engine.shouldIgnoreCapturedText('Licensee Id: 126834', 'fieldLabel'), true);
  assert.equal(engine.shouldIgnoreCapturedText('Permit(s)', 'fieldLabel'), false);
});

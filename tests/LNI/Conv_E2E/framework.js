/**
 * framework.js — Single entry point for the LNI Permit Playwright Framework.
 *
 * Import everything your tests and pages need from here instead of hunting
 * through individual file paths:
 *
 *   import { test, expect, logger, loadUserData, addUserAnnotations } from '../framework.js';
 *
 * Third-party packages are still imported directly.
 */

export * from './fixtures/base.fixture.js';   // test, expect
export * from './utils/annotations.js';        // addUserAnnotations, addApplyAnnotations
export * from './utils/formActions.js';        // fillField, safeSelect, isVisible, …
export * from './utils/logger.js';             // logger
export * from './utils/randomData.js';         // pick, buildRegistrationUser, …
export * from './utils/userStore.js';          // loadUserData, saveUserData
export * from './config/runConfig.js';         // appConfig, FRAMEWORK_ROOT, USER_DATA_PATH, UPLOAD_FILES_DIR
export * from './config/editableData.js';      // TEST_DATA
export * from './config/constants.js';         // US_STATES, MACHINE_TYPES, …

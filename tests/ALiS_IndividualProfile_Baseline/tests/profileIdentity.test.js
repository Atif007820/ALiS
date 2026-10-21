import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBusinessUnit } from '../config/BusinessUnit.js';
import { buildIndividualProfileName } from '../utils/randomData.js';
import { profileRuntimeKey, resolveExistingProfileName } from '../utils/profileIdentity.js';

const defaults = {
  environment: { loginUrl: 'http://alis.test/ALiSNVRCP2TESTING11.4.42.04/LoginRadiation.aspx' },
  businessUnit: {
    flow2ProfileName: { firstName: 'IND_1', lastName: 'MAMMO_1' },
    flow4ProfileName: { firstName: 'IND_2', lastName: 'MAMMO_2' },
  },
  credentials: { username: 'admin' },
};

test('locking and navigation resolve exactly the same configured and overridden names', () => {
  assert.deepEqual(resolveExistingProfileName(defaults.businessUnit, { flow: '2' }), defaults.businessUnit.flow2ProfileName);
  assert.deepEqual(resolveExistingProfileName(defaults.businessUnit, { flow: '4' }), defaults.businessUnit.flow4ProfileName);
  assert.deepEqual(resolveExistingProfileName(defaults.businessUnit, { flow: '2', entityName: 'MAMMO_1,IND_1' }), defaults.businessUnit.flow2ProfileName);
  assert.deepEqual(resolveExistingProfileName(defaults.businessUnit, { flow: '2', entityName: 'IND_1 MAMMO_1' }), defaults.businessUnit.flow2ProfileName);
  assert.equal(profileRuntimeKey({ ...defaults, flow: '2' }),
    profileRuntimeKey({ ...defaults, flow: '4', entityName: 'mammo_1,ind_1' }));
});

test('different saved profiles or deployments do not share an exclusive lock', () => {
  const key = profileRuntimeKey({ ...defaults, flow: '2' });
  assert.notEqual(key, profileRuntimeKey({ ...defaults, flow: '4' }));
  assert.notEqual(key, profileRuntimeKey({ ...defaults, flow: '2',
    environment: { loginUrl: 'http://alis.test/ALiSNVRCP2TESTING11.4.42.03/LoginRadiation.aspx' } }));
  assert.equal(key, profileRuntimeKey({ ...defaults, flow: '2',
    environment: { loginUrl: `${defaults.environment.loginUrl}?next=home#top` } }));
});

test('credential creation locks are per portal and account, not browser or flow', () => {
  const key = profileRuntimeKey({ ...defaults, flow: '1' });
  assert.equal(key, profileRuntimeKey({ ...defaults, flow: '3', project: 'msedge' }));
  assert.notEqual(key, profileRuntimeKey({ ...defaults, flow: '1', credentials: { username: 'other' } }));
});

test('missing existing profile identity fails before starting a browser', () => {
  assert.throws(() => profileRuntimeKey({ ...defaults, flow: '4', businessUnit: {} }), /First Name and Last Name are required/);
});

test('every browser job receives distinct generated data and action arrays', () => {
  const profiles = Array.from({ length: 12 }, () => resolveBusinessUnit('MAMMO'));
  assert.equal(new Set(profiles.map(({ fullName }) => fullName)).size, profiles.length);
  assert.notEqual(profiles[0].profileFields, profiles[1].profileFields);
  assert.notEqual(profiles[0].finalCreateSaveActions, profiles[1].finalCreateSaveActions);
  profiles[0].profileFields[0].value = 'changed only in this job';
  assert.equal(profiles[1].profileFields[0].value, '$LAST_NAME');
});

test('profile names remain unique in a run even if random values repeat', () => {
  const previousRandom = Math.random;
  Math.random = () => 0;
  try {
    const names = Array.from({ length: 100 }, () => buildIndividualProfileName('TEST', 'IND'));
    assert.equal(new Set(names.map(({ firstName, lastName }) => `${firstName} ${lastName}`)).size, names.length);
  } finally {
    Math.random = previousRandom;
  }
});

test('same-millisecond jobs generate distinct API and credential values that fit the form', () => {
  const previousNow = Date.now;
  Date.now = () => 1_792_555_746_303;
  try {
    const profiles = Array.from({ length: 100 }, () => resolveBusinessUnit('MAMMO'));
    const apiValues = profiles.map(({ profileFields }) => profileFields.find(({ name }) => name === 'API#').value);
    const credentialValues = profiles.map(({ profileFields }) => profileFields.find(({ name }) => name === 'ARRT, NMTCB, and/or CMA').value);
    assert.equal(new Set(apiValues).size, profiles.length);
    assert.equal(new Set(credentialValues).size, profiles.length);
    assert.equal(apiValues.every((value) => /^API\d{12}$/.test(value) && value.length === 15), true);
    assert.equal(credentialValues.every((value) => /^\d{12}$/.test(value)), true);
  } finally { Date.now = previousNow; }
});

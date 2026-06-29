import { HMB_DATA } from '../config/editableData.js';
import * as random from './randomData.js';

export function buildRegistrationUser(overrides = {}) {
  const entityName = overrides.entityName || random.timestampName(HMB_DATA.registration.entityNamePrefix);

  return {
    entityName,
    firstName: overrides.firstName || random.firstName(),
    lastName: overrides.lastName || random.lastName(),
    email: overrides.email || HMB_DATA.common.primaryEmail,
    altEmail: overrides.altEmail || HMB_DATA.common.alternateEmail,
    loginName: overrides.loginName || random.loginName(HMB_DATA.registration.entityNamePrefix),
    password: overrides.password || HMB_DATA.common.password,
    streetOne: overrides.streetOne || random.address(),
    streetTwo: overrides.streetTwo || random.apt(),
    city: overrides.city || random.city(),
    zip: overrides.zip || random.zip(),
    county: overrides.county || HMB_DATA.registration.county,
    phone: overrides.phone || random.phone(),
    fax: overrides.fax || random.fax(),
  };
}

export function buildApplicant(overrides = {}) {
  return {
    ...HMB_DATA.loginApply.applicant,
    ...overrides,
    firstName: overrides.firstName || random.firstName(),
    lastName: overrides.lastName || random.lastName(),
    phone: overrides.phone || random.phone(),
  };
}

export function buildAddressInformation(overrides = {}) {
  const configured = HMB_DATA.loginApply.address;

  return {
    ...configured,
    ...overrides,
    mailingContactName: overrides.mailingContactName || random.fullName(),
    physicalContactName: overrides.physicalContactName || random.fullName(),
    physicalAddress: overrides.physicalAddress || random.address(),
    physicalApt: overrides.physicalApt || random.apt(),
    physicalCity: overrides.physicalCity || random.city(),
    physicalZip: overrides.physicalZip || random.zip(),
    physicalPrimaryPhone: overrides.physicalPrimaryPhone || random.primaryPhone(),
    physicalAlternatePhone: overrides.physicalAlternatePhone || random.alternatePhone(),
    physicalFax: overrides.physicalFax || random.fax(),
  };
}

export function buildOwner(overrides = {}) {
  return {
    ...HMB_DATA.loginApply.owner,
    ...overrides,
    firstName: overrides.firstName || random.firstName(),
    lastName: overrides.lastName || random.lastName(),
    contactPerson: overrides.contactPerson || random.fullName(),
    address: overrides.address || random.address(),
    apt: overrides.apt || random.apt(),
    city: overrides.city || random.city(),
    zip: overrides.zip || random.zip(),
    primaryPhone: overrides.primaryPhone || random.primaryPhone(),
    alternatePhone: overrides.alternatePhone || random.alternatePhone(),
    fax: overrides.fax || random.fax(),
  };
}

export function expandPersonnelEntries() {
  return HMB_DATA.loginApply.personnel.flatMap((entry) => {
    const repeat = Number(entry.repeat || 1);
    return Array.from({ length: repeat }, (_, index) => ({
      ...entry,
      firstName: random.firstName(),
      lastName: random.lastName(),
      address: random.address(),
      city: random.city(),
      zip: random.zip(),
      primaryPhone: random.primaryPhone(),
      alternatePhone: random.alternatePhone(),
      occurrence: index + 1,
    }));
  });
}

export function buildAuthorizedLocation(overrides = {}) {
  return {
    ...HMB_DATA.loginApply.authorizedLocation,
    ...overrides,
    name: overrides.name || random.fullName(),
    address: overrides.address || random.address(),
    city: overrides.city || random.city(),
    zip: overrides.zip || random.zip(),
    primaryPhone: overrides.primaryPhone || random.primaryPhone(),
    alternatePhone: overrides.alternatePhone || random.alternatePhone(),
  };
}

export function buildAttestation(overrides = {}) {
  return {
    ...HMB_DATA.loginApply.attestation,
    ...overrides,
    operator: overrides.operator || random.fullName(),
  };
}

export const HMB_DATA = Object.freeze({
  common: {
    password: 'Password@1',
    primaryEmail: 'mohdatif.jamal@ops1.advancedgrc.com',
    alternateEmail: 'mohdatif.jamal@ops1.advancedgrc.com',
    defaultCounty: '14',
  },

  registration: {
    entityNamePrefix: 'HMB',
    county: '10',
  },

  loginApply: {
    applicationLink: 'Apply for RA-HMB',
    registrationType: 'Initial Registration and Accreditation by Deemed Status (HMBANA-accredited',
    services: ['Collection', 'Distribution'],
    applicant: {
      ownershipType: 'IND',
      role: 'ADM',
    },
    address: {
      physicalCounty: '14',
      webSiteUrl: 'Test WebSite URL',
      copyResidentialAddress: 'MLG',
    },
    owner: {
      comments: 'Test Comments',
      county: '04',
    },
    personnel: [
      {
        role: 'HMB ADMINISTRATOR',
        roleValue: 'HMBAD',
      },
      {
        role: 'DESIGNATED ALTERNATE HMB',
        roleValue: 'DAHA',
      },
      {
        role: 'HMB MEDICAL DIRECTOR',
        roleValue: 'HMBMD',
        boardCertified: 'No',
        repeat: 1,
      },
      {
        role: 'HMB MEDICAL ADVISORY COMMITTEE',
        roleValue: 'HMBMAC',
        uploadComment: 'Test2',
        repeat: 3,
      },
    ],
    mandatoryDocuments: [
      { id: 'mandatoryDoc0-0' },
      { id: 'mandatoryDoc1-0' },
      { id: 'mandatoryDoc2-0' },
      { id: 'mandatoryDoc3-0' },
      { id: 'mandatoryDoc4-0' },
      { id: 'mandatoryDoc5-0', pageNextBefore: true },
      { id: 'mandatoryDoc6-0' },
    ],
    authorizedLocation: {
      servicesPerformed: 'HMB Services',
    },
    attestation: {},
  },
});

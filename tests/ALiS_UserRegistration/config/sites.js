export const sites = {
  NJ: {
    key: 'NJ',
    displayName: 'NJ User Registration',
    strategy: 'NJ',
    products: [
      { key: 'CL', name: 'Clinical Laboratory', portalText: 'Clinical Laboratory', tabSelector: '#__tab_Test_tabPanelRad', entityPrefix: 'CL', entityFields: ['Laboratory Name', 'Registered Legal Business Name'], loginStyle: 'simpleNameNumber' },
      { key: 'BB', name: 'Blood Bank', portalText: 'Blood Bank', tabSelector: '#__tab_Test_tabPanelBBL', entityPrefix: 'BB', entityFields: ['Facility Name (Legal Name)', 'Facility Name (DBA Name)'], loginStyle: 'simpleNameNumber' },
      { key: 'HMB', name: 'Human Milk Bank', portalText: 'Human Milk Bank', tabSelector: '#__tab_Test_tabHMP', minimumVersion: '11.4.38', entityPrefix: 'HMB', entityFields: ['Entity Name (Legal Name)', 'Entity Name (DBA Name)'], loginPrefix: 'HMB_' },
      { key: 'ESF', name: 'Embryo Storage Facility', portalText: 'Embryo Storage Facility', tabSelector: '#__tab_Test_tabESF', minimumVersion: '11.4.38', entityPrefix: 'ESF_', entityFields: ['Entity Name (Legal Name)', 'Entity Name (DBA Name)'], loginPrefix: 'ESF_' },
    ],
  },

  NVRCP: {
    key: 'NVRCP',
    displayName: 'NVRCP User Registration',
    strategy: 'NVRCP',
    products: [
      { key: 'RPM', name: 'Radiation Producing Machine', sectionText: 'Radiation Producing Machines', registrationLinkId: 'm_LoginControl_LinkButton5', loginPrefix: 'RPM_', formType: 'facility', entityPrefix: 'RPM' },
      { key: 'RPM_INS', name: 'Radiation Producing Machine Installer', sectionText: 'Radiation Producing Machines', registrationLinkId: 'm_LoginControl_LinkButton9', loginPrefix: 'RPM_Ins_', formType: 'facility', entityPrefix: 'RPM_Ins' },
      { key: 'RM', name: 'Radioactive Materials', sectionText: 'Radioactive Materials', registrationLinkName: 'Click Here', loginPrefix: 'RM_', formType: 'facility', entityPrefix: 'RM' },
      { key: 'MAMMO', name: 'Mammographer', sectionText: 'Mammographers and MQSA', registrationLinkId: 'm_LoginControl_LinkButton17', loginPrefix: 'Mammo_', formType: 'person', entityPrefix: 'Mammo' },
      { key: 'MQSA', name: 'MQSA Machine', sectionText: 'Mammographers and MQSA', registrationLinkId: 'm_LoginControl_LinkButton18', loginPrefix: 'MQSA_', formType: 'facility', entityPrefix: 'MQSA' },
      { key: 'PLR', name: 'Professional Licensing and registrations FULL License/Credentials', sectionText: 'Professional Licensing and', registrationLinkId: 'm_LoginControl_LinkButton13', loginPrefix: 'PLR_', formType: 'person', entityPrefix: 'PLR' },
      { key: 'LL', name: 'Limited License', sectionText: 'Professional Licensing and', registrationLinkId: 'm_LoginControl_LinkButton14', loginPrefix: 'LL_', formType: 'person', entityPrefix: 'LL' },
      { key: 'SL', name: 'Student License', sectionText: 'Professional Licensing and', registrationLinkId: 'm_LoginControl_LinkButton16', loginPrefix: 'SL_', formType: 'person', entityPrefix: 'SL' },
      { key: 'RTRI', name: 'Radiation Therapy and Radiologic Imaging', sectionText: 'Professional Licensing and', registrationLinkId: 'm_LoginControl_LinkButton10', loginPrefix: 'RTRI_', formType: 'person', entityPrefix: 'RTRI' },
      { key: 'CTF', name: 'CT or Fluoroscopy', sectionText: 'Professional Licensing and', registrationLinkId: 'm_LoginControl_LinkButton4', loginPrefix: 'CTF_', formType: 'person', entityPrefix: 'CTF' },
      { key: 'RURAL', name: 'Rural Authorization', sectionText: 'Professional Licensing and', registrationLinkId: 'm_LoginControl_LinkButton15', loginPrefix: 'Rural_', formType: 'person', entityPrefix: 'Rural' },
      { key: 'CTOMO', name: 'Computed Tomography', sectionText: 'Professional Licensing and', registrationLinkId: 'm_LoginControl_LinkButton6', loginPrefix: 'CTomo_', formType: 'person', entityPrefix: 'CTomo' },
      { key: 'OUTSIDE', name: 'License to practice outside scope of practice', sectionText: 'Professional Licensing and', registrationLinkId: 'm_LoginControl_LinkButton8', loginPrefix: 'Outside_', formType: 'person', entityPrefix: 'Outside' },
    ],
  },

  DPBH: {
    key: 'DPBH',
    displayName: 'DPBH User Registration',
    strategy: 'DPBH',
    products: [
      { key: 'HF', name: 'Health Facility', sectionText: 'HCQC', registrationLinkId: 'm_LoginControl_LinkButton11', loginPrefix: 'HCQC_HF_', formType: 'facility', entityPrefix: 'HCQC_HF' },
      { key: 'DL', name: 'Dietician License', sectionText: 'HCQC', registrationLinkId: 'm_LoginControl_LinkButton6', loginPrefix: 'HCQC_DL_', formType: 'person', entityPrefix: 'HCQC_DL' },
      { key: 'MTL', name: 'Music Therapist License', sectionText: 'HCQC', registrationLinkId: 'm_LoginControl_LinkButton7', loginPrefix: 'HCQC_MTL_', formType: 'person', entityPrefix: 'HCQC_MTL' },
      { key: 'MLL', name: 'Medical Laboratory License', sectionText: 'HCQC', registrationLinkId: 'm_LoginControl_LinkButton2', loginPrefix: 'HCQC_MLL_', formType: 'facility', entityPrefix: 'HCQC_MLL' },
      { key: 'MEDLAB', name: 'Medlab', sectionText: 'HCQC', registrationLinkId: 'm_LoginControl_LinkButton8', loginPrefix: 'Medlab_', formType: 'person', entityPrefix: 'MEDLAB' },
      { key: 'CCFL', name: 'Child Care Facility License', tabSelector: '[id="__tab_Test_TabPanel2"]', registrationLinkId: 'm_LoginControl_lnkInitialChildCare', loginPrefix: 'CCFL_', formType: 'facility', entityPrefix: 'CCFL' },
      { key: 'CCFD', name: 'Child Care Facility Director', tabSelector: '[id="__tab_Test_TabPanel2"]', registrationLinkId: 'm_LoginControl_lnkChildCaredirector', loginPrefix: 'CCFD_', formType: 'person', entityPrefix: 'CCFD' },
      { key: 'CBA', name: 'Common Business Application', tabSelector: '[id="__tab_Test_TabPanel"]', registrationLinkId: 'm_LoginControl_lnkFoodEstablishmentPermit', loginPrefix: 'EH_CBA_', formType: 'facility', entityPrefix: 'EH_CBA' },
      { key: 'TP', name: 'Temporary Permit', tabSelector: '[id="__tab_Test_TabPanel"]', registrationLinkId: 'm_LoginControl_lnkTemporaryFoodPermit', loginPrefix: 'EH_TP_', formType: 'facility', entityPrefix: 'EH_TP' },
    ],
  },

  TXOCA: {
    key: 'TXOCA',
    displayName: 'TXOCA User Registration',
    strategy: 'TXOCA',
    retryLimit: 8,
    profileRetryLimit: 2,
    products: [
      { key: 'GRD', name: 'Guardianship', tabText: 'Register A Guardianship', tabSelector: '#__tab_Test_TabGuardianRegister', registrationLinkId: 'Test_TabGuardianRegister_LinkButton24', loginPrefix: 'guardianship', entityPrefix: 'GRD' },
      { key: 'CF', name: 'Guardianship as a Corporate Fiduciary', tabText: 'Register A Guardianship', tabSelector: '#__tab_Test_TabGuardianRegister', tabClickText: 'Register A Guardianship', registrationLinkId: 'Test_TabGuardianRegister_LinkButton1', loginPrefix: 'fiduciary', entityPrefix: 'PROGRAM' },
      { key: 'CR', name: 'Court Reporters', tabText: 'Court Reporters', tabSelector: '#__tab_Test_tabCredentialDetail', registrationLinkId: 'Test_tabCredentialDetail_LinkButton11', loginPrefix: 'CR_', entityPrefix: 'CR' },
      { key: 'CRF', name: 'Court Reporter Firm', tabText: 'Court Reporters', tabSelector: '#__tab_Test_tabCredentialDetail', tabClickText: 'Court Reporters', registrationLinkId: 'Test_tabCredentialDetail_LinkButton6', loginPrefix: 'CR_FIRM_', entityPrefix: 'FIRM' },
      { key: 'PS', name: 'Process Servers', tabText: 'Process Servers', tabSelector: '#__tab_Test_TabPanel', registrationLinkId: 'Test_TabPanel_lnkFoodEstablishmentPermit', loginPrefix: 'PS_', entityPrefix: 'PS' },
      { key: 'CI', name: 'Court Interpreters', tabText: 'Court Interpreters', tabSelector: '#__tab_Test_tabRevenue', registrationLinkId: 'Test_tabRevenue_lnkInitialEMT', loginPrefix: 'CI_', entityPrefix: 'CI' },
      { key: 'PROFESSIONAL_CG', aliases: ['PROFESSIONAL CG', 'PCG'], name: 'Professional Certified Guardians', tabText: 'Certified Guardians', tabClickText: 'Certified Guardians', registrationRowText: 'Become a Certified Guardian', registrationLinkId: 'Test_TabPanelGuardianShipRegistry_LinkButton1', loginPrefix: 'Professional_CG_', entityPrefix: 'Professional_CG', dialogAction: 'dismiss' },
      { key: 'GP', name: 'Guardianship Program', tabText: 'Certified Guardians', tabClickText: 'Certified Guardians', registrationRowText: 'Register a Guardianship Program', registrationLinkId: 'Test_TabPanelGuardianShipRegistry_LinkButton26', loginPrefix: 'GP_', entityPrefix: 'PROGRAM' },
    ],
  },

  CONV: {
    key: 'CONV',
    displayName: 'LNI Conveyance User Registration',
    strategy: 'CONV',
    products: [
      { key: 'CC', name: 'Conveyance Contractor', loginStyle: 'simpleNameProductNumber', entityPrefix: 'CONV' },
      { key: 'BO', name: 'Building Owner', loginStyle: 'simpleNameProductNumber', entityPrefix: 'CONV' },
      { key: 'PM', name: 'Property Manager', loginStyle: 'simpleNameProductNumber', entityPrefix: 'CONV' },
    ],
  },

  CRANES: {
    key: 'CRANES',
    displayName: 'LNI Cranes User Registration',
    strategy: 'CRANES',
    products: [
      { key: 'CRN', name: 'LNI - Cranes', loginStyle: 'simpleNameProductNumber', entityPrefix: 'CRN' },
    ],
  },

  SAPTA: {
    key: 'SAPTA',
    displayName: 'SAPTA User Registration',
    strategy: 'SAPTA',
    products: [
      { key: 'SPC', name: 'State Prevention Certification', sectionText: 'Behavioral Health Certifications for Excellence in Nevada', registrationLinkId: 'm_LoginControl_LinkButton5', loginPrefix: 'SPC_', entityPrefix: 'SPC', formType: 'provider' },
      { key: 'STC', name: 'State Treatment Certification', sectionText: 'Behavioral Health Certifications for Excellence in Nevada', registrationLinkId: 'm_LoginControl_LinkButton9', loginPrefix: 'STC_', entityPrefix: 'STC', formType: 'provider' },
      { key: 'DC', name: 'Detoxification Certification', sectionText: 'Behavioral Health Certifications for Excellence in Nevada', registrationLinkId: 'm_LoginControl_LinkButton10', loginPrefix: 'Detox_Cert_', entityPrefix: 'DC', formType: 'detox', preferredCounty: 'NY', optionalPopup: true },
    ],
  },
};

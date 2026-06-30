import { editableData } from './editableData.js';

const detailTabSettingsByUrl = {
  DPBH: {
    skippedDetailTabs: ['Owner(s)', 'Additional Information'],
  },
};

const conveyanceBusinessUnits = {
  CONV_CC: {
    id: 'CONV_CC',
    name: 'Conveyance Contractor',
    baselineFile: 'CONV_CC.xlsx',
    urlKey: 'LNI',
  },
  CONV_BO: {
    id: 'CONV_BO',
    name: 'Conveyance Building Owner',
    baselineFile: 'CONV_BO.xlsx',
    urlKey: 'LNI',
  },
  CONV_PM: {
    id: 'CONV_PM',
    name: 'Conveyance Property Manager',
    baselineFile: 'CONV_PM.xlsx',
    urlKey: 'LNI',
  },
};

export const businessUnits = {
  HLS: {
    id: 'HLS',
    name: 'Health Labour Standards',
    baselineFile: 'HLS.xlsx',
    urlKey: 'LNI',
  },
  CL: {
    id: 'CL',
    name: 'Child Labor',
    baselineFile: 'CL.xlsx',
    urlKey: 'LNI',
  },
  BB: {
    id: 'BB',
    name: 'Blood Bank',
    baselineFile: 'BB.xlsx',
    urlKey: 'NJ',
  },
  CLAB: {
    id: 'CLab',
    name: 'Clinical Laboratory',
    baselineFile: 'CLab.xlsx',
    urlKey: 'NJ',
  },
  ESF: {
    id: 'ESF',
    name: 'Embryo Storage Facility',
    baselineFile: 'ESF.xlsx',
    urlKey: 'NJ',
  },
  HMB: {
    id: 'HMB',
    name: 'Human Milk Bank',
    baselineFile: 'HMB.xlsx',
    urlKey: 'NJ',
  },
  HF: {
    id: 'HF',
    name: 'Health Facilities',
    baselineFile: 'HF.xlsx',
    urlKey: 'DPBH',
  },
  ML: {
    id: 'ML',
    name: 'Medical Laboratories',
    baselineFile: 'ML.xlsx',
    urlKey: 'DPBH',
  },
  EHS: {
    id: 'EHS',
    name: 'Environmental Health Section',
    baselineFile: 'EHS.xlsx',
    urlKey: 'DPBH',
  },
  CCP: {
    id: 'CCP',
    name: 'Child Care Program',
    baselineFile: 'CCP.xlsx',
    urlKey: 'DPBH',
  },
  KPS: {
    id: 'KPS',
    name: 'Kitchen Pool & Spa',
    baselineFile: 'KPS.xlsx',
    urlKey: 'DPBH',
  },
  ...conveyanceBusinessUnits,
  RPM: {
    id: 'RPM',
    name: 'Radiation Producing Machines',
    baselineFile: 'RPM.xlsx',
    urlKey: 'NVRCP',
  },
  RM: {
    id: 'RM',
    name: 'Radioactive Materials',
    baselineFile: 'RM.xlsx',
    urlKey: 'NVRCP',
  },
  MAMMO: {
    id: 'MAMMO',
    name: 'Mammography, Licensing and Registrations',
    baselineFile: 'Mammo.xlsx',
    urlKey: 'NVRCP',
  },
};

export function resolveBusinessUnit(businessUnitId) {
  const resolvedId = (businessUnitId || 'HLS').toUpperCase();
  const businessUnit = businessUnits[resolvedId];

  if (!businessUnit) {
    throw new Error(`Business unit "${resolvedId}" is not configured. Add it in config/BusinessUnit.js.`);
  }

  const editableBusinessUnit = editableData.businessUnits[resolvedId] || {};
  const generatedRunData = typeof editableBusinessUnit.createRunData === 'function'
    ? editableBusinessUnit.createRunData()
    : {};
  const urlDetailTabSettings = detailTabSettingsByUrl[businessUnit.urlKey] || {};

  return {
    ...businessUnit,
    ...urlDetailTabSettings,
    ...editableBusinessUnit,
    ...generatedRunData,
  };
}

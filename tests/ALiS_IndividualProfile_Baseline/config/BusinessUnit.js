import { editableData } from './editableData.js';

export const businessUnits = {
  MAMMO: {
    id: 'MAMMO',
    name: 'Mammography, Licensing and Registrations',
    baselineFile: 'Mammo.xlsx',
    urlKey: 'NVRCP',
  },
};

export function resolveBusinessUnit(businessUnitId) {
  const resolvedId = String(businessUnitId || 'MAMMO').trim().toUpperCase();
  const businessUnit = businessUnits[resolvedId];

  if (!businessUnit) {
    throw new Error(`Business unit "${resolvedId}" is not configured. Add it in config/BusinessUnit.js.`);
  }

  const editableBusinessUnit = editableData.businessUnits[resolvedId] || {};
  const generatedRunData = typeof editableBusinessUnit.createRunData === 'function'
    ? editableBusinessUnit.createRunData()
    : {};

  return {
    ...businessUnit,
    ...editableBusinessUnit,
    ...generatedRunData,
  };
}

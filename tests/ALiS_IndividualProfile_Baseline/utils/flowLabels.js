const flowDefinitions = {
  1: {
    label: 'New Profile - Modify',
    description: 'Creates a new individual profile, opens it from Modify, then compares.',
  },
  2: {
    label: 'Existing Profile - Modify',
    description: 'Searches an existing individual profile, opens it from Modify, then compares.',
  },
  3: {
    label: 'New Profile - View',
    description: 'Creates a new individual profile, opens it from View, then compares.',
  },
  4: {
    label: 'Existing Profile - View',
    description: 'Searches an existing individual profile, opens it from View, then compares.',
  },
};

export function getFlowInfo(flow) {
  const key = String(flow);
  return flowDefinitions[key] || {
    label: `Flow ${key}`,
    description: 'Unknown flow.',
  };
}

export function getFlowLabel(flow) {
  return getFlowInfo(flow).label;
}

export function getSupportedFlowText() {
  return Object.values(flowDefinitions)
    .map((flow) => flow.label)
    .join(' or ');
}

export function getAvailableFlows() {
  return Object.entries(flowDefinitions).map(([id, flow]) => ({
    id,
    ...flow,
  }));
}

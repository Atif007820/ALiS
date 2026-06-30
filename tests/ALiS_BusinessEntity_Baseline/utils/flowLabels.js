const flowDefinitions = {
  1: {
    label: 'New Entity - Modify',
    description: 'Creates a new entity, opens it from Modify, then compares.',
  },
  2: {
    label: 'Existing Entity - Modify',
    description: 'Searches an existing entity, opens it from Modify, then compares.',
  },
  3: {
    label: 'New Entity - View',
    description: 'Creates a new entity, opens it from View, then compares.',
  },
  4: {
    label: 'Existing Entity - View',
    description: 'Searches an existing entity, opens it from View, then compares.',
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

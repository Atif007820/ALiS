import { randomUUID } from 'node:crypto';
import { getFollowUpType } from '../config/applicationTypes.js';

export const SERIAL_FLOW_SPECS = [
  'testScripts/01_RegisterUser.spec.js',
  'testScripts/02_LoginApply.spec.js',
  'testScripts/03_ApproveApplication.spec.js',
];

export function buildFlowStages(target, specs, { reuseApplicant = false, existingConveyance = false } = {}) {
  const followUp = getFollowUpType(target.appType);
  if (!followUp) return specs.map(spec => ({ spec, selection: target, phase: '' }));
  const applyAndApprove = SERIAL_FLOW_SPECS.slice(1);
  if (existingConveyance && specs.length === 1 && specs[0] === applyAndApprove[0]) {
    return [{ spec: specs[0], selection: target, phase: followUp.phase }];
  }
  const installationSpecs = reuseApplicant ? applyAndApprove : SERIAL_FLOW_SPECS;
  if (specs.length !== installationSpecs.length || specs.some((spec, index) => spec !== installationSpecs[index])) {
    throw new Error(`Use npm run conv ${followUp.flow} to create an installation and run its ${followUp.phase} flow.`);
  }

  const followUpStages = applyAndApprove.map(spec => ({ spec, selection: target, phase: followUp.phase }));
  if (existingConveyance) return followUpStages;
  if (!target.installation) throw new Error(`New ${followUp.phase} requires an installation target.`);
  return [...specs.map(spec => ({ spec, selection: target.installation, phase: 'installation' })), ...followUpStages];
}

export function flowAxes(args, availableProjects) {
  const projects = [];
  let repeat = 1;
  const remainingArgs = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--project' || arg.startsWith('--project=')) {
      const value = arg === '--project' ? args[++index] : arg.slice('--project='.length);
      const pattern = String(value || '').split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
      const matches = availableProjects.filter(project => new RegExp(`^${pattern}$`, 'i').test(project));
      if (!matches.length) throw new Error(`Unknown project "${value}". Available: ${availableProjects.join(', ')}.`);
      projects.push(...matches);
    } else if (arg === '--repeat-each' || arg.startsWith('--repeat-each=')) {
      const value = arg === '--repeat-each' ? args[++index] : arg.slice('--repeat-each='.length);
      if (!/^\d+$/.test(String(value)) || Number(value) < 1) throw new Error('--repeat-each must be a positive integer.');
      repeat = Number(value);
    } else remainingArgs.push(arg);
  }
  if (!projects.length) throw new Error('At least one Playwright project is required.');
  return { projects: [...new Set(projects)], repeat, remainingArgs };
}

export function expandFlowTargets(targets, axes) {
  return targets.flatMap(target => axes.projects.flatMap(project => Array.from({ length: axes.repeat }, (_, repeatIndex) => ({
    ...target, project, repeatIndex, runId: randomUUID(),
    selectionLabel: target.label,
    slug: `${target.slug}-${project.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-r${repeatIndex + 1}`,
    label: `${target.label} / ${project} / repeat ${repeatIndex + 1}`,
  }))));
}

export function assertApprovalSelection(specs) {
  if (specs.includes(SERIAL_FLOW_SPECS[2]) && !specs.includes(SERIAL_FLOW_SPECS[1])) {
    throw new Error('Standalone approval is no longer supported. Approval needs a transaction captured by Apply in the same run.');
  }
}

export function assertMutationRetries(specs, args) {
  if (!specs.some(spec => [SERIAL_FLOW_SPECS[1], SERIAL_FLOW_SPECS[2]].includes(spec))) return;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--retries' && !args[index].startsWith('--retries=')) continue;
    const value = args[index] === '--retries' ? args[++index] : args[index].slice('--retries='.length);
    if (String(value) !== '0') {
      throw new Error('Apply/approve flows require --retries=0: an uncertain result must not automatically resubmit an application or repeat an approval. Inspect the report before a deliberate rerun.');
    }
  }
}

import { randomUUID } from 'node:crypto';

export const SERIAL_FLOW_SPECS = [
  'testScripts/01_RegisterUser.spec.js',
  'testScripts/02_LoginApply.spec.js',
  'testScripts/03_ApproveApplication.spec.js',
];

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
    matrixSlug: target.slug,
    slug: `${target.slug}-${project.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-r${repeatIndex + 1}`,
    label: `${target.label} / ${project} / repeat ${repeatIndex + 1}`,
  }))));
}

export function assertApprovalSelection(specs, targets, transactionNumber) {
  const includesApproval = specs.includes(SERIAL_FLOW_SPECS[2]);
  if (!includesApproval) {
    if (transactionNumber) throw new Error('A transaction number is only valid when --spec=approve is selected.');
    return;
  }
  if (specs.includes(SERIAL_FLOW_SPECS[1])) {
    if (transactionNumber) throw new Error('An apply/approve flow uses its freshly captured transaction; omit the standalone transaction number.');
  } else {
    if (!transactionNumber) {
      throw new Error('Standalone approval requires TransactionNumber in config/approvalTransacNumber.js; stale saved transactions are never used.');
    }
    if (targets.length !== 1) throw new Error('Standalone approval requires one environment, license type, project and repeat to avoid approving the same transaction more than once.');
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

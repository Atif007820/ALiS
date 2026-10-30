import { spawn } from 'node:child_process';
import { createLaunchPlan, createReportPlan } from './launchPlan.mjs';

const options = Object.fromEntries(process.argv.slice(2).map(value => {
  const separator = value.indexOf('=');
  if (separator < 0 || !value.startsWith('--')) throw new Error(`Invalid launcher option: ${value}`);
  return [value.slice(2, separator), value.slice(separator + 1)];
}));
const supportedOptions = new Set(['framework', 'flow', 'eclipse-mode', 'validate']);
for (const option of Object.keys(options)) {
  if (!supportedOptions.has(option)) throw new Error(`Unsupported launcher option: --${option}`);
}
if (options['eclipse-mode'] && !['run', 'debug'].includes(options['eclipse-mode'])) {
  throw new Error(`Unsupported Eclipse launch mode: ${options['eclipse-mode']}`);
}
const launchEnvironment = { ...process.env };
if (options['eclipse-mode']) launchEnvironment.ALIS_ECLIPSE_MODE = options['eclipse-mode'];
const plan = createLaunchPlan(options.framework, options.flow, launchEnvironment);
console.log(`Eclipse ${plan.debug ? 'Debug' : 'Run'}: ${plan.framework} - ${plan.flow}`);
if (options.validate === 'true') {
  console.log(JSON.stringify({ mode: plan.debug ? 'debug' : 'run', framework: plan.framework,
    flow: plan.flow, program: plan.program, args: plan.args, headed: plan.env.HEADLESS === 'false',
    openCompletedReport: plan.openReportAfterCompletion }, null, 2));
  process.exit(0);
}
const startedAt = Date.now();
const child = spawn(process.execPath, [plan.program, ...plan.args], {
  cwd: plan.cwd, env: plan.env, stdio: 'inherit', shell: false,
});
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', (code, signal) => {
  process.exitCode = code ?? 1;
  if (signal) return;
  const reportPlan = createReportPlan(plan, startedAt, signal);
  if (!reportPlan) {
    console.warn('No HTML report was generated. Check the execution error above.');
    return;
  }
  console.log(`Opening completed report: ${plan.reportDir}`);
  const report = spawn(process.execPath, reportPlan.args, reportPlan.options);
  report.once('error', error => console.warn(`Could not open HTML report: ${error.message}`));
  report.unref();
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

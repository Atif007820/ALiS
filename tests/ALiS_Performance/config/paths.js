import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../src/utils/envLoader.js';

const frameworkRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
loadEnv(path.join(frameworkRoot, '.env'));

const defaultJMeterHome = 'C:/Users/mohd.jamal/Downloads/apache-jmeter-5.6.3';
const defaultScriptRoot = 'C:/Users/mohd.jamal/Downloads/apache-jmeter-5.6.3/TestScripts';

export const paths = {
  frameworkRoot,
  jmeterHome: path.resolve(process.env.JMETER_HOME || defaultJMeterHome),
  jmeterScriptRoot: path.resolve(process.env.JMETER_SCRIPT_ROOT || defaultScriptRoot),
  localJmeterScriptRoot: path.join(frameworkRoot, 'jmeter', 'scripts'),
  resultsRoot: path.resolve(frameworkRoot, process.env.PERF_RESULTS_DIR || 'results')
};

#!/usr/bin/env node
import { listJmxScripts } from '../src/utils/jmxDiscovery.js';
import { paths } from '../config/paths.js';

const scripts = listJmxScripts();

console.log('Available JMeter scripts');
console.log('=======================');
console.log(`Root: ${paths.jmeterScriptRoot}`);
console.log('');

if (scripts.length === 0) {
  console.log('No .jmx files found.');
} else {
  scripts.forEach((script, index) => {
    console.log(`${String(index + 1).padStart(2, '0')}. ${script}`);
  });
}

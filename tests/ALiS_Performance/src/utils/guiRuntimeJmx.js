import fs from 'fs/promises';
import path from 'path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { ensureDir } from './fileUtils.js';

const RESULT_WRITER_NAME = 'Framework GUI Results Writer';

export async function createRuntimeJmx({
  sourcePath,
  outputPath,
  profile = null,
  jtlPath = ''
}) {
  const sourceXml = await fs.readFile(sourcePath, 'utf8');
  const document = new DOMParser().parseFromString(sourceXml, 'application/xml');
  const parserErrors = document.getElementsByTagName('parsererror');
  if (parserErrors.length) {
    throw new Error(`Unable to parse JMeter script: ${sourcePath}`);
  }

  if (profile) {
    applyProfileToThreadGroups(document, profile);
  }

  if (jtlPath) {
    injectResultWriter(document, sourcePath, jtlPath);
  }

  ensureDir(path.dirname(outputPath));
  const serialized = new XMLSerializer().serializeToString(document);
  await fs.writeFile(outputPath, serialized, 'utf8');
  return outputPath;
}

export function createGuiRuntimeJmx(options) {
  return createRuntimeJmx(options);
}

function applyProfileToThreadGroups(document, profile) {
  const threadGroups = Array.from(document.getElementsByTagName('ThreadGroup'));
  if (!threadGroups.length) {
    throw new Error('No standard JMeter ThreadGroup elements were found for the selected load profile.');
  }

  for (const threadGroup of threadGroups) {
    setDirectProperty(document, threadGroup, 'ThreadGroup.num_threads', profile.threads, 'intProp');
    setDirectProperty(document, threadGroup, 'ThreadGroup.ramp_time', profile.rampUp, 'intProp');
    if (profile.duration !== undefined) {
      setDirectProperty(document, threadGroup, 'ThreadGroup.duration', profile.duration, 'longProp');
      setDirectProperty(document, threadGroup, 'ThreadGroup.scheduler', true, 'boolProp');
    }

    const loopProperty = findNamedDescendant(threadGroup, 'LoopController.loops');
    if (profile.loops !== undefined && loopProperty) {
      replaceText(document, loopProperty, profile.loops);
    }
  }
}

function injectResultWriter(document, sourcePath, jtlPath) {
  const testPlan = document.getElementsByTagName('TestPlan').item(0);
  if (!testPlan) {
    throw new Error(`JMeter TestPlan element was not found: ${sourcePath}`);
  }

  const testPlanTree = nextElementSibling(testPlan);
  if (!testPlanTree || testPlanTree.nodeName !== 'hashTree') {
    throw new Error(`JMeter TestPlan hashTree was not found: ${sourcePath}`);
  }

  removeExistingFrameworkWriter(testPlanTree);
  testPlanTree.appendChild(createResultCollector(document, path.resolve(jtlPath)));
  testPlanTree.appendChild(document.createElement('hashTree'));
}

function setDirectProperty(document, parent, name, value, defaultElementName) {
  if (value === undefined) return;
  let propertyElement = Array.from(parent.childNodes)
    .find((child) => child.nodeType === 1 && child.getAttribute?.('name') === name);

  if (!propertyElement) {
    propertyElement = document.createElement(defaultElementName);
    propertyElement.setAttribute('name', name);
    parent.appendChild(propertyElement);
  }
  replaceText(document, propertyElement, value);
}

function findNamedDescendant(parent, name) {
  const candidates = ['stringProp', 'intProp', 'longProp', 'boolProp'];
  for (const elementName of candidates) {
    const elements = Array.from(parent.getElementsByTagName(elementName));
    const match = elements.find((element) => element.getAttribute('name') === name);
    if (match) return match;
  }
  return null;
}

function replaceText(document, element, value) {
  while (element.firstChild) element.removeChild(element.firstChild);
  element.appendChild(document.createTextNode(String(value)));
}

function nextElementSibling(node) {
  let candidate = node.nextSibling;
  while (candidate && candidate.nodeType !== 1) candidate = candidate.nextSibling;
  return candidate;
}

function removeExistingFrameworkWriter(testPlanTree) {
  const children = [...Array.from({ length: testPlanTree.childNodes.length }, (_, index) => testPlanTree.childNodes.item(index))];
  for (const child of children) {
    if (child.nodeType !== 1 || child.nodeName !== 'ResultCollector') continue;
    if (child.getAttribute('testname') !== RESULT_WRITER_NAME) continue;

    const pairedTree = nextElementSibling(child);
    testPlanTree.removeChild(child);
    if (pairedTree?.nodeName === 'hashTree') testPlanTree.removeChild(pairedTree);
  }
}

function createResultCollector(document, jtlPath) {
  const collector = document.createElement('ResultCollector');
  collector.setAttribute('guiclass', 'SimpleDataWriter');
  collector.setAttribute('testclass', 'ResultCollector');
  collector.setAttribute('testname', RESULT_WRITER_NAME);
  collector.setAttribute('enabled', 'true');

  collector.appendChild(property(document, 'boolProp', 'ResultCollector.error_logging', 'false'));

  const objectProperty = document.createElement('objProp');
  const name = document.createElement('name');
  name.appendChild(document.createTextNode('saveConfig'));
  objectProperty.appendChild(name);

  const value = document.createElement('value');
  value.setAttribute('class', 'SampleSaveConfiguration');
  const saveFields = {
    time: true,
    latency: true,
    timestamp: true,
    success: true,
    label: true,
    code: true,
    message: true,
    threadName: true,
    dataType: true,
    encoding: false,
    assertions: true,
    subresults: true,
    responseData: false,
    samplerData: false,
    xml: false,
    fieldNames: true,
    responseHeaders: false,
    requestHeaders: false,
    responseDataOnError: false,
    saveAssertionResultsFailureMessage: true,
    assertionsResultsToSave: 0,
    bytes: true,
    sentBytes: true,
    url: true,
    threadCounts: true,
    idleTime: true,
    connectTime: true
  };

  for (const [field, fieldValue] of Object.entries(saveFields)) {
    const element = document.createElement(field);
    element.appendChild(document.createTextNode(String(fieldValue)));
    value.appendChild(element);
  }
  objectProperty.appendChild(value);
  collector.appendChild(objectProperty);
  collector.appendChild(property(document, 'stringProp', 'filename', jtlPath));
  return collector;
}

function property(document, elementName, name, value) {
  const element = document.createElement(elementName);
  element.setAttribute('name', name);
  element.appendChild(document.createTextNode(value));
  return element;
}

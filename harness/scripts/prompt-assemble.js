#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseYamlSubset } = require('./workflow-doctor');

const ROOT_DIR = path.join(__dirname, '../..');
const FACET_DIRS = {
  persona: 'personas',
  policy: 'policies',
  knowledge: 'knowledge',
  instruction: 'instructions',
  output_contract: 'output-contracts',
};
const USER_SECTION_ORDER = [
  ['knowledge', 'Knowledge'],
  ['task', 'Task'],
  ['instruction', 'Instruction'],
  ['output_contract', 'Output Contract'],
  ['policy', 'Policy'],
];

function parseArgs(argv) {
  const options = {
    root: ROOT_DIR,
    workflow: path.join(ROOT_DIR, 'harness/workflows', 'standard-development.yaml'),
    step: '',
    task: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      options.root = path.resolve(argv[++index] || '');
    } else if (arg === '--workflow') {
      options.workflow = path.resolve(argv[++index] || '');
    } else if (arg === '--step') {
      options.step = argv[++index] || '';
    } else if (arg === '--task') {
      options.task = path.resolve(argv[++index] || '');
    }
  }
  return options;
}

function readWorkflow(filePath) {
  return parseYamlSubset(fs.readFileSync(filePath, 'utf8'));
}

function findStep(workflow, stepName) {
  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  for (const step of steps) {
    if (step.name === stepName) return step;
    if (!Array.isArray(step.parallel)) continue;
    for (const substep of step.parallel) {
      if (substep && typeof substep === 'object' && !Array.isArray(substep) && substep.name === stepName) {
        return substep;
      }
    }
  }
  return null;
}

function readFacet(root, facetType, facetName) {
  const dir = FACET_DIRS[facetType];
  if (!dir) return '';
  const filePath = path.join(root, 'harness/facets', dir, `${facetName}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`missing facet: ${facetType}=${facetName}`);
  }
  return fs.readFileSync(filePath, 'utf8').trim();
}

function readFacetValue(root, facetType, facetValue) {
  const facetNames = Array.isArray(facetValue) ? facetValue : [facetValue];
  return facetNames
    .filter(name => name !== undefined && name !== null && String(name).trim())
    .map(name => readFacet(root, facetType, String(name).trim()))
    .join('\n\n---\n\n');
}

function readTask(taskPath) {
  if (!taskPath) return '';
  if (!fs.existsSync(taskPath)) {
    throw new Error(`missing task file: ${taskPath}`);
  }
  return fs.readFileSync(taskPath, 'utf8').trim();
}

function assemblePrompt(options) {
  const workflow = readWorkflow(options.workflow);
  const stepName = options.step || workflow.initial_step;
  const step = findStep(workflow, stepName);
  if (!step) {
    throw new Error(`unknown step: ${stepName}`);
  }

  const facets = step.facets || {};
  const resolved = {};
  for (const [facetType, facetValue] of Object.entries(facets)) {
    resolved[facetType] = readFacetValue(options.root, facetType, facetValue);
  }
  resolved.task = readTask(options.task);

  const systemPrompt = resolved.persona || '';
  const userSections = [];
  for (const [key, heading] of USER_SECTION_ORDER) {
    const value = resolved[key];
    if (!value) continue;
    userSections.push(`## ${heading}\n${value}`);
  }

  return {
    workflow: workflow.name,
    step: stepName,
    systemPrompt,
    userMessage: userSections.join('\n\n'),
  };
}

function formatPrompt(prompt) {
  return [
    'SYSTEM PROMPT',
    prompt.systemPrompt || '(none)',
    '',
    'USER MESSAGE',
    prompt.userMessage || '(none)',
    '',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  try {
    const prompt = assemblePrompt(parseArgs(argv));
    process.stdout.write(formatPrompt(prompt));
    return 0;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 1;
  }
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  assemblePrompt,
  formatPrompt,
  main,
  parseArgs,
};

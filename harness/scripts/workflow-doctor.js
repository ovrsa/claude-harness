#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '../..');
const DEFAULT_WORKFLOW_DIR = path.join(ROOT_DIR, 'harness/workflows');
const TERMINAL_TARGETS = new Set(['COMPLETE', 'ABORT']);
const VALID_MODES = new Set(['readonly', 'edit', 'full']);
const FACET_DIRS = {
  persona: 'personas',
  policy: 'policies',
  knowledge: 'knowledge',
  instruction: 'instructions',
  output_contract: 'output-contracts',
};
const MODE_RANK = {
  readonly: 0,
  edit: 1,
  full: 2,
};
const AGGREGATE_RULE_PATTERN = /^(all|any)\((.+)\)$/;

function parseScalar(rawValue) {
  const value = String(rawValue || '').trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(part => parseScalar(part.trim()));
  }
  return value.replace(/^['"]|['"]$/g, '');
}

function countIndent(line) {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function parseKeyValue(text) {
  const index = text.indexOf(':');
  if (index === -1) return null;
  const key = text.slice(0, index).trim();
  const rawValue = text.slice(index + 1);
  return {
    key,
    hasValue: rawValue.trim().length > 0,
    value: parseScalar(rawValue),
  };
}

function stripComment(line) {
  const hashIndex = line.indexOf('#');
  if (hashIndex === -1) return line;
  if (hashIndex === 0 || /\s/.test(line[hashIndex - 1])) {
    return line.slice(0, hashIndex);
  }
  return line;
}

function parseYamlSubset(content) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = String(content || '').split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex];
    const withoutComment = stripComment(rawLine).replace(/\s+$/, '');
    if (!withoutComment.trim()) continue;

    const indent = countIndent(withoutComment);
    const text = withoutComment.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].value;
    if (text.startsWith('- ')) {
      if (!Array.isArray(parent)) {
        throw new Error(`list item has non-list parent: ${text}`);
      }

      const itemText = text.slice(2).trim();
      const kv = parseKeyValue(itemText);
      if (kv) {
        const item = {};
        parent.push(item);
        if (kv.hasValue) {
          item[kv.key] = kv.value;
        } else {
          const nested = {};
          item[kv.key] = nested;
          stack.push({ indent, value: nested });
        }
        stack.push({ indent, value: item });
      } else {
        parent.push(parseScalar(itemText));
      }
      continue;
    }

    const kv = parseKeyValue(text);
    if (!kv) {
      throw new Error(`cannot parse line: ${text}`);
    }
    if (Array.isArray(parent)) {
      throw new Error(`mapping has list parent: ${text}`);
    }

    if (kv.hasValue) {
      parent[kv.key] = kv.value;
      continue;
    }

    const nextLine = lines.slice(lineIndex + 1)
      .map(line => stripComment(line).replace(/\s+$/, ''))
      .find(line => line.trim());
    const nested = nextLine && nextLine.trim().startsWith('- ') ? [] : {};
    parent[kv.key] = nested;
    stack.push({ indent, value: nested });
  }

  return root;
}

function getWorkflowRoot(filePath) {
  const relative = path.relative(ROOT_DIR, filePath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return ROOT_DIR;
  }
  return path.dirname(filePath);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function isAggregateCondition(condition) {
  return AGGREGATE_RULE_PATTERN.test(String(condition || '').trim());
}

function facetPath(rootDir, facetType, facetName) {
  const dir = FACET_DIRS[facetType];
  if (!dir) return '';
  return path.join(rootDir, 'harness/facets', dir, `${facetName}.md`);
}

function validateFacetReferences(step, rootDir, error) {
  const facets = step.facets && typeof step.facets === 'object' && !Array.isArray(step.facets)
    ? step.facets
    : {};
  for (const [facetType, facetValue] of Object.entries(facets)) {
    if (!FACET_DIRS[facetType]) {
      error(`unknown facet type in step ${step.name}: ${facetType}`);
      continue;
    }
    for (const facetName of asArray(facetValue)) {
      if (typeof facetName !== 'string' || !facetName.trim()) {
        error(`invalid facet reference in step ${step.name}: ${facetType}`);
        continue;
      }
      if (!fs.existsSync(facetPath(rootDir, facetType, facetName))) {
        error(`missing facet: ${facetType}=${facetName}`);
      }
    }
  }
}

function validateOutputContracts(step, rootDir, error) {
  const contracts = step.output_contracts;
  if (!contracts || typeof contracts !== 'object' || Array.isArray(contracts)) return;
  const reports = contracts.report;
  if (reports === undefined) return;
  if (!Array.isArray(reports)) {
    error(`output_contracts.report must be a list in step: ${step.name}`);
    return;
  }
  for (const report of reports) {
    if (!report || typeof report !== 'object' || Array.isArray(report)) {
      error(`output contract report must be a mapping in step: ${step.name}`);
      continue;
    }
    if (!report.name || typeof report.name !== 'string') {
      error(`output contract report name is required in step: ${step.name}`);
    }
    if (!report.format || typeof report.format !== 'string') {
      error(`output contract format is required in step: ${step.name}`);
      continue;
    }
    const contractPath = facetPath(rootDir, 'output_contract', report.format);
    if (!fs.existsSync(contractPath)) {
      error(`missing output contract: ${report.format}`);
    }
  }
}

function validateRequiredPermissionMode(step, error) {
  if (!step.required_permission_mode) return;
  const requiredMode = String(step.required_permission_mode || '').trim();
  if (!VALID_MODES.has(requiredMode)) {
    error(`invalid required_permission_mode for step ${step.name}: ${requiredMode}`);
    return;
  }
  if (VALID_MODES.has(step.mode) && MODE_RANK[requiredMode] > MODE_RANK[step.mode]) {
    error(`required_permission_mode exceeds step mode for step ${step.name}: ${requiredMode} > ${step.mode}`);
  }
}

function validateStep(step, context) {
  const { error, rootDir, parentName } = context;
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    error(parentName ? `parallel step must be a mapping in step: ${parentName}` : 'step must be a mapping');
    return;
  }
  if (!step.name || typeof step.name !== 'string') {
    error(parentName ? `parallel step name is required in step: ${parentName}` : 'step name is required');
    return;
  }
  if (!VALID_MODES.has(step.mode)) {
    error(`invalid mode for step ${step.name}: ${step.mode || 'missing'}`);
  }
  if (/review/i.test(step.name) && step.mode !== 'readonly') {
    error(`review step must be readonly: ${step.name}`);
  }
  validateRequiredPermissionMode(step, error);
  validateFacetReferences(step, rootDir, error);
  validateOutputContracts(step, rootDir, error);
  if (!Array.isArray(step.rules) || step.rules.length === 0) {
    error(`step must define rules: ${step.name}`);
    return;
  }
  const parallelObjects = Array.isArray(step.parallel)
    ? step.parallel.filter(entry => entry && typeof entry === 'object' && !Array.isArray(entry))
    : [];
  for (const rule of step.rules) {
    if (!rule || typeof rule !== 'object') {
      error(`rule must be a mapping in step: ${step.name}`);
      continue;
    }
    if (!rule.condition || typeof rule.condition !== 'string') {
      error(`rule condition is required in step: ${step.name}`);
    }
    if (!rule.next || typeof rule.next !== 'string') {
      error(`rule next is required in step: ${step.name}`);
    }
    if (isAggregateCondition(rule.condition) && parallelObjects.length === 0) {
      error(`aggregate rule requires parallel substeps in step: ${step.name}`);
    }
  }
  const parallelNames = new Set();
  for (const parallelStep of parallelObjects) {
    if (parallelStep.name) {
      if (parallelNames.has(parallelStep.name)) {
        error(`duplicate parallel step name in step ${step.name}: ${parallelStep.name}`);
      }
      parallelNames.add(parallelStep.name);
    }
    validateStep(parallelStep, { ...context, parentName: step.name });
  }
}

function listWorkflowFiles(targets) {
  if (targets.length > 0) {
    return targets.map(target => path.resolve(target));
  }
  if (!fs.existsSync(DEFAULT_WORKFLOW_DIR)) return [];
  return fs.readdirSync(DEFAULT_WORKFLOW_DIR)
    .filter(file => /\.ya?ml$/i.test(file))
    .sort()
    .map(file => path.join(DEFAULT_WORKFLOW_DIR, file));
}

function validateWorkflow(workflow, filePath) {
  const errors = [];
  const label = path.relative(ROOT_DIR, filePath) || filePath;
  const rootDir = getWorkflowRoot(filePath);

  function error(message) {
    errors.push(`${label}: ${message}`);
  }

  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
    error('workflow must be a mapping');
    return errors;
  }
  if (!workflow.name || typeof workflow.name !== 'string') {
    error('name is required');
  }
  if (!workflow.initial_step || typeof workflow.initial_step !== 'string') {
    error('initial_step is required');
  }
  if (Object.hasOwn(workflow, 'completion_check') && workflow.completion_check !== 'task-finishing') {
    error('completion_check must be task-finishing when present');
  }
  if (!Number.isInteger(workflow.max_steps) || workflow.max_steps < 1 || workflow.max_steps > 50) {
    error('max_steps must be between 1 and 50');
  }
  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    error('steps must contain at least one step');
    return errors;
  }

  const stepNames = new Set();
  for (const step of workflow.steps) {
    if (step && typeof step === 'object' && !Array.isArray(step) && step.name && stepNames.has(step.name)) {
      error(`duplicate step name: ${step.name}`);
    }
    if (step && typeof step === 'object' && !Array.isArray(step) && step.name) {
      stepNames.add(step.name);
    }
    validateStep(step, { error, rootDir, parentName: '' });
  }

  if (workflow.initial_step && !stepNames.has(workflow.initial_step)) {
    error(`initial_step does not exist: ${workflow.initial_step}`);
  }

  for (const step of workflow.steps) {
    if (!step || !Array.isArray(step.rules)) continue;
    for (const rule of step.rules) {
      if (!rule || typeof rule.next !== 'string') continue;
      if (!TERMINAL_TARGETS.has(rule.next) && !stepNames.has(rule.next)) {
        error(`unknown rule target: ${rule.next}`);
      }
    }
  }

  return errors;
}

function validateWorkflowFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const workflow = parseYamlSubset(content);
  return validateWorkflow(workflow, filePath);
}

function main(argv = process.argv.slice(2)) {
  const files = listWorkflowFiles(argv);
  const errors = [];

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) {
      errors.push(`${filePath}: missing workflow file`);
      continue;
    }
    try {
      errors.push(...validateWorkflowFile(filePath));
    } catch (error) {
      errors.push(`${filePath}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    return 1;
  }

  const noun = files.length === 1 ? 'workflow definition' : 'workflow definitions';
  console.log(`Validated ${files.length} ${noun}`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  listWorkflowFiles,
  main,
  parseYamlSubset,
  validateWorkflow,
  validateWorkflowFile,
};

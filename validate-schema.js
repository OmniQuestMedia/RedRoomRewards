#!/usr/bin/env node
/**
 * JSON Schema Validation Script
 * Validates example payloads against the xxx-events.schema.json
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');

// Load schema
const schemaPath = path.join(__dirname, 'docs/contracts/xxx-events.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

// Initialize AJV with strict mode
const ajv = new Ajv({ 
  strict: true,
  allErrors: true,
  verbose: true
});
addFormats(ajv);

// Compile schema
const validate = ajv.compile(schema);

// Examples to validate
const examples = [
  'docs/contracts/examples/token_purchase.json',
  'docs/contracts/examples/membership_purchase.json',
  'docs/contracts/examples/adjustment_cs_award.json',
  'docs/contracts/examples/reversal_chargeback.json'
];

let allValid = true;

console.log('=== JSON Schema Validation ===\n');

examples.forEach(examplePath => {
  const fullPath = path.join(__dirname, examplePath);
  const example = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const valid = validate(example);
  
  const fileName = path.basename(examplePath);
  
  if (valid) {
    console.log(`✅ ${fileName}: VALID`);
  } else {
    console.log(`❌ ${fileName}: INVALID`);
    console.log('Errors:', JSON.stringify(validate.errors, null, 2));
    allValid = false;
  }
});

console.log('\n=== Validation Summary ===');
if (allValid) {
  console.log('✅ All examples are valid!');
  process.exit(0);
} else {
  console.log('❌ Some examples failed validation');
  process.exit(1);
}

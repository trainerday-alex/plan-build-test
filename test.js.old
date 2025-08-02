import { test } from 'node:test';
import assert from 'node:assert';
import { runOrchestrator } from './orchestrator.js';

test('orchestrator completes full cycle with simple requirement', async () => {
  const result = await runOrchestrator('Create a function that adds two numbers');
  
  assert.ok(result.architectResult, 'Architect should produce output');
  assert.ok(result.coderResult, 'Coder should produce output');
  assert.ok(result.testerResult, 'Tester should produce output');
  assert.equal(result.status, 'completed', 'Status should be completed');
});

test('orchestrator handles architect clarification needs', async () => {
  const result = await runOrchestrator('Build a complex system');
  
  // This might trigger questions or might not, depending on the agent's response
  if (result.needsHumanInput) {
    assert.equal(result.status, 'waiting_for_human_input');
    assert.ok(result.questions.length > 0, 'Should have questions');
    assert.ok(!result.coderResult, 'Coder should not run if architect needs input');
    assert.ok(!result.testerResult, 'Tester should not run if architect needs input');
  } else {
    assert.equal(result.status, 'completed');
    assert.ok(result.architectResult);
    assert.ok(result.coderResult);
    assert.ok(result.testerResult);
  }
});

test('orchestrator saves results to file', async () => {
  const result = await runOrchestrator('Create a hello world function');
  
  // Check if results file was created
  const { existsSync } = await import('fs');
  assert.ok(existsSync('orchestrator-results.json'), 'Results file should be created');
});
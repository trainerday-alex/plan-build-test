import { runOrchestrator } from './orchestrator.js';

// Example 1: Simple requirement
console.log('Example 1: Simple requirement');
console.log('='.repeat(50));
await runOrchestrator('Create a utility function to validate email addresses');

// Example 2: Complex requirement that might need clarification
console.log('\n\nExample 2: Complex requirement');
console.log('='.repeat(50));
await runOrchestrator('Build a user authentication system');

// Example 3: Meta example - improve the orchestrator itself
console.log('\n\nExample 3: Meta improvement');
console.log('='.repeat(50));
await runOrchestrator('Add better error handling to the orchestrator.js file to handle API failures gracefully');
#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, appendFileSync, statSync, unlinkSync, rmSync, cpSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(process.cwd(), 'projects');
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(process.cwd(), 'templates');
const AGENTS_DIR = join(process.cwd(), 'agents');

// Utility functions
export function loadTemplate(templateName) {
  const templatePath = join(AGENTS_DIR, `${templateName}.md`);
  try {
    let content = readFileSync(templatePath, 'utf8');
    
    // Strip YAML frontmatter if present (for Basic Memory files)
    if (content.startsWith('---\n')) {
      const endOfFrontmatter = content.indexOf('\n---\n', 4);
      if (endOfFrontmatter !== -1) {
        content = content.substring(endOfFrontmatter + 5).trim();
      }
    }
    
    // Also strip any markdown headers that duplicate the template name
    const lines = content.split('\n');
    if (lines[0].startsWith('# ') && lines[0].toLowerCase().includes(templateName.toLowerCase())) {
      lines.shift(); // Remove the first line
      content = lines.join('\n').trim();
    }
    
    return content;
  } catch (error) {
    console.error(`Warning: Could not load template ${templateName}: ${error.message}`);
    return null;
  }
}

// Enhanced prompts for task-based approach
export const PROMPTS = {
  reviewProject: (projectName, log, requirement, taskLog) => {
    const template = loadTemplate('project-reviewer');
    if (template) {
      return template
        .replace('${projectName}', projectName)
        .replace('${requirement}', requirement)
        .replace('${taskLog}', taskLog || 'No task log yet')
        .replace('${log}', log);
    }
    // Fallback to inline template
    return `STEP 1: REVIEW
First, review the project history and current state.

Project: ${projectName}
Current Requirement: ${requirement}

Task Log (Plan/Build/Test cycles):
${taskLog || 'No task log yet'}

Detailed Log Summary:
${log}

Based on this review, provide:
1) WHAT'S BEEN DONE (completed cycles)
2) CURRENT STATE (working? broken? needs improvement?)
3) NEXT ACTION (what should we plan next?)

Reply with plain text only.`;
  },

  architect: (req) => {
    const template = loadTemplate('architect');
    if (template) {
      return template.replace('${requirement}', req);
    }
    // Fallback to inline template
    return `As a software architect, create a task-based blueprint for: "${req}".

Do NOT use any tools. Provide:

1) RUNTIME REQUIREMENTS
- What needs to run for this to work? (web server, database, etc.)
- How will we test it end-to-end?

2) TASK LIST (numbered, in order)
Each task should be:
- Independently testable
- Have clear success criteria
- Build towards the final goal

Format:
1. Task description (test: how to verify)
2. Task description (test: how to verify)

3) FILE STRUCTURE
List all files needed with their purpose

4) FINAL VALIDATION TEST
Describe the Playwright test that proves everything works

Reply with plain text only.`;
  },
  
  coder: (req, task, allFiles) => {
    const template = loadTemplate('coder');
    if (template) {
      return template
        .replace('${task}', task)
        .replace('${requirement}', req)
        .replace('${allFiles}', allFiles ? `Current project files:\n${allFiles}\n` : '');
    }
    // Fallback to inline template
    return `As a coder, implement this specific task: "${task}"

Original requirement: "${req}"

${allFiles ? `Current project files:\n${allFiles}\n` : ''}

Do NOT use any tools. Provide:
1) Files to create/modify with paths
2) Complete code in markdown blocks
3) How to test this step works

Example format:
**src/index.js**
\`\`\`javascript
// code here
\`\`\`

**Test this step:**
Open index.html in browser and verify form displays

Reply with plain text only.`;
  },
  
  finalTest: (req, projectPath, architectPlan = null, implementationFiles = null) => {
    const template = loadTemplate('tester');
    if (template) {
      let prompt = template.replace('${requirement}', req);
      
      // Add architect's test strategy if available
      if (architectPlan && architectPlan.final_validation) {
        const testStrategy = `\n\nArchitect's Test Strategy:\n${JSON.stringify(architectPlan.final_validation, null, 2)}`;
        prompt = prompt.replace('Create ONE test file', `Create ONE test file based on the architect's strategy.${testStrategy}\n\nCreate ONE test file`);
      }
      
      // Add implementation files so Tester can see what was actually built
      if (implementationFiles) {
        const implSection = `\n\nActual Implementation Files:\n${implementationFiles}\n\nIMPORTANT: Write tests that match the ACTUAL implementation above, not just the requirements.`;
        prompt = prompt.replace('Do NOT use any tools.', implSection + '\n\nDo NOT use any tools.');
      }
      
      return prompt;
    }
    // Fallback to inline template
    return `Create a simple Playwright test for: "${req}"

The web server will be started automatically by Playwright config.

Test BASIC USER-FACING FUNCTIONALITY - what users can DO and SEE.
NO implementation details or internal state checks.

Examples of good tests:
- User fills form and sees success message
- Item appears in list after adding
- Error shows for invalid input

Do NOT use any tools. TEXT-ONLY response.

Provide:
**plan-build-test/test/e2e.test.js**
\`\`\`javascript
// your test code here
\`\`\`

Reply with plain text only.`;
  },
  
  refactorAnalyst: (req, allFiles) => {
    const template = loadTemplate('refactor-analyst');
    if (template) {
      return template
        .replace('${requirement}', req)
        .replace('${allFiles}', allFiles || 'No files found');
    }
    // Fallback to inline template
    return `As a refactor analyst, analyze the existing code for: "${req}"

Current project files:
${allFiles || 'No files found'}

Do NOT use any tools. Provide:

1) CODE QUALITY ASSESSMENT
- What works well (keep these patterns)
- What needs improvement (refactor these)
- Any code smells or anti-patterns

2) REFACTORING TASKS (numbered, in order)
Each task should:
- Target a specific improvement
- Maintain existing functionality
- Be independently testable

Format:
1. Refactor description (what and why)
2. Refactor description (what and why)

3) EXPECTED IMPROVEMENTS
- Performance gains
- Better maintainability
- Cleaner architecture
- Reduced complexity

Reply with plain text only.`;
  }
};

// Project state management
export class ProjectState {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.planBuildTestDir = join(projectPath, 'plan-build-test');
    this.logFile = join(this.planBuildTestDir, 'logs.json');
    this.textLogFile = join(this.planBuildTestDir, 'log.txt');
    this.taskLogFile = join(this.planBuildTestDir, 'task-log.txt');
    this.currentTaskNumber = 0;
    
    // Ensure plan-build-test directory exists
    if (!existsSync(this.planBuildTestDir)) {
      mkdirSync(this.planBuildTestDir, { recursive: true });
    }
    
    // Initialize task counter from existing logs
    if (existsSync(this.logFile)) {
      try {
        const log = JSON.parse(readFileSync(this.logFile, 'utf8'));
        // Find the highest task number from CREATE_TASK entries only
        const createTaskEntries = log.filter(e => e.action === 'CREATE_TASK' && e.taskNumber);
        if (createTaskEntries.length > 0) {
          const maxTaskNumber = Math.max(...createTaskEntries.map(e => e.taskNumber));
          this.currentTaskNumber = maxTaskNumber;
          console.log(`[DEBUG] Loaded task counter: ${this.currentTaskNumber} from ${this.logFile}`);
        }
      } catch (e) {
        // If log file is corrupted, start fresh
        console.log(`[DEBUG] Log file error, starting fresh: ${e.message}`);
        this.currentTaskNumber = 0;
      }
    } else {
      console.log(`[DEBUG] No log file exists at ${this.logFile}, starting at 0`);
    }
  }

  exists() {
    return existsSync(this.projectPath) && existsSync(this.planBuildTestDir);
  }

  // Get all requirements from logs
  getAllRequirements() {
    if (!existsSync(this.logFile)) return [];
    
    try {
      const log = JSON.parse(readFileSync(this.logFile, 'utf8'));
      const requirements = new Set();
      
      // Find all unique requirements from CREATE_TASK entries
      log.forEach(entry => {
        if (entry.action === 'CREATE_TASK' && entry.requirement) {
          requirements.add(entry.requirement);
        }
      });
      
      return Array.from(requirements);
    } catch (e) {
      return [];
    }
  }
  
  // Get tasks for a specific requirement from logs
  getRequirementTasks(requirement) {
    if (!existsSync(this.logFile)) return [];
    
    try {
      const log = JSON.parse(readFileSync(this.logFile, 'utf8'));
      const tasks = [];
      const taskMap = new Map();
      
      // Build task list from logs
      log.forEach(entry => {
        if (entry.action === 'CREATE_TASK' && entry.requirement === requirement) {
          taskMap.set(entry.taskNumber, {
            taskNumber: entry.taskNumber,
            description: entry.description,
            test: entry.testCommand || 'verify manually',
            status: 'pending',
            requirement: requirement
          });
        } else if (entry.action === 'COMPLETE_TASK' && taskMap.has(entry.taskNumber)) {
          taskMap.get(entry.taskNumber).status = 'completed';
        }
      });
      
      return Array.from(taskMap.values()).sort((a, b) => a.taskNumber - b.taskNumber);
    } catch (e) {
      return [];
    }
  }

  getNextTaskNumber() {
    this.currentTaskNumber++;
    return this.currentTaskNumber;
  }

  getCurrentTaskNumber() {
    return this.currentTaskNumber;
  }
  
  // Sync task counter with the highest task number in logs
  syncTaskCounter() {
    if (existsSync(this.logFile)) {
      try {
        const log = JSON.parse(readFileSync(this.logFile, 'utf8'));
        const createTaskEntries = log.filter(e => e.action === 'CREATE_TASK' && e.taskNumber);
        if (createTaskEntries.length > 0) {
          const maxTaskNumber = Math.max(...createTaskEntries.map(e => e.taskNumber));
          this.currentTaskNumber = maxTaskNumber;
          console.log(`[DEBUG] Synced task counter to: ${this.currentTaskNumber}`);
        } else {
          this.currentTaskNumber = 0;
          console.log(`[DEBUG] No CREATE_TASK entries found, reset counter to 0`);
        }
      } catch (e) {
        this.currentTaskNumber = 0;
        console.log(`[DEBUG] Error syncing task counter, reset to 0: ${e.message}`);
      }
    } else {
      this.currentTaskNumber = 0;
      console.log(`[DEBUG] No log file, task counter at 0`);
    }
  }

  appendLog(entry) {
    let log = [];
    if (existsSync(this.logFile)) {
      log = JSON.parse(readFileSync(this.logFile, 'utf8'));
    }
    
    log.push({
      timestamp: new Date().toISOString(),
      taskNumber: this.currentTaskNumber || null,
      ...entry
    });
    
    ensureDir(this.logFile);
    writeFileSync(this.logFile, JSON.stringify(log, null, 2));
  }

  getLog() {
    if (existsSync(this.logFile)) {
      return JSON.parse(readFileSync(this.logFile, 'utf8'));
    }
    return [];
  }

  getLogSummary() {
    const log = this.getLog();
    return log.map(entry => 
      `[${entry.timestamp}] ${entry.action}: ${entry.details}`
    ).join('\n');
  }

  // New method to append to text log file
  appendTextLog(message, includeTimestamp = true) {
    ensureDir(this.textLogFile);
    const timestamp = new Date().toISOString();
    const logEntry = includeTimestamp ? `[${timestamp}] ${message}\n` : `${message}\n`;
    
    if (existsSync(this.textLogFile)) {
      appendFileSync(this.textLogFile, logEntry);
    } else {
      writeFileSync(this.textLogFile, logEntry);
    }
  }

  // Append to task log
  appendTaskLog(cycle, message) {
    ensureDir(this.taskLogFile);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${cycle}: ${message}\n`;
    
    if (existsSync(this.taskLogFile)) {
      appendFileSync(this.taskLogFile, logEntry);
    } else {
      writeFileSync(this.taskLogFile, logEntry);
    }
  }
  
  // Get the last incomplete task index from logs
  getLastIncompleteTask() {
    const log = this.getLog();
    let lastFailedIndex = -1;
    
    // Find the last TASK_FAILED entry
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].action === 'TASK_FAILED') {
        lastFailedIndex = log[i].taskIndex - 1; // Convert to 0-based index
        break;
      }
    }
    
    return lastFailedIndex;
  }
  
  // Set the last incomplete task
  setLastIncompleteTask(taskIndex) {
    // This is already logged via appendLog with TASK_FAILED action
    // No additional storage needed
  }
  
  // Clear the last incomplete task
  clearLastIncompleteTask() {
    // No action needed - completion is tracked via COMPLETE_TASK logs
  }
}

// Create directory if it doesn't exist
export function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export async function callClaude(prompt, role, projectState = null) {
  console.log(`  → Calling ${role}...`);
  if (projectState) {
    projectState.appendTextLog(`Calling ${role}...`);
    projectState.appendTextLog(`Prompt: ${prompt.substring(0, 500)}...`, false);
  }
  
  // Ensure .tmp directory exists
  const tmpDir = join(process.cwd(), '.tmp');
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }
  
  // Clean up old temp files (older than 1 hour)
  try {
    const files = readdirSync(tmpDir);
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    files.forEach(file => {
      if (file.startsWith('.claude-prompt-') && file.endsWith('.txt')) {
        const filePath = join(tmpDir, file);
        const stats = statSync(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          unlinkSync(filePath);
        }
      }
    });
  } catch (e) {
    // Ignore cleanup errors
  }
  
  const tmpFile = join(tmpDir, `.claude-prompt-${Date.now()}.txt`);
  
  try {
    writeFileSync(tmpFile, prompt);
    
    const { stdout, stderr } = await execAsync(`cat "${tmpFile}" | claude -p 2>&1`, {
      timeout: 60000, // 60 seconds timeout
      maxBuffer: 10 * 1024 * 1024
    });
    
    // Clean up temp file
    try { 
      const { unlinkSync } = await import('fs');
      unlinkSync(tmpFile); 
    } catch {}
    
    console.log(`  ← ${role} completed`);
    if (projectState) {
      projectState.appendTextLog(`${role} completed successfully`);
      projectState.appendTextLog(`Response length: ${stdout.length} characters`, false);
    }
    return stdout.trim();
  } catch (error) {
    console.error(`  ❌ ${role} error:`, error.message);
    if (projectState) {
      projectState.appendTextLog(`ERROR: ${role} failed - ${error.message}`);
      projectState.appendTextLog(`Failed prompt saved to: ${tmpFile}`, false);
    }
    
    // Save failed prompt for debugging
    if (process.env.DEBUG) {
      console.error(`  Failed prompt saved to: ${tmpFile}`);
    } else {
      // Clean up temp file even on error
      try { 
        const { unlinkSync } = await import('fs');
        unlinkSync(tmpFile); 
      } catch {}
    }
    
    throw error;
  }
}

// Parse JSON response with fallback to text parsing
export function parseAgentResponse(response, agentType) {
  // Try to extract JSON from the response
  const jsonMatch = response.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  if (jsonMatch) {
    try {
      const json = JSON.parse(jsonMatch[1]);
      if (json.status === 'FAILURE') {
        throw new Error(json.error || 'Agent returned failure status');
      }
      return json;
    } catch (e) {
      console.warn(`Failed to parse JSON from ${agentType}: ${e.message}`);
    }
  }
  
  // Try direct JSON parse
  try {
    const json = JSON.parse(response);
    if (json.status === 'FAILURE') {
      throw new Error(json.error || 'Agent returned failure status');
    }
    return json;
  } catch (e) {
    // Fall back to text parsing
    console.warn(`${agentType} response is not valid JSON, using text parsing`);
    return null;
  }
}

// Extract tasks from architect response
export function parseTasks(architectResponse) {
  // Try JSON parsing first
  const json = parseAgentResponse(architectResponse, 'Architect');
  if (json && json.tasks) {
    return json.tasks.map(task => ({
      description: task.description,
      test: task.test_command || 'verify manually'
    }));
  }
  
  // Fallback to text parsing
  const tasks = [];
  const lines = architectResponse.split('\n');
  let inTaskSection = false;
  
  for (const line of lines) {
    if (line.includes('TASK LIST') || line.includes('REFACTORING TASKS')) {
      inTaskSection = true;
      continue;
    }
    
    if (inTaskSection && line.match(/^\d+\./)) {
      const match = line.match(/^\d+\.\s*(.+?)(?:\s*\(test:\s*(.+?)\))?$/);
      if (match) {
        tasks.push({
          description: match[1].trim(),
          test: match[2] ? match[2].trim() : 'verify manually'
        });
      }
    }
    
    // Stop at next section
    if (inTaskSection && line.match(/^[A-Z\s]+:/) && !line.includes('TASK')) {
      break;
    }
  }
  
  return tasks;
}

// Extract file content from coder responses
export function parseFileContent(response) {
  // Try JSON parsing first
  const json = parseAgentResponse(response, 'Coder');
  if (json && json.files) {
    return json.files.map(file => ({
      path: file.path,
      content: file.content
    }));
  }
  
  // Fallback to text parsing
  const files = [];
  const lines = response.split('\n');
  let currentFile = null;
  let inCodeBlock = false;
  let codeContent = [];
  
  for (const line of lines) {
    // Check for file path patterns
    if (line.match(/^(src\/|test\/|tests\/|lib\/|\.\/)?[\w\-\/]+\.(js|json|md|html|css|jsx|ts|tsx)$/i) || 
        line.match(/^\*\*[\w\-\/]+\.(js|json|md|html|css|jsx|ts|tsx)\*\*/) ||
        line.match(/^#+\s*[\w\-\/]+\.(js|json|md|html|css|jsx|ts|tsx)/)) {
      if (currentFile && codeContent.length > 0) {
        files.push({ path: currentFile, content: codeContent.join('\n') });
      }
      currentFile = line.replace(/[\*#\s]+/g, '').trim();
      codeContent = [];
    }
    
    // Track code blocks
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (!inCodeBlock && currentFile && codeContent.length > 0) {
        files.push({ path: currentFile, content: codeContent.join('\n') });
        currentFile = null;
        codeContent = [];
      }
    } else if (inCodeBlock && currentFile) {
      codeContent.push(line);
    }
  }
  
  // Handle last file
  if (currentFile && codeContent.length > 0) {
    files.push({ path: currentFile, content: codeContent.join('\n') });
  }
  
  return files;
}

// Get list of all project files
export function getAllProjectFiles(projectPath) {
  const files = [];
  
  function scanDir(dir, prefix = '') {
    if (!existsSync(dir)) return;
    
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !['node_modules', '.git', 'plan-build-test'].includes(entry.name)) {
        scanDir(join(dir, entry.name), join(prefix, entry.name));
      } else if (entry.isFile() && !entry.name.startsWith('.')) {
        files.push(join(prefix, entry.name));
      }
    }
  }
  
  scanDir(projectPath);
  return files;
}

// Get all project files with their contents
export function getAllProjectFilesWithContent(projectPath) {
  const files = getAllProjectFiles(projectPath);
  const filesWithContent = [];
  
  for (const file of files) {
    try {
      const fullPath = join(projectPath, file);
      const content = readFileSync(fullPath, 'utf8');
      filesWithContent.push(`\n=== File: ${file} ===\n${content}`);
    } catch (err) {
      // Skip files that can't be read
    }
  }
  
  return filesWithContent;
}

export function cleanupTempFiles() {
  const tmpDir = join(process.cwd(), '.tmp');
  if (!existsSync(tmpDir)) return;
  
  try {
    const files = readdirSync(tmpDir);
    let cleaned = 0;
    
    files.forEach(file => {
      if (file.startsWith('.claude-prompt-') && file.endsWith('.txt')) {
        try {
          unlinkSync(join(tmpDir, file));
          cleaned++;
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} temporary files`);
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Main orchestrator function with command-based flow
 */
export async function runOrchestratorNew(projectName, requirement, commandType = 'create-project', options = {}) {
  if (!projectName || !requirement) {
    console.error('❌ Error: Both project name and requirement are required');
    process.exit(1);
  }

  // Clean up temp files at the start of each run
  cleanupTempFiles();

  const projectPath = join(PROJECTS_DIR, projectName);
  const projectState = new ProjectState(projectPath);
  
  console.log(`\n🚀 Project: ${projectName}`);
  console.log(`📋 Requirement: ${requirement}`);
  console.log(`🎯 Command: ${commandType}`);
  console.log(`📁 Location: ${projectPath}`);
  
  // For create-project, delete existing folder if it exists
  if (commandType === 'create-project' && existsSync(projectPath)) {
    console.log('🗑️  Removing existing project folder...');
    rmSync(projectPath, { recursive: true, force: true });
    console.log('  ✓ Existing project removed\n');
  }
  
  // Initialize logging
  if (!existsSync(projectPath)) {
    mkdirSync(projectPath, { recursive: true });
  }
  
  projectState.appendTextLog(`\n${'='.repeat(80)}`);
  projectState.appendTextLog(`ORCHESTRATOR SESSION STARTED`);
  projectState.appendTextLog(`Project: ${projectName}`);
  projectState.appendTextLog(`Requirement: ${requirement}`);
  projectState.appendTextLog(`Command: ${commandType}`);
  projectState.appendTextLog(`Location: ${projectPath}`);
  projectState.appendTextLog(`${'='.repeat(80)}\n`);

  try {
    let state = {
      tasks: [],
      completedTasks: [],
      status: 'started',
      ...options
    };

    // Execute based on command type
    switch (commandType) {
      case 'create-project':
        await executeCreateProject(projectState, requirement, state);
        break;
        
      case 'task':
        await executeAddTask(projectState, requirement, state);
        break;
        
      case 'add-backlog':
        await executeAddBacklog(projectState, requirement, state);
        break;
        
      case 'process-backlog':
        await executeProcessBacklog(projectState, requirement, state);
        break;
        
      case 'list-backlogs':
        await executeListBacklogs(projectState, requirement, state);
        break;
        
      case 'reset-backlog':
        await executeResetBacklog(projectState, requirement, state);
        break;
        
      case 'fix':
        await executeFix(projectState, requirement, state);
        break;
        
      case 'refactor':
        await executeRefactor(projectState, requirement, state);
        break;
        
      case 'fix-tests':
        await executeFixTests(projectState, requirement, state);
        break;
        
      default:
        console.error(`❌ Unknown command type: ${commandType}`);
        process.exit(1);
    }
    
    // Finish with testing unless we're analyzing test fixes, managing backlogs, or creating a new project
    if (!['fix-tests', 'list-backlogs', 'add-backlog', 'create-project', 'reset-backlog'].includes(commandType)) {
      await runTests(projectState, projectPath, requirement, state);
    }
    
  } catch (error) {
    console.error('❌ Orchestrator error:', error.message);
    projectState.appendTextLog(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Execute create-project command flow
 */
async function executeCreateProject(projectState, requirement, state) {
  console.log('\n📝 Starting new project...\n');
  
  // Copy template files
  await copyTemplateFiles(projectState);
  
  // Initialize git
  await initializeGit(projectState);
  
  // Run Architect to create backlogs
  await runArchitectBacklogs(projectState, requirement, state);
  
  // Don't run any tasks - just show the backlogs
  console.log('\n✅ Project setup complete!');
  console.log('\n📋 To start working on a backlog, use:');
  console.log('   npm run process-backlog');
  console.log('\n📋 To add more backlogs, use:');
  console.log('   npm run backlog <description>');
}

/**
 * Copy files from express-app template
 */
async function copyTemplateFiles(projectState) {
  console.log('📁 Setting up project template...');
  
  const templatePath = join(TEMPLATES_DIR, 'express-app');
  const projectPath = projectState.projectPath;
  
  if (!existsSync(templatePath)) {
    console.log('  ⚠️  Template not found, skipping template copy');
    return;
  }
  
  try {
    // Copy all template files to project directory
    cpSync(templatePath, projectPath, { recursive: true });
    console.log('  ✓ Copied Express app template');
    
    // Update package.json with project name
    const packagePath = join(projectPath, 'package.json');
    if (existsSync(packagePath)) {
      const packageContent = JSON.parse(readFileSync(packagePath, 'utf8'));
      packageContent.name = projectPath.split('/').pop();
      writeFileSync(packagePath, JSON.stringify(packageContent, null, 2));
      console.log('  ✓ Updated package.json with project name');
    }
    
    projectState.appendLog({
      action: 'TEMPLATE_COPIED',
      details: 'Express app template files copied successfully'
    });
    
  } catch (error) {
    console.log(`  ⚠️  Template copy failed: ${error.message}`);
    projectState.appendTextLog(`WARNING: Template copy failed - ${error.message}`);
  }
}

/**
 * Execute task command flow
 */
async function executeAddTask(projectState, requirement, state) {
  console.log('\n📝 Adding new task to existing project...\n');
  
  // Run Architect for new task
  await runArchitect(projectState, requirement, state);
  
  // Run Coder for each task
  await runCoderTasks(projectState, requirement, state);
}

/**
 * Execute fix command flow
 */
async function executeFix(projectState, requirement, state) {
  console.log('\n🔧 Fixing issues in project...\n');
  
  // Check if there's an incomplete task to resume
  const lastIncompleteTask = projectState.getLastIncompleteTask();
  if (lastIncompleteTask >= 0) {
    console.log(`📝 Found incomplete task at index ${lastIncompleteTask + 1}`);
    console.log('🔄 Resuming task execution...\n');
    
    // Load existing tasks from the last architect run
    const log = projectState.getLog();
    const tasks = [];
    const taskNumbers = new Set();
    
    // Reconstruct tasks from CREATE_TASK entries
    log.forEach(entry => {
      if (entry.action === 'CREATE_TASK' && !taskNumbers.has(entry.taskNumber)) {
        tasks.push({
          taskNumber: entry.taskNumber,
          description: entry.description,
          test: entry.testCommand || 'npm test'
        });
        taskNumbers.add(entry.taskNumber);
      }
    });
    
    // Sort tasks by task number
    tasks.sort((a, b) => a.taskNumber - b.taskNumber);
    state.tasks = tasks;
    
    // Resume coder tasks from where we left off
    await runCoderTasks(projectState, requirement, state);
    return;
  }
  
  // Otherwise, run Project Reviewer as normal
  const recommendation = await runProjectReviewer(projectState, requirement, state);
  
  if (recommendation.includes('test')) {
    // Just run tests if that's all we need
    return;
  }
  
  // Otherwise, run Coder to fix issues
  await runCoderFix(projectState, requirement, recommendation, state);
}

/**
 * Execute refactor command flow
 */
async function executeRefactor(projectState, requirement, state) {
  console.log('\n♻️  Refactoring project...\n');
  
  // Run Refactor Analyst
  await runRefactorAnalyst(projectState, requirement, state);
  
  // Run Coder for each refactor task
  await runCoderTasks(projectState, requirement, state);
}

/**
 * Execute fix-tests command flow
 */
async function executeFixTests(projectState, requirement, state) {
  console.log('\n🔍 Running tests to check current status...\n');
  
  let testOutput = '';
  
  // Always run tests to get current status
  console.log('📋 Running tests...');
  
  // Run the tests
  let testFailed = false;
  try {
    const { stdout, stderr } = await execAsync('npm test', { 
      cwd: projectState.projectPath,
      env: { ...process.env, CI: 'true' }
    });
    testOutput = stdout + '\n' + stderr;
    console.log(testOutput); // Show the test output
  } catch (error) {
    // Tests failed, capture the output
    testFailed = true;
    testOutput = error.stdout + '\n' + error.stderr;
    console.log(testOutput); // Show the test output
  }
  
  // Also append to log for future use
  projectState.appendTextLog('\nRunning tests...\n' + testOutput);
  
  console.log('\n📊 Test analysis:\n');
  
  // Check if tests are passing
  const testsArePassing = testOutput.includes(' passed (') && !testOutput.includes(' failed (');
  
  // If no test output detected, the test command might have issues
  if (!testOutput || testOutput.trim().length === 0) {
    console.log('❌ No test output detected. The test command may have failed to run.');
    console.log('   Please check that tests can be run with: npm test\n');
    return;
  }
  
  if (testsArePassing) {
    console.log('✅ All tests are passing! No fixes needed.\n');
    
    // Check if there are too many tests (more than 5)
    const testCountMatch = testOutput.match(/(\d+) passed/);
    const testCount = testCountMatch ? parseInt(testCountMatch[1]) : 0;
    
    if (testCount > 5) {
      console.log(`⚠️  Warning: You have ${testCount} tests. Consider simplifying to 2-3 core functionality tests.`);
      console.log('   Tests should focus on main functionality, not edge cases.\n');
    }
    
    return;
  }
  
  console.log('❌ Tests are failing. Analyzing failures...\n');
  
  // Get all test files from our standard test directory
  const testFiles = [];
  const testDir = join(projectState.projectPath, 'test');
  if (existsSync(testDir)) {
    const files = readdirSync(testDir);
    files.forEach(file => {
      if (file.endsWith('.test.js')) {
        const content = readFileSync(join(testDir, file), 'utf8');
        testFiles.push({ path: join(projectState.projectPath, 'test', file), content });
      }
    });
  }
  
  // Get all implementation files from our standard structure
  const srcFiles = [];
  
  // Get src directory files
  const srcDir = join(projectState.projectPath, 'src');
  if (existsSync(srcDir)) {
    const files = readdirSync(srcDir);
    files.forEach(file => {
      if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css')) {
        const content = readFileSync(join(srcDir, file), 'utf8');
        srcFiles.push({ path: `src/${file}`, content });
      }
    });
  }
  
  // Get server.js from root
  const serverFile = join(projectState.projectPath, 'server.js');
  if (existsSync(serverFile)) {
    const content = readFileSync(serverFile, 'utf8');
    srcFiles.push({ path: 'server.js', content });
  }
  
  // Run Tester to fix the tests
  console.log('🔧 Fixing tests to match implementation...\n');
  
  // Load the tester-fix template
  let fixPrompt;
  const testerFixTemplate = loadTemplate('tester-fix');
  if (testerFixTemplate) {
    fixPrompt = testerFixTemplate
      .replace('${testOutput}', testOutput)
      .replace('${testFiles}', testFiles.map(f => `File: ${f.path}\n${f.content}`).join('\n\n'))
      .replace('${implementationFiles}', srcFiles.map(f => `File: ${f.path}\n${f.content}`).join('\n\n'));
  } else {
    // Fallback prompt
    fixPrompt = `You are the Tester agent. Your task is to fix the failing tests to match the actual implementation.

Test Output showing failures:
${testOutput}

Current Test Files:
${testFiles.map(f => `File: ${f.path}\n${f.content}`).join('\n\n')}

Implementation Files:
${srcFiles.map(f => `File: ${f.path}\n${f.content}`).join('\n\n')}

Analyze the test failures and update the tests to match what the implementation actually does. Do NOT change the implementation - only fix the tests.

CRITICAL: Check if HTML5 validation (type="email", required, etc.) is preventing form submission. If so, the JavaScript validation will never run and you should test for browser validation behavior instead.

Respond with JSON:
{
  "fixed_tests": [
    {
      "file_path": "absolute path to test file",
      "updated_content": "complete updated test file content"
    }
  ],
  "changes_made": [
    "description of change 1",
    "description of change 2"
  ]
}`;
  }
  
  projectState.appendTextLog(`\nFixing failing tests...`);
  projectState.appendTaskLog('FIX', 'Updating tests to match implementation');
  
  let fixResult;
  try {
    fixResult = await callClaude(fixPrompt, 'Tester', projectState);
  } catch (error) {
    console.log('❌ Error calling Claude API:', error.message);
    console.log('\n💡 Falling back to manual analysis...\n');
    
    // Simple fallback: analyze test output and provide recommendations
    console.log('📋 Test failures detected:\n');
    
    // Extract failure information from test output
    const failurePattern = /✘.*?\((.*?)\)/g;
    const failures = [...testOutput.matchAll(failurePattern)];
    
    if (failures.length > 0) {
      console.log('Failed tests:');
      failures.forEach((match, i) => {
        console.log(`  ${i + 1}. ${match[0]}`);
      });
      console.log('\n');
    }
    
    // Analyze common error patterns
    if (testOutput.includes('is already used')) {
      console.log('🔧 Port conflict detected. Solutions:');
      const portMatch = testOutput.match(/localhost:(\d+)/);
      const conflictPort = portMatch ? portMatch[1] : 'PORT';
      console.log(`  1. Kill the process: lsof -ti:${conflictPort} | xargs kill -9`);
      console.log('  2. Or update playwright.config.js: reuseExistingServer: true\n');
    }
    
    if (testOutput.includes('Expected') && (testOutput.includes('Received') || testOutput.includes('to contain'))) {
      console.log('🔧 Assertion mismatch detected. The tests expect different values than what the implementation provides.');
      console.log('  Review the test expectations and update them to match the actual implementation.\n');
    }
    
    if (testOutput.includes('Timed out') && testOutput.includes('waiting for')) {
      console.log('🔧 Timeout detected. The test is waiting for something that never appears.');
      console.log('  Check if the element selector is correct or if the timing needs adjustment.\n');
    }
    
    console.log('📝 To fix tests manually:');
    console.log('  1. Review the test output above');
    console.log('  2. Check what the implementation actually does');
    console.log('  3. Update test expectations to match the implementation');
    console.log('  4. Run npm test again to verify\n');
    
    return;
  }
  
  // Apply the fixes
  try {
    const fixes = parseAgentResponse(fixResult, 'Tester');
    
    if (fixes && fixes.fixed_tests) {
      console.log(`📝 Applying fixes to ${fixes.fixed_tests.length} test file(s)...\n`);
      
      // Write the fixed test files
      fixes.fixed_tests.forEach(fix => {
        writeFileSync(fix.file_path, fix.updated_content);
        console.log(`  ✓ Updated: ${fix.file_path}`);
      });
      
      console.log('\n📋 Changes made:');
      fixes.changes_made.forEach((change, i) => {
        console.log(`  ${i + 1}. ${change}`);
      });
      
      console.log('\n✅ Test fixes applied!');
      
      // Run tests again to verify fixes
      console.log('\n🧪 Running tests to verify fixes...\n');
      
      // Kill any existing server first
      try {
        await execAsync('lsof -ti:3000 | xargs kill -9', { cwd: projectState.projectPath });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch {
        // No server to kill
      }
      
      try {
        const { stdout } = await execAsync('npm test', { 
          cwd: projectState.projectPath,
          env: { ...process.env, CI: 'true' }
        });
        console.log('✅ All tests are now passing!\n');
        console.log(stdout);
      } catch (error) {
        console.log('⚠️  Some tests are still failing:\n');
        console.log(error.stdout || error.message);
        if (error.stderr) console.log(error.stderr);
      }
      
      // Log the fixes
      projectState.appendLog({
        action: 'TESTS_FIXED',
        files_updated: fixes.fixed_tests.length,
        changes: fixes.changes_made
      });
      
      projectState.appendTaskLog('COMPLETE', `Fixed ${fixes.fixed_tests.length} test file(s)`);
      
    } else {
      console.log('❌ Unable to parse fix response. Raw response:');
      console.log(fixResult);
    }
    
  } catch (error) {
    console.log('❌ Error applying fixes:', error.message);
    console.log('Raw response:', fixResult);
  }
}

/**
 * Initialize git repository
 */
async function initializeGit(projectState) {
  const projectPath = projectState.projectPath;
  
  try {
    console.log('🔧 Initializing git repository...');
    
    // Check if git already initialized
    try {
      await execAsync('git status', { cwd: projectPath });
      console.log('  ✓ Git already initialized');
      return;
    } catch {
      // Git not initialized, proceed
    }
    
    // Initialize git
    await execAsync('git init', { cwd: projectPath });
    console.log('  ✓ Initialized git repository');
    
    // Check if .gitignore exists from template, if not create it
    const gitignorePath = join(projectPath, '.gitignore');
    if (!existsSync(gitignorePath)) {
      const gitignoreContent = `node_modules/
dist/
*.log
.DS_Store
.env
plan-build-test/logs.json
plan-build-test/log.txt
plan-build-test/task-log.txt
`;
      writeFileSync(gitignorePath, gitignoreContent);
      console.log('  ✓ Created .gitignore');
    } else {
      console.log('  ✓ Using .gitignore from template');
    }
    
    // Initial commit
    await execAsync('git add -A', { cwd: projectPath });
    await execAsync('git commit -m "Initial commit"', { cwd: projectPath });
    console.log('  ✓ Created initial commit\n');
    
    projectState.appendLog({
      action: 'GIT_INITIALIZED',
      details: 'Created git repo and .gitignore with initial commit'
    });
    
  } catch (error) {
    console.log('  ⚠️  Git init failed (git may not be installed)\n');
    projectState.appendTextLog(`WARNING: Git init failed - ${error.message}`);
  }
}

/**
 * Run Architect to create tasks
 */
async function runArchitect(projectState, requirement, state) {
  console.log('🏗️  Architect designing solution...');
  projectState.appendTextLog(`\nArchitect designing solution...`);
  projectState.appendTaskLog('PLAN', `Creating tasks for: ${requirement}`);
  
  const architectResult = await callClaude(
    PROMPTS.architect(requirement), 
    'Architect', 
    projectState
  );
  
  // Parse tasks and store full architect plan
  const architectPlan = parseAgentResponse(architectResult, 'Architect');
  state.architectPlan = architectPlan; // Store for tester
  
  state.tasks = parseTasks(architectResult);
  console.log(`📋 Found ${state.tasks.length} tasks to implement\n`);
  
  if (state.tasks.length === 0) {
    throw new Error('Architect failed to create any tasks');
  }
  
  // Sync task counter with logs before assigning new task numbers
  projectState.syncTaskCounter();
  
  // Assign task numbers and log each task
  state.tasks.forEach((task, i) => {
    const taskNum = projectState.getNextTaskNumber();
    task.taskNumber = taskNum;
    
    console.log(`   ${i + 1}. ${task.description}`);
    console.log(`      Test: ${task.test}`);
    
    projectState.appendLog({
      action: 'CREATE_TASK',
      taskNumber: taskNum,
      taskIndex: i + 1,
      totalTasks: state.tasks.length,
      description: task.description,
      testCommand: task.test,
      requirement: requirement
    });
  });
  
  console.log('');
  
  projectState.appendLog({
    action: 'ARCHITECT_COMPLETE',
    details: `Created ${state.tasks.length} tasks`,
    tasks: state.tasks
  });
}

/**
 * Run Project Reviewer
 */
async function runProjectReviewer(projectState, requirement, state) {
  console.log('📊 Reviewing project state...');
  
  const logSummary = projectState.getLogSummary();
  let taskLogContent = '';
  
  try {
    if (existsSync(projectState.taskLogFile)) {
      taskLogContent = readFileSync(projectState.taskLogFile, 'utf8');
    }
  } catch {}
  
  projectState.appendTextLog(`\nReviewing project...`);
  projectState.appendTaskLog('PLAN/REVIEW', 'Analyzing current state');
  
  const reviewResult = await callClaude(
    PROMPTS.reviewProject(projectState.projectPath.split('/').pop(), logSummary, requirement, taskLogContent),
    'Project Reviewer',
    projectState
  );
  
  // Parse review JSON
  const reviewJson = parseAgentResponse(reviewResult, 'Project Reviewer');
  if (reviewJson && reviewJson.recommendation) {
    console.log('📊 Project Review:');
    console.log(`  Status: ${reviewJson.project_state.current_status}`);
    console.log(`  Recommendation: ${reviewJson.recommendation.next_action}`);
    console.log(`  Details: ${reviewJson.recommendation.description}\n`);
    
    return reviewJson.recommendation.description;
  }
  
  return reviewResult;
}

/**
 * Run Refactor Analyst
 */
async function runRefactorAnalyst(projectState, requirement, state) {
  console.log('♻️  Analyzing code for refactoring...');
  
  const allFiles = getAllProjectFilesWithContent(projectState.projectPath).join('\n');
  
  projectState.appendTextLog(`\nRefactor Analyst analyzing code...`);
  projectState.appendTaskLog('PLAN', `Refactor analysis: ${requirement}`);
  
  const refactorResult = await callClaude(
    PROMPTS.refactorAnalyst(requirement, allFiles), 
    'Refactor Analyst', 
    projectState
  );
  
  // Parse refactor tasks
  const refactorJson = parseAgentResponse(refactorResult, 'Refactor Analyst');
  if (refactorJson && refactorJson.refactor_tasks) {
    state.tasks = refactorJson.refactor_tasks.map(task => ({
      description: task.description,
      test: task.test_command || 'npm test',
      isRefactor: true
    }));
    
    console.log('📋 Refactor Analysis:');
    console.log(`  Strengths: ${refactorJson.assessment.strengths.length} identified`);
    console.log(`  Issues: ${refactorJson.assessment.weaknesses.length} found`);
    console.log(`  Tasks: ${state.tasks.length} refactoring tasks\n`);
  } else {
    // Fallback to text parsing
    state.tasks = parseTasks(refactorResult);
  }
  
  // Assign task numbers
  projectState.syncTaskCounter();
  state.tasks.forEach((task, i) => {
    const taskNum = projectState.getNextTaskNumber();
    task.taskNumber = taskNum;
    
    projectState.appendLog({
      action: 'CREATE_TASK',
      taskNumber: taskNum,
      taskIndex: i + 1,
      totalTasks: state.tasks.length,
      description: task.description,
      testCommand: task.test,
      taskType: 'refactor',
      requirement: requirement
    });
  });
}

/**
 * Run Coder for all tasks
 */
async function runCoderTasks(projectState, requirement, state) {
  console.log('💻 Implementing tasks...\n');
  
  // Find the first incomplete task based on status
  let startIndex = 0;
  for (let i = 0; i < state.tasks.length; i++) {
    if (state.tasks[i].status === 'completed') {
      startIndex = i + 1;
    } else {
      break;
    }
  }
  
  // If all tasks are complete, nothing to do
  if (startIndex >= state.tasks.length) {
    console.log('✅ All tasks already completed\n');
    return;
  }
  
  if (startIndex > 0) {
    console.log(`📝 Resuming from task ${startIndex + 1} (${state.tasks.length - startIndex} remaining)...\n`);
    projectState.appendTextLog(`\nResuming from task ${startIndex + 1}`);
  }
  
  for (let i = startIndex; i < state.tasks.length; i++) {
    const task = state.tasks[i];
    
    console.log(`\n📝 Task ${task.taskNumber} (${i + 1}/${state.tasks.length}): ${task.description}`);
    projectState.appendTextLog(`\nStarting Task ${task.taskNumber}: ${task.description}`);
    projectState.appendTaskLog('BUILD', `Task ${task.taskNumber}: ${task.description}`);
    
    try {
      // Get all existing files
      const allFiles = getAllProjectFiles(projectState.projectPath)
        .map(f => `File: ${f}\n${readFileSync(join(projectState.projectPath, f), 'utf8')}`)
        .join('\n\n---\n\n');
      
      // Call Coder
      const coderResult = await callClaude(
        PROMPTS.coder(requirement, task.description, allFiles), 
        'Coder',
        projectState
      );
      
      // Parse and create/update files
      const coderJson = parseAgentResponse(coderResult, 'Coder');
      let codeFiles = [];
      
      if (coderJson && coderJson.files) {
        codeFiles = coderJson.files.map(f => ({
          path: f.path,
          content: f.content
        }));
      } else {
        // Fallback to text parsing
        codeFiles = parseFileContent(coderResult);
      }
      
      for (const file of codeFiles) {
        const filePath = join(projectState.projectPath, file.path);
        ensureDir(filePath);
        writeFileSync(filePath, file.content);
        console.log(`  ✓ ${existsSync(filePath) ? 'Updated' : 'Created'}: ${file.path}`);
        projectState.appendTextLog(`  ${existsSync(filePath) ? 'Updated' : 'Created'}: ${file.path}`);
      }
      
      // Mark task complete
      state.completedTasks.push(task.description);
      
      projectState.appendLog({
        action: 'COMPLETE_TASK',
        taskNumber: task.taskNumber,
        taskIndex: i + 1,
        totalTasks: state.tasks.length,
        description: task.description,
        filesModified: codeFiles.map(f => f.path)
      });
      
      console.log(`  ✓ Task ${task.taskNumber} completed`);
      projectState.appendTaskLog('TEST', `Task ${task.taskNumber} ready for testing`);
      
      // Clear last incomplete task on success
      projectState.clearLastIncompleteTask();
      
    } catch (error) {
      // Log task failure
      console.error(`  ❌ Task ${task.taskNumber} failed: ${error.message}`);
      
      projectState.appendLog({
        action: 'TASK_FAILED',
        taskNumber: task.taskNumber,
        taskIndex: i + 1,
        totalTasks: state.tasks.length,
        description: task.description,
        error: error.message
      });
      
      projectState.appendTextLog(`ERROR: Task ${task.taskNumber} failed - ${error.message}`);
      projectState.appendTaskLog('ERROR', `Task ${task.taskNumber} failed: ${error.message}`);
      
      // Store incomplete task info
      projectState.setLastIncompleteTask(i);
      
      // Re-throw to stop execution
      throw error;
    }
  }
  
  console.log('\n✅ All tasks completed!\n');
}

/**
 * Run Coder to fix specific issues
 */
async function runCoderFix(projectState, requirement, recommendation, state) {
  console.log('🔧 Fixing issues...\n');
  
  const allFiles = getAllProjectFiles(projectState.projectPath)
    .map(f => `File: ${f}\n${readFileSync(join(projectState.projectPath, f), 'utf8')}`)
    .join('\n\n---\n\n');
  
  projectState.appendTextLog(`\nFixing issues based on: ${recommendation}`);
  projectState.appendTaskLog('BUILD', `Fixing: ${recommendation}`);
  
  const coderResult = await callClaude(
    PROMPTS.coder(requirement, `Fix this issue: ${recommendation}`, allFiles), 
    'Coder',
    projectState
  );
  
  // Parse and update files
  const coderJson = parseAgentResponse(coderResult, 'Coder');
  let codeFiles = [];
  
  if (coderJson && coderJson.files) {
    codeFiles = coderJson.files.map(f => ({
      path: f.path,
      content: f.content
    }));
  } else {
    codeFiles = parseFileContent(coderResult);
  }
  
  for (const file of codeFiles) {
    const filePath = join(projectState.projectPath, file.path);
    ensureDir(filePath);
    writeFileSync(filePath, file.content);
    console.log(`  ✓ Fixed: ${file.path}`);
    projectState.appendTextLog(`  Fixed: ${file.path}`);
  }
  
  console.log('\n✅ Fixes applied!\n');
}

/**
 * Create and run tests
 */
async function runTests(projectState, projectPath, requirement, state) {
  // Create tests if they don't exist
  const testFile = join(projectPath, 'plan-build-test/test/e2e.test.js');
  
  if (!existsSync(testFile) && state.tasks.length > 0) {
    console.log('🧪 Creating tests...');
    console.log('📋 Tests will verify functionality works correctly');
    console.log('');
    
    projectState.appendTextLog(`\nTester creating validation tests...`);
    
    // Get all implementation files so Tester can see what was built
    const implementationFiles = getAllProjectFilesWithContent(projectPath).join('\n');
    
    const testResult = await callClaude(
      PROMPTS.finalTest(requirement, projectPath, state.architectPlan, implementationFiles), 
      'Tester',
      projectState
    );
    
    // Parse test files
    const testJson = parseAgentResponse(testResult, 'Tester');
    let testFiles = [];
    
    if (testJson && testJson.test_file) {
      testFiles = [{
        path: testJson.test_file.path,
        content: testJson.test_file.content
      }];
      
      // Show test cases
      if (testJson.test_file.test_cases) {
        console.log('  Tests included:');
        testJson.test_file.test_cases.forEach(tc => {
          console.log(`    • ${tc.name}`);
        });
      }
    } else {
      testFiles = parseFileContent(testResult);
    }
    
    // Create test files
    for (const file of testFiles) {
      const filePath = join(projectPath, file.path);
      ensureDir(filePath);
      writeFileSync(filePath, file.content);
      console.log(`  ✓ Created: ${file.path}`);
    }
    
    // Ensure package.json and playwright.config.js exist
    await ensureTestSetup(projectPath, projectState);
  }
  
  // Install dependencies if needed
  if (!existsSync(join(projectPath, 'node_modules'))) {
    console.log('\n📦 Installing dependencies...');
    try {
      await execAsync('npm install', { 
        cwd: projectPath,
        timeout: 120000 
      });
      console.log('  ✓ Dependencies installed');
    } catch (error) {
      console.log('  ⚠️  Failed to install dependencies');
    }
  }
  
  // Run tests
  console.log('\n🧪 Running tests...\n');
  
  // Kill any existing server on port 3000 first
  try {
    await execAsync('lsof -ti:3000 | xargs kill -9', { cwd: projectPath });
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch {
    // No server to kill
  }
  
  let testOutput = '';
  try {
    const { stdout, stderr } = await execAsync('npm test', {
      cwd: projectPath,
      env: { ...process.env, CI: 'true' },
      timeout: 120000
    });
    
    testOutput = stdout + '\n' + stderr;
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    // Log the test output for future use
    projectState.appendTextLog('\nRunning tests...\n' + testOutput);
    
    projectState.appendLog({
      action: 'TESTS_PASSED',
      details: 'All tests passed successfully'
    });
    
    console.log('\n✅ All tests passed!');
    
    // Try to start server
    try {
      console.log('\n🌐 Starting server...');
      const serverProcess = exec('npm start', {
        cwd: projectPath,
        detached: false
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('\n🎉 Project ready!');
      console.log(`  URL: http://localhost:3000`);
      console.log(`  Press Ctrl+C to stop the server\n`);
      
      // Keep process alive
      await new Promise(() => {});
    } catch {
      console.log('\n✅ Project completed successfully!');
    }
    
  } catch (error) {
    // Tests failed, capture the output
    testOutput = (error.stdout || '') + '\n' + (error.stderr || '');
    
    console.error('\n❌ Tests failed!');
    console.log(error.stdout || error.message);
    if (error.stderr) console.error(error.stderr);
    
    // Log the test output for future use (for fix-tests command)
    projectState.appendTextLog('\nRunning tests...\n' + testOutput);
    
    projectState.appendLog({
      action: 'TESTS_FAILED',
      error: error.message,
      output: testOutput
    });
    
    console.log('\n💡 Tip: Run "npm run fix-tests" to automatically fix the failing tests');
    
    process.exit(1);
  }
}

/**
 * Run Architect to create backlogs instead of tasks
 */
async function runArchitectBacklogs(projectState, requirement, state) {
  console.log('🏗️  Architect creating project backlogs...');
  projectState.appendTextLog(`\nArchitect creating backlogs...`);
  projectState.appendTaskLog('PLAN', `Creating backlogs for: ${requirement}`);
  
  const architectResult = await callClaude(
    loadTemplate('architect-backlogs').replace('${requirement}', requirement), 
    'Architect', 
    projectState
  );
  
  // Parse backlogs
  const architectPlan = parseAgentResponse(architectResult, 'Architect');
  if (!architectPlan || architectPlan.status === 'FAILURE') {
    throw new Error(architectPlan?.error || 'Architect failed to create backlogs');
  }
  
  // Save backlogs to file
  const backlogsFile = join(projectState.projectPath, 'backlogs.json');
  const backlogsData = {
    project_summary: architectPlan.project_summary,
    runtime_requirements: architectPlan.runtime_requirements,
    technical_considerations: architectPlan.technical_considerations,
    backlogs: architectPlan.backlogs.map((b, idx) => ({
      ...b,
      id: idx + 1,
      status: 'pending',
      created_at: new Date().toISOString()
    }))
  };
  
  writeFileSync(backlogsFile, JSON.stringify(backlogsData, null, 2));
  console.log(`\n📋 Created ${backlogsData.backlogs.length} backlogs:\n`);
  
  // Display backlogs
  backlogsData.backlogs.forEach(backlog => {
    console.log(`   ${backlog.id}. ${backlog.title} [${backlog.priority}]`);
    console.log(`      ${backlog.description}`);
    console.log(`      Effort: ${backlog.estimated_effort}`);
    if (backlog.dependencies.length > 0) {
      console.log(`      Depends on: ${backlog.dependencies.join(', ')}`);
    }
    console.log('');
  });
  
  projectState.appendLog({
    action: 'BACKLOGS_CREATED',
    details: `Created ${backlogsData.backlogs.length} backlogs`,
    backlogs: backlogsData.backlogs
  });
}

/**
 * Execute add-backlog command
 */
async function executeAddBacklog(projectState, requirement, state) {
  console.log('\n📋 Adding new backlog item...\n');
  
  // Load existing backlogs
  const backlogsFile = join(projectState.projectPath, 'backlogs.json');
  let backlogsData = { backlogs: [] };
  
  if (existsSync(backlogsFile)) {
    backlogsData = JSON.parse(readFileSync(backlogsFile, 'utf8'));
  }
  
  // Extract the backlog description from requirement
  const backlogDescription = requirement.replace(/^Add backlog:\s*/i, '');
  
  // Create simple backlog entry (could enhance with AI later)
  const newBacklog = {
    id: backlogsData.backlogs.length + 1,
    title: backlogDescription.split(' ').slice(0, 4).join(' '),
    description: backlogDescription,
    priority: 'medium',
    estimated_effort: 'medium',
    dependencies: [],
    acceptance_criteria: [],
    status: 'pending',
    created_at: new Date().toISOString()
  };
  
  backlogsData.backlogs.push(newBacklog);
  writeFileSync(backlogsFile, JSON.stringify(backlogsData, null, 2));
  
  console.log('✅ Added new backlog item:');
  console.log(`   ${newBacklog.id}. ${newBacklog.title}`);
  console.log(`      ${newBacklog.description}\n`);
  
  projectState.appendLog({
    action: 'BACKLOG_ADDED',
    backlog: newBacklog
  });
}

/**
 * Execute reset-backlog command
 */
async function executeResetBacklog(projectState, requirement, state) {
  const backlogsFile = join(projectState.projectPath, 'backlogs.json');
  
  if (!existsSync(backlogsFile)) {
    console.log('No backlogs found. Create a project first with npm run create-project');
    return;
  }
  
  const backlogsData = JSON.parse(readFileSync(backlogsFile, 'utf8'));
  const backlogToReset = backlogsData.backlogs.find(b => b.id === parseInt(state.backlogId));
  
  if (!backlogToReset) {
    console.error(`Backlog #${state.backlogId} not found`);
    return;
  }
  
  // Reset status to pending
  backlogToReset.status = 'pending';
  delete backlogToReset.completed_at;
  
  writeFileSync(backlogsFile, JSON.stringify(backlogsData, null, 2));
  
  console.log(`✅ Reset backlog #${backlogToReset.id}: ${backlogToReset.title} to pending status`);
  
  projectState.appendLog({
    action: 'BACKLOG_RESET',
    backlog: backlogToReset
  });
}

/**
 * Execute list-backlogs command
 */
async function executeListBacklogs(projectState, requirement, state) {
  const backlogsFile = join(projectState.projectPath, 'backlogs.json');
  
  if (!existsSync(backlogsFile)) {
    console.log('No backlogs found. Create a project first with npm run create-project');
    return;
  }
  
  const backlogsData = JSON.parse(readFileSync(backlogsFile, 'utf8'));
  
  console.log(`\n📋 Project Backlogs (${backlogsData.backlogs.length} items):\n`);
  
  // Group by status
  const pending = backlogsData.backlogs.filter(b => b.status === 'pending');
  const inProgress = backlogsData.backlogs.filter(b => b.status === 'in_progress');
  const completed = backlogsData.backlogs.filter(b => b.status === 'completed');
  
  if (inProgress.length > 0) {
    console.log('🔄 In Progress:');
    inProgress.forEach(b => {
      console.log(`   ${b.id}. ${b.title} [${b.priority}]`);
    });
    console.log('');
  }
  
  // Show all backlogs with checkboxes
  console.log('All Backlogs:');
  backlogsData.backlogs.forEach(b => {
    const checkbox = b.status === 'completed' ? '✅' : '⬜';
    const statusIndicator = b.status === 'in_progress' ? ' 🔄' : '';
    console.log(`${checkbox} ${b.id}. ${b.title} [${b.priority}]${statusIndicator}`);
    
    if (b.status !== 'completed') {
      console.log(`      ${b.description}`);
      if (b.dependencies.length > 0) {
        const unmetDeps = b.dependencies.filter(dep => 
          !backlogsData.backlogs.find(backlog => backlog.id === dep && backlog.status === 'completed')
        );
        if (unmetDeps.length > 0) {
          console.log(`      ⚠️  Depends on: ${unmetDeps.join(', ')}`);
        }
      }
    }
  });
  console.log('');
  
  console.log('Use "npm run process-backlog [id]" to work on a specific backlog');
}

/**
 * Execute process-backlog command
 */
async function executeProcessBacklog(projectState, requirement, state) {
  const backlogsFile = join(projectState.projectPath, 'backlogs.json');
  
  if (!existsSync(backlogsFile)) {
    console.log('No backlogs found. Create a project first with npm run create-project');
    return;
  }
  
  const backlogsData = JSON.parse(readFileSync(backlogsFile, 'utf8'));
  
  // Determine which backlog to process
  let backlogToProcess = null;
  
  if (state.backlogId) {
    // Specific backlog requested
    backlogToProcess = backlogsData.backlogs.find(b => b.id === parseInt(state.backlogId));
    if (!backlogToProcess) {
      console.error(`Backlog #${state.backlogId} not found`);
      return;
    }
  } else {
    // First check for in-progress backlogs (interrupted work)
    const inProgress = backlogsData.backlogs.filter(b => b.status === 'in_progress');
    if (inProgress.length > 0) {
      backlogToProcess = inProgress[0];
      console.log(`📋 Found interrupted backlog: #${backlogToProcess.id} ${backlogToProcess.title}`);
    } else {
      // Find next available pending backlog (respecting dependencies)
      const pending = backlogsData.backlogs.filter(b => b.status === 'pending');
      const completed = backlogsData.backlogs.filter(b => b.status === 'completed').map(b => b.id);
      
      for (const backlog of pending) {
        // Check if all dependencies are completed
        if (backlog.dependencies.every(dep => completed.includes(dep))) {
          backlogToProcess = backlog;
          break;
        }
      }
      
      if (!backlogToProcess && pending.length > 0) {
        console.log('⚠️  All pending backlogs have unmet dependencies');
        console.log('\nPending backlogs:');
        pending.forEach(b => {
          console.log(`   ${b.id}. ${b.title} - waiting for: ${b.dependencies.join(', ')}`);
        });
        return;
      }
    }
  }
  
  if (!backlogToProcess) {
    console.log('✅ All backlogs completed!');
    return;
  }
  
  console.log(`\n📋 Processing backlog #${backlogToProcess.id}: ${backlogToProcess.title}\n`);
  console.log(`Description: ${backlogToProcess.description}`);
  console.log(`Priority: ${backlogToProcess.priority}`);
  console.log(`Estimated effort: ${backlogToProcess.estimated_effort}\n`);
  
  // Check if we're resuming an interrupted backlog
  let needsArchitect = true;
  if (backlogToProcess.status === 'in_progress') {
    console.log('⚠️  Resuming interrupted backlog...\n');
    
    // Check if we have tasks for this backlog in the logs
    const allTasks = projectState.getRequirementTasks(backlogToProcess.description);
    if (allTasks.length > 0) {
      needsArchitect = false;
      state.tasks = allTasks;
      console.log(`Found ${allTasks.length} existing tasks from previous attempt`);
      
      // Check task completion status
      const completedTasks = allTasks.filter(t => t.status === 'completed');
      const incompleteTasks = allTasks.filter(t => t.status !== 'completed');
      
      if (completedTasks.length > 0 && incompleteTasks.length > 0) {
        // Some tasks done, some not - review and continue
        console.log(`✓ Completed: ${completedTasks.length} tasks`);
        console.log(`⬜ Remaining: ${incompleteTasks.length} tasks\n`);
        
        // Review what's been built so far
        console.log('📊 Reviewing existing code before continuing...');
        const allFiles = getAllProjectFilesWithContent(projectState.projectPath).join('\n');
        const reviewPrompt = `Review the current state of: ${backlogToProcess.description}\n\nCompleted tasks:\n${completedTasks.map(t => `- ${t.description}`).join('\n')}\n\nRemaining tasks:\n${incompleteTasks.map(t => `- ${t.description}`).join('\n')}\n\nCurrent code:\n${allFiles}\n\nProvide a brief assessment: Is the code working so far? Any issues to fix before continuing?`;
        
        try {
          const review = await callClaude(reviewPrompt, 'Code Reviewer', projectState);
          console.log('Review complete. Continuing with remaining tasks...\n');
        } catch (e) {
          console.log('Review skipped. Continuing with remaining tasks...\n');
        }
      } else if (incompleteTasks.length === 0) {
        console.log('⚠️  All tasks appear complete but backlog was interrupted');
        console.log('    Will verify with tests...\n');
      }
    }
  }
  
  // Update status to in_progress
  backlogToProcess.status = 'in_progress';
  writeFileSync(backlogsFile, JSON.stringify(backlogsData, null, 2));
  
  // Run standard architect to break down into tasks (if needed)
  if (needsArchitect) {
    await runArchitect(projectState, backlogToProcess.description, state);
  }
  
  // Run coder for each task
  await runCoderTasks(projectState, backlogToProcess.description, state);
  
  // If successful, mark as completed
  backlogToProcess.status = 'completed';
  backlogToProcess.completed_at = new Date().toISOString();
  writeFileSync(backlogsFile, JSON.stringify(backlogsData, null, 2));
  
  console.log(`\n✅ Backlog #${backlogToProcess.id} completed!`);
  
  projectState.appendLog({
    action: 'BACKLOG_COMPLETED',
    backlog: backlogToProcess
  });
}

/**
 * Ensure test setup files exist
 */
async function ensureTestSetup(projectPath, projectState) {
  // Check for package.json and ensure test scripts
  const packagePath = join(projectPath, 'package.json');
  let packageContent;
  
  if (existsSync(packagePath)) {
    // Read existing package.json
    packageContent = JSON.parse(readFileSync(packagePath, 'utf8'));
    
    // Ensure test scripts exist
    if (!packageContent.scripts) {
      packageContent.scripts = {};
    }
    if (!packageContent.scripts.test) {
      packageContent.scripts.test = "playwright test";
      packageContent.scripts["test:ui"] = "playwright test --ui";
    }
    
    // Ensure playwright is in devDependencies
    if (!packageContent.devDependencies) {
      packageContent.devDependencies = {};
    }
    if (!packageContent.devDependencies["@playwright/test"]) {
      packageContent.devDependencies["@playwright/test"] = "^1.40.0";
    }
    
    // Write back
    writeFileSync(packagePath, JSON.stringify(packageContent, null, 2));
    console.log('  ✓ Updated: package.json (added test scripts)');
  } else {
    // Create new package.json
    packageContent = {
      name: projectPath.split('/').pop(),
      version: "1.0.0",
      type: "module",
      scripts: {
        start: "node server.js",
        test: "playwright test",
        "test:ui": "playwright test --ui"
      },
      devDependencies: {
        "@playwright/test": "^1.40.0"
      },
      dependencies: {
        "express": "^4.18.2"
      }
    };
    writeFileSync(packagePath, JSON.stringify(packageContent, null, 2));
    console.log('  ✓ Created: package.json');
  }
  
  // Check for playwright.config.js
  const playwrightPath = join(projectPath, 'playwright.config.js');
  if (!existsSync(playwrightPath)) {
    const configContent = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000/plan-build-test',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
    stderr: 'pipe',
    stdout: 'pipe',
  },
});`;
    writeFileSync(playwrightPath, configContent);
    console.log('  ✓ Created: playwright.config.js');
  }
}
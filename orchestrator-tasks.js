#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';

const execAsync = promisify(exec);

// Generate project name from requirement
function generateProjectName(requirement) {
  return requirement
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
}

// Create directory if it doesn't exist
function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Enhanced prompts for task-based approach
const PROMPTS = {
  architect: (req) => `As a software architect, create a task-based blueprint for: "${req}".

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

Reply with plain text only.`,
  
  coder: (req, task, allFiles) => `As a coder, implement this specific task: "${task}"

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

Reply with plain text only.`,
  
  finalTest: (req, projectPath) => `Create a Playwright test to validate: "${req}"

The project is at: ${projectPath}

Create a complete Playwright test that:
1) AUTOMATICALLY starts the web server before tests
2) Tests all main functionality
3) AUTOMATICALLY stops the server after tests
4) Can be run with a simple npm command

IMPORTANT: The test must handle server lifecycle:
- Use beforeAll() to start the server
- Use afterAll() to stop the server
- Include proper wait time for server startup

Provide:
**test/e2e.test.js**
\`\`\`javascript
// playwright test with server management
\`\`\`

**Test this step:**
npm test should start server, run tests, and stop server automatically

Reply with plain text only.`
};

async function callClaude(prompt, role) {
  console.log(`  → Calling ${role}...`);
  
  try {
    const tmpFile = `/tmp/claude-prompt-${Date.now()}.txt`;
    writeFileSync(tmpFile, prompt);
    
    const { stdout, stderr } = await execAsync(`cat "${tmpFile}" | claude -p 2>&1`, {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024
    });
    
    const { unlinkSync } = await import('fs');
    try { unlinkSync(tmpFile); } catch {}
    
    console.log(`  ← ${role} completed`);
    return stdout.trim();
  } catch (error) {
    console.error(`  ❌ ${role} error:`, error.message);
    throw error;
  }
}

// Extract tasks from architect response
function parseTasks(architectResponse) {
  const tasks = [];
  const lines = architectResponse.split('\n');
  let inTaskSection = false;
  
  for (const line of lines) {
    if (line.includes('TASK LIST')) {
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
function parseFileContent(response) {
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
function getAllProjectFiles(projectPath) {
  const files = [];
  
  function scanDir(dir, prefix = '') {
    if (!existsSync(dir)) return;
    
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) {
        scanDir(join(dir, entry.name), join(prefix, entry.name));
      } else if (entry.isFile() && !entry.name.startsWith('.')) {
        files.push(join(prefix, entry.name));
      }
    }
  }
  
  scanDir(projectPath);
  return files;
}

export async function runOrchestrator(requirement) {
  const projectName = generateProjectName(requirement);
  const projectPath = join(process.cwd(), 'projects', projectName);
  
  console.log(`\n🚀 Creating project: ${projectName}`);
  console.log(`📁 Location: ${projectPath}\n`);
  
  const results = {
    requirement,
    projectName,
    projectPath,
    architectResult: null,
    tasks: [],
    taskResults: [],
    filesCreated: [],
    finalTestResult: null,
    status: 'started'
  };

  try {
    // Create project directory
    mkdirSync(projectPath, { recursive: true });
    
    // Step 1: Architect creates task list
    console.log('🏗️  Architect designing task-based solution...');
    results.architectResult = await callClaude(PROMPTS.architect(requirement), 'Architect');
    
    // Parse tasks from architect response
    results.tasks = parseTasks(results.architectResult);
    console.log(`📋 Found ${results.tasks.length} tasks to implement\n`);
    
    // Step 2: Execute each task
    for (let i = 0; i < results.tasks.length; i++) {
      const task = results.tasks[i];
      console.log(`\n📌 Task ${i + 1}/${results.tasks.length}: ${task.description}`);
      console.log(`   Test: ${task.test}`);
      
      // Get current project state
      const allFiles = getAllProjectFiles(projectPath).join('\n');
      
      // Coder implements the task
      console.log('💻 Coder implementing task...');
      const coderResult = await callClaude(
        PROMPTS.coder(requirement, task.description, allFiles), 
        'Coder'
      );
      
      // Parse and create/update files
      const codeFiles = parseFileContent(coderResult);
      for (const file of codeFiles) {
        const filePath = join(projectPath, file.path);
        ensureDir(filePath);
        writeFileSync(filePath, file.content);
        if (!results.filesCreated.includes(file.path)) {
          results.filesCreated.push(file.path);
        }
        console.log(`  ✓ ${existsSync(filePath) ? 'Updated' : 'Created'}: ${file.path}`);
      }
      
      results.taskResults.push({
        task: task.description,
        result: coderResult,
        files: codeFiles.map(f => f.path)
      });
      
      console.log(`  ✓ Task ${i + 1} completed`);
    }
    
    // Step 3: Create final Playwright test
    console.log('\n🧪 Creating final validation test...');
    results.finalTestResult = await callClaude(
      PROMPTS.finalTest(requirement, projectPath), 
      'Tester'
    );
    
    // Create test file
    const testFiles = parseFileContent(results.finalTestResult);
    for (const file of testFiles) {
      const filePath = join(projectPath, file.path);
      ensureDir(filePath);
      writeFileSync(filePath, file.content);
      results.filesCreated.push(file.path);
      console.log(`  ✓ Created: ${file.path}`);
    }
    
    // Create package.json with necessary dependencies
    const packageJson = {
      name: projectName,
      version: "1.0.0",
      description: requirement,
      main: "src/index.js",
      scripts: {
        test: "playwright test",
        "test:ui": "playwright test --ui",
        "test:headed": "playwright test --headed",
        start: "node server.js",
        dev: "node server.js",
        serve: "http-server src -p 3000"
      },
      devDependencies: {
        "@playwright/test": "^1.40.0",
        "playwright": "^1.40.0",
        "http-server": "^14.1.1"
      },
      dependencies: {
        "express": "^4.18.0"
      }
    };
    
    writeFileSync(
      join(projectPath, 'package.json'), 
      JSON.stringify(packageJson, null, 2)
    );
    
    // Create Playwright config
    const playwrightConfig = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'npm run serve',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});`;
    
    writeFileSync(join(projectPath, 'playwright.config.js'), playwrightConfig);
    console.log(`  ✓ Created: playwright.config.js`);
    
    // Create basic server if mentioned in tasks
    if (results.architectResult.toLowerCase().includes('web server') || 
        results.architectResult.toLowerCase().includes('localhost')) {
      const serverCode = `const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from src directory
app.use(express.static(path.join(__dirname, 'src')));

// Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
});

app.listen(PORT, () => {
  console.log(\`Server running at http://localhost:\${PORT}\`);
});`;
      
      writeFileSync(join(projectPath, 'server.js'), serverCode);
      console.log(`  ✓ Created: server.js`);
    }
    
    results.status = 'completed';
    
    // Save orchestrator results
    writeFileSync(
      join(projectPath, 'orchestrator-results.json'), 
      JSON.stringify(results, null, 2)
    );
    
    console.log(`\n✅ Project created successfully!`);
    console.log(`📂 Files created: ${results.filesCreated.length}`);
    console.log(`📋 Tasks completed: ${results.taskResults.length}`);
    console.log(`\nNext steps:`);
    console.log(`  cd ${projectPath}`);
    console.log(`  npm install`);
    console.log(`  npm start`);
    console.log(`  npm test\n`);
    
  } catch (error) {
    results.status = 'error';
    results.error = error.message;
    console.error(`\n❌ Error: ${error.message}`);
  }

  return results;
}

// Run if called directly
if (process.argv[2]) {
  const requirement = process.argv.slice(2).join(' ');
  runOrchestrator(requirement);
}
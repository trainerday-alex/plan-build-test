#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync } from 'fs';
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

// Parse code blocks from response
function extractCodeBlocks(text) {
  const blocks = [];
  const regex = /```(?:javascript|js|json)?\n([\s\S]*?)```/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }
  
  return blocks;
}

// Enhanced prompts that ask for file creation
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

Example:
1. Create static HTML login form (test: form displays in browser)
2. Add client-side validation (test: shows error for invalid email)
3. Add authentication logic (test: correct credentials show success)
4. Setup local web server (test: page loads at localhost:3000)
5. Add Playwright test (test: automated login flow passes)

3) FILE STRUCTURE
List all files needed with their purpose

4) FINAL VALIDATION TEST
Describe the Playwright test that proves everything works

Reply with plain text only.`,
  
  coder: (req, task, previousCode) => `As a coder, implement this specific task: "${task}"

Original requirement: "${req}"

${previousCode ? `Previous code:\n${previousCode}\n` : ''}

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
  
  tester: (req, code) => `As a tester, provide TEXT-ONLY test files for: "${req}"

Implementation:
${code}

Do NOT use any tools. Provide:
1) Test file paths (e.g., test/index.test.js)
2) Complete test code in markdown code blocks
3) Any package.json updates needed

Reply with plain text and code blocks only.`
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

// Extract file content from coder/tester responses
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
    coderResult: null,
    testerResult: null,
    filesCreated: [],
    status: 'started'
  };

  try {
    // Create project directory
    mkdirSync(projectPath, { recursive: true });
    
    // Step 1: Architect
    console.log('🏗️  Architect designing...');
    results.architectResult = await callClaude(PROMPTS.architect(requirement), 'Architect');
    
    // Step 2: Coder
    console.log('💻 Coder implementing...');
    results.coderResult = await callClaude(
      PROMPTS.coder(requirement, results.architectResult), 
      'Coder'
    );
    
    // Parse and create code files
    const codeFiles = parseFileContent(results.coderResult);
    for (const file of codeFiles) {
      const filePath = join(projectPath, file.path);
      ensureDir(filePath);
      writeFileSync(filePath, file.content);
      results.filesCreated.push(file.path);
      console.log(`  ✓ Created: ${file.path}`);
    }
    
    // Step 3: Tester
    console.log('🧪 Tester writing tests...');
    results.testerResult = await callClaude(
      PROMPTS.tester(requirement, results.coderResult), 
      'Tester'
    );
    
    // Parse and create test files
    const testFiles = parseFileContent(results.testerResult);
    for (const file of testFiles) {
      const filePath = join(projectPath, file.path);
      ensureDir(filePath);
      writeFileSync(filePath, file.content);
      results.filesCreated.push(file.path);
      console.log(`  ✓ Created: ${file.path}`);
    }
    
    // Create package.json if mentioned
    if (!existsSync(join(projectPath, 'package.json'))) {
      const packageJson = {
        name: projectName,
        version: "1.0.0",
        description: requirement,
        main: "src/index.js",
        scripts: {
          test: "jest",
          start: "node src/index.js"
        },
        type: "module"
      };
      writeFileSync(
        join(projectPath, 'package.json'), 
        JSON.stringify(packageJson, null, 2)
      );
      results.filesCreated.push('package.json');
      console.log(`  ✓ Created: package.json`);
    }
    
    results.status = 'completed';
    
    // Save orchestrator results
    writeFileSync(
      join(projectPath, 'orchestrator-results.json'), 
      JSON.stringify(results, null, 2)
    );
    
    console.log(`\n✅ Project created successfully!`);
    console.log(`📂 Files created: ${results.filesCreated.length}`);
    console.log(`\nNext steps:`);
    console.log(`  cd ${projectPath}`);
    console.log(`  npm install`);
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
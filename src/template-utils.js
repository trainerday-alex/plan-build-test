import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { AGENTS_DIR, TEMPLATES_DIR } from './config.js';
import { copyDirectory } from './file-utils.js';
import { logWarning } from './console-utils.js';

/**
 * Load a template file from the agents directory
 */
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
    logWarning(`Could not load template ${templateName}: ${error.message}`);
    return null;
  }
}

/**
 * Process template with variable replacements
 */
export function processTemplate(template, variables) {
  let processed = template;
  
  // Replace variables in the format ${variableName}
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\$\\{${key}\\}`, 'g');
    processed = processed.replace(pattern, value);
  }
  
  return processed;
}

/**
 * Load and process a template with variables
 */
export function loadAndProcessTemplate(templateName, variables) {
  const template = loadTemplate(templateName);
  if (!template) {
    return null;
  }
  
  return processTemplate(template, variables);
}

/**
 * Copy project template files
 */
export function copyProjectTemplate(templateName, destinationPath) {
  const templatePath = join(TEMPLATES_DIR, templateName);
  
  if (!existsSync(templatePath)) {
    logWarning(`Template "${templateName}" not found`);
    return false;
  }
  
  try {
    copyDirectory(templatePath, destinationPath);
    return true;
  } catch (error) {
    logWarning(`Failed to copy template: ${error.message}`);
    return false;
  }
}

/**
 * Get inline template (fallback when template file not found)
 */
export function getInlineTemplate(templateType, variables = {}) {
  const templates = {
    'project-reviewer': `STEP 1: REVIEW
First, review the project history and current state.

Project: ${variables.projectName || ''}
Current Requirement: ${variables.requirement || ''}

Task Log (Plan/Build/Test cycles):
${variables.taskLog || 'No task log yet'}

Detailed Log Summary:
${variables.log || ''}

Based on this review, provide:
1) WHAT'S BEEN DONE (completed cycles)
2) CURRENT STATE (working? broken? needs improvement?)
3) NEXT ACTION (what should we plan next?)

Reply with plain text only.`,

    'architect': `As a software architect, create a task-based blueprint for: "${variables.requirement || ''}".

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

    'coder': `As a coder, implement this specific task: "${variables.task || ''}"

Original requirement: "${variables.requirement || ''}"

${variables.allFiles ? `Current project files:\n${variables.allFiles}\n` : ''}

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

    'tester': `Create a simple Playwright test for: "${variables.requirement || ''}"

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

Reply with plain text only.`,

    'refactor-analyst': `As a refactor analyst, analyze the existing code for: "${variables.requirement || ''}"

Current project files:
${variables.allFiles || 'No files found'}

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

Reply with plain text only.`
  };
  
  return templates[templateType] || null;
}

/**
 * Create prompts object with template loading
 */
export function createPrompts() {
  return {
    reviewProject: (projectName, log, requirement, taskLog) => {
      return loadAndProcessTemplate('project-reviewer', {
        projectName,
        requirement,
        taskLog: taskLog || 'No task log yet',
        log
      }) || getInlineTemplate('project-reviewer', { projectName, requirement, taskLog, log });
    },
    
    architect: (req) => {
      return loadAndProcessTemplate('architect', { requirement: req }) 
        || getInlineTemplate('architect', { requirement: req });
    },
    
    coder: (req, task, allFiles) => {
      return loadAndProcessTemplate('coder', {
        task,
        requirement: req,
        allFiles: allFiles ? `Current project files:\n${allFiles}\n` : ''
      }) || getInlineTemplate('coder', { requirement: req, task, allFiles });
    },
    
    finalTest: (req, projectPath, architectPlan = null, implementationFiles = null) => {
      let template = loadTemplate('tester') || getInlineTemplate('tester', { requirement: req });
      
      if (architectPlan && architectPlan.final_validation) {
        const testStrategy = `\n\nArchitect's Test Strategy:\n${JSON.stringify(architectPlan.final_validation, null, 2)}`;
        template = template.replace('Create ONE test file', `Create ONE test file based on the architect's strategy.${testStrategy}\n\nCreate ONE test file`);
      }
      
      if (implementationFiles) {
        const implSection = `\n\nActual Implementation Files:\n${implementationFiles}\n\nIMPORTANT: Write tests that match the ACTUAL implementation above, not just the requirements.`;
        template = template.replace('Do NOT use any tools.', implSection + '\n\nDo NOT use any tools.');
      }
      
      return processTemplate(template, { requirement: req });
    },
    
    refactorAnalyst: (req, allFiles) => {
      return loadAndProcessTemplate('refactor-analyst', {
        requirement: req,
        allFiles: allFiles || 'No files found'
      }) || getInlineTemplate('refactor-analyst', { requirement: req, allFiles });
    }
  };
}
---
title: Agent Output Requirements
type: note
permalink: projects/plan-build-test/agent-output-requirements
---

# Agent Output Requirements

Each agent in the Plan-Build-Test Loop has specific output requirements that the orchestrator expects. Here's what each agent must provide:

## 1. Architect Agent

**Purpose**: Create a task-based blueprint from business requirements

**Required Output Format**:
```
## 1) RUNTIME REQUIREMENTS
- List of what needs to run (web server, database, etc.)
- How to test end-to-end

## 2) TASK LIST (numbered, in order)
1. Task description (test: how to verify)
2. Task description (test: how to verify)
...

## 3) FILE STRUCTURE
- List of all files with their purpose

## 4) FINAL VALIDATION TEST
- Description of Playwright test that proves everything works

## SUCCESS CRITERIA
Each task must specify:
- Exact command to test it works (e.g., "npm test", "curl localhost:3000/api/health")
- What the expected output should be

## STATUS
If all sections completed: "STATUS: SUCCESS"
If anything unclear: "STATUS: FAILURE - [specific issue]"
```

**Key Requirements**:
- Tasks must be numbered and ordered
- Each task must include test criteria in format: `(test: how to verify)`
- Must include SUCCESS CRITERIA with exact test commands
- Must end with STATUS: SUCCESS or STATUS: FAILURE
- Must be plain text only
- No tool usage

## 2. Coder Agent

**Purpose**: Implement specific tasks with complete code

**Required Output Format**:
```
**CODE STANDARDS:**
- Small functions (< 20 lines)
- No code duplication
- Plain JavaScript/Node.js with Express
- Handle errors with try/catch
- Add basic input validation

## 1) Files to create/modify with paths

## 2) Complete code in markdown blocks

**path/to/file.js**
```javascript
// complete code here
```

## 3) How to test this step works

## STATUS
If all sections completed: "STATUS: SUCCESS"
If anything unclear: "STATUS: FAILURE - [specific issue]"
```

**Key Requirements**:
- Must follow CODE STANDARDS (small functions, error handling, validation)
- Must provide complete, working code (not snippets)
- File paths must be clearly marked with `**path/to/file**`
- Code must be in proper markdown code blocks with language specified
- Must include test instructions for the specific step
- Must end with STATUS: SUCCESS or STATUS: FAILURE
- Plain text only, no tool usage

## 3. Tester Agent

**Purpose**: Create Playwright tests for the requirement

**Required Output Format**:
```
**test/e2e.test.js**
```javascript
// Playwright test code
```

## STATUS
If all sections completed: "STATUS: SUCCESS"
If anything unclear: "STATUS: FAILURE - [specific issue]"
```

**Key Requirements**:
- Must create test file at `test/e2e.test.js`
- Test must validate main functionality AND error cases
- Must include at least one test for error handling
- Focus on core requirement
- Keep it simple
- Complete, runnable Playwright test code
- Must end with STATUS: SUCCESS or STATUS: FAILURE
- Plain text only

## 4. Refactor Analyst

**Purpose**: Analyze code quality and plan improvements

**Required Output Format**:
```
## 1) CODE QUALITY ASSESSMENT
- What works well (keep these patterns)
- What needs improvement (refactor these)
- Any code smells or anti-patterns

## 2) REFACTORING TASKS (numbered, in order)
1. Refactor description (what and why)
2. Refactor description (what and why)

## 3) EXPECTED IMPROVEMENTS
- Performance gains
- Better maintainability
- Cleaner architecture
- Reduced complexity
```

**Key Requirements**:
- Must provide numbered refactoring tasks
- Each task should maintain existing functionality
- Tasks should be independently testable
- Plain text only

## 5. Project Reviewer

**Purpose**: Review project state and plan next action

**Required Output Format**:
```
1) WHAT'S BEEN DONE (completed cycles)
2) CURRENT STATE (working? broken? needs improvement?)
3) NEXT ACTION (what should we plan next?)
```

**Key Requirements**:
- Must analyze provided logs and task history
- Clear assessment of current state
- Specific recommendation for next action
- Plain text only

## Common Requirements for All Agents

1. **No Tool Usage**: All agents must provide TEXT-ONLY responses
2. **Plain Text**: Reply with plain text only (markdown formatting allowed)
3. **Complete Output**: Provide all required sections
4. **Concrete Over Abstract**: Be specific, avoid vague descriptions
5. **Testable Results**: Everything should be verifiable

## Template Variables

Each agent receives these variables:
- `${requirement}` - The user's requirement/description
- `${task}` - The specific task (for Coder)
- `${allFiles}` - Current project files (for Coder/Refactor)
- `${projectName}` - Project name (for Reviewer)
- `${taskLog}` - Task history (for Reviewer)
- `${log}` - Detailed logs (for Reviewer)

## Fallback Behavior

If templates are missing from the configured AGENTS_PATH, the orchestrator has inline fallback templates that provide the same functionality. This ensures the system continues working even if external templates are unavailable.
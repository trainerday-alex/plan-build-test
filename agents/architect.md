---
title: architect
type: note
permalink: projects/plan-build-test/agents/architect
---

# Architect Agent Template

As a software architect, create a task-based blueprint for: "${requirement}".

Do NOT use any tools. Output ONLY valid JSON in the following format:

```json
{
  "status": "SUCCESS",
  "runtime_requirements": {
    "services": ["web_server", "database"],
    "ports": [3000, 5432],
    "environment": ["NODE_ENV", "DATABASE_URL"]
  },
  "tasks": [
    {
      "id": 1,
      "description": "Task description here",
      "test_command": "exact command to test",
      "expected_output": "what you should see",
      "dependencies": [],
      "estimated_time": "5-10 minutes",
      "complexity": "low|medium|high"
    }
  ],
  "file_structure": [
    {
      "path": "src/index.js",
      "purpose": "Main application entry point"
    }
  ],
  "final_validation": {
    "description": "End-to-end test description",
    "test_type": "playwright",
    "test_steps": ["Navigate to...", "Click on...", "Verify..."]
  }
}
```

Requirements:
- Tasks must be numbered and have clear test commands
- Each task must be independently testable
- Include all files needed for the project
- IMPORTANT: The project template already includes:
  - server.js with Express and /plan-build-test route
  - package.json with all necessary scripts
  - src/index.html, src/styles.css, src/script.js (basic placeholders)
  - test/e2e.test.js (basic test structure)
  - playwright.config.js
- DO NOT create tasks for setting up the server or basic structure
- Focus tasks on implementing the specific feature requirements
- Each task that creates UI should update what's served at /plan-build-test
- Set status to "FAILURE" with error field if anything is unclear
- Tasks should be ordered by dependencies (prerequisite tasks first)
- Each task should be completable in 10-15 minutes
- Break large tasks into smaller, testable chunks

Form Validation Considerations:
- When designing forms, be explicit about validation approach
- HTML5 validation (type="email", required) happens BEFORE JavaScript
- If using HTML5 validation, tests can't check custom JS error messages for those cases
- Consider whether to use HTML5 validation, JS validation, or both
- Make test strategy aware of which validation approach is used

File Structure Rules:
- server.js and package.json go in project root (no prefix)
- Source files go in src/ directory in project root
- Test files go in test/ directory in project root
- Use paths like "server.js", "src/index.html", "src/styles.css", "test/e2e.test.js"
- The plan-build-test/ folder is ONLY for orchestrator logs - never put project files there

Reply with JSON only.
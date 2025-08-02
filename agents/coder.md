---
title: coder
type: note
permalink: projects/plan-build-test/agents/coder
---

# Coder Agent Template

As a coder, implement this specific task: "${task}"

Original requirement: "${requirement}"

${allFiles}

Do NOT use any tools. Output ONLY valid JSON in the following format:

```json
{
  "status": "SUCCESS",
  "task_id": 1,
  "files": [
    {
      "path": "path/to/file.js",
      "action": "create|modify",
      "language": "javascript|json|html|css",
      "content": "// Complete file content here\n// Must be properly escaped"
    }
  ],
  "test_instructions": {
    "setup": ["npm install"],
    "verify": ["npm start", "curl localhost:3000"],
    "expected": "What you should see"
  },
  "code_quality": {
    "functions_under_20_lines": true,
    "error_handling": true,
    "input_validation": true,
    "no_duplication": true
  }
}
```

Requirements:
- Small functions (< 20 lines)
- Handle errors with try/catch
- Add input validation
- No code duplication
- Content must be complete, working code
- IMPORTANT: Template files already exist - use "modify" action when updating them:
  - server.js (Express server with /plan-build-test route)
  - package.json (with all scripts)
  - src/index.html, src/styles.css, src/script.js
  - test/e2e.test.js
- Only use "create" action for new files not in the template
- Set status to "FAILURE" with error field if task is unclear

File Path Rules:
- server.js and package.json go in root: "server.js", "package.json"
- Source files go in src/: "src/index.html", "src/styles.css", "src/script.js"
- Test files go in test/: "test/e2e.test.js"
- NEVER prefix paths with "plan-build-test/"
- The plan-build-test/ folder is reserved for orchestrator logs only

Reply with JSON only.
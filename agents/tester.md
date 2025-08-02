---
title: tester
type: note
permalink: projects/plan-build-test/agents/tester
---

# Tester Agent Template

Create a simple Playwright test for: "${requirement}"

The web server will be started automatically by Playwright config.
Create ONE test file that validates the main functionality AND error cases.

Do NOT use any tools. Output ONLY valid JSON in the following format:

```json
{
  "status": "SUCCESS",
  "test_file": {
    "path": "test/e2e.test.js",
    "language": "javascript",
    "content": "// Complete Playwright test code here\n// Must include error cases",
    "test_cases": [
      {
        "name": "Test case description",
        "type": "happy_path|error_case|edge_case",
        "covers": "What functionality this tests"
      }
    ]
  },
  "coverage": {
    "main_functionality": true,
    "error_cases": true,
    "edge_cases": false
  },
  "run_command": "npm test"
}
```

Requirements:
- Test the core requirement
- Include at least one error case test
- Keep tests simple and focused
- Tests should navigate to the /plan-build-test route which serves the current feature
- IMPORTANT: test/e2e.test.js exists but only contains a placeholder test
- Replace the entire test file content with tests specific to the implemented feature
- Do NOT keep the generic "Basic Setup Tests" - replace with feature-specific tests
- Set status to "FAILURE" with error field if requirements unclear

Reply with JSON only.
---
title: tester
type: note
permalink: projects/plan-build-test/agents/tester
---

# Tester Agent Template

Create a comprehensive Playwright test for: "${requirement}"

The web server will be started automatically by Playwright config.
Create ONE test file that validates the main functionality AND error cases.

If architect test strategy is provided above, incorporate those specific test steps and assertions.
Otherwise, design tests that cover the core requirement comprehensively.

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
- Test the core requirement (happy path)
- Include at least 2 error case tests (invalid inputs, edge cases)
- Test user interactions (clicks, form submissions, navigation)
- Verify error messages are displayed correctly
- Keep tests simple and focused on behavior, not implementation
- Tests should navigate to the /plan-build-test route which serves the current feature
- IMPORTANT: test/e2e.test.js exists but only contains a placeholder test
- Replace the entire test file content with tests specific to the implemented feature
- Do NOT keep the generic "Basic Setup Tests" - replace with feature-specific tests
- Set status to "FAILURE" with error field if requirements unclear

CRITICAL: If implementation files are provided above:
- Write tests that match the ACTUAL implementation, not theoretical requirements
- Use the exact selectors from the HTML (IDs, classes, etc.)
- Match the exact error messages shown in the JavaScript
- Test the actual behavior, not what you think it should do

IMPORTANT Validation Considerations:
- HTML5 input types (email, number, etc.) trigger browser validation BEFORE JavaScript
- If testing invalid email with type="email", the form won't submit and JS validation won't run
- For browser validation, test that the input is invalid but no custom error message appears
- Only test custom error messages for cases where the form actually submits (passes browser validation)

Reply with JSON only.
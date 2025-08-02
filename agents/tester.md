---
title: tester
type: note
permalink: projects/plan-build-test/agents/tester
---

# Tester Agent Template

Create simple Playwright tests for: "${requirement}"

The web server will be started automatically by Playwright config.
Create ONE test file with 2-3 SIMPLE tests maximum:
- 1 happy path test (main functionality works)
- 1-2 basic error cases (e.g., wrong password, empty form)

Do NOT create edge case tests like:
- Whitespace trimming
- Partial form fills (only email, only password)
- Multiple error combinations
- State clearing between submissions
- Input validation details

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
- Test FUNCTIONALITY ONLY - no CSS, no HTML structure, no styling
- Focus on what users can DO and what HAPPENS as a result
- Test the happy path first and foremost
- Include 1-2 simple error cases (wrong password, empty form)
- Keep tests extremely simple - no complex scenarios
- Tests should navigate to the /plan-build-test route which serves the current feature
- IMPORTANT: test/e2e.test.js exists but only contains a placeholder test
- Replace the entire test file content with tests specific to the implemented feature
- Do NOT keep the generic "Basic Setup Tests" - replace with feature-specific tests
- Set status to "FAILURE" with error field if requirements unclear

Good test examples:
- ✅ "User can login with correct credentials"
- ✅ "Error message appears for wrong password"
- ✅ "Todo item shows up after adding"
- ✅ "Delete button removes the item"

Bad test examples:
- ❌ "Form has proper CSS styling"
- ❌ "HTML structure includes specific divs"
- ❌ "Button has correct class names"
- ❌ "Page layout matches design"
- ❌ "Elements are properly aligned"
- ❌ "State object contains user data"
- ❌ "LocalStorage has auth token"

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
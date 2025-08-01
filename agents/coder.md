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
- Set status to "FAILURE" with error field if task is unclear

Reply with JSON only.
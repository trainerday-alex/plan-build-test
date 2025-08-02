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
      "dependencies": []
    }
  ],
  "file_structure": [
    {
      "path": "path/to/file.js",
      "purpose": "What this file does",
      "type": "backend|frontend|test|config"
    }
  ],
  "final_validation": {
    "description": "What the final test validates",
    "test_file": "plan-build-test/test/e2e.test.js",
    "key_assertions": [
      "What should work",
      "Error cases to check"
    ]
  }
}
```

Requirements:
- Tasks must be numbered and have clear test commands
- Each task must be independently testable
- Include all files needed for the project
- Set status to "FAILURE" with error field if anything is unclear

Reply with JSON only.
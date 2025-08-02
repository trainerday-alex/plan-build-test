---
title: Agent JSON Output Schemas
type: note
permalink: projects/plan-build-test/agent-json-output-schemas
---

# Agent JSON Output Schemas

## Benefits of JSON Output

1. **Structured Data** - No parsing ambiguity
2. **Type Safety** - Clear data types for each field
3. **Validation** - Easy to validate required fields
4. **Extensibility** - Add new fields without breaking parsers
5. **Error Handling** - Clear success/failure states

## 1. Architect Agent

**Current Output**: Text with numbered tasks, file list, runtime requirements
**Proposed JSON Schema**:

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
      "description": "Create Express server with health endpoint",
      "test_command": "curl localhost:3000/health",
      "expected_output": "{\"status\":\"ok\"}",
      "dependencies": []
    },
    {
      "id": 2,
      "description": "Add user registration endpoint",
      "test_command": "npm test -- --grep 'user registration'",
      "expected_output": "1 passing",
      "dependencies": [1]
    }
  ],
  "file_structure": [
    {
      "path": "server.js",
      "purpose": "Main Express server",
      "type": "backend"
    },
    {
      "path": "routes/users.js",
      "purpose": "User management endpoints",
      "type": "backend"
    },
    {
      "path": "test/users.test.js",
      "purpose": "User endpoint tests",
      "type": "test"
    }
  ],
  "final_validation": {
    "description": "Full user registration flow works",
    "test_file": "test/e2e.test.js",
    "key_assertions": [
      "User can register with email/password",
      "Duplicate emails are rejected",
      "Invalid data returns errors"
    ]
  }
}
```

## 2. Coder Agent

**Current Output**: Code blocks with file paths
**Proposed JSON Schema**:

```json
{
  "status": "SUCCESS",
  "task_id": 1,
  "files": [
    {
      "path": "server.js",
      "action": "create",
      "language": "javascript",
      "content": "const express = require('express');\n// ... full code ...",
      "tests": ["npm start", "curl localhost:3000/health"]
    },
    {
      "path": "package.json",
      "action": "modify",
      "language": "json",
      "content": "{\n  \"name\": \"my-app\",\n  // ... full content ...",
      "tests": ["npm install"]
    }
  ],
  "test_instructions": {
    "setup": ["npm install"],
    "verify": ["npm start", "curl localhost:3000/health"],
    "expected": "Server running on port 3000"
  },
  "code_quality": {
    "functions_under_20_lines": true,
    "error_handling": true,
    "input_validation": true,
    "no_duplication": true
  }
}
```

## 3. Tester Agent

**Current Output**: Single test file
**Proposed JSON Schema**:

```json
{
  "status": "SUCCESS",
  "test_file": {
    "path": "test/e2e.test.js",
    "language": "javascript",
    "content": "import { test, expect } from '@playwright/test';\n// ... full test code ...",
    "test_cases": [
      {
        "name": "User can register successfully",
        "type": "happy_path",
        "covers": "user registration flow"
      },
      {
        "name": "Registration fails with duplicate email",
        "type": "error_case",
        "covers": "duplicate email validation"
      },
      {
        "name": "Registration fails with invalid data",
        "type": "error_case",
        "covers": "input validation"
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

## 4. Refactor Analyst

**Current Output**: Assessment and numbered refactor tasks
**Proposed JSON Schema**:

```json
{
  "status": "SUCCESS",
  "assessment": {
    "strengths": [
      "Clear separation of concerns",
      "Good error handling"
    ],
    "weaknesses": [
      "Large functions in user controller",
      "Duplicated validation logic"
    ],
    "code_smells": [
      {
        "type": "long_method",
        "location": "controllers/users.js:registerUser",
        "severity": "medium"
      }
    ]
  },
  "refactor_tasks": [
    {
      "id": 1,
      "description": "Extract validation logic to middleware",
      "reason": "Reduce duplication, improve testability",
      "files_affected": ["controllers/users.js", "middleware/validation.js"],
      "risk": "low",
      "test_command": "npm test"
    },
    {
      "id": 2,
      "description": "Break down registerUser into smaller functions",
      "reason": "Improve readability and maintainability",
      "files_affected": ["controllers/users.js"],
      "risk": "medium",
      "test_command": "npm test -- --grep 'user registration'"
    }
  ],
  "expected_improvements": {
    "performance": "minimal",
    "maintainability": "significant",
    "test_coverage": "moderate",
    "code_size": "-15%"
  }
}
```

## 5. Project Reviewer

**Current Output**: Text assessment and recommendations
**Proposed JSON Schema**:

```json
{
  "status": "SUCCESS",
  "project_state": {
    "completed_cycles": 3,
    "current_status": "working",
    "last_action": "Added user authentication",
    "test_results": "all_passing"
  },
  "completed_tasks": [
    "Created Express server",
    "Added user registration",
    "Added user authentication"
  ],
  "issues_found": [
    {
      "type": "missing_feature",
      "description": "No password reset functionality",
      "severity": "medium"
    }
  ],
  "recommendation": {
    "next_action": "task",
    "description": "Add password reset functionality",
    "reason": "Core feature for user management",
    "alternative": "Add user profile management"
  }
}
```

## Implementation Benefits

1. **Parsing**: Simple `JSON.parse()` instead of complex regex
2. **Validation**: Use JSON Schema validation
3. **Error Detection**: Clear status field
4. **Type Safety**: TypeScript interfaces can be generated
5. **Debugging**: Easier to log and inspect
6. **Testing**: Mock data is clearer

## Migration Path

1. Update agent templates to output JSON
2. Add JSON parsing to orchestrator
3. Keep fallback text parsing for compatibility
4. Gradually deprecate text parsing
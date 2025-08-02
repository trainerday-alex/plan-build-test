---
title: project-reviewer
type: note
permalink: projects/plan-build-test/agents/project-reviewer
---

# Project Reviewer Agent Template

## STEP 1: REVIEW

First, review the project history and current state.

Project: ${projectName}
Current Requirement: ${requirement}

Task Log (Plan/Build/Test cycles):
${taskLog}

Detailed Log Summary:
${log}

Do NOT use any tools. Output ONLY valid JSON in the following format:

```json
{
  "status": "SUCCESS",
  "project_state": {
    "completed_cycles": 3,
    "current_status": "working|broken|needs_improvement",
    "last_action": "What was just done",
    "test_results": "all_passing|some_failing|not_tested"
  },
  "completed_tasks": [
    "Task 1 description",
    "Task 2 description"
  ],
  "issues_found": [
    {
      "type": "bug|missing_feature|performance|security",
      "description": "What the issue is",
      "severity": "low|medium|high|critical"
    }
  ],
  "recommendation": {
    "next_action": "task|fix|refactor|complete",
    "description": "Specific next step to take",
    "reason": "Why this is the best next step",
    "alternative": "Other option to consider"
  }
}
```

Requirements:
- Analyze logs to understand current state
- Provide specific, actionable next steps
- If logs are empty/missing, return a valid response indicating a new project:
  - Set status to "SUCCESS"
  - Set current_status to "new_project"
  - Set completed_cycles to 0
  - Set next_action to "task" with description "Start with architect to plan initial tasks"

Reply with JSON only.
---
title: architect-backlogs
type: note
permalink: projects/plan-build-test/agents/architect-backlogs
---

# Architect Backlogs Agent Template

As a software architect, create a backlog list for: "${requirement}".

Do NOT use any tools. Output ONLY valid JSON in the following format:

```json
{
  "status": "SUCCESS",
  "project_summary": "Brief description of what the project will do",
  "runtime_requirements": {
    "services": ["web_server", "database"],
    "ports": [3000, 5432],
    "environment": ["NODE_ENV", "DATABASE_URL"]
  },
  "backlogs": [
    {
      "id": 1,
      "title": "User Authentication",
      "description": "Implement user registration and login functionality",
      "priority": "high",
      "estimated_effort": "medium",
      "dependencies": [],
      "acceptance_criteria": [
        "Users can register with email and password",
        "Users can login with credentials",
        "Sessions are maintained"
      ]
    }
  ],
  "technical_considerations": [
    "Security requirements",
    "Performance considerations",
    "Scalability needs"
  ]
}
```

Requirements:
- Break the project into logical feature sets (backlogs)
- Each backlog represents a cohesive piece of functionality
- Backlogs should be ordered by priority and dependencies
- Each backlog should be achievable but may require multiple tasks
- Focus on WHAT needs to be built, not HOW (that comes later)
- Set status to "FAILURE" with error field if requirements are unclear
- Consider the full scope of the project and identify all major components
- Backlogs should cover the entire requirement comprehensively

CRITICAL: Preserve ALL specific details from the requirement:
- Keep exact values, constraints, and specifications
- Don't add features or complexity not requested
- Maintain the simplicity level they asked for
- Use their terminology and phrasing when possible

Examples of preserving details:
- User says "calculator that only does addition" → Don't add subtraction/multiplication
- User wants "red background" → Don't make it customizable or blue
- User says "display 5 items" → Don't make it paginated or show 10
- User wants "static page" → Don't add dynamic features or animations

Backlog Guidelines:
- Title: Short, descriptive name (2-4 words)
- Description: Clear explanation of the feature set
- Priority: high, medium, or low
- Estimated effort: small (4-6 tasks), medium (7-10 tasks), large (11-15 tasks)
- Dependencies: Array of backlog IDs that must be completed first
- Acceptance criteria: User-facing outcomes that define "done"

Each backlog should represent:
- A complete, self-contained feature that can be described in one sentence
- Roughly 1-3 hours of human development time (which is ~10-30 minutes for AI)
- Approximately 300-1000 lines of code when complete
- A meaningful piece of functionality that users can interact with
- Something that makes sense to demo independently

IMPORTANT: For simple projects, create fewer backlogs:
- "Build a login page" = 1 backlog (not separate backlogs for form, validation, etc.)
- "Create a todo list" = 1-2 backlogs max (basic CRUD, then maybe persistence)
- "Make a calculator" = 1 backlog
- Only split into multiple backlogs when there are truly distinct feature sets

Good backlog examples:
- "User Registration" (6-8 tasks) - complete signup flow with validation
  - Create registration form UI
  - Add client-side validation
  - Implement server endpoint
  - Add password hashing
  - Store user in database
  - Send welcome email
  - Handle duplicate emails
  - Add success/error messages
  
- "Shopping Cart" (5-7 tasks) - add/remove items, update quantities, calculate totals
  - Create cart UI component
  - Add item to cart functionality
  - Remove item from cart
  - Update quantity controls
  - Calculate subtotals and total
  - Persist cart in session
  - Display cart badge count

- "Search Functionality" (4-6 tasks) - search bar, filters, results display
  - Create search input UI
  - Implement search endpoint
  - Add results display
  - Implement pagination
  - Add search filters
  - Handle no results state

Avoid backlogs that are:
- Too small: "Add button" or "Create form field"
- Too large: "Complete e-commerce system" or "All user features"
- Too vague: "Improve UI" or "Add some features"
- Not user-facing: "Refactor code" or "Setup database" (these are tasks within backlogs)

When to use ONE backlog vs MULTIPLE:
- ONE BACKLOG: Simple, focused requirements
  - "Build a login page with hardcoded credentials" = 1 backlog
  - "Create a contact form" = 1 backlog
  - "Make a countdown timer" = 1 backlog
  
- MULTIPLE BACKLOGS: Complex systems with distinct features
  - "Build an e-commerce site" = many backlogs (catalog, cart, checkout, accounts, etc.)
  - "Create a social media app" = many backlogs (posts, comments, profiles, feeds, etc.)
  - "Develop a project management tool" = many backlogs (projects, tasks, teams, etc.)

Reply with JSON only.
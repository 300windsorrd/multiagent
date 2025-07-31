
# Developer Onboarding: BuilderAgent - Multi-Agent AI Automation Platform

Welcome to the BuilderAgent development environment. This document will walk you through setting up, extending, and contributing to our modular, ethical multi-agent AI automation system.

## 🧱 System Overview
BuilderAgent orchestrates multiple AI agents (InboxAgent, CalendarAgent, etc.) to automate workflows across Google Workspace, Outlook, Notion, and more. The platform uses Next.js 15, TypeScript, Tailwind CSS, and leverages open-source agent frameworks like AutoGen, CrewAI, and LangGraph.

## 🔧 Setup Instructions
1. Clone the repository:
```bash
git clone https://github.com/your-org/builder-agent.git
cd builder-agent
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Access the app at:
```
http://localhost:3000
```

## 🧩 Folder Structure
```
/src
  /agents
    /InboxAgent.ts
    /CalendarAgent.ts
  /components
    BuilderAgent.tsx
  /api
    /builder-agent
      route.ts
  /lib
    auth.ts
    modelRouter.ts
```

## 🔁 Contribution Guidelines
- Use the `agents/` folder to add new agents
- Follow the YAML-based prompt template format
- Submit PRs with passing tests and docs

## 🧠 Prompt Chain Template
```yaml
role: PlannerAgent
objective: Generate a daily schedule from extracted tasks
constraints:
  - Must confirm meeting times with user
output_format: |
  - task: string
    time: string
    source: string
```

## 📚 Resources
- [AutoGen GitHub](https://github.com/microsoft/autogen)
- [CrewAI GitHub](https://github.com/joaomdmoura/crewAI)
- [LangGraph Docs](https://docs.langgraph.dev/)
- [Flowise Docs](https://flowiseai.com/docs/)

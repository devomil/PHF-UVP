---
name: Server code does not hot-reload — restart the workflow
description: Editing server/ files has no effect until the workflow is restarted; only the client hot-reloads. A "built" backend feature can silently run stale code.
---

The "Start application" workflow runs the server with plain `tsx` (no watch
mode), while the client is served by Vite with HMR. Consequence:

- Editing anything under `server/` (routes, services, prompts) does **nothing**
  until the workflow is restarted. The old code keeps running in memory.
- Vite HMR logs ("hot updated /src/...") and a healthy `/api/health` make it
  look like everything is live — but only the **client** updated.

**The trap:** a backend change can look live — client HMR fires, `/api/health`
is 200, the page reloads — while the server quietly serves pre-edit logic, so
the new behavior simply "has no effect." This reads like a logic bug but is a
stale-process bug.

**How to apply:** after editing any `server/` file, call `restart_workflow`
("Start application") before testing or concluding the change works. When a
backend change appears to have no effect, confirm the server was restarted
before debugging the logic. A reliable tell: change a known log line and check
the running output reflects it.

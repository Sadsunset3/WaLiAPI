# Audit Log Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add configurable basic/detailed audit logging, retention cleanup, and summary/detail log APIs so large request bodies no longer slow the audit page or grow the database by default.

**Architecture:** Store policy in the existing settings backend. Centralize policy application at log creation, expose summary rows for list views and full rows only on demand, and run bounded periodic retention cleanup against logs and security findings.

**Tech Stack:** Rust, sqlx/SQLite, Axum/Tauri command bridge, React/TypeScript, existing settings store.

**Spec:** Existing approved audit-log redesign discussed in the thread.

## Global Constraints

- Preserve detailed-log compatibility for existing rows and all current protocol paths.
- New defaults are `basic` logging and 7-day retention; `0` means permanent.
- All frontend/backend calls continue through `runtime.ts`/Tauri command dispatch.
- Use UTF-8-safe truncation and bounded cleanup batches; never run routine VACUUM online.

### Task 1: Settings and policy model

Add typed settings fields, migration/default handling, and general-settings controls for log level and retention.

### Task 2: Summary/detail log APIs

Add DTOs and repository queries that exclude large bodies from list responses; retain full detail retrieval by ID.

### Task 3: Centralized write policy and retention maintenance

Apply basic/detail policy on every log write, add retention cleanup with orphan-finding cleanup, and start maintenance loops for desktop/headless.

### Task 4: Frontend lazy details and UX

Load summaries initially, fetch full detail only when expanded, cache details, and handle basic rows/loading states.

### Task 5: Regression verification

Add focused Rust tests, run formatting/build/test/clippy, and verify the existing database behavior with read-only performance checks.

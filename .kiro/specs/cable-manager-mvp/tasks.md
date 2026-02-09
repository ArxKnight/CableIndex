# Implementation Plan

- [x] 1. Set up project structure and development environment





  - Initialize React + TypeScript + Vite frontend project
  - Set up Express + TypeScript backend server structure
  - Configure development scripts for concurrent frontend/backend development
  - Install and configure essential dependencies (React Router, TanStack Query, Tailwind, shadcn/ui)
  - _Requirements: All requirements depend on proper project setup_
# Tasks / Roadmap

This file tracks what is implemented in CableIndex today and the next logical roadmap items.

## Implemented (Current)

- [x] React + TypeScript + Vite frontend with Tailwind + shadcn/ui
- [x] Express + TypeScript backend with JWT auth and request validation
- [x] MySQL database support
- [x] First-run setup wizard (MySQL config, test connection, create initial admin)
- [x] Invitation-driven registration with optional SMTP delivery
- [x] Role/permission model (global roles + per-site roles)
- [x] Site CRUD
- [x] Structured locations CRUD + usage checks + safe deletion workflows
- [x] Per-site cable types CRUD
- [x] Cable label CRUD with per-site reference numbering (e.g. `#0001`)
- [x] ZPL generation and downloads
  - [x] Single label export
  - [x] Bulk export
  - [x] Reference-range export
  - [x] Port and PDU generators
- [x] Tools page generators (SID, 30DAY, TEXT, RACKS, IN-RACK, PORTS, PDU)
- [x] Global Day/Night theme toggle with persistence (`cableindex-theme`)
- [x] Docker deployment (single container serving UI + API)
- [x] Frontend/backend automated tests (Vitest)

## Next (High Value)

- [x] Decide and add repository license (`LICENSE`) and update root README accordingly (PolyForm Noncommercial 1.0.0)
- [ ] Add backup/restore UX (database backup/export tools)
- [ ] Add admin-level “reassign then delete” flows for more entities (e.g., cable types) if needed
- [ ] Add audit log for admin actions (invites, role changes, settings)
- [ ] Add printer profiles / templates (label size, offsets, font sizes)
- [ ] Add data import/export (CSV or JSON) for locations, cable types, and labels

## Next (Nice to Have)

- [ ] Password reset flow (email-based) if SMTP is configured
- [ ] More comprehensive E2E coverage (Playwright)
- [ ] Multi-instance guidance (replication / HA patterns)

## Validation Checklist

- [ ] `cd backend; npm test`
- [ ] `cd frontend; npm test`
- [ ] `docker build .` (optional CI step)
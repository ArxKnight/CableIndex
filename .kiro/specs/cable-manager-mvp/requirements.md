# Requirements Document

## Introduction

CableIndex is a professional cable labeling system designed for Brady (and other ZPL-compatible) printers. It provides:

- Site-scoped cable labels with automatic reference numbering
- A searchable label database with export tools
- Role-based permissions (global and per-site)
- First-run setup wizard
- MySQL-backed persistence

This document describes the requirements as the application exists today (early 2026).

## Glossary

- **ZPL**: Zebra Programming Language; output format downloaded/printed by the app.
- **Cable Label**: A cross-rack label containing a reference + source + destination.
- **Reference Number**: Per-site sequential identifier formatted like `#0001`.
- **Site**: A logical grouping for labels, locations, cable types, and permissions.
- **Structured Location**: A structured, printable location represented as `label/floor/suite/row/rack`.
- **Cable Type**: A site-defined category used when creating labels.
- **Setup Wizard**: The first-run flow that configures DB and creates the initial admin.
- **Global Role**: System-wide role: Global Admin, Admin, or User.
- **Site Role**: Per-site role: Site Admin or Site User.

## Requirements

### Requirement 1 — First-run Setup

**User Story:** As an installer, I want a guided first-run setup, so the app can be configured without manually editing files.

#### Acceptance Criteria

1. WHEN the app has not been configured, THE system SHALL gate normal API routes and prompt users to complete setup.
2. THE setup flow SHALL allow configuring a MySQL connection and testing the connection.
3. WHEN setup completes, THE system SHALL persist the configuration for subsequent restarts.
4. THE setup flow SHALL create the initial admin user.

### Requirement 2 — Authentication & Sessions

**User Story:** As a user, I want to sign in securely and keep my session valid, so I can work without repeated logins.

#### Acceptance Criteria

1. THE system SHALL authenticate users using email + password.
2. THE system SHALL issue JWT access tokens and refresh tokens.
3. THE system SHALL provide endpoints to refresh tokens and to logout.
4. THE system SHALL allow a signed-in user to update their profile and change their password.

### Requirement 3 — Invitation-based Registration

**User Story:** As an admin, I want to control who can register, so the system is not open to the public.

#### Acceptance Criteria

1. THE system SHALL support admin-created invitations containing a token.
2. WHEN an invitation is accepted, THE system SHALL create the user and apply site assignments.
3. THE system SHALL allow invitations to be listed and cancelled by admins.
4. THE system SHALL optionally send invitation emails if SMTP is configured.

### Requirement 4 — Roles & Permissions

**User Story:** As an administrator, I want role-based access control, so users only see and do what they’re allowed to.

#### Acceptance Criteria

1. THE system SHALL support Global roles: Global Admin, Admin, User.
2. THE system SHALL support per-site roles: Site Admin, Site User.
3. THE backend SHALL enforce authorization on every protected endpoint.
4. THE frontend SHALL hide/disable UI actions that the current user cannot perform.

### Requirement 5 — Sites

**User Story:** As a facility manager, I want to organize labels by site, so each location has its own references and dataset.

#### Acceptance Criteria

1. THE system SHALL allow creating, editing, listing, and deleting sites (subject to permissions).
2. THE system SHALL scope reference numbering per site.
3. WHILE a site has dependent records (e.g., labels), THE system SHALL prevent destructive deletion.

### Requirement 6 — Structured Locations

**User Story:** As a cable technician, I want consistent, printable structured locations, so labels are readable and standardized.

#### Acceptance Criteria

1. THE system SHALL support CRUD operations for locations within a site.
2. THE system SHALL format locations for printing as `<LocationLabel>/<Floor>/<Suite>/<Row>/<Rack>`.
3. THE system SHALL provide a way to see whether a location is in use (usage counts).
4. WHEN deleting a location with usage, THE system SHALL support a safe strategy (e.g., reassign then delete).

### Requirement 7 — Cable Types

**User Story:** As a site admin, I want to define cable types per site, so label creation uses site-specific categorization.

#### Acceptance Criteria

1. THE system SHALL support CRUD operations for cable types within a site.
2. THE system SHALL prevent deleting a cable type when doing so would violate constraints (or require a reassign flow).

### Requirement 8 — Cable Labels (Database + CRUD)

**User Story:** As a cable technician, I want to create and manage cable labels, so I can print and later reprint/export them.

#### Acceptance Criteria

1. WHEN a label is created, THE system SHALL assign the next site-scoped reference number formatted like `#0001`.
2. THE system SHALL store labels in a searchable database view scoped to the selected site.
3. THE system SHALL support updating and deleting labels subject to permissions.
4. THE system SHALL support bulk delete operations subject to permissions.

### Requirement 9 — ZPL Generation & Export

**User Story:** As a technician, I want print-ready ZPL downloads, so I can send them directly to a Brady printer.

#### Acceptance Criteria

1. THE system SHALL generate Brady-compatible ZPL for a cable label.
2. THE system SHALL export ZPL for a single label, a selected set (bulk), and a reference-number range.
3. THE system SHALL generate ZPL for port labels and PDU labels.
4. THE system SHALL output ZPL with strict formatting rules (including `^FD` fields and `^FS` terminators on separate lines).

### Requirement 10 — Tools & UX

**User Story:** As a user, I want helper tools and a consistent UI, so I can generate specialized labels quickly.

#### Acceptance Criteria

1. THE system SHALL provide a Tools page with generators (SID, 30DAY, TEXT, RACKS, IN-RACK, PORTS, PDU).
2. THE system SHALL provide a global Day/Night theme toggle with persistence.

### Requirement 11 — Deployment

**User Story:** As an operator, I want easy deployment options, so I can run CableIndex on a server or NAS.

#### Acceptance Criteria

1. THE system SHALL support Docker deployment.
2. THE system SHALL require MySQL for deployments.
3. THE system SHALL document environment variables required for operation.
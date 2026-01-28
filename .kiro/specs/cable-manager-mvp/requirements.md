# Requirements Document

## Introduction

The CableIndex system is a professional cable labeling system designed for Brady printers that generates ZPL labels with automatic reference numbering, comprehensive user management, and role-based permissions. The system enables organizations to efficiently create, manage, and track cable labels across multiple sites while maintaining proper access controls and audit trails.

## Glossary

- **CableIndex System**: The complete web-based cable labeling application
- **Brady Printer**: Industrial label printer that uses ZPL (Zebra Programming Language) format
- **ZPL**: Zebra Programming Language used for label formatting and printing
- **Reference Number**: Auto-generated sequential identifier for cable labels
- **Site**: Physical location where cables are installed and managed
- **Label Database**: Central repository storing all created cable label records
- **User Role**: Permission level assigned to users (admin, moderator, user)
- **Tool Permission**: Granular access control for specific application features
- **Edge Function**: Server-side function executed in Supabase environment
- **RLS**: Row Level Security - database-level access control mechanism

## Requirements

### Requirement 1

**User Story:** As a cable technician, I want to create cable labels with automatic reference numbering, so that I can quickly generate professional labels without manual tracking.

#### Acceptance Criteria

1. WHEN a user selects a site and enters source/destination information, THE CableIndex System SHALL generate a unique reference number in the format [SITE]-[AUTO_NUMBER]
2. THE CableIndex System SHALL generate ZPL code for Brady printers with the format [SITE]-[REF] [SOURCE] > [DEST]
3. WHEN label creation is completed, THE CableIndex System SHALL provide downloadable ZPL file
4. THE CableIndex System SHALL store all label information in the Label Database for future reference
5. THE CableIndex System SHALL validate that source and destination fields are not empty before label generation

### Requirement 2

**User Story:** As a system administrator, I want to manage user accounts and permissions, so that I can control access to different system features based on user roles.

#### Acceptance Criteria

1. THE CableIndex System SHALL support three user roles: admin, moderator, and user
2. WHEN an admin invites a new user, THE CableIndex System SHALL send an email invitation with account setup instructions
3. THE CableIndex System SHALL enforce role-based access where admins can access all features, moderators have limited administrative access, and users have basic functionality
4. WHEN a user account is created, THE CableIndex System SHALL automatically assign default tool permissions based on their role
5. THE CableIndex System SHALL allow admins to modify user roles and tool-specific permissions

### Requirement 3

**User Story:** As a facility manager, I want to organize labels by sites, so that I can manage cable labeling across multiple physical locations.

#### Acceptance Criteria

1. THE CableIndex System SHALL allow users to create, edit, and delete site records
2. WHEN creating a label, THE CableIndex System SHALL require site selection from available sites
3. THE CableIndex System SHALL store site information including name, location, and description
4. THE CableIndex System SHALL associate each label with exactly one site
5. WHILE a site has associated labels, THE CableIndex System SHALL prevent site deletion

### Requirement 4

**User Story:** As a network technician, I want to generate port labels for switches and PDUs, so that I can efficiently label multiple ports with consistent formatting.

#### Acceptance Criteria

1. WHEN generating port labels, THE CableIndex System SHALL accept switch/PDU SID and port range inputs
2. THE CableIndex System SHALL generate ZPL code for multiple port labels in the format [SID]/[PORT_NUMBER]
3. THE CableIndex System SHALL create three port labels per page for efficient printing
4. THE CableIndex System SHALL validate that port range inputs are numeric and from-port is less than to-port
5. THE CableIndex System SHALL provide downloadable .txt file containing all generated ZPL code

### Requirement 5

**User Story:** As a cable technician, I want to search and view previously created labels, so that I can reference existing cable information and avoid duplicates.

#### Acceptance Criteria

1. THE CableIndex System SHALL display all user-accessible labels in a searchable database view
2. WHEN searching labels, THE CableIndex System SHALL support filtering by site, reference number, source, and destination
3. THE CableIndex System SHALL allow users to export individual or batch ZPL files from the database
4. THE CableIndex System SHALL enable editing and deletion of labels based on user permissions
5. THE CableIndex System SHALL display labels with creation date and associated site information

### Requirement 6

**User Story:** As a user, I want to authenticate securely with email and password, so that my account and data are protected.

#### Acceptance Criteria

1. THE CableIndex System SHALL require email and password authentication for all users
2. WHEN a user registers, THE CableIndex System SHALL automatically create a user profile and assign default permissions
3. THE CableIndex System SHALL provide password reset functionality via email
4. THE CableIndex System SHALL maintain user sessions with automatic token refresh
5. THE CableIndex System SHALL enforce Row Level Security to ensure users can only access their authorized data

### Requirement 7

**User Story:** As an admin, I want to configure application settings, so that I can control system behavior and user registration policies.

#### Acceptance Criteria

1. THE CableIndex System SHALL provide admin-only access to application settings
2. WHEN public registration is disabled, THE CableIndex System SHALL only allow admin-invited users to create accounts
3. THE CableIndex System SHALL store application settings in a centralized configuration system
4. THE CableIndex System SHALL allow admins to view user statistics and system usage metrics
5. THE CableIndex System SHALL maintain audit trails for administrative actions

### Requirement 8

**User Story:** As a user, I want to view dashboard statistics and quick actions, so that I can efficiently navigate to common tasks and monitor my activity.

#### Acceptance Criteria

1. THE CableIndex System SHALL display a dashboard with user-specific statistics including total labels, active sites, and monthly activity
2. THE CableIndex System SHALL provide quick action cards for Create Label, Manage Sites, Search Labels, and View Database
3. THE CableIndex System SHALL show recent activity feed with latest label creations and modifications
4. THE CableIndex System SHALL update dashboard statistics in real-time as users create or modify data
5. THE CableIndex System SHALL customize dashboard content based on user permissions and role
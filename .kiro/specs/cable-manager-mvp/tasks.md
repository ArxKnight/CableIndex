# Implementation Plan

- [x] 1. Set up project structure and development environment





  - Initialize React + TypeScript + Vite frontend project
  - Set up Express + TypeScript backend server structure
  - Configure development scripts for concurrent frontend/backend development
  - Install and configure essential dependencies (React Router, TanStack Query, Tailwind, shadcn/ui)
  - _Requirements: All requirements depend on proper project setup_

- [x] 2. Implement SQLite database foundation





  - [x] 2.1 Create database connection and initialization


    - Set up better-sqlite3 connection with proper error handling
    - Create database initialization script with schema creation
    - Implement database migration system for schema updates
    - _Requirements: 6.5, 7.4_

  - [x] 2.2 Define database schema and tables


    - Create users table with authentication fields and password hashing
    - Create sites table with location and description fields
    - Create labels table with reference numbering and relationships
    - Create user_roles, tool_permissions, app_settings, and user_invitations tables
    - _Requirements: 2.4, 3.4, 5.5, 6.5, 7.4_

  - [x] 2.3 Write database model unit tests



    - Test database connection and initialization
    - Test table creation and constraints
    - Test data insertion and retrieval operations
    - _Requirements: 2.4, 3.4, 6.5_

- [x] 3. Build authentication system





  - [x] 3.1 Implement JWT authentication middleware


    - Create JWT token generation and validation functions
    - Build authentication middleware for protected routes
    - Implement password hashing with bcrypt
    - Create token refresh mechanism
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [x] 3.2 Create authentication API endpoints


    - Build POST /api/auth/login endpoint with credential validation
    - Build POST /api/auth/register endpoint with user creation
    - Build POST /api/auth/refresh endpoint for token renewal
    - Implement proper error handling and validation
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

  - [x] 3.3 Build frontend authentication context and hooks


    - Create AuthProvider context with user state management
    - Implement useAuth hook with login, register, and logout functions
    - Build ProtectedRoute component for route guarding
    - Create authentication forms with validation
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 3.4 Write authentication system tests



    - Test JWT token generation and validation
    - Test authentication middleware functionality
    - Test login/register API endpoints
    - Test frontend authentication flows
    - _Requirements: 6.1, 6.2, 6.5_

- [x] 4. Implement user management and permissions




  - [x] 4.1 Create user role and permission system


    - Build role assignment functions (admin, moderator, user)
    - Implement tool permission checking middleware
    - Create permission validation functions for API endpoints
    - Build usePermissions hook for frontend permission checks
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [x] 4.2 Build user management API endpoints


    - Create GET /api/users endpoint for user listing (admin only)
    - Build POST /api/admin/invite endpoint for user invitations
    - Implement PUT /api/users/:id endpoint for user updates
    - Create DELETE /api/users/:id endpoint for user deletion
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [x] 4.3 Write user management tests



    - Test role assignment and permission checking
    - Test user invitation and registration flow
    - Test admin user management operations
    - _Requirements: 2.1, 2.2, 2.5_

- [x] 5. Build site management functionality










  - [x] 5.1 Create site data model and API endpoints


    - Build Site model with CRUD operations
    - Create GET /api/sites endpoint with user filtering
    - Build POST /api/sites endpoint for site creation
    - Implement PUT /api/sites/:id and DELETE /api/sites/:id endpoints
    - Add validation to prevent site deletion when labels exist
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_



  - [x] 5.2 Build site management frontend components





    - Create SiteList component with search and filter functionality
    - Build SiteForm component for create/edit operations
    - Implement SiteDetails component with associated labels display
    - Add confirmation dialogs for site deletion


    - _Requirements: 3.1, 3.2, 3.3, 3.5_

  - [x] 5.3 Write site management tests









    - Test site CRUD operations
    - Test site deletion prevention with existing labels
    - Test site search and filter functionality
    - _Requirements: 3.1, 3.2, 3.5_

- [x] 6. Implement label creation and management




  - [x] 6.1 Build label data model and reference number generation


    - Create Label model with automatic reference number generation
    - Implement reference number auto-increment logic per site
    - Build label validation functions for required fields
    - Create label search and filter functions
    - _Requirements: 1.1, 1.4, 1.5, 5.1, 5.4_

  - [x] 6.2 Create label management API endpoints


    - Build GET /api/labels endpoint with filtering and pagination
    - Create POST /api/labels endpoint for label creation
    - Implement PUT /api/labels/:id and DELETE /api/labels/:id endpoints
    - Add bulk operations for label management
    - _Requirements: 1.1, 1.4, 5.1, 5.3, 5.4, 5.5_

  - [x] 6.3 Build label creation frontend components


    - Create LabelForm component with site selection and input fields
    - Build LabelDatabase component with search, filter, and pagination
    - Implement label preview functionality
    - Add bulk selection and operations for labels
    - _Requirements: 1.1, 1.5, 5.1, 5.2, 5.3, 5.4_



  - [x] 6.4 Write label management tests











    - Test reference number generation and uniqueness
    - Test label CRUD operations and validation
    - Test label search and filter functionality
    - _Requirements: 1.1, 1.4, 5.1, 5.4_

- [x] 7. Implement ZPL generation system





  - [x] 7.1 Create ZPL generation utilities


    - Build ZPL template functions for cable labels
    - Create ZPL generation for port labels (3 per page)
    - Implement PDU label ZPL generation
    - Add ZPL validation and formatting functions
    - _Requirements: 1.2, 1.3, 4.2, 4.3_

  - [x] 7.2 Build ZPL download and export functionality


    - Create file download utilities for ZPL content
    - Implement bulk ZPL export for multiple labels
    - Build individual label ZPL generation endpoints
    - Add .txt file generation for port/PDU labels
    - _Requirements: 1.3, 4.3, 4.5, 5.3_

  - [x] 7.3 Create port and PDU label generators


    - Build PortLabels component with SID and range inputs
    - Create PDULabels component with validation
    - Implement range validation (from < to, numeric values)
    - Add preview functionality for generated labels
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 7.4 Write ZPL generation tests



    - Test ZPL template generation accuracy
    - Test port and PDU label generation
    - Test file download functionality
    - _Requirements: 1.2, 1.3, 4.2, 4.3_

- [x] 8. Build dashboard and navigation




  - [x] 8.1 Create main layout and navigation components


    - Build Layout component with navigation bar and user menu
    - Create Navigation component with role-based menu items
    - Implement responsive design for mobile devices
    - Add active route highlighting and breadcrumbs
    - _Requirements: 8.1, 8.2, 8.5_

  - [x] 8.2 Build dashboard with statistics and quick actions


    - Create Dashboard component with user statistics display
    - Implement real-time statistics calculation (total labels, sites, monthly activity)
    - Build quick action cards for common tasks
    - Add recent activity feed with latest label creations
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 8.3 Write dashboard and navigation tests



    - Test navigation component rendering and routing
    - Test dashboard statistics calculation
    - Test quick action functionality
    - _Requirements: 8.1, 8.2, 8.4_

- [x] 9. Implement admin panel functionality





  - [x] 9.1 Build admin user management interface


    - Create AdminPanel component with user listing
    - Build UserManagement component with role assignment
    - Implement user invitation system with email tokens
    - Add user statistics and activity monitoring
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 7.5_

  - [x] 9.2 Create application settings management


    - Build AppSettings component for configuration management
    - Implement public registration toggle functionality
    - Add system configuration options
    - Create settings persistence and validation
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 9.3 Write admin panel tests



    - Test admin user management operations
    - Test application settings functionality
    - Test admin-only access restrictions
    - _Requirements: 2.1, 2.2, 7.1, 7.5_

- [x] 10. Add user profile and account management





  - [x] 10.1 Build user profile management


    - Create Profile component for personal information editing
    - Implement password change functionality
    - Add account status and role display
    - Build profile update validation and error handling
    - _Requirements: 6.2, 2.4_

  - [x] 10.2 Write profile management tests



    - Test profile update functionality
    - Test password change validation
    - Test profile information display
    - _Requirements: 6.2_

- [x] 11. Integrate and finalize application




  - [x] 11.1 Connect all components and implement routing


    - Set up React Router with all application routes
    - Connect frontend components to backend API endpoints
    - Implement error boundaries and loading states
    - Add toast notifications for user feedback
    - _Requirements: All requirements_

  - [x] 11.2 Add final polish and error handling


    - Implement comprehensive error handling throughout the application
    - Add loading states and user feedback for all operations
    - Create 404 and error pages
    - Add form validation and user input sanitization
    - _Requirements: All requirements_

  - [x] 11.3 Write end-to-end integration tests



    - Test complete user workflows from registration to label creation
    - Test admin workflows for user management
    - Test error scenarios and edge cases
    - _Requirements: All requirements_
# CableIndex

![CableIndex Logo](frontend/public/cableindex-logo.png)

A professional cable labeling system for Brady printers with automatic reference numbering, comprehensive user management, role-based permissions, and MySQL-backed persistence. Features a modern React frontend with Express backend and Docker deployment options.

## ✨ Features

### Core Functionality
- 🏷️ **Cable Label Generation**: Automatic ZPL format generation for Brady printers
- 🔢 **Smart Reference Numbering**: Sequential numbering per site (e.g. `#0001`, `#0002`, ...)
- 🏢 **Multi-Site Management**: Organize labels across multiple physical locations
- 📍 **Structured Locations**: Template-aware locations for consistent output
   - **Datacentre/Commercial**: `label/floor/suite/row/rack`
   - **Domestic**: `label/floor/area`
   - A single site can contain a mix of templates
- 🧵 **Cable Types**: Define per-site cable types for categorization
- 📊 **Label Database**: Searchable database with filtering (including template-aware location filters like Domestic `area`) and bulk export capabilities
- 📄 **Site Cable Report (.docx)**: Deterministic cable report export including label `type`

### Port & Equipment Labeling
- 🔌 **Port Labels**: Generate labels for switches and network equipment
- ⚡ **PDU Labels**: Specialized labeling for power distribution units
- 📄 **Batch Generation**: Create multiple labels with consistent formatting
- 💾 **ZPL Export**: Download ready-to-print .zpl and .txt files

### User Management & Security
- 👥 **Multi-User Support**: Complete user account management system
- 🔐 **Role-Based Access**: Global roles (Global Admin, User) plus per-site roles
- 🎫 **JWT Authentication**: Secure token-based authentication with refresh
- 📧 **User Invitations**: Admin-controlled invitations with site assignments
- 🛡️ **Data Security**: Password hashing, input validation, and secure sessions

### Tools
- 🧰 **Toolbox**: SID, 30DAY, TEXT, RACKS, IN-RACK, PORTS, and PDU helpers
- 🌓 **Theme Toggle**: Site-wide Day/Night mode (defaults to Night) with persistence

### Database & Deployment
- 🗄️ **MySQL Only**: Optimized for MySQL deployments
- 🐳 **Docker Ready**: Complete containerization with Docker Compose
- 📦 **Unraid Support**: Pre-configured template for Unraid deployment
- 🔧 **Setup Wizard**: First-time configuration (MySQL connection + admin)

## 🛠️ Tech Stack

### Frontend
- **React 18** + TypeScript for type-safe development
- **Vite** for lightning-fast development and building
- **Tailwind CSS** + **shadcn/ui** for modern, accessible components
- **React Router** for client-side navigation
- **TanStack Query** for server state management and caching
- **React Hook Form** + **Zod** for form validation
- **Lucide React** for consistent iconography

### Backend
- **Node.js** + **Express** + TypeScript for robust API development
- **MySQL** (mysql2) database support
- **JWT** authentication with automatic token refresh
- **bcryptjs** for secure password hashing
- **Zod** for API request/response validation
- **Helmet** + **CORS** for security hardening

### Development & Testing
- **Vitest** for unit and integration testing
- **Testing Library** for React component testing
- **ESLint** + **TypeScript** for code quality
- **Concurrently** for parallel development servers

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** and npm
- **Git** for version control
- **Docker** (optional, for containerized deployment)
- **MySQL Server** (required)

### Quick Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd cableindex
   ```

2. **Install all dependencies:**
   ```bash
   npm run install:all
   ```

3. **Set up environment variables:**
   ```bash
   # Copy backend environment file
   cp backend/.env.example backend/.env
   # (Optional) create frontend/.env if you need to override defaults
   
   # Edit backend/.env with your configuration
   # Key settings: JWT_SECRET, database configuration
   ```

4. **Start development servers:**
   ```bash
   npm run dev
   ```

   This starts:
   - **Frontend**: http://localhost:3000 (Vite dev server)
   - **Backend API**: http://localhost:3001 (Express server)

5. **Complete setup wizard:**
   - Navigate to http://localhost:3000
   - Enter MySQL connection details
   - Create your admin account
   - Start creating sites and labels!

### 🐳 Docker Deployment

For production deployment or Unraid users:

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t cableindex:latest .
docker run -d -p 3000:3000 -v cableindex-data:/app/data cableindex:latest
```

See [Docker Setup Guide](docker/README.md) for detailed deployment instructions, including Unraid configuration.

### Development Scripts

```bash
# Development
npm run dev                 # Start both frontend and backend
npm run dev:frontend        # Frontend only (Vite dev server)
npm run dev:backend         # Backend only (Express with hot reload)

# Building
npm run build              # Build both for production
npm run build:frontend     # Build React app only
npm run build:backend      # Build Express API only

# Preview
npm run preview            # Preview frontend production build

# Testing
cd frontend && npm run test       # Frontend tests only
cd frontend && npm run test:watch # Frontend watch mode
cd backend && npm run test        # Backend tests only
```

## 📁 Project Structure

```
cableindex/
├── 📄 build-and-push.ps1           # Build/push helper (Windows)
├── 📄 build-docker.sh              # Build helper (Linux)
├── 📁 frontend/                    # React frontend application
│   ├── 📁 src/
│   │   ├── 📁 components/         # Reusable UI components
│   │   │   ├── 📁 admin/          # Admin panel components
│   │   │   ├── 📁 auth/           # Authentication forms
│   │   │   ├── 📁 labels/         # Label generation components
│   │   │   ├── 📁 layout/         # Navigation and layout
│   │   │   ├── 📁 locations/      # Location management UI
│   │   │   ├── 📁 profile/        # User profile management
│   │   │   ├── 📁 sites/          # Site management components
│   │   │   ├── 📁 tools/          # Toolbox label generators
│   │   │   └── 📁 ui/             # shadcn/ui base components
│   │   ├── 📁 contexts/           # React contexts (Auth, Theme)
│   │   ├── 📁 hooks/              # Custom React hooks
│   │   ├── 📁 lib/                # Utility functions and API client
│   │   ├── 📁 pages/              # Page components and routing
│   │   ├── 📁 test/               # Frontend test suites
│   │   └── 📁 types/              # TypeScript type definitions
│   ├── 📄 package.json            # Frontend dependencies
│   └── 📄 vite.config.ts          # Vite configuration
├── 📁 backend/                     # Express backend API
│   ├── 📁 data/                    # Optional runtime marker files
│   ├── 📁 scripts/                 # Dev/test helper scripts
│   ├── 📁 src/
│   │   ├── 📁 database/           # Database connection and migrations
│   │   │   ├── 📁 adapters/       # MySQL adapter
│   │   │   └── 📁 migrations/     # Database schema migrations
│   │   ├── 📁 middleware/         # Express middleware (auth, permissions)
│   │   ├── 📁 models/             # Database models and operations
│   │   ├── 📁 routes/             # API route handlers
│   │   ├── 📁 services/           # Business logic services
│   │   ├── 📁 test/               # Backend test suites
│   │   └── 📁 utils/              # Utility functions (JWT, password)
│   ├── 📄 package.json            # Backend dependencies
│   └── 📄 tsconfig.json           # TypeScript configuration
├── 📁 docker/                      # Docker deployment files
│   ├── 📄 README.md               # Docker setup guide
│   ├── 📄 start.sh                # Container startup script
│   └── 📄 unraid-template.xml     # Unraid container template
├── 📁 .kiro/                       # Kiro AI assistant configuration
│   └── 📁 specs/                  # Project specifications
├── 📄 docker-compose.yml          # Docker Compose configuration
├── 📄 docker-compose.test.yml     # Test Docker Compose configuration
├── 📄 Dockerfile                  # Multi-stage Docker build
├── 📄 LICENSE                      # PolyForm Noncommercial License 1.0.0
├── 📄 package.json                # Root package.json with scripts
└── 📄 README.md                   # This file
```

## 🔌 API Endpoints

### Authentication & User Management
- `POST /api/auth/login` - User authentication with JWT tokens
- `POST /api/auth/register` - Public registration is disabled (use invitations)
- `POST /api/auth/refresh` - Refresh JWT access token
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/profile` - Update user profile information
- `PUT /api/auth/password` - Change user password
- `POST /api/auth/logout` - Logout / invalidate session

### User Administration (Legacy / Compatibility)
- `GET /api/users` - List users (admin only)
- `GET /api/users/stats` - User statistics (admin only)
- `PUT /api/users/:id` - Update user (admin only)
- `DELETE /api/users/:id` - Delete user (admin only)

### Sites Management
- `GET /api/sites` - List user-accessible sites
- `POST /api/sites` - Create new site
- `GET /api/sites/:id` - Get site details
- `PUT /api/sites/:id` - Update site information
- `DELETE /api/sites/:id` - Delete site (if no associated labels)

#### Site Locations
- `GET /api/sites/:id/locations` - List structured locations for a site
- `POST /api/sites/:id/locations` - Create a location (site admin)
- `PUT /api/sites/:id/locations/:locationId` - Update a location (site admin)
- `GET /api/sites/:id/locations/:locationId/usage` - Usage counts for a location
- `DELETE /api/sites/:id/locations/:locationId` - Delete a location (site admin; supports strategy)
- `POST /api/sites/:id/locations/:locationId/reassign-and-delete` - Reassign labels then delete (site admin)

#### Site Cable Report
- `GET /api/sites/:id/cable-report` - Download Site Cable Report (.docx)

#### Site Cable Types
- `GET /api/sites/:id/cable-types` - List cable types for a site
- `POST /api/sites/:id/cable-types` - Create a cable type (site admin)
- `PUT /api/sites/:id/cable-types/:cableTypeId` - Update a cable type (site admin)
- `DELETE /api/sites/:id/cable-types/:cableTypeId` - Delete a cable type (site admin)

### Label Operations
- `GET /api/labels` - List labels for a site (requires `site_id`)
- `GET /api/labels/stats` - Label statistics for a site
- `GET /api/labels/recent` - Recent labels (requires `site_id`)
- `GET /api/labels/:id` - Get label details (requires `site_id`)
- `POST /api/labels` - Create new label with auto-reference
- `PUT /api/labels/:id` - Update existing label (requires `site_id`)
- `DELETE /api/labels/:id` - Delete label (requires `site_id`)
- `POST /api/labels/bulk-delete` - Bulk delete labels (requires `site_id`)
- `GET /api/labels/:id/zpl` - Download label as ZPL (requires `site_id`)
- `POST /api/labels/bulk-zpl` - Bulk export labels as ZPL (requires `site_id`)
- `POST /api/labels/bulk-zpl-range` - Export labels by reference range (requires `site_id`)

### Label Generation
- `POST /api/labels/port-labels/zpl` - Generate port label ZPL
- `POST /api/labels/pdu-labels/zpl` - Generate PDU label ZPL

### Admin Panel (Global Admin / Site Admin)
- `GET /api/admin/overview` - Admin overview notification counts
- `POST /api/admin/invite` - Create invitation with site assignments
- `GET /api/admin/invitations` - List pending invitations
- `POST /api/admin/invitations/:id/link` - Get an invitation link for an existing invitation
- `POST /api/admin/invitations/:id/resend` - Re-send invitation email (SMTP required)
- `DELETE /api/admin/invitations/:id` - Cancel invitation
- `POST /api/admin/accept-invite` - Accept invitation (public)
- `GET /api/admin/validate-invite/:token` - Validate invitation token
- `GET /api/admin/users` - List users (scoped by shared sites for Admin)
- `PUT /api/admin/users/:id/role` - Update user role
- `GET /api/admin/users/:id/sites` - List user site memberships
- `PUT /api/admin/users/:id/sites` - Replace user site memberships
- `DELETE /api/admin/users/:id` - Delete user account
- `GET /api/admin/settings` - Application configuration
- `PUT /api/admin/settings` - Update application settings
- `POST /api/admin/settings/test-email` - Send an SMTP test email
- `GET /api/admin/stats` - System statistics (Global Admin only; requires `site_id` query param)

### Setup & Health
- `GET /api/health` - Health check endpoint for monitoring
- `GET /api/setup/status` - Check if initial setup is complete
- `POST /api/setup/test-connection` - Test database connection
- `POST /api/setup/complete` - Configure database + create initial admin

## ⚙️ Configuration

### Backend Environment Variables (.env)

#### Core Application Settings
```bash
# Server Configuration
PORT=3001                                    # API server port
NODE_ENV=development                         # Environment mode

# Authentication & Security
JWT_SECRET=your-super-secret-jwt-key        # JWT signing secret (CHANGE THIS!)
JWT_EXPIRES_IN=24h                          # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d                   # Refresh token expiration
BCRYPT_ROUNDS=12                            # Password hashing rounds

# URLs
APP_URL=http://localhost:3000               # Base URL for invitation links (optional; falls back to request host)

# Database Configuration (MySQL only)
MYSQL_HOST=localhost                        # MySQL server host
MYSQL_PORT=3306                             # MySQL server port
MYSQL_USER=cableindex                       # MySQL username
MYSQL_PASSWORD=your_password                # MySQL password
MYSQL_DATABASE=cableindex                   # MySQL database name
MYSQL_SSL=false                             # Enable SSL connection

# Setup Wizard
SETUP_COMPLETE=false                        # Set true by setup wizard after initial configuration

# SMTP (optional; invitations can be emailed when configured)
# You can also configure SMTP from Admin → Settings (stored in app_settings).
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-pass
SMTP_FROM=CableIndex <noreply@example.com>
SMTP_SECURE=false
```

### Frontend Environment Variables (.env)
```bash
# API Configuration
VITE_API_URL=http://localhost:3001/api      # Backend API base URL (development only; production uses same-origin /api)
VITE_BASE_PATH=/                            # Base path when hosted under a sub-path
```

### Database Selection Guide

CableIndex requires MySQL.

### Docker Environment Variables
```bash
# Docker Compose Configuration
PORT=3000                                   # Host port mapping
JWT_SECRET=your-production-secret           # Production JWT secret
APP_URL=https://cableindex.example.com      # Optional; used for invitation links

# Database Configuration (MySQL only)
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_USER=cableindex
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=cableindex
```

## 🧪 Testing

### Test Coverage
The project includes comprehensive test suites for both frontend and backend:

#### Frontend Tests
- **Component Tests**: React Testing Library for UI components
- **Integration Tests**: User workflow testing with realistic scenarios
- **Hook Tests**: Custom React hooks validation
- **Page Tests**: Complete page functionality testing

#### Backend Tests
- **Unit Tests**: Individual function and service testing
- **Integration Tests**: Database operations and API endpoints
- **Authentication Tests**: JWT and permission system validation
- **Model Tests**: Database model operations and constraints

### Running Tests

```bash
# Frontend tests only
cd frontend && npm run test
cd frontend && npm run test:watch    # Watch mode

# Backend tests only
cd backend && npm run test
```

### Test Database
Backend tests run against a MySQL test database.

Set the required MySQL env vars before running backend tests:
- `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` (and optional `MYSQL_SSL`)

## 🚀 Deployment Options

### 1. Docker Deployment (Recommended)

**Quick Start:**
```bash
# Using Docker Compose
docker-compose up -d

# Access at http://localhost:3000
```

**Custom Configuration:**
```bash
# Build custom image
docker build -t cableindex:latest .

# Run with custom settings
docker run -d \
  --name cableindex \
  -p 8080:3000 \
  -v /path/to/data:/app/data \
  -e JWT_SECRET=your-secret \
  cableindex:latest
```

### 2. Unraid Deployment

See the detailed [Docker Setup Guide](docker/README.md) for:
- Community Applications installation
- Manual template configuration
- Volume mapping setup
- Environment variable configuration
- Troubleshooting guide

### 3. Traditional Server Deployment

```bash
# Build for production
npm run build

# Start production server
cd backend && npm start

# Serve frontend (using nginx, apache, etc.)
# Point web server to frontend/dist/
```

### 4. Development Deployment

```bash
# Start development servers
npm run dev

# Frontend: http://localhost:3000
# Backend: http://localhost:3001
```

## 🔧 Advanced Configuration

### Database Migration
The system automatically handles database migrations on startup:
- MySQL: Connects and applies migrations to the configured database

### Custom ZPL Templates
Modify ZPL generation in `backend/src/services/ZPLService.ts`:
- Adjust label dimensions
- Change font sizes and styles
- Add custom formatting
- Support different label types

### Authentication Customization
Configure JWT settings in backend environment:
- Token expiration times
- Refresh token behavior
- Password complexity requirements
- Session management

### Performance Tuning
- **Database Indexing**: Automatic indexes on frequently queried fields
- **Query Optimization**: Efficient database queries with proper joins
- **Caching**: TanStack Query caching for API responses
- **Bundle Optimization**: Vite code splitting and tree shaking

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Install dependencies: `npm run install:all`
4. Start development servers: `npm run dev`
5. Make your changes and add tests
6. Run tests:
   - `cd frontend && npm run test`
   - `cd backend && npm run test`
7. Commit changes: `git commit -m 'Add amazing feature'`
8. Push to branch: `git push origin feature/amazing-feature`
9. Open a Pull Request

### Code Standards
- **TypeScript**: Strict type checking enabled
- **ESLint**: Code quality and consistency
- **Prettier**: Code formatting (if configured)
- **Testing**: Maintain test coverage for new features
- **Documentation**: Update README and inline comments

### Project Guidelines
- Follow existing code patterns and architecture
- Write tests for new functionality
- Update documentation for API changes
- Use semantic commit messages
- Ensure Docker builds work correctly

## 📄 License

Licensed under the PolyForm Noncommercial License 1.0.0.

See [LICENSE](LICENSE).

## 🆘 Support & Troubleshooting

### Common Issues

**Database Connection Errors:**
- Verify database configuration in `.env`
- Ensure MySQL server is running and accessible

**Authentication Problems:**
- Verify JWT_SECRET is set and consistent
- Check token expiration settings
- Clear browser localStorage and cookies

**Docker Issues:**
- Verify port mappings are correct
- Check volume mounts for data persistence
- Review container logs: `docker logs cableindex`

**Build Failures:**
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check Node.js version compatibility
- Verify all environment variables are set

### Getting Help
- Check the [Docker Setup Guide](docker/README.md) for deployment issues
- Review test files for usage examples
- Create an issue on the project repository
- Check container logs for error details

### Performance Issues
- Monitor database query performance
- Review memory usage in production

## 🏷️ Label Generation

### Cable Labels
Generate professional cable labels with automatic reference numbering:

**Reference**: `#0001` (per-site counter, padded to 4 digits)

**Printed payload** (3 lines):

1. `#<REF>`
2. `<SOURCE>`
3. `<DESTINATION>`

**Location print format**:
- **Datacentre/Commercial**: `<LocationLabel>/<Floor>/<Suite>/<Row>/<Rack>`
- **Domestic**: `<LocationLabel>/<Floor>/<Area>`

### Port Labels
Create consistent port labels for network equipment:

**Format**: `[EQUIPMENT-ID]/[PORT-NUMBER]`
**Example**: `SW-CORE-01/24`

### PDU Labels
Specialized labels for power distribution units:

**Format**: `[PDU-ID]/[OUTLET-NUMBER]`
**Example**: `PDU-A-01/12`

### ZPL Output
All labels generate industry-standard ZPL (Zebra Programming Language) code compatible with:
- Brady printers
- Zebra label printers
- Most industrial label printing systems

### Batch Operations
- Generate multiple port labels in sequence
- Bulk export existing labels
- Export a reference-number range for a single site
- Download as .zpl or .txt files
- Print-ready formatting

## 🔐 User Roles & Permissions

CableIndex uses **global roles** for system-wide access and **site roles** for per-site permissions.

### Global Roles

**Global Admin**
- **Full system access** - all features and settings
- **User management** - invite users, manage access, update global roles, delete users
- **Site management** - create, edit, delete any site
- **Stats** - system-wide statistics endpoints

**User**
- **Standard access** - work within assigned sites
- **Label management** - create, update, and export labels in assigned sites
- **Profile management** - update personal information
- **Scoped admin access (when Site Admin)** - admin panel features are scoped to sites where the user is a **Site Admin**

### Site Roles (per site)

**Site Admin**
- **Site settings** - update site details and metadata
- **Label operations** - full label access within the site

**Site User**
- **Label operations** - create, update, and export labels within the site

### Permission Matrix (Global Roles)
| Capability              | Global Admin | User |
|-------------------------|--------------|------|
| Access admin panel      | ✅          | 🏢*  |
| Manage users & invites  | ✅          | 🏢*  |
| Create sites            | ✅          | ❌   |
| View sites              | ✅ (all)    | ✅ (assigned) |
| System settings         | ✅          | ❌   |
| System-wide stats       | ✅          | ❌   |

### Permission Matrix (Site Roles)
| Capability           | Site Admin | Site User |
|----------------------|------------|-----------|
| Update site details  | ✅         | ❌       |
| Manage locations     | ✅         | ❌       |
| Manage cable types   | ✅         | ❌       |
| Create labels        | ✅         | ✅       |
| Update/delete labels | ✅         | ✅       |
| Bulk export/delete   | ✅         | ✅       |

**Legend**: ✅ Full Access, 🏢 Site-Scoped Access, ❌ No Access

* 🏢 = available when the user is a **Site Admin** of at least one site (actions are scoped to those sites).
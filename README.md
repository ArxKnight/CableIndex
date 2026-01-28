# CableIndex

![CableIndex Logo](frontend/public/cableindex-logo.png)

A professional cable labeling system for Brady printers with automatic reference numbering, comprehensive user management, role-based permissions, and multi-database support. Features a modern React frontend with Express backend, supporting both SQLite and MySQL databases with Docker deployment options.

## ✨ Features

### Core Functionality
- 🏷️ **Cable Label Generation**: Automatic ZPL format generation for Brady printers
- 🔢 **Smart Reference Numbering**: Sequential numbering per site with format [SITE]-[REF]
- 🏢 **Multi-Site Management**: Organize labels across multiple physical locations
- 📊 **Label Database**: Searchable database with filtering and bulk export capabilities

### Port & Equipment Labeling
- 🔌 **Port Labels**: Generate labels for switches and network equipment
- ⚡ **PDU Labels**: Specialized labeling for power distribution units
- 📄 **Batch Generation**: Create multiple labels with consistent formatting
- 💾 **ZPL Export**: Download ready-to-print .zpl and .txt files

### User Management & Security
- 👥 **Multi-User Support**: Complete user account management system
- 🔐 **Role-Based Access**: Admin, Moderator, and User roles with granular permissions
- 🎫 **JWT Authentication**: Secure token-based authentication with refresh
- 📧 **User Invitations**: Admin-controlled user invitation system
- 🛡️ **Data Security**: Password hashing, input validation, and secure sessions

### Dashboard & Analytics
- 📈 **Real-Time Statistics**: User activity, label counts, and site metrics
- ⚡ **Quick Actions**: Fast access to common tasks and workflows
- 📋 **Recent Activity**: Track latest label creations and modifications
- 🎯 **Permission-Based UI**: Customized interface based on user role

### Database & Deployment
- 🗄️ **Dual Database Support**: Choose between SQLite (simple) or MySQL (scalable)
- 🐳 **Docker Ready**: Complete containerization with Docker Compose
- 📦 **Unraid Support**: Pre-configured template for Unraid deployment
- 🔧 **Setup Wizard**: First-time configuration with database selection

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
- **SQLite** (better-sqlite3) or **MySQL** (mysql2) database support
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
- **MySQL Server** (optional, if using MySQL instead of SQLite)

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
   # Copy example environment files
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   
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
   - Choose database type (SQLite recommended for development)
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

# Testing
npm run test              # Run all tests
cd frontend && npm test   # Frontend tests only
cd backend && npm test    # Backend tests only
```

## 📁 Project Structure

```
cableindex/
├── 📁 frontend/                    # React frontend application
│   ├── 📁 src/
│   │   ├── 📁 components/         # Reusable UI components
│   │   │   ├── 📁 admin/          # Admin panel components
│   │   │   ├── 📁 auth/           # Authentication forms
│   │   │   ├── 📁 dashboard/      # Dashboard widgets
│   │   │   ├── 📁 labels/         # Label generation components
│   │   │   ├── 📁 layout/         # Navigation and layout
│   │   │   ├── 📁 profile/        # User profile management
│   │   │   ├── 📁 sites/          # Site management components
│   │   │   └── 📁 ui/             # shadcn/ui base components
│   │   ├── 📁 contexts/           # React contexts (Auth, etc.)
│   │   ├── 📁 hooks/              # Custom React hooks
│   │   ├── 📁 lib/                # Utility functions and API client
│   │   ├── 📁 pages/              # Page components and routing
│   │   ├── 📁 test/               # Frontend test suites
│   │   └── 📁 types/              # TypeScript type definitions
│   ├── 📄 package.json            # Frontend dependencies
│   └── 📄 vite.config.ts          # Vite configuration
├── 📁 backend/                     # Express backend API
│   ├── 📁 src/
│   │   ├── 📁 database/           # Database connection and migrations
│   │   │   ├── 📁 adapters/       # SQLite and MySQL adapters
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
├── 📄 Dockerfile                  # Multi-stage Docker build
├── 📄 package.json                # Root package.json with scripts
└── 📄 README.md                   # This file
```

## 🔌 API Endpoints

### Authentication & User Management
- `POST /api/auth/login` - User authentication with JWT tokens
- `POST /api/auth/register` - User registration (if enabled)
- `POST /api/auth/refresh` - Refresh JWT access token
- `POST /api/auth/reset-password` - Password reset functionality
- `GET /api/users/profile` - Get current user profile
- `PUT /api/users/profile` - Update user profile information
- `PUT /api/users/password` - Change user password

### Sites Management
- `GET /api/sites` - List user-accessible sites
- `POST /api/sites` - Create new site
- `GET /api/sites/:id` - Get site details
- `PUT /api/sites/:id` - Update site information
- `DELETE /api/sites/:id` - Delete site (if no associated labels)

### Label Operations
- `GET /api/labels` - List user labels with filtering and pagination
- `POST /api/labels` - Create new cable label with auto-reference
- `GET /api/labels/:id` - Get specific label details
- `PUT /api/labels/:id` - Update existing label
- `DELETE /api/labels/:id` - Delete label
- `POST /api/labels/export` - Bulk export labels as ZPL files

### Label Generation
- `POST /api/labels/cable` - Generate cable label ZPL
- `POST /api/labels/port` - Generate port labels for switches
- `POST /api/labels/pdu` - Generate PDU port labels
- `GET /api/labels/download/:id` - Download label as ZPL file

### Admin Panel (Admin/Moderator only)
- `GET /api/admin/users` - List all system users
- `POST /api/admin/invite` - Send user invitation email
- `PUT /api/admin/users/:id/role` - Update user role
- `PUT /api/admin/users/:id/permissions` - Update user permissions
- `DELETE /api/admin/users/:id` - Deactivate user account
- `GET /api/admin/stats` - System statistics and analytics
- `GET /api/admin/settings` - Application configuration
- `PUT /api/admin/settings` - Update application settings

### Setup & Health
- `GET /api/health` - Health check endpoint for monitoring
- `GET /api/setup/status` - Check if initial setup is complete
- `POST /api/setup/database` - Configure database connection
- `POST /api/setup/admin` - Create initial admin account

## ⚙️ Configuration

### Backend Environment Variables (.env)

#### Core Application Settings
```bash
# Server Configuration
PORT=3001                                    # API server port
NODE_ENV=development                         # Environment mode
FRONTEND_URL=http://localhost:3000          # Frontend URL for CORS

# Authentication & Security
JWT_SECRET=your-super-secret-jwt-key        # JWT signing secret (CHANGE THIS!)
JWT_EXPIRES_IN=24h                          # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d                   # Refresh token expiration
BCRYPT_ROUNDS=12                            # Password hashing rounds

# Database Configuration
DB_TYPE=sqlite                              # Database type: 'sqlite' or 'mysql'

# SQLite Settings (when DB_TYPE=sqlite)
DATABASE_PATH=./data/cableindex.db       # SQLite database file path

# MySQL Settings (when DB_TYPE=mysql)
MYSQL_HOST=localhost                        # MySQL server host
MYSQL_PORT=3306                             # MySQL server port
MYSQL_USER=cableindex                    # MySQL username
MYSQL_PASSWORD=your_password                # MySQL password
MYSQL_DATABASE=cableindex                # MySQL database name
MYSQL_SSL=false                             # Enable SSL connection

# File Storage
UPLOADS_PATH=./uploads                      # File upload directory
```

### Frontend Environment Variables (.env)
```bash
# API Configuration
VITE_API_URL=http://localhost:3001/api      # Backend API base URL
VITE_APP_NAME=CableIndex                 # Application display name
```

### Database Selection Guide

#### SQLite (Recommended for most users)
- ✅ **Zero configuration** - works out of the box
- ✅ **Easy backup** - single file database
- ✅ **Perfect for single server** deployments
- ✅ **No external dependencies**
- ❌ Not suitable for multiple app instances

#### MySQL (For advanced deployments)
- ✅ **Scalable** - supports multiple app instances
- ✅ **High performance** for large datasets
- ✅ **Advanced features** - replication, clustering
- ✅ **Industry standard** database
- ❌ Requires separate MySQL server
- ❌ More complex setup and maintenance

### Docker Environment Variables
```bash
# Docker Compose Configuration
PORT=3000                                   # Host port mapping
JWT_SECRET=your-production-secret           # Production JWT secret
DATABASE_PATH=/app/data/cableindex.db    # Container database path
UPLOADS_PATH=/app/uploads                   # Container uploads path
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
# Run all tests
npm run test

# Frontend tests only
cd frontend && npm run test
cd frontend && npm run test:watch    # Watch mode

# Backend tests only
cd backend && npm run test
cd backend && npm run test:watch     # Watch mode

# Test with coverage
cd frontend && npm run test:coverage
cd backend && npm run test:coverage
```

### Test Database
Backend tests use an in-memory SQLite database to ensure:
- Fast test execution
- Isolated test environment
- No interference with development data
- Consistent test results

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
- SQLite: Creates tables and applies schema updates
- MySQL: Connects and applies migrations to existing database

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
6. Run tests: `npm run test`
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

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support & Troubleshooting

### Common Issues

**Database Connection Errors:**
- Verify database configuration in `.env`
- Check file permissions for SQLite database
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
- Check available disk space for SQLite
- Review memory usage in production
- Consider MySQL for high-traffic scenarios

---

**Built with ❤️ for professional wire and cable management**

## 🏷️ Label Generation

### Cable Labels
Generate professional cable labels with automatic reference numbering:

**Format**: `[SITE]-[REF] [SOURCE] > [DEST]`
**Example**: `DC1-001 Server-01 > Switch-A-Port-24`

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
- Download as .zpl or .txt files
- Print-ready formatting

## 🔐 User Roles & Permissions

### Admin
- **Full system access** - all features and settings
- **User management** - invite, modify roles, deactivate users
- **Application settings** - configure system behavior
- **Site management** - create, edit, delete any site
- **Label management** - access all labels across all sites
- **Analytics** - view system-wide statistics and reports

### Moderator
- **Advanced features** - bulk operations, advanced search
- **Limited user management** - view users, basic modifications
- **Site management** - create and manage assigned sites
- **Label management** - full access to assigned site labels
- **Reporting** - site-specific analytics and reports

### User
- **Basic functionality** - create and manage own labels
- **Site access** - view and use assigned sites only
- **Label database** - search and export own labels
- **Profile management** - update personal information
- **Dashboard** - personal statistics and quick actions

### Permission Matrix
| Feature | Admin | Moderator | User |
|---------|-------|-----------|------|
| Create Labels | ✅ | ✅ | ✅ |
| Manage Own Sites | ✅ | ✅ | ✅ |
| Manage All Sites | ✅ | ❌ | ❌ |
| User Management | ✅ | 👁️ | ❌ |
| System Settings | ✅ | ❌ | ❌ |
| View All Labels | ✅ | 🏢 | ❌ |
| Bulk Operations | ✅ | ✅ | ❌ |
| Analytics | ✅ | 🏢 | 👤 |

**Legend**: ✅ Full Access, 👁️ View Only, 🏢 Site-Specific, 👤 Personal Only, ❌ No Access
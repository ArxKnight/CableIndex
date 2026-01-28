# cableindex Docker Setup

## 🐳 Docker Deployment for Unraid

This guide will help you deploy cableindex on Unraid using Docker.

### Quick Start

1. **Build the Docker image:**
   ```bash
   docker build -t cableindex:latest .
   ```

2. **Run with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

### Unraid Installation

#### Method 1: Using Community Applications (Recommended)
1. Install "Community Applications" plugin if not already installed
2. Search for "cableindex" in Community Applications
3. Click "Install" and configure the settings

#### Method 2: Manual Template Installation
1. Copy the contents of `docker/unraid-template.xml`
2. In Unraid web interface, go to "Docker" tab
3. Click "Add Container"
4. Click "Template" and paste the XML content
5. Configure the settings as needed

### Configuration Options

#### Port Configuration
- **Host Port**: Set this to any available port on your Unraid server (e.g., 8080, 3000, etc.)
- **Container Port**: Keep this as 3000 (internal application port)

#### Volume Mappings
- **Data Directory**: `/mnt/user/appdata/cableindex/data` → `/app/data`
  - Contains the SQLite database and application data
- **Uploads Directory**: `/mnt/user/appdata/cableindex/uploads` → `/app/uploads`
  - Contains uploaded files and generated labels

#### Environment Variables
- **PORT**: Internal application port (default: 3000)
- **NODE_ENV**: Environment mode (default: production)
- **JWT_SECRET**: Secret key for authentication (auto-generated if empty)
- **DATABASE_PATH**: Path to SQLite database file (SQLite only)
- **DB_TYPE**: Database type - 'sqlite' or 'mysql' (default: sqlite)
- **MYSQL_HOST**: MySQL server hostname (MySQL only)
- **MYSQL_PORT**: MySQL server port (MySQL only, default: 3306)
- **MYSQL_USER**: MySQL username (MySQL only)
- **MYSQL_PASSWORD**: MySQL password (MySQL only)
- **MYSQL_DATABASE**: MySQL database name (MySQL only, default: cableindex)
- **MYSQL_SSL**: Enable SSL for MySQL connection (MySQL only, default: false)

### Example Unraid Docker Run Command

```bash
docker run -d \
  --name=cableindex \
  -p 8080:3000 \
  -v /mnt/user/appdata/cableindex/data:/app/data \
  -v /mnt/user/appdata/cableindex/uploads:/app/uploads \
  -e PORT=3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=your-secret-key-here \
  --restart unless-stopped \
  cableindex:latest
```

### Accessing the Application

After deployment, access cableindex at:
- **URL**: `http://YOUR_UNRAID_IP:HOST_PORT`
- **Example**: `http://192.168.1.100:8080`

### First-Time Setup

When you first access cableindex, you'll be presented with a setup wizard that allows you to:

1. **Choose Database Type**:
   - **SQLite** (Recommended): Simple, file-based database perfect for most users
   - **MySQL**: For advanced users who want to use an external MySQL server

2. **Configure Database Connection**:
   - For SQLite: Specify the database file location
   - For MySQL: Enter connection details (host, port, username, password, database name)

3. **Create Admin Account**: Set up the initial administrator user

4. **Complete Setup**: The system will initialize the database and create your admin account

### Database Options

#### SQLite (Default)
- **Pros**: Zero configuration, easy backup, perfect for single-server deployments
- **Cons**: Not suitable for multiple application instances
- **Best for**: Most Unraid users, home labs, small businesses

#### MySQL
- **Pros**: Supports multiple application instances, better for high-traffic scenarios
- **Cons**: Requires separate MySQL server, more complex setup
- **Best for**: Advanced users, multiple cableindex instances, existing MySQL infrastructure

### External MySQL Setup

If you choose MySQL during setup, you can:
1. Use an existing MySQL server on your network
2. Run a separate MySQL container on Unraid
3. Use a cloud MySQL service

Example MySQL container setup for Unraid:
```bash
docker run -d \
  --name=mysql-cableindex \
  -e MYSQL_ROOT_PASSWORD=your_password \
  -e MYSQL_DATABASE=cableindex \
  -v /mnt/user/appdata/mysql-cableindex:/var/lib/mysql \
  -p 3306:3306 \
  mysql:8.0
```

### Data Persistence

All data is stored in the mounted volumes:
- Database: `/mnt/user/appdata/cableindex/data/cableindex.db`
- Uploads: `/mnt/user/appdata/cableindex/uploads/`

### Backup

To backup your cableindex data:
1. Stop the container
2. Copy the entire `/mnt/user/appdata/cableindex/` directory
3. Restart the container

### Troubleshooting

#### Container Won't Start
- Check Unraid logs: `docker logs cableindex`
- Verify port is not in use by another container
- Ensure volume paths exist and have correct permissions

#### Can't Access Web Interface
- Verify the port mapping is correct
- Check if Unraid firewall is blocking the port
- Ensure container is running: `docker ps`

#### Database Issues
- Check volume permissions
- Verify the data directory is writable
- Look for errors in container logs

### Updates

To update cableindex:
1. Stop the container
2. Pull the latest image: `docker pull cableindex:latest`
3. Restart the container with the same configuration

### Support

For issues and support:
- Check the container logs first
- Review this documentation
- Create an issue on the project repository
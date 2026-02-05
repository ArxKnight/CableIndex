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
- **Data Directory**: `/mnt/user/appdata/cableindex/data` → `/app/data` (optional)
  - Contains small app marker files (e.g., setup completion marker)
- **Uploads Directory**: `/mnt/user/appdata/cableindex/uploads` → `/app/uploads` (optional)
  - Optional persistence location if you add/use uploaded or generated files

#### Environment Variables
- **PORT**: Internal application port (default: 3000)
- **NODE_ENV**: Environment mode (default: production)
- **JWT_SECRET**: Secret key for authentication (auto-generated if empty)
- **MYSQL_HOST**: MySQL server hostname
- **MYSQL_PORT**: MySQL server port (default: 3306)
- **MYSQL_USER**: MySQL username
- **MYSQL_PASSWORD**: MySQL password
- **MYSQL_DATABASE**: MySQL database name (default: cableindex)
- **MYSQL_SSL**: Enable SSL for MySQL connection (default: false)

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

1. **Configure MySQL Connection**: Enter connection details (host, port, username, password, database name)
2. **Create Admin Account**: Set up the initial administrator user
3. **Complete Setup**: The system will initialize the database and create your admin account

### External MySQL Setup

CableIndex requires MySQL. You can:
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

CableIndex is MySQL-only. Persist your database by persisting your MySQL server/container data.

Optional mounts:
- Marker files: `/mnt/user/appdata/cableindex/data/`
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
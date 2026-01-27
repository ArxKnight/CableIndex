import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeDatabase, setupDatabaseShutdown } from './database/init.js';
import connection from './database/connection.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'cable-manager-backend'
  });
});

// Routes will be imported after database initialization

app.get('/api', (req, res) => {
  res.json({
    message: 'Cable Manager API',
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler for API routes only
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    // Check if setup is complete
    const setupFile = path.join(process.cwd(), 'data', '.setup-complete');
    const isSetupComplete = fs.existsSync(setupFile);
    
    if (!isSetupComplete) {
      console.log('⚠️  Setup not complete. Setup wizard will be available at /setup');
      // Don't initialize database yet - let setup wizard handle it
    } else {
      // Initialize database with saved configuration
      await connection.connect();
      
      // Initialize database
      await initializeDatabase({
        runMigrations: true,
        seedData: process.env.NODE_ENV === 'development'
      });
    }

    // Setup graceful shutdown
    setupDatabaseShutdown();

    // Import and setup routes after database is initialized
    const { authRoutes, userRoutes, adminRoutes, siteRoutes, labelRoutes } = await import('./routes/index.js');
    const setupRoutes = (await import('./routes/setup.js')).default;
    
    // Setup routes (available before authentication)
    app.use('/api/setup', setupRoutes);
    
    // API routes (only if setup is complete)
    if (isSetupComplete) {
      app.use('/api/auth', authRoutes);
      app.use('/api/users', userRoutes);
      app.use('/api/admin', adminRoutes);
      app.use('/api/sites', siteRoutes);
      app.use('/api/labels', labelRoutes);
    }

    // Serve static files from frontend build in production
    if (process.env.NODE_ENV === 'production') {
      const frontendPath = path.join(__dirname, '../../frontend/dist');
      app.use(express.static(frontendPath));
      
      // Handle client-side routing - serve index.html for all non-API routes
      app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
          res.sendFile(path.join(frontendPath, 'index.html'));
        } else {
          res.status(404).json({ error: 'API route not found' });
        }
      });
    }

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 API available at http://localhost:${PORT}/api`);
      if (isSetupComplete) {
        console.log(`💾 Database initialized successfully`);
      } else {
        console.log(`⚙️  Setup required - visit http://localhost:${PORT} to configure`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
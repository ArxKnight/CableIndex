import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, setupDatabaseShutdown } from './database/init.js';
import connection from './database/connection.js';
import { isSetupComplete } from './utils/setup.js';
import { authRoutes, userRoutes, adminRoutes, siteRoutes, labelRoutes } from './routes/index.js';
import setupRoutes from './routes/setup.js';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP to allow Vite's inline scripts
  crossOriginEmbedderPolicy: false, // Disable COEP
  crossOriginResourcePolicy: false, // Disable CORP
}));
app.use(cors({
  origin: true, // Allow all origins in production (serving static frontend)
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
    service: 'infradb-backend'
  });
});

// Routes will be imported after database initialization

app.get('/api', (req, res) => {
  res.json({
    message: 'InfraDB API',
    version: '1.0.0'
  });
});

// Routes
// In test mode, we register routes immediately and bypass setup gating.
// In non-test modes, we keep the setup middleware that blocks until setup completes.
app.use('/api/setup', setupRoutes);

if (process.env.NODE_ENV !== 'test') {
  // Shared middleware to ensure setup is complete and database is ready
  app.use('/api', async (req, res, next) => {
    const setupComplete = await isSetupComplete();
    if (!setupComplete) {
      return res.status(503).json({ success: false, error: 'Setup required', setupRequired: true });
    }

    if (!connection.isConnected()) {
      try {
        console.log('🔄 Lazy initializing database after setup completion...');
        await connection.connect();
        await initializeDatabase({
          runMigrations: true,
          seedData: process.env.NODE_ENV === 'development'
        });
        console.log('✅ Database lazily initialized');
      } catch (err) {
        console.error('Failed to lazy initialize database:', err);
        return res.status(500).json({ success: false, error: 'Database initialization failed' });
      }
    }

    next();
  });
}

// Always register API routes; middleware above blocks if setup incomplete
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/labels', labelRoutes);

// 404 handler for API routes (must be after route registration)
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Unhandled error in request:', req.method, req.path);
  console.error('Error:', err);
  console.error('Stack trace:', err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    path: req.path
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Check if setup is complete (env flag, marker file, or database user check)
    const setupComplete = await isSetupComplete();
    
    if (!setupComplete) {
      console.log('⚠️  Setup not complete. Setup wizard will be available at /setup');
      // Don't initialize database yet - let setup wizard handle it
    } else {
      console.log('✅ Setup complete. Initializing database...');
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

    console.log('✅ Routes registered');

    // Serve static files from frontend build in production
    if (process.env.NODE_ENV === 'production') {
      const frontendPath = path.join(__dirname, '../../frontend/dist');
      const frontendPublicPath = path.join(__dirname, '../../frontend/public');
      app.use(express.static(frontendPath));
      app.use(express.static(frontendPublicPath));
      
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
      if (setupComplete) {
        console.log(`💾 Database initialized successfully`);
      } else {
        console.log(`⚙️  Setup required - visit http://localhost:${PORT} to configure`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    if (error instanceof Error) {
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Start the server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
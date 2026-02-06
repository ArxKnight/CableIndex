import dotenv from 'dotenv';

// Load optional test env file first, without overriding any vars already provided by the shell/CI.
dotenv.config({ path: '.env.test', override: false });

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

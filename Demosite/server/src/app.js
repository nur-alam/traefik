import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import siteRoutes from './routes/siteRoutes.js';
import cleanupExpiredSites from './cleanup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(express.json());

// Set up EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/', siteRoutes);

// Cron job for cleanup - runs every hour
cron.schedule('0 */1 * * *', async () => {
    try {
        console.log('🧹 Running scheduled cleanup...');
        await cleanupExpiredSites();
        console.log('✅ Scheduled cleanup completed');
    } catch (error) {
        console.error('❌ Scheduled cleanup failed:', error);
    }
});

export default app;
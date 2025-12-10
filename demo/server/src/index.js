import express from 'express';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { nanoid } from 'nanoid';
import cron from 'node-cron';
import cleanupExpiredSites from './cleanup.js';
import docker from './docker.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'node:child_process';
import router from './router/index.js';
import pool from './db/index.js';
import { createDemoSitesTable } from './db/migrations/migrations.js';
import { goldenImageCreation, sitePoolInitialization } from './app-initialize.js';

// load env file
dotenv.config();

// Migrations, db schema creation like table creation
await createDemoSitesTable();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());


// Set up EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, './views'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api', router);

// Render the main UI page
app.get('/', (req, res) => {
	res.render('index');
});


app.listen(4000, async () => {
	console.log('🚀 Demoserver backend running on port 4000 with docker engine');

	goldenImageCreation();
	sitePoolInitialization();
});


cron.schedule('0 * * * *', async () => {
    try {
        await cleanupExpiredSites();
    } catch (err) {
        console.error('Cleanup cron error:', err);
    }
});

// Remove container after 10 min which is create by /create-site api using cron job
app.post('/cleanup', async (req, res) => {
	try {
		await cleanupExpiredSites();
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

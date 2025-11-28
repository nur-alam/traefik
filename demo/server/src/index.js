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

// load env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Set up EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api', router);

// Render the main UI page
app.get('/', (req, res) => {
	res.render('index');
});

cron.schedule('0 */1 * * *', async () => {
	try {
		await cleanupExpiredSites();
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: err.message });
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


let goldenImageCreating = false;

async function goldenImageExists() {
	try {
		await docker.images.inspect('wp-golden:latest');
		return true;
	} catch (err) {
		return false;
	}
}

app.listen(4000, async () => {
	console.log('🚀 Demoserver backend running on port 4000');

	if (!goldenImageExists() && !goldenImageCreating) {
	// if (true) {
		goldenImageCreating = true;
		// const worker = fork('./goldenImage.js');
		const workerScript = path.join(__dirname, 'goldenImage.js');
		const worker = fork(workerScript, { stdio: 'inherit' });
		worker.on('exit', (code) => {
			goldenImageCreating = false;
			if (code === 0) {
				console.log('Main Golden image created successfully!');
			} else {
				console.error(`Golden image creation process exited with code ${code}`);
			}
		});
	} else {
		console.log('Golden image already exists or is being created, skipping.');
	}
});

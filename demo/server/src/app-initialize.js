import pool from './db/index.js';
import { fileURLToPath } from 'url';
import path from 'path';
import { fork } from 'node:child_process';
import docker from './docker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let goldenImageCreating = false;
let sitePoolInitializing = false;

async function goldenImageExists() {
	try {
		// Check if the golden image exists
		const image = await docker.getImage('wp-golden:latest');
		const imageInfo = await image.inspect();
		return true;
	} catch (err) {
		console.log('Golden image exists: err ', err);
		return false;
	}
}

export const goldenImageCreation = async () => {
	try { 
		if (!(await goldenImageExists()) && !goldenImageCreating) {
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
	} catch (err) {
		console.error('Golden image check failed:', err);
	}
}

export const sitePoolInitialization = async () => {
	try {
		const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM sitepool');
		if (cnt < 2 && !sitePoolInitializing) {
			sitePoolInitializing = true;
			const poolWorkerScript = path.join(__dirname, 'initPool.js');
			const poolWorker = fork(poolWorkerScript, { stdio: 'inherit' });
			poolWorker.on('exit', (code) => {
				sitePoolInitializing = false;
				if (code === 0) {
					console.log('Site pool initialized successfully!');
				} else {
					console.error(`Site pool init process exited with code ${code}`);
				}
			});
		} else {
			console.log('Site pool already initialized, skipping.');
		}
	} catch (err) {
		console.error('Site pool init check failed:', err);
	}
}
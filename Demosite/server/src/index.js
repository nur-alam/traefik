import express from 'express';
import mysql from 'mysql2/promise';
import { nanoid } from 'nanoid';
import cron from 'node-cron';
import cleanupExpiredSites from './cleanup.js';
import docker from './docker.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Set up EJS as template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

const {
	DB_ROOT_PASSWORD = 'root',
	DB_HOST = 'mysql',
	TRAEFIK_NETWORK = 'traefik',
	DOMAIN_SUFFIX = 'tutor.localhost',
} = process.env;

// SSL utility functions
const verifySSL = async (domain) => {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
		
		const response = await fetch(`https://${domain}`, {
			method: 'HEAD',
			signal: controller.signal,
		});
		
		clearTimeout(timeoutId);
		return response.ok;
	} catch (error) {
		console.log(`⚠️ SSL verification failed for ${domain}:`, error.message);
		return false;
	}
};

const pool = mysql.createPool({
	host: DB_HOST,
	user: 'root',
	password: DB_ROOT_PASSWORD,
});

// Render the main UI page
app.get('/', (req, res) => {
	res.render('index');
});

// API endpoint to get all active sites
app.get('/sites', async (req, res) => {
	try {
		const containers = await docker.listContainers({
			all: false,
			filters: {
				label: ['demoserver.created_at']
			}
		});

		const sites = await Promise.all(containers.map(async container => {
			const labels = container.Labels;
			const subdomainRule = Object.keys(labels)
				.find(key => key.startsWith('traefik.http.routers.') && key.endsWith('.rule'));
			const subdomain = subdomainRule ? labels[subdomainRule]?.match(/Host\(`([^`]+)`\)/)?.[1] : null;

			// Get database password from MySQL
			const dbUser = labels['demoserver.dbuser'];
			let adminPass = 'N/A';
			
			if (dbUser) {
				try {
					const [rows] = await pool.query(
						`SELECT authentication_string FROM mysql.user WHERE user = ? LIMIT 1`,
						[dbUser]
					);
					// Since we can't decrypt the password, we'll need to store it in the container env
					// For now, we'll get it from the container inspect
					const containerInfo = await docker.getContainer(container.Id).inspect();
					const envVars = containerInfo.Config.Env || [];
					const passEnv = envVars.find(env => env.startsWith('WP_ADMIN_PASS='));
					adminPass = passEnv ? passEnv.split('=')[1] : 'N/A';
				} catch (error) {
					console.error('Error fetching password:', error);
				}
			}

			// Try to get auto-login token
			let autoLoginToken = null;
			try {
				const containerObj = docker.getContainer(container.Id);
				const execResult = await containerObj.exec({
					Cmd: ['cat', '/var/www/html/auto-login-token.txt'],
					AttachStdout: true,
					AttachStderr: true,
				});
				const stream = await execResult.start();
				let output = '';
				stream.on('data', (chunk) => {
					output += chunk.toString();
				});
				await new Promise((resolve) => stream.on('end', resolve));
				
				const match = output.match(/AUTO_LOGIN_TOKEN=([a-f0-9]+)/);
				if (match) {
					autoLoginToken = match[1];
				}
			} catch (err) {
				// Token not available
			}

			const loginUrl = autoLoginToken && subdomain
				? `https://${subdomain}?auto_login_token=${autoLoginToken}`
				: subdomain ? `https://${subdomain}/wp-admin` : 'N/A';

			return {
				id: container.Id.substring(0, 12),
				name: container.Names[0].substring(1), // Remove leading slash
				url: subdomain ? `https://${subdomain}` : 'N/A',
				login_url: loginUrl,
				username: labels['demoserver.username'] || 'Unknown',
				created_at: labels['demoserver.created_at'],
				dbname: labels['demoserver.dbname'],
				admin_user: 'admin',
				admin_pass: adminPass,
				status: container.State
			};
		}));

		// Sort by creation time (newest first)
		sites.sort((a, b) => parseInt(b.created_at) - parseInt(a.created_at));

		res.json({ success: true, sites });
	} catch (error) {
		console.error('❌ Error fetching sites:', error);
		res.status(500).json({ success: false, error: error.message });
	}
});

app.post('/create-site', async (req, res) => {
	try {
		const username = req.body.username || `user_${nanoid(4)}`;
		const id = nanoid(6);
		const dbName = `demo_${id}`;
		const dbUser = `user_${id}`;
		const dbPass = nanoid(10);
		const subdomain = `${id}.${DOMAIN_SUFFIX}`;

		console.log(`🟢 Creating new site: ${subdomain}`);

		// 1️⃣ Create DB + user
		await pool.query(`CREATE DATABASE \`${dbName}\``);
		await pool.query(`CREATE USER '${dbUser}'@'%' IDENTIFIED BY '${dbPass}'`);
		await pool.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%'`);
		await pool.query(`FLUSH PRIVILEGES`);

		// 2️⃣ Create WordPress container
		const container = await docker.createContainer({
			Image: 'wordpress-base',
			name: `wp_${id}`,
			Env: [
				`WORDPRESS_DB_HOST=${DB_HOST}:3306`,
				`WORDPRESS_DB_USER=${dbUser}`,
				`WORDPRESS_DB_PASSWORD=${dbPass}`,
				`WORDPRESS_DB_NAME=${dbName}`,
				`WP_SITE_TITLE=Demo ${username}`,
				`WP_ADMIN_USER=admin`,
				`WP_ADMIN_PASS=${dbPass}`,
				`WP_ADMIN_EMAIL=admin@${subdomain}`,
				`WP_SITE_URL=https://${subdomain}`,
			],
			Labels: {
				'traefik.enable': 'true',
				// HTTP router (redirects to HTTPS)
				[`traefik.http.routers.${id}.rule`]: `Host(\`${subdomain}\`)`,
				[`traefik.http.routers.${id}.entrypoints`]: 'web',
				[`traefik.http.routers.${id}.middlewares`]: 'redirect-to-https',
				// HTTPS router
				[`traefik.http.routers.${id}-secure.rule`]: `Host(\`${subdomain}\`)`,
				[`traefik.http.routers.${id}-secure.entrypoints`]: 'websecure',
				[`traefik.http.routers.${id}-secure.tls`]: 'true',
				[`traefik.http.routers.${id}-secure.service`]: `${id}`,
				// Service configuration
				[`traefik.http.services.${id}.loadbalancer.server.port`]: '80',
				'traefik.docker.network': TRAEFIK_NETWORK,
				'demoserver.created_at': Date.now().toString(),
				'demoserver.username': username,
				'demoserver.dbname': dbName,
				'demoserver.dbuser': dbUser,
			},
			HostConfig: {
				Memory: 512 * 1024 * 1024, // 512MB
			},
			NetworkingConfig: {
				EndpointsConfig: {
					[TRAEFIK_NETWORK]: {},
				},
			},
		});

		await container.start();

		// 3️⃣ Wait for WordPress to be fully ready
		console.log('⏳ Waiting for WordPress to install and be ready...');
		
		// Poll for WordPress readiness instead of blind wait
		const maxAttempts = 40; // 20 seconds max
		let attempts = 0;
		let isReady = false;
		
		while (attempts < maxAttempts && !isReady) {
			try {
				// Check if auto-login token file exists (indicates WP is fully installed)
				const execResult = await container.exec({
					Cmd: ['test', '-f', '/var/www/html/auto-login-token.txt'],
					AttachStdout: true,
					AttachStderr: false,
				});
				
				const stream = await execResult.start();
				
				// Wait for stream to end with timeout
				await Promise.race([
					new Promise((resolve) => stream.on('end', resolve)),
					new Promise((resolve) => setTimeout(resolve, 1000)) // 1 second timeout per check
				]);
				
				// Check exit code
				const inspection = await execResult.inspect();
				if (inspection.ExitCode === 0) {
					isReady = true;
					console.log(`✅ WordPress ready after ${attempts * 0.5}s`);
					break;
				}
			} catch (err) {
				// Container might not be ready yet, continue polling
			}
			
			await new Promise((resolve) => setTimeout(resolve, 500)); // Check every 0.5s
			attempts++;
		}
		
		if (!isReady) {
			console.log('⚠️ WordPress may not be fully ready, but continuing...');
		}

		// 4️⃣ Get auto-login token
		let autoLoginToken = null;
		try {
			const execResult = await container.exec({
				Cmd: ['cat', '/var/www/html/auto-login-token.txt'],
				AttachStdout: true,
				AttachStderr: false,
			});
			const stream = await execResult.start();
			let output = '';
			stream.on('data', (chunk) => {
				output += chunk.toString();
			});
			
			// Wait for stream to end with timeout
			await Promise.race([
				new Promise((resolve) => stream.on('end', resolve)),
				new Promise((resolve) => setTimeout(resolve, 2000)) // 2 second timeout
			]);
			
			const match = output.match(/AUTO_LOGIN_TOKEN=([a-f0-9]+)/);
			if (match) {
				autoLoginToken = match[1];
				console.log('✅ Auto-login token retrieved');
			}
		} catch (err) {
			console.log('⚠️ Could not retrieve auto-login token:', err.message);
		}

		// 5️⃣ Build response and send immediately
		const loginUrl = autoLoginToken 
			? `https://${subdomain}?auto_login_token=${autoLoginToken}`
			: `https://${subdomain}/wp-admin`;
		
		// Send response immediately without waiting for SSL verification
		res.json({
			success: true,
			url: `https://${subdomain}`,
			login_url: loginUrl,
			ssl_enabled: true, // Assume SSL works (Traefik handles it)
			db: dbName,
			db_user: dbUser,
			db_pass: dbPass,
			admin_user: 'admin',
			admin_pass: dbPass,
		});
		
		// Verify SSL in background (non-blocking)
		verifySSL(subdomain).then(sslWorking => {
			console.log(`🔒 SSL verification for ${subdomain}: ${sslWorking ? '✅' : '⚠️'}`);
		});
	} catch (err) {
		console.error('❌ Error creating site:', err);
		res.status(500).json({ error: err.message });
	}
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

app.listen(4000, () => console.log('🚀 Demoserver backend running on port 4000'));

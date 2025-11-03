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
		const response = await fetch(`https://${domain}`, {
			method: 'HEAD',
			timeout: 5000,
		});
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

		const sites = containers.map(container => {
			const labels = container.Labels;
			const subdomainRule = Object.keys(labels)
				.find(key => key.startsWith('traefik.http.routers.') && key.endsWith('.rule'));
			const subdomain = subdomainRule ? labels[subdomainRule]?.match(/Host\(`([^`]+)`\)/)?.[1] : null;

			return {
				id: container.Id.substring(0, 12),
				name: container.Names[0].substring(1), // Remove leading slash
				url: subdomain ? `https://${subdomain}` : 'N/A',
				username: labels['demoserver.username'] || 'Unknown',
				created_at: labels['demoserver.created_at'],
				dbname: labels['demoserver.dbname'],
				status: container.State
			};
		});

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
		console.log('⏳ Waiting for WordPress to be ready...');
		// wait 5 sec for WordPress to be ready
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// 4️⃣ Verify SSL is working
		console.log('🔒 Verifying SSL...');
		const sslWorking = await verifySSL(subdomain);
		
		res.json({
			success: true,
			url: `https://${subdomain}`,
			ssl_enabled: sslWorking,
			db: dbName,
			db_user: dbUser,
			db_pass: dbPass,
			admin_user: 'admin',
			admin_pass: dbPass,
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

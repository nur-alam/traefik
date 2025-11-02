import express from 'express';
import Docker from 'dockerode';
import mysql from 'mysql2/promise';
import { nanoid } from 'nanoid';
import cron from 'node-cron';
import cleanupExpiredSites from './cleanup.js';
import docker, { execShell } from './docker.js';

const app = express();
app.use(express.json());

const {
	DB_ROOT_PASSWORD = 'root',
	DB_HOST = 'mysql',
	TRAEFIK_NETWORK = 'traefik',
	DOMAIN_SUFFIX = 'tutor.localhost',
} = process.env;

const pool = mysql.createPool({
	host: DB_HOST,
	user: 'root',
	password: DB_ROOT_PASSWORD,
});

app.get('/', (req, res) => {
	res.send('Server running on port 4000 👋');
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
				`WP_SITE_URL=http://${subdomain}`,
			],
			Labels: {
				'traefik.enable': 'true',
				[`traefik.http.routers.${id}.rule`]: `Host(\`${subdomain}\`)`,
				[`traefik.http.routers.${id}.entrypoints`]: 'web',
				[`traefik.http.routers.${id}.service`]: `${id}`,
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

		res.json({
			success: true,
			url: `http://${subdomain}`,
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

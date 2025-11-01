import express from 'express';
import Docker from 'dockerode';
import mysql from 'mysql2/promise';
import { nanoid } from 'nanoid';

const app = express();
app.use(express.json());

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const {
	MYSQL_ROOT_PASSWORD = 'root',
	DB_HOST = 'mysql',
	TRAEFIK_NETWORK = 'traefik',
	DOMAIN_SUFFIX = 'demo.localhost',
} = process.env;

const pool = mysql.createPool({
	host: DB_HOST,
	user: 'root',
	password: MYSQL_ROOT_PASSWORD,
});

app.get('/', (req, res) => {
	res.send('Server running on port 4000 👋 juicy');
});

app.post('/create-site', async (req, res) => {
	// return res.json({ success: true });
	try {
		const id = nanoid(6);
		const dbName = `demo_${id}`;
		const dbUser = `user_${id}`;
		const dbPass = nanoid(10);
		const subdomain = `${id}.${DOMAIN_SUFFIX}`;

		console.log(`🟢 Creating new site: ${subdomain}`);

		// 1️⃣ Create DB + user
		// 1️⃣ Create DB + user (run statements individually)
		await pool.query(`CREATE DATABASE \`${dbName}\``);
		await pool.query(`CREATE USER '${dbUser}'@'%' IDENTIFIED BY '${dbPass}'`);
		await pool.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%'`);
		await pool.query(`FLUSH PRIVILEGES`);

		// 2️⃣ Create WordPress container
		const container = await docker.createContainer({
			Image: 'wordpress:latest',
			name: `wp_${id}`,
			Env: [
				`WORDPRESS_DB_HOST=${DB_HOST}:3306`,
				`WORDPRESS_DB_USER=${dbUser}`,
				`WORDPRESS_DB_PASSWORD=${dbPass}`,
				`WORDPRESS_DB_NAME=${dbName}`,
			],
			Labels: {
				'traefik.enable': 'true',
				[`traefik.http.routers.${id}.rule`]: `Host(\`${subdomain}\`)`,
				[`traefik.http.routers.${id}.entrypoints`]: 'web',
				[`traefik.http.routers.${id}.service`]: `${id}`,
				[`traefik.http.services.${id}.loadbalancer.server.port`]: '80',
				'traefik.docker.network': TRAEFIK_NETWORK,
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

		// Connect to internal network for MySQL access
		const internalNetwork = docker.getNetwork('demosite_internal');
		await internalNetwork.connect({
			Container: container.id,
		});

		res.json({
			success: true,
			url: `http://${subdomain}`,
			db: dbName,
			user: dbUser,
			pass: dbPass,
		});
	} catch (err) {
		console.error('❌ Error creating site:', err);
		res.status(500).json({ error: err.message });
	}
});

app.listen(4000, () => console.log('🚀 Demoserver backend running on port 4000'));

import { execSync } from 'node:child_process';
import fs, { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import docker from '../docker.js';
import pool from '../db/index.js';
import { nanoid } from 'nanoid';
import { DOMAIN_SUFFIX } from '../config/index.js';
import { DB_HOST, TRAEFIK_NETWORK } from '../config/index.js';
import { execShell, waitForWordPressReady } from '../utils/dockerUitls.js';

const GOLDEN_SQL = process.env.GOLDEN_SQL_PATH || 'backups/golden.sql';

export const getSites = async (req, res) => {
    try {
        // Get all site from db
        const [rows] = await pool.query(`SELECT * FROM sites`);
        if (rows.length === 0) {
            return res.json({ success: true, sites: [] });
        }

        // Get all site from docker (optional; currently unused)

		const sites = rows.map(row => {
			return {
				id: row.id,
				name: row.siteurl, // Remove leading slash
				siteurl: row.siteurl,
				user: row.user || 'Unknown',
				password: row.password || 'Unknown',
				db_name: row.db_name,
				db_user: row.db_user,
				db_pass: row.db_pass,
				status: row.State,
				created_at: row.created_at,
			};
		});

		// Sort by creation time (newest first)
		sites.sort((a, b) => parseInt(b.created_at) - parseInt(a.created_at));

		res.json({ success: true, sites });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

export const getSite = async (req, res) => {
	try {
		// await pool.query(`INSERT INTO sitepool (id, containerid, siteurl, user, password, email, db_name, db_user, db_pass) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
		// 	1,
		// 	'containerId',
		// 	`https://`,
		// 	'username',
		// 	'req.body.password || containerId',
		// 	'req.body.email',
		// 	'dbName',
		// 	'dbUser',
		// 	'dbPass',
		// ]);
		const [rows] = await pool.query(`SELECT * FROM sitepool limit 1`);

		if (rows.length !== 0) {
			await pool.query(`DELETE FROM sitepool WHERE id = ?`, [rows[0].id]);

			await pool.query(
				`INSERT INTO sites (containerid, siteurl, user, password, db_name, db_user, db_pass) VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[
					rows[0].containerid,
					rows[0].siteurl,
					rows[0].user,
					rows[0].password,
					rows[0].db_name,
					rows[0].db_user,
					rows[0].db_pass,
				]
			);
			// keep pool size up to 2 in background
			try {
				const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM sitepool');
				if (cnt < 2) {
					const { fork } = await import('node:child_process');
					const { fileURLToPath } = await import('url');
					const { default: path } = await import('path');
					const __filename = fileURLToPath(import.meta.url);
					const __dirname = path.dirname(__filename);
					const workerScript = path.join(__dirname, '../initPool.js');
					fork(workerScript, { stdio: 'inherit' });
				}
			} catch (_) {}
			return res.json({ success: true, site: rows[0] });
		}
		// Otherwise create site if it doesn't exist
		const site = await createSite();
		await pool.query(`INSERT INTO sites (containerid, siteurl, user, password, db_name, db_user, db_pass) VALUES ('${site.containerId}', '${site.siteurl}', '${site.user}', '${site.password}', '${site.dbName}', '${site.dbUser}', '${site.dbPass}')`);
		
		// keep pool size up to 2 in background
		try {
			const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM sitepool');
			if (cnt < 2) {
				const { fork } = await import('node:child_process');
				const { fileURLToPath } = await import('url');
				const { default: path } = await import('path');
				const __filename = fileURLToPath(import.meta.url);
				const __dirname = path.dirname(__filename);
				const workerScript = path.join(__dirname, '../initPool.js');
				fork(workerScript, { stdio: 'inherit' });
			}
		} catch (_) { }
		
		res.json({ success: true, site });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

export const createSite = async () => {
	// const goldenContainerName = 'wp_golden';
	const containerId = nanoid(6).toLowerCase();
	const containerName = `wp_${containerId}`;
	const dbName = `wp_${containerId}`;
	// const username = req.body.username || containerId;
	const dbUser = `db_${containerId}`;
	const dbPass = nanoid(10);
	const subdomain = `${containerId}.${DOMAIN_SUFFIX}`;
	const port = 10000 + containerId;

	// Create DB + user
	await pool.query(`CREATE DATABASE \`${dbName}\``);
	await pool.query(`CREATE USER '${dbUser}'@'%' IDENTIFIED BY '${dbPass}'`);
	await pool.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%'`);
	await pool.query(`FLUSH PRIVILEGES`);

	// Import golden database
	await dumpDb(dbName);
	
	// Build config injection for wp-config.php
    // const configExtra = [
    //     "if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {",
    //     "    $_SERVER['HTTPS'] = 'on';",
    //     "}",
    //     `define('WP_HOME', 'https://${subdomain}');`,
    //     `define('WP_SITEURL', 'https://${subdomain}');`,
    //     // Optional: enforce SSL in admin (safe after HTTPS works)
    //     "define('FORCE_SSL_ADMIN', true);",
    // ].join("\n");
	
	// 2️⃣ Create WordPress container
	const container = await docker.createContainer({
		Image: 'wp-golden',
		name: containerName,
		Env: [
			`WORDPRESS_DB_HOST=${DB_HOST}:3306`,
			`WORDPRESS_DB_USER=${dbUser}`,
			`WORDPRESS_DB_PASSWORD=${dbPass}`,
			`WORDPRESS_DB_NAME=${dbName}`,
			`WP_SITE_TITLE=Demo Site`,
			`WP_ADMIN_USER=admin`,
			`WP_ADMIN_PASS=demo`,
			`WP_ADMIN_EMAIL=admin@${subdomain}`,
			`WP_SITE_URL=https://${subdomain}`,
			// Inject proxy-aware HTTPS and site URLs into wp-config
			// `WORDPRESS_CONFIG_EXTRA=${configExtra}`,
		],
		Labels: {
			'traefik.enable': 'true',
			// HTTP router (redirects to HTTPS)
			[`traefik.http.routers.${containerId}.rule`]: `Host(\`${subdomain}\`)`,
			[`traefik.http.routers.${containerId}.entrypoints`]: 'web',
			[`traefik.http.routers.${containerId}.middlewares`]: 'redirect-to-https@file',
			// HTTPS router
			[`traefik.http.routers.${containerId}-secure.rule`]: `Host(\`${subdomain}\`)`,
			[`traefik.http.routers.${containerId}-secure.entrypoints`]: 'websecure',
			[`traefik.http.routers.${containerId}-secure.tls`]: 'true',
			// [`traefik.http.routers.${containerId}-secure.middlewares`]: 'wordpress-headers@file',
			[`traefik.http.routers.${containerId}-secure.tls.certresolver`]: 'letsencrypt',
			[`traefik.http.routers.${containerId}-secure.service`]: `${containerId}`,
			[`traefik.http.routers.${containerId}-secure.tls.domains[0].main`]: 'wptriggermail.com',
			[`traefik.http.routers.${containerId}-secure.tls.domains[0].sans`]: '*.wptriggermail.com',
			// Service configuration
			[`traefik.http.services.${containerId}.loadbalancer.server.port`]: '80',
			'traefik.docker.network': TRAEFIK_NETWORK,
			'demoserver.created_at': Date.now().toString(),
			'demoserver.siteurl': `https://${subdomain}`,
			'demoserver.user': 'admin',
			'demoserver.password': containerId,
			'demoserver.db_name': dbName,
			'demoserver.db_user': dbUser,
			'demoserver.db_pass': dbPass,
		},
		HostConfig: {
			Memory: 1024 * 1024 * 1024, // 1GB
		},
		NetworkingConfig: {
			EndpointsConfig: {
				[TRAEFIK_NETWORK]: {},
			},
		},
	});

	await container.start();

	// Wait until WordPress is fully ready
	await waitForWordPressReady(container);

	// update admin password as container id
	await execShell(container, `wp user update admin --user_pass=${containerId} --allow-root --path=/var/www/html`);

    // Update URLs via WP‑CLI (no backticks)
    const homeCmd = 'wp option update home "https://' + subdomain + '" --allow-root --path=/var/www/html';
    const homeRes = await execShell(container, homeCmd);
    if (homeRes.exitCode !== 0) {
        throw new Error("Failed to update home: " + (homeRes.stderr || homeRes.stdout));
    }

    const siteurlCmd = 'wp option update siteurl "https://' + subdomain + '" --allow-root --path=/var/www/html';
    const siteurlRes = await execShell(container, siteurlCmd);
    if (siteurlRes.exitCode !== 0) {
        throw new Error("Failed to update siteurl: " + (siteurlRes.stderr || siteurlRes.stdout));
	}

	return {
		containerId,
		siteurl: `https://${subdomain}`,
		user: 'admin',
		password: containerId,
		db_name: dbName,
		db_user: dbUser,
		db_pass: dbPass,
	}
	

    // Final response
    // res.json({
    //     success: true,
	//     siteurl: `https://${subdomain}`,
    //     user: 'admin',
    //     password: containerId,
    //     db_name: dbName,
    //     db_user: dbUser,
    //     db_pass: dbPass,
	// });
}

export const dumpDb = async (dbName) => {
    const mysqlContainer = docker.getContainer(process.env.MYSQL_CONTAINER_NAME || 'mysql');
    const sqlFile = process.env.GOLDEN_SQL_PATH || '/backups/golden.sql';

    // Verify the file exists inside the MySQL container
    const check = await execShell(mysqlContainer, `test -f ${sqlFile}`);
    if (check.exitCode !== 0) {
        return res.status(500).json({ error: `SQL backup not found in MySQL container at ${sqlFile}` });
    }

    // Import using local file redirection (fast)
    const importRes = await execShell(
        mysqlContainer,
        `mysql -uroot -p${process.env.DB_ROOT_PASSWORD || 'root'} ${dbName} < ${sqlFile}`
    );
    if (importRes.exitCode !== 0) {
        return res.status(500).json({ error: `Import failed: ${importRes.stderr || 'unknown error'}` });
    }
    console.log(`✅ Imported ${sqlFile} into ${dbName}`);
}

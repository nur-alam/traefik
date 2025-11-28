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
				password: labels['demoserver.password'] || 'Unknown',
				created_at: labels['demoserver.created_at'],
				dbname: labels['demoserver.dbname'],
				status: container.State
			};
		});

		// Sort by creation time (newest first)
		sites.sort((a, b) => parseInt(b.created_at) - parseInt(a.created_at));

		res.json({ success: true, sites });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
}

export const createSite = async (req, res) => {
	// const goldenContainerName = 'wp_golden';
	const containerId = nanoid(6).toLowerCase();
	console.log('containerId', containerId);
	const containerName = `wp_${containerId}`;
	const dbName = `wp_${containerId}`;
	const username = req.body.username || containerId;
	const dbUser = `user_${containerId}`;
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
			`WP_SITE_TITLE=Demo ${username}`,
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
			'demoserver.username': 'admin',
			'demoserver.password': 'demo',
			'demoserver.dbname': dbName,
			'demoserver.dbuser': dbUser,
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

    // Final response
    res.json({
        success: true,
        url: 'https://' + subdomain,
        username,
        admin_user: 'admin',
        admin_pass: 'demo',
        db: dbName,
        db_user: dbUser,
        db_pass: dbPass,
    });

}

export const dumpDb = async (dbName) => {
    const mysqlContainer = docker.getContainer('demo-mysql');
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
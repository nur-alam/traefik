import docker from './docker.js';
import pool from './db/index.js';
import { DB_ROOT_PASSWORD } from './config/index.js';

// Run every hour
export default async function cleanupExpiredSites() {
	console.log('🧹 Running cleanup job...');
	try {
		const containers = await docker.listContainers({ all: true });

		for (const c of containers) {
			const labels = c.Labels || {};
			if (!labels['demoserver.created_at']) continue;
			console.log(`ℹ️ Container ${c.Id} created at ${labels['demoserver.created_at']}`);
			const siteUrl = labels['demoserver.siteurl'];
			// if siteUrl isn't exists in site table then skip
			const [site] = await pool.query(
				`SELECT * FROM sites WHERE siteurl = ?`,
				[siteUrl]
			);
			if (site.length === 0) {	
				console.log(`ℹ️ Site ${siteUrl} exists in site table, skipping...`);
				continue;
			}
			const createdAt = parseInt(labels['demoserver.created_at'], 10);
			const ageMinutes = (Date.now() - createdAt) / (1000 * 60);

			if (ageMinutes > 59) {
				const dbName = labels['demoserver.db_name'];
				const dbUser = labels['demoserver.db_user'];

				// Stop and remove container
				const container = docker.getContainer(c.Id);
				let mounts = [];
				try {
					const info = await container.inspect();
					mounts = info?.Mounts || [];
				} catch (_) {}

				await container.stop().catch(() => { });
				await container.remove({ v: true, force: true });

				// Explicitly remove named volumes (anonymous already removed by v: true)
				for (const m of mounts) {
					if (m.Type === 'volume' && m.Name) {
						try {
							await docker.getVolume(m.Name).remove({ force: true });
							console.log(`🧹 Removed volume: ${m.Name}`);
						} catch (e) {
							console.log(`ℹ️ Volume not removed (${m.Name}): ${e.message}`);
						}
					}
				}

				console.log('siteurl ', siteUrl);

				// need to delete entry from sites table 
				await pool.query(
					`DELETE FROM sites WHERE siteurl = ?`,
					[siteUrl]
				);

				console.log('deleted site ', siteUrl);

				// Drop MySQL database and user
				const mysqlContainer = docker.getContainer(process.env.MYSQL_CONTAINER_NAME || 'mysql');
				// delete database and user from mysql container
				const exec = await mysqlContainer.exec({
					Cmd: ['mysql', '-uroot', `-p${DB_ROOT_PASSWORD}`, '-e', `DROP DATABASE IF EXISTS ${dbName}; DROP USER IF EXISTS '${dbUser}'@'%'; FLUSH PRIVILEGES;`],
					AttachStdout: true,
					AttachStderr: true
				});
				exec.start();
			} else {
				console.log(`ℹ️ Container ${c.Id} is younger than 30 minutes, skipping...`);
			}
		}

		console.log('✅ Cleanup complete');
	} catch (err) {
		console.error('❌ Cleanup failed:', err);
	}
}

// export default async function cleanupExpiredSites() {
// 	console.log('🧹 Running cleanup job...');
// 	const { DB_ROOT_PASSWORD } = process.env;
// 	try {
// 		const containers = await docker.listContainers({ all: true });

// 		for (const c of containers) {
// 			const labels = c.Labels || {};
// 			if (!labels['demoserver.created_at']) continue;

// 			const createdAt = parseInt(labels['demoserver.created_at'], 10);
// 			const ageMinutes = (Date.now() - createdAt) / (1000 * 60);

// 			if (ageMinutes > 2) {
// 				const username = labels['demoserver.username'];
// 				const dbName = labels['demoserver.dbname'];
// 				const dbUser = labels['demoserver.dbuser'];

// 				console.log(`🗑️ Removing demo: ${username}`);

// 				// Stop and remove container
// 				const container = docker.getContainer(c.Id);
// 				await container.stop().catch(() => { });
// 				await container.remove({ v: true, force: true });

// 				// Drop MySQL database and user
// 				const mysqlContainer = docker.getContainer(process.env.MYSQL_CONTAINER_NAME || 'mysql');
// 				const exec = await mysqlContainer.exec({
// 					Cmd: ['mysql', '-uroot', `-p${DB_ROOT_PASSWORD}`, '-e', `DROP DATABASE IF EXISTS ${dbName}; DROP USER IF EXISTS '${dbUser}'@'%'; FLUSH PRIVILEGES;`],
// 					AttachStdout: true,
// 					AttachStderr: true
// 				});
// 				exec.start();
// 			}
// 		}

// 		console.log('✅ Cleanup complete');
// 	} catch (err) {
// 		console.error('❌ Cleanup failed:', err);
// 	}
// }

import docker from './docker.js';

// Run every hour
export default async function cleanupExpiredSites() {
	console.log('🧹 Running cleanup job...');
	const { DB_ROOT_PASSWORD } = process.env;
	try {
		const containers = await docker.listContainers({ all: true });

		for (const c of containers) {
			const labels = c.Labels || {};
			if (!labels['demoserver.created_at']) continue;

			const createdAt = parseInt(labels['demoserver.created_at'], 10);
			const ageMinutes = (Date.now() - createdAt) / (1000 * 60);

			if (ageMinutes > 30) {
				const username = labels['demoserver.username'];
				const dbName = labels['demoserver.dbname'];
				const dbUser = labels['demoserver.dbuser'];

				console.log(`🗑️ Removing demo: ${username}`);

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

				// Drop MySQL database and user
				const mysqlContainer = docker.getContainer(process.env.MYSQL_CONTAINER_NAME || 'mysql');
				const exec = await mysqlContainer.exec({
					Cmd: ['mysql', '-uroot', `-p${DB_ROOT_PASSWORD}`, '-e', `DROP DATABASE IF EXISTS ${dbName}; DROP USER IF EXISTS '${dbUser}'@'%'; FLUSH PRIVILEGES;`],
					AttachStdout: true,
					AttachStderr: true
				});
				exec.start();
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

import docker from '../docker.js';
import pool from '../config/database.js';

const {
    DB_HOST = 'mysql',
} = process.env;

class Site {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.url = data.url;
        this.username = data.username;
        this.created_at = data.created_at;
        this.dbname = data.dbname;
        this.status = data.status;
    }

    static async getAll() {
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

                return new Site({
                    id: container.Id.substring(0, 12),
                    name: container.Names[0].substring(1), // Remove leading slash
                    url: subdomain ? `http://${subdomain}` : 'N/A',
                    username: labels['demoserver.username'] || 'Unknown',
                    created_at: labels['demoserver.created_at'],
                    dbname: labels['demoserver.dbname'],
                    status: container.State
                });
            });

            // Sort by creation time (newest first)
            sites.sort((a, b) => parseInt(b.created_at) - parseInt(a.created_at));

            return sites;
        } catch (error) {
            throw new Error(`Failed to fetch sites: ${error.message}`);
        }
    }

    static async create(siteData) {
        const { username, id, dbName, dbUser, dbPass, subdomain, TRAEFIK_NETWORK } = siteData;

        try {
            // Create database and user
            await pool.query(`CREATE DATABASE \`${dbName}\``);
            await pool.query(`CREATE USER '${dbUser}'@'%' IDENTIFIED BY '${dbPass}'`);
            await pool.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%'`);
            await pool.query(`FLUSH PRIVILEGES`);

            // Create WordPress container
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

            // Wait for WordPress to be ready
            await new Promise((resolve) => setTimeout(resolve, 5000));

            return {
                url: `http://${subdomain}`,
                db: dbName,
                db_user: dbUser,
                db_pass: dbPass,
                admin_user: 'admin',
                admin_pass: dbPass,
            };
        } catch (error) {
            throw new Error(`Failed to create site: ${error.message}`);
        }
    }
}

export default Site;
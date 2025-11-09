import docker from './docker.js';
import mysql from 'mysql2/promise';
import crypto from 'crypto';

const POOL_SIZE = 10;
const MIN_POOL_SIZE = 3;
const DOMAIN_SUFFIX = process.env.DOMAIN_SUFFIX || 'tutor.localhost';
const TRAEFIK_NETWORK = process.env.TRAEFIK_NETWORK || 'traefik';

let pool = [];
let isRefilling = false;

const dbPool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql',
  user: 'root',
  password: process.env.DB_ROOT_PASSWORD || 'root',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function createReserveSite() {
  const siteId = crypto.randomBytes(4).toString('hex');
  const dbName = `demo_${siteId}`;
  const dbUser = `user_${siteId}`;
  const dbPass = crypto.randomBytes(8).toString('hex');
  const subdomain = `${siteId}.${DOMAIN_SUFFIX}`;

  console.log(`🔧 Creating reserve site: ${subdomain}`);

  try {
    // Create database and user
    const connection = await dbPool.getConnection();
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
    await connection.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPass}'`);
    await connection.query(`GRANT ALL PRIVILEGES ON ${dbName}.* TO '${dbUser}'@'%'`);
    await connection.query('FLUSH PRIVILEGES');
    connection.release();

    // Create WordPress container
    const container = await docker.createContainer({
      Image: 'wordpress:latest',
      name: `wordpress-${siteId}`,
      Env: [
        `WORDPRESS_DB_HOST=${process.env.DB_HOST || 'mysql'}`,
        `WORDPRESS_DB_NAME=${dbName}`,
        `WORDPRESS_DB_USER=${dbUser}`,
        `WORDPRESS_DB_PASSWORD=${dbPass}`
      ],
      Labels: {
        [`traefik.http.routers.${siteId}.rule`]: `Host(\`${subdomain}\`)`,
        [`traefik.http.routers.${siteId}.entrypoints`]: 'web',
        [`traefik.http.routers.${siteId}.middlewares`]: 'redirect-to-https@file',
        [`traefik.http.routers.${siteId}-secure.rule`]: `Host(\`${subdomain}\`)`,
        [`traefik.http.routers.${siteId}-secure.entrypoints`]: 'websecure',
        [`traefik.http.routers.${siteId}-secure.tls`]: 'true',
        [`traefik.http.routers.${siteId}-secure.tls.certresolver`]: 'letsencrypt',
        [`traefik.http.routers.${siteId}-secure.service`]: siteId,
        [`traefik.http.services.${siteId}.loadbalancer.server.port`]: '80',
        'traefik.docker.network': TRAEFIK_NETWORK,
        'traefik.enable': 'true',
        'demoserver.created_at': new Date().toISOString(),
        'demoserver.username': 'admin',
        'demoserver.dbname': dbName,
        'demoserver.dbuser': dbUser,
        'demoserver.reserved': 'true'
      },
      HostConfig: {
        NetworkMode: TRAEFIK_NETWORK
      }
    });

    await container.start();
    console.log(`⏳ Waiting for SSL certificate: ${subdomain}`);

    // Wait for SSL to be ready
    await waitForSSL(subdomain, 60000);
    
    console.log(`✅ Reserve site ready: ${subdomain}`);

    return {
      id: siteId,
      containerId: container.id,
      url: `https://${subdomain}`,
      subdomain,
      dbName,
      dbUser,
      dbPass,
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`❌ Failed to create reserve site ${siteId}:`, error.message);
    // Cleanup on failure
    try {
      const container = docker.getContainer(`wordpress-${siteId}`);
      await container.remove({ force: true });
    } catch {}
    throw error;
  }
}

async function waitForSSL(domain, timeout = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`https://${domain}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok || response.status === 302) {
        return true;
      }
    } catch (error) {
      // Continue waiting
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`SSL certificate not ready after ${timeout}ms`);
}

async function refillPool() {
  if (isRefilling) return;
  
  isRefilling = true;
  console.log(`🔄 Refilling pool (current: ${pool.length}, target: ${POOL_SIZE})`);

  try {
    while (pool.length < POOL_SIZE) {
      const site = await createReserveSite();
      pool.push(site);
    }
    console.log(`✅ Pool refilled to ${pool.length} sites`);
  } catch (error) {
    console.error('❌ Error refilling pool:', error.message);
  } finally {
    isRefilling = false;
  }
}

export async function initializePool() {
  console.log('🚀 Initializing reserve site pool...');
  await refillPool();
}

export async function getSiteFromPool() {
  if (pool.length === 0) {
    throw new Error('No reserve sites available');
  }

  const site = pool.shift();
  console.log(`📦 Allocated site from pool: ${site.subdomain} (${pool.length} remaining)`);

  // Update container labels to mark as allocated
  try {
    const container = docker.getContainer(site.containerId);
    const containerInfo = await container.inspect();
    const labels = containerInfo.Config.Labels;
    delete labels['demoserver.reserved'];
    labels['demoserver.allocated_at'] = new Date().toISOString();
  } catch (error) {
    console.error('Failed to update container labels:', error.message);
  }

  // Trigger background refill if pool is getting low
  if (pool.length < MIN_POOL_SIZE) {
    refillPool().catch(err => console.error('Background refill failed:', err));
  }

  return site;
}

export function getPoolStatus() {
  return {
    size: pool.length,
    target: POOL_SIZE,
    minSize: MIN_POOL_SIZE,
    isRefilling,
    sites: pool.map(s => ({ id: s.id, subdomain: s.subdomain, createdAt: s.createdAt }))
  };
}

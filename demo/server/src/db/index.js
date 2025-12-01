import mysql from 'mysql2/promise';

import { DB_HOST, DB_ROOT_USER, DB_ROOT_PASSWORD, MYSQL_DEMO_DATABASE } from '../config/index.js';

const pool = mysql.createPool({
	host: DB_HOST,
	user: 'root',
	password: DB_ROOT_PASSWORD,
	database: MYSQL_DEMO_DATABASE,
	waitForConnections: true,
	connectionLimit: 10,
	maxIdle: 10, // max idle connections, the default value is the same as `connectionLimit`
	idleTimeout: 60000, // idle connections timeout, in milliseconds, the default value 60000
	queueLimit: 0,
	enableKeepAlive: true,
});

export default pool;

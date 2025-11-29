import mysql from 'mysql2/promise';

import { DB_HOST, DB_ROOT_PASSWORD } from '../config/index.js';

const pool = mysql.createPool({
	host: DB_HOST,
	user: 'root',
	password: DB_ROOT_PASSWORD,
});

export default pool;

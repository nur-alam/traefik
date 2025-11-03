import mysql from 'mysql2/promise';

const {
    DB_ROOT_PASSWORD = 'root',
    DB_HOST = 'mysql',
} = process.env;

const pool = mysql.createPool({
    host: DB_HOST,
    user: 'root',
    password: DB_ROOT_PASSWORD,
});

export default pool;
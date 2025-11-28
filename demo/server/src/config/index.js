import dotenv from 'dotenv';

dotenv.config();

export const {
	DB_ROOT_PASSWORD = 'root',
	DB_HOST = 'mysql',
	TRAEFIK_NETWORK = 'traefik',
	DOMAIN_SUFFIX = 'tutor.localhost',
} = process.env;

// export const { APP_PORT, APP_URL, DB_URL, DEBUG_MODE, JWT_SECRET, REFRESH_TOKEN } = process.env;

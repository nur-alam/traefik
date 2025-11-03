import { nanoid } from 'nanoid';
import Site from '../models/Site.js';

const {
    TRAEFIK_NETWORK = 'traefik',
    DOMAIN_SUFFIX = 'tutor.localhost',
} = process.env;

class SiteService {
    static async getAllSites() {
        return await Site.getAll();
    }

    static async createNewSite(username) {
        const siteUsername = username || `user_${nanoid(4)}`;
        const id = nanoid(6);
        const dbName = `demo_${id}`;
        const dbUser = `user_${id}`;
        const dbPass = nanoid(10);
        const subdomain = `${id}.${DOMAIN_SUFFIX}`;

        const siteData = {
            username: siteUsername,
            id,
            dbName,
            dbUser,
            dbPass,
            subdomain,
            TRAEFIK_NETWORK
        };

        return await Site.create(siteData);
    }
}

export default SiteService;
import express from 'express';
import { getSites, getSite, createSite } from '../controller/index.js';

const router = express.Router();

router.get('/sites', getSites);
router.post('/site', getSite);


export default router;

import { Router } from 'express';
import { healthRouter } from './health.js';

// Everything mounted here lives under /api. See docs/api.md for the contract.
export const apiRouter = Router();

apiRouter.use(healthRouter);

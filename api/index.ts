import { assertProductionDatabaseConfigured } from '../src/db/index';
import { createApiApp } from '../src/server/app';

assertProductionDatabaseConfigured();
const app = createApiApp();

export default app;

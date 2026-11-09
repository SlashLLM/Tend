/** Writes supabase/seed.sql (public data) and supabase/seed.auth.sql (local auth users). */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildWorld, toSql } from './world';

const anchor = process.env.SEED_ANCHOR ? new Date(process.env.SEED_ANCHOR) : new Date();
const world = buildWorld(anchor);
const root = join(__dirname, '..');
writeFileSync(join(root, 'seed.sql'), toSql(world, { includeAuthUsers: true }));
writeFileSync(join(root, 'seed.users.json'), JSON.stringify(world.authUsers, null, 2));
const counts = world.tables.map(([t, r]) => `${t}=${r.length}`).join(' ');
console.log(`seed written (anchor ${anchor.toISOString()}): ${counts}`);

import { applyCommunityMigration, createCommunityDatabase } from './communityDatabase.js';

export async function createProfileUpgradeDatabase() {
  const db = await createCommunityDatabase();
  await applyCommunityMigration(db, 'community_automatic_sharing');
  await applyCommunityMigration(db, 'degra_public_identity');
  // Minimal Storage catalog for exercising real PostgreSQL policies locally.
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated;`);
  return db;
}

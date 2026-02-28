/**
 * One-time migration: copy videos from Supabase Storage → Cloudflare R2.
 * Filenames stay identical so no DB changes are needed.
 *
 * Run with: npm run migrate
 * Requires: op CLI authenticated + Dev vault secrets in .env.op
 */

const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const SUPABASE_URL     = 'https://rmgernpifsdqnnomlzvg.supabase.co';
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID    = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY    = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET           = 'evolve-coaches-videos';

if (!SUPABASE_KEY || !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_KEY) {
  console.error('Missing required environment variables. Run via: npm run migrate');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_KEY },
});

async function fileExistsInR2(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function migrate() {
  // Fetch all video paths from the DB
  const { data: movements, error } = await supabase
    .from('movements')
    .select('id, name, video_path')
    .order('name');

  if (error) {
    console.error('Failed to fetch movements:', error.message);
    process.exit(1);
  }

  console.log(`Found ${movements.length} movement(s) to migrate.\n`);

  for (const m of movements) {
    const path = m.video_path;
    process.stdout.write(`  ${m.name} (${path}) … `);

    // Skip if already in R2
    if (await fileExistsInR2(path)) {
      console.log('already in R2, skipped.');
      continue;
    }

    // Download from Supabase Storage
    const { data: blob, error: dlError } = await supabase.storage
      .from('videos')
      .download(path);

    if (dlError || !blob) {
      console.log(`FAILED to download: ${dlError?.message}`);
      continue;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const ext    = path.split('.').pop().toLowerCase();
    const mime   = ext === 'mov' ? 'video/quicktime' : 'video/mp4';

    // Upload to R2
    try {
      await r2.send(new PutObjectCommand({
        Bucket:      BUCKET,
        Key:         path,
        Body:        buffer,
        ContentType: mime,
      }));
      console.log(`done (${(buffer.length / 1024 / 1024).toFixed(1)} MB).`);
    } catch (upErr) {
      console.log(`FAILED to upload: ${upErr.message}`);
    }
  }

  console.log('\nMigration complete.');
}

migrate();

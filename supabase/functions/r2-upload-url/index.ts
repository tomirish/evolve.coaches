import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = "evolve-coaches-videos";
const ALLOWED_ORIGINS = ["https://tomirish.github.io", "http://localhost:8080"];

function getCors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  },
});

Deno.serve(async (req: Request) => {
  const CORS = getCors(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!).default,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { filename } = await req.json();
  if (!filename) {
    return new Response(JSON.stringify({ error: "filename required" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i.test(filename)) {
    return new Response(JSON.stringify({ error: "Invalid filename" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Never sign a PUT over an object that already exists: an existing video's
  // key is also a valid UUID name, so without this any signed-in coach could
  // overwrite someone else's video (found 2026-11-25). The site always picks a
  // new random UUID, so a real upload never lands here.
  // The check is a signed HEAD sent with Deno's own fetch, NOT r2.send(new
  // HeadObjectCommand(...)): under Supabase's runtime the SDK's node:http shim
  // crashes the worker ("event loop error: unexpected end of file", HTTP 503)
  // when R2 answers 404 with an empty body, i.e. on every real upload.
  const headUrl = await getSignedUrl(
    r2,
    new HeadObjectCommand({ Bucket: BUCKET, Key: filename }),
    { expiresIn: 60 }
  );
  const head = await fetch(headUrl, { method: "HEAD" });
  if (head.status === 200) {
    return new Response(JSON.stringify({ error: "File already exists" }), {
      status: 409,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  if (head.status !== 404) {
    console.error("r2-upload-url: existence check failed", head.status);
    return new Response(JSON.stringify({ error: "Could not check the file" }), {
      status: 502,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const uploadUrl = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: BUCKET, Key: filename }),
    { expiresIn: 3600 }
  );

  return new Response(JSON.stringify({ uploadUrl, path: filename }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});

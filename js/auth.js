const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let _profile = null;

async function getSession() {
  const { data: { session } } = await client.auth.getSession();
  return session;
}

async function getProfile() {
  if (_profile) return _profile;
  const session = await getSession();
  if (!session) return null;
  const { data } = await client
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  _profile = data;
  return _profile;
}

async function requireAuth() {
  const session = await getSession();
  if (!session) window.location.href = 'index.html';
  return session;
}

async function requireAdmin() {
  await requireAuth();
  const profile = await getProfile();
  if (!profile || profile.role !== 'admin') window.location.href = 'catalog.html';
  return profile;
}

async function initNav() {
  const profile = await getProfile();
  if (!profile) return;

  const isAdmin   = profile.role === 'admin';
  const adminItem = isAdmin ? '<a href="admin.html">Admin</a>' : '';
  const initials  = getInitials(profile.full_name);

  const signOutBtn = document.querySelector('.nav-signout');
  if (signOutBtn) {
    const wrapper = document.createElement('div');
    wrapper.className = 'nav-user';
    wrapper.innerHTML = `
      <button class="nav-avatar"></button>
      <div class="nav-user-menu hidden">
        <a href="tags.html">Tags</a>
        ${adminItem}
        <a href="account.html" class="nav-menu-separator">Account</a>
        <button class="nav-user-signout">Sign Out</button>
      </div>
    `;
    const avatarBtn = wrapper.querySelector('.nav-avatar');
    avatarBtn.title       = profile.full_name || '';
    avatarBtn.textContent = initials;
    signOutBtn.parentNode.replaceChild(wrapper, signOutBtn);

    const moreBtn = wrapper.querySelector('.nav-avatar');
    const menu    = wrapper.querySelector('.nav-user-menu');

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });
    wrapper.querySelector('.nav-user-signout').addEventListener('click', signOut);
    document.addEventListener('click', () => menu.classList.add('hidden'));
  }
}

function escape(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isImagePath(path) {
  const ext = (path || '').split('.').pop().toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext);
}

// ── Video links (YouTube / Instagram) ─────────────────────────
// Single source of truth for which pasted links are accepted. Embed URLs are
// rebuilt from the parsed ID and integer seconds only — raw input never
// reaches an iframe src. Must stay in step with the source_url / clip CHECK
// constraints (supabase/migrations/20261002000000_video_links.sql) and the NAS
// worker's parse_link() (dev.tools/automation/archive_evolve_links/archive_links.py).
function parseVideoLink(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  let m;

  if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
    if (path === '/watch') return youtubeLink(u.searchParams.get('v'), u);
    m = path.match(/^\/shorts\/([^/]+)\/?$/);
    return youtubeLink(m && m[1], u);
  }
  if (host === 'youtu.be') {
    m = path.match(/^\/([^/]+)\/?$/);
    return youtubeLink(m && m[1], u);
  }
  if (host === 'instagram.com' || host === 'www.instagram.com') {
    m = path.match(/^(?:\/[A-Za-z0-9._]{1,30})?\/(p|reels?)\/([^/]+)\/?$/);
    if (!m || !/^[A-Za-z0-9_-]{5,40}$/.test(m[2])) return null;
    const kind = m[1] === 'p' ? 'p' : 'reel';
    return {
      platform: 'instagram', id: m[2], kind,
      canonicalUrl: `https://www.instagram.com/${kind}/${m[2]}/`,
      startSeconds: null,
    };
  }
  return null;
}

function youtubeLink(id, u) {
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return {
    platform: 'youtube', id, kind: 'watch',
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    startSeconds: parseYouTubeT(u.searchParams.get('t')),
  };
}

// YouTube's t= comes as 69, 69s or 1m9s. Anything else is ignored.
function parseYouTubeT(t) {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t || '');
  if (!t || !m) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

function isValidClip(clip) {
  return !!clip && Number.isInteger(clip.start) && Number.isInteger(clip.end) && clip.end > clip.start;
}

function embedUrl(link, clip) {
  if (link.platform === 'instagram') {
    return `https://www.instagram.com/${link.kind}/${link.id}/embed/`;   // no start/end support
  }
  const base = `https://www.youtube-nocookie.com/embed/${link.id}?autoplay=1&mute=1&playsinline=1`;
  // YouTube's loop restarts at 0:00, not at start — so a part plays once until the R2 copy lands.
  return isValidClip(clip)
    ? `${base}&start=${clip.start}&end=${clip.end}`
    : `${base}&loop=1&playlist=${link.id}`;
}

function embedHtml(link, title, clip) {
  return `<div class="embed-frame embed-${link.platform}">` +
    `<iframe src="${escape(embedUrl(link, clip))}" title="${escape(title || 'Movement video')}" ` +
    `allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen ` +
    `referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}

function sourceLinkUrl(link, clip) {
  return link.platform === 'youtube' && isValidClip(clip)
    ? `${link.canonicalUrl}&t=${clip.start}s`
    : link.canonicalUrl;
}

function platformLabel(platform) {
  return platform === 'youtube' ? 'YouTube' : 'Instagram';
}

// YouTube oEmbed answers CORS for this origin (verified 2026-10-02). Instagram's
// does not, and its "title" is the whole caption — so YouTube only.
async function fetchYouTubeInfo(canonicalUrl) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return { title: data.title || '', author: data.author_name || '' };
  } catch {
    return null;
  }
}

// YouTube titles are marketing — "Goblet Squat | 5 Tips for…". Keep the first part.
function nameFromYouTubeTitle(title) {
  return (title || '').split('|')[0].trim();
}

// ── Parts of a linked video ───────────────────────────────────
// Whole video by default; a coach can pick Start and End. Stored as whole
// seconds in clip_start / clip_end. The 180 s cap matches the CHECK constraint.
const MAX_CLIP_SECONDS = 180;

function parseClipTime(text) {
  const t = String(text ?? '').trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
  const parts = t.split(':').map(Number);
  if (parts.slice(1).some(n => n > 59)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function formatClipTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function validateClip(usePart, startText, endText) {
  if (!usePart) return { clip: null, error: null };
  const start = parseClipTime(startText);
  const end   = parseClipTime(endText);
  if (start === null || end === null) return { clip: null, error: 'Enter times like 1:09.' };
  if (end <= start) return { clip: null, error: 'End must be after Start.' };
  if (end - start > MAX_CLIP_SECONDS) return { clip: null, error: 'A part can be at most 3 minutes.' };
  return { clip: { start, end }, error: null };
}

function clipLengthLabel(clip) {
  const n = clip.end - clip.start;
  return n < 60 ? `${n} seconds` : `${formatClipTime(n)} long`;
}

function movementClip(row) {
  return row && row.clip_start != null && row.clip_end != null
    ? { start: row.clip_start, end: row.clip_end }
    : null;
}

// The shared "Which part?" control — upload page and the movement edit page.
function clipFieldsHtml(clip, prefillStart, hidden = false) {
  const startVal = clip ? formatClipTime(clip.start) : (prefillStart != null ? formatClipTime(prefillStart) : '');
  const endVal   = clip ? formatClipTime(clip.end) : '';
  return `
    <div class="field clip-field${hidden ? ' hidden' : ''}">
      <label>Which part?</label>
      <div class="clip-mode">
        <label><input type="radio" name="clip-mode" value="whole" ${clip ? '' : 'checked'}> Whole video</label>
        <label><input type="radio" name="clip-mode" value="part" ${clip ? 'checked' : ''}> Use only part of it</label>
      </div>
      <div class="clip-times${clip ? '' : ' hidden'}" id="clip-times">
        <label>Start <input type="text" id="clip-start" inputmode="numeric" placeholder="1:09" value="${escape(startVal)}"></label>
        <label>End <input type="text" id="clip-end" inputmode="numeric" placeholder="1:39" value="${escape(endVal)}"></label>
      </div>
      <p class="field-hint" id="clip-note"></p>
    </div>`;
}

// Calls onChange({ clip, error }) now and after every edit.
function bindClipFields(onChange) {
  const times = document.getElementById('clip-times');
  const note  = document.getElementById('clip-note');
  const field = times.closest('.clip-field');
  const read = () => {
    const usePart   = field.querySelector('input[name="clip-mode"]:checked').value === 'part';
    const startText = document.getElementById('clip-start').value;
    const endText   = document.getElementById('clip-end').value;
    const result    = validateClip(usePart, startText, endText);
    // Don't nag before both times are typed.
    const incomplete = usePart && (!startText.trim() || !endText.trim());
    times.classList.toggle('hidden', !usePart);
    note.textContent = !usePart ? ''
      : result.clip ? clipLengthLabel(result.clip)
      : incomplete ? 'Enter a start and end time.'
      : result.error;
    note.classList.toggle('clip-error', usePart && !result.clip && !incomplete);
    onChange(result);
  };
  field.addEventListener('input', read);
  field.addEventListener('change', read);
  read();
}

function getInitials(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function signOut() {
  await client.auth.signOut();
  window.location.href = 'index.html';
}

async function callEdgeFunction(name, body = null) {
  const { data: { session } } = await client.auth.getSession();
  if (!session) return { error: 'Not authenticated' };
  const { data, error } = await client.functions.invoke(name, {
    body: body || undefined,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    const ctx = error.context;
    if (ctx && typeof ctx === 'object' && ctx.error) return { error: ctx.error };
    return { error: error.message };
  }
  return data;
}

function uploadToR2(file, uploadUrl, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
    xhr.send(file);
  });
}

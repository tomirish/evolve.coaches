const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/login');

const COACH_EMAIL    = process.env.COACH_EMAIL;
const COACH_PASSWORD = process.env.COACH_PASSWORD;

test.describe('link and part helpers', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, COACH_EMAIL, COACH_PASSWORD);
    await page.goto('/catalog.html');
  });

  const ACCEPT = [
    // The two links a coach actually sent (2026-10-02), tracking params and all
    ['https://youtu.be/4taYjKlmihU?is=YQq_o7bc6RAaqnx7', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', null],
    ['https://www.instagram.com/p/DdFIrIfk0W2/?stkn=MWxrN3ZjaTBreG0xag==', 'instagram', 'DdFIrIfk0W2', 'https://www.instagram.com/p/DdFIrIfk0W2/', null],
    ['https://www.youtube.com/watch?v=4taYjKlmihU&si=abc&t=69', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', 69],
    ['https://youtu.be/4taYjKlmihU?t=1m9s', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', 69],
    ['https://youtu.be/4taYjKlmihU?t=69s', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', 69],
    ['https://youtu.be/4taYjKlmihU?t=abc', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', null],
    ['https://m.youtube.com/watch?v=4taYjKlmihU', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', null],
    ['https://youtube.com/shorts/4taYjKlmihU?feature=share', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', null],
    ['https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=xyz', 'instagram', 'C1a2B3c4D5e', 'https://www.instagram.com/reel/C1a2B3c4D5e/', null],
    ['https://instagram.com/reels/C1a2B3c4D5e', 'instagram', 'C1a2B3c4D5e', 'https://www.instagram.com/reel/C1a2B3c4D5e/', null],
    ['  https://youtu.be/4taYjKlmihU\n', 'youtube', '4taYjKlmihU', 'https://www.youtube.com/watch?v=4taYjKlmihU', null],
  ];

  for (const [raw, platform, id, canonicalUrl, startSeconds] of ACCEPT) {
    test(`accepts ${JSON.stringify(raw)}`, async ({ page }) => {
      const r = await page.evaluate(u => parseVideoLink(u), raw);
      expect(r).toMatchObject({ platform, id, canonicalUrl, startSeconds });
    });
  }

  const REJECT = [
    '', 'not a url', 'javascript:alert(1)',
    'https://evil.example/watch?v=4taYjKlmihU',
    'https://www.youtube.com.evil.example/watch?v=4taYjKlmihU',
    'https://youtu.be.evil.example/4taYjKlmihU',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=4taYjKlmih"',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.instagram.com/someuser/',
    'https://www.instagram.com/p/a<b>c/',
    'https://www.tiktok.com/@x/video/123',
    'ftp://www.youtube.com/watch?v=4taYjKlmihU',
  ];

  for (const raw of REJECT) {
    test(`rejects ${JSON.stringify(raw)}`, async ({ page }) => {
      expect(await page.evaluate(u => parseVideoLink(u), raw)).toBeNull();
    });
  }

  test('embed URLs: whole video loops, a part starts and ends, Instagram ignores parts', async ({ page }) => {
    const r = await page.evaluate(() => {
      const yt = parseVideoLink('https://youtu.be/4taYjKlmihU?is=x');
      const ig = parseVideoLink('https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=x');
      return [embedUrl(yt, null), embedUrl(yt, { start: 69, end: 99 }), embedUrl(ig, { start: 69, end: 99 })];
    });
    expect(r).toEqual([
      'https://www.youtube-nocookie.com/embed/4taYjKlmihU?autoplay=1&mute=1&playsinline=1&loop=1&playlist=4taYjKlmihU',
      'https://www.youtube-nocookie.com/embed/4taYjKlmihU?autoplay=1&mute=1&playsinline=1&start=69&end=99',
      'https://www.instagram.com/reel/C1a2B3c4D5e/embed/',
    ]);
  });

  test('a non-integer part never reaches the embed URL', async ({ page }) => {
    const url = await page.evaluate(() =>
      embedUrl(parseVideoLink('https://youtu.be/4taYjKlmihU'), { start: '1&autoplay=0', end: 99 }));
    expect(url).not.toContain('start=');
    expect(url).toContain('loop=1');
  });

  test('sourceLinkUrl opens a YouTube part at its start', async ({ page }) => {
    const r = await page.evaluate(() => [
      sourceLinkUrl(parseVideoLink('https://youtu.be/4taYjKlmihU'), { start: 69, end: 99 }),
      sourceLinkUrl(parseVideoLink('https://youtu.be/4taYjKlmihU'), null),
      sourceLinkUrl(parseVideoLink('https://www.instagram.com/p/DdFIrIfk0W2/'), { start: 69, end: 99 }),
    ]);
    expect(r).toEqual([
      'https://www.youtube.com/watch?v=4taYjKlmihU&t=69s',
      'https://www.youtube.com/watch?v=4taYjKlmihU',
      'https://www.instagram.com/p/DdFIrIfk0W2/',
    ]);
  });

  test('embedHtml escapes the title', async ({ page }) => {
    const html = await page.evaluate(() =>
      embedHtml(parseVideoLink('https://youtu.be/4taYjKlmihU'), '"><script>x</script>', null));
    expect(html).not.toContain('<script>');
    expect(html).toContain('class="embed-frame embed-youtube"');
  });

  test('parseClipTime and formatClipTime', async ({ page }) => {
    const r = await page.evaluate(() => [
      parseClipTime('1:09'), parseClipTime('69'), parseClipTime(' 0:05 '), parseClipTime('1:02:03'),
      parseClipTime('1:9'), parseClipTime('1:60'), parseClipTime('abc'), parseClipTime(''), parseClipTime('-5'),
      formatClipTime(69), formatClipTime(5), formatClipTime(3723),
    ]);
    expect(r).toEqual([69, 69, 5, 3723, 69, null, null, null, null, '1:09', '0:05', '1:02:03']);
  });

  test('validateClip', async ({ page }) => {
    const r = await page.evaluate(() => [
      validateClip(false, '', ''),
      validateClip(true, '1:09', '1:39'),
      validateClip(true, '1:09', '1:09'),
      validateClip(true, '1:39', '1:09'),
      validateClip(true, '0:00', '3:01'),
      validateClip(true, '0:00', '3:00'),
      validateClip(true, 'x', '1:00'),
    ]);
    expect(r).toEqual([
      { clip: null, error: null },
      { clip: { start: 69, end: 99 }, error: null },
      { clip: null, error: 'End must be after Start.' },
      { clip: null, error: 'End must be after Start.' },
      { clip: null, error: 'A part can be at most 3 minutes.' },
      { clip: { start: 0, end: 180 }, error: null },
      { clip: null, error: 'Enter times like 1:09.' },
    ]);
  });

  test('clipLengthLabel', async ({ page }) => {
    expect(await page.evaluate(() => [clipLengthLabel({ start: 69, end: 99 }), clipLengthLabel({ start: 0, end: 130 })]))
      .toEqual(['30 seconds', '2:10 long']);
  });

  test('nameFromYouTubeTitle keeps the part before the first pipe', async ({ page }) => {
    const r = await page.evaluate(() => [
      nameFromYouTubeTitle('Fast Footwork & Agility Ladder Drills | Speed & Agility Performance'),
      nameFromYouTubeTitle('Goblet Squat'),
      nameFromYouTubeTitle(''),
    ]);
    expect(r).toEqual(['Fast Footwork & Agility Ladder Drills', 'Goblet Squat', '']);
  });

  test('fetchYouTubeInfo returns null instead of throwing when oEmbed fails', async ({ page }) => {
    await page.route('https://www.youtube.com/oembed**', route => route.fulfill({ status: 500, body: '' }));
    expect(await page.evaluate(() => fetchYouTubeInfo('https://www.youtube.com/watch?v=4taYjKlmihU'))).toBeNull();
  });
});

// Directs the trailer: drives the real game UI inside the stage, captures frames via
// CDP screencast, and logs timestamped marks for audio sync.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];
fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await fetch('http://localhost:5190/mock/reset');
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:5190/stage.html');
  await page.evaluate(() => document.fonts.ready);
  await sleep(500);

  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let n = 0;
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = path.join(OUT, 'frames', `f${String(n++).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });

  const marks = [];
  const t0 = Date.now() / 1000;
  const mark = (name) => marks.push({ name, t: Date.now() / 1000 - t0 });
  const stage = (fn, ...args) => page.evaluate(([f, a]) => window[f](...a), [fn, args]);
  const game = () => page.frameLocator('#game');

  // Smoothly drag the meter from its current value to `to`.
  const drag = async (to, from = 50, steps = 28) => {
    for (let i = 1; i <= steps; i++) {
      const v = Math.round(from + ((to - from) * (1 - Math.pow(1 - i / steps, 3))));
      await game().locator('.meter-input').fill(String(v));
      await sleep(32);
    }
  };
  const answer = async (side, guess, { slow = false } = {}) => {
    await game().locator(`.option.opt-${side}`).click();
    mark('pick');
    await sleep(slow ? 900 : 520);
    await drag(guess, 50, slow ? 34 : 16);
    await sleep(slow ? 700 : 250);
    await game().getByText('Lock it in').click();
    mark('lock');
  };

  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  mark('start');

  // 1. Title card
  await sleep(3600);

  // 2. Intro screen in the phone
  await stage('loadGame');
  await sleep(700);
  await stage('card', 'titleCard', false);
  await stage('showPhone', true);
  mark('whoosh');
  await stage('setCaption', 'A daily game for Reddit', 'Every day, a new <span class="g">room</span> opens.', 'Five quick debates. One question: how well do you know your community?');
  await sleep(3600);

  // 3. Pick + predict (slow, hero moment)
  await game().getByText('Enter the room').click();
  await stage('setCaption', 'Step 1', 'Pick <span class="a">your</span> side.', 'Your honest vote becomes part of the room.');
  await sleep(2000);
  await stage('setCaption', 'Step 2', 'Predict how the <span class="b">room</span> split.', 'Drag the meter to where you think your subreddit landed.');
  await answer('a', 68, { slow: true });

  // 4. Reveal (bullseye)
  await stage('setCaption', 'Step 3', 'The room <span class="g">has spoken.</span>', 'Closest read wins. 100 points for a perfect guess.');
  await sleep(1550);
  mark('reveal_bullseye');
  await sleep(2400);
  await game().getByText('Next debate').click();

  // 5. Quick montage of debates 2-4
  await stage('setCaption', 'Fast & fun', 'Five debates. <span class="g">About a minute.</span>', 'Community-written and mod-picked debates keep every day fresh.');
  await answer('a', 74);
  await sleep(1650); mark('reveal_small');
  await sleep(500);
  await game().getByText('Next debate').click();
  await answer('b', 35);
  await sleep(1650); mark('reveal_small');
  await sleep(450);
  await game().getByText('Next debate').click();
  await answer('a', 47);
  await sleep(1650); mark('reveal_small');
  await sleep(450);
  await game().getByText('Next debate').click();

  // 6. Final Boss
  mark('boss');
  await stage('flash');
  await stage('setCaption', 'Plot twist', 'The <span class="g">Final Boss</span> counts double.', 'Debate five is worth 2× points. Every room ends with a showdown.');
  await sleep(2000);
  await answer('a', 86, { slow: true });
  await sleep(1550);
  mark('reveal_bullseye');
  await sleep(2600);
  await game().getByText('See my results').click();

  // 7. Results
  await stage('setCaption', 'Show it off', 'Share your grid. <span class="a">Wear</span> your title.', 'Post your result to the comments, set it as your flair, and challenge friends.');
  await sleep(1300);
  mark('fanfare');
  await sleep(3400);

  // 8. Contrarians
  await game().getByText('Board').click();
  await sleep(700);
  await game().getByText('Contrarians').click();
  await stage('setCaption', 'Two ways to win', 'Read the room… or <span class="b">defy it.</span>', 'Leaderboards for the sharpest readers and the boldest contrarians.');
  await sleep(3600);

  // 9. Next day: verdict
  await fetch('http://localhost:5190/mock/nextday');
  mark('whoosh');
  await stage('setCaption', 'Tomorrow', 'Scores <span class="g">lock</span> against the final split.', 'Each new room opens with yesterday’s verdict, and the results get pinned for the whole sub to debate.');
  await stage('loadGame');
  await sleep(2200);
  await game().locator('.verdict-card').click();
  await sleep(3400);

  // 10. End card
  await stage('hideCaption');
  await stage('showPhone', false);
  await stage('card', 'endCard', true);
  mark('end');
  await sleep(4600);

  await cdp.send('Page.stopScreencast');
  await sleep(300);
  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(frames));
  fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify({ t0, marks }, null, 1));
  console.log('frames', frames.length, 'duration', (frames.at(-1).t - frames[0].t).toFixed(1), 's', 'errors', JSON.stringify(errors));
  await browser.close();
})();

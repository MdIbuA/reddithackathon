# Devpost submission kit: Read the Room

Copy each section into the matching Devpost field. Replace every `<...>` before submitting.

## Links
- **App listing:** https://developers.reddit.com/apps/readtheroom-daily
- **Test subreddit:** https://www.reddit.com/r/readtheroom_daily_dev (must be public, under 200 members)
- **Demo post:** `<link to a live round post>`
- **Repo:** https://github.com/MdIbuA/reddithackathon
- **Video:** https://youtu.be/syx2BF0tT8U

## Tagline (one line)
Don't guess what's right. Guess what your subreddit thinks.

## Inspiration
Every subreddit argues about the same small things: pineapple on pizza, dark mode, whether a hot dog is a sandwich. The fun is never the answer; it's finding out where *your* community stands. We wanted a daily game where the community itself is the answer key.

## What it does
Every day a new "room" opens with 5 quick debates. For each one you:
1. **Pick your side.** Your honest vote becomes part of the room.
2. **Predict the split.** Drag a meter to the % of the subreddit you think agreed with each side.
3. **Get scored.** 100 points for a perfect read, minus 2 for every point you're off. The 5th debate is the 👑 **Final Boss**, worth double.

Scores are **provisional** while the room is open. When the next room opens, everyone is **re-scored against the final split**, the app pins a "📊 The room has spoken" results comment, and the new post opens with **Yesterday's Verdict**: your locked score, the most divisive debate and the best readers.

Reddit-native features:
- **Mod-written debates:** mods add community-specific debates through a native form, and those get priority in the next room
- **Community prompts:** players suggest and upvote debates, which are featured with credit
- **Share to comments and challenge a friend:** native share sheet
- **User flair:** wear your daily title and streak, e.g. `🔮 Mind Reader · 🔥7`
- **Leaderboards:** per room, all time, and a 🙃 **Contrarians** board for people who vote against the crowd
- A scheduled job posts a new room every day automatically

## How we built it
Devvit Web: React 19 + TypeScript, built with Vite and `@devvit/start`. A Node server on Devvit uses Redis for vote tallies, write-once answers, leaderboards, streaks and the suggestion queues, plus the Reddit API for posts, pinned comments and flair, the scheduler for the daily cron, menu actions and forms. Scoring lives in a pure, shared, unit-tested module used by both client and server. Sounds are synthesized with Web Audio, so there are no asset downloads, and all motion respects reduced-motion.

## Challenges we ran into
- **Cold start:** the first players of a room were scored against only a handful of votes. We added a Bayesian prior for live scoring, then **final re-scoring** when the room closes, so early players aren't punished and everyone has a reason to return.
- **Integrity:** answers are write-once on the server (a double tap can't vote twice), you can't see the split before locking in, and streaks only count on the current room.
- Devvit specifics: explicit `Content-Length` on every response, the icon size limit, and registering the app via `devvit upload`.

## Accomplishments we're proud of
A daily loop that is quick to learn but has real depth: reading a community is a skill, and the Contrarians board rewards the opposite skill. Every room produces content (the pinned verdict thread) for the subreddit to discuss.

## What we learned
On Reddit, the best daily content comes from the community itself: player votes, player-written debates and mod picks.

## What's next
Themed days, weekly seasons, and cross-subreddit "rivalry rooms" (r/cats vs r/dogs reading each other).

---

## 60-second demo video script
| Time | On screen | Voiceover / caption |
|---|---|---|
| 0–5s | Feed scroll to the post; intro "Can you read r/yoursub?" | "Don't guess what's right. Guess what your subreddit thinks." |
| 5–15s | Tap a side tile, then drag the meter | "Pick your side, then predict how the room split." |
| 15–25s | Reveal: tally shimmer, bar fills, BULLSEYE, confetti | "Closer read, more points." |
| 25–32s | Final Boss banner, then +188 2× | "The last debate is the Final Boss: double points." |
| 32–42s | Results ticket, then tap Share; comment appears in thread | "Share your grid and wear your title as flair." |
| 42–52s | Next day: Verdict card, then the pinned results comment | "Scores lock tomorrow against the final split, and the room's verdict gets pinned." |
| 52–60s | Mod menu "add a custom debate", then 📌 Mod pick | "Mods and players write tomorrow's debates. A new room every day." |

Recording tips: use the Reddit app on your phone (screen record), or desktop Chrome at a phone-sized window. Unmute for sound effects. Keep it under 60s; judges may stop there.

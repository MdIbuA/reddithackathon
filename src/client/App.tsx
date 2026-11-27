import { useCallback, useEffect, useMemo, useState } from 'react';
import { showShareSheet, showToast } from '@devvit/web/client';
import type {
  AnswerResponse,
  LeaderboardResponse,
  OkResponse,
  Pick,
  Prompt,
  Reveal,
  StateResponse,
  SuggestionsResponse,
  Verdict,
  YesterdayInfo,
} from '../shared/api';
import { BOSS_INDEX, MAX_POINTS_PER_DAY, PROMPTS_PER_DAY, gradeForIndex, multiplierFor, type Grade } from '../shared/scoring';
import { ApiError, api } from './api';
import { isMuted, setMuted, sfx } from './sfx';
import { Confetti, Meter, buzz, splitLabel, useCountUp } from './ui';

type View =
  | { kind: 'intro' }
  | { kind: 'pick'; index: number }
  | { kind: 'predict'; index: number; pick: Pick }
  | { kind: 'reveal'; index: number; reveal: Reveal; completed: boolean }
  | { kind: 'summary' };

type Sheet = null | 'leaderboard' | 'suggest' | 'howto' | 'verdict';

const GRADE_LABEL: Record<Grade, string> = {
  bullseye: 'Bullseye',
  close: 'Close read',
  off: 'Off the mark',
  miss: 'Way off',
};

const QUIPS: Record<Grade, string[]> = {
  bullseye: ['You ARE the room.', 'Scary accurate. Are you a mod?', 'Telepathy confirmed.'],
  close: ['You get this crowd.', 'Solid read.', 'So close you could smell it.'],
  off: ['The room had other ideas.', 'Not quite the vibe.', 'Half right, half chaos.'],
  miss: ['Are you even subscribed?', 'The room said: who are you?', 'Bold read. Wrong, but bold.'],
};

const firstUnanswered = (answers: (Reveal | null)[]) => answers.findIndex((a) => a === null);
const pickRandom = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]!;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
const isLoginErr = (e: unknown) => e instanceof ApiError && e.code === 'LOGIN_REQUIRED';

export function App() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: 'intro' });
  const [sheet, setSheet] = useState<Sheet>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const s = await api.get<StateResponse>('/api/state');
      setState(s);
      const next = firstUnanswered(s.answers);
      if (s.summary) setView({ kind: 'summary' });
      else if (next > 0) setView({ kind: 'pick', index: next }); // resume mid-round
      else setView({ kind: 'intro' });
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="app">
        <div className="screen center">
          <div className="state-emoji">😵‍💫</div>
          <h2 className="h2">The room went quiet</h2>
          <p className="muted">{error}</p>
          <button className="btn btn-primary" onClick={() => void load()}>Try again</button>
        </div>
      </div>
    );
  }
  if (!state) return <LoadingSkeleton />;

  const onAnswered = (res: AnswerResponse, index: number) => {
    setState((s) => {
      if (!s) return s;
      const answers = [...s.answers];
      answers[index] = res.reveal;
      return { ...s, answers, summary: res.summary ?? s.summary, stats: res.stats };
    });
    setView({ kind: 'reveal', index, reveal: res.reveal, completed: Boolean(res.summary) });
  };

  const currentIndex = 'index' in view ? view.index : -1;
  const goNext = (index: number, completed: boolean) =>
    completed || index === PROMPTS_PER_DAY - 1 ? setView({ kind: 'summary' }) : setView({ kind: 'pick', index: index + 1 });

  return (
    <div className="app">
      <Header
        day={state.day}
        streak={state.stats.streak}
        answers={state.answers}
        current={currentIndex}
        onLeaderboard={() => setSheet('leaderboard')}
        onHelp={() => setSheet('howto')}
      />

      <main className="main" key={`${view.kind}-${currentIndex}`}>
        {view.kind === 'intro' && (
          <Intro
            state={state}
            onStart={() => setView({ kind: 'pick', index: 0 })}
            onHowTo={() => setSheet('howto')}
            onVerdict={() => setSheet('verdict')}
          />
        )}
        {view.kind === 'pick' && (
          <PickStep
            prompt={state.prompts[view.index]!}
            index={view.index}
            onPick={(pick) => setView({ kind: 'predict', index: view.index, pick })}
          />
        )}
        {view.kind === 'predict' && (
          <PredictStep
            prompt={state.prompts[view.index]!}
            index={view.index}
            pick={view.pick}
            subreddit={state.subreddit}
            onBack={() => setView({ kind: 'pick', index: view.index })}
            onAnswered={(res) => onAnswered(res, view.index)}
          />
        )}
        {view.kind === 'reveal' && (
          <RevealStep
            prompt={state.prompts[view.index]!}
            index={view.index}
            reveal={view.reveal}
            onNext={() => goNext(view.index, view.completed)}
          />
        )}
        {view.kind === 'summary' && state.summary && (
          <SummaryView
            state={state}
            onLeaderboard={() => setSheet('leaderboard')}
            onSuggest={() => setSheet('suggest')}
            onVerdict={() => setSheet('verdict')}
          />
        )}
      </main>

      {sheet === 'leaderboard' && <LeaderboardSheet me={state.username} onClose={() => setSheet(null)} />}
      {sheet === 'suggest' && <SuggestSheet onClose={() => setSheet(null)} />}
      {sheet === 'howto' && <HowToSheet onClose={() => setSheet(null)} />}
      {sheet === 'verdict' && (state.closed ?? state.yesterday?.verdict) && (
        <VerdictSheet verdict={(state.closed ?? state.yesterday?.verdict)!} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------
function Header(props: {
  day: number;
  streak: number;
  answers: (Reveal | null)[];
  current: number;
  onLeaderboard: () => void;
  onHelp: () => void;
}) {
  return (
    <header className="header">
      <div className="header-row">
        <div className="brand">
          <span className="brand-mark" aria-hidden>👀</span>
          <span className="brand-name">Read the Room</span>
          <span className="room-no">#{props.day}</span>
        </div>
        <div className="header-actions">
          {props.streak > 0 && (
            <span className="streak" title={`${props.streak}-day streak`}>
              🔥<b>{props.streak}</b>
            </span>
          )}
          <MuteButton />
          <button className="icon-btn" onClick={props.onLeaderboard} aria-label="Leaderboard">🏆</button>
          <button className="icon-btn" onClick={props.onHelp} aria-label="How to play">?</button>
        </div>
      </div>
      <div className="progress" aria-label="Round progress">
        {props.answers.map((a, i) => (
          <span
            key={i}
            className={`seg ${a ? `done g-${gradeForIndex(i, a.points)}` : ''} ${i === props.current ? 'current' : ''}`}
          />
        ))}
      </div>
    </header>
  );
}

function MuteButton() {
  const [m, setM] = useState(isMuted());
  return (
    <button
      className="icon-btn"
      onClick={() => {
        setMuted(!m);
        setM(!m);
        if (m) sfx.pick();
      }}
      aria-label={m ? 'Unmute sounds' : 'Mute sounds'}
      aria-pressed={m}
    >
      {m ? '🔇' : '🔊'}
    </button>
  );
}

function LoadingSkeleton() {
  return (
    <div className="app">
      <div className="header">
        <div className="header-row">
          <div className="sk sk-line" style={{ width: 150 }} />
          <div className="sk sk-circle" />
        </div>
        <div className="progress">{Array.from({ length: PROMPTS_PER_DAY }, (_, i) => <span key={i} className="seg" />)}</div>
      </div>
      <div className="main">
        <div className="sk sk-card" />
        <div className="options">
          <div className="sk sk-tile" />
          <div className="sk sk-tile" />
        </div>
      </div>
    </div>
  );
}

function PromptCard({ prompt, index, compact }: { prompt: Prompt; index: number; compact?: boolean }) {
  const boss = index === BOSS_INDEX;
  return (
    <section className={`prompt-card ${compact ? 'compact' : ''} ${boss ? 'is-boss' : ''}`}>
      <div className="eyebrow">
        {boss ? (
          <span className="boss-tag">👑 Final Boss · 2× points</span>
        ) : (
          <span>Debate {index + 1} <span className="dim">/ {PROMPTS_PER_DAY}</span></span>
        )}
        {prompt.source === 'mod' ? (
          <span className="credit">📌 Mod pick</span>
        ) : (
          prompt.author && <span className="credit">✨ by u/{prompt.author}</span>
        )}
      </div>
      <h2 className="prompt-q">{prompt.q}</h2>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------
function Intro({ state, onStart, onHowTo, onVerdict }: { state: StateResponse; onStart: () => void; onHowTo: () => void; onVerdict: () => void }) {
  const [demo, setDemo] = useState(50);
  useEffect(() => {
    const seq = [64, 38, 71, 55, 47, 62];
    let i = 0;
    const t = setInterval(() => setDemo(seq[i++ % seq.length]!), 1100);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="screen intro">
      <div className="hero">
        <p className="kicker">Daily · Room #{state.day}</p>
        <h1 className="display">
          Can you read <span className="hl">r/{state.subreddit}</span>?
        </h1>
        <p className="lede">Pick a side on {PROMPTS_PER_DAY} debates, then guess how the room split. Closest read wins.</p>
      </div>

      <div className="demo" aria-hidden>
        <div className="demo-track">
          <div className="demo-a" style={{ width: `${demo}%` }} />
          <div className="demo-thumb" style={{ left: `${demo}%` }} />
        </div>
        <div className="demo-labels">
          <span>Team A</span>
          <span>Team B</span>
        </div>
      </div>

      {state.yesterday && <YesterdayCard info={state.yesterday} onOpen={onVerdict} />}

      <div className="intro-meta">
        <span className="live"><i className="pulse" />{state.playersToday.toLocaleString()} in the room</span>
        {state.stats.streak > 0 && <span className="pill">🔥 {state.stats.streak}-day streak</span>}
        {!state.isToday && <span className="pill warn">📼 Past room · no streak</span>}
      </div>

      <div className="intro-cta">
        <button className="btn btn-primary btn-xl" onClick={() => { buzz(); onStart(); }}>
          {state.username ? 'Enter the room' : 'Log in & play'} <span aria-hidden>→</span>
        </button>
        <button className="btn-link" onClick={onHowTo}>How scoring works</button>
      </div>
    </div>
  );
}

function PickStep({ prompt, index, onPick }: { prompt: Prompt; index: number; onPick: (p: Pick) => void }) {
  const [chosen, setChosen] = useState<Pick | null>(null);
  const boss = index === BOSS_INDEX;
  useEffect(() => {
    if (boss) sfx.boss();
  }, [boss]);
  const choose = (p: Pick) => {
    if (chosen) return;
    buzz();
    sfx.pick();
    setChosen(p);
    setTimeout(() => onPick(p), 260);
  };
  return (
    <div className="screen">
      {boss && <div className="boss-banner" aria-hidden><span>👑</span> FINAL BOSS <span>2×</span></div>}
      <PromptCard prompt={prompt} index={index} />
      <p className="step"><span className="step-no">1</span> Your honest take</p>
      <div className={`options ${chosen ? 'has-choice' : ''}`}>
        {(['a', 'b'] as const).map((side) => {
          const { emoji, text } = splitLabel(side === 'a' ? prompt.a : prompt.b);
          return (
            <button
              key={side}
              className={`option opt-${side} ${chosen === side ? 'chosen' : ''}`}
              onClick={() => choose(side)}
            >
              {emoji && <span className="opt-emoji">{emoji}</span>}
              <span className="opt-text">{text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PredictStep(props: {
  prompt: Prompt;
  index: number;
  pick: Pick;
  subreddit: string;
  onBack: () => void;
  onAnswered: (r: AnswerResponse) => void;
}) {
  const { prompt, index, pick } = props;
  const [guess, setGuess] = useState(50);
  const [busy, setBusy] = useState(false);
  const picked = splitLabel(pick === 'a' ? prompt.a : prompt.b);

  const submit = async () => {
    buzz(18);
    sfx.lock();
    setBusy(true);
    try {
      props.onAnswered(await api.post<AnswerResponse>('/api/answer', { index, pick, guess }));
    } catch (e) {
      if (!isLoginErr(e)) showToast(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <PromptCard prompt={prompt} index={index} compact />
      <div className="step-row">
        <p className="step"><span className="step-no">2</span> How did r/{props.subreddit} split?</p>
        <button className={`chip chip-${pick}`} onClick={props.onBack} disabled={busy} title="Change your pick">
          You: {picked.emoji} {picked.text} <span className="chip-x">✎</span>
        </button>
      </div>
      <Meter a={prompt.a} b={prompt.b} pct={guess} onChange={setGuess} />
      <p className="hint">Drag the divider to where you think the room landed</p>
      <button className="btn btn-primary btn-xl" onClick={() => void submit()} disabled={busy}>
        {busy ? <span className="dots-loading">Reading the room</span> : <>Lock it in · {guess}%{multiplierFor(index) > 1 ? ' · 2×' : ''}</>}
      </button>
    </div>
  );
}

function RevealStep({ prompt, index, reveal, onNext }: { prompt: Prompt; index: number; reveal: Reveal; onNext: () => void }) {
  const [phase, setPhase] = useState<'tally' | 'fill' | 'settled'>('tally');
  const grade = gradeForIndex(index, reveal.points);
  const quip = useMemo(() => pickRandom(QUIPS[grade]), [grade]);
  const shown = useCountUp(reveal.actualPctA, 900, 50, 650);
  const points = useCountUp(reveal.points, 700, 0, 1450);
  const myShare = reveal.pick === 'a' ? reveal.actualPctA : 100 - reveal.actualPctA;
  const isLast = index === PROMPTS_PER_DAY - 1;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('fill'), 650);
    const t2 = setTimeout(() => {
      setPhase('settled');
      buzz(grade === 'bullseye' ? 40 : 15);
      sfx.reveal(grade);
    }, 1550);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [grade]);

  return (
    <div className="screen">
      <Confetti fire={phase === 'settled' && grade === 'bullseye'} />
      <PromptCard prompt={prompt} index={index} compact />
      <p className="step">
        {phase === 'tally' ? <span className="dots-loading">Tallying the room</span> : <>The room has spoken</>}
      </p>
      <Meter
        a={prompt.a}
        b={prompt.b}
        pct={phase === 'tally' ? 50 : reveal.actualPctA}
        shownPct={shown}
        guess={reveal.guess}
        pending={phase === 'tally'}
        settled={phase === 'settled'}
      />
      <div className={`result g-${grade} ${phase === 'settled' ? 'in' : ''}`} aria-live="polite">
        <div className="result-top">
          <span className="stamp">{GRADE_LABEL[grade]}</span>
          <span className="result-points">
            +{points}
            {multiplierFor(index) > 1 && <small className="mult">2×</small>}
          </span>
        </div>
        <p className="result-quip">{quip}</p>
        <p className="result-meta">
          {Math.abs(reveal.guess - reveal.actualPctA)}% off · {reveal.total.toLocaleString()} vote{reveal.total === 1 ? '' : 's'}
          {' · '}
          {myShare >= 50 ? `you’re with the ${myShare}%` : `🙃 you’re in the ${myShare}%`}
        </p>
        {reveal.total < 10 && <p className="result-note">Early bird: the room is still filling up.</p>}
      </div>
      <button className="btn btn-primary btn-xl" onClick={onNext} disabled={phase !== 'settled'}>
        {isLast ? 'See my results' : 'Next debate'} <span aria-hidden>→</span>
      </button>
    </div>
  );
}

function SummaryView({ state, onLeaderboard, onSuggest, onVerdict }: { state: StateResponse; onLeaderboard: () => void; onSuggest: () => void; onVerdict: () => void }) {
  const s = state.summary!;
  const score = useCountUp(s.score, 1100, 0, 150);
  const [busy, setBusy] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const great = s.score >= MAX_POINTS_PER_DAY * 0.76;
      setCelebrate(great);
      if (great) sfx.fanfare();
    }, 1250);
    return () => clearTimeout(t);
  }, [s.score]);

  const act = async (path: string) => {
    buzz();
    setBusy(path);
    try {
      const res = await api.post<OkResponse>(path);
      showToast({ text: res.message ?? 'Done!', appearance: 'success' });
    } catch (e) {
      if (!isLoginErr(e)) showToast(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const challenge = async () => {
    buzz();
    try {
      await showShareSheet({
        title: `Read the Room #${state.day}`,
        text: `I scored ${s.score}/${MAX_POINTS_PER_DAY} reading r/${state.subreddit} ${s.titleEmoji} ${s.grid}\nThink you know the room better?`,
      });
    } catch {
      showToast('Sharing isn’t available here.');
    }
  };

  return (
    <div className="screen summary">
      <Confetti fire={celebrate} pieces={160} />
      <section className="ticket">
        <div className="ticket-head">
          <span>Room #{state.day} · r/{state.subreddit}</span>
          <span className={`lock ${s.final ? 'is-final' : ''}`}>{s.final ? '🔒 Final' : '⏳ Provisional'}</span>
        </div>
        <div className="ticket-score">
          <span className="ticket-emoji">{s.titleEmoji}</span>
          <span className="score-num">{score}</span>
          <span className="score-max">/{MAX_POINTS_PER_DAY}</span>
        </div>
        <div className="title-badge">{s.title}</div>
        <div className="ticket-stats">
          <div><b>#{s.rank}</b><span>of {s.players.toLocaleString()}</span></div>
          <div><b>🔥 {state.stats.streak}</b><span>day streak</span></div>
          <div><b>{s.contrarianCount}</b><span>contrarian</span></div>
        </div>
        <ol className="breakdown">
          {state.prompts.map((p, i) => {
            const a = state.answers[i];
            if (!a) return null;
            const pts = s.final && s.finalPoints ? (s.finalPoints[i] ?? a.points) : a.points;
            const g = gradeForIndex(i, pts);
            return (
              <li key={p.id}>
                <span className="bd-q">{p.q}</span>
                <span className="bd-bar">
                  <i className="bd-fill" style={{ width: `${state.closed?.prompts[i]?.pctA ?? a.actualPctA}%` }} />
                  <i className="bd-you" style={{ left: `${a.guess}%` }} />
                </span>
                <span className={`bd-pts g-${g}`}>{pts}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="actions">
        <button className="btn btn-primary btn-xl" disabled={busy !== null} onClick={() => void act('/api/share')}>
          💬 Share to comments
        </button>
        <div className="actions-row three">
          <button className="btn btn-soft" disabled={busy !== null} onClick={() => void act('/api/flair')}>🏷️ Wear title</button>
          <button className="btn btn-soft" onClick={onLeaderboard}>🏆 Board</button>
          <button className="btn btn-soft" onClick={() => void challenge()}>📤 Challenge</button>
        </div>
        <button className="shape-card" onClick={onSuggest}>
          <span className="shape-emoji">✨</span>
          <span>
            <b>Shape tomorrow’s room</b>
            <small>Suggest or upvote debates for future rounds</small>
          </span>
          <span aria-hidden>›</span>
        </button>
      </div>
      {!s.final && (
        <p className="lock-note">
          ⏳ Scores lock when the next room opens. Early reads get re-scored against the final split, so come back tomorrow to see yours.
        </p>
      )}
      {(state.closed || state.yesterday) && (
        <button className="btn-link" onClick={onVerdict}>
          📊 {state.closed ? `See Room #${state.day}’s final verdict` : `See Room #${state.yesterday!.verdict.day}’s verdict`}
        </button>
      )}
      {state.isToday && <Countdown />}
    </div>
  );
}

function YesterdayCard({ info, onOpen }: { info: YesterdayInfo; onOpen: () => void }) {
  const v = info.verdict;
  const hot = v.prompts[v.divisive];
  return (
    <button className="verdict-card" onClick={onOpen}>
      <span className="vc-head">
        <span className="vc-kicker">🔒 Room #{v.day} verdict</span>
        <span className="vc-open">See all ›</span>
      </span>
      {info.me ? (
        <span className="vc-me">
          <b>{info.me.titleEmoji} {info.me.score}</b>
          <span>final · #{info.me.rank} of {v.players}</span>
          {info.me.delta !== 0 && (
            <span className={`vc-delta ${info.me.delta > 0 ? 'up' : 'down'}`}>
              {info.me.delta > 0 ? '▲' : '▼'} {Math.abs(info.me.delta)}
            </span>
          )}
        </span>
      ) : (
        <span className="vc-me"><span>You missed it. {v.players} players read the room.</span></span>
      )}
      {hot && (
        <span className="vc-hot">
          🔥 Most divisive: <b>{hot.q}</b> {hot.pctA}–{100 - hot.pctA}
        </span>
      )}
    </button>
  );
}

function Countdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // Matches the cron in devvit.json: 12:00 UTC daily.
  const next = new Date(now);
  next.setUTCHours(12, 0, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  const ms = next.getTime() - now;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <p className="countdown">
      Next room opens in{' '}
      <b>
        {pad(Math.floor(ms / 3_600_000))}:{pad(Math.floor((ms % 3_600_000) / 60_000))}:{pad(Math.floor((ms % 60_000) / 1000))}
      </b>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------
function SheetFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label={title}>
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

function LeaderboardSheet({ me, onClose }: { me: string | null; onClose: () => void }) {
  const [tab, setTab] = useState<'day' | 'allTime' | 'contrarians'>('day');
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  useEffect(() => {
    api.get<LeaderboardResponse>('/api/leaderboard').then(setData, () => showToast('Could not load leaderboard'));
  }, []);
  const rows = data?.[tab] ?? [];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const myRank = tab === 'day' ? data?.me.dayRank : tab === 'allTime' ? data?.me.allTimeRank : data?.me.contraRank;
  const unit = tab === 'contrarians' ? 'hot takes' : 'pts';

  return (
    <SheetFrame title="Leaderboard" onClose={onClose}>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'day'} className={tab === 'day' ? 'active' : ''} onClick={() => setTab('day')}>This room</button>
        <button role="tab" aria-selected={tab === 'allTime'} className={tab === 'allTime' ? 'active' : ''} onClick={() => setTab('allTime')}>All time</button>
        <button role="tab" aria-selected={tab === 'contrarians'} className={tab === 'contrarians' ? 'active' : ''} onClick={() => setTab('contrarians')}>🙃 Contrarians</button>
      </div>
      {tab === 'contrarians' && <p className="muted small tab-note">Most picks against the majority. Hot takes welcome.</p>}
      {!data ? (
        <div className="spinner" />
      ) : rows.length === 0 ? (
        <div className="empty">
          <div className="state-emoji">🪑</div>
          <p>The room is empty. Be the first to read it!</p>
        </div>
      ) : (
        <>
          <div className="podium">
            {[1, 0, 2].map((i) => {
              const r = podium[i];
              if (!r) return <div key={i} className="podium-slot empty-slot" />;
              return (
                <div key={i} className={`podium-slot p${i + 1} ${r.username === me ? 'is-me' : ''}`}>
                  <span className="podium-medal">{['🥇', '🥈', '🥉'][i]}</span>
                  <span className="podium-name">u/{r.username}</span>
                  <span className="podium-score">{r.score}<small> {unit}</small></span>
                  <span className="podium-block" />
                </div>
              );
            })}
          </div>
          {rest.length > 0 && (
            <ol className="board">
              {rest.map((r) => (
                <li key={r.rank} className={r.username === me ? 'is-me' : ''}>
                  <span className="rank">#{r.rank}</span>
                  <span className="name">u/{r.username}</span>
                  <span className="pts">{r.score}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {myRank && (
        <p className="board-me">
          You’re <b>#{myRank}</b> {tab === 'day' ? 'in this room' : tab === 'allTime' ? 'all time' : 'among contrarians'}
        </p>
      )}
    </SheetFrame>
  );
}

function SuggestSheet({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<SuggestionsResponse | null>(null);
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  const [voted, setVoted] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    api.get<SuggestionsResponse>('/api/suggestions').then(setData, () => setData({ items: [], remainingToday: 0 }));
  }, []);
  useEffect(refresh, [refresh]);

  const vote = async (id: string) => {
    buzz();
    setVoted((v) => new Set(v).add(id));
    try {
      await api.post('/api/suggestions/vote', { id });
    } catch {
      /* optimistic */
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post<OkResponse>('/api/suggest', { q, a, b });
      showToast({ text: res.message ?? 'Submitted!', appearance: 'success' });
      setQ('');
      setA('');
      setB('');
      refresh();
    } catch (e) {
      if (!isLoginErr(e)) showToast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const limitHit = data?.remainingToday === 0;
  return (
    <SheetFrame title="Shape tomorrow’s room" onClose={onClose}>
      <p className="muted small">Top-voted debates get featured in upcoming rooms, with your name on them.</p>
      {data?.items.length ? (
        <ul className="sugg-list">
          {data.items.map((s) => (
            <li key={s.id}>
              <div className="sugg-body">
                <div className="sugg-q">{s.q}</div>
                <div className="sugg-opts"><span className="ta">{s.a}</span><span className="vs">vs</span><span className="tb">{s.b}</span></div>
                <div className="muted tiny">u/{s.author}</div>
              </div>
              <button className={`vote ${voted.has(s.id) ? 'voted' : ''}`} onClick={() => void vote(s.id)} disabled={voted.has(s.id)} aria-label="Upvote">
                <span>▲</span>
                <b>{s.votes + (voted.has(s.id) ? 1 : 0)}</b>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        data && <p className="empty small">No pending debates to vote on. Start one!</p>
      )}

      <div className="form">
        <label className="field">
          <span className="field-label">Debate <em>{q.length}/70</em></span>
          <input value={q} maxLength={70} onChange={(e) => setQ(e.target.value)} placeholder="Is a burrito a sandwich?" />
        </label>
        <div className="field-row">
          <label className="field">
            <span className="field-label ta">Side A</span>
            <input value={a} maxLength={24} onChange={(e) => setA(e.target.value)} placeholder="🌯 Sandwich" />
          </label>
          <span className="vs">vs</span>
          <label className="field">
            <span className="field-label tb">Side B</span>
            <input value={b} maxLength={24} onChange={(e) => setB(e.target.value)} placeholder="🙅 No way" />
          </label>
        </div>
        <button className="btn btn-primary" disabled={busy || !q.trim() || !a.trim() || !b.trim() || limitHit} onClick={() => void submit()}>
          {limitHit ? 'Daily limit reached' : `Submit debate${data ? ` · ${data.remainingToday} left today` : ''}`}
        </button>
      </div>
    </SheetFrame>
  );
}

function HowToSheet({ onClose }: { onClose: () => void }) {
  return (
    <SheetFrame title="How to play" onClose={onClose}>
      <ol className="howto">
        <li><span className="howto-n">1</span><div><b>Pick your side.</b><p>Be honest. Your vote becomes part of the room.</p></div></li>
        <li><span className="howto-n">2</span><div><b>Predict the split.</b><p>Drag to the % of the subreddit you think picked the left side.</p></div></li>
        <li><span className="howto-n">3</span><div><b>Get scored.</b><p>100 for a perfect read, minus 2 for every point you’re off. The 👑 Final Boss debate counts double.</p></div></li>
        <li><span className="howto-n">4</span><div><b>Scores lock tomorrow.</b><p>When the next room opens, everyone is re-scored against the final split. Vote against the crowd to climb the 🙃 Contrarians board.</p></div></li>
      </ol>
      <div className="grades">
        <span className="g-bullseye">Bullseye 94+</span>
        <span className="g-close">Close 75+</span>
        <span className="g-off">Off 45+</span>
        <span className="g-miss">Way off</span>
      </div>
      <p className="small muted">
        Score {Math.round(MAX_POINTS_PER_DAY * 0.9)}+/{MAX_POINTS_PER_DAY} to earn <b>🔮 Mind Reader</b>. A new room opens every day at 12:00 UTC. Play daily to keep your 🔥 streak.
      </p>
    </SheetFrame>
  );
}

function VerdictSheet({ verdict, onClose }: { verdict: Verdict; onClose: () => void }) {
  return (
    <SheetFrame title={`Room #${verdict.day}: the verdict`} onClose={onClose}>
      <p className="muted small">{verdict.players.toLocaleString()} players · final splits</p>
      <ol className="verdict-list">
        {verdict.prompts.map((p, i) => {
          const la = splitLabel(p.a);
          const lb = splitLabel(p.b);
          return (
            <li key={i}>
              <div className="vl-top">
                <span className="vl-q">{p.q}</span>
                {i === verdict.divisive && <span className="tag hot">🔥 Divisive</span>}
                {i === verdict.lopsided && i !== verdict.divisive && <span className="tag cold">🧊 One-sided</span>}
              </div>
              <div className="vl-bar">
                <i style={{ width: `${p.pctA}%` }} />
              </div>
              <div className="vl-labels">
                <span className="ta">{la.emoji} {la.text} <b>{p.pctA}%</b></span>
                <span className="tb"><b>{100 - p.pctA}%</b> {lb.emoji} {lb.text}</span>
              </div>
              {p.author && <div className="tiny muted">✨ by u/{p.author} · {p.total} votes</div>}
            </li>
          );
        })}
      </ol>
      {verdict.top.length > 0 && (
        <div className="vl-top3">
          <b>Best readers</b>
          {verdict.top.map((t, i) => (
            <span key={t.username}>{['🥇', '🥈', '🥉'][i]} u/{t.username} <b>{t.score}</b></span>
          ))}
        </div>
      )}
    </SheetFrame>
  );
}

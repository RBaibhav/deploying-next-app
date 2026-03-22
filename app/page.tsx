"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./game.module.css";

// ─── types ────────────────────────────────────────────────────────────────────
type Status = "idle" | "playing" | "won";

interface GameState {
  pegs: number[][];       // each inner array is a stack; top = last element
  selected: number | null;
  moves: number;
  startTime: number | null;
  status: Status;
}

interface PersonalBest {
  time: number | null;   // ms
  moves: number | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function buildPegs(n: number): number[][] {
  // disk sizes: n = biggest … 1 = smallest
  const disks: number[] = [];
  for (let i = n; i >= 1; i--) disks.push(i);
  return [disks, [], []];
}

function isValidMove(pegs: number[][], from: number, to: number): boolean {
  if (from === to) return false;
  const fromPeg = pegs[from];
  const toPeg = pegs[to];
  if (fromPeg.length === 0) return false;
  const disk = fromPeg[fromPeg.length - 1];
  if (toPeg.length === 0) return true;
  return disk < toPeg[toPeg.length - 1];
}

function formatTime(ms: number): string {
  const totalTenths = Math.floor(ms / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function pbKey(difficulty: number): string {
  return `hanoi_pb_${difficulty}`;
}

function loadPB(difficulty: number): PersonalBest {
  if (typeof window === "undefined") return { time: null, moves: null };
  try {
    const raw = localStorage.getItem(pbKey(difficulty));
    if (raw) return JSON.parse(raw) as PersonalBest;
  } catch { }
  return { time: null, moves: null };
}

function savePB(difficulty: number, time: number, moves: number): PersonalBest {
  const prev = loadPB(difficulty);
  const next: PersonalBest = {
    time: prev.time === null ? time : Math.min(prev.time, time),
    moves: prev.moves === null ? moves : Math.min(prev.moves, moves),
  };
  try {
    localStorage.setItem(pbKey(difficulty), JSON.stringify(next));
  } catch { }
  return next;
}

// ─── disk colours: warm gradient coral→amber→yellow for size 1→n ─────────────
// size 1 = smallest = hottest colour, size n = largest = coolest
const DISK_GRADIENTS: Record<number, [string, string]> = {
  1: ["#ff4e2a", "#ff7043"],
  2: ["#ff6b3d", "#ff8c42"],
  3: ["#ff8c42", "#ffaa55"],
  4: ["#ffaa55", "#ffc066"],
  5: ["#ffc066", "#ffe066"],
};

function diskGradient(size: number, total: number): string {
  // map size (1=smallest .. total=largest) to our 5-stop palette
  const idx = Math.round(((size - 1) / (total - 1)) * 4) + 1;
  const clamped = Math.max(1, Math.min(5, idx));
  const [a, b] = DISK_GRADIENTS[clamped];
  return `linear-gradient(90deg, ${a}, ${b})`;
}

function diskWidth(size: number, total: number): string {
  const min = 28; // %
  const max = 88; // %
  const pct = min + ((size - 1) / (total - 1)) * (max - min);
  return `${pct}%`;
}

// ─── component ────────────────────────────────────────────────────────────────
export default function TowerOfHanoi() {
  const [difficulty, setDifficulty] = useState<3 | 4 | 5>(4);
  const [game, setGame] = useState<GameState>({
    pegs: buildPegs(4),
    selected: null,
    moves: 0,
    startTime: null,
    status: "idle",
  });
  const [elapsed, setElapsed] = useState(0);
  const [shakingPeg, setShakingPeg] = useState<number | null>(null);
  const [wonAt, setWonAt] = useState(0);
  const [pb, setPb] = useState<PersonalBest>({ time: null, moves: null });
  const [newPB, setNewPB] = useState<{ time: boolean; moves: boolean }>({ time: false, moves: false });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── timer ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (game.status === "playing" && game.startTime !== null) {
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - game.startTime!);
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [game.status, game.startTime]);

  // ─── load PB when difficulty changes ────────────────────────────────────────
  useEffect(() => {
    setPb(loadPB(difficulty));
  }, [difficulty]);

  // ─── core click handler ──────────────────────────────────────────────────────
  const handlePegClick = useCallback(
    (pegIdx: number) => {
      if (game.status === "idle" || game.status === "won") return;

      setGame((prev) => {
        const { pegs, selected, moves, startTime } = prev;

        // Selecting a peg
        if (selected === null) {
          if (pegs[pegIdx].length === 0) return prev; // empty peg, nothing to select
          return { ...prev, selected: pegIdx };
        }

        // Clicking the same peg → deselect
        if (selected === pegIdx) {
          return { ...prev, selected: null };
        }

        // Attempt move
        if (!isValidMove(pegs, selected, pegIdx)) {
          // trigger shake on target peg
          setShakingPeg(pegIdx);
          if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
          shakeTimerRef.current = setTimeout(() => setShakingPeg(null), 500);
          return { ...prev, selected: null };
        }

        // Valid move: mutate pegs immutably
        const newPegs = pegs.map((p) => [...p]);
        const disk = newPegs[selected].pop()!;
        newPegs[pegIdx].push(disk);

        const newMoves = moves + 1;
        const newStart = startTime ?? Date.now();

        // Check win: all disks on peg C (index 2)
        const totalDisks = newPegs.reduce((acc, p) => acc + p.length, 0);
        const won = newPegs[2].length === totalDisks;

        if (won) {
          const elapsed = Date.now() - newStart;
          setWonAt(elapsed);
          // Save PB
          const updatedPb = savePB(difficulty, elapsed, newMoves);
          const prevPb = loadPB(difficulty);
          setNewPB({
            time: prevPb.time === null || elapsed < prevPb.time,
            moves: prevPb.moves === null || newMoves < prevPb.moves,
          });
          setPb(updatedPb);
          return {
            pegs: newPegs,
            selected: null,
            moves: newMoves,
            startTime: newStart,
            status: "won",
          };
        }

        return {
          pegs: newPegs,
          selected: null,
          moves: newMoves,
          startTime: newStart,
          status: "playing",
        };
      });
    },
    [game.status, difficulty]
  );

  // ─── start game ─────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    setElapsed(0);
    setShakingPeg(null);
    setGame({
      pegs: buildPegs(difficulty),
      selected: null,
      moves: 0,
      startTime: null,
      status: "playing",
    });
  }, [difficulty]);

  // ─── restart / change difficulty ────────────────────────────────────────────
  const restartGame = useCallback(() => {
    setElapsed(0);
    setShakingPeg(null);
    setGame({
      pegs: buildPegs(difficulty),
      selected: null,
      moves: 0,
      startTime: null,
      status: "playing",
    });
  }, [difficulty]);

  const goIdle = useCallback(() => {
    setElapsed(0);
    setShakingPeg(null);
    setGame({
      pegs: buildPegs(difficulty),
      selected: null,
      moves: 0,
      startTime: null,
      status: "idle",
    });
  }, [difficulty]);

  const changeDifficulty = useCallback((d: 3 | 4 | 5) => {
    setDifficulty(d);
    setElapsed(0);
    setShakingPeg(null);
    setGame({
      pegs: buildPegs(d),
      selected: null,
      moves: 0,
      startTime: null,
      status: "idle",
    });
  }, []);

  // ─── derived ─────────────────────────────────────────────────────────────────
  const optimal = Math.pow(2, difficulty) - 1;
  const displayTime = game.status === "won" ? wonAt : elapsed;
  const efficiency =
    game.status === "won" && game.moves > 0
      ? Math.round((optimal / game.moves) * 100)
      : null;

  const LABELS = ["A", "B", "C"];

  // ─── render ──────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        {/* ── Top Bar ── */}
        <div className={styles.topBar}>
          <div>
            <div className={styles.title}>Tower of Hanoi</div>
            <div className={styles.subtitle}>Speedrun Edition</div>
          </div>
          {game.status !== "idle" && (
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Moves</span>
                <span className={styles.statValue}>{game.moves}</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Time</span>
                <span className={styles.statValue}>{formatTime(displayTime)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ─────────── IDLE: difficulty picker ─────────── */}
        {game.status === "idle" && (
          <div className={styles.difficultyScreen}>
            <div>
              <div className={styles.difficultyTitle}>Tower of Hanoi</div>
              <div className={styles.difficultySubtitle}>
                Speedrun Edition — How fast can you solve it?
              </div>
            </div>

            <div className={styles.difficultyButtons}>
              {([3, 4, 5] as const).map((d) => (
                <button
                  key={d}
                  className={[
                    styles.diffBtn,
                    difficulty === d ? styles.diffBtnActive : "",
                  ].join(" ")}
                  onClick={() => changeDifficulty(d)}
                >
                  <span>{d}</span>
                  <span className={styles.diffBtnLabel}>Disks</span>
                </button>
              ))}
            </div>

            {/* Personal Bests */}
            <PersonalBestDisplay difficulty={difficulty} pb={pb} optimal={optimal} />

            <button className={styles.startBtn} onClick={startGame}>
              Start Game →
            </button>
          </div>
        )}

        {/* ─────────── PLAYING ─────────── */}
        {game.status === "playing" && (
          <div className={styles.gameArea}>
            <div className={styles.pegsRow}>
              {game.pegs.map((peg, pegIdx) => (
                <PegColumn
                  key={pegIdx}
                  peg={peg}
                  pegIdx={pegIdx}
                  total={difficulty}
                  selected={game.selected}
                  shaking={shakingPeg === pegIdx}
                  label={LABELS[pegIdx]}
                  onClick={handlePegClick}
                />
              ))}
            </div>

            <div className={styles.hintBar}>
              {game.selected !== null ? (
                <>
                  Peg <span>{LABELS[game.selected]}</span> selected — click
                  another peg to move
                </>
              ) : (
                <>Click a peg to select the top disk</>
              )}
            </div>

            <div className={styles.controls}>
              <button className={styles.controlBtn} onClick={restartGame}>
                ↺ Restart
              </button>
              <button className={styles.controlBtn} onClick={goIdle}>
                ✕ Give Up
              </button>
            </div>
          </div>
        )}

        {/* ─────────── WON: results modal ───────────── */}
        {game.status === "won" && (
          <>
            {/* keep board visible under modal */}
            <div className={styles.gameArea}>
              <div className={styles.pegsRow}>
                {game.pegs.map((peg, pegIdx) => (
                  <PegColumn
                    key={pegIdx}
                    peg={peg}
                    pegIdx={pegIdx}
                    total={difficulty}
                    selected={null}
                    shaking={false}
                    label={LABELS[pegIdx]}
                    onClick={() => { }}
                  />
                ))}
              </div>
            </div>

            <div className={styles.modalBackdrop}>
              <div className={styles.modal}>
                <div className={styles.modalTrophy}>🏆</div>
                <div className={styles.modalTitle}>Solved!</div>

                {(newPB.time || newPB.moves) && (
                  <div className={styles.pbBadge}>
                    ✦ New Personal Best{newPB.time && newPB.moves ? " (Time & Moves)" : newPB.time ? " (Time)" : " (Moves)"}!
                  </div>
                )}

                <div className={styles.statsGrid}>
                  <div className={styles.statCard}>
                    <span className={styles.statCardLabel}>Time</span>
                    <span className={`${styles.statCardValue} ${styles.amber}`}>
                      {formatTime(wonAt)}
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statCardLabel}>Moves</span>
                    <span className={`${styles.statCardValue} ${styles.amber}`}>
                      {game.moves}
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statCardLabel}>Optimal moves</span>
                    <span className={styles.statCardValue}>{optimal}</span>
                  </div>
                  <div className={[styles.statCard, styles.highlight].join(" ")}>
                    <span className={styles.statCardLabel}>Efficiency</span>
                    <span
                      className={`${styles.statCardValue} ${efficiency! >= 90
                          ? styles.green
                          : efficiency! >= 60
                            ? styles.amber
                            : styles.coral
                        }`}
                    >
                      {efficiency}%
                    </span>
                  </div>

                  {/* PB row */}
                  <div className={styles.statCard}>
                    <span className={styles.statCardLabel}>Best Time</span>
                    <span className={`${styles.statCardValue} ${styles.green}`}>
                      {pb.time !== null ? formatTime(pb.time) : "—"}
                    </span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statCardLabel}>Best Moves</span>
                    <span className={`${styles.statCardValue} ${styles.green}`}>
                      {pb.moves !== null ? pb.moves : "—"}
                    </span>
                  </div>
                </div>

                <div className={styles.modalButtons}>
                  <button
                    className={styles.modalBtn}
                    onClick={goIdle}
                  >
                    Change Difficulty
                  </button>
                  <button
                    className={[styles.modalBtn, styles.modalBtnPrimary].join(" ")}
                    onClick={restartGame}
                  >
                    Play Again →
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── PegColumn sub-component ──────────────────────────────────────────────────
function PegColumn({
  peg,
  pegIdx,
  total,
  selected,
  shaking,
  label,
  onClick,
}: {
  peg: number[];
  pegIdx: number;
  total: number;
  selected: number | null;
  shaking: boolean;
  label: string;
  onClick: (idx: number) => void;
}) {
  const isSelected = selected === pegIdx;

  return (
    <div
      className={[
        styles.pegWrapper,
        isSelected ? styles.pegSelected : "",
        shaking ? styles.shaking : "",
      ].join(" ")}
      onClick={() => onClick(pegIdx)}
    >
      <div className={styles.pegContainer}>
        <div className={styles.pegRod} />
        <div className={styles.disksStack}>
          {peg.map((size, i) => {
            const isTopDisk = i === peg.length - 1;
            const isSelectedDisk = isSelected && isTopDisk;
            return (
              <div
                key={size}
                className={[styles.disk, isSelectedDisk ? styles.diskSelected : ""].join(" ")}
                style={{
                  width: diskWidth(size, total),
                  background: diskGradient(size, total),
                  boxShadow: isSelectedDisk
                    ? `0 0 14px 3px ${diskGradientMidColor(size, total)}88`
                    : `0 2px 6px rgba(0,0,0,0.4)`,
                }}
              />
            );
          })}
        </div>
        <div className={styles.pegBase} />
      </div>
      <div className={styles.pegLabel}>{label}</div>
    </div>
  );
}

// ─── PersonalBestDisplay sub-component ────────────────────────────────────────
function PersonalBestDisplay({
  difficulty,
  pb,
  optimal,
}: {
  difficulty: number;
  pb: PersonalBest;
  optimal: number;
}) {
  if (pb.time === null && pb.moves === null) return null;

  return (
    <div className={styles.personalBests}>
      <div className={styles.pbItem}>
        <span className={styles.pbLabel}>Best Time ({difficulty} disks)</span>
        <span className={[styles.pbValue, pb.time === null ? styles.pbNone : ""].join(" ")}>
          {pb.time !== null ? formatTime(pb.time) : "—"}
        </span>
      </div>
      <div className={styles.pbItem}>
        <span className={styles.pbLabel}>Best Moves</span>
        <span className={[styles.pbValue, pb.moves === null ? styles.pbNone : ""].join(" ")}>
          {pb.moves !== null ? pb.moves : "—"}
        </span>
      </div>
      <div className={styles.pbItem}>
        <span className={styles.pbLabel}>Optimal</span>
        <span className={styles.pbValue} style={{ color: "#aaa" }}>
          {optimal}
        </span>
      </div>
    </div>
  );
}

// ─── helper for glow colour ───────────────────────────────────────────────────
function diskGradientMidColor(size: number, total: number): string {
  const idx = Math.round(((size - 1) / (total - 1)) * 4) + 1;
  const clamped = Math.max(1, Math.min(5, idx));
  return DISK_GRADIENTS[clamped][0];
}

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DailyMissionsView, MissionTaskView } from "@/src/db/missions";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage, testTranslator } from "@/src/i18n/test-intl";
import { COSMETICS } from "@/src/lib/cosmetics";
import { MISSION_KINDS, missionTarget, type StreakView } from "@/src/lib/missions";

vi.mock("@/app/saves/[id]/actions", () => ({ changeMissionAction: vi.fn() }));

const { DailyMissionsCard, DailyMissionsLine, missionTitle } = await import("./daily-missions");

const task = (rest: Partial<MissionTaskView> & Pick<MissionTaskView, "tier" | "kind">): MissionTaskView => ({
  target: missionTarget(rest.kind),
  progress: 0,
  completed: false,
  tokens: rest.tier === "EASY" ? 10 : rest.tier === "MEDIUM" ? 20 : 40,
  changedFrom: null,
  ...rest,
});

const streak = (rest: Partial<StreakView> = {}): StreakView => ({
  current: 2,
  best: 4,
  cycles: 0,
  counted: false,
  nextCycleDay: 3,
  shielded: false,
  last: null,
  ...rest,
});

/** The day's missions as getDailyMissions gives them: the easy one done, two to do, a streak of two days running. */
const missions = (rest: Partial<DailyMissionsView> = {}): DailyMissionsView => ({
  day: "2026-11-18",
  tasks: [
    task({ tier: "EASY", kind: "PLAY_MATCH", progress: 1, completed: true }),
    task({ tier: "MEDIUM", kind: "LIVE_SUBSTITUTION" }),
    task({ tier: "HARD", kind: "LIVE_WIN" }),
  ],
  done: 1,
  balance: 340,
  earnedToday: 10,
  streak: streak(),
  shield: false,
  changeUsed: false,
  nextLot: { cycle: 1, cosmetics: ["frame-bronze", "badge-one-week"] },
  welcome: 0,
  ...rest,
});

const render = (element: ReactElement, locale: Locale = "fr") => renderToStaticMarkup(inLanguage(element, locale)).replace(/ | /g, " ");

describe("the day's missions", () => {
  it("names every mission, every tier and every cosmetic in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      const t = testTranslator(locale, "missions");
      const tRewards = testTranslator(locale, "rewards");
      for (const kind of MISSION_KINDS) {
        expect(missionTitle({ kind, target: missionTarget(kind) }, t)).not.toMatch(/\{|missions\./);
        expect(t(`how.${kind}`)).not.toMatch(/\{|missions\./);
      }
      for (const { id } of COSMETICS) {
        expect(tRewards(`cosmetics.${id}.name`)).not.toMatch(/\{|rewards\./);
        expect(tRewards(`cosmetics.${id}.how`)).not.toMatch(/\{|rewards\./);
      }
    }
    expect(missionTitle({ kind: "PLAY_MATCHES", target: 3 }, testTranslator("fr", "missions"))).toBe("Joue 3 matchs");
    expect(missionTitle({ kind: "PLAY_MATCHES", target: 3 }, testTranslator("en", "missions"))).toBe("Play 3 matches");
  });

  it("shows the three missions, their tokens, the balance, the cycle's bonuses and the change, in French", () => {
    const markup = render(<DailyMissionsCard saveId="s1" missions={missions()} />);

    expect(markup).toContain('data-done="1"');
    expect(markup.match(/data-testid="mission-task"/g)).toHaveLength(3);
    for (const text of [
      ">Missions du jour</h2>",
      "2 jours d&#x27;affilée",
      'data-tokens="340"',
      "Facile · +10",
      "Moyenne · +20",
      "Difficile · +40",
      "Fais un changement pendant un match en direct",
      "Les trois : +30",
      "J3 : +50 · J7 : +150 et cadre Bronze et badge « Une semaine »",
      "Une mission aujourd&#x27;hui pour passer à 3 jours.",
      'href="/saves/s1/rewards"',
    ]) {
      expect(markup).toContain(text);
    }
    // A change on each mission not started, none on the one done; SVG signs, never an emoji.
    expect(markup.match(/data-testid="mission-change"/g)).toHaveLength(2);
    expect(markup).toContain("<svg");
  });

  it("says all three done, the seventh day's lot earned and tomorrow's, in English, without a change left", () => {
    const done = missions({
      tasks: [
        task({ tier: "EASY", kind: "PLAY_MATCH", progress: 1, completed: true }),
        task({ tier: "MEDIUM", kind: "WIN", progress: 1, completed: true }),
        task({ tier: "HARD", kind: "LIVE_WIN", progress: 1, completed: true }),
      ],
      done: 3,
      changeUsed: true,
      streak: streak({ current: 7, best: 7, cycles: 1, counted: true, nextCycleDay: 7 }),
      nextLot: { cycle: 2, cosmetics: ["title-regular"] },
    });

    const markup = render(<DailyMissionsCard saveId="s1" missions={done} />, "en");

    for (const text of ["All three: +30 earned", "D7: +150 and “One week” badge and Bronze frame earned", "Tomorrow: three new missions", "It&#x27;s your record."]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain('data-testid="mission-change"');
  });

  it("keeps a streak alive by the shield, and starts one after a broken one", () => {
    expect(render(<DailyMissionsCard saveId="s1" missions={missions({ streak: streak({ shielded: true, current: 4 }) })} />)).toContain(
      "Hier manqué : une mission aujourd&#x27;hui, et ton protège-série garde ta série.",
    );
    expect(render(<DailyMissionsCard saveId="s1" missions={missions({ streak: streak({ current: 0, last: 5 }) })} />)).toContain(
      "Ta dernière série a duré 5 jours. Une mission aujourd&#x27;hui en lance une nouvelle.",
    );
  });

  it("sums the day up in the « À demain » card: the tokens of the day, those left, the streak", () => {
    const line = render(<DailyMissionsLine missions={missions({ earnedToday: 30 })} />);

    for (const text of ["+30 aujourd&#x27;hui · solde 340", "Missions 1/3", "Fais un changement pendant un match en direct (+20) et Gagne un match en direct (+40)", "2 jours d&#x27;affilée"]) {
      expect(line).toContain(text);
    }
  });
});

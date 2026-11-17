import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DailyMissionView } from "@/src/db/missions";
import type { Locale } from "@/src/i18n/locale";
import { MISSION_KINDS, MISSION_TARGETS } from "@/src/lib/missions";
import { inLanguage, testTranslator } from "@/src/i18n/test-intl";
import { DailyMissionCard, DailyMissionLine, missionTitle } from "./daily-mission";

/** A mission of the day as getDailyMission gives it: to play three matches, one played, a streak of two days running. */
const mission = (rest: Partial<DailyMissionView> = {}): DailyMissionView => ({
  day: "2026-11-17",
  kind: "PLAY_MATCHES",
  target: 3,
  progress: 1,
  completed: false,
  streak: { current: 2, best: 4, last: null },
  ...rest,
});

const render = (element: ReactElement, locale: Locale = "fr") => renderToStaticMarkup(inLanguage(element, locale)).replace(/ /g, " ");

describe("the day's mission", () => {
  it("names every mission in both languages, its target in words", () => {
    for (const locale of ["fr", "en"] as const) {
      const t = testTranslator(locale, "missions");
      for (const kind of MISSION_KINDS) {
        expect(missionTitle({ kind, target: MISSION_TARGETS[kind] }, t)).not.toMatch(/\{|missions\./);
        expect(t(`how.${kind}`)).not.toMatch(/\{|missions\./);
      }
    }
    expect(missionTitle({ kind: "PLAY_MATCHES", target: 3 }, testTranslator("fr", "missions"))).toBe("Joue 3 matchs");
    expect(missionTitle({ kind: "PLAY_MATCHES", target: 3 }, testTranslator("en", "missions"))).toBe("Play 3 matches");
  });

  it("shows what to do, how, how far it is and the streak to keep, in French", () => {
    const markup = render(<DailyMissionCard saveId="s1" mission={mission()} />);

    expect(markup).toContain('data-kind="PLAY_MATCHES"');
    expect(markup).toContain('data-completed="false"');
    for (const text of [
      ">Mission du jour</h2>",
      "2 jours d&#x27;affilée",
      "Joue 3 matchs",
      "En direct ou simulés, toutes compétitions.",
      ">1/3</span>",
      'aria-valuenow="1"',
      "Accomplis-la pour passer à 3 jours.",
    ]) {
      expect(markup).toContain(text);
    }
    // An SVG sign, never an emoji; no way to the line-up but for a youngster to start.
    expect(markup).toContain("<svg");
    expect(markup).not.toContain('data-testid="mission-lineup"');
  });

  it("says a done mission, tomorrow's, and a record, in English", () => {
    const markup = render(<DailyMissionCard saveId="s1" mission={mission({ kind: "WIN", target: 1, progress: 1, completed: true, streak: { current: 4, best: 4, last: null } })} />, "en");

    for (const text of ['data-completed="true"', "Win a match", "Tomorrow: a new mission", ">1/1</span>", "Mission complete", "That&#x27;s your record.", "4 days in a row"]) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain("Live or simulated");
  });

  it("starts a streak again without a reproach, and leads to the line-up for a youngster to start", () => {
    const restart = render(<DailyMissionCard saveId="s1" mission={mission({ kind: "START_YOUTH", target: 1, progress: 0, streak: { current: 0, best: 5, last: 3 } })} />);
    expect(restart).toContain("Ta dernière série a duré 3 jours. Celle-ci en lance une nouvelle.");
    expect(restart).not.toContain('data-testid="mission-streak"');
    expect(restart).toMatch(/data-testid="mission-lineup"[^>]*>Ouvrir la composition<|href="\/saves\/s1\/lineup"/);
    // A first streak, or after a single day: started, nothing said of the last one.
    const first = render(<DailyMissionCard saveId="s1" mission={mission({ streak: { current: 0, best: 1, last: 1 } })} />);
    expect(first).toContain("Accomplis-la pour lancer ta série.");
  });

  it("is recalled in the « À demain » card: still to do with how far it is, or done with its streak and tomorrow's", () => {
    const todo = render(<DailyMissionLine mission={mission({ kind: "PLAY_LIVE", target: 1, progress: 0 })} />);
    expect(todo).toContain('data-completed="false"');
    expect(todo).toContain("Mission du jour : Joue ton prochain match en direct");
    expect(todo).toContain("0/1");

    const done = render(<DailyMissionLine mission={mission({ completed: true, progress: 3, streak: { current: 3, best: 3, last: null } })} />, "en");
    for (const text of ['data-completed="true"', "Daily mission complete", "3 days in a row", "Tomorrow: a new mission"]) {
      expect(done).toContain(text);
    }
  });
});

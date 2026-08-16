import { describe, expect, test } from "bun:test";
import {
  advanceWorldClock,
  createInitialWorldClock,
  durationToMinutes,
  formatWorldClock,
} from "./worldClock";

describe("WorldClock", () => {
  test("starts the campaign on day one in the morning", () => {
    const clock = createInitialWorldClock();

    expect(clock).toMatchObject({
      year: 1,
      month: 1,
      day: 1,
      hour: 8,
      minute: 0,
      weekdayIndex: 0,
      elapsedMinutes: 0,
    });
    expect(formatWorldClock(clock)).toBe(
      "Segunda-feira, 1 de Janeiro do ano 1, 08:00 (região da campanha)",
    );
  });

  test("advances minutes and hours without changing the day", () => {
    const clock = advanceWorldClock(createInitialWorldClock(), { hours: 1, minutes: 35 });

    expect(clock).toMatchObject({ day: 1, hour: 9, minute: 35, elapsedMinutes: 95 });
  });

  test("crosses midnight and advances the weekday", () => {
    const clock = advanceWorldClock(createInitialWorldClock(), { hours: 16 });

    expect(clock).toMatchObject({
      year: 1,
      month: 1,
      day: 2,
      hour: 0,
      minute: 0,
      weekdayIndex: 1,
    });
  });

  test("crosses month and year boundaries", () => {
    const initial = createInitialWorldClock();
    const endOfYear = {
      ...initial,
      month: 12,
      day: 31,
      hour: 23,
      minute: 50,
      weekdayIndex: 6,
    };
    const clock = advanceWorldClock(endOfYear, { minutes: 20 });

    expect(clock).toMatchObject({
      year: 2,
      month: 1,
      day: 1,
      hour: 0,
      minute: 10,
      weekdayIndex: 0,
      elapsedMinutes: 20,
    });
  });

  test("uses the configured calendar day length", () => {
    const clock = createInitialWorldClock();
    clock.calendar.hoursPerDay = 20;
    clock.hour = 19;

    const advanced = advanceWorldClock(clock, { hours: 2 });

    expect(advanced).toMatchObject({ day: 2, hour: 1, weekdayIndex: 1 });
    expect(durationToMinutes(clock, { days: 1 })).toBe(1_200);
  });

  test("rejects zero, negative and fractional durations", () => {
    const clock = createInitialWorldClock();

    expect(() => advanceWorldClock(clock, {})).toThrow("maior que zero");
    expect(() => advanceWorldClock(clock, { minutes: -1 })).toThrow("inteiros não negativos");
    expect(() => advanceWorldClock(clock, { hours: 1.5 })).toThrow("inteiros não negativos");
  });
});

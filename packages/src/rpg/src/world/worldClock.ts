export type CalendarMonth = {
  name: string;
  days: number;
};

export type WorldCalendar = {
  id: string;
  name: string;
  months: CalendarMonth[];
  weekdays: string[];
  hoursPerDay: number;
  minutesPerHour: number;
};

export type WorldClock = {
  calendar: WorldCalendar;
  region: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekdayIndex: number;
  elapsedMinutes: number;
};

export type WorldDuration = {
  days?: number;
  hours?: number;
  minutes?: number;
};

const commonCalendar: WorldCalendar = {
  id: "common",
  name: "Calendário Comum",
  months: [
    { name: "Janeiro", days: 31 },
    { name: "Fevereiro", days: 28 },
    { name: "Março", days: 31 },
    { name: "Abril", days: 30 },
    { name: "Maio", days: 31 },
    { name: "Junho", days: 30 },
    { name: "Julho", days: 31 },
    { name: "Agosto", days: 31 },
    { name: "Setembro", days: 30 },
    { name: "Outubro", days: 31 },
    { name: "Novembro", days: 30 },
    { name: "Dezembro", days: 31 },
  ],
  weekdays: [
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
    "Domingo",
  ],
  hoursPerDay: 24,
  minutesPerHour: 60,
};

export function createInitialWorldClock(): WorldClock {
  return {
    calendar: {
      ...commonCalendar,
      months: commonCalendar.months.map((month) => ({ ...month })),
      weekdays: [...commonCalendar.weekdays],
    },
    region: "região da campanha",
    year: 1,
    month: 1,
    day: 1,
    hour: 8,
    minute: 0,
    weekdayIndex: 0,
    elapsedMinutes: 0,
  };
}

export function durationToMinutes(clock: WorldClock, duration: WorldDuration) {
  const days = duration.days ?? 0;
  const hours = duration.hours ?? 0;
  const minutes = duration.minutes ?? 0;
  const values = [days, hours, minutes];

  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("A duração deve usar números inteiros não negativos.");
  }

  const total = (
    days * clock.calendar.hoursPerDay * clock.calendar.minutesPerHour
    + hours * clock.calendar.minutesPerHour
    + minutes
  );
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new Error("A duração deve ser maior que zero.");
  }

  return total;
}

export function advanceWorldClock(clock: WorldClock, duration: WorldDuration): WorldClock {
  const durationMinutes = durationToMinutes(clock, duration);
  const { calendar } = clock;
  const minuteTotal = clock.minute + durationMinutes;
  const hourTotal = clock.hour + Math.floor(minuteTotal / calendar.minutesPerHour);
  const daysAdvanced = Math.floor(hourTotal / calendar.hoursPerDay);
  let remainingDays = daysAdvanced;
  let year = clock.year;
  let month = clock.month;
  let day = clock.day;

  while (remainingDays > 0) {
    const currentMonth = calendar.months[month - 1];
    if (!currentMonth) throw new Error("O relógio possui um mês inválido.");

    const daysUntilNextMonth = currentMonth.days - day + 1;
    if (remainingDays < daysUntilNextMonth) {
      day += remainingDays;
      remainingDays = 0;
      continue;
    }

    remainingDays -= daysUntilNextMonth;
    day = 1;
    month += 1;
    if (month > calendar.months.length) {
      month = 1;
      year += 1;
    }
  }

  return {
    ...clock,
    year,
    month,
    day,
    hour: hourTotal % calendar.hoursPerDay,
    minute: minuteTotal % calendar.minutesPerHour,
    weekdayIndex: (clock.weekdayIndex + daysAdvanced) % calendar.weekdays.length,
    elapsedMinutes: clock.elapsedMinutes + durationMinutes,
  };
}

export function formatWorldClock(clock: WorldClock) {
  const month = clock.calendar.months[clock.month - 1];
  const weekday = clock.calendar.weekdays[clock.weekdayIndex];
  if (!month || !weekday) throw new Error("O relógio do mundo possui uma data inválida.");

  const hour = String(clock.hour).padStart(2, "0");
  const minute = String(clock.minute).padStart(2, "0");
  return `${weekday}, ${clock.day} de ${month.name} do ano ${clock.year}, ${hour}:${minute} (${clock.region})`;
}

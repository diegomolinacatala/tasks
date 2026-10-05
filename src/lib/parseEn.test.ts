import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import type { Place } from '../types'
import { toInstant } from './date'
import { setLanguage } from './i18n'
import { parseSpoken, parseTask, provideEnglish } from './parse'
import * as englishParser from './parseEn'
import { parseRoutine } from './repeat'

// Viernes 11 de septiembre de 2026, 10:00 hora local.
const NOW = toInstant('2026-09-11', '10:00')
const MINUTE = 60_000

const parse = (input: string, now = NOW, places: readonly Place[] | null = []) => parseTask(input, now, places)

beforeAll(() => {
  provideEnglish(englishParser)
  setLanguage('en')
})
afterAll(() => setLanguage('es'))

describe('nothing to detect', () => {
  test.each(['buy 5 apples', 'read 20 pages', 'tomorrowland tickets', 'study 2h', 'meet at a cafe', 'work 9 to 5'])(
    '«%s» stays literal',
    (input) => {
      expect(parse(input)).toEqual({ title: input, date: null, time: null, duration: null, reminders: [], label: null })
    },
  )

  test('with nothing left as a title, it stays literal', () => {
    expect(parse('tomorrow')).toMatchObject({ title: 'tomorrow', date: null })
  })
})

describe('days', () => {
  test.each([
    ['buy bread today', '2026-09-11', 'Today'],
    ['buy bread tomorrow', '2026-09-12', 'Tomorrow'],
    ['buy bread tmrw', '2026-09-12', 'Tomorrow'],
    ['buy bread the day after tomorrow', '2026-09-13', null],
    ['Buy bread TOMORROW', '2026-09-12', 'Tomorrow'],
  ])('«%s»', (input, date, label) => {
    const result = parse(input)
    expect(result.title.toLowerCase()).toBe('buy bread')
    expect(result.date).toBe(date)
    expect(result.time).toBeNull()
    if (label) expect(result.label).toBe(label)
  })

  test.each([
    ['meeting on monday', '2026-09-14'],
    ['meeting monday', '2026-09-14'],
    ['meeting next wednesday', '2026-09-16'],
    ['meeting this friday', '2026-09-18'],
    ['meeting thursday', '2026-09-17'],
    ['meeting on tues', '2026-09-15'],
    ['meeting monday next week', '2026-09-14'],
    ['meeting next week on thursday', '2026-09-17'],
  ])('weekday: «%s»', (input, date) => {
    expect(parse(input)).toMatchObject({ title: 'meeting', date })
  })

  test.each([
    ['dentist on October 15', '2026-10-15'],
    ['dentist Oct 15th', '2026-10-15'],
    ['dentist Sept 3', '2027-09-03'],
    ['dentist 15 October', '2026-10-15'],
    ['dentist on the 15th of October', '2026-10-15'],
    ['dentist 10/15', '2026-10-15'],
    ['dentist 3/1/2027', '2027-03-01'],
    ['dentist September 20, 2028', '2028-09-20'],
    ['dentist on the 22nd', '2026-09-22'],
    ['dentist saturday the 26th', '2026-09-26'],
  ])('date: «%s»', (input, date) => {
    expect(parse(input)).toMatchObject({ title: 'dentist', date })
  })
})

describe('times', () => {
  test.each([
    ['call mom at 5pm', '17:00'],
    ['call mom at 5', '17:00'],
    ['call mom at 9', '09:00'],
    ['call mom 5:30pm', '17:30'],
    ['call mom at 5:30 p.m.', '17:30'],
    ['call mom at 17:00', '17:00'],
    ['call mom at 7 in the morning', '07:00'],
    ['call mom at 12am', '00:00'],
    ['call mom at 12pm', '12:00'],
    ['call mom at noon', '12:00'],
    ['call mom at 9 at night', '21:00'],
    ['call mom tonight at 9', '21:00'],
    ['call mom at five', '17:00'],
    ['call mom at 6 o’clock', '18:00'],
  ])('«%s» → %s', (input, time) => {
    const result = parse(input)
    expect(result.title).toBe('call mom')
    expect(result.time).toBe(time)
  })

  test('a time that has passed today means tomorrow', () => {
    expect(parse('call mom at 9am')).toMatchObject({ date: '2026-09-12', time: '09:00' })
    expect(parse('call mom at 11am')).toMatchObject({ date: '2026-09-11', time: '11:00' })
  })

  test('with a time and no reminders asked, it reminds on time', () => {
    expect(parse('call mom tomorrow at 5pm')).toMatchObject({
      date: '2026-09-12',
      time: '17:00',
      reminders: [{ kind: 'before', minutes: 0 }],
      label: 'Tomorrow 5:00 PM',
    })
  })

  test('at 3:30 is in the afternoon, like at 3', () => {
    expect(parse('pick up the kids at 3:30')).toMatchObject({ date: '2026-09-11', time: '15:30' })
  })

  test('this weekend and next week', () => {
    expect(parse('mow the lawn this weekend')).toMatchObject({ title: 'mow the lawn', date: '2026-09-12' })
    expect(parse('book flights next week')).toMatchObject({ title: 'book flights', date: '2026-09-14' })
  })

  test('a part of the day after the day: tomorrow morning, friday night', () => {
    expect(parse('gym tomorrow morning')).toMatchObject({ title: 'gym', date: '2026-09-12', time: '09:00' })
    expect(parse('dinner friday night')).toMatchObject({ title: 'dinner', date: '2026-09-18', time: '21:00' })
    expect(parse('call the bank monday afternoon at 4')).toMatchObject({ title: 'call the bank', date: '2026-09-14', time: '16:00' })
  })

  test('words that belong to the task stay at the end of the title', () => {
    expect(parse('check in tomorrow at 9').title).toBe('check in')
    expect(parse('log on tomorrow').title).toBe('log on')
  })

  test('tonight is today, in the evening', () => {
    expect(parse('dinner tonight')).toMatchObject({ title: 'dinner', date: '2026-09-11', time: '21:00' })
  })
})

describe('in a while', () => {
  test.each([
    ['take the cake out in 30 minutes', 30],
    ['take the cake out in 30 min', 30],
    ['take the cake out in an hour', 60],
    ['take the cake out in half an hour', 30],
    ['take the cake out in an hour and a half', 90],
    ['take the cake out in 1.5 hours', 90],
    ['take the cake out in 2h', 120],
    ['take the cake out in twenty minutes', 20],
  ])('«%s»', (input, minutes) => {
    const result = parse(input)
    expect(result.title).toBe('take the cake out')
    expect(result.reminders).toEqual([{ kind: 'at', at: NOW + minutes * MINUTE }])
  })

  test('a request left at the end goes away', () => {
    expect(parse('call Ana, remind me in 10 minutes')).toMatchObject({ title: 'call Ana', reminders: [{ kind: 'at', at: NOW + 10 * MINUTE }] })
  })

  test('in 3 days is just the day', () => {
    expect(parse('renew passport in 3 days')).toMatchObject({ date: '2026-09-14', reminders: [] })
  })

  test('remind me in 10 minutes to call Ana', () => {
    expect(parse('remind me in 10 minutes to call Ana')).toMatchObject({ title: 'Call Ana', reminders: [{ kind: 'at', at: NOW + 10 * MINUTE }] })
  })
})

describe('how long it lasts', () => {
  test.each([
    ['meeting tomorrow at 5pm for an hour', '17:00', 60],
    ['meeting tomorrow at 5pm for 45 minutes', '17:00', 45],
    ['meeting tomorrow at 5pm lasting half an hour', '17:00', 30],
    ['meeting tomorrow from 5 to 7', '17:00', 120],
    ['meeting tomorrow from 5:30pm to 6:30pm', '17:30', 60],
    ['meeting tomorrow 5-7pm', '17:00', 120],
    ['meeting tomorrow 9am-5pm', '09:00', 480],
    ['meeting tomorrow between 10 and 11', '10:00', 60],
    ['meeting tomorrow from 9 to 11 at night', '21:00', 120],
    ['meeting tomorrow from 10 to 2pm', '10:00', 240],
    ['meeting tomorrow at 5pm until 7', '17:00', 120],
  ])('«%s»', (input, time, duration) => {
    expect(parse(input)).toMatchObject({ title: 'meeting', date: '2026-09-12', time, duration })
  })

  test('a 2-hour meeting', () => {
    expect(parse('a 2-hour meeting tomorrow at 10')).toMatchObject({ title: 'meeting', duration: 120, time: '10:00' })
  })

  test('without a time, the duration still counts', () => {
    expect(parse('exam on thursday for 3 hours')).toMatchObject({ title: 'exam', date: '2026-09-17', time: null, duration: 180, label: 'Thu, Sep 17 3h' })
  })

  test('days are not a duration', () => {
    expect(parse('trip for 3 days').duration).toBeNull()
  })

  test('the label shows the span', () => {
    expect(parse('meeting tomorrow from 11 to 1pm').label).toBe('Tomorrow 11:00 AM–1:00 PM')
  })
})

describe('reminders', () => {
  test.each([
    ['dentist tomorrow at 5pm, remind me 30 minutes before', [{ kind: 'before', minutes: 30 }]],
    ['dentist tomorrow at 5pm and remind me an hour before', [{ kind: 'before', minutes: 60 }]],
    ['dentist tomorrow at 5pm, remind me the day before', [{ kind: 'before', minutes: 1440 }]],
    ['dentist tomorrow at 5pm, 15 minutes before', [{ kind: 'before', minutes: 15 }]],
    ['dentist tomorrow at 5pm, remind me on time', [{ kind: 'before', minutes: 0 }]],
  ])('«%s»', (input, reminders) => {
    expect(parse(input)).toMatchObject({ title: 'dentist', time: '17:00', reminders })
  })

  test('remind me at 9: the reminder, not the time of the task', () => {
    expect(parse('pay rent tomorrow, remind me at 9am')).toMatchObject({
      title: 'pay rent',
      date: '2026-09-12',
      time: null,
      reminders: [{ kind: 'at', at: toInstant('2026-09-12', '09:00') }],
    })
  })

  test('the day before at 8', () => {
    expect(parse('flight on friday at 6pm, remind me the day before at 8')).toMatchObject({
      date: '2026-09-18',
      reminders: [{ kind: 'at', at: toInstant('2026-09-17', '08:00') }],
    })
  })

  test('remind me in the morning', () => {
    expect(parse('return the books tomorrow, remind me in the morning')).toMatchObject({
      title: 'return the books',
      reminders: [{ kind: 'at', at: toInstant('2026-09-12', '09:00') }],
    })
  })

  test('chained: an hour before and again at 4', () => {
    expect(parse('party tomorrow at 6pm, remind me an hour before and at 4').reminders).toEqual([
      { kind: 'before', minutes: 60 },
      { kind: 'at', at: toInstant('2026-09-12', '16:00') },
    ])
  })
})

describe('titles', () => {
  test.each([
    ['remind me to call Ana tomorrow', 'Call Ana'],
    ['I need to call Ana tomorrow', 'Call Ana'],
    ['don’t forget to call Ana tomorrow', 'Call Ana'],
    ['can you remind me to call Ana tomorrow?', 'Call Ana'],
    ['I have a dentist appointment tomorrow', 'Dentist appointment'],
    ['go to the post office to mail a package tomorrow', 'Mail a package'],
  ])('«%s» → %s', (input, title) => {
    expect(parse(input).title).toBe(title)
  })
})

describe('places', () => {
  const walmart: Place = { id: 'w', name: 'Walmart', aliases: [], location: { lat: 1, lng: 1, address: '' }, radius: 150 }

  test('a saved place', () => {
    expect(parse('buy milk when I get to Walmart', NOW, [walmart])).toMatchObject({
      title: 'buy milk',
      reminders: [{ kind: 'place', placeId: 'w', on: 'arrive' }],
      label: 'Arriving at Walmart',
    })
  })

  test('remind me when I get to the place to do something', () => {
    expect(parse('remind me when I get to walmart to buy milk', NOW, [walmart])).toMatchObject({ title: 'buy milk' })
  })

  test('leaving', () => {
    expect(parse('take the trash out when I leave home', NOW, [])).toMatchObject({
      title: 'take the trash out',
      newPlace: { name: 'Home', on: 'leave' },
    })
  })

  test('a new place keeps its capitalized words', () => {
    expect(parse('buy salmon when I get to Whole Foods', NOW, [])).toMatchObject({ newPlace: { name: 'Whole Foods', on: 'arrive' } })
  })

  test('without places on this platform, the phrase stays', () => {
    expect(parse('buy milk when I get to Walmart', NOW, null).title).toBe('buy milk when I get to Walmart')
  })
})

describe('parseSpoken', () => {
  test('fillers out and a capital letter', () => {
    expect(parseSpoken('okay so remind me to buy milk', NOW).title).toBe('Buy milk')
    expect(parseSpoken('um, call the bank tomorrow at 10', NOW)).toMatchObject({ title: 'Call the bank', time: '10:00' })
  })

  test('a question that is the task keeps its question mark', () => {
    expect(parseSpoken('what should I get Ana for her birthday?', NOW).title).toBe('What should I get Ana for her birthday?')
  })
})

describe('routines', () => {
  test.each([
    ['take creatine every day at 10', [1, 2, 3, 4, 5, 6, 7], '10:00', 'Every day · 10:00 AM'],
    ['gym on mondays and thursdays', [1, 4], null, 'Mon and Thu'],
    ['gym every mon, wed and fri at 7am', [1, 3, 5], '07:00', 'Mon, Wed and Fri · 7:00 AM'],
    ['water the plants on weekdays', [1, 2, 3, 4, 5], null, 'Weekdays'],
    ['brunch every weekend', [6, 7], null, 'Weekends'],
    ['stretch every morning', [1, 2, 3, 4, 5, 6, 7], '09:00', 'Every day · 9:00 AM'],
    ['read daily', [1, 2, 3, 4, 5, 6, 7], null, 'Every day'],
    ['yoga every sunday', [7], null, 'Sundays'],
  ])('«%s»', (input, days, time, label) => {
    expect(parseRoutine(input, NOW)).toMatchObject({ days, time, label })
  })

  test('on monday is a day, not a routine', () => {
    expect(parseRoutine('gym on monday', NOW)).toBeNull()
  })
})

describe('mientras no llega el analizador en inglés', () => {
  test('lo escrito se queda literal (nunca se lee con las reglas del español)', async () => {
    // Un `parse.ts` recién cargado, al que aún no se le ha dado el inglés.
    vi.resetModules()
    const fresh = await import('./parse')
    const i18n = await import('./i18n')
    i18n.setLanguage('en')
    expect(fresh.hasEnglish()).toBe(false)
    expect(fresh.parseTask('call mom tomorrow at 5pm', NOW)).toEqual({
      title: 'call mom tomorrow at 5pm',
      date: null,
      time: null,
      duration: null,
      reminders: [],
      label: null,
    })
  })
})

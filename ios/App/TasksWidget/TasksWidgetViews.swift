import AppIntents
import SwiftUI
import UIKit
import WidgetKit

/**
 * Los tokens de `src/styles/tokens.css`: papel marfil, tinta azul marino, coñac para lo hecho y
 * ladrillo solo para lo atrasado. El widget sigue el modo del iPhone (azul noche en oscuro), no la
 * apariencia elegida en la app: vive en la pantalla de inicio, junto a los de las demás apps.
 */
enum Palette {
    static let background = dynamic(0xF4EFE6, night: 0x141B2E)
    static let text = dynamic(0x1B2540, night: 0xEFE8DA)
    static let text2 = dynamic(0x5A544A, night: 0xB3AA9A)
    static let text3 = dynamic(0x7D7466, night: 0x8A8374)
    static let line = dynamic(0x4E3A22, night: 0xEFE8DA, alpha: 0.11, nightAlpha: 0.09)
    static let line2 = dynamic(0x4E3A22, night: 0xEFE8DA, alpha: 0.2, nightAlpha: 0.18)
    static let accent = dynamic(0x8A5A2C, night: 0xD2A26E)
    static let accentDim = dynamic(0x8A5A2C, night: 0xD2A26E, alpha: 0.12, nightAlpha: 0.18)
    /** El marfil sobre el coñac: la marca de "hecha". */
    static let onAccent = dynamic(0xF7F2E8, night: 0x141B2E)
    static let danger = dynamic(0x9E3B2E, night: 0xE07A68)

    /**
     * El color de un calendario del iPhone (`#rrggbb`), apagado como en la app (`.cal-tone`): a medias con
     * la tinta tenue, para que no chille sobre el papel.
     */
    static func calendar(_ hex: String) -> Color {
        let value = UInt32(hex.dropFirst(), radix: 16) ?? 0x8C7B66
        return Color(uiColor: UIColor { traits in
            let night = traits.userInterfaceStyle == .dark
            let tone = color(night ? 0x8A8374 : 0x7D7466, 1)
            return blend(color(value, 1), tone, 0.6)
        })
    }

    private static func blend(_ a: UIColor, _ b: UIColor, _ amount: CGFloat) -> UIColor {
        var (ar, ag, ab, aa): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        var (br, bg, bb, ba): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
        a.getRed(&ar, green: &ag, blue: &ab, alpha: &aa)
        b.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
        let mix = { (x: CGFloat, y: CGFloat) in x * amount + y * (1 - amount) }
        return UIColor(red: mix(ar, br), green: mix(ag, bg), blue: mix(ab, bb), alpha: 1)
    }

    private static func dynamic(
        _ day: UInt32,
        night: UInt32,
        alpha: CGFloat = 1,
        nightAlpha: CGFloat = 1
    ) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? color(night, nightAlpha) : color(day, alpha)
        })
    }

    private static func color(_ value: UInt32, _ alpha: CGFloat) -> UIColor {
        UIColor(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: alpha
        )
    }
}

// MARK: - Idioma

/** Los textos del widget, que cada entrada fija al pintarse (`WidgetText.current`). */
private struct WidgetTextKey: EnvironmentKey {
    static let defaultValue = WidgetText.spanish
}

extension EnvironmentValues {
    var widgetText: WidgetText {
        get { self[WidgetTextKey.self] }
        set { self[WidgetTextKey.self] = newValue }
    }
}

// MARK: - Tamaños

struct SmallWidget: View {
    let day: WidgetDay
    let ready: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                CountLabel(count: day.pending, size: 26)
                DayLabel()
                Spacer(minLength: 0)
                if !day.overdue.isEmpty {
                    MoveOverdueButton()
                }
            }
            TaskList(day: day, slots: 3, style: .compact, ready: ready)
        }
    }
}

struct MediumWidget: View {
    let day: WidgetDay
    let ready: Bool
    /** Lo siguiente del calendario del iPhone (uno como mucho). */
    var events: [WidgetEvent] = []
    var now = Date()

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 0) {
                AddLink()
                Spacer(minLength: 0)
                CountLabel(count: day.pending, size: 34)
                DayLabel()
                if !day.overdue.isEmpty {
                    MoveOverdueButton()
                        .padding(.top, 8)
                }
            }
            .frame(minWidth: 44, maxHeight: .infinity, alignment: .leading)
            TaskList(day: day, slots: 4, style: .regular, ready: ready, events: events, now: now)
        }
    }
}

struct LargeWidget: View {
    let day: WidgetDay
    let ready: Bool
    /** Lo siguiente del calendario del iPhone (dos como mucho). */
    var events: [WidgetEvent] = []
    var now = Date()

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 0) {
                    CountLabel(count: day.pending, size: 34)
                    DayLabel()
                }
                Spacer(minLength: 0)
                if !day.overdue.isEmpty {
                    MoveOverdueButton()
                        .padding(.trailing, 8)
                }
                AddLink()
            }
            TaskList(day: day, slots: 8, style: .regular, ready: ready, events: events, now: now)
        }
    }
}

/** Pantalla de bloqueo: solo el número. */
struct CircularWidget: View {
    @Environment(\.widgetText) var text
    let day: WidgetDay

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Text(String(day.pending))
                    .font(.system(size: 20, weight: .semibold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                Text(verbatim: text.todayCaps)
                    .font(.system(size: 8, weight: .semibold))
                    .tracking(0.5)
            }
            .padding(4)
        }
    }
}

/**
 * Pantalla de bloqueo: el número y, como solo caben dos, las dos pendientes más importantes. Si sobra una
 * línea y hay algo en el calendario, lo siguiente ("17:00 Reunión").
 */
struct RectangularWidget: View {
    @Environment(\.widgetText) var text
    let day: WidgetDay
    let ready: Bool
    var next: WidgetEvent? = nil
    var now = Date()

    var body: some View {
        let pending = Array(day.mostImportant.prefix(2))
        VStack(alignment: .leading, spacing: 1) {
            Text(verbatim: day.pending == 0 ? text.today : "\(text.today) · \(day.pending)")
                .font(.headline)
                .widgetAccentable()
            if pending.isEmpty && next == nil {
                Text(verbatim: ready ? text.nothingToday : text.openTasks)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(pending) { task in
                    Text(task.title)
                        .fontWeight(task.weight >= 0.5 ? .semibold : .regular)
                }
                if pending.count < 2, let next {
                    Text(verbatim: "\(WidgetDates.eventTime(next, now: now, text: text)) \(next.title.isEmpty ? text.untitledEvent : next.title)")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .font(.system(size: 15))
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Piezas

/** Medidas de las filas: `compact` para el widget pequeño, donde además no caben enlaces. */
struct RowStyle {
    let circle: CGFloat
    let title: CGFloat
    /** Lo que crece el título de lo más importante: las filas tienen alto fijo, menos que en la app. */
    let growth: CGFloat
    let gap: CGFloat
    /** Hora o fecha a la derecha y enlace a la tarea. */
    let detailed: Bool

    static let regular = RowStyle(circle: 20, title: 15, growth: 5, gap: 10, detailed: true)
    static let compact = RowStyle(circle: 17, title: 13, growth: 3, gap: 8, detailed: false)

    var inset: CGFloat { circle + gap }

    /** Como en la app: lo importante, más grande y con más peso. Lo hecho vuelve a lo normal. */
    func titleFont(_ task: WidgetTask) -> Font {
        let weight = task.done ? 0 : task.weight
        let font = Font.system(size: title + growth * weight)
        if weight >= 0.5 { return font.weight(.semibold) }
        return weight > 0 ? font.weight(.medium) : font
    }
}

enum WidgetRow: Hashable {
    case task(WidgetTask, overdue: Bool)
    case event(WidgetEvent)
    case more(Int)

    /**
     * Lo siguiente del calendario arriba; después atrasadas y hoy. Si las tareas no caben, la última fila
     * dice cuántas quedan.
     */
    static func rows(_ day: WidgetDay, slots: Int, events: [WidgetEvent] = []) -> [WidgetRow] {
        let lead = events.prefix(max(slots - 1, 0)).map { WidgetRow.event($0) }
        let all = day.overdue.map { WidgetRow.task($0, overdue: true) } + day.today.map { WidgetRow.task($0, overdue: false) }
        let room = slots - lead.count
        guard all.count > room else { return lead + all }
        let shown = max(room - 1, 0)
        return lead + Array(all.prefix(shown)) + [.more(all.count - shown)]
    }
}

/** Filas de alto fijo (el hueco entre `slots`): no bailan al completar ni cambian con el iPhone. */
struct TaskList: View {
    @Environment(\.widgetText) var text
    let day: WidgetDay
    let slots: Int
    let style: RowStyle
    let ready: Bool
    var events: [WidgetEvent] = []
    var now = Date()

    var body: some View {
        let rows = WidgetRow.rows(day, slots: slots, events: events)
        if rows.isEmpty {
            Text(verbatim: ready ? text.nothingToday : text.openTasks)
                .font(.system(size: style.title))
                .foregroundStyle(Palette.text3)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        } else {
            VStack(spacing: 0) {
                ForEach(0..<slots, id: \.self) { index in
                    slot(index < rows.count ? rows[index] : nil)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .overlay(alignment: .top) {
                            if index > 0 && index < rows.count {
                                Rectangle()
                                    .fill(Palette.line)
                                    .frame(height: 0.5)
                                    .padding(.leading, style.inset)
                            }
                        }
                }
            }
        }
    }

    @ViewBuilder
    private func slot(_ row: WidgetRow?) -> some View {
        switch row {
        case .task(let task, let overdue):
            TaskRow(task: task, overdue: overdue, today: day.day, style: style)
        case .event(let event):
            EventRow(event: event, now: now, style: style)
        case .more(let count):
            Text(verbatim: text.more(count))
                .font(.system(size: style.title - 2))
                .foregroundStyle(Palette.text3)
                .padding(.leading, style.inset)
                .frame(maxWidth: .infinity, alignment: .leading)
        case nil:
            Color.clear
        }
    }
}

struct TaskRow: View {
    @Environment(\.widgetText) var text
    let task: WidgetTask
    let overdue: Bool
    let today: String
    let style: RowStyle

    var body: some View {
        HStack(spacing: 0) {
            // El círculo completa sin abrir la app; el resto de la fila abre la tarea.
            Button(intent: ToggleTaskIntent(taskId: task.id)) {
                CheckCircle(done: task.done, overdue: overdue, size: style.circle)
                    .frame(width: style.inset, alignment: .leading)
                    .frame(maxHeight: .infinity)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: task.done ? text.markPending : text.complete))

            if style.detailed {
                Link(destination: WidgetLink.task(task.id)) { label }
            } else {
                label
            }
        }
    }

    private var label: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(task.title)
                .font(style.titleFont(task))
                .foregroundStyle(titleColor)
                .strikethrough(task.done, color: Palette.text3)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let detail {
                Text(detail)
                    .font(.system(size: style.title - 3))
                    .monospacedDigit()
                    .foregroundStyle(Palette.text3)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
        }
        .frame(maxHeight: .infinity)
        .contentShape(Rectangle())
    }

    private var titleColor: Color {
        if task.done { return Palette.text3 }
        return overdue ? Palette.danger : Palette.text
    }

    /** Lo atrasado dice de cuándo es; lo de hoy, su hora. */
    private var detail: String? {
        guard style.detailed else { return nil }
        if overdue { return WidgetDates.overdue(task.lastDay, today: today, text: text) }
        return task.time.map { WidgetDates.shortTime($0, text.language) }
    }
}

/**
 * Un evento del calendario del iPhone: una cinta con el color de su calendario (apagado, como en la app)
 * donde las tareas llevan el círculo, el título un punto por debajo de ellas y a la derecha su hora, o
 * "Ahora" si está en curso. Tocarlo abre la Agenda de hoy.
 */
struct EventRow: View {
    @Environment(\.widgetText) var text
    let event: WidgetEvent
    let now: Date
    let style: RowStyle

    var body: some View {
        let ongoing = event.isOngoing(at: now)
        let title = event.title.isEmpty ? text.untitledEvent : event.title
        let time = WidgetDates.eventTime(event, now: now, text: text)
        Link(destination: WidgetLink.today) {
            HStack(spacing: 0) {
                Capsule()
                    .fill(Palette.calendar(event.color))
                    .frame(width: 4, height: style.circle)
                    .frame(width: style.circle)
                    .frame(width: style.inset, alignment: .leading)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(verbatim: title)
                        .font(.system(size: style.title))
                        .foregroundStyle(Palette.text2)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text(verbatim: time)
                        .font(.system(size: style.title - 3, weight: ongoing ? .semibold : .regular))
                        .monospacedDigit()
                        .foregroundStyle(ongoing ? Palette.accent : Palette.text3)
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                }
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(verbatim: text.event(title, time)))
    }
}

/** El círculo de las filas de la app: borde tenue, ladrillo si está atrasada y relleno de coñac si está hecha. */
struct CheckCircle: View {
    let done: Bool
    let overdue: Bool
    let size: CGFloat

    var body: some View {
        ZStack {
            if done {
                Circle()
                    .fill(Palette.accent)
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.46, weight: .bold))
                    .foregroundStyle(Palette.onAccent)
            } else {
                Circle()
                    .strokeBorder(overdue ? Palette.danger.opacity(0.5) : Palette.line2, lineWidth: 1.5)
            }
        }
        .frame(width: size, height: size)
        .widgetAccentable(done)
    }
}

/** La cifra de pendientes en serif (New York), como la fecha de la cabecera de la app. */
struct CountLabel: View {
    let count: Int
    let size: CGFloat

    var body: some View {
        Text(String(count))
            .font(.system(size: size, weight: .regular, design: .serif))
            .monospacedDigit()
            .foregroundStyle(count == 0 ? Palette.text3 : Palette.text)
            .contentTransition(.numericText())
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}

/** Como la cabecera del bloque Hoy de la app (o de la Bandeja). */
struct DayLabel: View {
    @Environment(\.widgetText) var text
    var label: String? = nil

    var body: some View {
        Text(verbatim: label ?? text.todayCaps)
            .font(.system(size: 11, weight: .semibold))
            .tracking(1.4)
            .foregroundStyle(Palette.accent)
    }
}

/**
 * Pasa lo atrasado a hoy sin abrir la app, como el botón del bloque Atrasadas. Corre en el proceso
 * de la app (`WidgetMoveOverdueIntent`), que después recarga el widget.
 */
struct MoveOverdueButton: View {
    @Environment(\.widgetText) var text

    var body: some View {
        Button(intent: WidgetMoveOverdueIntent()) {
            Text(verbatim: text.toToday)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Palette.accent)
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 9)
                .frame(height: 24)
                .background(Capsule().fill(Palette.accentDim))
                .widgetAccentable()
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(verbatim: text.moveOverdue))
    }
}

/** Abre la app con la barra de escribir enfocada, como el acceso rápido "Nueva tarea". */
struct AddLink: View {
    @Environment(\.widgetText) var text
    var destination = WidgetLink.compose
    var label: String? = nil

    var body: some View {
        Link(destination: destination) {
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Palette.accent)
                .frame(width: 28, height: 28)
                .background(Circle().fill(Palette.accentDim))
                .widgetAccentable()
        }
        .accessibilityLabel(Text(verbatim: label ?? text.newTask))
    }
}

enum WidgetDates {
    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar
    }()

    private static let isoFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = WidgetDates.calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static func dayMonthFormatter(_ language: AppLanguage) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = WidgetDates.calendar
        formatter.locale = Locale(identifier: language == .en ? "en_US" : "es")
        formatter.timeZone = .current
        formatter.dateFormat = language == .en ? "MMM d" : "d MMM"
        return formatter
    }

    /** `9:00` y `17:30` sin cero delante, como `shortTime` en la web; en inglés, `9:00 AM` y `5:30 PM`. */
    static func shortTime(_ time: String, _ language: AppLanguage) -> String {
        guard language == .en else { return time.hasPrefix("0") ? String(time.dropFirst()) : time }
        let parts = time.split(separator: ":")
        guard parts.count == 2, let hours = Int(parts[0]) else { return time }
        return "\(hours % 12 == 0 ? 12 : hours % 12):\(parts[1]) \(hours < 12 ? "AM" : "PM")"
    }

    /** La hora de un evento como la de una tarea (`17:00`, `5:00 PM`); `Ahora` en curso, `Todo el día`. */
    static func eventTime(_ event: WidgetEvent, now: Date, text: WidgetText) -> String {
        if event.allDay { return text.allDay }
        if event.isOngoing(at: now) { return text.now }
        let parts = calendar.dateComponents([.hour, .minute], from: event.startDate)
        return shortTime(String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0), text.language)
    }

    /** `Ayer` o `14 sept` · `Yesterday` o `Sep 14`. */
    static func overdue(_ date: String, today: String, text: WidgetText) -> String {
        guard let day = isoFormatter.date(from: date) else { return "" }
        if calendar.date(byAdding: .day, value: 1, to: day).map(WidgetDay.iso) == today {
            return text.yesterday
        }
        return dayMonthFormatter(text.language).string(from: day).replacingOccurrences(of: ".", with: "")
    }
}

// MARK: - Rutinas

/**
 * Pantalla de bloqueo, redondo: el anillo se va cerrando con lo hecho hoy y en el centro va el emoji
 * de la rutina que toca (sus iniciales si no tiene, o la marca si ya está). Tocarlo la tacha.
 */
struct RoutineCircular: View {
    @Environment(\.widgetText) var text
    let entry: RoutinesEntry

    var body: some View {
        if let routine = entry.target {
            let done = routine.isDone(on: entry.day)
            Button(intent: ToggleRoutineIntent(routineId: routine.id, day: entry.day)) {
                Gauge(value: progress(done: done)) {
                    Text(verbatim: routine.title)
                } currentValueLabel: {
                    if done {
                        Image(systemName: "checkmark")
                            .font(.system(size: 17, weight: .bold))
                    } else if routine.hasEmoji {
                        Text(verbatim: routine.badge)
                            .font(.system(size: 22))
                    } else {
                        Text(verbatim: routine.badge)
                            .font(.system(size: 17, weight: .semibold, design: .serif))
                    }
                }
                .gaugeStyle(.accessoryCircularCapacity)
                .widgetAccentable()
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: done ? text.unmark(routine.title) : text.doneTitle(routine.title)))
        } else {
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "repeat")
                    .font(.system(size: 18, weight: .medium))
            }
            .widgetURL(WidgetLink.routines)
        }
    }

    /** Con una rutina elegida, lleno o vacío; si no, lo hecho de hoy. */
    private func progress(done: Bool) -> Double {
        if entry.showsChosen { return done ? 1 : 0 }
        let total = entry.today.count
        return total == 0 ? 0 : Double(entry.done) / Double(total)
    }
}

/** Pantalla de bloqueo, rectangular: la rutina que toca, su hora y cuántas van hoy. Un toque la tacha. */
struct RoutineRectangular: View {
    @Environment(\.widgetText) var text
    let entry: RoutinesEntry

    var body: some View {
        if let routine = entry.target {
            let done = routine.isDone(on: entry.day)
            Button(intent: ToggleRoutineIntent(routineId: routine.id, day: entry.day)) {
                HStack(spacing: 8) {
                    // Pendiente y con emoji, el emoji hace de botón; hecha, la marca de siempre.
                    if let emoji = routine.emoji, routine.hasEmoji, !done {
                        Text(verbatim: emoji)
                            .font(.system(size: 24))
                            .frame(width: 28)
                    } else {
                        Image(systemName: done ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 24, weight: .regular))
                            .widgetAccentable()
                    }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(verbatim: routine.title)
                            .font(.headline)
                            .strikethrough(done)
                            .lineLimit(1)
                        Text(verbatim: detail(routine, done: done))
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: done ? text.unmark(routine.title) : text.doneTitle(routine.title)))
        } else {
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: text.routines)
                    .font(.headline)
                    .widgetAccentable()
                Text(verbatim: entry.routines == nil ? text.openTasks : text.noneToday)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetURL(WidgetLink.routines)
        }
    }

    /** `10:00 · 1 de 3 hoy`, o `Hecha · 3 de 3 hoy`. */
    private func detail(_ routine: WidgetRoutine, done: Bool) -> String {
        let when = done ? text.done : (routine.time.map { WidgetDates.shortTime($0, text.language) } ?? text.today)
        let total = entry.today.count
        return total > 1 ? "\(when) · \(text.doneOf(entry.done, total))" : when
    }
}

/** Pantalla de inicio: las rutinas de hoy, cada una con su círculo para tacharla. */
struct RoutineSmall: View {
    @Environment(\.widgetText) var text
    let entry: RoutinesEntry

    private static let slots = 4

    var body: some View {
        let rows = Array(entry.today.prefix(Self.slots))
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(verbatim: text.routinesCaps)
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(1.4)
                    .foregroundStyle(Palette.accent)
                Spacer(minLength: 0)
                if !entry.today.isEmpty {
                    Text(verbatim: "\(entry.done)/\(entry.today.count)")
                        .font(.system(size: 15, design: .serif))
                        .monospacedDigit()
                        .foregroundStyle(entry.done == entry.today.count ? Palette.accent : Palette.text3)
                }
            }
            if rows.isEmpty {
                Text(verbatim: entry.routines == nil ? text.openTasks : text.noneToday)
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.text3)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            } else {
                VStack(spacing: 0) {
                    ForEach(0..<Self.slots, id: \.self) { index in
                        Group {
                            if index < rows.count {
                                RoutineRow(routine: rows[index], day: entry.day)
                            } else {
                                Color.clear
                            }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
            }
        }
        .widgetURL(WidgetLink.routines)
    }
}

struct RoutineRow: View {
    @Environment(\.widgetText) var text
    let routine: WidgetRoutine
    let day: String

    var body: some View {
        let done = routine.isDone(on: day)
        Button(intent: ToggleRoutineIntent(routineId: routine.id, day: day)) {
            HStack(spacing: 8) {
                CheckCircle(done: done, overdue: false, size: 17)
                if let emoji = routine.emoji, routine.hasEmoji {
                    RoutineEmoji(emoji: emoji, size: 13)
                        .opacity(done ? 0.5 : 1)
                }
                Text(verbatim: routine.title)
                    .font(.system(size: 13))
                    .foregroundStyle(done ? Palette.text3 : Palette.text)
                    .strikethrough(done, color: Palette.text3)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let time = routine.time, !done {
                    Text(verbatim: WidgetDates.shortTime(time, text.language))
                        .font(.system(size: 11))
                        .monospacedDigit()
                        .foregroundStyle(Palette.text3)
                }
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(verbatim: done ? text.unmark(routine.title) : text.doneTitle(routine.title)))
    }
}

/**
 * El emoji de una rutina en la pantalla de inicio, entonado con el papel como en la app: a medio
 * color, para que no desentone con la tinta y el coñac. En la pantalla de bloqueo iOS ya lo pinta
 * en un solo tono.
 */
struct RoutineEmoji: View {
    let emoji: String
    let size: CGFloat

    var body: some View {
        Text(verbatim: emoji)
            .font(.system(size: size))
            .saturation(0.55)
            .accessibilityHidden(true)
    }
}

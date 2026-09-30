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
            TaskList(day: day, slots: 4, style: .regular, ready: ready)
        }
    }
}

struct LargeWidget: View {
    let day: WidgetDay
    let ready: Bool

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
            TaskList(day: day, slots: 8, style: .regular, ready: ready)
        }
    }
}

/** Pantalla de bloqueo: solo el número. */
struct CircularWidget: View {
    let day: WidgetDay

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Text(String(day.pending))
                    .font(.system(size: 20, weight: .semibold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
                Text("HOY")
                    .font(.system(size: 8, weight: .semibold))
                    .tracking(0.5)
            }
            .padding(4)
        }
    }
}

/** Pantalla de bloqueo: el número y, como solo caben dos, las dos pendientes más importantes. */
struct RectangularWidget: View {
    let day: WidgetDay
    let ready: Bool

    var body: some View {
        let pending = Array(day.mostImportant.prefix(2))
        VStack(alignment: .leading, spacing: 1) {
            Text(verbatim: day.pending == 0 ? "Hoy" : "Hoy · \(day.pending)")
                .font(.headline)
                .widgetAccentable()
            if pending.isEmpty {
                Text(verbatim: ready ? "Nada para hoy." : "Abre Tasks")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(pending) { task in
                    Text(task.title)
                        .fontWeight(task.weight >= 0.5 ? .semibold : .regular)
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
    case more(Int)

    /** Atrasadas y después hoy. Si no caben, la última fila dice cuántas quedan. */
    static func rows(_ day: WidgetDay, slots: Int) -> [WidgetRow] {
        let all = day.overdue.map { WidgetRow.task($0, overdue: true) } + day.today.map { WidgetRow.task($0, overdue: false) }
        guard all.count > slots else { return all }
        let shown = max(slots - 1, 0)
        return Array(all.prefix(shown)) + [.more(all.count - shown)]
    }
}

/** Filas de alto fijo (el hueco entre `slots`): no bailan al completar ni cambian con el iPhone. */
struct TaskList: View {
    let day: WidgetDay
    let slots: Int
    let style: RowStyle
    let ready: Bool

    var body: some View {
        let rows = WidgetRow.rows(day, slots: slots)
        if rows.isEmpty {
            Text(verbatim: ready ? "Nada para hoy." : "Abre Tasks")
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
        case .more(let count):
            Text("\(count) más")
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
            .accessibilityLabel(Text(verbatim: task.done ? "Marcar como pendiente" : "Completar"))

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
        if overdue { return WidgetDates.overdue(task.date, today: today) }
        return task.time.map(WidgetDates.shortTime)
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

/** Como la cabecera del bloque Hoy de la app. */
struct DayLabel: View {
    var body: some View {
        Text("HOY")
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
    var body: some View {
        Button(intent: WidgetMoveOverdueIntent()) {
            Text(verbatim: "A hoy")
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
        .accessibilityLabel(Text(verbatim: "Pasar atrasadas a hoy"))
    }
}

/** Abre la app con la barra de escribir enfocada, como el acceso rápido "Nueva tarea". */
struct AddLink: View {
    var body: some View {
        Link(destination: WidgetLink.compose) {
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Palette.accent)
                .frame(width: 28, height: 28)
                .background(Circle().fill(Palette.accentDim))
                .widgetAccentable()
        }
        .accessibilityLabel("Nueva tarea")
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

    private static let dayMonthFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = WidgetDates.calendar
        formatter.locale = Locale(identifier: "es")
        formatter.timeZone = .current
        formatter.dateFormat = "d MMM"
        return formatter
    }()

    /** `9:00`: sin cero delante, como `shortTime` en la web. */
    static func shortTime(_ time: String) -> String {
        time.hasPrefix("0") ? String(time.dropFirst()) : time
    }

    /** `Ayer` o `14 sept`. */
    static func overdue(_ date: String, today: String) -> String {
        guard let day = isoFormatter.date(from: date) else { return "" }
        if calendar.date(byAdding: .day, value: 1, to: day).map(WidgetDay.iso) == today {
            return "Ayer"
        }
        return dayMonthFormatter.string(from: day).replacingOccurrences(of: ".", with: "")
    }
}

// MARK: - Rutinas

/**
 * Pantalla de bloqueo, redondo: el anillo se va cerrando con lo hecho hoy y en el centro va la inicial
 * de la rutina que toca (o la marca si ya está). Tocarlo la tacha.
 */
struct RoutineCircular: View {
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
                    } else {
                        Text(verbatim: RoutineText.initials(routine.title))
                            .font(.system(size: 17, weight: .semibold, design: .serif))
                    }
                }
                .gaugeStyle(.accessoryCircularCapacity)
                .widgetAccentable()
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: done ? "Desmarcar \(routine.title)" : "Hecha: \(routine.title)"))
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
    let entry: RoutinesEntry

    var body: some View {
        if let routine = entry.target {
            let done = routine.isDone(on: entry.day)
            Button(intent: ToggleRoutineIntent(routineId: routine.id, day: entry.day)) {
                HStack(spacing: 8) {
                    Image(systemName: done ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 24, weight: .regular))
                        .widgetAccentable()
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
            .accessibilityLabel(Text(verbatim: done ? "Desmarcar \(routine.title)" : "Hecha: \(routine.title)"))
        } else {
            VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: "Rutinas")
                    .font(.headline)
                    .widgetAccentable()
                Text(verbatim: entry.routines == nil ? "Abre Tasks" : "Hoy no toca ninguna.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetURL(WidgetLink.routines)
        }
    }

    /** `10:00 · 1 de 3 hoy`, o `Hecha · 3 de 3 hoy`. */
    private func detail(_ routine: WidgetRoutine, done: Bool) -> String {
        let when = done ? "Hecha" : (routine.time.map(WidgetDates.shortTime) ?? "Hoy")
        let total = entry.today.count
        return total > 1 ? "\(when) · \(entry.done) de \(total) hoy" : when
    }
}

/** Pantalla de inicio: las rutinas de hoy, cada una con su círculo para tacharla. */
struct RoutineSmall: View {
    let entry: RoutinesEntry

    private static let slots = 4

    var body: some View {
        let rows = Array(entry.today.prefix(Self.slots))
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(verbatim: "RUTINAS")
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
                Text(verbatim: entry.routines == nil ? "Abre Tasks" : "Hoy no toca ninguna.")
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
    let routine: WidgetRoutine
    let day: String

    var body: some View {
        let done = routine.isDone(on: day)
        Button(intent: ToggleRoutineIntent(routineId: routine.id, day: day)) {
            HStack(spacing: 8) {
                CheckCircle(done: done, overdue: false, size: 17)
                Text(verbatim: routine.title)
                    .font(.system(size: 13))
                    .foregroundStyle(done ? Palette.text3 : Palette.text)
                    .strikethrough(done, color: Palette.text3)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let time = routine.time, !done {
                    Text(verbatim: WidgetDates.shortTime(time))
                        .font(.system(size: 11))
                        .monospacedDigit()
                        .foregroundStyle(Palette.text3)
                }
            }
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(verbatim: done ? "Desmarcar \(routine.title)" : "Hecha: \(routine.title)"))
    }
}

enum RoutineText {
    /** `Tomar creatina` → `TC`; una sola palabra, sus dos primeras letras. */
    static func initials(_ title: String) -> String {
        let words = title.split(separator: " ")
        if words.count >= 2 {
            return words.prefix(2).compactMap { word in word.first.map { String($0) } }.joined().uppercased()
        }
        return String(title.prefix(2)).capitalized
    }
}

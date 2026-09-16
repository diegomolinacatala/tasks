import AppIntents
import SwiftUI
import WidgetKit

/** Los tokens de `src/styles/tokens.css`: negro puro, un solo acento y rojo solo para lo atrasado. */
enum Palette {
    static let background = Color.black
    static let text = hex(0xEDEDF0)
    static let text2 = hex(0x98989F)
    static let text3 = hex(0x5C5C64)
    static let line = Color.white.opacity(0.07)
    static let line2 = Color.white.opacity(0.13)
    static let accent = hex(0x6E8BFF)
    static let accentDim = hex(0x6E8BFF).opacity(0.16)
    static let danger = hex(0xFF5A52)

    private static func hex(_ value: UInt32) -> Color {
        Color(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
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

/** Pantalla de bloqueo: el número y las dos primeras pendientes. */
struct RectangularWidget: View {
    let day: WidgetDay
    let ready: Bool

    var body: some View {
        let pending = Array((day.overdue + day.today.filter { !$0.done }).prefix(2))
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
    let gap: CGFloat
    /** Hora o fecha a la derecha y enlace a la tarea. */
    let detailed: Bool

    static let regular = RowStyle(circle: 20, title: 15, gap: 10, detailed: true)
    static let compact = RowStyle(circle: 17, title: 13, gap: 8, detailed: false)

    var inset: CGFloat { circle + gap }
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
                .font(.system(size: style.title))
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

/** El círculo de las filas de la app: borde tenue, rojo si está atrasada y acento con marca si está hecha. */
struct CheckCircle: View {
    let done: Bool
    let overdue: Bool
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(stroke, lineWidth: 1.5)
            if done {
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.5, weight: .bold))
                    .foregroundStyle(Palette.accent)
            }
        }
        .frame(width: size, height: size)
        .widgetAccentable(done)
    }

    private var stroke: Color {
        if done { return Palette.accent.opacity(0.55) }
        return overdue ? Palette.danger.opacity(0.5) : Palette.line2
    }
}

struct CountLabel: View {
    let count: Int
    let size: CGFloat

    var body: some View {
        Text(String(count))
            .font(.system(size: size, weight: .semibold))
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
            .tracking(1)
            .foregroundStyle(Palette.text2)
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

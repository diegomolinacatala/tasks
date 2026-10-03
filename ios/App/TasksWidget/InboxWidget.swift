import SwiftUI
import WidgetKit

/**
 * La Bandeja: lo que aún no tiene día, en el orden de la app y con su círculo para tacharlo sin
 * abrir Tasks (`ToggleTaskIntent`, igual que en el widget de hoy). Tocar una tarea la abre; el + abre
 * la barra de escribir en la Bandeja, y el resto del widget, la Bandeja.
 */
struct InboxWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetStore.inboxKind, provider: InboxProvider()) { entry in
            InboxWidgetView(entry: entry)
                .containerBackground(for: .widget) { Palette.background }
        }
        .configurationDisplayName(WidgetText.current.inboxName)
        .description(WidgetText.current.inboxDescription)
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular])
    }
}

struct InboxEntry: TimelineEntry {
    let date: Date
    /** `nil` hasta que la app escribe una foto con la Bandeja. */
    let tasks: [WidgetInboxTask]?
    var text = WidgetText.current

    /** Lo pendiente en el orden de la app y, al final, lo tachado (también lo tachado desde el widget). */
    var rows: [WidgetTask] {
        let all = (tasks ?? []).map(\.asTask)
        return all.filter { !$0.done } + all.filter(\.done)
    }

    var pending: Int {
        (tasks ?? []).filter { !$0.done }.count
    }

    /** Pendientes, las más importantes primero; a igualdad, en su orden. */
    var mostImportant: [WidgetTask] {
        rows.filter { !$0.done }.enumerated()
            .sorted { a, b in
                let (left, right) = (a.element.importance ?? 1, b.element.importance ?? 1)
                return left != right ? left > right : a.offset < b.offset
            }
            .map(\.element)
    }

    /** Para la galería de widgets, antes de tener tareas de verdad. */
    static func sample(_ date: Date) -> InboxEntry {
        let titles = WidgetText.current.sampleInbox
        let title = { (index: Int) in WidgetText.sample(titles, index) }
        return InboxEntry(date: date, tasks: [
            WidgetInboxTask(id: "muestra-1", title: title(0), done: false, importance: 5),
            WidgetInboxTask(id: "muestra-2", title: title(1), done: false),
            WidgetInboxTask(id: "muestra-3", title: title(2), done: false),
            WidgetInboxTask(id: "muestra-4", title: title(3), done: true),
        ])
    }
}

/**
 * Sin fecha no hay medianoche que cruzar: una sola entrada, que se rehace cuando la app escribe una
 * foto nueva (`syncWidget` recarga todos los widgets) o al tachar desde el propio widget.
 */
struct InboxProvider: TimelineProvider {
    func placeholder(in context: Context) -> InboxEntry {
        InboxEntry.sample(Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (InboxEntry) -> Void) {
        let tasks = WidgetStore.inboxTasks()
        if context.isPreview && (tasks?.isEmpty ?? true) {
            completion(InboxEntry.sample(Date()))
        } else {
            completion(InboxEntry(date: Date(), tasks: tasks))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<InboxEntry>) -> Void) {
        completion(Timeline(entries: [InboxEntry(date: Date(), tasks: WidgetStore.inboxTasks())], policy: .never))
    }
}

struct InboxWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var colorScheme
    let entry: InboxEntry

    var body: some View {
        content
            .widgetURL(WidgetLink.backlog)
            // Como el de hoy: en la pantalla de bloqueo, la paleta de noche (iOS pinta por luminosidad).
            .environment(\.colorScheme, family == .accessoryRectangular ? .dark : colorScheme)
            .environment(\.widgetText, entry.text)
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryRectangular:
            InboxRectangular(entry: entry)
        case .systemSmall:
            InboxSmall(entry: entry)
        case .systemLarge:
            InboxLarge(entry: entry)
        default:
            InboxMedium(entry: entry)
        }
    }
}

// MARK: - Tamaños

private struct InboxSmall: View {
    @Environment(\.widgetText) var text
    let entry: InboxEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                CountLabel(count: entry.pending, size: 26)
                DayLabel(label: text.inboxCaps)
                Spacer(minLength: 0)
            }
            InboxList(entry: entry, slots: 3, style: .compact)
        }
    }
}

private struct InboxMedium: View {
    @Environment(\.widgetText) var text
    let entry: InboxEntry

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 0) {
                AddLink(destination: WidgetLink.composeInbox, label: text.newInboxTask)
                Spacer(minLength: 0)
                CountLabel(count: entry.pending, size: 34)
                DayLabel(label: text.inboxCaps)
            }
            .frame(minWidth: 44, maxHeight: .infinity, alignment: .leading)
            InboxList(entry: entry, slots: 4, style: .regular)
        }
    }
}

private struct InboxLarge: View {
    @Environment(\.widgetText) var text
    let entry: InboxEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 0) {
                    CountLabel(count: entry.pending, size: 34)
                    DayLabel(label: text.inboxCaps)
                }
                Spacer(minLength: 0)
                AddLink(destination: WidgetLink.composeInbox, label: text.newInboxTask)
            }
            InboxList(entry: entry, slots: 8, style: .regular)
        }
    }
}

/** Pantalla de bloqueo: cuántas hay y, como solo caben dos, las dos más importantes. */
private struct InboxRectangular: View {
    @Environment(\.widgetText) var text
    let entry: InboxEntry

    var body: some View {
        let shown = Array(entry.mostImportant.prefix(2))
        VStack(alignment: .leading, spacing: 1) {
            Text(verbatim: entry.pending == 0 ? text.inbox : "\(text.inbox) · \(entry.pending)")
                .font(.headline)
                .widgetAccentable()
            if shown.isEmpty {
                Text(verbatim: entry.tasks == nil ? text.openTasks : text.nothingInbox)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(shown) { task in
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

// MARK: - Lista

/** Filas de alto fijo, como en el widget de hoy: no bailan al tachar. Si no caben, la última dice cuántas quedan. */
private struct InboxList: View {
    @Environment(\.widgetText) var text
    let entry: InboxEntry
    let slots: Int
    let style: RowStyle

    var body: some View {
        let rows = visibleRows
        if rows.isEmpty {
            Text(verbatim: entry.tasks == nil ? text.openTasks : text.nothingInbox)
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

    private var visibleRows: [WidgetRow] {
        let all = entry.rows.map { WidgetRow.task($0, overdue: false) }
        guard all.count > slots else { return all }
        let shown = max(slots - 1, 0)
        return Array(all.prefix(shown)) + [.more(all.count - shown)]
    }

    @ViewBuilder
    private func slot(_ row: WidgetRow?) -> some View {
        switch row {
        case .task(let task, _):
            TaskRow(task: task, overdue: false, today: "", style: style)
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

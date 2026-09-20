import SwiftUI
import WidgetKit

@main
struct TasksWidgetBundle: WidgetBundle {
    var body: some Widget {
        TasksWidget()
    }
}

/** Lo pendiente de hoy y lo atrasado, como el bloque Hoy de la pantalla principal. */
struct TasksWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetStore.kind, provider: TasksProvider()) { entry in
            TasksWidgetView(entry: entry)
                .containerBackground(for: .widget) { Palette.background }
        }
        .configurationDisplayName("Hoy")
        .description("Tareas de hoy y atrasadas.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular])
    }
}

struct TasksEntry: TimelineEntry {
    let date: Date
    /** `nil` hasta que la app escribe la primera foto. */
    let tasks: [WidgetTask]?

    var day: WidgetDay {
        WidgetDay(tasks: tasks ?? [], day: WidgetDay.iso(date))
    }

    /** Para la galería de widgets, antes de tener tareas de verdad. */
    static func sample(_ date: Date) -> TasksEntry {
        let today = WidgetDay.iso(date)
        return TasksEntry(date: date, tasks: [
            WidgetTask(id: "muestra-1", title: "Comprar pan", date: today, time: nil, done: false),
            WidgetTask(id: "muestra-2", title: "Llamar a Ana", date: today, time: "17:00", done: false),
            WidgetTask(id: "muestra-3", title: "Enviar el presupuesto", date: today, time: nil, done: false, importance: 6),
            WidgetTask(id: "muestra-4", title: "Salir a correr", date: today, time: "20:30", done: true),
        ])
    }
}

struct TasksProvider: TimelineProvider {
    func placeholder(in context: Context) -> TasksEntry {
        TasksEntry.sample(Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (TasksEntry) -> Void) {
        let now = Date()
        let tasks = WidgetStore.tasks()
        if context.isPreview && (tasks?.isEmpty ?? true) {
            completion(TasksEntry.sample(now))
        } else {
            completion(TasksEntry(date: now, tasks: tasks))
        }
    }

    /**
     * La foto trae los próximos días: una entrada por medianoche basta para que lo de hoy pase a
     * atrasado y aparezca lo del día siguiente sin abrir la app. La app pide recargar al cambiar algo.
     */
    func getTimeline(in context: Context, completion: @escaping (Timeline<TasksEntry>) -> Void) {
        let now = Date()
        let tasks = WidgetStore.tasks()
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: now)
        let midnights = (1...WidgetStore.days).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
        let entries = [TasksEntry(date: now, tasks: tasks)] + midnights.map { TasksEntry(date: $0, tasks: tasks) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct TasksWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TasksEntry

    var body: some View {
        content
            .widgetURL(WidgetLink.today)
            .environment(\.colorScheme, .dark)
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryCircular:
            CircularWidget(day: entry.day)
        case .accessoryRectangular:
            RectangularWidget(day: entry.day, ready: entry.tasks != nil)
        case .systemSmall:
            SmallWidget(day: entry.day, ready: entry.tasks != nil)
        case .systemLarge:
            LargeWidget(day: entry.day, ready: entry.tasks != nil)
        default:
            MediumWidget(day: entry.day, ready: entry.tasks != nil)
        }
    }
}

import AppIntents
import SwiftUI
import WidgetKit

@main
struct TasksWidgetBundle: WidgetBundle {
    var body: some Widget {
        TasksWidget()
        InboxWidget()
        RoutinesWidget()
    }
}

/** Lo pendiente de hoy y lo atrasado, como el bloque Hoy de la pantalla principal. */
struct TasksWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetStore.kind, provider: TasksProvider()) { entry in
            TasksWidgetView(entry: entry)
                .containerBackground(for: .widget) { Palette.background }
        }
        .configurationDisplayName(WidgetText.current.todayName)
        .description(WidgetText.current.todayDescription)
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular])
    }
}

struct TasksEntry: TimelineEntry {
    let date: Date
    /** `nil` hasta que la app escribe la primera foto. */
    let tasks: [WidgetTask]?
    var text = WidgetText.current

    var day: WidgetDay {
        WidgetDay(tasks: tasks ?? [], day: WidgetDay.iso(date))
    }

    /** Para la galería de widgets, antes de tener tareas de verdad. */
    static func sample(_ date: Date) -> TasksEntry {
        let today = WidgetDay.iso(date)
        let titles = WidgetText.current.sampleTasks
        let title = { (index: Int) in WidgetText.sample(titles, index) }
        return TasksEntry(date: date, tasks: [
            WidgetTask(id: "muestra-1", title: title(0), date: today, time: nil, done: false),
            WidgetTask(id: "muestra-2", title: title(1), date: today, time: "17:00", done: false),
            WidgetTask(id: "muestra-3", title: title(2), date: today, time: nil, done: false, importance: 6),
            WidgetTask(id: "muestra-4", title: title(3), date: today, time: "20:30", done: true),
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
        // El idioma se lee una vez (decodifica la foto), no en cada entrada.
        let text = WidgetText.current
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: now)
        let midnights = (1...WidgetStore.days).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
        let entries = [TasksEntry(date: now, tasks: tasks, text: text)] + midnights.map { TasksEntry(date: $0, tasks: tasks, text: text) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct TasksWidgetView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var colorScheme
    let entry: TasksEntry

    var body: some View {
        content
            .widgetURL(WidgetLink.today)
            .environment(\.colorScheme, lockScreen ? .dark : colorScheme)
            .environment(\.widgetText, entry.text)
    }

    /**
     * En la pantalla de bloqueo iOS pinta por luminosidad y la tinta marino casi desaparecería: allí
     * va la paleta de noche. En la de inicio, la del modo del iPhone (antes se forzaba la de noche
     * también ahí, y en modo claro el texto marfil no se leía sobre el papel).
     */
    private var lockScreen: Bool {
        family == .accessoryCircular || family == .accessoryRectangular
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

// MARK: - Rutinas

/**
 * Rutinas en la pantalla de bloqueo (y en la de inicio): un toque las tacha sin abrir la app. Se
 * puede elegir una concreta ("Tomar creatina") o dejar que enseñe la siguiente que queda por hacer.
 * A medianoche todas amanecen sin tachar: el widget mira si el día nuevo está en su diario.
 */
struct RoutinesWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: WidgetStore.routinesKind, intent: RoutineWidgetIntent.self, provider: RoutinesProvider()) { entry in
            RoutinesWidgetView(entry: entry)
                .containerBackground(for: .widget) { Palette.background }
        }
        .configurationDisplayName(WidgetText.current.routinesName)
        .description(WidgetText.current.routinesDescription)
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .systemSmall])
    }
}

/** Qué rutina enseña el widget. Sin elegir, la siguiente que queda por hacer hoy. */
struct RoutineWidgetIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Rutina"
    static var description = IntentDescription("Elige una rutina o deja que enseñe la siguiente que queda por hacer hoy.")

    @Parameter(title: "Rutina")
    var routine: RoutineEntity?

    init() {}
}

/** Una rutina de la foto de la app, para elegirla al configurar el widget. */
struct RoutineEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Rutina"
    static var defaultQuery = RoutineQuery()

    let id: String
    /** Con su emoji delante, si lo tiene: así se reconoce en la lista al configurar el widget. */
    let title: String

    init(_ routine: WidgetRoutine) {
        id = routine.id
        if let emoji = routine.emoji, routine.hasEmoji {
            title = "\(emoji) \(routine.title)"
        } else {
            title = routine.title
        }
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)")
    }
}

struct RoutineQuery: EntityQuery {
    func entities(for identifiers: [RoutineEntity.ID]) async throws -> [RoutineEntity] {
        (WidgetStore.routines() ?? [])
            .filter { identifiers.contains($0.id) }
            .map { RoutineEntity($0) }
    }

    func suggestedEntities() async throws -> [RoutineEntity] {
        (WidgetStore.routines() ?? []).map { RoutineEntity($0) }
    }
}

struct RoutinesEntry: TimelineEntry {
    let date: Date
    /** `nil` hasta que la app escribe la primera foto. */
    let routines: [WidgetRoutine]?
    /** La rutina elegida al configurar el widget; `nil` = la siguiente. */
    let chosen: String?
    var text = WidgetText.current

    var day: String {
        WidgetDay.iso(date)
    }

    /** Las que tocan hoy, en el orden de la app (por hora). */
    var today: [WidgetRoutine] {
        (routines ?? []).filter { $0.isDue(on: day) }
    }

    var done: Int {
        today.filter { $0.isDone(on: day) }.count
    }

    /**
     * La que se tacha al tocar: la elegida, si hoy toca; si no, la primera sin hacer (si están todas,
     * la última). Así una rutina de los lunes no se tacha un martes.
     */
    var target: WidgetRoutine? {
        if let chosen, let routine = today.first(where: { $0.id == chosen }) {
            return routine
        }
        return today.first { !$0.isDone(on: day) } ?? today.last
    }

    /** La elegida al configurar el widget y que hoy toca. */
    var showsChosen: Bool {
        guard let chosen else { return false }
        return today.contains { $0.id == chosen }
    }

    static func sample(_ date: Date) -> RoutinesEntry {
        let today = WidgetDay.iso(date)
        let titles = WidgetText.current.sampleRoutines
        let title = { (index: Int) in WidgetText.sample(titles, index) }
        return RoutinesEntry(date: date, routines: [
            WidgetRoutine(id: "muestra-1", title: title(0), time: "10:00", days: [1, 2, 3, 4, 5, 6, 7], done: [], emoji: "💊"),
            WidgetRoutine(id: "muestra-2", title: title(1), time: "22:30", days: [1, 2, 3, 4, 5, 6, 7], done: [today], emoji: "📖"),
            WidgetRoutine(id: "muestra-3", title: title(2), time: nil, days: [1, 2, 3, 4, 5, 6, 7], done: [], emoji: "🧘"),
        ], chosen: nil)
    }
}

struct RoutinesProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> RoutinesEntry {
        RoutinesEntry.sample(Date())
    }

    func snapshot(for configuration: RoutineWidgetIntent, in context: Context) async -> RoutinesEntry {
        let routines = WidgetStore.routines()
        if context.isPreview && (routines?.isEmpty ?? true) {
            return RoutinesEntry.sample(Date())
        }
        return RoutinesEntry(date: Date(), routines: routines, chosen: configuration.routine?.id)
    }

    /** Una entrada por medianoche: cada día nuevo amanece con todo sin tachar, sin abrir la app. */
    func timeline(for configuration: RoutineWidgetIntent, in context: Context) async -> Timeline<RoutinesEntry> {
        let now = Date()
        let routines = WidgetStore.routines()
        let chosen = configuration.routine?.id
        let text = WidgetText.current
        let start = Calendar.current.startOfDay(for: now)
        let midnights = (1...WidgetStore.days).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: start) }
        let entries = [RoutinesEntry(date: now, routines: routines, chosen: chosen, text: text)]
            + midnights.map { RoutinesEntry(date: $0, routines: routines, chosen: chosen, text: text) }
        return Timeline(entries: entries, policy: .atEnd)
    }
}

struct RoutinesWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: RoutinesEntry

    var body: some View {
        content.environment(\.widgetText, entry.text)
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryCircular:
            RoutineCircular(entry: entry)
        case .accessoryRectangular:
            RoutineRectangular(entry: entry)
        default:
            RoutineSmall(entry: entry)
        }
    }
}

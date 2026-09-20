import Foundation

/**
 * Lo que comparten la app y el widget a través del App Group (se compila en los dos objetivos).
 * La app escribe la foto de las tareas (`src/lib/widget.ts`); el widget apunta aparte lo que se
 * marca desde él hasta que la app lo recoge al volver a primer plano. Cada lado escribe su fichero.
 */
enum WidgetStore {
    static let appGroup = "group.io.github.diegomolinacatala.tasks"
    static let kind = "TasksToday"
    /** Días por delante que trae la foto (`WIDGET_DAYS`). */
    static let days = 7

    private static let version = 1
    private static let snapshotFile = "widget-snapshot.json"
    private static let changesFile = "widget-changes.json"

    enum StoreError: Error {
        case unavailable
        case invalid
    }

    /** La foto se valida antes de guardarla: el widget no tiene cómo avisar de un fichero roto. */
    static func saveSnapshot(_ json: String) throws {
        guard let url = file(snapshotFile) else { throw StoreError.unavailable }
        let data = Data(json.utf8)
        guard let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data), snapshot.version == version else {
            throw StoreError.invalid
        }
        try data.write(to: url, options: .atomic)
    }

    /** Las tareas como las ve el widget: la foto de la app con lo marcado desde el widget encima. `nil` sin foto. */
    static func tasks() -> [WidgetTask]? {
        guard let snapshot = read(WidgetSnapshot.self, snapshotFile), snapshot.version == version else { return nil }
        let marked = loadChanges().done
        return snapshot.tasks.map { task in
            guard let done = marked[task.id] else { return task }
            var changed = task
            changed.done = done
            return changed
        }
    }

    /** Marca o desmarca desde el widget. Devuelve cómo queda, o `nil` si la tarea ya no está en la foto. */
    static func toggle(_ id: String) -> Bool? {
        guard
            let snapshot = read(WidgetSnapshot.self, snapshotFile),
            let task = snapshot.tasks.first(where: { $0.id == id })
        else { return nil }
        var changes = loadChanges()
        let done = !(changes.done[id] ?? task.done)
        // Si vuelve a como está en la app, no hay nada que aplicar.
        changes.done[id] = done == task.done ? nil : done
        save(changes)
        return done
    }

    /** El widget quitó avisos: la app tiene que volver a programarlos aunque su plan no cambie. */
    static func markReschedule() {
        var changes = loadChanges()
        changes.reschedule = true
        save(changes)
    }

    /** Lo marcado y aún sin aplicar, sin vaciarlo, como lo recibe la web: `[{ taskId, done }]`. */
    static func pendingDone() -> [[String: Any]] {
        loadChanges().done.map { ["taskId": $0.key, "done": $0.value] }
    }

    /** Para la app: lo pendiente de aplicar, y se vacía. */
    static func takeChanges() -> WidgetChanges {
        let changes = loadChanges()
        if let url = file(changesFile) {
            try? FileManager.default.removeItem(at: url)
        }
        return changes
    }

    private static func loadChanges() -> WidgetChanges {
        read(WidgetChanges.self, changesFile) ?? WidgetChanges()
    }

    private static func save(_ changes: WidgetChanges) {
        guard let url = file(changesFile), let data = try? JSONEncoder().encode(changes) else { return }
        try? data.write(to: url, options: .atomic)
    }

    private static func read<T: Decodable>(_ type: T.Type, _ name: String) -> T? {
        guard let url = file(name), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    /** `nil` si el binario no lleva el App Group (compilación sin firmar). */
    private static func file(_ name: String) -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent(name)
    }
}

struct WidgetTask: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    /** `AAAA-MM-DD` local. */
    let date: String
    /** `HH:MM` o `nil`. */
    let time: String?
    var done: Bool
    /** 1 a 10 (`src/lib/importance.ts`). Falta en las fotos de versiones anteriores: normal. */
    var importance: Int? = nil

    /** De 0 (normal) a 1 (lo más importante). */
    var weight: Double {
        let level = min(max(importance ?? 1, 1), 10)
        return Double(level - 1) / 9
    }
}

struct WidgetSnapshot: Codable {
    let version: Int
    let tasks: [WidgetTask]
}

struct WidgetChanges: Codable {
    var done: [String: Bool] = [:]
    var reschedule = false
}

/** Lo que enseña el widget un día concreto, con el criterio de la pantalla principal. */
struct WidgetDay {
    /** `AAAA-MM-DD` del día que se enseña. */
    let day: String
    /** Pendientes de días anteriores, de la más antigua a la más reciente. */
    let overdue: [WidgetTask]
    /** Las del día: lo pendiente primero y lo hecho al final. */
    let today: [WidgetTask]

    init(tasks: [WidgetTask], day: String) {
        self.day = day
        overdue = tasks.filter { !$0.done && $0.date < day }
        let inDay = tasks.filter { $0.date == day }
        today = inDay.filter { !$0.done } + inDay.filter(\.done)
    }

    /** Lo mismo que el número del icono: pendientes de hoy más atrasadas. */
    var pending: Int {
        overdue.count + today.filter { !$0.done }.count
    }

    /** Pendientes, las más importantes primero; a igualdad, atrasadas y luego hoy, en su orden. */
    var mostImportant: [WidgetTask] {
        let waiting = overdue + today.filter { !$0.done }
        return waiting.enumerated()
            .sorted { a, b in
                let (left, right) = (a.element.importance ?? 1, b.element.importance ?? 1)
                return left != right ? left > right : a.offset < b.offset
            }
            .map(\.element)
    }

    /** Día local en ISO, siempre en calendario gregoriano como la web. */
    static func iso(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
}

/** Enlaces del widget a la app: `<esquema>://today`, `://compose` y `://task/<id>`. */
enum WidgetLink {
    /** Igual que `CFBundleURLSchemes` en el Info.plist de la app. */
    static let scheme = "io.github.diegomolinacatala.tasks"

    static var today: URL { link("today") }
    static var compose: URL { link("compose") }

    static func task(_ id: String) -> URL {
        link("task", path: "/" + id)
    }

    /** Acción para `NativeActions`; `nil` si el enlace no es del widget. */
    static func action(for url: URL) -> [String: Any]? {
        guard url.scheme == scheme else { return nil }
        switch url.host {
        case "today":
            return ["type": "today"]
        case "compose":
            return ["type": "compose"]
        case "task":
            let id = url.lastPathComponent
            return id.isEmpty || id == "/" ? nil : ["type": "open", "taskId": id]
        default:
            return nil
        }
    }

    private static func link(_ host: String, path: String = "") -> URL {
        var components = URLComponents()
        components.scheme = scheme
        components.host = host
        components.path = path
        return components.url ?? URL(fileURLWithPath: "/")
    }
}

import Foundation

/**
 * Lo que comparten la app y los widgets a través del App Group (se compila en los dos objetivos).
 * La app escribe la foto de las tareas y las rutinas (`src/lib/widget.ts`); los widgets apuntan
 * aparte lo que se marca desde ellos hasta que la app lo recoge al volver a primer plano. Cada lado
 * escribe su fichero.
 */
enum WidgetStore {
    static let appGroup = "group.io.github.diegomolinacatala.tasks"
    static let kind = "TasksToday"
    /** El widget de rutinas (pantalla de bloqueo y de inicio). */
    static let routinesKind = "TasksRoutines"
    /** El widget de la Bandeja: lo que no tiene fecha. */
    static let inboxKind = "TasksInbox"
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

    /**
     * La Bandeja como la ve el widget, con lo marcado desde él encima. `nil` sin foto o con una de antes
     * del widget de la Bandeja (la app la reescribe al abrirse).
     */
    static func inboxTasks() -> [WidgetInboxTask]? {
        guard let snapshot = read(WidgetSnapshot.self, snapshotFile), snapshot.version == version, let inbox = snapshot.inbox else {
            return nil
        }
        let marked = loadChanges().done
        return inbox.map { task in
            guard let done = marked[task.id] else { return task }
            var changed = task
            changed.done = done
            return changed
        }
    }

    /** Idioma de la app (`es` o `en`) según la última foto; `nil` si aún no hay foto o es de antes del inglés. */
    static func language() -> String? {
        read(WidgetSnapshot.self, snapshotFile)?.language
    }

    /** Las rutinas como las ve el widget, con lo tachado desde él (o desde su aviso) encima. `nil` sin foto. */
    static func routines() -> [WidgetRoutine]? {
        guard let snapshot = read(WidgetSnapshot.self, snapshotFile), snapshot.version == version else { return nil }
        let marked = loadChanges().routines
        return (snapshot.routines ?? []).map { routine in
            guard let days = marked[routine.id] else { return routine }
            var changed = routine
            for (day, done) in days {
                changed.done.removeAll { $0 == day }
                if done { changed.done.append(day) }
            }
            return changed
        }
    }

    /**
     * Marca o desmarca desde el widget (el de hoy o el de la Bandeja). Devuelve cómo queda, o `nil` si
     * la tarea ya no está en la foto.
     */
    static func toggle(_ id: String) -> Bool? {
        guard let snapshot = read(WidgetSnapshot.self, snapshotFile) else { return nil }
        let saved = snapshot.tasks.first(where: { $0.id == id })?.done ?? snapshot.inbox?.first(where: { $0.id == id })?.done
        guard let saved else { return nil }
        var changes = loadChanges()
        let done = !(changes.done[id] ?? saved)
        // Si vuelve a como está en la app, no hay nada que aplicar.
        changes.done[id] = done == saved ? nil : done
        save(changes)
        return done
    }

    /** Tacha o destacha una rutina ese día. Devuelve cómo queda, o `nil` si ya no está en la foto. */
    static func toggleRoutine(_ id: String, day: String) -> Bool? {
        guard let routine = routines()?.first(where: { $0.id == id }) else { return nil }
        let done = !routine.done.contains(day)
        setRoutine(id, day: day, done: done)
        return done
    }

    /** Deja una rutina hecha o sin hacer ese día (el botón "Hecha" de su aviso). */
    static func setRoutine(_ id: String, day: String, done: Bool) {
        guard let snapshot = read(WidgetSnapshot.self, snapshotFile) else { return }
        let saved = snapshot.routines?.first(where: { $0.id == id })?.done.contains(day) ?? false
        var changes = loadChanges()
        var days = changes.routines[id] ?? [:]
        // Si vuelve a como está en la app, no hay nada que aplicar.
        days[day] = done == saved ? nil : done
        changes.routines[id] = days.isEmpty ? nil : days
        save(changes)
    }

    /** El widget quitó avisos: la app tiene que volver a programarlos aunque su plan no cambie. */
    static func markReschedule() {
        var changes = loadChanges()
        changes.reschedule = true
        save(changes)
    }

    /**
     * Lo marcado y aún sin aplicar, sin vaciarlo, como lo recibe la web: `[{ taskId, done }]` para las
     * tareas y `[{ routineId, date, done }]` para las rutinas, en la misma lista.
     */
    static func pendingDone() -> [[String: Any]] {
        describe(loadChanges())
    }

    /** Los cambios como lista para la web (`parseWidgetChanges` y `parseRoutineChanges`). */
    static func describe(_ changes: WidgetChanges) -> [[String: Any]] {
        let tasks: [[String: Any]] = changes.done.map { ["taskId": $0.key, "done": $0.value] }
        var routines: [[String: Any]] = []
        for (id, days) in changes.routines {
            for (day, done) in days {
                routines.append(["routineId": id, "date": day, "done": done])
            }
        }
        return tasks + routines
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

/** Rutina (`WidgetRoutine` en `src/lib/widget.ts`): qué días toca y cuáles se hizo. */
struct WidgetRoutine: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    /** `HH:MM` o `nil`. */
    let time: String?
    /** 1 = lunes … 7 = domingo. */
    let days: [Int]
    /** Días hechos (`AAAA-MM-DD`) desde hace una semana. */
    var done: [String]
    /** Su emoji, que sustituye a las iniciales. Falta en las fotos anteriores y en las rutinas sin él. */
    var emoji: String? = nil

    var hasEmoji: Bool {
        !(emoji ?? "").isEmpty
    }

    /** El emoji si lo tiene; si no, sus iniciales: `Tomar creatina` → `TC`; una sola palabra, sus dos primeras letras. */
    var badge: String {
        if let emoji, !emoji.isEmpty { return emoji }
        let words = title.split(separator: " ")
        if words.count >= 2 {
            return words.prefix(2).compactMap { word in word.first.map { String($0) } }.joined().uppercased()
        }
        return String(title.prefix(2)).capitalized
    }

    func isDue(on day: String) -> Bool {
        guard let weekday = WidgetDay.weekday(of: day) else { return false }
        return days.contains(weekday)
    }

    func isDone(on day: String) -> Bool {
        done.contains(day)
    }
}

/** Tarea de la Bandeja (`WidgetInboxTask` en `src/lib/widget.ts`): sin día ni hora. */
struct WidgetInboxTask: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    var done: Bool
    var importance: Int? = nil

    /** Como una tarea más, para pintarla con las mismas filas que el widget de hoy. */
    var asTask: WidgetTask {
        WidgetTask(id: id, title: title, date: "", time: nil, done: done, importance: importance)
    }
}

struct WidgetSnapshot: Codable {
    let version: Int
    let tasks: [WidgetTask]
    /** Falta en las fotos de antes de las rutinas. */
    let routines: [WidgetRoutine]?
    /** Falta en las fotos de antes del widget de la Bandeja. */
    let inbox: [WidgetInboxTask]?
    /** `es` o `en`, ya resuelto por la app. Falta en las fotos de antes del inglés. */
    let language: String?
}

struct WidgetChanges: Codable {
    var done: [String: Bool] = [:]
    /** Rutina → día → hecha. */
    var routines: [String: [String: Bool]] = [:]
    var reschedule = false

    init() {}

    /** Un fichero de una versión anterior no trae `routines`: se lee igual. */
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        done = try container.decodeIfPresent([String: Bool].self, forKey: .done) ?? [:]
        routines = try container.decodeIfPresent([String: [String: Bool]].self, forKey: .routines) ?? [:]
        reschedule = try container.decodeIfPresent(Bool.self, forKey: .reschedule) ?? false
    }
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

    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar
    }

    /** Día local en ISO, siempre en calendario gregoriano como la web. */
    static func iso(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }

    /** Día de la semana de un `AAAA-MM-DD`: 1 = lunes … 7 = domingo, como `isoWeekday` en la web. */
    static func weekday(of day: String) -> Int? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])) else {
            return nil
        }
        // `Calendar` cuenta del domingo (1) al sábado (7).
        return (calendar.component(.weekday, from: date) + 5) % 7 + 1
    }
}

/**
 * Enlaces del widget a la app: `<esquema>://today`, `://compose` (`://compose/inbox` desde la Bandeja),
 * `://routines`, `://backlog` y `://task/<id>`.
 */
enum WidgetLink {
    /** Igual que `CFBundleURLSchemes` en el Info.plist de la app. */
    static let scheme = "io.github.diegomolinacatala.tasks"

    static var today: URL { link("today") }
    static var compose: URL { link("compose") }
    static var routines: URL { link("routines") }
    static var backlog: URL { link("backlog") }
    static var composeInbox: URL { link("compose", path: "/inbox") }

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
            return url.lastPathComponent == "inbox" ? ["type": "compose", "inbox": true] : ["type": "compose"]
        case "routines":
            return ["type": "routines"]
        case "backlog":
            return ["type": "backlog"]
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

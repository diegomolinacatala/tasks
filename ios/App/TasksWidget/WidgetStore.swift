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
        let today = WidgetDay.iso(Date())
        return snapshot.tasks.map { task in
            guard let done = marked[task.id] else { return task }
            var changed = task
            changed.done = done
            // Con plazo, tachada aquí es de hoy (como la ve la app): no sale hecha los días que quedaban.
            if done, let until = changed.until {
                changed.date = min(max(today, changed.date), until)
                changed.until = nil
            }
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

    /**
     * Eventos del calendario del iPhone para el widget de hoy, si la app lo tiene encendido. Se leen de
     * EventKit al momento (así salen aunque no se abra la app); si no se puede, los de la última foto.
     */
    /** La app enseña el calendario (la foto lo dice). */
    static var showsCalendar: Bool {
        read(WidgetSnapshot.self, snapshotFile)?.calendar != nil
    }

    static func events(from: Date, to: Date) -> [WidgetEvent] {
        guard let snapshot = read(WidgetSnapshot.self, snapshotFile), let calendar = snapshot.calendar else { return [] }
        if CalendarReader.canRead {
            return CalendarReader.widgetEvents(from: from, to: to, hidden: Set(calendar.hidden))
        }
        let start = CalendarReader.millis(from)
        let end = CalendarReader.millis(to)
        return (snapshot.events ?? []).filter { $0.end >= start && $0.start < end }
    }

    /** Idioma de la app (`es` o `en`) según la última foto; `nil` si aún no hay foto o es de antes del inglés. */
    static func language() -> String? {
        read(WidgetSnapshot.self, snapshotFile)?.language
    }

    /** Minutos que el día de las rutinas va detrás del calendario (`dayShift`); 0 sin foto o con una anterior. */
    static func dayShift() -> Int {
        read(WidgetSnapshot.self, snapshotFile)?.dayShift ?? 0
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
    /** `AAAA-MM-DD` local. Con plazo y tachada desde el widget, pasa a ser el día en que se tachó. */
    var date: String
    /** `HH:MM` o `nil`. */
    let time: String?
    var done: Bool
    /** 1 a 10 (`src/lib/importance.ts`). Falta en las fotos de versiones anteriores: normal. */
    var importance: Int? = nil
    /**
     * Último día de su plazo (`AAAA-MM-DD`, `src/lib/period.ts`): pendiente, se ve cada día hasta él y
     * solo después está atrasada. Falta en las tareas sin plazo y en las fotos de antes de los plazos.
     */
    var until: String? = nil

    /** Último día en que vale: después, atrasada. */
    var lastDay: String { until ?? date }

    /** Se ve ese día: el suyo o, con plazo, cualquiera de él. */
    func shows(on day: String) -> Bool {
        guard let until else { return date == day }
        return date <= day && day <= until
    }

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
    /** Minutos que el día de las rutinas va detrás del calendario. Falta en las fotos de antes: medianoche. */
    let dayShift: Int?
    /** El calendario del iPhone, si la app lo enseña (sin él, apagado; también en las fotos de antes). */
    let calendar: WidgetCalendarConfig?
    /** Los eventos de la semana, por si el widget no pudiera leerlos de EventKit. */
    let events: [WidgetEvent]?
}

/** Qué calendarios oculta la app (`settings.calendar.hidden`). */
struct WidgetCalendarConfig: Codable {
    let hidden: [String]
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
        overdue = tasks.filter { !$0.done && $0.lastDay < day }
        let inDay = tasks.filter { $0.shows(on: day) }
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

    /**
     * El día de las rutinas a esa hora (`routineDay` en `src/lib/routines.ts`). Con el día empezando a las
     * 4:00 (`shift` 240), la 1 de la madrugada aún es la víspera; con 22:00 (`shift` -120), las 23:00 ya
     * son el día siguiente.
     */
    static func routineDay(_ date: Date, shift: Int) -> String {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        let minutes = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
        var offset = 0
        if shift > 0 && minutes < shift {
            offset = -1
        } else if shift < 0 && minutes >= 1440 + shift {
            offset = 1
        }
        guard offset != 0, let moved = calendar.date(byAdding: .day, value: offset, to: date) else { return iso(date) }
        return iso(moved)
    }

    /** Las próximas `count` horas a las que cambia el día de las rutinas, después de `now`. */
    static func routineDayStarts(after now: Date, shift: Int, count: Int) -> [Date] {
        let start = calendar.startOfDay(for: now)
        return (0...count + 1)
            .compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
            .map { $0.addingTimeInterval(TimeInterval(shift * 60)) }
            .filter { $0 > now }
            .prefix(count)
            .map { $0 }
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

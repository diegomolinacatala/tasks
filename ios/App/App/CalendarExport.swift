import Capacitor
import EventKit
import UIKit

/**
 * Las tareas con hora, como eventos en un calendario del iPhone: el «Tasks» que crea la app o el que se
 * elija (el del trabajo, para que lo vea quien lo comparte). Va en un solo sentido: la web manda la lista
 * entera de lo que tiene que haber (`src/lib/calendarExport.ts`) y aquí se crea, se cambia o se borra lo
 * justo. Cada evento lleva el enlace a su tarea (`WidgetLink.task`): así la Agenda no lo enseña dos veces
 * y desde Calendario se abre la tarea. Lo que se cambie a mano en Calendario se respeta mientras la tarea
 * no cambie.
 */
enum CalendarExport {
    struct Item {
        let taskId: String
        let title: String
        let start: Date
        let end: Date
    }

    /** Qué evento es de cada tarea, en qué calendario y cómo era la tarea al escribirlo. */
    private struct Link: Codable {
        let eventId: String
        let calendarId: String
        let fingerprint: String
    }

    private static let linksKey = "tasks.calendarExport"
    private static let ownCalendarKey = "tasks.ownCalendar"

    /** El «Tasks» que creó la app, si sigue existiendo. */
    static var ownCalendarId: String? {
        UserDefaults.standard.string(forKey: ownCalendarKey)
    }

    /**
     * Crea el calendario «Tasks» (o devuelve el que ya había). En iCloud si lo hay, para que se vea en los
     * demás dispositivos; si no, en la cuenta de los eventos nuevos o en el propio iPhone.
     */
    static func ownCalendar(in store: EKEventStore, title: String) -> String? {
        if let id = ownCalendarId, store.calendar(withIdentifier: id) != nil { return id }
        let sources = store.sources
        var candidates: [EKSource] = []
        if let iCloud = sources.first(where: { $0.sourceType == .calDAV && $0.title.lowercased().contains("icloud") }) {
            candidates.append(iCloud)
        }
        if let calendar = store.defaultCalendarForNewEvents, let source = calendar.source {
            candidates.append(source)
        }
        if let local = sources.first(where: { $0.sourceType == .local }) {
            candidates.append(local)
        }
        for source in candidates {
            let calendar = EKCalendar(for: .event, eventStore: store)
            calendar.title = title
            calendar.cgColor = UIColor(red: 0.54, green: 0.35, blue: 0.17, alpha: 1).cgColor
            calendar.source = source
            do {
                try store.saveCalendar(calendar, commit: true)
                UserDefaults.standard.set(calendar.calendarIdentifier, forKey: ownCalendarKey)
                return calendar.calendarIdentifier
            } catch {
                // Esa cuenta no deja crear calendarios (Google, por ejemplo): la siguiente.
                continue
            }
        }
        return nil
    }

    /** Deja el calendario como dice `items`. Sin calendario (o uno que no se puede escribir), quita todo lo añadido. */
    static func sync(in store: EKEventStore, calendarId: String?, items: [Item]) -> [String: Any] {
        guard CalendarReader.canRead else { return ["created": 0, "updated": 0, "removed": 0] }
        var links = loadLinks()
        let calendar = calendarId.flatMap { store.calendar(withIdentifier: $0) }.flatMap { $0.allowsContentModifications ? $0 : nil }
        let wanted = calendar == nil ? [] : items
        let wantedIds = Set(wanted.map(\.taskId))
        var created = 0
        var updated = 0
        var removed = 0

        // Fuera lo que ya no toca: tareas tachadas, borradas, sin hora, o en otro calendario.
        for (taskId, link) in links where !wantedIds.contains(taskId) || link.calendarId != calendar?.calendarIdentifier {
            if let event = store.event(withIdentifier: link.eventId) {
                if (try? store.remove(event, span: .thisEvent, commit: false)) != nil { removed += 1 }
            }
            links[taskId] = nil
        }

        if let calendar {
            for item in wanted {
                let fingerprint = Self.fingerprint(item)
                if let link = links[item.taskId], let event = store.event(withIdentifier: link.eventId) {
                    // Igual que la última vez: se deja como esté, aunque se haya tocado en Calendario.
                    guard link.fingerprint != fingerprint else { continue }
                    fill(event, with: item)
                    if (try? store.save(event, span: .thisEvent, commit: false)) != nil {
                        links[item.taskId] = Link(eventId: link.eventId, calendarId: calendar.calendarIdentifier, fingerprint: fingerprint)
                        updated += 1
                    }
                    continue
                }
                // Nuevo (o borrado a mano en Calendario mientras la tarea sigue pendiente).
                let event = EKEvent(eventStore: store)
                event.calendar = calendar
                fill(event, with: item)
                guard (try? store.save(event, span: .thisEvent, commit: true)) != nil, let id = event.eventIdentifier else { continue }
                links[item.taskId] = Link(eventId: id, calendarId: calendar.calendarIdentifier, fingerprint: fingerprint)
                created += 1
            }
        }

        try? store.commit()
        saveLinks(links)
        return ["created": created, "updated": updated, "removed": removed]
    }

    private static func fill(_ event: EKEvent, with item: Item) {
        event.title = item.title
        event.startDate = item.start
        event.endDate = max(item.end, item.start)
        event.isAllDay = false
        event.url = WidgetLink.task(item.taskId)
    }

    private static func fingerprint(_ item: Item) -> String {
        "\(item.title)|\(Int(item.start.timeIntervalSince1970))|\(Int(item.end.timeIntervalSince1970))"
    }

    private static func loadLinks() -> [String: Link] {
        guard let data = UserDefaults.standard.data(forKey: linksKey) else { return [:] }
        return (try? JSONDecoder().decode([String: Link].self, from: data)) ?? [:]
    }

    private static func saveLinks(_ links: [String: Link]) {
        guard let data = try? JSONEncoder().encode(links) else { return }
        UserDefaults.standard.set(data, forKey: linksKey)
    }
}

extension TasksNativePlugin {
    /** Crea (o reutiliza) el calendario «Tasks» para las tareas. */
    @objc func createTasksCalendar(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "Tasks"
        DispatchQueue.global(qos: .userInitiated).async {
            guard CalendarReader.canRead, let id = CalendarExport.ownCalendar(in: CalendarBridge.store, title: title) else {
                call.reject("No se pudo crear el calendario.")
                return
            }
            call.resolve(["id": id])
        }
    }

    /** Las tareas con hora como eventos de `calendarId`; sin él, se quitan las que había. Fuera del hilo principal. */
    @objc func syncTaskEvents(_ call: CAPPluginCall) {
        let calendarId = call.getString("calendarId")
        let items: [CalendarExport.Item] = (call.getArray("events", JSObject.self) ?? []).compactMap { object in
            guard
                let taskId = object["taskId"] as? String,
                let title = object["title"] as? String,
                let start = (object["start"] as? NSNumber)?.doubleValue,
                let end = (object["end"] as? NSNumber)?.doubleValue
            else { return nil }
            return CalendarExport.Item(
                taskId: taskId,
                title: title,
                start: Date(timeIntervalSince1970: start / 1000),
                end: Date(timeIntervalSince1970: end / 1000)
            )
        }
        DispatchQueue.global(qos: .utility).async {
            call.resolve(CalendarExport.sync(in: CalendarBridge.store, calendarId: calendarId, items: items))
        }
    }
}

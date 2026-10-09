import CoreGraphics
import EventKit
import Foundation

/**
 * Lee el calendario del iPhone (EventKit) para la app (`CalendarBridge.swift`) y para el widget de hoy.
 * Solo lee: nunca crea ni cambia nada. Se compila en los dos objetivos. El permiso es el de la app: el
 * widget no lo pide, solo mira si ya está concedido.
 */
enum CalendarReader {
    /** Lo que se pide a la vez, como `MAX_EVENTS` en `src/lib/calendar.ts`. */
    static let maxEvents = 800
    /** Si un calendario no trae color, el mismo gris tostado que `FALLBACK_COLOR`. */
    static let fallbackColor = "#8c7b66"

    /** Hay acceso completo: se pueden leer los eventos ("solo añadir" no deja). */
    static var canRead: Bool {
        EKEventStore.authorizationStatus(for: .event) == .fullAccess
    }

    /** Como lo entiende la web (`CalendarStatus`): `granted`, `prompt` o `denied`. */
    static func status() -> String {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess:
            return "granted"
        case .notDetermined:
            return "prompt"
        default:
            // Negado, restringido o "solo añadir": nada que leer.
            return "denied"
        }
    }

    /**
     * Eventos entre dos instantes, sin los calendarios ocultos ni los cancelados, en orden. Tampoco los que
     * son tareas de Tasks (`CalendarExport.swift`, llevan el enlace a la tarea): ya se ven como tareas.
     */
    static func events(in store: EKEventStore, from: Date, to: Date, hidden: Set<String>) -> [EKEvent] {
        guard canRead, from < to else { return [] }
        let calendars = store.calendars(for: .event).filter { !hidden.contains($0.calendarIdentifier) }
        guard !calendars.isEmpty else { return [] }
        let predicate = store.predicateForEvents(withStart: from, end: to, calendars: calendars)
        return Array(
            store.events(matching: predicate)
                .filter { $0.status != .canceled && $0.url?.scheme != WidgetLink.scheme }
                .sorted { $0.startDate < $1.startDate }
                .prefix(maxEvents)
        )
    }

    /** `#rrggbb` (sRGB) del color de un calendario. */
    static func hex(_ color: CGColor?) -> String {
        guard
            let color,
            let space = CGColorSpace(name: CGColorSpace.sRGB),
            let converted = color.converted(to: space, intent: .defaultIntent, options: nil),
            let parts = converted.components,
            parts.count >= 3
        else { return fallbackColor }
        let channel = { (value: CGFloat) in Int((min(max(value, 0), 1) * 255).rounded()) }
        return String(format: "#%02x%02x%02x", channel(parts[0]), channel(parts[1]), channel(parts[2]))
    }

    /** Milisegundos desde 1970, como `Date.now()` en la web. */
    static func millis(_ date: Date) -> Double {
        (date.timeIntervalSince1970 * 1000).rounded()
    }

    /** Lo que enseña el widget de hoy, con un almacén propio (el widget no tiene el de la app). */
    static func widgetEvents(from: Date, to: Date, hidden: Set<String>) -> [WidgetEvent] {
        events(in: EKEventStore(), from: from, to: to, hidden: hidden).map(WidgetEvent.init)
    }

    /** Clave de una ocurrencia, la misma que `key` en `src/lib/calendar.ts`: id e inicio. */
    static func key(_ event: EKEvent) -> String {
        "\(event.eventIdentifier ?? "")@\(Int64(millis(event.startDate)))"
    }
}

/** Evento para el widget de hoy (`WidgetEvent` en `src/lib/calendar.ts`). */
struct WidgetEvent: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    /** Epoch ms. */
    let start: Double
    let end: Double
    let allDay: Bool
    /** `#rrggbb`. */
    let color: String

    var startDate: Date { Date(timeIntervalSince1970: start / 1000) }
    var endDate: Date { Date(timeIntervalSince1970: end / 1000) }

    /** Hasta cuándo se enseña: uno que no dura nada sigue un minuto (si no, desaparecería al empezar). */
    var shownUntil: Date { end > start ? endDate : startDate.addingTimeInterval(60) }

    /** En curso a esa hora. */
    func isOngoing(at date: Date) -> Bool {
        !allDay && startDate <= date && date < shownUntil
    }

    init(id: String, title: String, start: Double, end: Double, allDay: Bool, color: String) {
        self.id = id
        self.title = title
        self.start = start
        self.end = end
        self.allDay = allDay
        self.color = color
    }

    init(_ event: EKEvent) {
        self.init(
            id: CalendarReader.key(event),
            title: event.title ?? "",
            start: CalendarReader.millis(event.startDate),
            end: CalendarReader.millis(event.endDate ?? event.startDate),
            allDay: event.isAllDay,
            color: CalendarReader.hex(event.calendar?.cgColor)
        )
    }
}

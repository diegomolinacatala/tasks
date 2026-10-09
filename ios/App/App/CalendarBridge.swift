import Capacitor
import EventKit
import EventKitUI
import UIKit
import WidgetKit

/**
 * El calendario del iPhone para la web (`src/lib/platform/calendar.ts`): el permiso, sus calendarios, los
 * eventos de unas fechas y la ficha de uno. Todo de EventKit, en el propio iPhone: nada sale de él.
 */
enum CalendarBridge {
    /** Se rehace al conceder el permiso: uno creado antes podría no ver nada hasta reiniciar la app. */
    private(set) static var store = EKEventStore()
    /** Quien cierra la ficha de un evento; se guarda mientras está abierta (el delegado es `weak`). */
    fileprivate static var closer: EventCloser?

    /** El calendario cambió (en esta app, en Calendario o al sincronizar una cuenta). */
    static func observe(_ onChange: @escaping () -> Void) -> NSObjectProtocol {
        NotificationCenter.default.addObserver(forName: .EKEventStoreChanged, object: nil, queue: .main) { _ in
            onChange()
            // El widget de hoy lee el calendario por su cuenta: que vuelva a leerlo.
            WidgetCenter.shared.reloadTimelines(ofKind: WidgetStore.kind)
        }
    }

    fileprivate static func renewStore() {
        store = EKEventStore()
    }

    /** Los calendarios de todas las cuentas, como los entiende la web (`parseCalendars`). */
    fileprivate static func describeCalendars() -> [[String: Any]] {
        guard CalendarReader.canRead else { return [] }
        return store.calendars(for: .event).map { calendar in
            [
                "id": calendar.calendarIdentifier,
                "title": calendar.title,
                "color": CalendarReader.hex(calendar.cgColor),
                "source": sourceName(calendar),
                "kind": kind(calendar),
                "writable": calendar.allowsContentModifications,
                "own": calendar.calendarIdentifier == CalendarExport.ownCalendarId,
            ]
        }
    }

    fileprivate static func describe(_ event: EKEvent) -> [String: Any] {
        var item: [String: Any] = [
            "id": event.eventIdentifier ?? "",
            "calendarId": event.calendar?.calendarIdentifier ?? "",
            "title": event.title ?? "",
            "start": CalendarReader.millis(event.startDate),
            "end": CalendarReader.millis(event.endDate ?? event.startDate),
            "allDay": event.isAllDay,
            "color": CalendarReader.hex(event.calendar?.cgColor),
        ]
        if let location = event.location, !location.isEmpty { item["location"] = location }
        return item
    }

    /** Una ocurrencia concreta: las de un evento que se repite comparten id y se distinguen por el inicio. */
    fileprivate static func occurrence(id: String, start: Date) -> EKEvent? {
        let from = start.addingTimeInterval(-60)
        let to = start.addingTimeInterval(60 * 60 * 24)
        let predicate = store.predicateForEvents(withStart: from, end: to, calendars: nil)
        let found = store.events(matching: predicate).first { event in
            event.eventIdentifier == id && abs(event.startDate.timeIntervalSince(start)) < 1
        }
        return found ?? store.event(withIdentifier: id)
    }

    /** La cuenta: "iCloud", "Gmail", el correo de Exchange… Vacía para los del iPhone: la web los nombra en su idioma. */
    private static func sourceName(_ calendar: EKCalendar) -> String {
        guard let source = calendar.source, source.sourceType != .local else { return "" }
        return source.title
    }

    private static func kind(_ calendar: EKCalendar) -> String {
        switch calendar.type {
        case .subscription:
            return "subscribed"
        case .birthday:
            return "birthdays"
        default:
            return "calendar"
        }
    }
}

/** Cierra la ficha de Calendario al tocar "OK" (o al borrar el evento desde ella). */
final class EventCloser: NSObject, EKEventViewDelegate {
    func eventViewController(_ controller: EKEventViewController, didCompleteWith action: EKEventViewAction) {
        controller.dismiss(animated: true)
        CalendarBridge.closer = nil
    }
}

extension TasksNativePlugin {
    @objc func calendarStatus(_ call: CAPPluginCall) {
        call.resolve(["status": CalendarReader.status()])
    }

    /** Acceso completo (leer): la primera vez sale el aviso de iOS; después devuelve lo que haya. */
    @objc func requestCalendarAccess(_ call: CAPPluginCall) {
        CalendarBridge.store.requestFullAccessToEvents { granted, _ in
            DispatchQueue.main.async {
                if granted { CalendarBridge.renewStore() }
                call.resolve(["status": CalendarReader.status()])
            }
        }
    }

    @objc func calendars(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            let calendars = CalendarBridge.describeCalendars()
            call.resolve(["calendars": calendars])
        }
    }

    /** Eventos entre `from` y `to` (epoch ms), sin los calendarios de `hidden`. Fuera del hilo principal. */
    @objc func calendarEvents(_ call: CAPPluginCall) {
        guard let from = call.getDouble("from"), let to = call.getDouble("to"), from < to else {
            call.resolve(["events": []])
            return
        }
        let hidden = Set(call.getArray("hidden", String.self) ?? [])
        DispatchQueue.global(qos: .userInitiated).async {
            let events = CalendarReader.events(
                in: CalendarBridge.store,
                from: Date(timeIntervalSince1970: from / 1000),
                to: Date(timeIntervalSince1970: to / 1000),
                hidden: hidden
            )
            call.resolve(["events": events.map(CalendarBridge.describe)])
        }
    }

    /** La ficha del evento de Calendario de iOS, encima de la app: se puede ver entero y editar. */
    @objc func showEvent(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let start = call.getDouble("start") else {
            call.reject("Falta el evento.")
            return
        }
        DispatchQueue.main.async {
            guard
                CalendarReader.canRead,
                let event = CalendarBridge.occurrence(id: id, start: Date(timeIntervalSince1970: start / 1000)),
                let presenter = self.bridge?.viewController,
                presenter.presentedViewController == nil
            else {
                call.reject("No se puede abrir el evento.")
                return
            }
            let closer = EventCloser()
            CalendarBridge.closer = closer
            let viewer = EKEventViewController()
            viewer.event = event
            viewer.allowsEditing = true
            viewer.allowsCalendarPreview = true
            viewer.delegate = closer
            // Por si la ficha no trae el suyo: "OK" a la izquierda la cierra (deslizar hacia abajo, también).
            viewer.navigationItem.leftBarButtonItem = UIBarButtonItem(systemItem: .done, primaryAction: UIAction { [weak viewer] _ in
                viewer?.dismiss(animated: true)
                CalendarBridge.closer = nil
            })
            let navigation = UINavigationController(rootViewController: viewer)
            // El coñac de la app en los botones de la ficha (camel de noche).
            navigation.view.tintColor = UIColor { traits in
                traits.userInterfaceStyle == .dark
                    ? UIColor(red: 0.85, green: 0.71, blue: 0.55, alpha: 1)
                    : UIColor(red: 0.54, green: 0.35, blue: 0.17, alpha: 1)
            }
            presenter.present(navigation, animated: true)
            call.resolve()
        }
    }
}

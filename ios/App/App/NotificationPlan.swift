import CoreLocation
import UserNotifications

/** Plan de avisos de `nativePlan` (`src/lib/nativeSchedule.ts`), como lo calcula `headless.js`. */
struct NotificationPlan: Decodable {
    let timed: [TimedNotification]
    let places: [PlaceAlert]
}

struct TimedNotification: Decodable {
    let id: Int
    /** Epoch en milisegundos. */
    let at: Double
    let title: String
    let body: String
    let extra: [String: String]
    let category: String?
}

/** Aviso al llegar a un lugar o al salir. Lo manda la web (`syncPlaceAlerts`) o `headless.js`. */
struct PlaceAlert: Decodable {
    let id: Int
    let lat: Double
    let lng: Double
    let radius: Double?
    /** `arrive` o `leave`. */
    let on: String?
    let title: String
    let body: String?
    let category: String?
    /** `cap_extra` del aviso: `placeId`, `on` y `taskIds`. */
    let extra: [String: String]?
}

enum PlaceAlerts {
    /** iOS vigila como mucho 20 regiones por app. */
    static let maxRegions = 20
    static let minRadius = 100.0
    static let maxRadius = 1000.0

    /**
     * Sustituye los avisos por lugar pendientes por estos. Uno por lugar y sentido (llegar o salir),
     * con todas sus tareas en el cuerpo. Los que no han cambiado no se tocan: volver a añadir una
     * región estando dentro podría hacer sonar el aviso otra vez.
     */
    static func sync(_ alerts: [PlaceAlert]) async -> (scheduled: Int, changed: Int) {
        let requests = Array(alerts.compactMap(request(for:)).prefix(maxRegions))
        let center = UNUserNotificationCenter.current()
        let placePending = await center.pendingNotificationRequests().filter { $0.trigger is UNLocationNotificationTrigger }

        let wanted = Set(requests.map(\.identifier))
        center.removePendingNotificationRequests(withIdentifiers: placePending.map(\.identifier).filter { !wanted.contains($0) })

        let changed = requests.filter { request in
            !placePending.contains { sameAlert($0, request) }
        }
        var failed = 0
        for request in changed {
            do {
                try await center.add(request)
            } catch {
                failed += 1
            }
        }
        return (requests.count - failed, changed.count)
    }

    /** El id es numérico: así el plugin de notificaciones locales entrega el toque a la web. */
    static func request(for alert: PlaceAlert) -> UNNotificationRequest? {
        let coordinate = CLLocationCoordinate2D(latitude: alert.lat, longitude: alert.lng)
        guard CLLocationCoordinate2DIsValid(coordinate) else { return nil }

        let radius = min(max(alert.radius ?? minRadius, minRadius), maxRadius)
        let leaving = alert.on == "leave"
        let region = CLCircularRegion(center: coordinate, radius: radius, identifier: "tasks-place-\(alert.id)")
        region.notifyOnEntry = !leaving
        region.notifyOnExit = leaving

        let content = UNMutableNotificationContent()
        content.title = alert.title
        content.body = alert.body ?? ""
        content.sound = .default
        content.threadIdentifier = "tasks-places"
        if let category = alert.category {
            content.categoryIdentifier = category
        }
        // Solo texto: `userInfo` tiene que poder guardarse como property list.
        if let extra = alert.extra {
            content.userInfo = ["cap_extra": extra]
        }
        // Se repite: suena cada vez que llegas mientras la tarea siga pendiente.
        let trigger = UNLocationNotificationTrigger(region: region, repeats: true)
        return UNNotificationRequest(identifier: String(alert.id), content: content, trigger: trigger)
    }

    private static func sameAlert(_ current: UNNotificationRequest, _ next: UNNotificationRequest) -> Bool {
        guard
            current.identifier == next.identifier,
            let currentRegion = (current.trigger as? UNLocationNotificationTrigger)?.region as? CLCircularRegion,
            let nextRegion = (next.trigger as? UNLocationNotificationTrigger)?.region as? CLCircularRegion
        else { return false }
        return current.content.title == next.content.title
            && current.content.body == next.content.body
            && current.content.categoryIdentifier == next.content.categoryIdentifier
            && currentRegion.center.latitude == nextRegion.center.latitude
            && currentRegion.center.longitude == nextRegion.center.longitude
            && currentRegion.radius == nextRegion.radius
            && currentRegion.notifyOnEntry == nextRegion.notifyOnEntry
            && NSDictionary(dictionary: current.content.userInfo).isEqual(to: next.content.userInfo)
    }
}

/**
 * Deja programado exactamente el plan, como `applyPlan` (`src/lib/platform/notifications.ts`) cuando
 * la web no está: lo usa Siri al apuntar una tarea con la app cerrada. La web vuelve a aplicar el
 * suyo al abrirse, con los mismos ids para lo que no haya cambiado.
 */
enum NotificationPlanner {
    /** `PLACE_ID_BASE`: por debajo, avisos por hora; desde aquí, de lugar. */
    private static let placeIdBase = 1_000_000_000

    static func apply(_ plan: NotificationPlan, now: Date = Date()) async {
        let center = UNUserNotificationCenter.current()
        let status = await center.notificationSettings().authorizationStatus
        // Sin permiso no se puede programar nada; la web lo pedirá cuando haga falta.
        guard status == .authorized || status == .provisional || status == .ephemeral else { return }

        // Primero se libera hueco: iOS descarta en silencio lo que pase de 64 pendientes.
        let wanted = Set(plan.timed.map { String($0.id) })
        let stale = await center.pendingNotificationRequests()
            .map(\.identifier)
            .filter { (Int($0) ?? -1) < placeIdBase && !wanted.contains($0) }
        center.removePendingNotificationRequests(withIdentifiers: stale)

        _ = await PlaceAlerts.sync(plan.places)

        for notification in plan.timed {
            guard let request = request(for: notification, now: now) else { continue }
            // Mismo id = sustituye. Si iOS lo rechaza, la web lo reprograma al abrirse.
            try? await center.add(request)
        }
    }

    /** Igual que los programa el plugin de notificaciones locales: su delegado entrega el toque a la web. */
    private static func request(for notification: TimedNotification, now: Date) -> UNNotificationRequest? {
        let at = Date(timeIntervalSince1970: notification.at / 1000)
        let interval = at.timeIntervalSince(now)
        guard interval > 0 else { return nil }

        let content = UNMutableNotificationContent()
        content.title = notification.title
        content.body = notification.body
        let schedule: [String: Any] = ["at": at, "allowWhileIdle": true]
        content.userInfo = ["cap_schedule": schedule, "cap_extra": notification.extra]
        if let category = notification.category {
            content.categoryIdentifier = category
        }
        content.threadIdentifier = (notification.extra["taskId"] ?? "").isEmpty ? "tasks-digest" : "tasks"

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        return UNNotificationRequest(identifier: String(notification.id), content: content, trigger: trigger)
    }
}

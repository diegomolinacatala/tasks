import Capacitor
import CoreLocation
import MapKit
import UIKit
import UserNotifications
import WidgetKit

/// Lo que la web no puede hacer sola: avisos al llegar o salir de un lugar, buscar sitios,
/// la ubicación actual, el número del icono, abrir los ajustes de la app y el widget.
@objc(TasksNativePlugin)
public class TasksNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TasksNativePlugin"
    public let jsName = "TasksNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setBadge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "locationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestLocationPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentPosition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "searchPlaces", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncPlaceAlerts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncWidget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "widgetChanges", returnType: CAPPluginReturnPromise),
    ]

    /// iOS vigila como mucho 20 regiones por app.
    private static let maxRegions = 20
    private static let minRadius = 100.0
    private static let maxRadius = 1000.0
    private static let searchSpanMeters = 30_000.0
    private static let maxResults = 10

    private lazy var location = LocationRequester()

    override public func load() {
        NativeActions.shared.attach(self)
    }

    /// `retainUntilConsumed`: si la web aún no escucha, el evento espera a que lo haga.
    func deliver(_ action: [String: Any]) {
        notifyListeners("action", data: action, retainUntilConsumed: true)
    }

    @objc func setBadge(_ call: CAPPluginCall) {
        let count = max(0, call.getInt("count") ?? 0)
        UNUserNotificationCenter.current().setBadgeCount(count) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("No se pueden abrir los ajustes.")
                return
            }
            UIApplication.shared.open(url) { _ in call.resolve() }
        }
    }

    @objc func locationStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["status": Self.describe(self.location.status)])
        }
    }

    @objc func requestLocationPermission(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.location.requestAuthorization { status in
                call.resolve(["status": Self.describe(status)])
            }
        }
    }

    @objc func currentPosition(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.location.requestLocation { result in
                switch result {
                case .success(let position):
                    call.resolve([
                        "lat": position.coordinate.latitude,
                        "lng": position.coordinate.longitude,
                        "accuracy": position.horizontalAccuracy,
                    ])
                case .failure(let error):
                    call.reject(error.localizedDescription)
                }
            }
        }
    }

    /// Búsqueda de Apple Maps alrededor de un punto: "Mercadona" devuelve los más cercanos.
    @objc func searchPlaces(_ call: CAPPluginCall) {
        let query = (call.getString("query") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else {
            call.resolve(["results": []])
            return
        }
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        request.resultTypes = [.pointOfInterest, .address]
        if let lat = call.getDouble("lat"), let lng = call.getDouble("lng") {
            request.region = MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: lat, longitude: lng),
                latitudinalMeters: Self.searchSpanMeters,
                longitudinalMeters: Self.searchSpanMeters
            )
        }
        DispatchQueue.main.async {
            MKLocalSearch(request: request).start { response, error in
                if let error = error {
                    let nsError = error as NSError
                    // Sin resultados no es un fallo.
                    if nsError.domain == MKErrorDomain && nsError.code == Int(MKError.Code.placemarkNotFound.rawValue) {
                        call.resolve(["results": []])
                    } else {
                        call.reject(error.localizedDescription)
                    }
                    return
                }
                let items = (response?.mapItems ?? []).prefix(Self.maxResults)
                let results: [[String: Any]] = items.map { item in
                    let coordinate = item.placemark.coordinate
                    return [
                        "name": item.name ?? query,
                        "address": item.placemark.title ?? "",
                        "lat": coordinate.latitude,
                        "lng": coordinate.longitude,
                    ]
                }
                call.resolve(["results": results])
            }
        }
    }

    /**
     * Sustituye los avisos por lugar pendientes por los recibidos. Uno por lugar y sentido
     * (llegar o salir), con todas sus tareas en el cuerpo. Los que no han cambiado no se tocan:
     * volver a añadir una región estando dentro podría hacer sonar el aviso otra vez.
     */
    @objc func syncPlaceAlerts(_ call: CAPPluginCall) {
        let alerts = call.getArray("alerts", JSObject.self) ?? []
        let requests = Array(alerts.compactMap(Self.request(from:)).prefix(Self.maxRegions))
        let center = UNUserNotificationCenter.current()

        center.getPendingNotificationRequests { pending in
            let placePending = pending.filter { $0.trigger is UNLocationNotificationTrigger }
            let wanted = Set(requests.map(\.identifier))
            let stale = placePending.map(\.identifier).filter { !wanted.contains($0) }
            center.removePendingNotificationRequests(withIdentifiers: stale)

            let changed = requests.filter { request in
                !placePending.contains { Self.sameAlert($0, request) }
            }
            let group = DispatchGroup()
            let lock = NSLock()
            var failed = 0
            for request in changed {
                group.enter()
                center.add(request) { error in
                    if error != nil {
                        lock.lock()
                        failed += 1
                        lock.unlock()
                    }
                    group.leave()
                }
            }
            group.notify(queue: .main) {
                call.resolve(["scheduled": requests.count - failed, "changed": changed.count])
            }
        }
    }

    /// Foto de las tareas para el widget. La web solo la manda cuando ha cambiado.
    @objc func syncWidget(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else {
            call.reject("Falta la foto del widget.")
            return
        }
        do {
            try WidgetStore.saveSnapshot(json)
            WidgetCenter.shared.reloadTimelines(ofKind: WidgetStore.kind)
            call.resolve()
        } catch {
            call.reject("No se pudo guardar la foto del widget.")
        }
    }

    /// Lo marcado desde el widget desde la última lectura. Se vacía al leerlo.
    @objc func widgetChanges(_ call: CAPPluginCall) {
        let pending = WidgetStore.takeChanges()
        let changes: [[String: Any]] = pending.done.map { ["taskId": $0.key, "done": $0.value] }
        call.resolve(["changes": changes, "reschedule": pending.reschedule])
    }

    private static func describe(_ status: CLAuthorizationStatus) -> String {
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            return "granted"
        case .notDetermined:
            return "prompt"
        case .denied, .restricted:
            return "denied"
        @unknown default:
            return "denied"
        }
    }

    private static func number(_ value: JSValue?) -> NSNumber? {
        value as? NSNumber
    }

    /// El id es numérico: así el plugin de notificaciones locales entrega el toque a la web.
    private static func request(from alert: JSObject) -> UNNotificationRequest? {
        guard
            let id = number(alert["id"])?.intValue,
            let lat = number(alert["lat"])?.doubleValue,
            let lng = number(alert["lng"])?.doubleValue,
            let title = alert["title"] as? String
        else { return nil }
        let coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lng)
        guard CLLocationCoordinate2DIsValid(coordinate) else { return nil }

        let radius = min(max(number(alert["radius"])?.doubleValue ?? minRadius, minRadius), maxRadius)
        let leaving = (alert["on"] as? String) == "leave"
        let region = CLCircularRegion(center: coordinate, radius: radius, identifier: "tasks-place-\(id)")
        region.notifyOnEntry = !leaving
        region.notifyOnExit = leaving

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = alert["body"] as? String ?? ""
        content.sound = .default
        content.threadIdentifier = "tasks-places"
        if let category = alert["category"] as? String {
            content.categoryIdentifier = category
        }
        // Solo texto: `userInfo` tiene que poder guardarse como property list.
        if let extra = (alert["extra"] as? JSObject)?.compactMapValues({ $0 as? String }) {
            content.userInfo = ["cap_extra": extra]
        }
        // Se repite: suena cada vez que llegas mientras la tarea siga pendiente.
        let trigger = UNLocationNotificationTrigger(region: region, repeats: true)
        return UNNotificationRequest(identifier: String(id), content: content, trigger: trigger)
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

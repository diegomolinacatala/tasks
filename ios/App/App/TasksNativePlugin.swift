import Capacitor
import CoreLocation
import MapKit
import UIKit
import UserNotifications
import WidgetKit

/// Lo que la web no puede hacer sola: avisos al llegar o salir de un lugar, buscar sitios,
/// la ubicación actual, el número del icono, abrir los ajustes de la app, el widget y la bandeja
/// de lo apuntado con Siri o Atajos.
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
        CAPPluginMethod(name: "inbox", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ackInbox", returnType: CAPPluginReturnPromise),
    ]

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

    /// Sustituye los avisos por lugar pendientes por los recibidos (`PlaceAlerts.sync`).
    @objc func syncPlaceAlerts(_ call: CAPPluginCall) {
        let alerts = (call.getArray("alerts", JSObject.self) ?? []).compactMap(Self.alert(from:))
        Task {
            let result = await PlaceAlerts.sync(alerts)
            call.resolve(["scheduled": result.scheduled, "changed": result.changed])
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

    /// Lo apuntado con Siri o Atajos sin abrir la app. No se vacía al leerlo: ver `ackInbox`.
    @objc func inbox(_ call: CAPPluginCall) {
        do {
            let entries = try InboxStore.entries()
            call.resolve(["entries": entries])
        } catch {
            call.reject("No se pudo leer la bandeja.")
        }
    }

    /// La web ya tiene en su fichero de estado lo de estas entradas: salen de la bandeja.
    @objc func ackInbox(_ call: CAPPluginCall) {
        let ids = Set(call.getArray("ids", String.self) ?? [])
        do {
            try InboxStore.remove(ids: ids)
            call.resolve()
        } catch {
            call.reject("No se pudo vaciar la bandeja.")
        }
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

    private static func alert(from object: JSObject) -> PlaceAlert? {
        guard
            let id = number(object["id"])?.intValue,
            let lat = number(object["lat"])?.doubleValue,
            let lng = number(object["lng"])?.doubleValue,
            let title = object["title"] as? String
        else { return nil }
        return PlaceAlert(
            id: id,
            lat: lat,
            lng: lng,
            radius: number(object["radius"])?.doubleValue,
            on: object["on"] as? String,
            title: title,
            body: object["body"] as? String,
            category: object["category"] as? String,
            extra: (object["extra"] as? JSObject)?.compactMapValues { $0 as? String }
        )
    }
}

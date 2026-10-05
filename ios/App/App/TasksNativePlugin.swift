import Capacitor
import CoreLocation
import MapKit
import UIKit
import UserNotifications
import WebKit
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
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "mapSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "screenshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickLocation", returnType: CAPPluginReturnPromise),
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
            WidgetCenter.shared.reloadAllTimelines()
            call.resolve()
        } catch {
            call.reject("No se pudo guardar la foto del widget.")
        }
    }

    /// Lo marcado desde los widgets (tareas y rutinas) desde la última lectura. Se vacía al leerlo.
    @objc func widgetChanges(_ call: CAPPluginCall) {
        let pending = WidgetStore.takeChanges()
        call.resolve(["changes": WidgetStore.describe(pending), "reschedule": pending.reschedule])
    }

    /// Apariencia de la ventana: `light` y `dark` la fijan; `auto` deja que siga a iOS. Decide cómo
    /// salen la rueda de la hora, el teclado y los menús. Se recuerda para el próximo arranque.
    @objc func setAppearance(_ call: CAPPluginCall) {
        let name = call.getString("style") ?? "auto"
        UserDefaults.standard.set(name, forKey: Self.appearanceKey)
        DispatchQueue.main.async {
            let style = Self.interfaceStyle(name)
            let windows = self.bridge?.viewController?.view.window?.windowScene?.windows ?? []
            windows.forEach { $0.overrideUserInterfaceStyle = style }
            call.resolve()
        }
    }

    static let appearanceKey = "tasks.appearance"

    static func interfaceStyle(_ name: String?) -> UIUserInterfaceStyle {
        switch name {
        case "light":
            return .light
        case "dark":
            return .dark
        default:
            return .unspecified
        }
    }

    /// Foto de Apple Maps para la pestaña Lugares: estilo apagado, sin comercios, en el tema de la
    /// app. Con `center` y `span` (metros de norte a sur) se centra ahí; si no, encuadra `points`.
    /// Devuelve la imagen y dónde cae cada punto, de 0 a 1, para pintar encima las chinchetas.
    @objc func mapSnapshot(_ call: CAPPluginCall) {
        let points: [CLLocationCoordinate2D] = (call.getArray("points", JSObject.self) ?? []).compactMap { object in
            guard let lat = Self.number(object["lat"])?.doubleValue, let lng = Self.number(object["lng"])?.doubleValue else { return nil }
            let coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lng)
            // MapKit lanza una excepción (que no se puede capturar) con una región inválida.
            return CLLocationCoordinate2DIsValid(coordinate) ? coordinate : nil
        }
        let width = min(max(call.getDouble("width") ?? 320, 40), 1200)
        let height = min(max(call.getDouble("height") ?? 200, 40), 1200)
        let dark = call.getBool("dark") ?? false

        let region: MKCoordinateRegion
        if let center = call.getObject("center"),
           let lat = Self.number(center["lat"])?.doubleValue,
           let lng = Self.number(center["lng"])?.doubleValue {
            let span = min(max(call.getDouble("span") ?? 1000, 200), 50_000)
            region = MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: lat, longitude: lng),
                latitudinalMeters: span,
                longitudinalMeters: span * width / height
            )
        } else if !points.isEmpty {
            region = Self.region(fitting: points, aspect: width / height)
        } else {
            call.reject("No hay nada que enseñar en el mapa.")
            return
        }

        let configuration = MKStandardMapConfiguration(elevationStyle: .flat, emphasisStyle: .muted)
        configuration.pointOfInterestFilter = .excludingAll
        let options = MKMapSnapshotter.Options()
        options.region = region
        options.size = CGSize(width: width, height: height)
        options.preferredConfiguration = configuration

        DispatchQueue.main.async {
            let scale = self.bridge?.viewController?.traitCollection.displayScale ?? 3
            options.traitCollection = UITraitCollection(traitsFrom: [
                UITraitCollection(displayScale: scale),
                UITraitCollection(userInterfaceStyle: dark ? .dark : .light),
            ])
            MKMapSnapshotter(options: options).start { snapshot, error in
                guard let snapshot, let data = snapshot.image.jpegData(compressionQuality: 0.82) else {
                    call.reject(error?.localizedDescription ?? "No se pudo hacer el mapa.")
                    return
                }
                let placed: [[String: Double]] = points.map { coordinate in
                    let point = snapshot.point(for: coordinate)
                    return ["x": Double(point.x) / width, "y": Double(point.y) / height]
                }
                call.resolve(["image": "data:image/jpeg;base64," + data.base64EncodedString(), "points": placed])
            }
        }
    }

    /// Encuadre con todos los puntos, con aire alrededor (las chinchetas suben por encima de su
    /// punto) y la forma de la foto. Un solo punto, o todos juntos, enseña un barrio.
    private static func region(fitting points: [CLLocationCoordinate2D], aspect: Double) -> MKCoordinateRegion {
        // Rectángulos de un punto, no vacíos: un rectángulo sin tamaño podría dar una región inválida.
        var rect = MKMapRect(origin: MKMapPoint(points[0]), size: MKMapSize(width: 1, height: 1))
        for coordinate in points.dropFirst() {
            let point = MKMapPoint(coordinate)
            rect = rect.union(MKMapRect(x: point.x, y: point.y, width: 1, height: 1))
        }
        let minimum = MKMapPointsPerMeterAtLatitude(points[0].latitude) * 900
        var width = max(rect.size.width * 1.5, minimum)
        var height = max(rect.size.height * 1.9, minimum)
        if width / height < aspect {
            width = height * aspect
        } else {
            height = width / aspect
        }
        // Los puntos, algo por encima del centro: abajo van sus nombres y el buscador flota sobre el borde.
        let fitted = MKMapRect(x: rect.midX - width / 2, y: rect.midY - height * 0.42, width: width, height: height)
        return MKCoordinateRegion(fitted)
    }

    /// Foto de lo que enseña la app ahora mismo, para las sugerencias: quien la manda rodea encima lo que
    /// quiere comentar. Es la del WebView (la web no puede fotografiarse a sí misma), a la escala de la pantalla.
    @objc func screenshot(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else {
                call.reject("No hay nada que fotografiar.")
                return
            }
            let configuration = WKSnapshotConfiguration()
            configuration.afterScreenUpdates = true
            webView.takeSnapshot(with: configuration) { image, error in
                guard let image, let data = image.jpegData(compressionQuality: 0.85) else {
                    call.reject(error?.localizedDescription ?? "No se pudo hacer la foto.")
                    return
                }
                call.resolve(["image": "data:image/jpeg;base64," + data.base64EncodedString()])
            }
        }
    }

    /// Mapa a pantalla completa para atinar dónde está un lugar (`MapPicker.swift`): devuelve el punto, su
    /// dirección y, si se tocó un comercio del mapa, su nombre; o `cancelled` si se cerró sin elegir.
    @objc func pickLocation(_ call: CAPPluginCall) {
        let center: CLLocationCoordinate2D? = call.getObject("center").flatMap { (object: JSObject) -> CLLocationCoordinate2D? in
            guard let lat = Self.number(object["lat"])?.doubleValue, let lng = Self.number(object["lng"])?.doubleValue else { return nil }
            let coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lng)
            return CLLocationCoordinate2DIsValid(coordinate) ? coordinate : nil
        }
        let places: [MapPickerOptions.Place] = (call.getArray("places", JSObject.self) ?? []).compactMap { (object: JSObject) -> MapPickerOptions.Place? in
            guard
                let name = object["name"] as? String,
                let lat = Self.number(object["lat"])?.doubleValue,
                let lng = Self.number(object["lng"])?.doubleValue
            else { return nil }
            let coordinate = CLLocationCoordinate2D(latitude: lat, longitude: lng)
            guard CLLocationCoordinate2DIsValid(coordinate) else { return nil }
            let radius = min(max(Self.number(object["radius"])?.doubleValue ?? 150, 50), 2000)
            return MapPickerOptions.Place(name: name, coordinate: coordinate, radius: radius)
        }
        let options = MapPickerOptions(
            title: call.getString("title") ?? "",
            confirm: call.getString("confirm") ?? "OK",
            cancel: call.getString("cancel") ?? "",
            locate: call.getString("locate") ?? "",
            center: center,
            radius: min(max(call.getDouble("radius") ?? 150, 50), 2000),
            places: places
        )
        DispatchQueue.main.async {
            // Ya hay algo encima (otro mapa abierto con un doble toque): este no se abre.
            guard let presenter = self.bridge?.viewController, presenter.presentedViewController == nil else {
                call.reject("No se puede abrir el mapa.")
                return
            }
            let picker = MapPickerViewController(options: options) { picked in
                guard let picked else {
                    call.resolve(["cancelled": true])
                    return
                }
                var result: [String: Any] = [
                    "lat": picked.coordinate.latitude,
                    "lng": picked.coordinate.longitude,
                    "address": picked.address,
                ]
                if let name = picked.name { result["name"] = name }
                call.resolve(result)
            }
            presenter.present(picker, animated: true)
        }
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

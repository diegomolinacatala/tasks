import CoreLocation

enum LocationError: LocalizedError {
    case denied

    var errorDescription: String? { "Sin permiso de ubicación." }
}

/// `CLLocationManager` con callbacks. Solo se usa desde el hilo principal, que es donde el
/// gestor entrega sus eventos.
final class LocationRequester: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var authorizationWaiters: [(CLAuthorizationStatus) -> Void] = []
    private var locationWaiters: [(Result<CLLocation, Error>) -> Void] = []

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    var status: CLAuthorizationStatus { manager.authorizationStatus }

    /// Solo "mientras se usa": los avisos por lugar los vigila el sistema sin permiso "siempre".
    func requestAuthorization(_ done: @escaping (CLAuthorizationStatus) -> Void) {
        guard status == .notDetermined else {
            done(status)
            return
        }
        authorizationWaiters.append(done)
        manager.requestWhenInUseAuthorization()
    }

    func requestLocation(_ done: @escaping (Result<CLLocation, Error>) -> Void) {
        requestAuthorization { [weak self] status in
            guard let self = self else { return }
            guard status == .authorizedWhenInUse || status == .authorizedAlways else {
                done(.failure(LocationError.denied))
                return
            }
            self.locationWaiters.append(done)
            // Una sola petición en curso: las demás esperan a su resultado.
            if self.locationWaiters.count == 1 { self.manager.requestLocation() }
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        // El gestor avisa también al crearse; solo interesa la respuesta del usuario.
        guard status != .notDetermined, !authorizationWaiters.isEmpty else { return }
        let waiters = authorizationWaiters
        authorizationWaiters = []
        waiters.forEach { $0(status) }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        finish(.success(location))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finish(.failure(error))
    }

    private func finish(_ result: Result<CLLocation, Error>) {
        let waiters = locationWaiters
        locationWaiters = []
        waiters.forEach { $0(result) }
    }
}

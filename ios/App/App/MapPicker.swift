import CoreLocation
import MapKit
import UIKit

/// El punto elegido en el mapa, con su dirección y, si se tocó un comercio del mapa, su nombre.
struct PickedLocation {
    let coordinate: CLLocationCoordinate2D
    let address: String
    let name: String?
}

/// Lo que necesita el mapa para elegir un sitio. Los textos llegan de la web, en el idioma de la app.
struct MapPickerOptions {
    struct Place {
        let name: String
        let coordinate: CLLocationCoordinate2D
        let radius: CLLocationDistance
    }

    let title: String
    let confirm: String
    let cancel: String
    let locate: String
    let center: CLLocationCoordinate2D?
    let radius: CLLocationDistance
    let places: [Place]
}

/// Los colores de `tokens.css` en los dos temas: papel marfil, tinta marino y coñac (de noche, azul
/// medianoche, marfil y camel).
private enum Ink {
    static let paper = dynamic(light: 0xFBF8F2, dark: 0x1A2236)
    static let text = dynamic(light: 0x1B2540, dark: 0xECE4D4)
    static let text2 = dynamic(light: 0x5A544A, dark: 0xBAB1A1)
    static let accent = dynamic(light: 0x8A5A2C, dark: 0xD9B48C)
    static let primary = dynamic(light: 0x1B2540, dark: 0xE9E0CD)
    static let onPrimary = dynamic(light: 0xF7F2E8, dark: 0x141A2B)

    static func dynamic(light: UInt32, dark: UInt32) -> UIColor {
        UIColor { traits in color(traits.userInterfaceStyle == .dark ? dark : light) }
    }

    static func color(_ hex: UInt32) -> UIColor {
        UIColor(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }

    static func serif(_ size: CGFloat, weight: UIFont.Weight = .regular) -> UIFont {
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        guard let descriptor = base.fontDescriptor.withDesign(.serif) else { return base }
        return UIFont(descriptor: descriptor, size: size)
    }
}

/// Mapa de Apple a pantalla completa para atinar dónde está un lugar: se arrastra el mapa bajo una
/// chincheta fija (o se toca un punto, o un comercio del propio mapa, que además da su nombre) y el
/// círculo enseña el radio del aviso. Los demás lugares salen con el suyo, para orientarse.
final class MapPickerViewController: UIViewController, MKMapViewDelegate {
    private let options: MapPickerOptions
    private var completion: ((PickedLocation?) -> Void)?

    private let mapView = MKMapView()
    private let ring = UIView()
    private let pin = UIView()
    private let pinShadow = UIView()
    private let pinHead = UIView()
    private let card = UIView()
    private let addressLabel = UILabel()
    private let confirmButton = UIButton(type: .system)
    private let closeButton = UIButton(type: .system)
    private let locateButton = UIButton(type: .system)
    private let titleLabel = UILabel()
    private let titleBox = UIView()
    private var ringSize: NSLayoutConstraint?

    private let geocoder = CLGeocoder()
    private let location = LocationRequester()
    private var geocodeWork: DispatchWorkItem?
    private var address = ""
    /// Nombre del comercio tocado en el mapa, mientras el centro siga en él.
    private var feature: (name: String, coordinate: CLLocationCoordinate2D)?
    /// Se ha movido el mapa a mano: la ubicación actual que llegue tarde ya no lo recoloca.
    private var moved = false
    /// Cuándo se tocó por última vez una chincheta o un comercio: ese toque no es "llevar la chincheta aquí".
    private var selectedAt = Date.distantPast
    /// Cuándo empezó a moverse el mapa por última vez: un toque seguido de eso era el doble toque del zoom.
    private var regionChangedAt = Date.distantPast
    /// El primer encuadre ya está hecho.
    private var placed = false

    private static let minimumSpan: CLLocationDistance = 600
    private static let featureTolerance: CLLocationDistance = 20

    init(options: MapPickerOptions, completion: @escaping (PickedLocation?) -> Void) {
        self.options = options
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) no se usa")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Ink.paper
        setUpMap()
        setUpPin()
        setUpChrome()
        showPlaces()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        // El encuadre, cuando el mapa ya tiene su tamaño (antes, MapKit no sabe qué zoom poner).
        if !placed, !mapView.bounds.isEmpty {
            placed = true
            placeCamera()
        }
        // Los colores de las capas no siguen solos al tema: se resuelven con el de ahora.
        ring.layer.borderColor = Ink.accent.resolvedColor(with: traitCollection).withAlphaComponent(0.6).cgColor
        pinHead.layer.borderColor = Ink.paper.resolvedColor(with: traitCollection).cgColor
        updateRing()
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        view.setNeedsLayout()
    }

    // MARK: - Montaje

    private func setUpMap() {
        mapView.translatesAutoresizingMaskIntoConstraints = false
        mapView.delegate = self
        mapView.preferredConfiguration = MKStandardMapConfiguration(elevationStyle: .flat, emphasisStyle: .muted)
        // Los comercios del mapa se pueden tocar: llevan la chincheta y dan su nombre.
        mapView.selectableMapFeatures = [.pointsOfInterest]
        mapView.pointOfInterestFilter = .includingAll
        mapView.showsCompass = false
        mapView.register(MKMarkerAnnotationView.self, forAnnotationViewWithReuseIdentifier: "place")
        view.addSubview(mapView)
        NSLayoutConstraint.activate([
            mapView.topAnchor.constraint(equalTo: view.topAnchor),
            mapView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            mapView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            mapView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        tap.cancelsTouchesInView = false
        mapView.addGestureRecognizer(tap)

        if isAuthorized { mapView.showsUserLocation = true }
    }

    private func setUpPin() {
        ring.translatesAutoresizingMaskIntoConstraints = false
        ring.isUserInteractionEnabled = false
        ring.backgroundColor = Ink.accent.withAlphaComponent(0.12)
        ring.layer.borderWidth = 1.5
        view.addSubview(ring)
        let size = ring.widthAnchor.constraint(equalToConstant: 0)
        ringSize = size
        NSLayoutConstraint.activate([
            size,
            ring.heightAnchor.constraint(equalTo: ring.widthAnchor),
            ring.centerXAnchor.constraint(equalTo: mapView.centerXAnchor),
            ring.centerYAnchor.constraint(equalTo: mapView.centerYAnchor),
        ])

        // La sombra se queda en el suelo; la chincheta sube mientras se arrastra el mapa.
        pinShadow.translatesAutoresizingMaskIntoConstraints = false
        pinShadow.isUserInteractionEnabled = false
        pinShadow.backgroundColor = UIColor.black.withAlphaComponent(0.25)
        pinShadow.layer.cornerRadius = 2.5
        view.addSubview(pinShadow)

        pin.translatesAutoresizingMaskIntoConstraints = false
        pin.isUserInteractionEnabled = false
        view.addSubview(pin)

        let stem = UIView()
        stem.translatesAutoresizingMaskIntoConstraints = false
        stem.backgroundColor = Ink.text
        stem.layer.cornerRadius = 1.25
        pin.addSubview(stem)

        let head = pinHead
        head.translatesAutoresizingMaskIntoConstraints = false
        head.backgroundColor = Ink.accent
        head.layer.cornerRadius = 13
        head.layer.borderWidth = 2.5
        head.layer.shadowColor = UIColor.black.cgColor
        head.layer.shadowOpacity = 0.25
        head.layer.shadowRadius = 4
        head.layer.shadowOffset = CGSize(width: 0, height: 2)
        pin.addSubview(head)

        let dot = UIView()
        dot.translatesAutoresizingMaskIntoConstraints = false
        dot.backgroundColor = Ink.paper
        dot.layer.cornerRadius = 4
        head.addSubview(dot)

        NSLayoutConstraint.activate([
            pin.widthAnchor.constraint(equalToConstant: 26),
            pin.heightAnchor.constraint(equalToConstant: 40),
            pin.centerXAnchor.constraint(equalTo: mapView.centerXAnchor),
            pin.bottomAnchor.constraint(equalTo: mapView.centerYAnchor),
            head.topAnchor.constraint(equalTo: pin.topAnchor),
            head.centerXAnchor.constraint(equalTo: pin.centerXAnchor),
            head.widthAnchor.constraint(equalToConstant: 26),
            head.heightAnchor.constraint(equalToConstant: 26),
            dot.centerXAnchor.constraint(equalTo: head.centerXAnchor),
            dot.centerYAnchor.constraint(equalTo: head.centerYAnchor),
            dot.widthAnchor.constraint(equalToConstant: 8),
            dot.heightAnchor.constraint(equalToConstant: 8),
            stem.topAnchor.constraint(equalTo: head.bottomAnchor, constant: -2),
            stem.bottomAnchor.constraint(equalTo: pin.bottomAnchor),
            stem.centerXAnchor.constraint(equalTo: pin.centerXAnchor),
            stem.widthAnchor.constraint(equalToConstant: 2.5),
            pinShadow.centerXAnchor.constraint(equalTo: mapView.centerXAnchor),
            pinShadow.centerYAnchor.constraint(equalTo: mapView.centerYAnchor),
            pinShadow.widthAnchor.constraint(equalToConstant: 12),
            pinShadow.heightAnchor.constraint(equalToConstant: 5),
        ])
    }

    private func setUpChrome() {
        float(closeButton, symbol: "xmark", label: options.cancel, action: #selector(cancel))
        float(locateButton, symbol: "location", label: options.locate, action: #selector(locate))

        titleBox.translatesAutoresizingMaskIntoConstraints = false
        titleBox.backgroundColor = Ink.paper
        titleBox.layer.cornerRadius = 22
        lift(titleBox)
        view.addSubview(titleBox)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = options.title
        titleLabel.font = Ink.serif(19)
        titleLabel.textColor = Ink.text
        titleLabel.lineBreakMode = .byTruncatingTail
        titleBox.addSubview(titleLabel)

        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = Ink.paper
        card.layer.cornerRadius = 24
        lift(card)
        view.addSubview(card)

        addressLabel.translatesAutoresizingMaskIntoConstraints = false
        addressLabel.font = UIFont.systemFont(ofSize: 15)
        addressLabel.textColor = Ink.text2
        addressLabel.numberOfLines = 2
        addressLabel.text = " "
        card.addSubview(addressLabel)

        confirmButton.translatesAutoresizingMaskIntoConstraints = false
        confirmButton.setTitle(options.confirm, for: .normal)
        confirmButton.titleLabel?.font = UIFont.systemFont(ofSize: 17, weight: .semibold)
        confirmButton.setTitleColor(Ink.onPrimary, for: .normal)
        confirmButton.backgroundColor = Ink.primary
        confirmButton.layer.cornerRadius = 25
        confirmButton.addTarget(self, action: #selector(confirm), for: .touchUpInside)
        card.addSubview(confirmButton)

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: guide.topAnchor, constant: 8),
            closeButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            titleBox.centerYAnchor.constraint(equalTo: closeButton.centerYAnchor),
            titleBox.leadingAnchor.constraint(equalTo: closeButton.trailingAnchor, constant: 10),
            titleBox.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -16),
            titleBox.heightAnchor.constraint(equalToConstant: 44),
            titleLabel.leadingAnchor.constraint(equalTo: titleBox.leadingAnchor, constant: 18),
            titleLabel.trailingAnchor.constraint(equalTo: titleBox.trailingAnchor, constant: -18),
            titleLabel.centerYAnchor.constraint(equalTo: titleBox.centerYAnchor),

            card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            card.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -8),
            addressLabel.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
            addressLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            addressLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            confirmButton.topAnchor.constraint(equalTo: addressLabel.bottomAnchor, constant: 14),
            confirmButton.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 14),
            confirmButton.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -14),
            confirmButton.heightAnchor.constraint(equalToConstant: 50),
            confirmButton.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -14),

            locateButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            locateButton.bottomAnchor.constraint(equalTo: card.topAnchor, constant: -12),
        ])
    }

    /// Botón redondo de papel flotando sobre el mapa.
    private func float(_ button: UIButton, symbol: String, label: String, action: Selector) {
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setImage(UIImage(systemName: symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 16, weight: .semibold)), for: .normal)
        button.tintColor = Ink.text
        button.backgroundColor = Ink.paper
        button.layer.cornerRadius = 22
        button.accessibilityLabel = label
        button.addTarget(self, action: action, for: .touchUpInside)
        lift(button)
        view.addSubview(button)
        NSLayoutConstraint.activate([
            button.widthAnchor.constraint(equalToConstant: 44),
            button.heightAnchor.constraint(equalToConstant: 44),
        ])
    }

    private func lift(_ view: UIView) {
        view.layer.shadowColor = UIColor.black.cgColor
        view.layer.shadowOpacity = 0.16
        view.layer.shadowRadius = 14
        view.layer.shadowOffset = CGSize(width: 0, height: 6)
    }

    /// Los demás lugares, con su radio, para orientarse.
    private func showPlaces() {
        for place in options.places where CLLocationCoordinate2DIsValid(place.coordinate) {
            let annotation = MKPointAnnotation()
            annotation.coordinate = place.coordinate
            annotation.title = place.name
            mapView.addAnnotation(annotation)
            mapView.addOverlay(MKCircle(center: place.coordinate, radius: place.radius))
        }
    }

    /// Dónde se abre: en el lugar, si ya tiene sitio; si no, donde estás; si no, entre tus lugares.
    private func placeCamera() {
        if let center = options.center, CLLocationCoordinate2DIsValid(center) {
            focus(on: center, animated: false)
            return
        }
        let points = options.places.map(\.coordinate).filter(CLLocationCoordinate2DIsValid)
        if let first = points.first {
            var rect = MKMapRect(origin: MKMapPoint(first), size: MKMapSize(width: 1, height: 1))
            for point in points.dropFirst() {
                rect = rect.union(MKMapRect(origin: MKMapPoint(point), size: MKMapSize(width: 1, height: 1)))
            }
            let minimum = MKMapPointsPerMeterAtLatitude(first.latitude) * Self.minimumSpan * 2
            let side = max(rect.size.width, rect.size.height, minimum) * 1.4
            mapView.setVisibleMapRect(MKMapRect(x: rect.midX - side / 2, y: rect.midY - side / 2, width: side, height: side), animated: false)
        }
        // Con permiso (o pidiéndolo, que para esto se abre el mapa), donde estás.
        location.requestLocation { [weak self] result in
            guard let self, !self.moved, case .success(let position) = result else { return }
            self.mapView.showsUserLocation = true
            self.focus(on: position.coordinate, animated: points.isEmpty == false)
        }
    }

    private var isAuthorized: Bool {
        location.status == .authorizedWhenInUse || location.status == .authorizedAlways
    }

    private func focus(on coordinate: CLLocationCoordinate2D, animated: Bool) {
        let span = max(Self.minimumSpan, options.radius * 3.2)
        mapView.setRegion(MKCoordinateRegion(center: coordinate, latitudinalMeters: span, longitudinalMeters: span), animated: animated)
    }

    // MARK: - Gestos

    /// Tocar un punto lleva la chincheta allí.
    @objc private func tapped(_ gesture: UITapGestureRecognizer) {
        let point = gesture.location(in: mapView)
        // Los toques sobre una chincheta o un comercio los resuelve el mapa (`didSelect`).
        if let hit = mapView.hitTest(point, with: nil), hit is MKAnnotationView || hit.superview is MKAnnotationView { return }
        let coordinate = mapView.convert(point, toCoordinateFrom: mapView)
        let tappedAt = Date()
        // El mapa decide un momento después si el toque era sobre un comercio (entonces manda él) o el
        // primero de un doble toque para acercar (entonces el mapa ya se está moviendo).
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self, Date().timeIntervalSince(self.selectedAt) > 0.8, self.regionChangedAt < tappedAt else { return }
            self.moved = true
            self.feature = nil
            self.mapView.setCenter(coordinate, animated: true)
        }
    }

    func mapView(_ mapView: MKMapView, didSelect annotation: MKAnnotation) {
        mapView.deselectAnnotation(annotation, animated: false)
        guard !(annotation is MKUserLocation) else { return }
        selectedAt = Date()
        moved = true
        if let poi = annotation as? MKMapFeatureAnnotation, let name = poi.title, !name.isEmpty {
            feature = (name, poi.coordinate)
        } else {
            feature = nil
        }
        mapView.setCenter(annotation.coordinate, animated: true)
        UISelectionFeedbackGenerator().selectionChanged()
    }

    func mapView(_ mapView: MKMapView, regionWillChangeAnimated animated: Bool) {
        // Solo lo que mueve el dedo levanta la chincheta (no los encuadres de código).
        let dragging = mapView.subviews.first?.gestureRecognizers?.contains { $0.state == .began || $0.state == .changed } ?? false
        if dragging { moved = true }
        regionChangedAt = Date()
        geocodeWork?.cancel()
        // La dirección es la del punto de antes: confirmar ahora no debe guardarla con el nuevo.
        address = ""
        UIView.animate(withDuration: 0.18, delay: 0, options: [.beginFromCurrentState, .curveEaseOut]) {
            self.pin.transform = CGAffineTransform(translationX: 0, y: -10)
            self.pinShadow.transform = CGAffineTransform(scaleX: 0.6, y: 0.6)
            self.pinShadow.alpha = 0.5
            self.addressLabel.alpha = 0.45
        }
    }

    func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
        updateRing()
    }

    func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
        updateRing()
        if let current = feature,
           CLLocation(latitude: current.coordinate.latitude, longitude: current.coordinate.longitude)
           .distance(from: CLLocation(latitude: mapView.centerCoordinate.latitude, longitude: mapView.centerCoordinate.longitude)) > Self.featureTolerance {
            feature = nil
        }
        UIView.animate(withDuration: 0.35, delay: 0, usingSpringWithDamping: 0.55, initialSpringVelocity: 0.6, options: [.beginFromCurrentState]) {
            self.pin.transform = .identity
            self.pinShadow.transform = .identity
            self.pinShadow.alpha = 1
        }
        if moved { UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.6) }
        scheduleGeocode()
    }

    /// El círculo del radio a escala: si el mapa está tan lejos que no se vería, se esconde.
    private func updateRing() {
        let region = MKCoordinateRegion(center: mapView.centerCoordinate, latitudinalMeters: options.radius * 2, longitudinalMeters: options.radius * 2)
        let rect = mapView.convert(region, toRectTo: mapView)
        let size = rect.height.isFinite ? min(max(rect.height, 0), view.bounds.width * 2) : 0
        ringSize?.constant = size
        ring.layer.cornerRadius = size / 2
        ring.alpha = size < 18 ? 0 : 1
    }

    // MARK: - Dirección

    private func scheduleGeocode() {
        geocodeWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.geocode() }
        geocodeWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
    }

    private func geocode() {
        let center = mapView.centerCoordinate
        geocoder.cancelGeocode()
        geocoder.reverseGeocodeLocation(CLLocation(latitude: center.latitude, longitude: center.longitude)) { [weak self] placemarks, error in
            // La anterior, cancelada al pedir esta: su respuesta no cuenta.
            if (error as? CLError)?.code == .geocodeCanceled { return }
            guard let self else { return }
            let text = placemarks?.first.map(Self.describe) ?? ""
            self.address = text
            self.addressLabel.text = [self.feature?.name, text].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
            if self.addressLabel.text?.isEmpty ?? true { self.addressLabel.text = " " }
            UIView.animate(withDuration: 0.15) { self.addressLabel.alpha = 1 }
        }
    }

    /// `Calle Mayor 12, Valencia`: la calle con su número y la ciudad.
    private static func describe(_ placemark: CLPlacemark) -> String {
        let street = [placemark.thoroughfare, placemark.subThoroughfare].compactMap { $0 }.joined(separator: " ")
        var parts: [String] = []
        for part in [street.isEmpty ? placemark.name : street, placemark.locality] {
            if let part, !part.isEmpty, !parts.contains(part) { parts.append(part) }
        }
        return parts.joined(separator: ", ")
    }

    // MARK: - Botones

    @objc private func locate() {
        location.requestLocation { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let position):
                self.moved = true
                self.feature = nil
                self.mapView.showsUserLocation = true
                self.focus(on: position.coordinate, animated: true)
            case .failure:
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
            }
        }
    }

    @objc private func confirm() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        let center = mapView.centerCoordinate
        let name = feature?.name
        // Si la dirección aún no ha llegado, se va sin ella: la web enseña "Ubicación guardada".
        finish(PickedLocation(coordinate: center, address: address, name: name))
    }

    @objc private func cancel() {
        finish(nil)
    }

    private func finish(_ result: PickedLocation?) {
        // Un doble toque en el botón no cierra dos veces.
        guard let done = completion else { return }
        completion = nil
        geocodeWork?.cancel()
        geocoder.cancelGeocode()
        dismiss(animated: true) { done(result) }
    }

    // MARK: - Lo que pinta el mapa

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard annotation is MKPointAnnotation else { return nil }
        let view = mapView.dequeueReusableAnnotationView(withIdentifier: "place", for: annotation) as? MKMarkerAnnotationView
        view?.markerTintColor = Ink.text
        view?.glyphImage = UIImage(systemName: "mappin")
        view?.titleVisibility = .visible
        view?.displayPriority = .required
        return view
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        guard let circle = overlay as? MKCircle else { return MKOverlayRenderer(overlay: overlay) }
        let renderer = MKCircleRenderer(circle: circle)
        renderer.fillColor = Ink.text.withAlphaComponent(0.06)
        renderer.strokeColor = Ink.text.withAlphaComponent(0.35)
        renderer.lineWidth = 1
        return renderer
    }
}

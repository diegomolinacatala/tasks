import Foundation
import UserNotifications
import WidgetKit

/**
 * Apuntar una tarea sin abrir la app (Siri, Atajos). El estado vive en la web, que aquí no corre:
 * la tarea va a la bandeja (la web la aplica al cargar o al volver) y, entretanto, `headless.js`
 * dice cómo dejar sus avisos, el número del icono y el widget con la misma lógica que la web.
 */
enum QuickAdd {
    /** Lo que Siri o el atajo enseñan si algo falla. */
    struct Failure: Error, CustomLocalizedStringResourceConvertible {
        let localizedStringResource: LocalizedStringResource
    }

    /** Lo que se espera a la IA del servidor antes de tirar del analizador del propio iPhone. */
    private static let interpretSeconds = 6.0

    /**
     * Una alta cada vez: dos a la vez calcularían sus avisos cada una sin la tarea de la otra, y la
     * última en aplicar su plan borraría los avisos de la primera.
     */
    private static let queue = SerialQueue()

    /** Devuelve lo que dice Siri al terminar: "Apuntada: Cena, hoy 20:00". */
    static func add(_ text: String) async throws -> String {
        try await queue.run { try await QuickAdd.addNow(text) }
    }

    private static func addNow(_ text: String) async throws -> String {
        let now = Int64((Date().timeIntervalSince1970 * 1000).rounded())
        do {
            return try await interpretAndSave(text, now: now)
        } catch is InboxStore.Full {
            throw Failure(localizedStringResource: "Hay demasiadas tareas sin ordenar. Abre Tasks para seguir apuntando.")
        } catch {
            // `headless.js` no pudo con ello: no se pierde lo dicho, la web lo interpretará al abrirse.
            do {
                return try keepText(text, now: now)
            } catch {
                throw Failure(localizedStringResource: "No se ha podido apuntar. Prueba otra vez.")
            }
        }
    }

    private static func interpretAndSave(_ text: String, now: Int64) async throws -> String {
        let core = try HeadlessCore()
        let interpreted = await interpret(text, core: core, now: now)
        let inbox = try InboxStore.entries()
        let result = try core.add([
            "now": NSNumber(value: now),
            "text": text,
            "interpreted": interpreted ?? NSNull(),
            "state": stateFile() ?? NSNull(),
            "inbox": inbox,
            "widgetChanges": WidgetStore.pendingDone(),
        ])
        guard let message = result["message"] as? String else {
            throw HeadlessCore.Failure(message: "headless.js no devolvió el mensaje.")
        }
        // Nada que apuntar ("No te he entendido").
        guard let entry = result["entry"] as? [String: Any] else { return message }

        try InboxStore.append(entry)
        // Lo que sigue es para que se note ya; si falla, la web lo rehace al abrirse.
        await refresh(with: result)
        notifyWeb()
        return message
    }

    /** Las tareas que entiende la IA del servidor, o `nil` para usar el analizador del iPhone. */
    private static func interpret(_ text: String, core: HeadlessCore, now: Int64) async -> Any? {
        guard let api = core.api, let context = try? core.voiceContext(now: now) else { return nil }
        let server = DictationServer(base: api)
        let data = await withDeadline(interpretSeconds) {
            try await server.interpret(text, context: context)
        }
        guard let data else { return nil }
        return try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }

    /** Icono, avisos y widget contando ya con lo apuntado, como los dejaría la web. */
    private static func refresh(with result: [String: Any]) async {
        if let badge = result["badge"] as? Int {
            try? await UNUserNotificationCenter.current().setBadgeCount(badge)
        }
        if let plan = decode(NotificationPlan.self, from: result["plan"]) {
            await NotificationPlanner.apply(plan)
        }
        if let widget = result["widget"], !(widget is NSNull), let data = try? JSONSerialization.data(withJSONObject: widget) {
            try? WidgetStore.saveSnapshot(String(decoding: data, as: UTF8.self))
            WidgetCenter.shared.reloadTimelines(ofKind: WidgetStore.kind)
        }
    }

    /** Solo el texto: la web lo interpreta al aplicarlo, con la hora a la que se dijo. */
    private static func keepText(_ text: String, now: Int64) throws -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "No te he entendido." }
        let entry: [String: Any] = [
            "id": UUID().uuidString,
            "createdAt": NSNumber(value: now),
            "places": [Any](),
            "tasks": [Any](),
            "text": trimmed,
        ]
        try InboxStore.append(entry)
        notifyWeb()
        return "Apuntada: \(trimmed)."
    }

    /** `tasks-state.json`, que la web guarda en Library. `nil` si aún no existe o no se puede leer. */
    private static func stateFile() -> Any? {
        guard
            let url = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first?.appendingPathComponent("tasks-state.json"),
            let data = try? Data(contentsOf: url)
        else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }

    /** Si la web está viva (delante o en segundo plano), que recoja la bandeja ya. */
    private static func notifyWeb() {
        DispatchQueue.main.async {
            NativeActions.shared.post(["type": "inbox"])
        }
    }

    private static func decode<T: Decodable>(_ type: T.Type, from value: Any?) -> T? {
        guard let value, !(value is NSNull), let data = try? JSONSerialization.data(withJSONObject: value) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    /** El resultado de `operation`, o `nil` si falla o tarda más de `seconds`. */
    private static func withDeadline<T: Sendable>(
        _ seconds: Double,
        _ operation: @escaping @Sendable () async throws -> T?
    ) async -> T? {
        await withTaskGroup(of: T?.self) { group in
            group.addTask { try? await operation() }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }
}

/** Ejecuta las operaciones de una en una, en el orden en que llegan, aunque esperen a la red. */
private actor SerialQueue {
    private var last: Task<Void, Never>?

    func run<T: Sendable>(_ operation: @escaping @Sendable () async throws -> T) async throws -> T {
        let previous = last
        let current = Task { () async throws -> T in
            await previous?.value
            return try await operation()
        }
        last = Task { _ = try? await current.value }
        return try await current.value
    }
}

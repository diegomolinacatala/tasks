import Foundation
import JavaScriptCore

/**
 * `public/headless.js` (`src/headless.ts`): la lógica de la web para apuntar tareas y pasar lo
 * atrasado a hoy, ejecutada con JavaScriptCore cuando Siri, un atajo o el widget lo piden sin abrir
 * la app. Así el analizador, los avisos y el widget se calculan con el mismo código que en la web.
 * Todo entra y sale en JSON.
 */
final class HeadlessCore {
    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /** Contrato con `src/headless.ts`: si no coincide, el paquete es de otra versión de la app. */
    private static let version: Int32 = 4

    /** El manejador de excepciones de JavaScriptCore no puede lanzar: deja aquí el mensaje. */
    private final class Exceptions {
        var last: String?
    }

    private let context: JSContext
    private let core: JSValue
    private let exceptions: Exceptions

    init() throws {
        guard
            let url = Bundle.main.url(forResource: "headless", withExtension: "js", subdirectory: "public"),
            let script = try? String(contentsOf: url, encoding: .utf8)
        else { throw Failure(message: "Falta headless.js en la app.") }
        guard let context = JSContext() else { throw Failure(message: "JavaScriptCore no está disponible.") }

        let exceptions = Exceptions()
        context.exceptionHandler = { _, exception in
            exceptions.last = exception?.toString() ?? "Error de JavaScript."
        }
        context.evaluateScript(script, withSourceURL: url)
        if let message = exceptions.last { throw Failure(message: message) }

        guard
            let core = context.objectForKeyedSubscript("TasksHeadless"),
            core.isObject,
            core.objectForKeyedSubscript("version")?.toInt32() == Self.version
        else { throw Failure(message: "headless.js no es de esta versión de la app.") }

        self.context = context
        self.core = core
        self.exceptions = exceptions
    }

    /** Servidor del dictado de esta compilación; `nil` si no lo tiene. */
    var api: URL? {
        guard let value = core.objectForKeyedSubscript("api"), value.isString, let text = value.toString(), !text.isEmpty else {
            return nil
        }
        return URL(string: text)
    }

    /** Si se dio permiso en la app para mandar lo dictado al servidor. Sin fichero de estado, no. */
    func sharesDictation(state: Any?) -> Bool {
        guard
            let state, !(state is NSNull),
            JSONSerialization.isValidJSONObject(state),
            let json = try? JSONSerialization.data(withJSONObject: state),
            let answer = try? call("consent", String(decoding: json, as: UTF8.self))
        else { return false }
        return answer == "true"
    }

    /** `{ today, now }` locales para la IA del servidor. */
    func voiceContext(now: Int64) throws -> [String: String] {
        let json = try call("context", NSNumber(value: now))
        guard let context = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: String] else {
            throw Failure(message: "Contexto de voz mal formado.")
        }
        return context
    }

    /** `HeadlessInput` → `HeadlessResult` (`src/lib/headless.ts`), ambos como objetos JSON. */
    func add(_ input: [String: Any]) throws -> [String: Any] {
        try object("add", input)
    }

    /** `MoveInput` → `HeadlessResult`: lo atrasado, a hoy. */
    func moveOverdue(_ input: [String: Any]) throws -> [String: Any] {
        try object("move", input)
    }

    /** `AskInput` → `HeadlessResult`: "Sí, hecha" o "Todavía no" desde el aviso de cierre. */
    func answer(_ input: [String: Any]) throws -> [String: Any] {
        try object("answer", input)
    }

    private func object(_ name: String, _ input: [String: Any]) throws -> [String: Any] {
        let json = try JSONSerialization.data(withJSONObject: input)
        let output = try call(name, String(decoding: json, as: UTF8.self))
        guard let result = try JSONSerialization.jsonObject(with: Data(output.utf8)) as? [String: Any] else {
            throw Failure(message: "headless.js devolvió algo que no es un objeto.")
        }
        return result
    }

    private func call(_ name: String, _ argument: Any) throws -> String {
        exceptions.last = nil
        let result = core.invokeMethod(name, withArguments: [argument])
        if let message = exceptions.last { throw Failure(message: message) }
        guard let result, result.isString, let text = result.toString() else {
            throw Failure(message: "\(name) no devolvió texto.")
        }
        return text
    }
}

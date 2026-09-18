import Foundation
import Security

/**
 * Servidor del dictado (`worker/`): la IA que entiende lo dicho a Siri, la misma que al dictar en
 * la app. Sin cuenta: el iPhone se da de alta solo y guarda su token aleatorio en el llavero.
 */
struct DictationServer: Sendable {
    enum ServerError: Error {
        case unauthorized
        case status(Int)
        case unexpected
    }

    let base: URL

    private static let timeout: TimeInterval = 5

    /**
     * Las tareas que entiende la IA, como JSON sin validar (lo valida `draftsFromInterpreted`), o
     * `nil` si no devolvió ninguna.
     */
    func interpret(_ text: String, context: [String: String]) async throws -> Data? {
        let body: [String: Any] = ["text": text, "context": context]
        do {
            return try await interpret(body, token: try await token(renew: false))
        } catch ServerError.unauthorized {
            // El servidor olvidó el dispositivo (limpieza o base de datos nueva): alta y un reintento.
            return try await interpret(body, token: try await token(renew: true))
        }
    }

    private func interpret(_ body: [String: Any], token: String) async throws -> Data? {
        let data = try await post("v1/interpret", body: body, token: token)
        guard let tasks = data["tasks"], !(tasks is NSNull) else { return nil }
        return try JSONSerialization.data(withJSONObject: tasks, options: [.fragmentsAllowed])
    }

    private func token(renew: Bool) async throws -> String {
        if !renew, let stored = DeviceToken.read() { return stored }
        let data = try await post("v1/devices", body: ["voice": true], token: nil)
        guard let token = data["token"] as? String, !token.isEmpty else { throw ServerError.unexpected }
        DeviceToken.save(token)
        return token
    }

    /** El `data` de la respuesta (`{ data }` o `{ error }`, como en `src/lib/push/api.ts`). */
    private func post(_ path: String, body: [String: Any], token: String?) async throws -> [String: Any] {
        var request = URLRequest(url: base.appendingPathComponent(path), timeoutInterval: Self.timeout)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 { throw ServerError.unauthorized }
        guard (200..<300).contains(status) else { throw ServerError.status(status) }
        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let payload = json["data"] as? [String: Any]
        else { throw ServerError.unexpected }
        return payload
    }
}

/** Token del dictado en el llavero, legible con el iPhone bloqueado (tras el primer desbloqueo). */
private enum DeviceToken {
    private static let service = "io.github.diegomolinacatala.tasks.dictation"
    private static let account = "device-token"

    private static var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func read() -> String? {
        var search = query
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(search as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /** Si no se puede guardar, la próxima vez se da de alta otra vez: no se pierde nada más. */
    static func save(_ token: String) {
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = Data(token.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(item as CFDictionary, nil)
    }
}

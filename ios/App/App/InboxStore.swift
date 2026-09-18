import Foundation

/**
 * Bandeja de tareas apuntadas con Siri o Atajos sin abrir la app (`src/lib/inbox.ts`). La escriben
 * los intents y la vacía la web cuando lo aplicado ya está en su fichero de estado. Va en Library,
 * junto a `tasks-state.json`: entra en las copias de iCloud y se puede escribir con el iPhone
 * bloqueado (tras el primer desbloqueo), que es cuando más se usa Siri.
 */
enum InboxStore {
    struct Full: LocalizedError {
        var errorDescription: String? { "Hay demasiadas tareas sin ordenar. Abre Tasks para seguir apuntando." }
    }

    /** `MAX_INBOX_ENTRIES`. */
    static let maxEntries = 200

    private static let lock = NSLock()

    private static var url: URL? {
        FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first?.appendingPathComponent("tasks-inbox.json")
    }

    /** Las entradas tal como están guardadas; sin validar (lo hace la web). */
    static func entries() throws -> [[String: Any]] {
        lock.lock()
        defer { lock.unlock() }
        return try read()
    }

    static func append(_ entry: [String: Any]) throws {
        lock.lock()
        defer { lock.unlock() }
        let current = try read()
        guard current.count < maxEntries else { throw Full() }
        try write(current + [entry])
    }

    /** Quita las entradas con esos ids. Si ya no están, no pasa nada. */
    static func remove(ids: Set<String>) throws {
        lock.lock()
        defer { lock.unlock() }
        let current = try read()
        let kept = current.filter { entry in
            guard let id = entry["id"] as? String else { return true }
            return !ids.contains(id)
        }
        guard kept.count != current.count else { return }
        try write(kept)
    }

    /**
     * Sin fichero, bandeja vacía. Si existe pero no se puede leer (p. ej. iPhone reiniciado y aún sin
     * desbloquear), falla: escribir encima perdería lo que hay.
     */
    private static func read() throws -> [[String: Any]] {
        guard let url else { throw CocoaError(.fileNoSuchFile) }
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        let data = try Data(contentsOf: url)
        guard let entries = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw CocoaError(.fileReadCorruptFile)
        }
        return entries
    }

    private static func write(_ entries: [[String: Any]]) throws {
        guard let url else { throw CocoaError(.fileNoSuchFile) }
        let data = try JSONSerialization.data(withJSONObject: entries)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}

import Foundation

/// Acciones que nacen fuera de la web (Siri, accesos rápidos del icono). Pueden llegar antes de
/// que la web haya cargado: se guardan hasta que el plugin existe y la web las escucha.
final class NativeActions {
    static let shared = NativeActions()

    private let lock = NSLock()
    private var queue: [[String: Any]] = []
    private weak var plugin: TasksNativePlugin?

    func post(_ action: [String: Any]) {
        lock.lock()
        guard let plugin = plugin else {
            queue.append(action)
            lock.unlock()
            return
        }
        lock.unlock()
        plugin.deliver(action)
    }

    func attach(_ plugin: TasksNativePlugin) {
        lock.lock()
        self.plugin = plugin
        let pending = queue
        queue = []
        lock.unlock()
        pending.forEach { plugin.deliver($0) }
    }
}

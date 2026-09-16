import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = TasksViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // App cerrada y abierta desde un acceso rápido del icono o desde el widget.
        if let shortcut = connectionOptions.shortcutItem {
            handle(shortcut)
        }
        connectionOptions.urlContexts.forEach { handle($0.url) }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
        URLContexts.forEach { handle($0.url) }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    func windowScene(
        _ windowScene: UIWindowScene,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(handle(shortcutItem))
    }

    /// Los tipos van con el bundle id delante (Info.plist): basta mirar el último tramo.
    @discardableResult
    private func handle(_ shortcut: UIApplicationShortcutItem) -> Bool {
        guard let kind = shortcut.type.split(separator: ".").last else { return false }
        switch kind {
        case "compose", "week":
            NativeActions.shared.post(["type": String(kind)])
            return true
        default:
            return false
        }
    }

    /// Enlaces del widget: abrir hoy, una tarea o la barra de escribir.
    private func handle(_ url: URL) {
        if let action = WidgetLink.action(for: url) {
            NativeActions.shared.post(action)
        }
    }
}

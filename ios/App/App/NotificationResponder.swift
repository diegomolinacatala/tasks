import Capacitor
import UserNotifications

/**
 * Delegado de las notificaciones de la app. Los botones del aviso de cierre ("Sí, hecha" y "Todavía
 * no") no abren la app: iOS la arranca en segundo plano, sin WebView (también con el iPhone
 * bloqueado), y la respuesta se resuelve aquí con `QuickAdd`. Todo lo demás (tocar un aviso, los
 * botones que abren la app) pasa al delegado de Capacitor, que lo entrega a la web.
 */
final class NotificationResponder: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationResponder()

    /** `ASK_CATEGORY` y los ids de sus botones (`src/lib/platform/notifications.ts`). */
    private static let askCategory = "task-ask"
    private static let replies: Set<String> = ["done", "again"]

    private weak var router: NotificationRouter?
    /** Toques que llegan antes de que cargue la web: se le entregan en cuanto existe. */
    private var waiting: [(response: UNNotificationResponse, completion: () -> Void)] = []

    /**
     * Al terminar de arrancar: iOS entrega la respuesta a un botón justo después, y en segundo plano
     * no llega a crearse la pantalla (ni, con ella, Capacitor).
     */
    func install() {
        UNUserNotificationCenter.current().delegate = self
    }

    /** Capacitor se pone de delegado al cargar: se recupera el sitio y se le pasa lo que no es de aquí. */
    func attach(_ router: NotificationRouter) {
        self.router = router
        install()
        let pending = waiting
        waiting = []
        for item in pending {
            router.userNotificationCenter(.current(), didReceive: item.response, withCompletionHandler: item.completion)
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        guard let router else {
            completionHandler([.banner, .list, .sound])
            return
        }
        router.userNotificationCenter(center, willPresent: notification, withCompletionHandler: completionHandler)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let request = response.notification.request
        if request.content.categoryIdentifier == Self.askCategory, Self.replies.contains(response.actionIdentifier) {
            // iOS mantiene viva la app hasta que se llama a `completionHandler`.
            Task {
                await QuickAdd.answer(response.actionIdentifier, to: request)
                completionHandler()
            }
            return
        }
        guard let router else {
            waiting.append((response, completionHandler))
            return
        }
        router.userNotificationCenter(center, didReceive: response, withCompletionHandler: completionHandler)
    }
}

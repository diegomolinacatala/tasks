import AppIntents
import UserNotifications

/**
 * Tocar el círculo de una tarea en el widget. El estado vive en la web, que no corre con la app
 * cerrada: el cambio se apunta en el App Group, el widget lo pinta ya y la app lo aplica al volver.
 */
struct ToggleTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Completar tarea"
    static var isDiscoverable = false

    @Parameter(title: "Tarea")
    var taskId: String

    init() {}

    init(taskId: String) {
        self.taskId = taskId
    }

    func perform() async throws -> some IntentResult {
        guard let done = WidgetStore.toggle(taskId) else { return .result() }
        let center = UNUserNotificationCenter.current()
        if done {
            await removeReminders(center)
        }
        let today = WidgetDay(tasks: WidgetStore.tasks() ?? [], day: WidgetDay.iso(Date()))
        try? await center.setBadgeCount(today.pending)
        return .result()
    }

    /**
     * Una tarea hecha no debe avisar aunque la app no se abra. Si luego se desmarca, la app vuelve a
     * programarlo todo (`reschedule`).
     */
    private func removeReminders(_ center: UNUserNotificationCenter) async {
        let ids = await center.pendingNotificationRequests()
            .filter { Self.belongs($0, to: taskId) }
            .map(\.identifier)
        guard !ids.isEmpty else { return }
        center.removePendingNotificationRequests(withIdentifiers: ids)
        WidgetStore.markReschedule()
    }

    /**
     * `cap_extra` es el `extra` de `src/lib/nativeSchedule.ts`: `taskId` en los avisos por hora y
     * `taskIds` en los de lugar. Un aviso de lugar con varias tareas se queda: sigue haciendo falta.
     */
    private static func belongs(_ request: UNNotificationRequest, to taskId: String) -> Bool {
        guard let extra = request.content.userInfo["cap_extra"] as? [String: Any] else { return false }
        return extra["taskId"] as? String == taskId || extra["taskIds"] as? String == taskId
    }
}

import AppIntents
import WidgetKit
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

/**
 * Tocar una rutina en su widget (pantalla de bloqueo o de inicio): se tacha ese día sin abrir la app,
 * también con el iPhone bloqueado. Como con las tareas, el cambio se apunta en el App Group, el
 * widget lo pinta ya y la app lo aplica al volver. Tacharla quita su aviso de hoy (el pendiente y el
 * que ya esté en la pantalla); destacharla pide a la app que lo vuelva a programar.
 */
struct ToggleRoutineIntent: AppIntent {
    static var title: LocalizedStringResource = "Tachar rutina"
    static var isDiscoverable = false
    /** Tachar la creatina no enseña nada: no hace falta desbloquear. */
    static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed

    @Parameter(title: "Rutina")
    var routineId: String

    @Parameter(title: "Día")
    var day: String

    init() {}

    init(routineId: String, day: String) {
        self.routineId = routineId
        self.day = day
    }

    func perform() async throws -> some IntentResult {
        guard let done = WidgetStore.toggleRoutine(routineId, day: day) else { return .result() }
        let center = UNUserNotificationCenter.current()
        if done {
            await removeNotifications(center)
        } else {
            WidgetStore.markReschedule()
        }
        WidgetCenter.shared.reloadTimelines(ofKind: WidgetStore.routinesKind)
        return .result()
    }

    /** `entryId` del aviso de la rutina ese día (`routineEntryId` en `src/lib/routines.ts`). */
    private var entryId: String {
        "routine-\(routineId)-\(day.replacingOccurrences(of: "-", with: ""))"
    }

    private func removeNotifications(_ center: UNUserNotificationCenter) async {
        let pending = await center.pendingNotificationRequests()
            .filter { Self.entry(of: $0) == entryId }
            .map(\.identifier)
        if !pending.isEmpty {
            center.removePendingNotificationRequests(withIdentifiers: pending)
            WidgetStore.markReschedule()
        }
        let delivered = await center.deliveredNotifications()
            .filter { Self.entry(of: $0.request) == entryId }
            .map(\.request.identifier)
        center.removeDeliveredNotifications(withIdentifiers: delivered)
    }

    private static func entry(of request: UNNotificationRequest) -> String? {
        (request.content.userInfo["cap_extra"] as? [String: Any])?["entryId"] as? String
    }
}

import AppIntents

/**
 * Botón "A hoy" del widget: pasa lo atrasado a hoy sin abrir la app. Es `LiveActivityIntent` para
 * que iOS lo ejecute en el proceso de la app (arrancándola en segundo plano si hace falta) y no en
 * el del widget: allí están el fichero de estado y `headless.js`, que dicen qué está atrasado y cómo
 * quedan los avisos (`QuickAdd.moveOverdue`). Se compila en los dos objetivos; en el del widget,
 * `OverdueMover` no hace nada porque nunca corre ahí.
 */
struct WidgetMoveOverdueIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pasar atrasadas a hoy"
    static var isDiscoverable = false

    init() {}

    func perform() async throws -> some IntentResult {
        _ = try await OverdueMover.moveToToday()
        return .result()
    }
}

import AppIntents

/**
 * El intent del control del micrófono (`DictateControl`, iOS 18): abre la app directamente escuchando
 * con `<esquema>://dictate`, que `SceneDelegate` convierte en la acción `dictate`. Con
 * `openAppWhenRun` iOS puede querer ejecutarlo en el proceso de la app, así que se compila en los dos
 * objetivos, como `WidgetMoveOverdueIntent`.
 */
@available(iOS 18.0, *)
struct DictateIntent: AppIntent {
    static var title: LocalizedStringResource = "Dictar tarea"
    static var description = IntentDescription("Abre Tasks escuchando para dictar una tarea.")
    static var openAppWhenRun: Bool = true
    /// En Atajos ya está "Dictar tarea" de la app (`DictateTaskIntent`): este no se enseña dos veces.
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(WidgetLink.dictate))
    }
}

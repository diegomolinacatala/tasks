import AppIntents

/// "Oye Siri, añade una tarea en Tasks": Siri pregunta cuál y la app la crea con el mismo
/// analizador que el dictado ("comprar pan mañana a las 5").
struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Añadir tarea"
    static var description = IntentDescription("Crea una tarea en Tasks.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Tarea", requestValueDialog: "¿Qué tarea añado?")
    var text: String

    @MainActor
    func perform() async throws -> some IntentResult {
        NativeActions.shared.post(["type": "add", "text": text])
        return .result()
    }
}

/// Abre la app con la barra de escribir enfocada. Es la acción que se asigna a "Tocar atrás" de
/// Accesibilidad: iOS no deja a las apps detectar esos toques, solo lanzar un atajo.
struct ComposeTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Nueva tarea"
    static var description = IntentDescription("Abre Tasks con el teclado listo para escribir una tarea.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NativeActions.shared.post(["type": "compose"])
        return .result()
    }
}

/// Abre la app directamente en la vista de semana.
struct OpenWeekIntent: AppIntent {
    static var title: LocalizedStringResource = "Ver la semana"
    static var description = IntentDescription("Abre Tasks en la vista de semana.")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        NativeActions.shared.post(["type": "week"])
        return .result()
    }
}

struct TasksShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AddTaskIntent(),
            phrases: [
                "Añade una tarea en \(.applicationName)",
                "Nueva tarea en \(.applicationName)",
                "Apunta en \(.applicationName)",
            ],
            shortTitle: "Añadir tarea",
            systemImageName: "plus.circle"
        )
        AppShortcut(
            intent: OpenWeekIntent(),
            phrases: ["Mi semana en \(.applicationName)"],
            shortTitle: "Semana",
            systemImageName: "calendar"
        )
    }
}

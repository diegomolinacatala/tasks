import AppIntents

/// "Oye Siri, apunta en Tasks": Siri pregunta qué y escucha. Es también la acción "Añadir tarea" de
/// Atajos: con "Dictar texto" delante, sirve para tocar atrás, el botón de acción, la pantalla de
/// bloqueo o un widget. No abre la app: entiende la frase igual que el dictado ("comprar pan
/// mañana a las 5"), la deja en la bandeja y programa sus avisos (`QuickAdd`).
struct AddTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "Añadir tarea"
    static var description = IntentDescription("Apunta una tarea sin abrir Tasks. Entiende el día, la hora, los avisos y los lugares: «llamar a Ana mañana a las 5».")
    static var openAppWhenRun: Bool = false
    /// También con el iPhone bloqueado: apuntar no enseña nada de lo que ya hay.
    static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed

    @Parameter(title: "Tarea", requestValueDialog: "¿Qué apunto?")
    var text: String

    static var parameterSummary: some ParameterSummary {
        Summary("Apuntar \(\.$text) en Tasks")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let message = try await QuickAdd.add(text)
        return .result(dialog: "\(message)")
    }
}

/// Abre la app con la barra de escribir enfocada. Para escribir con calma; para dictar sin abrirla,
/// "Añadir tarea". iOS no deja a las apps detectar los toques atrás, solo lanzar un atajo.
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

import Foundation

/**
 * Idioma de lo que escribe el lado nativo (widgets, lo que dice Siri si algo falla): el elegido en la
 * app, que la web deja ya resuelto en la foto del widget (`language` en `src/lib/widget.ts`); si aún no
 * hay foto, el del iPhone. Se compila en la app y en el widget.
 */
enum AppLanguage {
    case es
    case en

    static var current: AppLanguage {
        switch WidgetStore.language() {
        case "es": return .es
        case "en": return .en
        default: return system
        }
    }

    /** El primero de los idiomas del iPhone que la app habla; si no habla ninguno, inglés (`systemLanguage` en `src/lib/i18n.ts`). */
    static var system: AppLanguage {
        for tag in Locale.preferredLanguages {
            let base = tag.lowercased().split(whereSeparator: { $0 == "-" || $0 == "_" }).first.map(String.init)
            if base == "es" { return .es }
            if base == "en" { return .en }
        }
        return .en
    }
}

/** Los textos de los widgets y de los fallos de Siri, en el idioma de la app. */
struct WidgetText {
    let language: AppLanguage
    // Hoy
    let todayName: String
    let todayDescription: String
    let today: String
    let todayCaps: String
    let nothingToday: String
    let openTasks: String
    let more: (Int) -> String
    let complete: String
    let markPending: String
    let toToday: String
    let moveOverdue: String
    let newTask: String
    let yesterday: String
    let sampleTasks: [String]
    // Rutinas
    let routinesName: String
    let routinesDescription: String
    let routines: String
    let routinesCaps: String
    let noneToday: String
    let done: String
    let doneOf: (Int, Int) -> String
    let unmark: (String) -> String
    let doneTitle: (String) -> String
    let sampleRoutines: [String]
    // Bandeja
    let inboxName: String
    let inboxDescription: String
    let inbox: String
    let inboxCaps: String
    let nothingInbox: String
    let newInboxTask: String
    let sampleInbox: [String]
    // Siri y Atajos
    let tooManyTasks: String
    let addFailed: String
    let tooManyChanges: String
    let moveFailed: String
    let notUnderstood: String
    let added: (String) -> String

    static var current: WidgetText {
        AppLanguage.current == .en ? english : spanish
    }

    static let spanish = WidgetText(
        language: .es,
        todayName: "Hoy",
        todayDescription: "Tareas de hoy y atrasadas.",
        today: "Hoy",
        todayCaps: "HOY",
        nothingToday: "Nada para hoy.",
        openTasks: "Abre Tasks",
        more: { "\($0) más" },
        complete: "Completar",
        markPending: "Marcar como pendiente",
        toToday: "A hoy",
        moveOverdue: "Pasar atrasadas a hoy",
        newTask: "Nueva tarea",
        yesterday: "Ayer",
        sampleTasks: ["Comprar pan", "Llamar a Ana", "Enviar el presupuesto", "Salir a correr"],
        routinesName: "Rutinas",
        routinesDescription: "Tacha tus rutinas de hoy con un toque, sin abrir Tasks.",
        routines: "Rutinas",
        routinesCaps: "RUTINAS",
        noneToday: "Hoy no toca ninguna.",
        done: "Hecha",
        doneOf: { "\($0) de \($1) hoy" },
        unmark: { "Desmarcar \($0)" },
        doneTitle: { "Hecha: \($0)" },
        sampleRoutines: ["Tomar creatina", "Leer 20 minutos", "Estirar"],
        inboxName: "Bandeja",
        inboxDescription: "Lo que aún no tiene día, para tacharlo de un toque.",
        inbox: "Bandeja",
        inboxCaps: "BANDEJA",
        nothingInbox: "Nada sin fecha.",
        newInboxTask: "Nueva tarea en la Bandeja",
        sampleInbox: ["Renovar el pasaporte", "Regalo para Carlota", "Llamar al fontanero", "Leer «Sapiens»"],
        tooManyTasks: "Hay demasiadas tareas sin ordenar. Abre Tasks para seguir apuntando.",
        addFailed: "No se ha podido apuntar. Prueba otra vez.",
        tooManyChanges: "Hay demasiados cambios sin ordenar. Abre Tasks para seguir.",
        moveFailed: "No se ha podido pasar a hoy. Hazlo desde Tasks.",
        notUnderstood: "No te he entendido.",
        added: { "Apuntada: \($0)." }
    )

    static let english = WidgetText(
        language: .en,
        todayName: "Today",
        todayDescription: "Today’s and overdue tasks.",
        today: "Today",
        todayCaps: "TODAY",
        nothingToday: "Nothing for today.",
        openTasks: "Open Tasks",
        more: { "\($0) more" },
        complete: "Complete",
        markPending: "Mark as pending",
        toToday: "To today",
        moveOverdue: "Move overdue to today",
        newTask: "New task",
        yesterday: "Yesterday",
        sampleTasks: ["Buy bread", "Call Ana", "Send the quote", "Go for a run"],
        routinesName: "Routines",
        routinesDescription: "Check off today’s routines with one tap, without opening Tasks.",
        routines: "Routines",
        routinesCaps: "ROUTINES",
        noneToday: "None due today.",
        done: "Done",
        doneOf: { "\($0) of \($1) today" },
        unmark: { "Unmark \($0)" },
        doneTitle: { "Done: \($0)" },
        sampleRoutines: ["Take creatine", "Read 20 minutes", "Stretch"],
        inboxName: "Inbox",
        inboxDescription: "What doesn’t have a day yet, to check off with one tap.",
        inbox: "Inbox",
        inboxCaps: "INBOX",
        nothingInbox: "Nothing without a date.",
        newInboxTask: "New task in Inbox",
        sampleInbox: ["Renew the passport", "Gift for Carlota", "Call the plumber", "Read “Sapiens”"],
        tooManyTasks: "Too many tasks waiting. Open Tasks to keep adding.",
        addFailed: "Couldn’t add it. Try again.",
        tooManyChanges: "Too many changes waiting. Open Tasks to continue.",
        moveFailed: "Couldn’t move them to today. Do it from Tasks.",
        notUnderstood: "I didn’t catch that.",
        added: { "Added: \($0)." }
    )

    /** Muestra de la galería, sin salirse de la lista aunque se pida de más. */
    static func sample(_ list: [String], _ index: Int) -> String {
        list.indices.contains(index) ? list[index] : ""
    }
}

/**
 * Solo en el widget. `WidgetMoveOverdueIntent` corre en el proceso de la app, donde está el de
 * verdad (`QuickAdd.swift`); este existe para que el intent compile también aquí.
 */
enum OverdueMover {
    static func moveToToday() async throws -> String {
        ""
    }
}

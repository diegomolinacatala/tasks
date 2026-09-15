import Capacitor
import UIKit

/// Controlador de Capacitor con el plugin propio de la app registrado.
class TasksViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(TasksNativePlugin())
    }
}

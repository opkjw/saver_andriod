import Capacitor

class CAPViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GoogleSignInPlugin())
    }
}

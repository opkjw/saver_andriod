import Foundation
import Capacitor
import GoogleSignIn

@objc(GoogleAuthPlugin)
public class GoogleSignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GoogleAuthPlugin"
    public let jsName = "GoogleAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise)
    ]

    private let IOS_CLIENT_ID = "1081217420528-aofv377q09ejs4mrv87v2r3f9qg1gopi.apps.googleusercontent.com"

    @objc func signIn(_ call: CAPPluginCall) {
        guard let viewController = bridge?.viewController else {
            call.reject("No view controller available")
            return
        }

        let config = GIDConfiguration(clientID: IOS_CLIENT_ID)
        GIDSignIn.sharedInstance.configuration = config

        DispatchQueue.main.async {
            GIDSignIn.sharedInstance.signIn(withPresenting: viewController) { result, error in
                if let error = error {
                    call.reject("SIGN_IN_FAILED", nil, error)
                    return
                }
                guard let idToken = result?.user.idToken?.tokenString else {
                    call.reject("No ID token received")
                    return
                }
                call.resolve([
                    "idToken": idToken,
                    "email": result?.user.profile?.email ?? "",
                    "displayName": result?.user.profile?.name ?? ""
                ])
            }
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        GIDSignIn.sharedInstance.signOut()
        call.resolve()
    }
}

import Capacitor
import Foundation

/**
 * La versión de Tasks que hay en la App Store, para avisar de que hay una nueva (`UpdatePrompt.tsx`). Es
 * la búsqueda pública de iTunes (sin cuenta ni clave); se pide desde aquí y no desde la web, que no puede
 * por CORS. Apple tarda unas horas en reflejar una versión recién publicada.
 */
enum AppStoreVersion {
    static let appId = "6812776586"
    private static let timeout: TimeInterval = 10

    static var installed: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    }

    /** `country`: la tienda (`es`, `us`…); `lang`: el idioma de las novedades (`es_es`, `en_us`). */
    static func lookup(country: String, lang: String, completion: @escaping ([String: Any]?) -> Void) {
        var components = URLComponents(string: "https://itunes.apple.com/lookup")
        components?.queryItems = [
            URLQueryItem(name: "id", value: appId),
            URLQueryItem(name: "country", value: country),
            URLQueryItem(name: "lang", value: lang),
        ]
        guard let url = components?.url else { return completion(nil) }
        let request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
        URLSession.shared.dataTask(with: request) { data, _, _ in
            guard
                let data,
                let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                let first = (json["results"] as? [[String: Any]])?.first,
                let version = first["version"] as? String
            else { return completion(nil) }
            completion([
                "version": version,
                "notes": first["releaseNotes"] as? String ?? "",
                "url": first["trackViewUrl"] as? String ?? "",
            ])
        }.resume()
    }
}

extension TasksNativePlugin {
    /** La versión publicada y la instalada. Sin red o sin respuesta, solo la instalada. */
    @objc func storeVersion(_ call: CAPPluginCall) {
        let country = (call.getString("country") ?? "es").lowercased()
        let lang = call.getString("lang") ?? "es_es"
        AppStoreVersion.lookup(country: country, lang: lang) { found in
            var result: [String: Any] = ["installed": AppStoreVersion.installed]
            if let found { result.merge(found) { _, new in new } }
            call.resolve(result)
        }
    }
}

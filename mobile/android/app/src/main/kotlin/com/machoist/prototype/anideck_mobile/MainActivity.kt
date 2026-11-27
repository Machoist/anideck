package com.machoist.prototype.anideck_mobile

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.view.WindowManager
import android.content.Intent
import android.net.Uri

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Fixed public authorization URL only. No arbitrary renderer URL or token.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "anideck/anilist")
            .setMethodCallHandler { call, result ->
                if (call.method != "openAuthorization") result.notImplemented()
                else try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://anilist.co/api/v2/oauth/authorize?client_id=54547&response_type=token")))
                    result.success(null)
                } catch (_: Exception) {
                    result.error("BROWSER_UNAVAILABLE", "Could not open your browser. Install or enable a browser and try again.", null)
                }
            }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "anideck/privacy")
            .setMethodCallHandler { call, result ->
                if (call.method == "isScreenProtected") {
                    result.success(window.attributes.flags and WindowManager.LayoutParams.FLAG_SECURE != 0)
                } else if (call.method != "setScreenProtected" || call.arguments !is Boolean) {
                    result.notImplemented()
                } else {
                    if (call.arguments == true) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    result.success(null)
                }
            }
    }
}

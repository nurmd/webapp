package com.gstbilling.pos

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var vibrator: Vibrator? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Clean up temporary update APK from previous session if install was completed
        cleanTempApk()

        vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator

        // Configure light status bar and navigation bar with crisp dark icons to match white app theme
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.statusBarColor = 0xFFFFFFFF.toInt()
            @Suppress("DEPRECATION")
            var flags = window.decorView.systemUiVisibility
            flags = flags or android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                window.navigationBarColor = 0xFFFFFFFF.toInt()
                flags = flags or android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            }
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = flags
        }

        // Explicitly enforce hardware acceleration on window
        window.setFlags(
            android.view.WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            android.view.WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
        )

        webView = WebView(this)
        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
        webView.setBackgroundColor(0xFFF9F9FF.toInt())

        val container = FrameLayout(this)
        container.setBackgroundColor(0xFFFFFFFF.toInt())
        container.fitsSystemWindows = true
        container.addView(webView)
        setContentView(container)

        setupWebView()
        webView.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    override fun onResume() {
        super.onResume()
        // If user returned after an update, ensure temp APK is cleaned
        cleanTempApk()
    }

    private fun cleanTempApk() {
        try {
            val tempApk = File(cacheDir, "temp_update.apk")
            if (tempApk.exists()) {
                tempApk.delete()
            }
        } catch (_: Exception) {}
    }

    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.allowFileAccessFromFileURLs = true
        settings.allowUniversalAccessFromFileURLs = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        webView.webViewClient = object : WebViewClient() {
            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url == null) return false
                if (url.startsWith("upi://") ||
                    url.startsWith("https://wa.me/") ||
                    url.startsWith("https://api.whatsapp.com/") ||
                    url.startsWith("whatsapp://") ||
                    url.startsWith("mailto:") ||
                    url.startsWith("tel:")
                ) {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                        startActivity(intent)
                        return true
                    } catch (e: Exception) {
                        Toast.makeText(this@MainActivity, "No app available to handle this request", Toast.LENGTH_SHORT).show()
                        return true
                    }
                }
                return false
            }

            override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse? {
                val url = request?.url ?: return null
                if (url.host == "appassets.androidplatform.net") {
                    var path = url.path ?: "index.html"
                    if (path.startsWith("/")) path = path.substring(1)
                    if (path.isEmpty()) path = "index.html"

                    try {
                        val inputStream = assets.open(path)
                        val mimeType = when {
                            path.endsWith(".html") -> "text/html"
                            path.endsWith(".js") -> "application/javascript"
                            path.endsWith(".mjs") -> "application/javascript"
                            path.endsWith(".css") -> "text/css"
                            path.endsWith(".svg") -> "image/svg+xml"
                            path.endsWith(".png") -> "image/png"
                            path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
                            path.endsWith(".json") -> "application/json"
                            path.endsWith(".woff2") -> "font/woff2"
                            path.endsWith(".woff") -> "font/woff"
                            path.endsWith(".ttf") -> "font/ttf"
                            else -> "application/octet-stream"
                        }
                        return WebResourceResponse(mimeType, "UTF-8", inputStream)
                    } catch (e: Exception) {
                        return WebResourceResponse(
                            "text/plain",
                            "UTF-8",
                            404,
                            "Not Found",
                            null,
                            ByteArrayInputStream("Asset not found: $path".toByteArray())
                        )
                    }
                }
                return super.shouldInterceptRequest(view, request)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage?): Boolean {
                if (consoleMessage != null) {
                    android.util.Log.d("GSTBillingJS", "${consoleMessage.sourceId()}:${consoleMessage.lineNumber()} -- ${consoleMessage.message()}")
                }
                return super.onConsoleMessage(consoleMessage)
            }
        }

        webView.addJavascriptInterface(AndroidBridge(this, webView, vibrator), "AndroidBridge")
    }

    private var lastBackPressTime: Long = 0

    override fun onBackPressed() {
        if (!::webView.isInitialized) {
            super.onBackPressed()
            return
        }

        webView.evaluateJavascript(
            "(function() { " +
            "  try { " +
            "    if (typeof window.__handleAndroidBack === 'function') { " +
            "      return window.__handleAndroidBack() === true; " +
            "    } " +
            "  } catch (e) {} " +
            "  return false; " +
            "})()"
        ) { result ->
            val handled = result?.trim()?.replace("\"", "")?.equals("true", ignoreCase = true) == true
            if (!handled) {
                val now = System.currentTimeMillis()
                if (now - lastBackPressTime < 2000) {
                    finish()
                } else {
                    lastBackPressTime = now
                    vibrator?.let { v ->
                        try {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                v.vibrate(VibrationEffect.createOneShot(40, VibrationEffect.DEFAULT_AMPLITUDE))
                            } else {
                                @Suppress("DEPRECATION")
                                v.vibrate(40)
                            }
                        } catch (_: Exception) {}
                    }
                    Toast.makeText(this@MainActivity, "Press back again to exit", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}

class AndroidBridge(
    private val context: Context,
    private val webView: WebView,
    private val vibrator: Vibrator?
) {
    private var downloadThread: Thread? = null
    @Volatile private var isDownloading = false

    @JavascriptInterface
    fun exitApp() {
        (context as? Activity)?.let { act ->
            act.runOnUiThread {
                act.finish()
            }
        }
    }

    @JavascriptInterface
    fun showToast(msg: String) {
        (context as? Activity)?.runOnUiThread {
            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
        }
    }

    @JavascriptInterface
    fun vibrate(durationMs: Long) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(durationMs)
            }
        } catch (_: Exception) {}
    }

    @JavascriptInterface
    fun openUrl(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            (context as? Activity)?.runOnUiThread {
                Toast.makeText(context, "Could not open URL: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    @JavascriptInterface
    fun installApk(url: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            (context as? Activity)?.runOnUiThread {
                Toast.makeText(context, "Cannot launch installer: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    @JavascriptInterface
    fun clearTempApk(): Boolean {
        return try {
            val tempApk = File(context.cacheDir, "temp_update.apk")
            if (tempApk.exists()) tempApk.delete() else true
        } catch (_: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun cancelInternalDownload() {
        isDownloading = false
        downloadThread?.interrupt()
        downloadThread = null
        clearTempApk()
    }

    @JavascriptInterface
    fun startInternalDownload(apkUrl: String, expectedSha256: String) {
        if (isDownloading) {
            showToast("Download already in progress")
            return
        }

        // On Android 8.0+, verify unknown app installation permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!context.packageManager.canRequestPackageInstalls()) {
                (context as? Activity)?.runOnUiThread {
                    Toast.makeText(context, "Please allow 'Install unknown apps' permission to update Vyapar PRO", Toast.LENGTH_LONG).show()
                    val permissionIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(permissionIntent)
                    dispatchJs("window.onOtaError && window.onOtaError('Permission needed: Please enable Install Unknown Apps and tap Retry.', true);")
                }
                return
            }
        }

        isDownloading = true
        downloadThread = Thread {
            var tempFile: File? = null
            try {
                tempFile = File(context.cacheDir, "temp_update.apk")
                if (tempFile.exists()) {
                    tempFile.delete()
                }

                var currentUrl = apkUrl
                var conn: HttpURLConnection? = null
                var redirects = 0

                // Follow CDN / GitHub redirects
                while (redirects < 6) {
                    val urlObj = URL(currentUrl)
                    conn = urlObj.openConnection() as HttpURLConnection
                    conn.instanceFollowRedirects = true
                    conn.connectTimeout = 15000
                    conn.readTimeout = 30000
                    conn.setRequestProperty("User-Agent", "GSTBilling-Vyapar-Android")
                    conn.connect()
                    val code = conn.responseCode
                    if (code == HttpURLConnection.HTTP_MOVED_PERM ||
                        code == HttpURLConnection.HTTP_MOVED_TEMP ||
                        code == 307 || code == 308
                    ) {
                        val location = conn.getHeaderField("Location")
                        conn.disconnect()
                        if (location != null) {
                            currentUrl = location
                            redirects++
                            continue
                        }
                    }
                    break
                }

                if (conn == null || conn.responseCode !in 200..299) {
                    val status = conn?.responseCode ?: -1
                    conn?.disconnect()
                    throw IOException("HTTP server returned error: status $status")
                }

                val contentLength = conn.contentLengthLong
                val digest = MessageDigest.getInstance("SHA-256")
                val buffer = ByteArray(8192)
                var bytesRead = 0
                var totalBytesRead = 0L
                var lastProgressUpdate = 0L

                FileOutputStream(tempFile).use { output ->
                    conn.inputStream.use { input ->
                        while (isDownloading) {
                            bytesRead = input.read(buffer)
                            if (bytesRead == -1) break
                            output.write(buffer, 0, bytesRead)
                            digest.update(buffer, 0, bytesRead)
                            totalBytesRead += bytesRead

                            val now = System.currentTimeMillis()
                            if (now - lastProgressUpdate > 120 || totalBytesRead == contentLength) {
                                lastProgressUpdate = now
                                val percent = if (contentLength > 0) ((totalBytesRead * 100) / contentLength).toInt() else -1
                                dispatchJs("window.onOtaProgress && window.onOtaProgress($percent, $totalBytesRead, $contentLength);")
                            }
                        }
                    }
                }

                if (!isDownloading) {
                    tempFile.delete()
                    return@Thread
                }

                // Calculate final SHA-256 hash
                val calculatedHash = digest.digest().joinToString("") { "%02x".format(it) }
                val targetHash = expectedSha256.trim().lowercase()

                if (targetHash.isNotEmpty()) {
                    if (!calculatedHash.equals(targetHash, ignoreCase = true)) {
                        // Checksum mismatch! Delete corrupt temp APK and notify for retry
                        tempFile.delete()
                        val msg = "Checksum verification failed! Expected: ${targetHash.take(10)}... Got: ${calculatedHash.take(10)}..."
                        dispatchJs("window.onOtaError && window.onOtaError('$msg', true);")
                        return@Thread
                    }
                }

                // Checksum verified successfully!
                dispatchJs("window.onOtaSuccess && window.onOtaSuccess('$calculatedHash');")

                // Launch package installer using GenericFileProvider
                (context as? Activity)?.runOnUiThread {
                    try {
                        val contentUri = Uri.parse("content://com.gstbilling.pos.fileprovider/temp_update.apk")
                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(contentUri, "application/vnd.android.package-archive")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        context.startActivity(intent)
                    } catch (e: Exception) {
                        Toast.makeText(context, "Error launching installer: ${e.message}", Toast.LENGTH_LONG).show()
                        dispatchJs("window.onOtaError && window.onOtaError('Failed to launch installer: ${e.message}', true);")
                    }
                }
            } catch (e: Exception) {
                tempFile?.delete()
                if (isDownloading) {
                    val safeErr = (e.message ?: "Network error").replace("'", "\\'")
                    dispatchJs("window.onOtaError && window.onOtaError('Download error: $safeErr', true);")
                }
            } finally {
                isDownloading = false
                downloadThread = null
            }
        }
        downloadThread?.start()
    }

    private fun dispatchJs(script: String) {
        (context as? Activity)?.runOnUiThread {
            webView.evaluateJavascript(script, null)
        }
    }
}

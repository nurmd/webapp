package com.gstbilling.pos

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import org.json.JSONObject
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
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    var pendingBackupDisplayName: String? = null

    companion object {
        const val FILE_CHOOSER_REQUEST_CODE = 2001
        const val CREATE_BACKUP_DOCUMENT_REQUEST_CODE = 2002
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Only clean stale pending backup files on fresh startup; preserve state across Activity recreations
        if (savedInstanceState == null) {
            cleanTempFiles()
        } else {
            pendingBackupDisplayName = savedInstanceState.getString("pendingBackupDisplayName")
            cleanTempApk()
        }

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

        // Request Bluetooth permissions for Android 12+
        if (Build.VERSION.SDK_INT >= 31) {
            val permissions = arrayOf<String>(
                "android.permission.BLUETOOTH_CONNECT",
                "android.permission.BLUETOOTH_SCAN"
            )
            val toRequest = permissions.filter { checkSelfPermission(it) != android.content.pm.PackageManager.PERMISSION_GRANTED }
            if (toRequest.isNotEmpty()) {
                requestPermissions(toRequest.toTypedArray(), 101)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // If user returned after an update, ensure temp APK is cleaned
        cleanTempApk()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString("pendingBackupDisplayName", pendingBackupDisplayName)
    }

    fun cleanPendingBackup() {
        try {
            val tempBackup = File(cacheDir, "pending_backup.json")
            if (tempBackup.exists()) {
                tempBackup.delete()
            }
        } catch (_: Exception) {}
        pendingBackupDisplayName = null
    }

    private fun cleanTempApk() {
        try {
            val tempApk = File(cacheDir, "temp_update.apk")
            if (tempApk.exists()) {
                tempApk.delete()
            }
        } catch (_: Exception) {}
    }

    private fun cleanTempFiles() {
        cleanTempApk()
        cleanPendingBackup()
    }

    fun dispatchBackupResult(status: String, displayName: String, message: String) {
        val qStatus = JSONObject.quote(status)
        val qDisplayName = JSONObject.quote(displayName)
        val qMessage = JSONObject.quote(message)
        runOnUiThread {
            webView.evaluateJavascript(
                "window.onBackupSaveResult && window.onBackupSaveResult($qStatus, $qDisplayName, $qMessage);",
                null
            )
        }
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
                if (url.startsWith("https://wa.me/") ||
                    url.startsWith("https://api.whatsapp.com/") ||
                    url.startsWith("whatsapp://")
                ) {
                    openWhatsAppChooser(url)
                    return true
                }
                if (url.startsWith("upi://") ||
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

        webView.setDownloadListener { url, _, _, _, _ ->
            if (url != null && !url.startsWith("blob:") && !url.startsWith("data:")) {
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(intent)
                } catch (_: Exception) {}
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage?): Boolean {
                if (consoleMessage != null) {
                    android.util.Log.d("GSTBillingJS", "${consoleMessage.sourceId()}:${consoleMessage.lineNumber()} -- ${consoleMessage.message()}")
                }
                return super.onConsoleMessage(consoleMessage)
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback

                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }

                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE)
                    return true
                } catch (e: Exception) {
                    fileUploadCallback?.onReceiveValue(null)
                    fileUploadCallback = null
                    return false
                }
            }
        }

        webView.addJavascriptInterface(AndroidBridge(this, webView, vibrator), "AndroidBridge")
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == FILE_CHOOSER_REQUEST_CODE) {
            if (fileUploadCallback != null) {
                val results: Array<Uri>? = if (resultCode == Activity.RESULT_OK && data != null) {
                    val dataString = data.dataString
                    val clipData = data.clipData
                    if (clipData != null) {
                        val count = clipData.itemCount
                        Array(count) { i -> clipData.getItemAt(i).uri }
                    } else if (dataString != null) {
                        arrayOf(Uri.parse(dataString))
                    } else {
                        null
                    }
                } else {
                    null
                }
                fileUploadCallback?.onReceiveValue(results)
                fileUploadCallback = null
            }
        } else if (requestCode == CREATE_BACKUP_DOCUMENT_REQUEST_CODE) {
            val displayName = pendingBackupDisplayName ?: "backup.json"
            if (resultCode == Activity.RESULT_OK) {
                val uri = data?.data
                val tempFile = File(cacheDir, "pending_backup.json")
                if (uri == null || !tempFile.exists()) {
                    cleanPendingBackup()
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "Failed to save backup: Backup payload missing", Toast.LENGTH_LONG).show()
                    }
                    dispatchBackupResult("ERROR", displayName, "Backup payload missing")
                } else {
                    Thread {
                        try {
                            contentResolver.openOutputStream(uri)?.use { os ->
                                tempFile.inputStream().use { input ->
                                    input.copyTo(os)
                                }
                                os.flush()
                            } ?: throw IOException("Failed to open destination stream")
                            cleanPendingBackup()
                            runOnUiThread {
                                Toast.makeText(this@MainActivity, "Backup saved: $displayName", Toast.LENGTH_LONG).show()
                            }
                            dispatchBackupResult("SUCCESS", displayName, "")
                        } catch (e: Exception) {
                            cleanPendingBackup()
                            runOnUiThread {
                                Toast.makeText(this@MainActivity, "Failed to save backup: ${e.message}", Toast.LENGTH_LONG).show()
                            }
                            dispatchBackupResult("ERROR", displayName, e.message ?: "Failed to save backup")
                        }
                    }.start()
                }
            } else {
                cleanPendingBackup()
                dispatchBackupResult("CANCELLED", displayName, "Backup cancelled")
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
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

    fun openWhatsAppChooser(url: String) {
        try {
            val uri = Uri.parse(url)
            val pm = packageManager
            val packages = listOf("com.whatsapp", "com.whatsapp.w4b")
            val availableIntents = mutableListOf<Intent>()

            for (pkg in packages) {
                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                    setPackage(pkg)
                }
                @Suppress("DEPRECATION")
                val resolveInfos = pm.queryIntentActivities(intent, 0)
                if (resolveInfos.isNotEmpty()) {
                    availableIntents.add(intent)
                }
            }

            when {
                availableIntents.size >= 2 -> {
                    val primaryIntent = availableIntents.removeAt(0)
                    val chooserIntent = Intent.createChooser(primaryIntent, "Open with WhatsApp").apply {
                        putExtra(Intent.EXTRA_INITIAL_INTENTS, availableIntents.toTypedArray())
                    }
                    startActivity(chooserIntent)
                }
                availableIntents.size == 1 -> {
                    startActivity(availableIntents[0])
                }
                else -> {
                    try {
                        val fallbackIntent = Intent(Intent.ACTION_VIEW, uri)
                        startActivity(Intent.createChooser(fallbackIntent, "Open with"))
                    } catch (_: Exception) {
                        Toast.makeText(this, "WhatsApp is not installed", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Unable to open WhatsApp: ${e.message}", Toast.LENGTH_SHORT).show()
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
    fun openWhatsAppUrl(url: String) {
        (context as? Activity)?.runOnUiThread {
            (context as? MainActivity)?.openWhatsAppChooser(url) ?: run {
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    context.startActivity(intent)
                } catch (_: Exception) {
                    Toast.makeText(context, "Unable to open WhatsApp", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

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

    // Device-scoped preferences. Used to preserve the CouchDB sync link across
    // WebView storage resets / app updates. Never used for business data.
    private fun devicePrefs() =
        context.getSharedPreferences("vyapar_device_prefs", Context.MODE_PRIVATE)

    @JavascriptInterface
    fun getPreference(key: String): String {
        return try {
            devicePrefs().getString(key, "") ?: ""
        } catch (_: Exception) {
            ""
        }
    }

    @JavascriptInterface
    fun setPreference(key: String, value: String) {
        try {
            devicePrefs().edit().putString(key, value).apply()
        } catch (_: Exception) {
            // Best-effort persistence.
        }
    }

    @JavascriptInterface
    fun removePreference(key: String) {
        try {
            devicePrefs().edit().remove(key).apply()
        } catch (_: Exception) {
            // Best-effort persistence.
        }
    }

    @JavascriptInterface
    fun downloadBackup(filename: String, jsonContent: String) {
        val safeName = if (filename.endsWith(".json")) filename else "$filename.json"
        if (Build.VERSION.SDK_INT < 29) {
            saveBackupWithPicker(safeName, jsonContent)
            return
        }

        Thread {
            var pendingUri: Uri? = null
            try {
                val values = ContentValues().apply {
                    put("_display_name", safeName)
                    put("mime_type", "application/json")
                    put("relative_path", "Download/GSTBilling")
                    put("is_pending", 1)
                }
                val downloadsUri = Class.forName("android.provider.MediaStore\$Downloads")
                    .getField("EXTERNAL_CONTENT_URI")
                    .get(null) as Uri
                val resolver = context.contentResolver
                val uri = resolver.insert(downloadsUri, values)
                    ?: throw IOException("Failed to create Downloads entry")
                pendingUri = uri

                resolver.openOutputStream(uri)?.use { os ->
                    os.write(jsonContent.toByteArray(Charsets.UTF_8))
                    os.flush()
                } ?: throw IOException("Failed to open Downloads output stream")

                values.clear()
                values.put("is_pending", 0)
                resolver.update(uri, values, null, null)

                dispatchBackupResult("SUCCESS", safeName, "")
            } catch (e: Exception) {
                if (pendingUri != null) {
                    try { context.contentResolver.delete(pendingUri, null, null) } catch (_: Exception) {}
                }
                // Never fail the user action: fall back to the permissionless SAF picker.
                saveBackupWithPicker(safeName, jsonContent)
            }
        }.start()
    }

    @JavascriptInterface
    fun saveBackupWithPicker(filename: String, jsonContent: String) {
        val safeName = if (filename.endsWith(".json")) filename else "$filename.json"
        (context as? MainActivity)?.let { act ->
            act.runOnUiThread {
                try {
                    val tempFile = File(act.cacheDir, "pending_backup.json")
                    tempFile.writeText(jsonContent, Charsets.UTF_8)
                    act.pendingBackupDisplayName = safeName

                    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "application/json"
                        putExtra(Intent.EXTRA_TITLE, safeName)
                    }
                    act.startActivityForResult(intent, MainActivity.CREATE_BACKUP_DOCUMENT_REQUEST_CODE)
                } catch (e: Exception) {
                    act.cleanPendingBackup()
                    act.dispatchBackupResult("ERROR", safeName, e.message ?: "Failed to open save file picker")
                }
            }
        }
    }

    private fun dispatchBackupResult(status: String, displayName: String, message: String) {
        (context as? MainActivity)?.dispatchBackupResult(status, displayName, message)
    }

    @JavascriptInterface
    fun checkBluetoothStatus(): String {
        val bluetoothAdapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter()
        if (bluetoothAdapter == null) {
            return "UNSUPPORTED"
        }
        return if (bluetoothAdapter.isEnabled) "ENABLED" else "DISABLED"
    }

    @JavascriptInterface
    fun enableBluetooth() {
        val bluetoothAdapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter()
        if (bluetoothAdapter?.isEnabled == false) {
            (context as? Activity)?.runOnUiThread {
                try {
                    val enableBtIntent = Intent(android.bluetooth.BluetoothAdapter.ACTION_REQUEST_ENABLE)
                    context.startActivity(enableBtIntent)
                } catch (e: Exception) {
                    Toast.makeText(context, "Could not open Bluetooth settings", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    @JavascriptInterface
    fun getPairedPrinters(): String {
        try {
            val bluetoothAdapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter()
            if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
                return "[]"
            }
            val pairedDevices = bluetoothAdapter.bondedDevices
            val printers = mutableListOf<String>()
            if (pairedDevices != null) {
                for (device in pairedDevices) {
                    val name = device.name ?: "Unknown"
                    val address = device.address
                    printers.add("{\"name\":\"${name.replace("\"", "\\\"")}\", \"address\":\"$address\"}")
                }
            }
            return "[${printers.joinToString(",")}]"
        } catch (e: Exception) {
            return "[]"
        }
    }

    @JavascriptInterface
    fun printToBluetoothDevice(macAddress: String, base64Data: String): String {
        var socket: android.bluetooth.BluetoothSocket? = null
        try {
            val bluetoothAdapter = android.bluetooth.BluetoothAdapter.getDefaultAdapter()
            if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
                return "Bluetooth is disabled"
            }
            val device = bluetoothAdapter.getRemoteDevice(macAddress)
            val uuid = java.util.UUID.fromString("00001101-0000-1000-8000-00805F9B34FB") // SPP UUID
            socket = device.createRfcommSocketToServiceRecord(uuid)
            
            try {
                bluetoothAdapter.cancelDiscovery()
            } catch (e: Exception) {}
            
            socket.connect()
            val outputStream = socket.outputStream
            val decodedBytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
            
            // Pace transmission with 128-byte chunks and 30ms sleep to avoid buffer overrun on serial microcontrollers
            val chunkSize = 128
            for (i in decodedBytes.indices step chunkSize) {
                val end = kotlin.math.min(decodedBytes.size, i + chunkSize)
                outputStream.write(decodedBytes, i, end - i)
                outputStream.flush()
                Thread.sleep(30)
            }
            
            outputStream.flush()
            // Wait for thermal printer mechanism to process its input buffer completely before closing RFCOMM socket.
            // Thermal printers print at ~60-90mm/s (approx 20-30 lines/sec); closing the socket immediately drops
            // pending hardware buffer midway.
            val drainTimeMs = kotlin.math.max(1600L, (decodedBytes.size / 64).toLong() * 30L)
            Thread.sleep(drainTimeMs)
            
            return "SUCCESS"
        } catch (e: Exception) {
            return "Error: ${e.message}"
        } finally {
            try {
                socket?.close()
            } catch (e: Exception) {}
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

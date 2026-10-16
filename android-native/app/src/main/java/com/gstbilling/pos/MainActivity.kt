package com.gstbilling.pos

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
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

    companion object {
        const val FILE_CHOOSER_REQUEST_CODE = 2001
        const val STORAGE_PERMISSION_REQUEST_CODE = 102
    }

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
        
        // Request Storage permissions for Android 6.0+ (API 23+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val storagePermissions = arrayOf(
                android.Manifest.permission.READ_EXTERNAL_STORAGE,
                android.Manifest.permission.WRITE_EXTERNAL_STORAGE
            ).filter { checkSelfPermission(it) != android.content.pm.PackageManager.PERMISSION_GRANTED }
            if (storagePermissions.isNotEmpty()) {
                requestPermissions(storagePermissions.toTypedArray(), STORAGE_PERMISSION_REQUEST_CODE)
            }
        }

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
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == STORAGE_PERMISSION_REQUEST_CODE) {
            val allGranted = grantResults.isNotEmpty() && grantResults.all { it == android.content.pm.PackageManager.PERMISSION_GRANTED }
            val status = if (allGranted) "GRANTED" else "DENIED"
            webView.evaluateJavascript("window.onStoragePermissionResult && window.onStoragePermissionResult('$status');", null)
        }
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
    fun hasStoragePermission(): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= 30) {
                var isManager = false
                try {
                    val method = Environment::class.java.getMethod("isExternalStorageManager")
                    isManager = method.invoke(null) as? Boolean ?: false
                } catch (_: Exception) {}
                isManager || context.checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_GRANTED
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val read = context.checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_GRANTED
                val write = context.checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == android.content.pm.PackageManager.PERMISSION_GRANTED
                read && write
            } else {
                true
            }
        } catch (_: Exception) {
            true
        }
    }

    @JavascriptInterface
    fun requestStoragePermission() {
        (context as? Activity)?.let { act ->
            act.runOnUiThread {
                try {
                    if (Build.VERSION.SDK_INT >= 30) {
                        try {
                            val intent = Intent("android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION").apply {
                                data = Uri.parse("package:${context.packageName}")
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                            context.startActivity(intent)
                        } catch (e: Exception) {
                            val intent = Intent("android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION").apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                            context.startActivity(intent)
                        }
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        act.requestPermissions(
                            arrayOf(
                                android.Manifest.permission.READ_EXTERNAL_STORAGE,
                                android.Manifest.permission.WRITE_EXTERNAL_STORAGE
                            ),
                            MainActivity.STORAGE_PERMISSION_REQUEST_CODE
                        )
                    }
                } catch (e: Exception) {
                    Toast.makeText(context, "Could not open storage permission settings", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    @JavascriptInterface
    fun saveBackupToStorage(filename: String, jsonContent: String): String {
        return try {
            val safeName = if (filename.endsWith(".json")) filename else "$filename.json"
            val targetFile = try {
                val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                val vyaparDir = File(downloadsDir, "GSTBilling")
                if (!vyaparDir.exists()) vyaparDir.mkdirs()
                val f = File(vyaparDir, safeName)
                f.writeText(jsonContent, Charsets.UTF_8)
                f
            } catch (_: Exception) {
                val appDir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
                val f = File(appDir, safeName)
                f.writeText(jsonContent, Charsets.UTF_8)
                f
            }

            try {
                MediaScannerConnection.scanFile(context, arrayOf(targetFile.absolutePath), arrayOf("application/json"), null)
            } catch (_: Exception) {}

            (context as? Activity)?.runOnUiThread {
                Toast.makeText(context, "Database backup saved: ${targetFile.name}", Toast.LENGTH_LONG).show()
            }
            "SUCCESS:${targetFile.absolutePath}"
        } catch (e: Exception) {
            (context as? Activity)?.runOnUiThread {
                Toast.makeText(context, "Failed to save backup: ${e.message}", Toast.LENGTH_LONG).show()
            }
            "ERROR:${e.message}"
        }
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

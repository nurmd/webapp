package android.print

import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import java.io.File

class PdfPrint(private val printAttributes: PrintAttributes) {

    interface Callback {
        fun onSuccess()
        fun onFailure(error: String)
    }

    fun print(adapter: PrintDocumentAdapter, outputFile: File, callback: Callback) {
        val cancellationSignal = CancellationSignal()

        adapter.onLayout(
            null,
            printAttributes,
            cancellationSignal,
            object : PrintDocumentAdapter.LayoutResultCallback() {
                override fun onLayoutFinished(info: PrintDocumentInfo?, changed: Boolean) {
                    try {
                        val pfd = ParcelFileDescriptor.open(
                            outputFile,
                            ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_READ_WRITE or ParcelFileDescriptor.MODE_TRUNCATE
                        )

                        adapter.onWrite(
                            arrayOf(PageRange.ALL_PAGES),
                            pfd,
                            cancellationSignal,
                            object : PrintDocumentAdapter.WriteResultCallback() {
                                override fun onWriteFinished(pages: Array<PageRange>?) {
                                    try {
                                        pfd.close()
                                    } catch (_: Exception) {}
                                    callback.onSuccess()
                                }

                                override fun onWriteFailed(error: CharSequence?) {
                                    try {
                                        pfd.close()
                                    } catch (_: Exception) {}
                                    callback.onFailure(error?.toString() ?: "Write failed")
                                }

                                override fun onWriteCancelled() {
                                    try {
                                        pfd.close()
                                    } catch (_: Exception) {}
                                    callback.onFailure("Write cancelled")
                                }
                            }
                        )
                    } catch (e: Exception) {
                        callback.onFailure(e.message ?: "Failed to open output file")
                    }
                }

                override fun onLayoutFailed(error: CharSequence?) {
                    callback.onFailure(error?.toString() ?: "Layout failed")
                }

                override fun onLayoutCancelled() {
                    callback.onFailure("Layout cancelled")
                }
            },
            Bundle()
        )
    }
}

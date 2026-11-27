package com.camnotlar.app.data.repo

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import com.camnotlar.app.data.Html
import com.camnotlar.app.data.db.AppDatabase
import com.camnotlar.app.data.db.AttachmentEntity
import com.camnotlar.app.data.net.ApiClient
import com.camnotlar.app.data.net.ApiException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException

class TooLargeException(val fileName: String, val max: Long) : IOException("$fileName çok büyük")

/**
 * Not ekleri (web'deki lib/attachments.ts karşılığı). Dosya önce cihaza kopyalanır ve nota
 * hemen eklenir; sunucu oturumu varsa eşitleme motoru yükler. Görüntülerken yerel kopya yoksa indirilir.
 */
class Attachments(private val context: Context, private val db: AppDatabase, private val api: ApiClient) {
    private val dir = File(context.filesDir, "attachments").apply { mkdirs() }
    fun file(id: String) = File(dir, id)

    private fun isImage(mime: String) = Regex("^image/(png|jpe?g|gif|webp|avif|heic|heif|bmp)$", RegexOption.IGNORE_CASE).matches(mime)

    private fun nameOf(uri: Uri): String = runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }
    }.getOrNull() ?: uri.lastPathSegment?.substringAfterLast('/') ?: "dosya"

    /** Seçilen dosyayı kopyalar, kaydeder ve nota eklenecek HTML'i döner. */
    suspend fun add(uri: Uri, maxBytes: Long): String = withContext(Dispatchers.IO) {
        val id = Uuid7.next()
        val name = nameOf(uri).take(200)
        val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
        val dest = file(id)
        context.contentResolver.openInputStream(uri)?.use { input -> dest.outputStream().use { input.copyTo(it) } }
            ?: throw IOException("Dosya okunamadı")
        if (dest.length() > maxBytes) {
            dest.delete()
            throw TooLargeException(name, maxBytes)
        }
        db.attachments().upsert(AttachmentEntity(id, name, mime, dest.length(), uploaded = false, createdAt = System.currentTimeMillis()))
        val esc = Html.escape(name)
        if (isImage(mime)) "<div><img class=\"att\" data-att=\"$id\" alt=\"$esc\"></div>" else "<div><span class=\"file\" data-att=\"$id\">$esc</span></div>"
    }

    /** Yerel dosya; yoksa (başka cihazdan gelen ek) sunucudan indirilir. */
    suspend fun ensureLocal(id: String): Pair<File, AttachmentEntity>? {
        val f = file(id)
        val row = db.attachments().get(id)
        if (f.exists() && row != null) return f to row
        return runCatching {
            val (mime, name) = api.downloadAttachment(id, f)
            val e = AttachmentEntity(id, name, mime, f.length(), uploaded = true, createdAt = System.currentTimeMillis())
            db.attachments().upsert(e)
            f to e
        }.getOrNull()
    }

    /** Editörde göstermek için data: adresi (WebView dosya erişimi kapalı). */
    suspend fun dataUrl(id: String): String? = withContext(Dispatchers.IO) {
        val (f, row) = ensureLocal(id) ?: return@withContext null
        "data:${row.mime};base64," + Base64.encodeToString(f.readBytes(), Base64.NO_WRAP)
    }

    /** Bekleyen ekleri yükler; kalıcı hatada (çok büyük, geçersiz) bir daha denenmez. */
    suspend fun uploadPending(onRejected: (String, String) -> Unit) {
        for (a in db.attachments().pending()) {
            val f = file(a.id)
            if (!f.exists()) {
                db.attachments().markUploaded(a.id)
                continue
            }
            try {
                api.uploadAttachment(a.id, f, a.mime, a.name)
                db.attachments().markUploaded(a.id)
            } catch (e: ApiException) {
                if (e.status in 400..499 && e.status != 401) {
                    db.attachments().markUploaded(a.id)
                    onRejected(a.name, e.message ?: "")
                } else throw e
            }
        }
    }

    fun observePending() = db.attachments().observePending()

    suspend fun clear() = withContext(Dispatchers.IO) {
        db.attachments().clear()
        dir.listFiles()?.forEach { it.delete() }
    }
}

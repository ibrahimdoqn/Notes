package com.camnotlar.app.ui

import android.app.Application
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.camnotlar.app.CamApp
import com.camnotlar.app.Session
import com.camnotlar.app.data.Html
import com.camnotlar.app.data.db.FolderEntity
import com.camnotlar.app.data.db.NoteEntity
import com.camnotlar.app.data.net.ApiException
import com.camnotlar.app.data.net.DeviceDto
import com.camnotlar.app.data.net.LoginRequest
import com.camnotlar.app.data.net.RevisionDto
import com.camnotlar.app.data.prefs.Prefs
import com.camnotlar.app.data.sync.SyncState
import com.camnotlar.app.ui.common.Seed
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.IOException

/** Görünüm filtresi: tüm notlar, sabitlenmiş, çöp kutusu ya da bir klasör kimliği. */
object Views {
    const val ALL = "all"
    const val PINNED = "pinned"
    const val TRASH = "trash"
}

fun inView(n: NoteEntity, v: String): Boolean = when {
    v == Views.TRASH -> n.trashedAt != null
    n.trashedAt != null -> false
    v == Views.ALL -> true
    v == Views.PINNED -> n.pinned
    else -> n.folderId == v
}

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val c = (app as CamApp).container
    private val repo = c.repo
    private val started = SharingStarted.WhileSubscribed(5_000)

    val session: StateFlow<Session?> = c.session
    val authLost: StateFlow<Boolean> = c.authLostFlow
    val notes: StateFlow<List<NoteEntity>> = repo.notes.stateIn(viewModelScope, started, emptyList())
    val folders: StateFlow<List<FolderEntity>> = repo.folders.stateIn(viewModelScope, started, emptyList())
    val prefs: StateFlow<Prefs> = repo.prefs.stateIn(viewModelScope, SharingStarted.Eagerly, Prefs())
    val pending: StateFlow<Int> = repo.pending.stateIn(viewModelScope, started, 0)
    val syncState: StateFlow<SyncState> = c.sync.state
    val pendingFiles: StateFlow<Int> = c.attachments.observePending().stateIn(viewModelScope, started, 0)

    init {
        c.sync.onAttachmentRejected = { name, msg -> toast("“$name” yüklenemedi: $msg") }
    }

    private val _toast = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val toast: SharedFlow<String> = _toast
    fun toast(m: String) {
        _toast.tryEmit(m)
    }

    fun note(id: String) = repo.note(id)

    /* ---- notlar ---- */

    suspend fun createNote(view: String, html: String = "<div><br></div>"): NoteEntity {
        val folder = repo.ensureFolder(view.takeIf { it != Views.ALL && it != Views.PINNED && it != Views.TRASH })
        val n = repo.newNote(folder, pinned = view == Views.PINNED, html = html)
        if (html != "<div><br></div>") repo.saveNote(n)
        return n
    }

    /** Paylaş menüsünden gelen metin ve dosyalarla not. */
    suspend fun createNoteWith(view: String, html: String?, files: List<android.net.Uri>): NoteEntity {
        if (files.isEmpty()) return if (html != null) createNote(view, html) else createNote(view)
        val att = addAttachments(files)
        return createNote(view, (html ?: "<div>Paylaşılan dosyalar</div>") + att)
    }

    fun saveHtml(id: String, html: String) = viewModelScope.launch {
        val n = repo.getNote(id) ?: return@launch
        if (n.html == html || n.trashedAt != null) return@launch
        repo.saveNote(n.copy(html = html, updatedAt = System.currentTimeMillis()))
    }

    /** Editörden çıkarken son içerik yazılır; boş bırakılan not sessizce silinir. */
    fun finishEditing(id: String, html: String, dropEmpty: Boolean = true) = viewModelScope.launch {
        val n = repo.getNote(id) ?: return@launch
        if (n.trashedAt != null) return@launch
        if (dropEmpty && Html.isBlank(html.ifEmpty { n.html })) repo.deleteNoteForever(n)
        else if (html.isNotEmpty() && html != n.html) repo.saveNote(n.copy(html = html, updatedAt = System.currentTimeMillis()))
    }

    fun togglePin(n: NoteEntity) = viewModelScope.launch {
        repo.saveNote(n.copy(pinned = !n.pinned))
        toast(if (!n.pinned) "Not sabitlendi" else "Sabitleme kaldırıldı")
    }

    fun move(n: NoteEntity, folderId: String) = viewModelScope.launch {
        repo.saveNote(n.copy(folderId = folderId))
        toast("“${folders.value.find { it.id == folderId }?.name ?: "Notlar"}” klasörüne taşındı")
    }

    fun trash(n: NoteEntity) = viewModelScope.launch { repo.saveNote(n.copy(trashedAt = System.currentTimeMillis())) }

    fun restore(n: NoteEntity) = viewModelScope.launch {
        val folder = repo.ensureFolder(n.folderId)
        repo.saveNote(n.copy(trashedAt = null, folderId = folder))
        toast("Not geri alındı")
    }

    fun deleteForever(n: NoteEntity) = viewModelScope.launch { repo.deleteNoteForever(n) }

    fun restoreRevision(n: NoteEntity, r: RevisionDto) = viewModelScope.launch {
        repo.saveNote(n.copy(html = r.html, updatedAt = System.currentTimeMillis()))
        toast("Sürüm ${r.version} geri yüklendi")
    }

    /* ---- ekler ---- */

    /** Seçilen dosyaları saklar ve nota eklenecek HTML'i döner. */
    suspend fun addAttachments(uris: List<android.net.Uri>): String {
        val max = repo.meta("maxAttachmentBytes")?.toLongOrNull() ?: (25L * 1024 * 1024)
        val parts = mutableListOf<String>()
        for (u in uris) {
            try {
                parts += c.attachments.add(u, max)
            } catch (e: com.camnotlar.app.data.repo.TooLargeException) {
                toast("“${e.fileName}” en fazla ${max / 1024 / 1024} MB olabilir")
            } catch (e: Exception) {
                toast(e.message ?: "Dosya eklenemedi")
            }
        }
        return parts.joinToString("")
    }

    suspend fun attachmentDataUrl(id: String) = c.attachments.dataUrl(id)
    suspend fun attachmentFile(id: String) = c.attachments.ensureLocal(id)

    suspend fun revisions(noteId: String): Result<List<RevisionDto>> = runCatching { c.api.revisions(noteId) }

    /* ---- klasörler ---- */

    fun newFolder(name: String, then: (String) -> Unit = {}) = viewModelScope.launch { then(repo.makeFolder(name).id) }
    fun renameFolder(f: FolderEntity, name: String) = viewModelScope.launch { repo.saveFolder(f.copy(name = name.take(60))) }
    fun deleteFolder(f: FolderEntity) = viewModelScope.launch { repo.deleteFolder(f) }

    /* ---- ayarlar ---- */

    fun updatePrefs(p: Prefs) = viewModelScope.launch { repo.savePrefs(p) }

    fun addSamples() = viewModelScope.launch {
        val s = Seed.build(repo)
        toast("${s} örnek not eklendi")
    }

    fun syncNow() = viewModelScope.launch { c.sync.syncNow() }

    suspend fun devices(): Result<List<DeviceDto>> = runCatching { c.api.devices() }
    suspend fun revokeDevice(id: String): Result<Unit> = runCatching { c.api.revokeDevice(id) }

    /* ---- oturum ---- */

    /** Giriş/kayıt. Hata mesajı döner; başarıda null. */
    suspend fun authenticate(server: String, username: String, password: String): String? {
        return try {
            val (url, info) = c.api.resolveServer(server)
            if (info.needsSetup) return "Bu sunucu henüz kurulmadı; önce tarayıcıda /yonetim/ sayfasından yönetici hesabını oluştur."
            c.api.setServer(url)
            repo.setMeta("maxAttachmentBytes", info.maxAttachmentBytes.toString())
            val prev = c.session.value
            val deviceId = repo.meta("deviceId")
            val r = c.api.authenticate(
                "login",
                LoginRequest(username.trim(), password, deviceName = "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}".take(60), deviceId = deviceId),
            )
            if (prev?.mode == "server" && prev.userId != r.user.id) {
                repo.clearAll()
                c.attachments.clear()
            }
            repo.setMeta("deviceId", r.deviceId)
            val wasLocal = prev?.mode == "local"
            if (wasLocal) {
                repo.setMeta("lastSeq", "0")
                runCatching { repo.adoptServerFolders(c.api.folders()) }
            }
            c.setSession(Session("server", r.user.id, r.user.username, c.api.baseUrl))
            c.sync.syncNow()
            toast(if (wasLocal) "Bağlandı; bu cihazdaki notlar hesabına eşitleniyor" else "Hoş geldin, ${r.user.displayName.ifBlank { r.user.username }}")
            null
        } catch (e: ApiException) {
            e.message
        } catch (e: IOException) {
            "Sunucuya ulaşılamadı. Adresi kontrol et."
        } catch (e: Exception) {
            e.message ?: "Beklenmeyen hata"
        }
    }

    fun useLocal() = viewModelScope.launch {
        c.setSession(Session("local"))
        if (repo.pendingCount() == 0 && folders.value.isEmpty()) Seed.build(repo)
    }

    fun logout() = viewModelScope.launch {
        c.api.logout()
        repo.clearAll()
        c.attachments.clear()
        c.setSession(null)
    }

    suspend fun serverInfo(server: String) = runCatching { c.api.resolveServer(server) }
    fun lastServer(): String = c.api.baseUrl
}

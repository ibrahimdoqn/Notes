package com.camnotlar.app.data.repo

import androidx.room.withTransaction
import com.camnotlar.app.data.Html
import com.camnotlar.app.data.db.AppDatabase
import com.camnotlar.app.data.db.FolderEntity
import com.camnotlar.app.data.db.MetaEntity
import com.camnotlar.app.data.db.NoteEntity
import com.camnotlar.app.data.db.OutboxEntity
import com.camnotlar.app.data.net.FolderDto
import com.camnotlar.app.data.net.NoteDto
import com.camnotlar.app.data.prefs.Prefs
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Yerel yazma katmanı (web'deki store/repo.ts karşılığı): her değişiklik önce Room'a yazılır
 * ve eşitlenmek üzere outbox kuyruğuna eklenir. Arayüz hiçbir zaman sunucuyu beklemez.
 */
class NotesRepository(private val db: AppDatabase, private val json: Json) {
    private var rev = System.currentTimeMillis()
    /** Eşitleme motoru kuyruk değişince haber alır (2 sn sonra push). */
    var onLocalChange: (() -> Unit)? = null

    val notes: Flow<List<NoteEntity>> = db.notes().observeAll()
    val folders: Flow<List<FolderEntity>> = db.folders().observeAll()
    val pending: Flow<Int> = db.outbox().observeCount()
    val prefs: Flow<Prefs> = db.meta().observe("prefs").map { Prefs.parse(it) }
    fun note(id: String) = db.notes().observe(id)

    suspend fun getNote(id: String) = db.notes().get(id)
    suspend fun meta(key: String) = db.meta().get(key)
    suspend fun setMeta(key: String, value: String) = db.meta().put(MetaEntity(key, value))

    /** Kuyruğa ekler ya da aynı kaydın bekleyen yazımıyla birleştirir. */
    private suspend fun queue(entity: String, id: String, op: String, baseVersion: Int, data: JsonElement?) {
        val key = "$entity:$id"
        val prev = db.outbox().get(key)
        if (op == "delete" && baseVersion == 0 && (prev == null || prev.baseVersion == 0)) {
            if (prev != null) db.outbox().delete(key)
            return
        }
        db.outbox().upsert(
            OutboxEntity(
                key = key, entity = entity, id = id, op = op, baseVersion = prev?.baseVersion ?: baseVersion,
                dataJson = data?.let { json.encodeToString(JsonElement.serializer(), it) }, rev = ++rev, at = prev?.at ?: System.currentTimeMillis(),
            ),
        )
    }

    private fun noteData(n: NoteEntity): JsonObject = buildJsonObject {
        put("folderId", n.folderId)
        put("html", n.html)
        put("pinned", n.pinned)
        put("createdAt", n.createdAt)
        put("updatedAt", n.updatedAt)
        put("trashedAt", n.trashedAt)
    }

    fun withMeta(n: NoteEntity): NoteEntity {
        val m = Html.meta(n.html)
        return n.copy(title = m.title, snippet = m.snippet, plain = m.plain, words = m.words)
    }

    suspend fun saveNote(n: NoteEntity): NoteEntity {
        val full = withMeta(n)
        db.withTransaction {
            db.notes().upsert(full)
            queue("note", full.id, "upsert", full.version, noteData(full))
        }
        onLocalChange?.invoke()
        return full
    }

    suspend fun newNote(folderId: String?, pinned: Boolean = false, html: String = "<div><br></div>"): NoteEntity {
        val now = System.currentTimeMillis()
        val n = withMeta(NoteEntity(Uuid7.next(now), folderId, html, "", "", "", 0, pinned, now, now, null, 0))
        db.notes().upsert(n)
        return n
    }

    suspend fun deleteNoteForever(n: NoteEntity) {
        db.withTransaction {
            db.notes().delete(n.id)
            queue("note", n.id, "delete", n.version, null)
        }
        onLocalChange?.invoke()
    }

    suspend fun saveFolder(f: FolderEntity) {
        val now = f.copy(updatedAt = System.currentTimeMillis())
        db.withTransaction {
            db.folders().upsert(now)
            queue("folder", f.id, "upsert", f.version, buildJsonObject { put("name", f.name); put("sortOrder", f.sortOrder) })
        }
        onLocalChange?.invoke()
    }

    suspend fun makeFolder(name: String): FolderEntity {
        val order = (db.folders().all().maxOfOrNull { it.sortOrder } ?: -1) + 1
        val f = FolderEntity(Uuid7.next(), name.take(60), order, 0, System.currentTimeMillis())
        saveFolder(f)
        return f
    }

    /** Klasör silinir, içindeki etkin notlar Son Silinenler'e taşınır. */
    suspend fun deleteFolder(f: FolderEntity) {
        val now = System.currentTimeMillis()
        db.withTransaction {
            for (n in db.notes().inFolder(f.id).filter { it.trashedAt == null }) {
                val t = n.copy(trashedAt = now)
                db.notes().upsert(t)
                queue("note", t.id, "upsert", t.version, noteData(t))
            }
            db.folders().delete(f.id)
            queue("folder", f.id, "delete", f.version, null)
        }
        onLocalChange?.invoke()
    }

    suspend fun ensureFolder(preferred: String?): String {
        val all = db.folders().all()
        if (preferred != null && all.any { it.id == preferred }) return preferred
        return all.firstOrNull()?.id ?: makeFolder("Notlar").id
    }

    suspend fun savePrefs(p: Prefs) {
        val v = db.meta().get("prefsVersion")?.toIntOrNull() ?: 0
        val data = json.encodeToJsonElement(Prefs.serializer(), p)
        db.withTransaction {
            db.meta().put(MetaEntity("prefs", json.encodeToString(JsonElement.serializer(), data)))
            queue("settings", "me", "upsert", v, data)
        }
        onLocalChange?.invoke()
    }

    suspend fun pendingCount() = db.outbox().count()

    suspend fun clearAll() = db.withTransaction {
        db.notes().clear()
        db.folders().clear()
        db.outbox().clear()
        db.meta().clear()
    }

    /* ---- eşitleme motorunun kullandığı alt düzey işlemler ---- */

    suspend fun outboxBatch(limit: Int) = db.outbox().batch(limit)

    suspend fun ackPushed(sent: OutboxEntity, status: String, version: Int?, serverFolderId: String?) = db.withTransaction {
        val now = db.outbox().get(sent.key)
        when (status) {
            "gone" -> {
                if (sent.entity == "note") db.notes().delete(sent.id)
                if (sent.entity == "folder") db.folders().delete(sent.id)
                db.outbox().delete(sent.key)
                return@withTransaction
            }
            "invalid" -> {
                db.outbox().delete(sent.key)
                return@withTransaction
            }
        }
        if (version != null) {
            when (sent.entity) {
                "note" -> db.notes().get(sent.id)?.let { n ->
                    val folder = if (serverFolderId != null && now?.rev == sent.rev) serverFolderId else n.folderId
                    db.notes().upsert(n.copy(version = version, folderId = folder))
                }
                "folder" -> db.folders().setVersion(sent.id, version)
                else -> db.meta().put(MetaEntity("prefsVersion", version.toString()))
            }
        }
        if (now != null && now.rev == sent.rev) db.outbox().delete(sent.key)
        else if (now != null && version != null) db.outbox().upsert(now.copy(baseVersion = version))
    }

    /** Sunucudan gelenleri uygular; bekleyen yerel yazımı olan kayıtlar atlanır. Dokunulan kayıt sayısını döner. */
    suspend fun applyRemote(changes: List<com.camnotlar.app.data.net.ChangeOut>, seq: Long): Int = db.withTransaction {
        var touched = 0
        for (c in changes) {
            val key = if (c.entity == "settings") "settings:me" else "${c.entity}:${c.id}"
            if (db.outbox().get(key) != null) continue
            when (c.entity) {
                "note" -> if (c.op == "delete" || c.data == null) db.notes().delete(c.id) else {
                    val n = json.decodeFromJsonElement(NoteDto.serializer(), c.data)
                    db.notes().upsert(withMeta(NoteEntity(n.id, n.folderId, n.html, n.title, n.snippet, "", 0, n.pinned, n.createdAt, n.updatedAt, n.trashedAt, n.version)))
                }
                "folder" -> if (c.op == "delete" || c.data == null) db.folders().delete(c.id) else {
                    val f = json.decodeFromJsonElement(FolderDto.serializer(), c.data)
                    db.folders().upsert(FolderEntity(f.id, f.name, f.sortOrder, f.version, f.updatedAt))
                }
                "settings" -> {
                    val p = Prefs.normalize(c.data)
                    db.meta().put(MetaEntity("prefs", json.encodeToString(Prefs.serializer(), p)))
                    db.meta().put(MetaEntity("prefsVersion", c.version.toString()))
                }
            }
            touched++
        }
        db.meta().put(MetaEntity("lastSeq", seq.toString()))
        touched
    }

    /** Sunucusuz kullanılmış cihazda girişte aynı adlı yerel klasörler sunucudakilerle birleşir. */
    suspend fun adoptServerFolders(server: List<FolderDto>) = db.withTransaction {
        val byName = server.associateBy { it.name.lowercase() }
        for (lf in db.folders().all()) {
            val sf = byName[lf.name.lowercase()] ?: continue
            if (lf.version != 0) continue
            for (n in db.notes().inFolder(lf.id)) {
                db.notes().upsert(n.copy(folderId = sf.id))
                db.outbox().get("note:${n.id}")?.let { o ->
                    val data = o.dataJson?.let { json.parseToJsonElement(it) as? JsonObject }
                    val patched = data?.let { JsonObject(it + ("folderId" to kotlinx.serialization.json.JsonPrimitive(sf.id))) }
                    db.outbox().upsert(o.copy(dataJson = patched?.toString()))
                }
            }
            db.folders().delete(lf.id)
            db.outbox().delete("folder:${lf.id}")
            db.folders().upsert(FolderEntity(sf.id, sf.name, sf.sortOrder, sf.version, sf.updatedAt))
        }
    }
}

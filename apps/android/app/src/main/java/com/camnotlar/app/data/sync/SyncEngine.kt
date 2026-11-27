package com.camnotlar.app.data.sync

import com.camnotlar.app.data.net.ApiClient
import com.camnotlar.app.data.net.ApiException
import com.camnotlar.app.data.net.ChangeIn
import com.camnotlar.app.data.net.PUSH_LIMIT
import com.camnotlar.app.data.net.PushRequest
import com.camnotlar.app.data.repo.NotesRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonPrimitive
import java.io.IOException

sealed interface SyncState {
    data object Local : SyncState
    data object Syncing : SyncState
    data class Synced(val at: Long) : SyncState
    data class Offline(val pending: Int) : SyncState
    data class Error(val message: String, val pending: Int) : SyncState
    data object AuthLost : SyncState
}

/**
 * Push/pull döngüsü (web'deki sync/engine.ts karşılığı). Uygulama açıkken yerel yazımdan 2 sn sonra,
 * WebSocket sinyalinde ve ağ geldiğinde; kapalıyken WorkManager ile 15 dakikada bir çalışır.
 */
class SyncEngine(
    private val api: ApiClient,
    private val repo: NotesRepository,
    private val scope: CoroutineScope,
    private val userId: () -> String?,
) {
    private val _state = MutableStateFlow<SyncState>(SyncState.Local)
    val state: StateFlow<SyncState> = _state
    private val mutex = Mutex()
    private var scheduled: Job? = null
    private var failures = 0
    var enabled = false

    fun schedule(delayMs: Long = 2000) {
        if (!enabled) return
        scheduled?.cancel()
        scheduled = scope.launch {
            delay(delayMs)
            syncNow()
        }
    }

    suspend fun syncNow(): Boolean {
        if (!enabled) return false
        if (mutex.isLocked) {
            schedule(500)
            return false
        }
        return mutex.withLock {
            _state.value = SyncState.Syncing
            try {
                pushAll()
                pullAll()
                failures = 0
                _state.value = SyncState.Synced(System.currentTimeMillis())
                true
            } catch (e: ApiException) {
                val pending = repo.pendingCount()
                if (e.status == 401) _state.value = SyncState.AuthLost
                else {
                    _state.value = SyncState.Error(e.message ?: "Eşitlenemedi", pending)
                    retryLater()
                }
                false
            } catch (e: IOException) {
                _state.value = SyncState.Offline(repo.pendingCount())
                retryLater()
                false
            }
        }
    }

    private fun retryLater() {
        failures++
        schedule(minOf(300_000L, 2000L shl minOf(failures, 8)))
    }

    private suspend fun pushAll() {
        repeat(50) {
            val batch = repo.outboxBatch(PUSH_LIMIT)
            if (batch.isEmpty()) return
            val uid = userId() ?: return
            val changes = batch.map {
                ChangeIn(
                    entity = it.entity, id = if (it.entity == "settings") uid else it.id, op = it.op, baseVersion = it.baseVersion,
                    data = it.dataJson?.let { s -> api.json.parseToJsonElement(s) },
                )
            }
            val res = api.push(PushRequest(changes))
            batch.zip(res.results).forEach { (sent, r) ->
                val folder = (r.data?.get("folderId") as? JsonElement)?.jsonPrimitive?.content?.takeIf { r.entity == "note" && it != "null" }
                repo.ackPushed(sent, r.status, r.version, folder)
            }
            if (batch.size < PUSH_LIMIT) return
        }
    }

    private suspend fun pullAll() {
        var since = repo.meta("lastSeq")?.toLongOrNull() ?: 0L
        repeat(200) {
            val p = api.pull(since)
            repo.applyRemote(p.changes, p.seq)
            since = p.seq
            if (!p.hasMore) return
        }
    }

    fun markLocal() {
        enabled = false
        scheduled?.cancel()
        _state.value = SyncState.Local
    }
}

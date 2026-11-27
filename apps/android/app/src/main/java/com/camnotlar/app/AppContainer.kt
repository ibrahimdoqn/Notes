package com.camnotlar.app

import android.content.Context
import com.camnotlar.app.data.db.AppDatabase
import com.camnotlar.app.data.net.ApiClient
import com.camnotlar.app.data.net.SecureStore
import com.camnotlar.app.data.prefs.LocalSettings
import com.camnotlar.app.data.repo.NotesRepository
import com.camnotlar.app.data.sync.LiveSocket
import com.camnotlar.app.data.sync.SyncEngine
import com.camnotlar.app.data.sync.SyncWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Oturum durumu: hiç seçilmemiş, sunucusuz ya da sunucuya bağlı. */
data class Session(val mode: String, val userId: String? = null, val email: String? = null, val server: String? = null)

/**
 * Elle bağımlılık enjeksiyonu: tek bir kapsayıcı, uygulama ömrü boyunca yaşar.
 * (Hilt yerine; modül sayısı az olduğu için derleme süresi ve karmaşıklık düşük kalır.)
 */
class AppContainer(private val context: Context) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val store = SecureStore(context)
    val api = ApiClient(store)
    val db = AppDatabase.create(context)
    val repo = NotesRepository(db, api.json)
    private val _session = MutableStateFlow(loadSession())
    val session: StateFlow<Session?> = _session
    val sync = SyncEngine(api, repo, scope) { _session.value?.userId }
    private var foreground = false

    val socket = LiveSocket(api, scope, onChanged = { sync.schedule(150) }, onLogout = { scope.launch { authLost() } })

    /** Oturum kapanınca arayüz giriş ekranını gösterir. */
    private val _authLost = MutableStateFlow(false)
    val authLostFlow: StateFlow<Boolean> = _authLost

    init {
        repo.onLocalChange = {
            if (isServerSession()) {
                if (foreground) sync.schedule(2000) else SyncWorker.scheduleOnce(context)
            }
        }
        api.onAuthLost = { scope.launch { authLost() } }
        if (isServerSession()) {
            sync.enabled = true
            SyncWorker.schedulePeriodic(context, LocalSettings.syncMinutes(context).toLong())
        }
    }

    fun isServerSession() = _session.value?.mode == "server"

    private fun loadSession(): Session? {
        val mode = store.get("mode") ?: return null
        return Session(mode, store.get("userId"), store.get("email"), store.get("server"))
    }

    fun setSession(s: Session?) {
        store.put("mode", s?.mode)
        store.put("userId", s?.userId)
        store.put("email", s?.email)
        _session.value = s
        if (s?.mode == "server") {
            _authLost.value = false
            sync.enabled = true
            SyncWorker.schedulePeriodic(context, LocalSettings.syncMinutes(context).toLong())
            if (foreground) socket.start()
        } else {
            sync.markLocal()
            socket.stop()
            SyncWorker.cancel(context)
        }
    }

    fun authLost() {
        _authLost.value = true
        sync.markLocal()
        socket.stop()
    }

    fun onForeground() {
        foreground = true
        if (isServerSession() && !_authLost.value) {
            socket.start()
            sync.schedule(100)
        }
    }

    fun onBackground() {
        foreground = false
        socket.stop()
        if (isServerSession()) SyncWorker.scheduleOnce(context)
    }
}

package com.camnotlar.app.data.sync

import com.camnotlar.app.data.net.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/** Uygulama ön plandayken "değişiklik var" sinyallerini dinler; koparsa üstel geri çekilmeyle bağlanır. */
class LiveSocket(
    private val api: ApiClient,
    private val scope: CoroutineScope,
    private val onChanged: () -> Unit,
    private val onLogout: () -> Unit,
) {
    private var ws: WebSocket? = null
    private var retry = 0
    private var running = false
    private var reconnect: Job? = null

    fun start() {
        if (running) return
        running = true
        open()
    }

    fun stop() {
        running = false
        reconnect?.cancel()
        ws?.close(1000, null)
        ws = null
    }

    private fun open() {
        if (!running || api.baseUrl.isEmpty()) return
        scope.launch {
            val token = api.accessToken() ?: runCatching { api.refresh().accessToken }.getOrNull()
            if (token == null) {
                later()
                return@launch
            }
            ws = api.http.newWebSocket(Request.Builder().url(api.wsUrl()).build(), object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    webSocket.send("""{"type":"auth","token":"$token"}""")
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    val type = runCatching { api.json.parseToJsonElement(text).jsonObject["type"]?.jsonPrimitive?.content }.getOrNull()
                    when (type) {
                        "ready" -> retry = 0
                        "changed" -> onChanged()
                        "logout" -> onLogout()
                    }
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    if (code == 4401) scope.launch { runCatching { api.refresh() } }
                    later()
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = later()
            })
        }
    }

    private fun later() {
        if (!running) return
        reconnect?.cancel()
        val wait = minOf(60_000L, 1000L shl minOf(retry++, 6))
        reconnect = scope.launch {
            delay(wait)
            open()
        }
    }
}

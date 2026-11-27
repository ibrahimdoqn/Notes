package com.camnotlar.app.data.net

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, val code: String, message: String) : IOException(message)

/**
 * Sunucu istemcisi. Erişim belirteci bellekte, yenileme belirteci SecureStore'da tutulur.
 * 401 alınınca belirteç bir kez yenilenir ve istek tekrarlanır; yenileme de reddedilirse
 * [onAuthLost] çağrılır.
 */
class ApiClient(private val store: SecureStore) {
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false; encodeDefaults = true }
    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    @Volatile var baseUrl: String = store.get("server") ?: ""
        private set
    @Volatile private var accessToken: String? = null
    private val refreshLock = Mutex()
    var onAuthLost: (() -> Unit)? = null
    var onNewerServer: (() -> Unit)? = null

    val hasSession get() = store.get("refresh") != null
    fun accessToken() = accessToken

    fun setServer(url: String) {
        baseUrl = normalizeServer(url)
        store.put("server", baseUrl)
    }

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    private fun request(method: String, path: String, body: String?, auth: Boolean): Request {
        val b = Request.Builder().url("$baseUrl/v1$path")
        if (auth) accessToken?.let { b.header("Authorization", "Bearer $it") }
        b.method(method, body?.toRequestBody(jsonType) ?: if (method == "POST" || method == "PUT") "{}".toRequestBody(jsonType) else null)
        return b.build()
    }

    private fun <T> parse(res: Response, ser: KSerializer<T>): T {
        res.use {
            val text = it.body?.string().orEmpty()
            it.header("x-camnotlar-api")?.toIntOrNull()?.let { v -> if (v > API_VERSION) onNewerServer?.invoke() }
            if (!it.isSuccessful) {
                val err = runCatching { json.decodeFromString(ApiErrorBody.serializer(), text).error }.getOrNull()
                throw ApiException(it.code, err?.code ?: "internal", err?.message ?: "Sunucu hatası (${it.code})")
            }
            return json.decodeFromString(ser, text.ifEmpty { "{}" })
        }
    }

    private suspend fun <T> raw(method: String, path: String, body: String?, ser: KSerializer<T>, auth: Boolean = true): T =
        withContext(Dispatchers.IO) { parse(http.newCall(request(method, path, body, auth)).execute(), ser) }

    /** Kimlikli istek: gerekirse belirteci yeniler. */
    suspend fun <T> call(method: String, path: String, body: String?, ser: KSerializer<T>): T {
        if (accessToken == null) refresh()
        return try {
            raw(method, path, body, ser)
        } catch (e: ApiException) {
            if (e.status != 401) throw e
            refresh()
            raw(method, path, body, ser)
        }
    }

    suspend fun refresh(): AuthResponse = refreshLock.withLock {
        val token = store.get("refresh") ?: run {
            onAuthLost?.invoke()
            throw ApiException(401, "unauthorized", "Oturum açman gerekiyor.")
        }
        try {
            val r = raw("POST", "/auth/refresh", json.encodeToString(RefreshRequest.serializer(), RefreshRequest(token)), AuthResponse.serializer(), auth = false)
            adopt(r)
            r
        } catch (e: ApiException) {
            if (e.status == 401) {
                accessToken = null
                store.put("refresh", null)
                onAuthLost?.invoke()
            }
            throw e
        }
    }

    private fun adopt(r: AuthResponse) {
        accessToken = r.accessToken
        r.refreshToken?.let { store.put("refresh", it) }
    }

    suspend fun info(server: String): ServerInfo = withContext(Dispatchers.IO) {
        val req = Request.Builder().url("${normalizeServer(server)}/v1/info").build()
        parse(http.newCall(req).execute(), ServerInfo.serializer())
    }

    suspend fun authenticate(kind: String, body: LoginRequest): AuthResponse {
        val r = raw("POST", "/auth/$kind", json.encodeToString(LoginRequest.serializer(), body), AuthResponse.serializer(), auth = false)
        adopt(r)
        return r
    }

    suspend fun logout() {
        runCatching { raw("POST", "/auth/logout", "{}", OkResponse.serializer()) }
        accessToken = null
        store.put("refresh", null)
    }

    suspend fun push(req: PushRequest): PushResponse =
        call("POST", "/sync/push", json.encodeToString(PushRequest.serializer(), req), PushResponse.serializer())

    suspend fun pull(since: Long): PullResponse = call("GET", "/sync/pull?since=$since", null, PullResponse.serializer())

    suspend fun devices(): List<DeviceDto> = call("GET", "/devices", null, DevicesResponse.serializer()).devices

    suspend fun revokeDevice(id: String) {
        call("DELETE", "/devices/$id", null, OkResponse.serializer())
    }

    suspend fun revisions(noteId: String): List<RevisionDto> =
        call("GET", "/notes/$noteId/revisions", null, RevisionsResponse.serializer()).revisions

    suspend fun folders(): List<FolderDto> = call("GET", "/folders", null, FoldersResponse.serializer()).folders

    fun wsUrl(): String = baseUrl.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://") + "/v1/ws"

    companion object {
        /** "notlar.ornek.com" → "https://notlar.ornek.com" (yerel ağ adresleri için http korunur). */
        fun normalizeServer(input: String): String {
            val t = input.trim().trimEnd('/')
            return if (t.startsWith("http://") || t.startsWith("https://")) t else "https://$t"
        }
    }
}

@kotlinx.serialization.Serializable
data class OkResponse(val ok: Boolean = true)

@kotlinx.serialization.Serializable
data class FoldersResponse(val folders: List<FolderDto>)

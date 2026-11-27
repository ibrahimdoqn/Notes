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
import okhttp3.RequestBody.Companion.asRequestBody
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

    /**
     * Kullanıcının yazdığı adresi çözer. Şema yazılmadıysa ("192.168.1.1:8080") önce HTTPS,
     * olmazsa HTTP denenir; yerel ağda HTTP ile kurulan sunucular böylece doğrudan bulunur.
     */
    suspend fun resolveServer(input: String): Pair<String, ServerInfo> {
        val t = input.trim().trimEnd('/')
        val candidates = if (t.startsWith("http://") || t.startsWith("https://")) listOf(t) else listOf("https://$t", "http://$t")
        var last: Exception? = null
        for (url in candidates) {
            try {
                return url to info(url)
            } catch (e: ApiException) {
                throw e
            } catch (e: Exception) {
                last = e
            }
        }
        throw last as? IOException ?: IOException(last?.message ?: "Sunucuya ulaşılamadı")
    }

    suspend fun authenticate(kind: String, body: LoginRequest): AuthResponse {
        val r = raw("POST", if (kind == "setup") "/setup" else "/auth/login", json.encodeToString(LoginRequest.serializer(), body), AuthResponse.serializer(), auth = false)
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

    /** Ek yükleme: gövde ham dosya. Aynı kimlikle tekrar yükleme zararsızdır. */
    suspend fun uploadAttachment(id: String, file: java.io.File, mime: String, name: String) {
        if (accessToken == null) refresh()
        suspend fun once(): Response = withContext(Dispatchers.IO) {
            val req = Request.Builder().url("$baseUrl/v1/attachments/$id")
                .header("Authorization", "Bearer ${accessToken.orEmpty()}")
                .header("X-File-Name", java.net.URLEncoder.encode(name, "UTF-8").replace("+", "%20"))
                .put(file.asRequestBody(mime.toMediaType()))
                .build()
            http.newCall(req).execute()
        }
        var res = once()
        if (res.code == 401) {
            res.close()
            refresh()
            res = once()
        }
        parse(res, AttachmentDto.serializer())
    }

    /** Ek indirme: dosyayı [dest]'e yazar, sunucudaki türü ve adı döner. */
    suspend fun downloadAttachment(id: String, dest: java.io.File): Pair<String, String> {
        if (accessToken == null) refresh()
        suspend fun once(): Response = withContext(Dispatchers.IO) {
            http.newCall(Request.Builder().url("$baseUrl/v1/attachments/$id").header("Authorization", "Bearer ${accessToken.orEmpty()}").build()).execute()
        }
        var res = once()
        if (res.code == 401) {
            res.close()
            refresh()
            res = once()
        }
        return withContext(Dispatchers.IO) {
            res.use {
                if (!it.isSuccessful) throw ApiException(it.code, "not_found", "Ek indirilemedi (${it.code}).")
                val tmp = java.io.File(dest.path + ".part")
                it.body!!.byteStream().use { input -> tmp.outputStream().use { out -> input.copyTo(out) } }
                tmp.renameTo(dest)
                val mime = it.header("x-file-mime") ?: "application/octet-stream"
                val name = it.header("content-disposition")?.let { cd -> Regex("filename\\*=UTF-8''([^;]+)").find(cd)?.groupValues?.get(1) }
                    ?.let { n -> java.net.URLDecoder.decode(n, "UTF-8") } ?: "dosya"
                mime to name
            }
        }
    }

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

package com.camnotlar.app.data.net

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** packages/shared/src/types.ts ile birebir aynı veri sözleşmesi. Zamanlar epoch milisaniye. */

@Serializable
data class NoteDto(
    val id: String,
    val folderId: String? = null,
    val html: String = "",
    val title: String = "",
    val snippet: String = "",
    val pinned: Boolean = false,
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
    val trashedAt: Long? = null,
    val version: Int = 0,
)

@Serializable
data class FolderDto(
    val id: String,
    val name: String,
    val sortOrder: Int = 0,
    val version: Int = 0,
    val updatedAt: Long = 0,
)

@Serializable
data class ChangeIn(
    val entity: String,
    val id: String,
    val op: String,
    val baseVersion: Int,
    val data: JsonElement? = null,
)

@Serializable
data class PushRequest(val changes: List<ChangeIn>)

@Serializable
data class PushResult(
    val entity: String,
    val id: String,
    val status: String,
    val version: Int? = null,
    val conflictCopyId: String? = null,
    val data: JsonObject? = null,
    val message: String? = null,
)

@Serializable
data class PushResponse(val results: List<PushResult>, val seq: Long)

@Serializable
data class ChangeOut(
    val seq: Long,
    val entity: String,
    val id: String,
    val op: String,
    val version: Int,
    val data: JsonObject? = null,
)

@Serializable
data class PullResponse(val changes: List<ChangeOut>, val seq: Long, val hasMore: Boolean)

@Serializable
data class UserDto(
    val id: String,
    val email: String,
    val displayName: String = "",
    val isAdmin: Boolean = false,
    val createdAt: Long = 0,
)

@Serializable
data class AuthResponse(
    val accessToken: String,
    val refreshToken: String? = null,
    val expiresIn: Int = 900,
    val user: UserDto,
    val deviceId: String,
)

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
    val deviceName: String,
    val platform: String = "android",
    val deviceId: String? = null,
    val inviteCode: String? = null,
)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class ServerInfo(val name: String, val apiVersion: Int, val allowSignup: Boolean)

@Serializable
data class DeviceDto(
    val id: String,
    val name: String,
    val platform: String,
    val lastSeenAt: Long,
    val current: Boolean = false,
)

@Serializable
data class DevicesResponse(val devices: List<DeviceDto>)

@Serializable
data class RevisionDto(
    val id: String,
    val noteId: String,
    val version: Int,
    val html: String,
    val title: String,
    val deviceName: String? = null,
    val createdAt: Long,
)

@Serializable
data class RevisionsResponse(val revisions: List<RevisionDto>)

@Serializable
data class ApiErrorBody(val error: ApiErrorDetail)

@Serializable
data class ApiErrorDetail(val code: String, val message: String)

const val API_VERSION = 1
const val PUSH_LIMIT = 100

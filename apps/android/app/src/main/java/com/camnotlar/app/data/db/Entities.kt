package com.camnotlar.app.data.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "notes", indices = [Index("folderId"), Index("updatedAt")])
data class NoteEntity(
    @PrimaryKey val id: String,
    val folderId: String?,
    val html: String,
    val title: String,
    val snippet: String,
    val plain: String,
    val words: Int,
    val pinned: Boolean,
    val createdAt: Long,
    val updatedAt: Long,
    val trashedAt: Long?,
    val version: Int,
)

@Entity(tableName = "folders")
data class FolderEntity(
    @PrimaryKey val id: String,
    val name: String,
    val sortOrder: Int,
    val version: Int,
    val updatedAt: Long,
)

/** Sunucuya gönderilmeyi bekleyen değişiklik; anahtar "entity:id". */
@Entity(tableName = "outbox", indices = [Index("at")])
data class OutboxEntity(
    @PrimaryKey val key: String,
    val entity: String,
    val id: String,
    val op: String,
    val baseVersion: Int,
    val dataJson: String?,
    val rev: Long,
    val at: Long,
)

@Entity(tableName = "meta")
data class MetaEntity(
    @PrimaryKey val key: String,
    val value: String,
)

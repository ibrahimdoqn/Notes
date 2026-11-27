package com.camnotlar.app.data.db

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface NoteDao {
    @Query("SELECT * FROM notes")
    fun observeAll(): Flow<List<NoteEntity>>

    @Query("SELECT * FROM notes WHERE id = :id")
    suspend fun get(id: String): NoteEntity?

    @Query("SELECT * FROM notes WHERE id = :id")
    fun observe(id: String): Flow<NoteEntity?>

    @Query("SELECT * FROM notes WHERE folderId = :folderId")
    suspend fun inFolder(folderId: String): List<NoteEntity>

    @Query("SELECT * FROM notes WHERE pinned = 1 AND trashedAt IS NULL ORDER BY updatedAt DESC LIMIT :limit")
    suspend fun pinned(limit: Int): List<NoteEntity>

    @Upsert
    suspend fun upsert(n: NoteEntity)

    @Query("DELETE FROM notes WHERE id = :id")
    suspend fun delete(id: String)

    @Query("UPDATE notes SET version = :version WHERE id = :id")
    suspend fun setVersion(id: String, version: Int)

    @Query("DELETE FROM notes")
    suspend fun clear()
}

@Dao
interface FolderDao {
    @Query("SELECT * FROM folders ORDER BY sortOrder, name")
    fun observeAll(): Flow<List<FolderEntity>>

    @Query("SELECT * FROM folders ORDER BY sortOrder, name")
    suspend fun all(): List<FolderEntity>

    @Query("SELECT * FROM folders WHERE id = :id")
    suspend fun get(id: String): FolderEntity?

    @Upsert
    suspend fun upsert(f: FolderEntity)

    @Query("DELETE FROM folders WHERE id = :id")
    suspend fun delete(id: String)

    @Query("UPDATE folders SET version = :version WHERE id = :id")
    suspend fun setVersion(id: String, version: Int)

    @Query("DELETE FROM folders")
    suspend fun clear()
}

@Dao
interface OutboxDao {
    @Query("SELECT * FROM outbox ORDER BY at LIMIT :limit")
    suspend fun batch(limit: Int): List<OutboxEntity>

    @Query("SELECT * FROM outbox WHERE `key` = :key")
    suspend fun get(key: String): OutboxEntity?

    @Query("SELECT COUNT(*) FROM outbox")
    fun observeCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM outbox")
    suspend fun count(): Int

    @Upsert
    suspend fun upsert(o: OutboxEntity)

    @Query("DELETE FROM outbox WHERE `key` = :key")
    suspend fun delete(key: String)

    @Query("DELETE FROM outbox")
    suspend fun clear()
}

@Dao
interface MetaDao {
    @Query("SELECT value FROM meta WHERE `key` = :key")
    suspend fun get(key: String): String?

    @Query("SELECT value FROM meta WHERE `key` = :key")
    fun observe(key: String): Flow<String?>

    @Upsert
    suspend fun put(m: MetaEntity)

    @Query("DELETE FROM meta")
    suspend fun clear()
}

package com.camnotlar.app.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [NoteEntity::class, FolderEntity::class, OutboxEntity::class, MetaEntity::class, AttachmentEntity::class],
    version = 2,
    exportSchema = true,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun notes(): NoteDao
    abstract fun folders(): FolderDao
    abstract fun outbox(): OutboxDao
    abstract fun meta(): MetaDao
    abstract fun attachments(): AttachmentDao

    companion object {
        /** 1 → 2: dosya ekleri tablosu. */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `attachments` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `mime` TEXT NOT NULL, " +
                        "`size` INTEGER NOT NULL, `uploaded` INTEGER NOT NULL, `createdAt` INTEGER NOT NULL, PRIMARY KEY(`id`))",
                )
            }
        }

        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "camnotlar.db").addMigrations(MIGRATION_1_2).build()
    }
}

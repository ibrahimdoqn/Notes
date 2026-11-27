package com.camnotlar.app.data.sync

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.camnotlar.app.CamApp
import java.util.concurrent.TimeUnit

/** Uygulama kapalıyken 15 dakikada bir (ve ağ geri gelince) eşitler. */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val c = (applicationContext as CamApp).container
        if (!c.isServerSession()) return Result.success()
        c.sync.enabled = true
        return if (c.sync.syncNow()) Result.success() else Result.retry()
    }

    companion object {
        private val net = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun schedulePeriodic(ctx: Context, minutes: Long = 15) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(minutes, TimeUnit.MINUTES).setConstraints(net).build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("camnotlar-sync", ExistingPeriodicWorkPolicy.UPDATE, req)
        }

        /** Çevrimdışıyken yapılan değişiklik: ağ gelince bir kez eşitle. */
        fun scheduleOnce(ctx: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(net).build()
            WorkManager.getInstance(ctx).enqueueUniqueWork("camnotlar-sync-once", ExistingWorkPolicy.REPLACE, req)
        }

        fun cancel(ctx: Context) {
            WorkManager.getInstance(ctx).cancelUniqueWork("camnotlar-sync")
            WorkManager.getInstance(ctx).cancelUniqueWork("camnotlar-sync-once")
        }
    }
}

package com.saiteja.snapper;

import android.app.NotificationManager;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Every ~15 min: report whether the blocker is on, and pull fresh blocker state (points, unlocks, reminders). */
public class SyncWorker extends Worker {

    private static final int NAG_ID = 7002;

    public SyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void schedule(Context c) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(SyncWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork("snapper-sync", ExistingPeriodicWorkPolicy.KEEP, req);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        boolean a11y = SnapperPlugin.isAccessibilityEnabled(c);
        if (!a11y) nag(c);

        String token = StateStore.deviceToken(c);
        String base = StateStore.apiBase(c);
        if (token == null || base == null) return Result.success();

        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(base + "/api/device/state?a11y=" + (a11y ? 1 : 0)).openConnection();
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(15_000);
            conn.setRequestProperty("x-device-token", token);
            int code = conn.getResponseCode();
            if (code == 401) return Result.success();
            if (code != 200) return Result.retry();
            StateStore.saveState(c, new JSONObject(read(conn.getInputStream())));
            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static void nag(Context c) {
        Reminders.ensureChannel(c);
        c.getSystemService(NotificationManager.class).notify(NAG_ID,
            new NotificationCompat.Builder(c, Reminders.CHANNEL)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Snapper blocker is OFF")
                .setContentText("You lose points while it's off. Turn it back on in Accessibility settings.")
                .setOngoing(true)
                .build());
    }

    static void clearNag(Context c) {
        c.getSystemService(NotificationManager.class).cancel(NAG_ID);
    }

    private static String read(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }
}

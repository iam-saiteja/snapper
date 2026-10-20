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
        if (!SnapperPlugin.isAccessibilityEnabled(c)) nag(c);
        Boolean ok = syncNow(c);
        return ok == null || ok ? Result.success() : Result.retry();
    }

    /**
     * Report blocker/DNS status and save fresh blocker state (points, locks, unlocks, reminders).
     * Also called from the blocker service every few minutes, because WorkManager can be deferred for hours.
     * @return true on success, false on a retryable failure, null when there is nothing to do
     */
    static Boolean syncNow(Context c) {
        String token = StateStore.deviceToken(c);
        String base = StateStore.apiBase(c);
        if (token == null || base == null) return null;
        boolean a11y = SnapperPlugin.isAccessibilityEnabled(c);
        boolean dnsOk = DnsLock.isSet(c);

        HttpURLConnection conn = null;
        try {
            // dnsHost is the host actually set on the phone, so the server checks it against the current rules
            // (dns stays for compatibility with older server versions).
            String query = "a11y=" + (a11y ? 1 : 0) + "&dns=" + (dnsOk ? 1 : 0)
                + "&dnsHost=" + java.net.URLEncoder.encode(DnsLock.currentHost(c), "UTF-8");
            conn = (HttpURLConnection) new URL(base + "/api/device/state?" + query).openConnection();
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(15_000);
            conn.setRequestProperty("x-device-token", token);
            int code = conn.getResponseCode();
            if (code == 401) return null;
            if (code != 200) return false;
            StateStore.saveState(c, new JSONObject(read(conn.getInputStream())));
            return true;
        } catch (Exception e) {
            return false;
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

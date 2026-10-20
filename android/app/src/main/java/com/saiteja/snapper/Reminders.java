package com.saiteja.snapper;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Exact alarms for reminders. Stored in prefs as {id: {at, text, audioPath}} so they survive reboots. */
final class Reminders {

    static final String CHANNEL = "reminders";
    static final String EXTRA_ID = "id";
    static final String EXTRA_TEXT = "text";
    static final String EXTRA_AUDIO = "audio";

    private Reminders() {}

    static synchronized void schedule(Context c, String id, long at, String text, String audioPath) {
        JSONObject all = load(c);
        try {
            JSONObject r = new JSONObject().put("at", at).put("text", text);
            if (audioPath != null) r.put("audioPath", audioPath);
            all.put(id, r);
        } catch (JSONException ignored) {
            return;
        }
        save(c, all);
        setAlarm(c, id, at, text, audioPath);
    }

    static synchronized void cancel(Context c, String id) {
        JSONObject all = load(c);
        JSONObject r = all.optJSONObject(id);
        all.remove(id);
        save(c, all);
        if (r != null) {
            alarms(c).cancel(pending(c, id, r.optString("text"), r.optString("audioPath", null)));
        }
    }

    /** Reminders from the server (admin-imported or created on another device). Keeps any local voice recording. */
    static synchronized void syncFromState(Context c, JSONArray fromServer) {
        if (fromServer == null) return;
        JSONObject all = load(c);
        for (int i = 0; i < fromServer.length(); i++) {
            JSONObject s = fromServer.optJSONObject(i);
            if (s == null) continue;
            String id = s.optString("id");
            long at = s.optLong("at");
            String text = s.optString("text");
            JSONObject existing = all.optJSONObject(id);
            if (existing != null && existing.optLong("at") == at && text.equals(existing.optString("text"))) continue;
            String audio = existing != null ? existing.optString("audioPath", null) : null;
            try {
                JSONObject r = new JSONObject().put("at", at).put("text", text);
                if (audio != null) r.put("audioPath", audio);
                all.put(id, r);
            } catch (JSONException ignored) {
                continue;
            }
            setAlarm(c, id, at, text, audio);
        }
        save(c, all);
    }

    static synchronized void rescheduleAll(Context c) {
        JSONObject all = load(c);
        long now = System.currentTimeMillis();
        Iterator<String> keys = all.keys();
        JSONObject keep = new JSONObject();
        while (keys.hasNext()) {
            String id = keys.next();
            JSONObject r = all.optJSONObject(id);
            if (r == null || r.optLong("at") <= now) continue;
            try {
                keep.put(id, r);
            } catch (JSONException ignored) {}
            setAlarm(c, id, r.optLong("at"), r.optString("text"), r.optString("audioPath", null));
        }
        save(c, keep);
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_HIGH);
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    private static void setAlarm(Context c, String id, long at, String text, String audioPath) {
        if (at <= System.currentTimeMillis()) return;
        AlarmManager am = alarms(c);
        PendingIntent pi = pending(c, id, text, audioPath);
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    private static PendingIntent pending(Context c, String id, String text, String audioPath) {
        Intent i = new Intent(c, ReminderReceiver.class)
            .setAction("com.saiteja.snapper.REMINDER/" + id)
            .putExtra(EXTRA_ID, id)
            .putExtra(EXTRA_TEXT, text)
            .putExtra(EXTRA_AUDIO, audioPath);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static AlarmManager alarms(Context c) {
        return (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    }

    private static JSONObject load(Context c) {
        try {
            return new JSONObject(StateStore.prefs(c).getString("reminders", "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static void save(Context c, JSONObject all) {
        StateStore.prefs(c).edit().putString("reminders", all.toString()).apply();
    }
}

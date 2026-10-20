package com.saiteja.snapper;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Blocker state computed by the server, cached on the phone. Fails closed when nothing is cached. */
public final class StateStore {

    private static final String PREFS = "snapper";

    // Used until the first successful sync.
    private static final String DEFAULT_STATE =
        "{\"blocked\":[" +
        "{\"package\":\"com.instagram.android\",\"name\":\"Instagram\",\"allowShortsWhenUnlocked\":false}," +
        "{\"package\":\"com.google.android.youtube\",\"name\":\"YouTube\",\"allowShortsWhenUnlocked\":false}]," +
        "\"penaltyLocked\":[],\"unlocks\":[],\"reminders\":[]}";

    private static String cachedRaw;
    private static JSONObject cached;

    private StateStore() {}

    static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void saveState(Context c, JSONObject state) {
        prefs(c)
            .edit()
            .putString("state", state.toString())
            .putLong("syncServerTime", state.optLong("serverTime", System.currentTimeMillis()))
            .putLong("syncElapsed", SystemClock.elapsedRealtime())
            .putInt("syncBoot", bootCount(c))
            .apply();
        Reminders.syncFromState(c, state.optJSONArray("reminders"));
    }

    static synchronized JSONObject state(Context c) {
        String raw = prefs(c).getString("state", DEFAULT_STATE);
        if (!raw.equals(cachedRaw)) {
            try {
                cached = new JSONObject(raw);
            } catch (JSONException e) {
                try {
                    cached = new JSONObject(DEFAULT_STATE);
                } catch (JSONException impossible) {
                    throw new IllegalStateException(impossible);
                }
            }
            cachedRaw = raw;
        }
        return cached;
    }

    private static int bootCount(Context c) {
        return Settings.Global.getInt(c.getContentResolver(), Settings.Global.BOOT_COUNT, -1);
    }

    /** Server-anchored clock, so changing the phone's time can't stretch an unlock. */
    public static long now(Context c) {
        SharedPreferences p = prefs(c);
        long syncElapsed = p.getLong("syncElapsed", -1);
        long syncServer = p.getLong("syncServerTime", 0);
        if (syncElapsed < 0 || p.getInt("syncBoot", -2) != bootCount(c)) {
            // Rebooted since the last sync: wall clock, but never earlier than the last server time.
            return Math.max(System.currentTimeMillis(), syncServer);
        }
        return syncServer + (SystemClock.elapsedRealtime() - syncElapsed);
    }

    /** The entry for pkg in one of the state's app lists, or null. */
    public static JSONObject find(Context c, String list, String pkg) {
        JSONArray arr = state(c).optJSONArray(list);
        if (arr == null) return null;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o != null && pkg.equals(o.optString("package"))) return o;
        }
        return null;
    }

    public static boolean isUnlocked(Context c, String pkg) {
        JSONArray arr = state(c).optJSONArray("unlocks");
        if (arr == null) return false;
        long now = now(c);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o != null && pkg.equals(o.optString("package")) && o.optLong("endsAt") > now) return true;
        }
        return false;
    }

    // ---- device token for the background worker ----

    public static void setDevice(Context c, String token, String apiBase) {
        prefs(c).edit().putString("deviceToken", token).putString("apiBase", apiBase).apply();
    }

    public static String deviceToken(Context c) {
        return prefs(c).getString("deviceToken", null);
    }

    public static String apiBase(Context c) {
        return prefs(c).getString("apiBase", null);
    }

    // ---- short grace window so setup screens in Settings aren't blocked while being turned on ----

    public static void grantSetupGrace(Context c, String kind) {
        grantGrace(c, kind, 90_000);
    }

    public static void grantGrace(Context c, String kind, long ms) {
        prefs(c).edit().putLong("graceUntil", System.currentTimeMillis() + ms).putString("graceKind", kind).apply();
    }

    public static String activeGrace(Context c) {
        SharedPreferences p = prefs(c);
        return System.currentTimeMillis() < p.getLong("graceUntil", 0) ? p.getString("graceKind", null) : null;
    }
}

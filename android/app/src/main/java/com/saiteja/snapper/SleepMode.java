package com.saiteja.snapper;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.provider.Telephony;
import android.telecom.TelecomManager;
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;
import java.util.Arrays;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Sleep windows from the rules (India time). While one is active the whole phone is blocked except
 * calls, the clock (alarms), keyboards, the home screen, Snapper, allowApps, and Chrome on allowWebsites.
 */
final class SleepMode {

    static final String UNLOCK_KEY = "snapper:sleep";
    static final String CHROME = "com.android.chrome";

    private static final String[] DAYS = { "sun", "mon", "tue", "wed", "thu", "fri", "sat" };

    private static final Set<String> ALWAYS_ALLOWED = new HashSet<>(Arrays.asList(
        "android", "com.android.systemui",
        // calls
        "com.android.server.telecom", "com.android.phone", "com.android.dialer", "com.google.android.dialer",
        "com.android.incallui", "com.samsung.android.incallui", "com.samsung.android.dialer",
        "com.google.android.contacts", "com.android.contacts", "com.samsung.android.app.contacts",
        // alarms
        "com.google.android.deskclock", "com.android.deskclock", "com.sec.android.app.clockpackage",
        "com.oneplus.deskclock", "com.coloros.alarmclock", "com.miui.clock",
        // permission dialogs (e.g. "allow calls")
        "com.google.android.permissioncontroller", "com.android.permissioncontroller"
    ));

    private static Set<String> deviceAllowed;
    private static long deviceAllowedAt;

    private SleepMode() {}

    /** End of the active sleep window in ms, or 0 when not in a sleep window (or sleep is unlocked). */
    static long activeUntil(Context c) {
        if (StateStore.isUnlocked(c, UNLOCK_KEY)) return 0;
        JSONObject sleep = StateStore.state(c).optJSONObject("sleep");
        JSONArray windows = sleep != null ? sleep.optJSONArray("windows") : null;
        if (windows == null) return 0;

        Calendar now = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"));
        now.setTimeInMillis(StateStore.now(c));
        int minute = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        String today = DAYS[now.get(Calendar.DAY_OF_WEEK) - 1];
        String yesterday = DAYS[(now.get(Calendar.DAY_OF_WEEK) + 5) % 7];

        for (int i = 0; i < windows.length(); i++) {
            JSONObject w = windows.optJSONObject(i);
            if (w == null) continue;
            int start = minutes(w.optString("start"));
            int end = minutes(w.optString("end"));
            if (start < 0 || end < 0 || start == end) continue;
            JSONArray days = w.optJSONArray("days");
            if (start < end) {
                if (minute >= start && minute < end && hasDay(days, today)) return at(now, end, 0);
            } else {
                if (minute >= start && hasDay(days, today)) return at(now, end, 1);
                if (minute < end && hasDay(days, yesterday)) return at(now, end, 0);
            }
        }
        return 0;
    }

    /** Calls, SMS, alarms, keyboards, the home screen, system UI and Snapper itself. */
    static boolean isEssential(Context c, String pkg) {
        return pkg.equals(c.getPackageName()) || ALWAYS_ALLOWED.contains(pkg) || deviceAllowed(c).contains(pkg);
    }

    static boolean isAllowed(Context c, String pkg) {
        if (isEssential(c, pkg)) return true;
        JSONObject sleep = StateStore.state(c).optJSONObject("sleep");
        return sleep != null && AppCatalog.contains(sleep.optJSONArray("allowApps"), pkg);
    }

    static JSONArray allowedWebsites(Context c) {
        JSONObject sleep = StateStore.state(c).optJSONObject("sleep");
        JSONArray sites = sleep != null ? sleep.optJSONArray("allowWebsites") : null;
        return sites != null ? sites : new JSONArray();
    }

    /** "just-us-0kbw.onrender.com" or "https://just-us-0kbw.onrender.com/x" → host. */
    static String host(String site) {
        String s = site.trim();
        if (!s.contains("://")) s = "https://" + s;
        String h = Uri.parse(s).getHost();
        return h != null ? h.toLowerCase() : site.toLowerCase();
    }

    static String url(String site) {
        return site.contains("://") ? site : "https://" + site.trim() + "/";
    }

    /** Home screen, default dialer and keyboards differ per phone; look them up (cached for a minute). */
    private static synchronized Set<String> deviceAllowed(Context c) {
        long now = System.currentTimeMillis();
        if (deviceAllowed != null && now - deviceAllowedAt < 60_000) return deviceAllowed;
        Set<String> out = new HashSet<>();
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo ri : c.getPackageManager().queryIntentActivities(home, 0)) out.add(ri.activityInfo.packageName);
        TelecomManager tm = (TelecomManager) c.getSystemService(Context.TELECOM_SERVICE);
        if (tm != null && tm.getDefaultDialerPackage() != null) out.add(tm.getDefaultDialerPackage());
        InputMethodManager imm = (InputMethodManager) c.getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) for (InputMethodInfo im : imm.getEnabledInputMethodList()) out.add(im.getPackageName());
        String sms = Telephony.Sms.getDefaultSmsPackage(c);
        if (sms != null) out.add(sms); // OTPs / emergency texts
        deviceAllowed = out;
        deviceAllowedAt = now;
        return out;
    }

    private static boolean hasDay(JSONArray days, String day) {
        return days == null || days.length() == 0 || AppCatalog.contains(days, day);
    }

    private static int minutes(String hhmm) {
        try {
            String[] p = hhmm.split(":");
            return Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1]);
        } catch (Exception e) {
            return -1;
        }
    }

    private static long at(Calendar now, int minuteOfDay, int addDays) {
        Calendar c = (Calendar) now.clone();
        c.add(Calendar.DAY_OF_MONTH, addDays);
        c.set(Calendar.HOUR_OF_DAY, minuteOfDay / 60);
        c.set(Calendar.MINUTE, minuteOfDay % 60);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }
}

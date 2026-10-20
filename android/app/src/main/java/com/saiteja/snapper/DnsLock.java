package com.saiteja.snapper;

import android.content.Context;
import android.os.Build;
import android.provider.Settings;
import org.json.JSONObject;

/**
 * AdGuard-style content filter via Android Private DNS. Snapper never sets it (the user must), but while
 * the rules ask for it and it isn't set to the required host, the phone is locked until the user sets it.
 */
final class DnsLock {

    static final String UNLOCK_KEY = "snapper:dns";

    private DnsLock() {}

    static JSONObject config(Context c) {
        return StateStore.state(c).optJSONObject("dns");
    }

    /** Private DNS exists from Android 9 (API 28). Below that the lock can't be satisfied, so it isn't enforced. */
    static boolean supported() {
        return Build.VERSION.SDK_INT >= 28;
    }

    static boolean isLocked(Context c) {
        JSONObject dns = config(c);
        return supported() && dns != null && dns.optBoolean("lock", false) && !StateStore.isUnlocked(c, UNLOCK_KEY);
    }

    static String requiredHost(Context c) {
        JSONObject dns = config(c);
        return dns != null ? dns.optString("host", "family.adguard-dns.com") : "family.adguard-dns.com";
    }

    /** The Private DNS hostname currently set on the phone, or "" when it's off/automatic or unsupported. */
    static String currentHost(Context c) {
        if (!supported()) return "";
        String mode = Settings.Global.getString(c.getContentResolver(), "private_dns_mode");
        String host = Settings.Global.getString(c.getContentResolver(), "private_dns_specifier");
        if (mode == null || !mode.equalsIgnoreCase("hostname") || host == null) return "";
        return host.trim();
    }

    /** True when Private DNS is set to the required host (mode "hostname" + matching specifier). */
    static boolean isSet(Context c) {
        return currentHost(c).equalsIgnoreCase(requiredHost(c));
    }

    /** Lock is on and DNS is not correctly set, so the phone should be held until the user fixes it. */
    static boolean enforcing(Context c) {
        return isLocked(c) && !isSet(c);
    }
}

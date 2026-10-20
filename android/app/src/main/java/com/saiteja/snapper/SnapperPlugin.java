package com.saiteja.snapper;

import android.Manifest;
import android.app.AlarmManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;

/** JS bridge: src/lib/native.ts */
@CapacitorPlugin(
    name = "Snapper",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class SnapperPlugin extends Plugin {

    private static SnapperPlugin instance;
    private static String pendingShared;

    @Override
    public void load() {
        instance = this;
        Reminders.ensureChannel(getContext());
    }

    /** Called by MainActivity when text/links are shared to Snapper. */
    static void onShared(String text) {
        if (instance != null && instance.hasListeners("shared")) {
            JSObject data = new JSObject();
            data.put("text", text);
            instance.notifyListeners("shared", data);
        } else {
            pendingShared = text;
        }
    }

    static boolean isAccessibilityEnabled(Context c) {
        String enabled = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        ComponentName me = new ComponentName(c, BlockerService.class);
        for (String s : enabled.split(":")) {
            if (me.equals(ComponentName.unflattenFromString(s))) return true;
        }
        return false;
    }

    private boolean isDeviceAdmin() {
        DevicePolicyManager dpm = (DevicePolicyManager) getContext().getSystemService(Context.DEVICE_POLICY_SERVICE);
        return dpm.isAdminActive(new ComponentName(getContext(), AdminReceiver.class));
    }

    private boolean canExactAlarm() {
        if (Build.VERSION.SDK_INT < 31) return true;
        return ((AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject r = new JSObject();
        r.put("accessibility", isAccessibilityEnabled(getContext()));
        r.put("deviceAdmin", isDeviceAdmin());
        r.put("exactAlarms", canExactAlarm());
        r.put("notifications", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        r.put("hasDeviceToken", StateStore.deviceToken(getContext()) != null);
        r.put("usageAccess", AppCatalog.hasUsageAccess(getContext()));
        r.put("dnsLock", DnsLock.isLocked(getContext()));
        r.put("dnsSet", DnsLock.isSet(getContext()));
        r.put("dnsHost", DnsLock.requiredHost(getContext()));
        r.put("dnsSupported", DnsLock.supported());
        // What the blocker is enforcing right now, to spot a stale state.
        org.json.JSONObject st = StateStore.state(getContext());
        r.put("blockerSyncedAt", StateStore.syncedAt(getContext()));
        r.put("blockerBalance", st.optInt("balance", 0));
        org.json.JSONArray locked = st.optJSONArray("penaltyLocked");
        r.put("blockerPenaltyLocked", locked != null ? locked.length() : 0);
        call.resolve(r);
    }

    @PluginMethod
    public void openPrivateDnsSettings(PluginCall call) {
        // No action to grant: Snapper never writes the DNS; the user sets it here.
        try {
            getActivity().startActivity(new Intent("android.settings.PRIVATE_DNS_SETTINGS"));
        } catch (android.content.ActivityNotFoundException e) {
            getActivity().startActivity(new Intent(Settings.ACTION_WIRELESS_SETTINGS));
        }
        call.resolve();
    }

    @PluginMethod
    public void openUsageAccessSettings(PluginCall call) {
        if (!AppCatalog.hasUsageAccess(getContext())) {
            StateStore.grantSetupGrace(getContext(), "usageAccess");
            getActivity().startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
        }
        call.resolve();
    }

    /** Installed apps with category, payment flag and today's screen time (if usage access is granted). */
    @PluginMethod
    public void listApps(PluginCall call) {
        AppCatalog.invalidate();
        java.util.Map<String, Long> usage = AppCatalog.usageToday(getContext());
        com.getcapacitor.JSArray apps = new com.getcapacitor.JSArray();
        for (AppCatalog.App a : AppCatalog.visible(getContext())) {
            JSObject o = new JSObject();
            o.put("package", a.pkg);
            o.put("name", a.name(getContext().getPackageManager()));
            o.put("category", a.category);
            o.put("payment", a.payment);
            Long ms = usage.get(a.pkg);
            o.put("usageMs", ms != null ? ms : 0);
            apps.put(o);
        }
        JSObject r = new JSObject();
        r.put("apps", apps);
        r.put("usageAccess", AppCatalog.hasUsageAccess(getContext()));
        r.put("categoriesSupported", AppCatalog.categoriesSupported());
        call.resolve(r);
    }

    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        getActivity().startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
        call.resolve();
    }

    @PluginMethod
    public void requestDeviceAdmin(PluginCall call) {
        if (!isDeviceAdmin()) {
            StateStore.grantSetupGrace(getContext(), "deviceAdmin");
            Intent i = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
                .putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, new ComponentName(getContext(), AdminReceiver.class))
                .putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Stops Snapper from being uninstalled on impulse.");
            getActivity().startActivity(i);
        }
        call.resolve();
    }

    @PluginMethod
    public void requestExactAlarms(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && !canExactAlarm()) {
            StateStore.grantSetupGrace(getContext(), "exactAlarms");
            getActivity().startActivity(
                new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName()))
            );
        }
        call.resolve();
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsResult");
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void setDeviceToken(PluginCall call) {
        String token = call.getString("token");
        String apiBase = call.getString("apiBase");
        if (token == null || apiBase == null) {
            call.reject("token and apiBase are required");
            return;
        }
        StateStore.setDevice(getContext(), token, apiBase);
        SyncWorker.schedule(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setState(PluginCall call) {
        JSONObject state = call.getObject("state");
        if (state == null) {
            call.reject("state is required");
            return;
        }
        StateStore.saveState(getContext(), state);
        call.resolve();
    }

    @PluginMethod
    public void scheduleReminder(PluginCall call) {
        String id = call.getString("id");
        Long at = call.getLong("at");
        if (id == null || at == null) {
            call.reject("id and at are required");
            return;
        }
        Reminders.schedule(getContext(), id, at, call.getString("text", "Reminder"), call.getString("audioPath"));
        call.resolve();
    }

    @PluginMethod
    public void cancelReminder(PluginCall call) {
        String id = call.getString("id");
        if (id != null) Reminders.cancel(getContext(), id);
        call.resolve();
    }

    @PluginMethod
    public void consumeSharedText(PluginCall call) {
        JSObject r = new JSObject();
        r.put("text", pendingShared);
        pendingShared = null;
        call.resolve(r);
    }
}

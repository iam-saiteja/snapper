package com.saiteja.snapper;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;

/** Device admin: Android won't uninstall Snapper until this is deactivated (and the blocker hides that screen). */
public class AdminReceiver extends DeviceAdminReceiver {

    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        return "Turning off Snapper protection is logged and costs points.";
    }
}

package com.saiteja.snapper;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

/** Alarm fired: hand off to a short foreground service that plays the voice note (or speaks the text). */
public class ReminderReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        Intent svc = new Intent(context, ReminderService.class).putExtras(intent);
        ContextCompat.startForegroundService(context, svc);
    }
}

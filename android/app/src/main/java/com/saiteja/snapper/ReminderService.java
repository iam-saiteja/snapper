package com.saiteja.snapper;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.util.Locale;

/** Plays a reminder out loud: your recorded voice if there is one, otherwise text-to-speech. */
public class ReminderService extends Service {

    private static final int FOREGROUND_ID = 7001;
    private static final long MAX_PLAY_MS = 120_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private TextToSpeech tts;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Reminders.ensureChannel(this);
        String id = intent != null ? intent.getStringExtra(Reminders.EXTRA_ID) : null;
        String text = intent != null ? intent.getStringExtra(Reminders.EXTRA_TEXT) : null;
        String audio = intent != null ? intent.getStringExtra(Reminders.EXTRA_AUDIO) : null;
        if (text == null) text = "Reminder";

        int type = Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        ServiceCompat.startForeground(this, FOREGROUND_ID, notification(text, true), type);
        // A normal notification that stays after playback finishes.
        getSystemService(NotificationManager.class).notify(id != null ? id.hashCode() : 1, notification(text, false));
        if (id != null) Reminders.cancel(this, id);

        handler.postDelayed(this::finish, MAX_PLAY_MS);
        if (audio != null && !audio.isEmpty()) playAudio(audio, text);
        else speak(text);
        return START_NOT_STICKY;
    }

    private void playAudio(String uri, String fallbackText) {
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
            player.setDataSource(this, Uri.parse(uri));
            player.setOnCompletionListener(mp -> finish());
            player.prepare();
            player.start();
        } catch (Exception e) {
            speak(fallbackText);
        }
    }

    private void speak(String text) {
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) {
                finish();
                return;
            }
            tts.setLanguage(new Locale("en", "IN"));
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) {}
                @Override public void onDone(String utteranceId) { handler.post(ReminderService.this::finish); }
                @Override public void onError(String utteranceId) { handler.post(ReminderService.this::finish); }
            });
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "reminder");
        });
    }

    private Notification notification(String text, boolean ongoing) {
        PendingIntent open = PendingIntent.getActivity(
            this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, Reminders.CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Snapper reminder")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(open)
            .setAutoCancel(!ongoing)
            .setOngoing(ongoing)
            .build();
    }

    private void finish() {
        handler.removeCallbacksAndMessages(null);
        if (player != null) {
            player.release();
            player = null;
        }
        if (tts != null) {
            tts.shutdown();
            tts = null;
        }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (player != null) player.release();
        if (tts != null) tts.shutdown();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

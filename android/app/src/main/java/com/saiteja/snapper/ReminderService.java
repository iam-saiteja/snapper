package com.saiteja.snapper;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
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
import org.json.JSONObject;

/**
 * A reminder rings like an alarm until it's acknowledged. Your recorded voice loops, or the text is spoken and
 * then the alarm tone loops. Tapping "Answer the question" opens Snapper, which stops the ringing; answering the
 * AI's question acknowledges it. Until then it rings again: 5 minutes after the ringing was stopped, and after
 * 30 minutes of ringing nobody answered.
 */
public class ReminderService extends Service {

    static final String ACTION_STOP = "com.saiteja.snapper.REMINDER_STOP";
    static final String ACTION_ACK = "com.saiteja.snapper.REMINDER_ACK";
    static final String EXTRA_ACK_ID = "snapper.ackReminder";
    private static final String CHANNEL = "reminders_ringing";

    private static final int FOREGROUND_ID = 7001;
    private static final long MAX_RING_MS = 30 * 60_000;
    private static final long RING_AGAIN_MS = 5 * 60_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private TextToSpeech tts;
    private String ringingId;

    static void stopRinging(Context c, String id) {
        c.startService(new Intent(c, ReminderService.class).setAction(ACTION_STOP).putExtra(Reminders.EXTRA_ID, id));
    }

    static void acknowledge(Context c, String id) {
        c.startService(new Intent(c, ReminderService.class).setAction(ACTION_ACK).putExtra(Reminders.EXTRA_ID, id));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String id = intent != null ? intent.getStringExtra(Reminders.EXTRA_ID) : null;
        String action = intent != null ? intent.getAction() : null;
        if (id == null) {
            finish();
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            stop(id, System.currentTimeMillis() + RING_AGAIN_MS);
        } else if (ACTION_ACK.equals(action)) {
            acknowledged(id);
        } else {
            String text = intent.getStringExtra(Reminders.EXTRA_TEXT);
            ring(id, text != null ? text : "Reminder", intent.getStringExtra(Reminders.EXTRA_AUDIO));
        }
        return START_NOT_STICKY;
    }

    private void ring(String id, String text, String audio) {
        ensureChannel(this);
        stopPlayback();
        ringingId = id;
        int type = Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        ServiceCompat.startForeground(this, FOREGROUND_ID, notification(id, text, true), type);
        // Safety net: if nobody answers (or this process dies), it rings again after the cap.
        Reminders.ringAgainAt(this, id, System.currentTimeMillis() + MAX_RING_MS + RING_AGAIN_MS);
        handler.postDelayed(() -> stop(id, System.currentTimeMillis() + RING_AGAIN_MS), MAX_RING_MS);
        if (audio != null && !audio.isEmpty()) loop(Uri.parse(audio), text);
        else speakThenAlarm(text);
    }

    /** Ringing stopped (the question screen opened, or the cap was hit): quiet, but ring again later. */
    private void stop(String id, long ringAgainAt) {
        if (id.equals(ringingId)) {
            stopPlayback();
            ringingId = null;
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        }
        JSONObject r = Reminders.get(this, id);
        if (r != null) {
            Reminders.ringAgainAt(this, id, ringAgainAt);
            ensureChannel(this);
            getSystemService(NotificationManager.class).notify(id.hashCode(), notification(id, r.optString("text", "Reminder"), false));
        }
        if (ringingId == null) finish();
    }

    private void acknowledged(String id) {
        if (id.equals(ringingId)) {
            stopPlayback();
            ringingId = null;
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        }
        Reminders.cancel(this, id);
        getSystemService(NotificationManager.class).cancel(id.hashCode());
        if (ringingId == null) finish();
    }

    private void loop(Uri uri, String fallbackText) {
        releasePlayer();
        try {
            player = new MediaPlayer();
            player.setAudioAttributes(alarmAttributes());
            player.setDataSource(this, uri);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception e) {
            // Only drop the broken player: the ring cap and speech fallback callbacks must keep running.
            releasePlayer();
            if (fallbackText != null) speakThenAlarm(fallbackText);
        }
    }

    /** Starts the looping alarm tone once. Speech and the fallback timer can both ask for it. */
    private void alarmTone() {
        if (ringingId == null || player != null) return; // stopped meanwhile, or already ringing
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        Uri tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (tone == null) tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (tone != null) loop(tone, null);
    }

    private void speakThenAlarm(String text) {
        Runnable fallback = this::alarmTone;
        handler.postDelayed(fallback, 30_000); // if speech never starts or finishes
        tts = new TextToSpeech(this, status -> {
            if (tts == null) return; // stopped before the speech engine was ready
            if (status != TextToSpeech.SUCCESS) {
                handler.removeCallbacks(fallback);
                handler.post(this::alarmTone);
                return;
            }
            tts.setLanguage(new Locale("en", "IN"));
            tts.setAudioAttributes(alarmAttributes());
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String utteranceId) {}
                @Override public void onDone(String utteranceId) { handler.removeCallbacks(fallback); handler.post(ReminderService.this::alarmTone); }
                @Override public void onError(String utteranceId) { handler.removeCallbacks(fallback); handler.post(ReminderService.this::alarmTone); }
            });
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "reminder");
        });
    }

    private static AudioAttributes alarmAttributes() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
    }

    private Notification notification(String id, String text, boolean ringing) {
        Intent open = new Intent(this, MainActivity.class)
            .putExtra(EXTRA_ACK_ID, id)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent answer = PendingIntent.getActivity(
            this, id.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(ringing ? "Snapper reminder" : "Answer the question to finish this reminder")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setContentIntent(answer)
            .addAction(0, "Answer the question", answer)
            .setOngoing(true)
            .setAutoCancel(false);
        if (ringing) b.setFullScreenIntent(answer, true);
        return b.build();
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Ringing reminders", NotificationManager.IMPORTANCE_HIGH);
        ch.setSound(null, null); // the service plays the sound itself, on the alarm stream
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    private void releasePlayer() {
        if (player == null) return;
        try {
            player.stop();
        } catch (IllegalStateException ignored) {}
        player.release();
        player = null;
    }

    private void stopPlayback() {
        handler.removeCallbacksAndMessages(null);
        releasePlayer();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
    }

    private void finish() {
        stopPlayback();
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopPlayback();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

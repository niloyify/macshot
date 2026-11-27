package io.github.niloyify.touchkit;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * TouchKit for Android: the same web app as the website, bundled inside the
 * APK so it works offline. Files are served from assets/web at
 * https://appassets.androidplatform.net/ so the page has a normal secure
 * origin (workers, storage and media all work). The AndroidTK bridge gives the
 * page the things a WebView cannot do alone: saving files, printing to PDF,
 * sharing, notifications, reading aloud and voice typing.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String HOME = "https://" + HOST + "/index.html";
    static final int FILES = 1;
    static final String CHANNEL = "reminders";

    WebView web;
    WebView printer;
    ValueCallback<Uri[]> fileCallback;
    TextToSpeech tts;
    boolean ttsReady;
    SpeechRecognizer recognizer;
    int nextRequest = 100;
    final Map<Integer, Runnable[]> waiting = new HashMap<>();
    int notifyId = 1;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setGeolocationEnabled(true);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " TouchKitAndroid/" + BuildInfo.VERSION);

        web.addJavascriptInterface(new Bridge(), "AndroidTK");
        web.setWebViewClient(new AssetClient());
        web.setWebChromeClient(new Chrome());
        if (saved != null) web.restoreState(saved);
        else web.loadUrl(HOME);

        tts = new TextToSpeech(this, status -> ttsReady = status == TextToSpeech.SUCCESS);

        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Medicine, birthdays, timers and other TouchKit reminders");
            getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        // Inside a tool, Back returns to the home screen; on the home screen it leaves the app.
        web.evaluateJavascript("(function(){if(location.hash.length>1){location.hash='';return 1}return 0})()",
                v -> { if (!"1".equals(v)) MainActivity.super.onBackPressed(); });
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        if (recognizer != null) recognizer.destroy();
        web.destroy();
        super.onDestroy();
    }

    // ---- Serving the bundled app ------------------------------------------------

    class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.equals("/")) path = "/index.html";
            try {
                InputStream in = getAssets().open("web" + path);
                WebResourceResponse r = new WebResourceResponse(mime(path), mime(path).startsWith("text/") || path.endsWith(".js") ? "utf-8" : null, in);
                Map<String, String> h = new HashMap<>();
                h.put("Cache-Control", "no-cache");
                h.put("Access-Control-Allow-Origin", "*");
                r.setResponseHeaders(h);
                return r;
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            openOutside(u.toString());
            return true;
        }
    }

    static String mime(String path) {
        String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (ext) {
            case "html": return "text/html";
            case "js": case "mjs": return "application/javascript";
            case "css": return "text/css";
            case "json": case "webmanifest": return "application/json";
            case "svg": return "image/svg+xml";
            case "wasm": return "application/wasm";
            case "png": return "image/png";
            case "txt": return "text/plain";
        }
        String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m != null ? m : "application/octet-stream";
    }

    void openOutside(String url) {
        try {
            Intent i = url.startsWith("intent:") ? Intent.parseUri(url, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            toast("No app can open this link");
        }
    }

    // ---- Permissions -----------------------------------------------------------

    /** Ask for Android permissions, then run yes or no. */
    void withPermissions(String[] perms, Runnable yes, Runnable no) {
        List<String> need = new ArrayList<>();
        for (String p : perms) if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) need.add(p);
        if (need.isEmpty()) { yes.run(); return; }
        int code = nextRequest++;
        waiting.put(code, new Runnable[]{yes, no});
        requestPermissions(need.toArray(new String[0]), code);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        Runnable[] r = waiting.remove(code);
        if (r == null) return;
        boolean all = results.length > 0;
        for (int g : results) all &= g == PackageManager.PERMISSION_GRANTED;
        // Location: approximate is enough.
        if (!all && perms.length > 0) {
            for (int i = 0; i < perms.length; i++)
                if (Manifest.permission.ACCESS_COARSE_LOCATION.equals(perms[i]) && results[i] == PackageManager.PERMISSION_GRANTED) all = true;
        }
        (all ? r[0] : r[1]).run();
    }

    class Chrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest req) {
            List<String> perms = new ArrayList<>();
            for (String res : req.getResources()) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) perms.add(Manifest.permission.CAMERA);
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) { perms.add(Manifest.permission.RECORD_AUDIO); perms.add(Manifest.permission.MODIFY_AUDIO_SETTINGS); }
            }
            runOnUiThread(() -> withPermissions(perms.toArray(new String[0]),
                    () -> req.grant(req.getResources()), req::deny));
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
            withPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                    () -> cb.invoke(origin, true, false), () -> cb.invoke(origin, false, false));
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            String[] types = params.getAcceptTypes();
            List<String> mimes = new ArrayList<>();
            for (String t : types) for (String one : t.split(",")) {
                one = one.trim();
                if (one.isEmpty()) continue;
                if (one.startsWith(".")) { String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(one.substring(1)); if (m != null) mimes.add(m); }
                else mimes.add(one);
            }
            pick.setType(mimes.size() == 1 ? mimes.get(0) : "*/*");
            if (mimes.size() > 1) pick.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(Intent.createChooser(pick, "Choose"), FILES);
            } catch (Exception e) {
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != FILES || fileCallback == null) return;
        Uri[] uris = null;
        if (result == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                uris = new Uri[clip.getItemCount()];
                for (int i = 0; i < uris.length; i++) uris[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                uris = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(uris);
        fileCallback = null;
    }

    // ---- Helpers for the bridge ---------------------------------------------------

    void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show());
    }

    void js(String code) {
        runOnUiThread(() -> web.evaluateJavascript(code, null));
    }

    static class Decoded { String mime; byte[] bytes; }

    static Decoded decode(String dataUrl) throws IOException {
        Decoded d = new Decoded();
        int comma = dataUrl.indexOf(',');
        if (!dataUrl.startsWith("data:") || comma < 0) throw new IOException("not a data URL");
        String meta = dataUrl.substring(5, comma);
        String body = dataUrl.substring(comma + 1);
        boolean b64 = meta.endsWith(";base64");
        d.mime = meta.split(";")[0];
        if (d.mime.isEmpty()) d.mime = "application/octet-stream";
        d.bytes = b64 ? Base64.decode(body, Base64.DEFAULT) : URLDecoder.decode(body, "UTF-8").getBytes("UTF-8");
        return d;
    }

    static String safeName(String name) {
        String n = name.replaceAll("[\\\\/:*?\"<>|]", "_").trim();
        return n.isEmpty() ? "file" : n;
    }

    /** Save into Downloads/TouchKit. Returns where it went, or null. */
    String saveToDownloads(String name, Decoded d) throws IOException {
        name = safeName(name);
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, d.mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/TouchKit");
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new IOException("no place to save");
            try (OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(d.bytes); }
            return "Download/TouchKit/" + name;
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "TouchKit");
        dir.mkdirs();
        File f = new File(dir, name);
        try (OutputStream out = new FileOutputStream(f)) { out.write(d.bytes); }
        return f.getAbsolutePath();
    }

    void speakNow(String text, String lang, float rate) {
        int r = tts.setLanguage(Locale.forLanguageTag(lang));
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
            toast("This phone has no voice for this language. Install it in Settings → Text-to-speech.");
            if (lang.startsWith("bn")) return;
            tts.setLanguage(Locale.US);
        }
        tts.setSpeechRate(rate);
        int max = Math.max(500, TextToSpeech.getMaxSpeechInputLength() - 100);
        tts.stop();
        for (int i = 0, n = 0; i < text.length(); i += max, n++)
            tts.speak(text.substring(i, Math.min(text.length(), i + max)), n == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, "tk" + n);
    }

    void speech(String kind, String text) {
        js("window.__tkSpeech&&window.__tkSpeech(" + JSONObject.quote(kind) + "," + JSONObject.quote(text) + ")");
    }

    void listenNow(String lang) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            speech("error", "Voice typing is not available on this phone. Install or update the Google app.");
            speech("end", "");
            return;
        }
        if (recognizer != null) recognizer.destroy();
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            boolean ended;
            void end() { if (!ended) { ended = true; speech("end", ""); } }
            public void onResults(Bundle b) {
                ArrayList<String> list = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (list != null && !list.isEmpty()) speech("result", list.get(0));
                end();
            }
            public void onError(int e) {
                String why = e == SpeechRecognizer.ERROR_NO_MATCH || e == SpeechRecognizer.ERROR_SPEECH_TIMEOUT ? "no speech heard"
                        : e == SpeechRecognizer.ERROR_NETWORK || e == SpeechRecognizer.ERROR_NETWORK_TIMEOUT ? "no internet"
                        : e == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ? "microphone not allowed" : "error " + e;
                speech("error", why);
                end();
            }
            public void onReadyForSpeech(Bundle b) {}
            public void onBeginningOfSpeech() {}
            public void onRmsChanged(float v) {}
            public void onBufferReceived(byte[] b) {}
            public void onEndOfSpeech() {}
            public void onPartialResults(Bundle b) {}
            public void onEvent(int t, Bundle b) {}
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L);
        recognizer.startListening(i);
    }

    // ---- The bridge the page talks to (window.AndroidTK) --------------------------

    class Bridge {
        @JavascriptInterface
        public String saveFile(String name, String dataUrl) {
            try {
                Decoded d = decode(dataUrl);
                if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                    runOnUiThread(() -> withPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                            () -> { try { saveToDownloads(name, d); toast("Saved to Downloads: " + name); } catch (IOException e) { toast("Could not save the file"); } },
                            () -> toast("Allow storage to save files")));
                    return "asking";
                }
                return saveToDownloads(name, d);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void printHtml(String html) {
            runOnUiThread(() -> {
                printer = new WebView(MainActivity.this);
                printer.getSettings().setJavaScriptEnabled(false);
                printer.setWebViewClient(new AssetClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        pm.print("TouchKit", view.createPrintDocumentAdapter("TouchKit"),
                                new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
                    }
                });
                printer.loadDataWithBaseURL("https://" + HOST + "/", html, "text/html", "utf-8", null);
            });
        }

        @JavascriptInterface
        public void openUrl(String url) {
            runOnUiThread(() -> openOutside(url));
        }

        @JavascriptInterface
        public void copyText(String text) {
            runOnUiThread(() -> ((ClipboardManager) getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("TouchKit", text)));
        }

        @JavascriptInterface
        public void shareText(String text) {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, text);
            runOnUiThread(() -> startActivity(Intent.createChooser(i, "Share")));
        }

        @JavascriptInterface
        public void shareFile(String name, String dataUrl) {
            try {
                Decoded d = decode(dataUrl);
                File dir = new File(getCacheDir(), "share");
                dir.mkdirs();
                File f = new File(dir, safeName(name));
                try (OutputStream out = new FileOutputStream(f)) { out.write(d.bytes); }
                Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + Uri.encode(f.getName()));
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType(d.mime);
                i.putExtra(Intent.EXTRA_STREAM, uri);
                i.setClipData(ClipData.newRawUri(f.getName(), uri));
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(Intent.createChooser(i, "Share")));
            } catch (Exception e) {
                toast("Could not share");
            }
        }

        @JavascriptInterface
        public boolean canNotify() {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (!nm.areNotificationsEnabled()) return false;
            return Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface
        public void askNotify() {
            if (Build.VERSION.SDK_INT >= 33)
                runOnUiThread(() -> withPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, () -> {}, () -> {}));
        }

        @JavascriptInterface
        public void notify(String title, String body) {
            if (!canNotify()) { toast(title); return; }
            Intent open = new Intent(MainActivity.this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(MainActivity.this, 0, open, PendingIntent.FLAG_IMMUTABLE);
            android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26
                    ? new android.app.Notification.Builder(MainActivity.this, CHANNEL)
                    : new android.app.Notification.Builder(MainActivity.this).setPriority(android.app.Notification.PRIORITY_HIGH);
            b.setSmallIcon(R.drawable.ic_eyes).setContentTitle(title).setContentText(body)
                    .setStyle(new android.app.Notification.BigTextStyle().bigText(body))
                    .setContentIntent(pi).setAutoCancel(true).setColor(0xFF3D7BFF);
            getSystemService(NotificationManager.class).notify(notifyId++, b.build());
        }

        @JavascriptInterface
        public void speak(String text, String lang, double rate) {
            runOnUiThread(() -> {
                if (!ttsReady) { toast("Text-to-speech is not ready yet. Try again."); return; }
                speakNow(text, lang == null ? "en-US" : lang, (float) rate);
            });
        }

        @JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(() -> { if (tts != null) tts.stop(); });
        }

        @JavascriptInterface
        public void listen(String lang) {
            runOnUiThread(() -> withPermissions(new String[]{Manifest.permission.RECORD_AUDIO},
                    () -> listenNow(lang == null ? "bn-BD" : lang),
                    () -> { speech("error", "microphone not allowed"); speech("end", ""); }));
        }

        @JavascriptInterface
        public void stopListening() {
            runOnUiThread(() -> { if (recognizer != null) recognizer.stopListening(); });
        }
    }
}

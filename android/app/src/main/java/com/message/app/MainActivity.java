package com.message.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String APP_URL = "https://tracynixx-wq.github.io/message/";
    private static final String APP_VERSION = "1.2.0";
    private static final int APP_VERSION_CODE = 3;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private BroadcastReceiver downloadReceiver;
    private long pendingDownloadId = -1;

    public class NativeBridge {
        @JavascriptInterface public String getVersionName() { return APP_VERSION; }
        @JavascriptInterface public int getVersionCode() { return APP_VERSION_CODE; }
        @JavascriptInterface public void downloadAndInstall(String url) {
            runOnUiThread(() -> startApkDownload(url));
        }
    }

    private void startApkDownload(String url) {
        if (url == null || !url.startsWith("https://github.com/tracynixx-wq/message/releases/download/")) {
            Toast.makeText(this, "Недопустимая ссылка обновления", Toast.LENGTH_LONG).show();
            return;
        }
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName()));
            startActivity(settings);
            Toast.makeText(this, "Разрешите установку приложений и повторите обновление", Toast.LENGTH_LONG).show();
            return;
        }
        try {
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("Обновление Message");
            request.setDescription("Загрузка новой версии приложения");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "message-update.apk");
            if (downloadReceiver != null) {
                try { unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
            }
            downloadReceiver = new BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) {
                    if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id != pendingDownloadId) return;
                    DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
                    try (Cursor cursor = manager.query(query)) {
                        if (cursor != null && cursor.moveToFirst()
                                && cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL) {
                            java.io.File apk = new java.io.File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "message-update.apk");
                            Uri content = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", apk);
                            Intent install = new Intent(Intent.ACTION_VIEW);
                            install.setDataAndType(content, "application/vnd.android.package-archive");
                            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(install);
                        } else {
                            Toast.makeText(MainActivity.this, "Не удалось скачать обновление", Toast.LENGTH_LONG).show();
                        }
                    } catch (Exception ex) {
                        Toast.makeText(MainActivity.this, "Не удалось открыть установщик: " + ex.getMessage(), Toast.LENGTH_LONG).show();
                    }
                    try { unregisterReceiver(this); } catch (Exception ignored) {}
                    downloadReceiver = null;
                }
            };
            IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
            if (Build.VERSION.SDK_INT >= 33) registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            else registerReceiver(downloadReceiver, filter);
            pendingDownloadId = manager.enqueue(request);
            Toast.makeText(this, "Обновление загружается", Toast.LENGTH_SHORT).show();
        } catch (Exception ex) {
            Toast.makeText(this, "Не удалось начать загрузку: " + ex.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        webView.addJavascriptInterface(new NativeBridge(), "MessageNative");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost();
                if (host != null && (host.equals("tracynixx-wq.github.io") || host.endsWith(".supabase.co")
                        || host.equals("jsdelivr.net") || host.endsWith(".jsdelivr.net"))) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST); return true; }
                catch (Exception e) { fileCallback = null; return false; }
            }
        });
        if (savedInstanceState == null) webView.loadUrl(APP_URL);
        else webView.restoreState(savedInstanceState);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }
    @Override protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }
    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (downloadReceiver != null) try { unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}

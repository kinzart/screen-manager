package br.com.kinzart.fbsprojector;

import android.app.Activity;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.ClientCertRequest;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.HttpAuthHandler;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String PREFS = "fbs_projector";
    private static final String PREF_URL = "receiver_url";
    private static final int BACKGROUND = Color.rgb(17, 17, 15);
    private static final int FOREGROUND = Color.rgb(245, 244, 237);
    private static final int MUTED = Color.rgb(153, 153, 143);
    private static final int AMBER = Color.rgb(231, 173, 60);

    private final Handler handler = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private LinearLayout configuration;
    private LinearLayout stageNotice;
    private TextView stageStatus;
    private TextView configurationStatus;
    private EditText address;
    private Button openButton;
    private Button forgetButton;
    private WebView webView;
    private volatile Connection connection;
    private boolean foreground;
    private boolean stageVisible;
    private boolean destroyed;
    private boolean changingAddress;
    private boolean clearingCookies;
    private boolean loading;
    private boolean pageReady;
    private boolean mainLoadFailed;
    private boolean pendingInitialLoad;
    private boolean retryNeeded;
    private boolean retryScheduled;
    private boolean retrySuppressed = true;
    private int retryAttempt;
    private String mainDocumentUrl;
    private String lastFailure = "";
    private String stageMessage = "";

    private final Runnable retryTask = new Runnable() {
        @Override public void run() {
            retryScheduled = false;
            if (!destroyed && foreground && stageVisible && !retrySuppressed
                    && retryNeeded && !loading && webView != null) {
                startMainLoad();
            }
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BACKGROUND);
        getWindow().setNavigationBarColor(BACKGROUND);
        getWindow().setSoftInputMode(
                WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN
                        | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        CookieManager.getInstance().setAcceptCookie(true);
        buildInterface();
        String saved = getSharedPreferences(PREFS, MODE_PRIVATE).getString(PREF_URL, null);
        if (saved != null) {
            setAddress(saved);
            try {
                activate(Connection.parse(saved));
            } catch (IllegalArgumentException invalid) {
                configurationStatus.setText("Endereço salvo inválido. Informe novamente a URL do notebook.");
                address.requestFocus();
            }
        } else {
            Connection bundled = readBundledConnection();
            if (bundled != null) {
                setAddress(bundled.url);
                openButton.requestFocus();
            } else {
                address.requestFocus();
            }
        }
    }

    private Connection readBundledConnection() {
        try (InputStream stream = getAssets().open(
                "fbs-connection.json", AssetManager.ACCESS_STREAMING)) {
            byte[] bytes = new byte[4096];
            int size = 0;
            while (size < bytes.length) {
                int count = stream.read(bytes, size, bytes.length - size);
                if (count == -1) break;
                size += count;
            }
            if (size == 0 || size >= bytes.length) return null;
            String json = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes, 0, size)).toString();
            Object url = new JSONObject(json).get("url");
            if (!(url instanceof String)) return null;
            return Connection.parse((String) url);
        } catch (IOException | JSONException | IllegalArgumentException invalid) {
            // The optional asset must never prevent manual configuration.
            return null;
        }
    }

    private void buildInterface() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        stageNotice = new LinearLayout(this);
        stageNotice.setOrientation(LinearLayout.VERTICAL);
        stageNotice.setPadding(dp(20), dp(16), dp(20), dp(16));
        stageNotice.setBackgroundColor(BACKGROUND);
        stageStatus = text("", 20, FOREGROUND);
        stageStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        stageNotice.addView(stageStatus, new LinearLayout.LayoutParams(-1, -2));
        Button configure = button("Configurar conexão");
        LinearLayout.LayoutParams noticeButton = new LinearLayout.LayoutParams(-2, dp(56));
        noticeButton.topMargin = dp(12);
        stageNotice.addView(configure, noticeButton);
        configure.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) { showConfiguration(); }
        });
        FrameLayout.LayoutParams noticeLayout = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        noticeLayout.setMargins(dp(24), dp(24), dp(24), dp(24));
        root.addView(stageNotice, noticeLayout);
        stageNotice.setVisibility(View.GONE);

        configuration = new LinearLayout(this);
        configuration.setOrientation(LinearLayout.VERTICAL);
        configuration.setGravity(Gravity.CENTER_HORIZONTAL);
        configuration.setBackgroundColor(BACKGROUND);
        root.addView(configuration, new FrameLayout.LayoutParams(-1, -1));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        int contentWidth = Math.min(getResources().getDisplayMetrics().widthPixels, dp(800));
        configuration.addView(scroll, new LinearLayout.LayoutParams(contentWidth, -1));
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setGravity(Gravity.CENTER_VERTICAL);
        form.setPadding(dp(24), dp(20), dp(24), dp(20));
        scroll.addView(form, new ScrollView.LayoutParams(-1, -1));

        TextView title = text("Tela FBS", 34, FOREGROUND);
        title.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        if (Build.VERSION.SDK_INT >= 28) {
            title.setAccessibilityHeading(true);
        }
        form.addView(title);
        TextView explanation = text(
                "Conecte à mesma rede do notebook e mantenha o servidor FBS aberto. "
                        + "Voltar ou Menu retorna a esta configuração.", 18, MUTED);
        LinearLayout.LayoutParams explanationLayout = new LinearLayout.LayoutParams(-1, -2);
        explanationLayout.topMargin = dp(8);
        explanationLayout.bottomMargin = dp(16);
        form.addView(explanation, explanationLayout);

        TextView label = text("URL do notebook", 18, FOREGROUND);
        form.addView(label);
        address = new EditText(this);
        address.setId(View.generateViewId());
        label.setLabelFor(address.getId());
        address.setSingleLine(true);
        address.setTextSize(20);
        address.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        address.setTextColor(FOREGROUND);
        address.setHintTextColor(MUTED);
        address.setHint("http://192.168.1.100:8790");
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setSelectAllOnFocus(true);
        address.setPadding(dp(16), dp(8), dp(16), dp(8));
        address.setMinimumHeight(dp(56));
        address.setBackground(controlBackground(false));
        LinearLayout.LayoutParams addressLayout = new LinearLayout.LayoutParams(-1, dp(60));
        addressLayout.topMargin = dp(8);
        form.addView(address, addressLayout);

        openButton = button("Abrir apresentação");
        forgetButton = button("Esquecer conexão");
        openButton.setId(View.generateViewId());
        forgetButton.setId(View.generateViewId());
        LinearLayout.LayoutParams openLayout = new LinearLayout.LayoutParams(-1, dp(56));
        openLayout.topMargin = dp(16);
        form.addView(openButton, openLayout);

        configurationStatus = text("", 17, AMBER);
        configurationStatus.setMinHeight(dp(48));
        configurationStatus.setGravity(Gravity.CENTER_VERTICAL);
        configurationStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        LinearLayout.LayoutParams statusLayout = new LinearLayout.LayoutParams(-1, -2);
        statusLayout.topMargin = dp(8);
        statusLayout.bottomMargin = dp(8);
        form.addView(configurationStatus, statusLayout);
        form.addView(forgetButton, new LinearLayout.LayoutParams(-1, dp(56)));

        address.setNextFocusDownId(openButton.getId());
        address.setNextFocusForwardId(openButton.getId());
        openButton.setNextFocusUpId(address.getId());
        openButton.setNextFocusDownId(forgetButton.getId());
        openButton.setNextFocusForwardId(forgetButton.getId());
        forgetButton.setNextFocusUpId(openButton.getId());
        address.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence value, int start, int before, int count) {
                if (!changingAddress) {
                    retrySuppressed = true;
                    cancelRetry();
                    configurationStatus.setText("");
                }
            }
            @Override public void afterTextChanged(Editable value) { }
        });
        openButton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) {
                if (clearingCookies) return;
                try {
                    Connection selected = Connection.parse(address.getText().toString());
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                            .putString(PREF_URL, selected.url).apply();
                    setAddress(selected.url);
                    activate(selected);
                } catch (IllegalArgumentException invalid) {
                    cancelRetry();
                    configurationStatus.setText(invalid.getMessage());
                    address.requestFocus();
                }
            }
        });
        forgetButton.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View view) { forgetConnection(); }
        });
    }

    private TextView text(String value, int size, int color) {
        TextView result = new TextView(this);
        result.setText(value);
        result.setTextSize(size);
        result.setTextColor(color);
        result.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        return result;
    }

    private Button button(String label) {
        Button result = new Button(this);
        result.setText(label);
        result.setTextSize(18);
        result.setTextColor(FOREGROUND);
        result.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        result.setAllCaps(false);
        result.setMinimumWidth(dp(48));
        result.setMinimumHeight(dp(56));
        result.setPadding(dp(20), dp(8), dp(20), dp(8));
        result.setFocusable(true);
        result.setBackground(controlBackground(true));
        return result;
    }

    private StateListDrawable controlBackground(boolean filled) {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[] {-android.R.attr.state_enabled}, shape(BACKGROUND, MUTED, 1));
        states.addState(new int[] {android.R.attr.state_pressed}, shape(0xff805820, AMBER, 3));
        states.addState(new int[] {android.R.attr.state_focused}, shape(0xff493817, AMBER, 3));
        states.addState(new int[] {}, shape(filled ? 0xff29271f : BACKGROUND, MUTED, 1));
        return states;
    }

    private GradientDrawable shape(int fill, int border, int width) {
        GradientDrawable result = new GradientDrawable();
        result.setColor(fill);
        result.setCornerRadius(dp(8));
        result.setStroke(dp(width), border);
        return result;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void setAddress(String value) {
        changingAddress = true;
        address.setText(value);
        changingAddress = false;
    }

    private void activate(Connection selected) {
        boolean reusable = webView != null && connection != null
                && connection.url.equals(selected.url);
        retrySuppressed = false;
        cancelRetry();
        if (!reusable) {
            disposeWebView();
            connection = selected;
            pageReady = false;
            loading = false;
            mainLoadFailed = false;
            retryNeeded = false;
            retryAttempt = 0;
            pendingInitialLoad = true;
            mainDocumentUrl = selected.url;
            createWebView();
        }
        showStage();
        if (foreground && !loading && !pageReady) {
            startMainLoad();
        }
    }

    private void createWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(true);
        settings.setGeolocationEnabled(false);
        settings.setSaveFormData(false);
        if (Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebViewClient(new ReceiverClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView view, boolean dialog,
                    boolean userGesture, android.os.Message message) {
                notice("Novas janelas estão bloqueadas.");
                return false;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                request.deny();
            }
            @Override public void onGeolocationPermissionsShowPrompt(String origin,
                    GeolocationPermissions.Callback callback) {
                callback.invoke(origin, false, false);
            }
            @Override public boolean onShowFileChooser(WebView view,
                    ValueCallback<Uri[]> callback, FileChooserParams parameters) {
                callback.onReceiveValue(null);
                notice("Acesso a arquivos locais bloqueado.");
                return true;
            }
        });
        webView.setDownloadListener(new DownloadListener() {
            @Override public void onDownloadStart(String url, String agent,
                    String disposition, String mime, long length) {
                notice("Downloads estão bloqueados neste receptor.");
            }
        });
        webView.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View view) { return true; }
        });
        root.addView(webView, 0, new FrameLayout.LayoutParams(-1, -1));
    }

    private void showStage() {
        stageVisible = true;
        configuration.setVisibility(View.GONE);
        stageNotice.setVisibility(stageMessage.length() == 0 ? View.GONE : View.VISIBLE);
        InputMethodManager keyboard = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (keyboard != null) keyboard.hideSoftInputFromWindow(address.getWindowToken(), 0);
        if (webView != null) webView.requestFocus();
        applyWindowMode();
    }

    private void showConfiguration() {
        stageVisible = false;
        retrySuppressed = true;
        cancelRetry();
        configuration.setVisibility(View.VISIBLE);
        stageNotice.setVisibility(View.GONE);
        applyWindowMode();
        openButton.requestFocus();
        // The WebView stays attached and visible behind this opaque native form.
        // No reload, onPause(), or pauseTimers() occurs when switching screens.
    }

    private void applyWindowMode() {
        if (foreground && stageVisible) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_FULLSCREEN);
            root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_FULLSCREEN);
            root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    private void notice(String message) {
        if (destroyed) return;
        stageMessage = message;
        stageStatus.setText(message);
        configurationStatus.setText(message);
        stageNotice.setVisibility(stageVisible ? View.VISIBLE : View.GONE);
    }

    private void startMainLoad() {
        if (destroyed || webView == null || connection == null) return;
        if (!foreground || !stageVisible) {
            pendingInitialLoad = true;
            return;
        }
        cancelRetry();
        pendingInitialLoad = false;
        retryNeeded = false;
        mainLoadFailed = false;
        loading = true;
        pageReady = false;
        mainDocumentUrl = connection.url;
        notice("Conectando ao notebook…");
        webView.loadUrl(connection.url);
    }

    private void mainFailure(WebView view, String message) {
        if (destroyed || view != webView || mainLoadFailed) return;
        mainLoadFailed = true;
        loading = false;
        pageReady = false;
        retryNeeded = true;
        lastFailure = message;
        view.stopLoading();
        notice(message);
        scheduleRetry();
    }

    private void scheduleRetry() {
        if (destroyed || !foreground || !stageVisible || retrySuppressed
                || !retryNeeded || retryScheduled || loading || webView == null) return;
        long delay = Math.min(30000L, 2000L << Math.min(retryAttempt, 4));
        if (retryAttempt < 4) retryAttempt++;
        retryScheduled = true;
        notice(lastFailure + " Nova tentativa em " + (delay / 1000L) + " s.");
        handler.postDelayed(retryTask, delay);
    }

    private void cancelRetry() {
        handler.removeCallbacks(retryTask);
        retryScheduled = false;
    }

    private boolean allowed(String url) {
        Connection selected = connection;
        return selected != null && selected.sameOrigin(url);
    }

    private boolean mainDocument(String url) {
        if (url == null || mainDocumentUrl == null) return false;
        return withoutFragment(url).equals(withoutFragment(mainDocumentUrl));
    }

    private static String withoutFragment(String url) {
        int fragment = url.indexOf('#');
        return fragment < 0 ? url : url.substring(0, fragment);
    }

    private final class ReceiverClient extends WebViewClient {
        private boolean blockNavigation(WebView view, String url) {
            if (destroyed || view != webView) return true;
            if (allowed(url)) return false;
            notice("Navegação bloqueada. Use somente a origem do notebook escolhido.");
            return true;
        }

        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return blockNavigation(view, request.getUrl().toString());
        }

        @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return blockNavigation(view, url);
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view,
                WebResourceRequest request) {
            // Also blocks external resources and HTTP redirect targets before their response
            // is consumed. WebView's navigation callback alone does not cover every request.
            if (!allowed(request.getUrl().toString())) {
                return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
                        Collections.<String, String>emptyMap(),
                        new ByteArrayInputStream(new byte[0]));
            }
            return null;
        }

        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
            if (destroyed || view != webView) return;
            if (!allowed(url)) {
                mainFailure(view, "Redirecionamento para outra origem bloqueado.");
                return;
            }
            cancelRetry();
            mainDocumentUrl = url;
            mainLoadFailed = false;
            retryNeeded = false;
            loading = true;
            pageReady = false;
        }

        @Override public void onPageFinished(WebView view, String url) {
            if (destroyed || view != webView || mainLoadFailed || !loading
                    || !allowed(url) || !mainDocument(url)) return;
            loading = false;
            pageReady = true;
            retryNeeded = false;
            pendingInitialLoad = false;
            retryAttempt = 0;
            cancelRetry();
            stageMessage = "";
            stageNotice.setVisibility(View.GONE);
            if (stageVisible) configurationStatus.setText("");
            CookieManager.getInstance().flush();
            // An already loaded /tv owns its WebSocket reconnection; never poll/reload it.
        }

        @Override public void onReceivedError(WebView view, WebResourceRequest request,
                WebResourceError error) {
            if (request.isForMainFrame()) {
                mainFailure(view, "Não foi possível abrir a apresentação. "
                        + "Confira o endereço, a rede e o servidor do notebook.");
            }
            // Media/subresource failures must not replace or reload the presentation.
        }

        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request,
                WebResourceResponse response) {
            if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                mainFailure(view, "O servidor respondeu com erro HTTP "
                        + response.getStatusCode() + ".");
            }
        }

        @Override public void onReceivedSslError(WebView view, SslErrorHandler sslHandler,
                SslError error) {
            sslHandler.cancel();
            if (destroyed || view != webView) return;
            if (mainDocument(error.getUrl())) {
                mainFailure(view, "Certificado TLS inválido. A conexão foi cancelada.");
            } else {
                notice("Conteúdo bloqueado por certificado TLS inválido.");
            }
        }

        @Override public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler auth,
                String host, String realm) {
            auth.cancel();
            if (view == webView && !destroyed) {
                notice("Autenticação HTTP bloqueada. Faça o pareamento pela página /tv.");
            }
        }

        @Override public void onReceivedClientCertRequest(WebView view, ClientCertRequest request) {
            request.cancel();
        }
    }

    private void forgetConnection() {
        if (clearingCookies) return;
        showConfiguration();
        cancelRetry();
        retryNeeded = false;
        pendingInitialLoad = false;
        loading = false;
        pageReady = false;
        mainLoadFailed = false;
        retryAttempt = 0;
        disposeWebView();
        connection = null;
        mainDocumentUrl = null;
        stageMessage = "";
        lastFailure = "";
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(PREF_URL).apply();
        setAddress("");
        clearingCookies = true;
        openButton.setEnabled(false);
        forgetButton.setEnabled(false);
        configurationStatus.setText("Esquecendo conexão e pareamento…");
        WebStorage.getInstance().deleteAllData();
        CookieManager.getInstance().removeAllCookies(new ValueCallback<Boolean>() {
            @Override public void onReceiveValue(Boolean removed) {
                CookieManager.getInstance().flush();
                if (destroyed) return;
                clearingCookies = false;
                openButton.setEnabled(true);
                forgetButton.setEnabled(true);
                configurationStatus.setText("Conexão e pareamento esquecidos.");
                address.requestFocus();
            }
        });
    }

    private void disposeWebView() {
        WebView old = webView;
        webView = null;
        if (old != null) {
            old.stopLoading();
            root.removeView(old);
            old.setDownloadListener(null);
            old.setWebChromeClient(null);
            old.removeAllViews();
            old.destroy();
        }
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
        applyWindowMode();
        if (stageVisible && !retrySuppressed) {
            if (pendingInitialLoad) startMainLoad();
            else if (retryNeeded) scheduleRetry();
        }
    }

    @Override protected void onPause() {
        foreground = false;
        cancelRetry();
        applyWindowMode();
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override protected void onDestroy() {
        destroyed = true;
        cancelRetry();
        handler.removeCallbacksAndMessages(null);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        CookieManager.getInstance().flush();
        disposeWebView();
        connection = null;
        super.onDestroy();
    }

    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused && root != null) applyWindowMode();
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        int key = event.getKeyCode();
        if (key == KeyEvent.KEYCODE_MENU || (key == KeyEvent.KEYCODE_BACK && stageVisible)) {
            if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) {
                showConfiguration();
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    @Override public void onBackPressed() {
        if (stageVisible) showConfiguration();
        else super.onBackPressed();
    }

    private static final class Connection {
        final String url;
        final String scheme;
        final String host;
        final int port;

        private Connection(String url, String scheme, String host, int port) {
            this.url = url;
            this.scheme = scheme;
            this.host = host;
            this.port = port;
        }

        static Connection parse(String input) {
            String message = "Use http:// ou https:// com o endereço do notebook, "
                    + "sem credenciais, parâmetros ou fragmento. Caminhos aceitos: /tv e /display.";
            try {
                URI parsed = new URI(input.trim());
                String scheme = parsed.getScheme();
                if (scheme == null) throw new IllegalArgumentException(message);
                scheme = scheme.toLowerCase(Locale.US);
                String host = parsed.getHost();
                int port = parsed.getPort();
                if ((!scheme.equals("http") && !scheme.equals("https"))
                        || parsed.isOpaque() || host == null || host.length() == 0
                        || parsed.getRawUserInfo() != null || parsed.getRawQuery() != null
                        || parsed.getRawFragment() != null || port == 0 || port > 65535
                        || port < -1) {
                    throw new IllegalArgumentException(message);
                }
                String path = parsed.getRawPath();
                if (path == null || path.length() == 0 || path.equals("/")) path = "/tv";
                if (!path.equals("/tv") && !path.equals("/display")) {
                    throw new IllegalArgumentException(message);
                }
                host = host.toLowerCase(Locale.US);
                int effective = effectivePort(scheme, port);
                int canonicalPort = effective == effectivePort(scheme, -1) ? -1 : port;
                String url = new URI(scheme, null, host, canonicalPort, path, null, null)
                        .toASCIIString();
                return new Connection(url, scheme, host, effective);
            } catch (URISyntaxException invalid) {
                throw new IllegalArgumentException(message);
            }
        }

        boolean sameOrigin(String candidate) {
            if (candidate == null) return false;
            try {
                URI parsed = new URI(candidate);
                String otherScheme = parsed.getScheme();
                String otherHost = parsed.getHost();
                int otherPort = parsed.getPort();
                return !parsed.isOpaque() && parsed.getRawUserInfo() == null
                        && otherScheme != null && otherHost != null
                        && otherPort >= -1 && otherPort != 0 && otherPort <= 65535
                        && scheme.equals(otherScheme.toLowerCase(Locale.US))
                        && host.equals(otherHost.toLowerCase(Locale.US))
                        && port == effectivePort(scheme, otherPort);
            } catch (URISyntaxException invalid) {
                return false;
            }
        }

        private static int effectivePort(String scheme, int port) {
            return port == -1 ? (scheme.equals("https") ? 443 : 80) : port;
        }
    }
}

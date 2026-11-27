import 'dart:async';
import 'dart:collection';
import 'dart:ui' show Size;

import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'anikoto_catalog.dart';

class ProviderCaption {
  const ProviderCaption(this.uri, this.label);
  final Uri uri;
  final String label;
}

class ResolvedEpisode {
  const ResolvedEpisode(this.uri, this.headers, this.captions);
  final Uri uri;
  final Map<String, String> headers;
  final List<ProviderCaption> captions;
}

/// Bounded, ephemeral native browser; never shares account credentials or runs a PC service.
class EmbedResolver {
  HeadlessInAppWebView? _view;
  bool _closed = false;

  static Map<String, String> mediaHeaders(
    Uri embed,
    Map<String, String> observed,
  ) {
    final headers = <String, String>{
      'Referer': '${embed.origin}/',
      'Origin': embed.origin,
      'User-Agent': AnikotoCatalog.userAgent,
    };
    for (final entry in observed.entries) {
      switch (entry.key.toLowerCase()) {
        case 'referer':
          headers['Referer'] = entry.value;
        case 'origin':
          headers['Origin'] = entry.value;
        case 'user-agent':
          headers['User-Agent'] = entry.value;
      }
    }
    return headers;
  }

  static bool publicHttps(Uri uri) =>
      uri.scheme == 'https' &&
      uri.userInfo.isEmpty &&
      (!uri.hasPort || uri.port == 443) &&
      uri.host.contains('.') &&
      !uri.host.contains(':') &&
      !RegExp(r'^\d+(\.\d+){3}$').hasMatch(uri.host) &&
      !uri.host.endsWith('.localhost') &&
      !uri.host.endsWith('.local');

  Future<ResolvedEpisode> resolve(List<Uri> embeds) async {
    if (kIsWeb) {
      throw const ProviderFailure(
        'Provider playback requires the Android or iPhone preview.',
      );
    }
    PlatformInAppWebViewController.debugLoggingSettings.enabled = false;
    final deadline = DateTime.now().add(const Duration(seconds: 22));
    for (final embed in embeds.take(3)) {
      if (DateTime.now().isAfter(deadline)) break;
      if (_closed) throw const ProviderFailure('Playback request cancelled.');
      if (!publicHttps(embed) || embed.host != 'megaplay.buzz') continue;
      Uri? stream;
      var headers = mediaHeaders(embed, {});
      DateTime? capturedAt;
      void capture(String? address, [Map<String, String>? requestHeaders]) {
        if (_closed || address == null) return;
        final uri = Uri.tryParse(address);
        if (uri == null ||
            !publicHttps(uri) ||
            !RegExp(
              r'\.(m3u8|mp4)$',
              caseSensitive: false,
            ).hasMatch(uri.path) ||
            RegExp(
              r'preview|thumb|/ads?/',
              caseSensitive: false,
            ).hasMatch(uri.path)) {
          return;
        }
        if (stream != null && stream != uri) return;
        stream = uri;
        capturedAt ??= DateTime.now();
        if (requestHeaders != null) {
          headers = mediaHeaders(embed, requestHeaders);
        }
      }

      final view = HeadlessInAppWebView(
        initialUserScripts: UnmodifiableListView([
          UserScript(
            source: _mute,
            injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
            forMainFrameOnly: false,
          ),
        ]),
        initialSize: const Size(1280, 720),
        initialUrlRequest: URLRequest(
          url: WebUri(embed.toString()),
          headers: {'Referer': '${AnikotoCatalog.base}/'},
        ),
        initialSettings: InAppWebViewSettings(
          userAgent: AnikotoCatalog.userAgent,
          incognito: true,
          javaScriptEnabled: true,
          javaScriptCanOpenWindowsAutomatically: false,
          supportMultipleWindows: false,
          allowFileAccess: false,
          allowContentAccess: false,
          mediaPlaybackRequiresUserGesture: false,
          mixedContentMode: MixedContentMode.MIXED_CONTENT_NEVER_ALLOW,
          useOnLoadResource: true,
          useShouldInterceptRequest: true,
          useShouldOverrideUrlLoading: true,
        ),
        onCreateWindow: (_, _) async => false,
        onPermissionRequest: (_, request) async => PermissionResponse(
          resources: request.resources,
          action: PermissionResponseAction.DENY,
        ),
        shouldOverrideUrlLoading: (_, action) async {
          final uri = Uri.tryParse('${action.request.url}');
          return uri != null && publicHttps(uri) && uri.host == embed.host
              ? NavigationActionPolicy.ALLOW
              : NavigationActionPolicy.CANCEL;
        },
        shouldInterceptRequest: (_, request) async {
          capture(request.url.toString(), request.headers);
          return null;
        },
        onLoadResource: (_, resource) => capture(resource.url?.toString()),
      );
      _view = view;
      try {
        await view.run().timeout(const Duration(seconds: 8));
        final until = DateTime.now().add(const Duration(seconds: 15));
        while (!_closed &&
            DateTime.now().isBefore(until) &&
            DateTime.now().isBefore(deadline)) {
          final data = await view.webViewController
              ?.evaluateJavascript(source: _observe)
              .timeout(const Duration(seconds: 2));
          if (data is Map) {
            if (data['unavailable'] == true) break;
            if (stream != null &&
                DateTime.now().difference(capturedAt!).inMilliseconds >= 300) {
              final captions = <Uri, ProviderCaption>{};
              for (final row
                  in (data['tracks'] is List
                          ? data['tracks'] as List
                          : const [])
                      .take(20)) {
                if (row is! Map) continue;
                final uri = Uri.tryParse('${row['url']}');
                if (uri != null && publicHttps(uri)) {
                  captions[uri] = ProviderCaption(
                    uri,
                    '${row['label'] ?? 'Subtitles'}',
                  );
                }
              }
              return ResolvedEpisode(
                stream!,
                Map.unmodifiable(headers),
                captions.values.toList(growable: false),
              );
            }
          }
          await Future<void>.delayed(const Duration(milliseconds: 200));
        }
      } on TimeoutException {
        /* Try the next actual provider embed. */
      } finally {
        if (_view == view) _view = null;
        await view.dispose();
      }
    }
    throw const ProviderFailure(
      'The provider did not supply a playable stream. Try again or choose another episode.',
    );
  }

  Future<void> close() async {
    _closed = true; /* resolve owns disposal in its finally block. */
  }

  static const _mute = r'''(() => {
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){this.muted=true;this.volume=0;return play.apply(this,arguments);};
  })()''';

  static const _observe = r'''(() => {
    const v=document.querySelector('video');
    if(v){v.muted=true;v.volume=0;if(v.paused)v.play().catch(()=>{});}
    const p=document.querySelector('.jw-icon-display,.vjs-big-play-button,.play-button,.btn-play');
    if(p&&!p.dataset.anideckStarted){p.dataset.anideckStarted='1';p.click();}
    let tracks=[...document.querySelectorAll('track')].map(t=>({url:t.src,label:t.label||t.srclang}));
    let source=v?.currentSrc;
    try{const j=window.jwplayer?.();const item=j?.getPlaylist?.()?.[0];
      source=source||item?.file;for(const t of item?.tracks||[])if(!t.kind||['captions','subtitles'].includes(t.kind))tracks.push({url:t.file||t.src,label:t.label});
    }catch{}
    for(const t of window.tracks||[])if(!t.kind||['captions','subtitles'].includes(t.kind))tracks.push({url:t.file||t.src||t.url,label:t.label});
    return {source:source||null,tracks,unavailable:/can't find the file|error code:s*410|verify you are human/i.test(document.body?.innerText||'')};
  })()''';
}

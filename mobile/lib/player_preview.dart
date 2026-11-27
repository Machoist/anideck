import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'package:http/http.dart' as http;

import 'preview_sample.dart';
import 'fullscreen_preview.dart';
import 'providers/anikoto_catalog.dart';
import 'providers/embed_resolver.dart';
import 'providers/provider_playback.dart';
import 'local_library.dart';

typedef PreviewControllerFactory = VideoPlayerController Function(
  Uri uri,
  Future<ClosedCaptionFile> captions,
);

class PreviewPlayer extends StatefulWidget {
  const PreviewPlayer({
    super.key,
    this.controllerFactory,
    this.sample = PreviewSample.clip,
    this.providerRequest,
    this.library,
  });
  final PreviewControllerFactory? controllerFactory;
  final PreviewSample sample;
  final ProviderPlaybackRequest? providerRequest;
  final LocalLibrary? library;
  @override
  State<PreviewPlayer> createState() => _PreviewPlayerState();
}

class _PreviewPlayerState extends State<PreviewPlayer>
    with WidgetsBindingObserver {
  VideoPlayerController? _controller;
  String? _error;
  bool _ready = false, _captions = true;
  int _generation = 0;
  AnikotoCatalog? _catalog;
  EmbedResolver? _resolver;
  http.Client? _captionClient;
  String? _subtitleNote;
  bool _fullscreen = false;
  bool _savedTitle = false, _leaving = false, _allowPop = false;
  Timer? _checkpointTimer;
  String? _progressError;
  LocalLibrary get _library => widget.library ?? LocalLibrary.instance;

  Future<void> _saveProgress() async {
    final request = widget.providerRequest, value = _controller?.value;
    if (!_savedTitle ||
        request == null ||
        !_ready ||
        value == null ||
        !value.isInitialized ||
        value.hasError ||
        value.duration <= Duration.zero) {
      return;
    }
    try {
      await _library.checkpoint(
        request.title,
        ResumePoint(
          request.episode.number,
          request.audio,
          value.position > value.duration ? value.duration : value.position,
          value.duration,
        ),
      );
      if (mounted && _progressError != null) {
        setState(() => _progressError = null);
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _progressError = 'Progress couldn’t save on this device. Keep the app open and try again.',
        );
      }
    }
  }

  Future<void> _leave() async {
    if (_leaving) return;
    _leaving = true;
    try {
      await _controller?.pause().timeout(const Duration(seconds: 2));
    } catch (_) {
      /* A failed player must not trap Back. */
    }
    await _saveProgress();
    if (!mounted) return;
    if (_progressError != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(_progressError!)));
    }
    setState(() => _allowPop = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.of(context).pop();
    });
  }

  Future<void> _openFullscreen() async {
    final controller = _controller;
    if (controller == null || !_ready || _fullscreen) return;
    setState(() => _fullscreen = true);
    try {
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
      if (!mounted) return;
      final captions = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => FullscreenPreview(
            controller: controller,
            title: widget.providerRequest == null
                ? 'Sample playback'
                : '${widget.providerRequest!.title.name} · Episode ${widget.providerRequest!.episode.number}',
            captions: _captions,
            onToggle: _toggle,
            onSeek: _seek,
            onCaptionsChanged: (on) {
              if (mounted) setState(() => _captions = on);
            },
          ),
        ),
      );
      if (mounted && captions != null) setState(() => _captions = captions);
    } finally {
      await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      if (mounted) setState(() => _fullscreen = false);
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  Future<void> _load() async {
    final generation = ++_generation;
    await _saveProgress();
    if (!mounted || generation != _generation) return;
    _checkpointTimer?.cancel();
    final previous = _controller;
    _controller = null;
    setState(() {
      _error = null;
      _ready = false;
      _subtitleNote = null;
    });
    _catalog?.close();
    await _resolver?.close();
    _captionClient?.close();
    await previous?.dispose();
    if (!mounted || generation != _generation) return;
    try {
      var uri = widget.sample.uri;
      var headers = <String, String>{};
      var isHls = widget.sample == PreviewSample.streaming;
      Future<ClosedCaptionFile> captions;
      final request = widget.providerRequest;
      ResumePoint? resume;
      if (request != null) {
        try {
          _savedTitle = await _library.contains(request.title);
          resume = await _library.resume(
            request.title,
            request.episode.number,
            request.audio,
          );
        } catch (_) {
          _savedTitle = false;
          _progressError = 'Local progress couldn’t load. Playback is available, but progress won’t save yet.';
        }
        if (!mounted || generation != _generation) return;
        final catalog = AnikotoCatalog(), resolver = EmbedResolver();
        _catalog = catalog;
        _resolver = resolver;
        final media = await resolver.resolve(
          await catalog.embeds(request.episode, request.audio),
        );
        if (!mounted || generation != _generation) return;
        uri = media.uri;
        headers = media.headers;
        isHls = uri.path.toLowerCase().endsWith('.m3u8');
        final client = http.Client();
        _captionClient = client;
        if (media.captions.isEmpty) {
          _subtitleNote = 'This source supplied no selectable subtitles.';
        }
        captions = loadProviderCaptions(media, client).catchError((
          Object error,
        ) {
          if (mounted && generation == _generation) {
            setState(
              () => _subtitleNote = error is ProviderFailure
                  ? error.message
                  : 'Subtitles couldn’t load. Retry playback to try again.',
            );
          }
          return WebVTTCaptionFile('WEBVTT\n\n');
        });
      } else {
        captions = rootBundle
            .loadString('assets/preview.vtt')
            .then<ClosedCaptionFile>(WebVTTCaptionFile.new);
      }
      final controller =
          widget.controllerFactory?.call(uri, captions) ??
          VideoPlayerController.networkUrl(
            uri,
            httpHeaders: headers,
            closedCaptionFile: captions,
            formatHint: isHls ? VideoFormat.hls : null,
          );
      _controller = controller;
      await controller.initialize().timeout(const Duration(seconds: 20));
      if (!mounted || generation != _generation) return;
      if (resume != null &&
          resume.startPosition > Duration.zero &&
          resume.startPosition <
              controller.value.duration - const Duration(seconds: 5)) {
        await controller.seekTo(resume.startPosition);
      }
      if (!mounted || generation != _generation) return;
      setState(() => _ready = true);
      if (_savedTitle) {
        _checkpointTimer = Timer.periodic(
          const Duration(seconds: 10),
          (_) => unawaited(_saveProgress()),
        );
      }
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(
          () => _error = widget.providerRequest != null
              ? (error is ProviderFailure
                    ? error.message
                    : 'This episode couldn’t play. Try again or choose another episode.')
              : widget.sample == PreviewSample.streaming
              ? 'This device couldn’t open the streaming sample. Try the short clip or another device.'
              : 'The preview couldn’t load. Check your connection and try again.',
        );
      }
    }
  }

  Future<void> _toggle() async {
    final controller = _controller;
    if (controller == null || !_ready) return;
    try {
      if (controller.value.isPlaying) {
        await controller.pause();
        await _saveProgress();
      } else {
        if (controller.value.position >= controller.value.duration) {
          await controller.seekTo(Duration.zero);
        }
        await controller.play();
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _error =
              'Playback was interrupted. Try loading the preview again.',
        );
      }
    }
  }

  Future<void> _seek(int seconds) async {
    final controller = _controller;
    if (controller == null || !_ready) return;
    final milliseconds =
        (controller.value.position.inMilliseconds + seconds * 1000).clamp(
          0,
          controller.value.duration.inMilliseconds,
        );
    try {
      await controller.seekTo(Duration(milliseconds: milliseconds));
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Couldn’t seek in this preview. Try loading it again.',
        );
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      unawaited(_controller?.pause());
      unawaited(_saveProgress());
    }
  }

  @override
  void dispose() {
    _checkpointTimer?.cancel();
    if (!_leaving) unawaited(_saveProgress());
    _generation++;
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_controller?.dispose());
    _catalog?.close();
    unawaited(_resolver?.close());
    _captionClient?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: widget.providerRequest == null || _allowPop,
    onPopInvokedWithResult: (didPop, result) {
      if (!didPop) unawaited(_leave());
    },
    child: Scaffold(
      appBar: AppBar(
        title: Text(
          widget.providerRequest?.title.name ?? 'Playback preview',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        backgroundColor: Colors.transparent,
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 700),
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(22),
                  child: AspectRatio(
                    aspectRatio: _ready
                        ? _controller!.value.aspectRatio
                        : 16 / 9,
                    child: ColoredBox(
                      color: Colors.black,
                      child: _error != null
                          ? const Center(
                              child: Icon(
                                Icons.wifi_off_rounded,
                                size: 36,
                                color: Color(0xffbba5ff),
                              ),
                            )
                          : !_ready
                          ? const Center(child: CircularProgressIndicator())
                          : ValueListenableBuilder<VideoPlayerValue>(
                              valueListenable: _controller!,
                              builder: (context, value, _) => Stack(
                                fit: StackFit.expand,
                                children: [
                                  if (!_fullscreen) VideoPlayer(_controller!),
                                  if (_captions)
                                    Align(
                                      alignment: Alignment.bottomCenter,
                                      child: Padding(
                                        padding: const EdgeInsets.all(12),
                                        child: ClosedCaption(
                                          text: value.caption.text,
                                          textStyle: const TextStyle(
                                            fontSize: 16,
                                            color: Colors.white,
                                            height: 1.4,
                                          ),
                                        ),
                                      ),
                                    ),
                                  if (value.isBuffering)
                                    const Center(
                                      child: CircularProgressIndicator(),
                                    ),
                                  if (!value.isPlaying && !value.isBuffering)
                                    Center(
                                      child: IconButton.filled(
                                        tooltip: 'Play preview',
                                        iconSize: 38,
                                        onPressed: _toggle,
                                        icon: const Icon(
                                          Icons.play_arrow_rounded,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  widget.providerRequest == null
                      ? 'A moment to try it out.'
                      : 'Episode ${widget.providerRequest!.episode.number}',
                  style: TextStyle(fontSize: 25, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text(
                  widget.providerRequest == null
                      ? widget.sample.attribution
                      : 'Anikoto • ${widget.providerRequest!.audio == 'sub' ? 'Subtitled' : 'Dubbed'}',
                  style: TextStyle(color: Color(0xffaaa2b8), fontSize: 12),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_error!, style: const TextStyle(height: 1.5)),
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          onPressed: _load,
                          icon: const Icon(Icons.refresh_rounded),
                          label: const Text('Try again'),
                        ),
                      ],
                    ),
                  ),
                if (_ready && _error == null)
                  ValueListenableBuilder<VideoPlayerValue>(
                    valueListenable: _controller!,
                    builder: (context, value, _) => Column(
                      children: [
                        const SizedBox(height: 24),
                        VideoProgressIndicator(
                          _controller!,
                          allowScrubbing: true,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          colors: const VideoProgressColors(
                            playedColor: Color(0xffbba5ff),
                            bufferedColor: Color(0xff514760),
                            backgroundColor: Color(0xff292532),
                          ),
                        ),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(_time(value.position)),
                            Text(_time(value.duration)),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            IconButton(
                              tooltip: 'Back 10 seconds',
                              onPressed: () => _seek(-10),
                              icon: const Icon(Icons.replay_10_rounded),
                            ),
                            const SizedBox(width: 12),
                            IconButton.filled(
                              tooltip: value.isPlaying ? 'Pause' : 'Play',
                              onPressed: _toggle,
                              icon: Icon(
                                value.isPlaying
                                    ? Icons.pause_rounded
                                    : Icons.play_arrow_rounded,
                              ),
                              iconSize: 32,
                            ),
                            const SizedBox(width: 12),
                            IconButton(
                              tooltip: 'Forward 10 seconds',
                              onPressed: () => _seek(10),
                              icon: const Icon(Icons.forward_10_rounded),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        FilterChip(
                          label: Text(
                            _captions ? 'Captions on' : 'Captions off',
                          ),
                          avatar: const Icon(
                            Icons.closed_caption_outlined,
                            size: 18,
                          ),
                          selected: _captions,
                          onSelected: (on) => setState(() => _captions = on),
                        ),
                        if (_subtitleNote != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 12),
                            child: Text(
                              _subtitleNote!,
                              style: const TextStyle(color: Color(0xffffca8b)),
                            ),
                          ),
                        TextButton.icon(
                          onPressed: _openFullscreen,
                          icon: const Icon(Icons.fullscreen_rounded),
                          label: const Text('Fullscreen'),
                        ),
                        if (value.hasError)
                          Column(
                            children: [
                              const Text(
                                'Playback stopped. Try loading the preview again.',
                              ),
                              TextButton(
                                onPressed: _load,
                                child: const Text('Reload preview'),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                const SizedBox(height: 28),
                if (widget.providerRequest != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(
                      _progressError ??
                          (_savedTitle
                              ? 'Resume progress saves on this device. Episodes aren’t automatically marked watched.'
                              : 'Save this show to My list to remember your place.'),
                      style: TextStyle(
                        color: _progressError == null
                            ? const Color(0xffaaa2b8)
                            : const Color(0xffffca8b),
                        height: 1.5,
                      ),
                    ),
                  ),
                const Text(
                  'Playback pauses when you leave the app. Tap Play when you return.',
                  style: TextStyle(color: Color(0xffaaa2b8), height: 1.5),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  String _time(Duration value) =>
      '${value.inMinutes}:${(value.inSeconds % 60).toString().padLeft(2, '0')}';
}

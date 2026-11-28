import 'dart:async';
import 'dart:math' as math;

import 'player_chrome.dart';

import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

/// Presentation only: the owning player keeps its controller and lifecycle.
class FullscreenPreview extends StatefulWidget {
  const FullscreenPreview({
    super.key,
    required this.controller,
    required this.title,
    required this.captions,
    required this.onToggle,
    required this.onSeek,
    required this.onCaptionsChanged,
  });
  final VideoPlayerController controller;
  final String title;
  final bool captions;
  final Future<void> Function() onToggle;
  final Future<void> Function(int seconds) onSeek;
  final ValueChanged<bool> onCaptionsChanged;
  @override
  State<FullscreenPreview> createState() => _FullscreenPreviewState();
}

/// Delay before overlaid controls hide while video keeps playing.
const fullscreenControlsHideDelay = Duration(seconds: 3);

class _FullscreenPreviewState extends State<FullscreenPreview> {
  late bool _captions = widget.captions;
  bool _fill = false;

  // Auto-hide state. Controls only hide while playing without an error, with
  // no pointer held on a control, no route (menu/dialog/sheet) above this
  // one and no screen reader/switch navigation in use.
  bool _controlsShown = true;
  Timer? _hideTimer;
  int _controlPointers = 0;
  bool _routeCurrent = true, _accessibleNavigation = false;
  final _keyFocus = FocusNode(debugLabel: 'fullscreen-keys');

  bool get _mustShowControls {
    final value = widget.controller.value;
    return !value.isPlaying ||
        value.hasError ||
        _controlPointers > 0 ||
        !_routeCurrent ||
        _accessibleNavigation;
  }

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_syncControls);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _routeCurrent = ModalRoute.of(context)?.isCurrent ?? true;
    _accessibleNavigation = MediaQuery.accessibleNavigationOf(context);
    // A rebuild follows dependency changes, so no setState here.
    _syncControls(rebuild: false);
  }

  @override
  void didUpdateWidget(FullscreenPreview old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller.removeListener(_syncControls);
      widget.controller.addListener(_syncControls);
      _syncControls();
    }
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    widget.controller.removeListener(_syncControls);
    _keyFocus.dispose();
    super.dispose();
  }

  /// Keeps visibility consistent with the current hold reasons; arms the
  /// hide timer once when hiding becomes allowed. Cheap enough to run on every
  /// controller position update because it never re-arms a running timer.
  void _syncControls({bool rebuild = true}) {
    if (!mounted) return;
    if (_mustShowControls) {
      _hideTimer?.cancel();
      _hideTimer = null;
      if (!_controlsShown) {
        if (rebuild) {
          setState(() => _controlsShown = true);
        } else {
          _controlsShown = true;
        }
      }
    } else if (_controlsShown && _hideTimer == null) {
      _hideTimer = Timer(fullscreenControlsHideDelay, () {
        _hideTimer = null;
        if (mounted && !_mustShowControls) {
          setState(() => _controlsShown = false);
        }
      });
    }
  }

  /// Shows controls and restarts the inactivity delay.
  void _revealControls() {
    _hideTimer?.cancel();
    _hideTimer = null;
    if (!_controlsShown) setState(() => _controlsShown = true);
    _syncControls();
  }

  void _toggleControls() {
    if (_controlsShown && !_mustShowControls) {
      _hideTimer?.cancel();
      _hideTimer = null;
      setState(() => _controlsShown = false);
    } else {
      _revealControls();
    }
  }

  void _controlPointerDown(PointerDownEvent _) {
    _controlPointers++;
    _revealControls();
  }

  void _controlPointerUp(PointerEvent _) {
    if (_controlPointers > 0) _controlPointers--;
    _revealControls();
  }

  /// Fades a control bar without changing layout; hidden bars take no
  /// pointer, focus or semantics so taps reach the video and nothing
  /// invisible can be activated.
  Widget _controlBar(Widget child) {
    final shown = _controlsShown;
    return AnimatedOpacity(
      opacity: shown ? 1 : 0,
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : const Duration(milliseconds: 200),
      child: IgnorePointer(
        ignoring: !shown,
        child: ExcludeFocus(
          excluding: !shown,
          child: ExcludeSemantics(
            excluding: !shown,
            child: Listener(
              onPointerDown: _controlPointerDown,
              onPointerUp: _controlPointerUp,
              onPointerCancel: _controlPointerUp,
              child: child,
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Focus(
    focusNode: _keyFocus,
    autofocus: true,
    onKeyEvent: (_, _) {
      // Any key (keyboard, remote, D-pad) reveals controls before it can move
      // focus into them; the event continues to its normal handler.
      _revealControls();
      return KeyEventResult.ignored;
    },
    child: Scaffold(
      backgroundColor: Colors.black,
      body: ValueListenableBuilder<VideoPlayerValue>(
        valueListenable: widget.controller,
        builder: (context, value, _) => LayoutBuilder(
          builder: (context, box) {
            final ratio = value.aspectRatio;
            final width = _fill
                ? math.max(box.maxWidth, box.maxHeight * ratio)
                : math.min(box.maxWidth, box.maxHeight * ratio);
            final height = width / ratio;
            final safe = MediaQuery.paddingOf(context);
            final captionBottom = math.max(
              math.max(0.0, (box.maxHeight - height) / 2) + 16,
              safe.bottom + 112,
            );
            return Stack(
              fit: StackFit.expand,
              children: [
                ClipRect(
                  key: const ValueKey('fullscreen-viewport'),
                  child: Center(
                    child: OverflowBox(
                      maxWidth: double.infinity,
                      maxHeight: double.infinity,
                      child: SizedBox(
                        width: width,
                        height: height,
                        child: VideoPlayer(widget.controller),
                      ),
                    ),
                  ),
                ),
                if (_captions)
                  Positioned(
                    left: safe.left + 20,
                    right: safe.right + 20,
                    bottom: captionBottom,
                    child: ClosedCaption(
                      text: value.caption.text,
                      textStyle: const TextStyle(
                        fontSize: 18,
                        color: Colors.white,
                        height: 1.35,
                      ),
                    ),
                  ),
                if (value.isBuffering)
                  const Center(child: CircularProgressIndicator()),
                Positioned.fill(
                  child: GestureDetector(
                    key: const ValueKey('fullscreen-tap-layer'),
                    behavior: HitTestBehavior.opaque,
                    excludeFromSemantics: true,
                    onTap: _toggleControls,
                  ),
                ),
                Center(
                  child: _controlBar(
                    PlayerTransport(
                      playing: value.isPlaying,
                      onToggle: widget.onToggle,
                      onSeek: widget.onSeek,
                    ),
                  ),
                ),
                Align(
                  alignment: Alignment.topCenter,
                  child: _controlBar(
                    DecoratedBox(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color(0xcc000000), Color(0x00000000)],
                        ),
                      ),
                      child: SafeArea(
                        bottom: false,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(4, 4, 4, 16),
                          child: Row(
                            children: [
                              IconButton(
                                tooltip: 'Exit fullscreen',
                                onPressed: () =>
                                    Navigator.pop(context, _captions),
                                icon: const Icon(Icons.fullscreen_exit_rounded),
                              ),
                              Expanded(
                                child: Text(
                                  widget.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Playback settings',
                                onPressed: () => showPlayerOptions(
                                  context,
                                  widget.controller,
                                ),
                                icon: const Icon(Icons.tune_rounded),
                              ),
                              Tooltip(
                                message: _fill
                                    ? 'Fit whole image'
                                    : 'Fill screen (crops edges)',
                                child: TextButton.icon(
                                  key: const ValueKey('fullscreen-fit'),
                                  onPressed: () =>
                                      setState(() => _fill = !_fill),
                                  icon: Icon(
                                    _fill
                                        ? Icons.crop_rounded
                                        : Icons.fit_screen_rounded,
                                    size: 20,
                                  ),
                                  label: Text(_fill ? 'Fill' : 'Fit'),
                                ),
                              ),
                              IconButton(
                                tooltip: _captions
                                    ? 'Turn captions off'
                                    : 'Turn captions on',
                                onPressed: () {
                                  setState(() => _captions = !_captions);
                                  widget.onCaptionsChanged(_captions);
                                },
                                icon: Icon(
                                  _captions
                                      ? Icons.closed_caption
                                      : Icons.closed_caption_off_outlined,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Align(
                  alignment: Alignment.bottomCenter,
                  child: _controlBar(
                    DecoratedBox(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color(0x00000000), Color(0xdd000000)],
                        ),
                      ),
                      child: SafeArea(
                        top: false,
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              VideoProgressIndicator(
                                widget.controller,
                                allowScrubbing: true,
                                padding: const EdgeInsets.symmetric(
                                  vertical: 14,
                                ),
                                colors: const VideoProgressColors(
                                  playedColor: Color(0xffbba5ff),
                                ),
                              ),
                              Row(
                                children: [
                                  Text(
                                    playerTime(value.position),
                                    style: const TextStyle(
                                      color: playerAccent,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const Spacer(),
                                  Text(
                                    playerTime(value.duration),
                                    style: const TextStyle(
                                      color: Color(0xffd0cbd9),
                                    ),
                                  ),
                                ],
                              ),
                              if (value.hasError)
                                const Text(
                                  'Playback stopped. Exit fullscreen to reload.',
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    ),
  );
}

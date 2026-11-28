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

  /// Desktop order: elapsed time, timeline, total time.
  Widget _seekRow(VideoPlayerValue value) => Row(
    key: const ValueKey('fullscreen-seek-row'),
    children: [
      _Time(playerTime(value.position), emphasis: true),
      Expanded(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: VideoProgressIndicator(
            widget.controller,
            allowScrubbing: true,
            padding: const EdgeInsets.symmetric(vertical: 16),
            colors: const VideoProgressColors(
              playedColor: playerAccent,
              bufferedColor: Color(0x66ffffff),
              backgroundColor: Color(0x33ffffff),
            ),
          ),
        ),
      ),
      _Time(playerTime(value.duration)),
    ],
  );

  /// Every player option sits below the timeline, right-aligned like the
  /// desktop player and ending with exit fullscreen; 48dp touch targets.
  Widget _toolbar(VideoPlayerValue value) {
    final speed = value.playbackSpeed;
    return Row(
      key: const ValueKey('fullscreen-toolbar'),
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        _ToolButton(
          tooltip: _captions ? 'Turn captions off' : 'Turn captions on',
          selected: _captions,
          icon: _captions
              ? Icons.closed_caption_rounded
              : Icons.closed_caption_off_outlined,
          onPressed: () {
            setState(() => _captions = !_captions);
            widget.onCaptionsChanged(_captions);
          },
        ),
        speed == 1
            ? _ToolButton(
                tooltip: 'Playback settings',
                icon: Icons.tune_rounded,
                onPressed: () => showPlayerOptions(context, widget.controller),
              )
            : _ToolPill(
                tooltip: 'Playback settings',
                icon: Icons.tune_rounded,
                label: speedLabel(speed),
                highlighted: true,
                onPressed: () => showPlayerOptions(context, widget.controller),
              ),
        _ToolPill(
          key: const ValueKey('fullscreen-fit'),
          tooltip: _fill ? 'Fit whole picture' : 'Fill screen (crops edges)',
          icon: _fill ? Icons.crop_rounded : Icons.fit_screen_rounded,
          label: _fill ? 'Fill' : 'Fit',
          onPressed: () => setState(() => _fill = !_fill),
        ),
        _ToolButton(
          tooltip: 'Exit fullscreen',
          icon: Icons.fullscreen_exit_rounded,
          onPressed: () => Navigator.pop(context, _captions),
        ),
      ],
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
                          colors: [Color(0xb3000000), Color(0x00000000)],
                        ),
                      ),
                      child: SafeArea(
                        bottom: false,
                        // Full-width scrim, only as tall as the title,
                        // so it never covers the transport controls.
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(24, 18, 24, 28),
                          child: Row(
                            children: [
                              Expanded(
                                child: Semantics(
                                  header: true,
                                  child: Text(
                                    widget.title,
                                    key: const ValueKey('fullscreen-title'),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: -0.2,
                                    ),
                                  ),
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
                          colors: [Color(0x00000000), Color(0xe6000000)],
                        ),
                      ),
                      child: SafeArea(
                        top: false,
                        minimum: const EdgeInsets.only(bottom: 4),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 20, 12, 0),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _seekRow(value),
                              if (value.hasError)
                                const Padding(
                                  padding: EdgeInsets.only(top: 4),
                                  child: Text(
                                    'Playback stopped. Exit fullscreen to reload.',
                                    style: TextStyle(color: Color(0xffffca8b)),
                                  ),
                                ),
                              _toolbar(value),
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

class _Time extends StatelessWidget {
  const _Time(this.text, {this.emphasis = false});
  final String text;
  final bool emphasis;
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(
      fontSize: 13,
      color: emphasis ? Colors.white : const Color(0xffcfc8dc),
      fontWeight: emphasis ? FontWeight.w700 : FontWeight.w500,
      fontFeatures: const [FontFeature.tabularFigures()],
    ),
  );
}

class _ToolButton extends StatelessWidget {
  const _ToolButton({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
    this.selected = false,
  });
  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;
  final bool selected;
  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: tooltip,
    onPressed: onPressed,
    style: IconButton.styleFrom(
      foregroundColor: selected ? playerAccent : Colors.white,
      minimumSize: const Size(48, 48),
    ),
    iconSize: 24,
    icon: Icon(icon),
  );
}

/// Icon plus a short state label (Fit/Fill, active speed), 48dp tall.
class _ToolPill extends StatelessWidget {
  const _ToolPill({
    super.key,
    required this.tooltip,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.highlighted = false,
  });
  final String tooltip, label;
  final IconData icon;
  final VoidCallback onPressed;
  final bool highlighted;
  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: TextButton.icon(
      style: TextButton.styleFrom(
        foregroundColor: highlighted ? playerAccent : Colors.white,
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        shape: const StadiumBorder(),
      ),
      onPressed: onPressed,
      icon: Icon(icon, size: 22),
      label: Text(label, style: const TextStyle(fontWeight: FontWeight.w700)),
    ),
  );
}

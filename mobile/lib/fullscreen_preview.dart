import 'dart:math' as math;

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

class _FullscreenPreviewState extends State<FullscreenPreview> {
  late bool _captions = widget.captions;
  bool _fill = false;

  @override
  Widget build(BuildContext context) => Scaffold(
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
              Align(
                alignment: Alignment.topCenter,
                child: DecoratedBox(
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
                            onPressed: () => Navigator.pop(context, _captions),
                            icon: const Icon(Icons.fullscreen_exit_rounded),
                          ),
                          Expanded(
                            child: Text(
                              widget.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          Tooltip(
                            message: _fill
                                ? 'Fit whole image'
                                : 'Fill screen (crops edges)',
                            child: TextButton.icon(
                              key: const ValueKey('fullscreen-fit'),
                              onPressed: () => setState(() => _fill = !_fill),
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
              Align(
                alignment: Alignment.bottomCenter,
                child: DecoratedBox(
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
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            colors: const VideoProgressColors(
                              playedColor: Color(0xffbba5ff),
                            ),
                          ),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              IconButton(
                                tooltip: 'Back 10 seconds',
                                onPressed: () => widget.onSeek(-10),
                                icon: const Icon(Icons.replay_10_rounded),
                              ),
                              IconButton.filled(
                                tooltip: value.isPlaying ? 'Pause' : 'Play',
                                onPressed: widget.onToggle,
                                icon: Icon(
                                  value.isPlaying
                                      ? Icons.pause_rounded
                                      : Icons.play_arrow_rounded,
                                ),
                              ),
                              IconButton(
                                tooltip: 'Forward 10 seconds',
                                onPressed: () => widget.onSeek(10),
                                icon: const Icon(Icons.forward_10_rounded),
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
            ],
          );
        },
      ),
    ),
  );
}

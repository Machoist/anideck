import 'package:material_ui/material_ui.dart';
import 'package:video_player/video_player.dart';

const playerAccent = Color(0xffc5b2ff);

String playerTime(Duration value) {
  final seconds = value.inSeconds.clamp(0, 999999);
  final minutes = (seconds ~/ 60).toString();
  final remainder = (seconds % 60).toString().padLeft(2, '0');
  return seconds >= 3600
      ? '${seconds ~/ 3600}:${((seconds ~/ 60) % 60).toString().padLeft(2, '0')}:$remainder'
      : '$minutes:$remainder';
}

/// "2×", "1.25×", "0.75×": no trailing ".0".
String speedLabel(double speed) =>
    '${speed == speed.roundToDouble() ? speed.toStringAsFixed(0) : speed}×';

/// Shared controls; the owning player retains playback and resume ownership.
class PlayerTransport extends StatelessWidget {
  const PlayerTransport({
    super.key,
    required this.playing,
    required this.onToggle,
    required this.onSeek,
  });
  final bool playing;
  final Future<void> Function() onToggle;
  final Future<void> Function(int) onSeek;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      IconButton(
        tooltip: 'Back 10 seconds',
        onPressed: () => onSeek(-10),
        style: IconButton.styleFrom(
          minimumSize: const Size(52, 52),
          backgroundColor: const Color(0x44272330),
        ),
        iconSize: 30,
        icon: const Icon(Icons.replay_10_rounded),
      ),
      const SizedBox(width: 24),
      IconButton.filled(
        tooltip: playing ? 'Pause' : 'Play',
        onPressed: onToggle,
        style: IconButton.styleFrom(
          backgroundColor: playerAccent,
          foregroundColor: const Color(0xff191321),
          minimumSize: const Size(72, 72),
        ),
        iconSize: 42,
        icon: Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded),
      ),
      const SizedBox(width: 24),
      IconButton(
        tooltip: 'Forward 10 seconds',
        onPressed: () => onSeek(10),
        style: IconButton.styleFrom(
          minimumSize: const Size(52, 52),
          backgroundColor: const Color(0x44272330),
        ),
        iconSize: 30,
        icon: const Icon(Icons.forward_10_rounded),
      ),
    ],
  );
}

/// Only exposes options actually supported by the current media controller.
Future<void> showPlayerOptions(
  BuildContext context,
  VideoPlayerController controller,
) => showModalBottomSheet<void>(
  context: context,
  showDragHandle: true,
  backgroundColor: const Color(0xff201e29),
  shape: const RoundedRectangleBorder(
    borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
  ),
  // Scrollable so short landscape phones never clip the sheet.
  isScrollControlled: true,
  builder: (sheetContext) => SafeArea(
    child: SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 28),
      child: ValueListenableBuilder<VideoPlayerValue>(
        valueListenable: controller,
        builder: (_, value, _) => Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Playback settings',
              style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 20),
            const Text(
              'Playback speed',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final speed in [0.75, 1.0, 1.25, 1.5, 2.0])
                  ChoiceChip(
                    label: Text(speed == 1 ? 'Normal' : speedLabel(speed)),
                    selected: value.playbackSpeed == speed,
                    onSelected: (_) async {
                      try {
                        await controller.setPlaybackSpeed(speed);
                      } catch (_) {
                        if (sheetContext.mounted) {
                          ScaffoldMessenger.of(sheetContext).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'This playback speed is unavailable.',
                              ),
                            ),
                          );
                        }
                      }
                    },
                  ),
              ],
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    ),
  ),
);

import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import 'anilist_service.dart';

Future<bool?> editAniListEntry(
  BuildContext context,
  AniListService service,
  AniListEntry entry,
) => showModalBottomSheet<bool>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  showDragHandle: true,
  isDismissible: false,
  enableDrag: false,
  builder: (_) => AniListEditor(service: service, entry: entry),
);

class AniListEditor extends StatefulWidget {
  const AniListEditor({super.key, required this.service, required this.entry});
  final AniListService service;
  final AniListEntry entry;
  @override
  State<AniListEditor> createState() => _AniListEditorState();
}

class _AniListEditorState extends State<AniListEditor> {
  late String _status = widget.entry.status;
  late double _score = widget.entry.score;
  late final _progress = TextEditingController(
    text: '${widget.entry.progress}',
  );
  bool _saving = false;
  String? _error;
  @override
  void dispose() {
    _progress.dispose();
    super.dispose();
  }

  void _step(int delta) {
    _progress.text =
        '${((int.tryParse(_progress.text) ?? 0) + delta).clamp(0, 100000)}';
  }

  Future<void> _save() async {
    final progress = int.tryParse(_progress.text);
    if (progress == null || progress < 0 || progress > 100000) {
      setState(() => _error = 'Enter an episode count between 0 and 100000.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final changed = await widget.service.save(
        widget.entry,
        AniListEdit(status: _status, progress: progress, score: _score),
      );
      if (mounted) Navigator.pop(context, changed);
    } catch (error) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = error.toString();
        });
      }
    }
  }

  Widget _section(Widget child) => Container(
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: const Color(0xff262230),
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: const Color(0xff3c344a)),
    ),
    child: child,
  );
  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_saving,
    child: SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 600),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'YOUR ANILIST',
                    style: TextStyle(
                      color: Color(0xffbba5ff),
                      fontSize: 11,
                      letterSpacing: 2,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.entry.title,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Changes save to ${widget.service.viewer?.name ?? 'your account'} on AniList. Your local list stays separate.',
                    style: const TextStyle(
                      color: Color(0xffb4afc2),
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 24),
                  IgnorePointer(
                    ignoring: _saving || widget.service.requiresRefresh,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final status in aniListStatuses)
                              ChoiceChip(
                                selected: _status == status,
                                label: Text(
                                  const {
                                    'CURRENT': 'Watching',
                                    'PLANNING': 'Planning',
                                    'COMPLETED': 'Completed',
                                    'PAUSED': 'Paused',
                                    'DROPPED': 'Dropped',
                                    'REPEATING': 'Rewatching',
                                  }[status]!,
                                ),
                                onSelected: (_) =>
                                    setState(() => _status = status),
                              ),
                          ],
                        ),
                        const SizedBox(height: 20),
                        _section(
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Episodes watched',
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  IconButton.filledTonal(
                                    tooltip: 'Decrease episodes watched',
                                    onPressed: () => _step(-1),
                                    icon: const Icon(Icons.remove_rounded),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: TextField(
                                      controller: _progress,
                                      keyboardType: TextInputType.number,
                                      textAlign: TextAlign.center,
                                      inputFormatters: [
                                        FilteringTextInputFormatter.digitsOnly,
                                        LengthLimitingTextInputFormatter(6),
                                      ],
                                      style: const TextStyle(
                                        fontSize: 26,
                                        fontWeight: FontWeight.w800,
                                      ),
                                      decoration: const InputDecoration(
                                        labelText: 'Watched count',
                                        border: OutlineInputBorder(),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  IconButton.filledTonal(
                                    tooltip: 'Increase episodes watched',
                                    onPressed: () => _step(1),
                                    icon: const Icon(Icons.add_rounded),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        _section(
                          Column(
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.star_rounded,
                                    color: Color(0xffbba5ff),
                                    size: 20,
                                  ),
                                  const SizedBox(width: 8),
                                  const Expanded(
                                    child: Text(
                                      'Your score',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: _score == 0
                                        ? null
                                        : () => setState(() => _score = 0),
                                    child: const Text('Clear'),
                                  ),
                                ],
                              ),
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  IconButton.filledTonal(
                                    tooltip: 'Decrease score by 0.5',
                                    onPressed: _score == 0
                                        ? null
                                        : () => setState(
                                            () => _score =
                                                ((_score * 2).ceil() - 1).clamp(
                                                  0,
                                                  20,
                                                ) /
                                                2,
                                          ),
                                    icon: const Icon(Icons.remove_rounded),
                                  ),
                                  Flexible(
                                    child: Column(
                                      children: [
                                        Text(
                                          _score == 0
                                              ? '—'
                                              : _score.toStringAsFixed(1),
                                          style: const TextStyle(
                                            fontSize: 42,
                                            fontWeight: FontWeight.w800,
                                            color: Color(0xffd5c6ff),
                                          ),
                                        ),
                                        const Text(
                                          'out of 10',
                                          style: TextStyle(
                                            color: Color(0xffb4afc2),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  IconButton.filledTonal(
                                    tooltip: 'Increase score by 0.5',
                                    onPressed: _score == 10
                                        ? null
                                        : () => setState(
                                            () => _score =
                                                ((_score * 2).floor() + 1)
                                                    .clamp(0, 20) /
                                                2,
                                          ),
                                    icon: const Icon(Icons.add_rounded),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 16),
                      child: Text(
                        _error!,
                        style: const TextStyle(color: Color(0xffffca8b)),
                      ),
                    ),
                  const SizedBox(height: 24),
                  Wrap(
                    alignment: WrapAlignment.end,
                    spacing: 12,
                    runSpacing: 8,
                    children: [
                      OutlinedButton(
                        onPressed: _saving
                            ? null
                            : () => Navigator.pop(context, false),
                        child: Text(
                          widget.service.requiresRefresh
                              ? 'Close editor'
                              : 'Cancel',
                        ),
                      ),
                      FilledButton.icon(
                        onPressed: _saving || widget.service.requiresRefresh
                            ? null
                            : _save,
                        icon: Icon(
                          _saving
                              ? Icons.hourglass_top_rounded
                              : Icons.check_rounded,
                        ),
                        label: Text(_saving ? 'Saving…' : 'Save to AniList'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

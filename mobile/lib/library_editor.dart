import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import 'local_library.dart';

Future<bool?> editLibraryEntry(
  BuildContext context,
  LocalLibrary library,
  LibraryEntry entry,
) => showModalBottomSheet<bool>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  showDragHandle: true,
  builder: (_) => LibraryEditor(library: library, entry: entry),
);

class LibraryEditor extends StatefulWidget {
  const LibraryEditor({super.key, required this.library, required this.entry});
  final LocalLibrary library;
  final LibraryEntry entry;
  @override
  State<LibraryEditor> createState() => _LibraryEditorState();
}

class _LibraryEditorState extends State<LibraryEditor> {
  late WatchStatus _status;
  late int? _score;
  late TextEditingController _watched;
  bool _saving = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _status = widget.entry.status;
    _score = widget.entry.scoreHalf;
    _watched = TextEditingController(text: '${widget.entry.watched}');
  }

  @override
  void dispose() {
    _watched.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final watched = int.tryParse(_watched.text);
    if (watched == null || watched < 0 || watched > 100000) {
      setState(() => _error = 'Enter an episode count between 0 and 100000.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.library.updateDetails(
        widget.entry.title,
        status: _status,
        watched: watched,
        scoreHalf: _score,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (_) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = 'Couldn’t save your changes. Your previous list details are kept. Try again.';
        });
      }
    }
  }

  void _stepEpisodes(int delta) {
    final value = int.tryParse(_watched.text) ?? 0;
    _watched.text = '${(value + delta).clamp(0, 100000)}';
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
                    'YOUR WATCHLIST',
                    style: TextStyle(
                      color: Color(0xffbba5ff),
                      fontSize: 11,
                      letterSpacing: 2,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.entry.title.name,
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Make it yours. Saved on this device.',
                    style: TextStyle(color: Color(0xffb4afc2)),
                  ),
                  const SizedBox(height: 24),
                  IgnorePointer(
                    ignoring: _saving,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final status in WatchStatus.values)
                              ChoiceChip(
                                selected: _status == status,
                                label: Text(status.label),
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
                                    onPressed: () => _stepEpisodes(-1),
                                    icon: const Icon(Icons.remove_rounded),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: TextField(
                                      controller: _watched,
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
                                    onPressed: () => _stepEpisodes(1),
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
                                    onPressed: _score == null
                                        ? null
                                        : () => setState(() => _score = null),
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
                                    onPressed: _score == null
                                        ? null
                                        : () => setState(
                                            () => _score = _score! <= 1
                                                ? null
                                                : _score! - 1,
                                          ),
                                    icon: const Icon(Icons.remove_rounded),
                                  ),
                                  Flexible(
                                    child: Column(
                                      children: [
                                        Text(
                                          _score == null
                                              ? '—'
                                              : '${_score! / 2}'.replaceFirst(
                                                  RegExp(r'\.0$'),
                                                  '',
                                                ),
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
                                    onPressed: _score == 20
                                        ? null
                                        : () => setState(
                                            () => _score = (_score ?? 0) + 1,
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
                            : () => Navigator.of(context).pop(false),
                        child: const Text('Cancel'),
                      ),
                      FilledButton.icon(
                        onPressed: _saving ? null : _save,
                        icon: Icon(
                          _saving
                              ? Icons.hourglass_top_rounded
                              : Icons.check_rounded,
                        ),
                        label: Text(_saving ? 'Saving…' : 'Save changes'),
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

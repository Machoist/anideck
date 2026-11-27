import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import 'anilist_service.dart';
import 'anilist_editor.dart';

class AniListPageView extends StatefulWidget {
  const AniListPageView({
    super.key,
    this.service,
    this.screenProtection,
    this.openBrowser,
  });
  final AniListService? service;
  final Future<void> Function(bool)? screenProtection;
  final Future<void> Function()? openBrowser;
  @override
  State<AniListPageView> createState() => _AniListPageViewState();
}

class _AniListPageViewState extends State<AniListPageView>
    with WidgetsBindingObserver {
  late final _service = widget.service ?? AniListService();
  final _input = TextEditingController();
  final _scroll = ScrollController();
  static const _privacy = MethodChannel('anideck/privacy');
  bool _busy = true, _protected = false;
  String? _error;
  Future<void> _protect(bool enabled) =>
      widget.screenProtection?.call(enabled) ??
      _privacy.invokeMethod<void>('setScreenProtected', enabled);
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  Future<void> _start() async {
    try {
      await _protect(true);
      if (!mounted) return;
      _protected = true;
      await _service.restore();
      if (_service.viewer != null) await _service.load();
    } catch (error) {
      if (mounted) {
        _error = _protected
            ? error.toString()
            : 'Sign-in privacy could not start. Close this page and try again.';
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) _input.clear();
  }

  Future<void> _run(Future<void> Function() operation) async {
    if (_busy || !_protected) return;
    final previousViewer = _service.viewer;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await operation();
    } catch (error) {
      if (mounted) _error = error.toString();
    } finally {
      _input.clear();
      if (mounted) {
        setState(() => _busy = false);
        if (previousViewer == null && _service.viewer != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _scroll.hasClients) _scroll.jumpTo(0);
          });
        }
      }
    }
  }

  Future<void> _connect() async {
    final token = _input.text;
    await _run(() async {
      await _service.signIn(token);
      await _service.load();
    });
  }

  Future<void> _disconnect() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Disconnect AniList?'),
        content: const Text(
          'This removes the saved AniList token from this device. Your AniList list, AniDeck profile and local list stay intact. You can revoke AniDeck access in AniList settings.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Disconnect'),
          ),
        ],
      ),
    );
    if (yes == true && mounted) await _run(_service.signOut);
  }

  Future<void> _edit(AniListEntry entry) async {
    if (_busy || _service.requiresRefresh) return;
    final saved = await editAniListEntry(context, _service, entry);
    if (!mounted) return;
    setState(() {
      if (_service.requiresRefresh) {
        _error =
            'Refresh AniList to check the latest values before editing again.';
      }
    });
    if (saved == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Saved and verified on AniList.')),
      );
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _input.dispose();
    _scroll.dispose();
    _service.close();
    _protect(false).catchError((_) {});
    super.dispose();
  }

  static String status(String raw) =>
      const {
        'CURRENT': 'Watching',
        'PLANNING': 'Planning',
        'COMPLETED': 'Completed',
        'PAUSED': 'Paused',
        'DROPPED': 'Dropped',
        'REPEATING': 'Rewatching',
      }[raw] ??
      raw;
  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: Scaffold(
      appBar: AppBar(title: const Text('AniList connection')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: ListView(
              controller: _scroll,
              padding: const EdgeInsets.all(24),
              children: [
                const Text(
                  'YOUR TRACKER, ON DECK',
                  style: TextStyle(
                    color: Color(0xffbba5ff),
                    fontSize: 11,
                    letterSpacing: 2,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _service.viewer == null
                      ? 'Bring your anime list.'
                      : _service.viewer!.name,
                  style: const TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Your AniList list is separate from your local list. Edit status, episodes and scores here; save changes directly to AniList.',
                  style: TextStyle(height: 1.5),
                ),
                const SizedBox(height: 20),
                if (_busy) const LinearProgressIndicator(),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Color(0xffffca8b)),
                    ),
                  ),
                if (_protected &&
                    !_busy &&
                    _service.viewer == null &&
                    !_service.hasSavedToken) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            '1  Authorize in your browser',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 10),
                          const Text(
                            'Sign in on AniList and approve AniDeck. Copy the access token shown there, then return here. Never paste your password. AniList authorization grants broad account access; this preview only reads your list.',
                          ),
                          const SizedBox(height: 16),
                          FilledButton.icon(
                            onPressed: () => _run(() async {
                              if (widget.openBrowser != null) {
                                await widget.openBrowser!();
                              } else {
                                await const MethodChannel('anideck/anilist')
                                    .invokeMethod<void>('openAuthorization');
                              }
                            }),
                            icon: const Icon(Icons.open_in_new_rounded),
                            label: const Text('Open AniList'),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            '2  Connect securely',
                            style: TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 16),
                          TextField(
                            controller: _input,
                            obscureText: true,
                            autocorrect: false,
                            enableSuggestions: false,
                            enableIMEPersonalizedLearning: false,
                            maxLength: 8192,
                            maxLines: 1,
                            decoration: const InputDecoration(
                              labelText: 'AniList access token',
                              counterText: '',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: _connect,
                            child: const Text('Connect AniList'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                if (_protected && !_busy && _service.hasSavedToken) ...[
                  Wrap(
                    spacing: 12,
                    runSpacing: 8,
                    children: [
                      OutlinedButton.icon(
                        onPressed: () => _run(() async {
                          await _service.restore();
                          await _service.load(refresh: true);
                        }),
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('Refresh AniList'),
                      ),
                      TextButton(
                        onPressed: _disconnect,
                        child: const Text('Disconnect AniList'),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 20),
                if (_service.viewer != null) ...[
                  Text(
                    '${_service.entries.length} loaded from AniList',
                    style: const TextStyle(color: Color(0xffb4afc2)),
                  ),
                  const SizedBox(height: 12),
                  if (!_busy && _error == null && _service.entries.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('Your AniList anime list is empty.'),
                    ),
                  ..._service.entries.map(
                    (entry) => Card(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: _busy || _service.requiresRefresh
                            ? null
                            : () => _edit(entry),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (entry.cover != null)
                                Padding(
                                  padding: const EdgeInsets.only(right: 14),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: Image.network(
                                      entry.cover.toString(),
                                      width: 48,
                                      height: 72,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, _, _) => const SizedBox(
                                        width: 48,
                                        height: 72,
                                        child: Icon(Icons.movie_outlined),
                                      ),
                                    ),
                                  ),
                                ),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      entry.title,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Wrap(
                                      spacing: 12,
                                      runSpacing: 6,
                                      children: [
                                        Text(status(entry.status)),
                                        Text('Episode ${entry.progress}'),
                                        Text(
                                          entry.score == 0
                                              ? 'Not rated'
                                              : '${entry.score.toStringAsFixed(1)} / 10',
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                              IconButton(
                                tooltip: 'Edit ${entry.title} on AniList',
                                onPressed: _busy || _service.requiresRefresh
                                    ? null
                                    : () => _edit(entry),
                                icon: const Icon(Icons.edit_outlined),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (_service.hasMore)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: OutlinedButton(
                        onPressed: _busy
                            ? null
                            : () => _run(() => _service.load()),
                        child: const Text('Load more from AniList'),
                      ),
                    ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

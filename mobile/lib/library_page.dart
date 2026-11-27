import 'package:material_ui/material_ui.dart';

import 'anilist_page.dart';

import 'local_library.dart';
import 'provider_browser.dart';
import 'library_editor.dart';

class LibraryPage extends StatefulWidget {
  const LibraryPage({super.key, this.library, this.refreshToken = 0});
  final LocalLibrary? library;
  final int refreshToken;
  @override
  State<LibraryPage> createState() => _LibraryPageState();
}

class _LibraryPageState extends State<LibraryPage> {
  late Future<List<LibraryEntry>> _entries;
  LocalLibrary get _library => widget.library ?? LocalLibrary.instance;
  @override
  void initState() {
    super.initState();
    _entries = _library.entries();
  }

  void _refresh() {
    final entries = _library.entries();
    setState(() {
      _entries = entries;
    });
  }

  @override
  void didUpdateWidget(covariant LibraryPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshToken != widget.refreshToken) _refresh();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('My list'),
      actions: [
        IconButton(
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => const AniListPageView()),
          ),
          tooltip: 'Open AniList list',
          icon: const Icon(Icons.sync_rounded),
        ),
        IconButton(
          onPressed: _refresh,
          tooltip: 'Refresh local list',
          icon: const Icon(Icons.refresh_rounded),
        ),
      ],
    ),
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 700),
          child: FutureBuilder<List<LibraryEntry>>(
            future: _entries,
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      'Your local list couldn’t load. Your saved data was kept.',
                    ),
                    TextButton(
                      onPressed: _refresh,
                      child: const Text('Try again'),
                    ),
                  ],
                );
              }
              if (!snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              return ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  const Text(
                    'YOUR DECK, ON THIS DEVICE',
                    style: TextStyle(
                      color: Color(0xffbba5ff),
                      fontSize: 11,
                      letterSpacing: 2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Pick up where you left off.',
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Saved on this device. Your connected AniList list is available separately from Home.',
                    style: TextStyle(color: Color(0xffb4afc2), height: 1.5),
                  ),
                  const SizedBox(height: 24),
                  if (snapshot.data!.isEmpty) ...[
                    const Icon(
                      Icons.bookmarks_outlined,
                      size: 48,
                      color: Color(0xffbba5ff),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Your next favorite belongs here.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: () async {
                        await Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => const ProviderBrowser(),
                          ),
                        );
                        if (mounted) _refresh();
                      },
                      icon: const Icon(Icons.search_rounded),
                      label: const Text('Find a show'),
                    ),
                  ],
                  for (final entry in snapshot.data!)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Card(
                        child: ListTile(
                          contentPadding: const EdgeInsets.all(16),
                          leading: const Icon(
                            Icons.bookmark_rounded,
                            color: Color(0xffbba5ff),
                          ),
                          title: Text(
                            entry.title.name,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          subtitle: Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                DefaultTextStyle.merge(
                                  style: const TextStyle(
                                    color: Color(0xffd5c6ff),
                                  ),
                                  child: Wrap(
                                    spacing: 10,
                                    runSpacing: 4,
                                    children: [
                                      Text(entry.status.label),
                                      Text('${entry.watched} watched'),
                                      if (entry.scoreHalf != null)
                                        Text('★ ${entry.scoreLabel}'),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 6),
                                if (entry.resume == null)
                                  const Text('Saved for later • Anikoto')
                                else ...[
                                  Text(
                                    'Resume episode ${entry.resume!.episode}',
                                  ),
                                  Text(
                                    '${entry.resume!.audio == 'sub' ? 'Subtitled' : 'Dubbed'} • '
                                    '${entry.resume!.startPosition.inMinutes}:${(entry.resume!.startPosition.inSeconds % 60).toString().padLeft(2, '0')}',
                                  ),
                                ],
                              ],
                            ),
                          ),
                          trailing: IconButton(
                            tooltip: 'Edit ${entry.title.name}',
                            icon: const Icon(Icons.edit_outlined),
                            onPressed: () async {
                              final saved = await editLibraryEntry(
                                context,
                                _library,
                                entry,
                              );
                              if (mounted && saved == true) _refresh();
                            },
                          ),
                          onTap: () async {
                            await Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => ProviderEpisodes(
                                  title: entry.title,
                                  library: _library,
                                  preferredResume: entry.resume,
                                ),
                              ),
                            );
                            if (mounted) _refresh();
                          },
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    ),
  );
}

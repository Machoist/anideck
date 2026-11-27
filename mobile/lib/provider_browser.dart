import 'dart:async';

import 'package:material_ui/material_ui.dart';

import 'poster_artwork.dart';

import 'player_preview.dart';
import 'providers/anikoto_catalog.dart';
import 'providers/provider_playback.dart';
import 'local_library.dart';

class ProviderBrowser extends StatefulWidget {
  const ProviderBrowser({super.key});
  @override
  State<ProviderBrowser> createState() => _ProviderBrowserState();
}

class _ProviderBrowserState extends State<ProviderBrowser> {
  final _catalog = AnikotoCatalog(), _query = TextEditingController();
  final _queryFocus = FocusNode();
  List<ProviderTitle> _results = [];
  String? _error;
  bool _busy = false, _searched = false;
  int _generation = 0;
  Future<void> _search() async {
    final term = _query.text.trim();
    if (term.length < 2 || _busy) return;
    final generation = ++_generation;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = null;
      _searched = true;
      _results = [];
    });
    try {
      final results = await _catalog.search(term);
      if (mounted && generation == _generation) {
        setState(() => _results = results);
      }
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted && generation == _generation) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _generation++;
    _catalog.close();
    _query.dispose();
    _queryFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Find your next watch')),
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 700),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'ANIKOTO',
                style: TextStyle(
                  color: Color(0xffbba5ff),
                  letterSpacing: 2,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 10),
              const Text(
                'Find it. Press play.',
                style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              const Text(
                'Choose the exact season from this source.',
                style: TextStyle(color: Color(0xffb4afc2), height: 1.5),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _query,
                focusNode: _queryFocus,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _search(),
                decoration: InputDecoration(
                  labelText: 'Search anime',
                  hintText: 'Title or season',
                  prefixIcon: const Icon(Icons.search_rounded),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _busy ? null : _search,
                icon: Icon(
                  _busy ? Icons.hourglass_top_rounded : Icons.search_rounded,
                ),
                label: Text(_busy ? 'Searching…' : 'Search'),
              ),
              const SizedBox(height: 24),
              if (_error != null) _Notice(message: _error!),
              if (!_busy && _error == null && _searched && _results.isEmpty)
                const _Notice(
                  message: 'No titles found on this source. Try another name.',
                ),
              for (final title in _results)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Card(
                    child: ListTile(
                      contentPadding: const EdgeInsets.all(12),
                      leading: title.poster == null
                          ? const Icon(Icons.movie_outlined)
                          : ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: PosterArtwork(
                                uri: title.poster,
                                width: 44,
                                height: 66,
                              ),
                            ),
                      title: Text(
                        title.name,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: const Text('View listed episodes'),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () async {
                        _queryFocus.unfocus();
                        // Route focus restoration must not reopen the IME.
                        _queryFocus.canRequestFocus = false;
                        try {
                          await Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => ProviderEpisodes(title: title),
                            ),
                          );
                        } finally {
                          WidgetsBinding.instance.addPostFrameCallback((_) {
                            if (mounted) _queryFocus.canRequestFocus = true;
                          });
                        }
                      },
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}

class ProviderEpisodes extends StatefulWidget {
  const ProviderEpisodes({
    super.key,
    required this.title,
    this.library,
    this.preferredResume,
    this.catalog,
  });
  final ProviderTitle title;
  final LocalLibrary? library;
  final ResumePoint? preferredResume;
  final AnikotoCatalog? catalog;
  @override
  State<ProviderEpisodes> createState() => _ProviderEpisodesState();
}

class _ProviderEpisodesState extends State<ProviderEpisodes> {
  late final AnikotoCatalog _catalog;
  List<ProviderEpisode>? _episodes;
  ProviderDetails? _details;
  bool _expandedAbout = false;
  int _page = 0;
  String? _error;
  String _audio = 'sub';
  int _generation = 0;
  bool _saved = false, _saving = false;
  String? _saveError;
  LocalLibrary get _library => widget.library ?? LocalLibrary.instance;
  @override
  void initState() {
    super.initState();
    _catalog = widget.catalog ?? AnikotoCatalog();
    _audio = widget.preferredResume?.audio ?? 'sub';
    _checkSaved();
    _load();
  }

  Future<void> _checkSaved() async {
    try {
      final saved = await _library.contains(widget.title);
      if (mounted && !_saving && !_saved) setState(() => _saved = saved);
    } catch (_) {
      if (mounted) {
        setState(
          () => _saveError = 'Your local list couldn’t load. Try saving again.',
        );
      }
    }
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _saveError = null;
    });
    try {
      await _library.save(widget.title);
      if (mounted) setState(() => _saved = true);
    } catch (_) {
      if (mounted) {
        setState(() => _saveError = 'Couldn’t save to this device. Try again.');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _play(ProviderEpisode episode) async {
    final audio = _audio;
    // Resolve against the newly listed episode, never a cached stream/episode ID.
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PreviewPlayer(
          providerRequest: ProviderPlaybackRequest(
            widget.title,
            episode,
            audio,
          ),
          library: _library,
        ),
      ),
    );
  }

  Future<void> _load() async {
    final generation = ++_generation;
    _catalog.refreshTitle(widget.title);
    setState(() {
      _error = null;
      _episodes = null;
      _details = null;
    });
    unawaited(_loadDetails(generation));
    try {
      final episodes = await _catalog.episodes(widget.title);
      if (mounted && generation == _generation) {
        setState(() => _episodes = episodes);
      }
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() => _error = error.toString());
      }
    }
  }

  Future<void> _loadDetails(int generation) async {
    try {
      final details = await _catalog.details(widget.title);
      if (mounted && generation == _generation) {
        setState(() => _details = details);
      }
    } catch (_) {
      /* Metadata failure must not fabricate or suppress episodes. */
    }
  }

  @override
  void dispose() {
    _generation++;
    _catalog.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final visible = _episodes?.where((e) => e.supports(_audio)).toList();
    final page = _page.clamp(
      0,
      visible == null || visible.isEmpty ? 0 : (visible.length - 1) ~/ 50,
    );
    return Scaffold(
      appBar: AppBar(title: const Text('Episodes & Details')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 700),
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_details?.poster ?? widget.title.poster
                        case final poster?) ...[
                      ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: PosterArtwork(
                          uri: poster,
                          width: 88,
                          height: 132,
                        ),
                      ),
                      const SizedBox(width: 16),
                    ],
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _details?.name ?? widget.title.name,
                            style: const TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          if (_details != null)
                            Wrap(
                              spacing: 6,
                              children: [
                                for (final fact in _details!.facts.entries)
                                  Chip(label: Text(fact.value)),
                              ],
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Anikoto',
                  style: TextStyle(color: Color(0xffb4afc2)),
                ),
                const SizedBox(height: 20),
                if (_details != null) ...[
                  if (_details!.genres.isNotEmpty)
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final genre in _details!.genres)
                          Chip(label: Text(genre)),
                      ],
                    ),
                  const SizedBox(height: 12),
                  const Text(
                    'About',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _details!.synopsis.isEmpty
                        ? 'This source hasn’t supplied a synopsis yet.'
                        : _details!.synopsis,
                    maxLines: _expandedAbout ? null : 4,
                    overflow: _expandedAbout ? null : TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xffb4afc2),
                      height: 1.5,
                    ),
                  ),
                  if (_details!.synopsis.length > 180)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        onPressed: () =>
                            setState(() => _expandedAbout = !_expandedAbout),
                        child: Text(_expandedAbout ? 'Show less' : 'Read more'),
                      ),
                    ),
                  const SizedBox(height: 20),
                ],
                Align(
                  alignment: Alignment.centerLeft,
                  child: FilledButton.tonalIcon(
                    onPressed: _saved || _saving ? null : _save,
                    icon: Icon(
                      _saved
                          ? Icons.bookmark_added_rounded
                          : Icons.bookmark_add_outlined,
                    ),
                    label: Text(
                      _saved
                          ? 'Saved to My list'
                          : _saving
                          ? 'Saving…'
                          : 'Save to My list',
                    ),
                  ),
                ),
                if (_saveError != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      _saveError!,
                      style: const TextStyle(color: Color(0xffffca8b)),
                    ),
                  ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 10,
                  children: [
                    for (final audio in ['sub', 'dub'])
                      ChoiceChip(
                        label: Text(audio == 'sub' ? 'Subtitled' : 'Dubbed'),
                        selected: _audio == audio,
                        onSelected: (_) => setState(() {
                          _audio = audio;
                          _page = 0;
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 20),
                if (_error != null) ...[
                  _Notice(message: _error!),
                  TextButton.icon(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Check again'),
                  ),
                ] else if (_episodes == null)
                  const Padding(
                    padding: EdgeInsets.all(32),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (visible!.isEmpty)
                  const _Notice(
                    message: 'This source has no listed episodes for the selected audio.',
                  )
                else ...[
                  if (widget.preferredResume case final resume?) ...[
                    if (resume.audio == _audio &&
                        visible.any((e) => e.number == resume.episode))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: FilledButton.icon(
                          onPressed: () => _play(
                            visible.firstWhere(
                              (e) => e.number == resume.episode,
                            ),
                          ),
                          icon: const Icon(Icons.play_arrow_rounded),
                          label: Text('Continue episode ${resume.episode}'),
                        ),
                      )
                    else if (resume.audio == _audio)
                      const _Notice(
                        message: 'Your saved episode isn’t listed for this audio right now. Your progress is kept.',
                      ),
                  ],
                  Text(
                    '${visible.length} listed episodes',
                    style: const TextStyle(color: Color(0xffbba5ff)),
                  ),
                  const SizedBox(height: 12),
                  if (visible.length > 50)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        IconButton(
                          tooltip: 'Previous episodes',
                          onPressed: page == 0
                              ? null
                              : () => setState(() => _page = page - 1),
                          icon: const Icon(Icons.chevron_left_rounded),
                        ),
                        Text(
                          '${visible[page * 50].number}–${visible[(page * 50 + 49).clamp(0, visible.length - 1)].number}',
                        ),
                        IconButton(
                          tooltip: 'Next episodes',
                          onPressed: (page + 1) * 50 >= visible.length
                              ? null
                              : () => setState(() => _page = page + 1),
                          icon: const Icon(Icons.chevron_right_rounded),
                        ),
                      ],
                    ),
                  for (final episode in visible.skip(page * 50).take(50))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: const Color(0xff383049),
                            child: Text(
                              '${episode.number}',
                              style: const TextStyle(
                                color: Color(0xffd3c5ff),
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          title: Text(
                            episode.title.isEmpty
                                ? 'Episode ${episode.number}'
                                : episode.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            'Episode ${episode.number} • ${_audio == 'sub' ? 'Subtitled' : 'Dubbed'}',
                          ),
                          trailing: const Icon(
                            Icons.play_circle_fill_rounded,
                            color: Color(0xffbba5ff),
                            size: 34,
                          ),
                          onTap: () => _play(episode),
                        ),
                      ),
                    ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: const Color(0xff24202e),
      borderRadius: BorderRadius.circular(18),
    ),
    child: Text(message, style: const TextStyle(height: 1.5)),
  );
}

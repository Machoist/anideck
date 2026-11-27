import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:material_ui/material_ui.dart';

import 'local_library.dart';
import 'library_page.dart';
import 'provider_browser.dart';
import 'providers/anikoto_catalog.dart';
import 'account_page.dart';
import 'anilist_page.dart';
import 'poster_artwork.dart';

class PreviewHome extends StatefulWidget {
  const PreviewHome({
    super.key,
    this.loadFeed,
    this.loadLibrary,
    this.onSamples,
  });
  final Future<List<ProviderTitle>> Function()? loadFeed;
  final Future<List<LibraryEntry>> Function()? loadLibrary;
  final void Function(BuildContext)? onSamples;
  @override
  State<PreviewHome> createState() => _PreviewHomeState();
}

class _PreviewHomeState extends State<PreviewHome> {
  final _catalog = AnikotoCatalog();
  final _visited = <int>{0};
  int _index = 0, _revision = 0;
  void _select(int index) => setState(() {
    _index = index;
    _visited.add(index);
    _revision++;
  });
  @override
  void dispose() {
    _catalog.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: IndexedStack(
      index: _index,
      children: [
        HomeDashboard(
          loadFeed:
              widget.loadFeed ?? (kIsWeb ? () async => [] : _catalog.discover),
          loadLibrary:
              widget.loadLibrary ??
              (kIsWeb ? () async => [] : LocalLibrary.instance.entries),
          refreshToken: _revision,
          onBrowse: () => _select(1),
          onLibrary: () => _select(2),
          onSamples: widget.onSamples,
        ),
        _visited.contains(1) ? const ProviderBrowser() : const SizedBox(),
        _visited.contains(2)
            ? LibraryPage(refreshToken: _revision)
            : const SizedBox(),
      ],
    ),
    bottomNavigationBar: SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 8, 16, 10),
        decoration: BoxDecoration(
          color: const Color(0xff211e2b),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: const Color(0xff393244)),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: NavigationBar(
            backgroundColor: Colors.transparent,
            selectedIndex: _index,
            onDestinationSelected: kIsWeb ? null : _select,
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home_rounded),
                label: 'Home',
              ),
              NavigationDestination(
                icon: Icon(Icons.search_rounded),
                label: 'Search',
              ),
              NavigationDestination(
                icon: Icon(Icons.bookmarks_outlined),
                selectedIcon: Icon(Icons.bookmarks_rounded),
                label: 'My list',
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class HomeDashboard extends StatefulWidget {
  const HomeDashboard({
    super.key,
    required this.loadFeed,
    required this.loadLibrary,
    required this.refreshToken,
    required this.onBrowse,
    required this.onLibrary,
    this.onSamples,
  });
  final Future<List<ProviderTitle>> Function() loadFeed;
  final Future<List<LibraryEntry>> Function() loadLibrary;
  final int refreshToken;
  final VoidCallback onBrowse, onLibrary;
  final void Function(BuildContext)? onSamples;
  @override
  State<HomeDashboard> createState() => _HomeDashboardState();
}

class _HomeDashboardState extends State<HomeDashboard> {
  late Future<List<ProviderTitle>> _feed;
  late Future<List<LibraryEntry>> _saved;
  @override
  void initState() {
    super.initState();
    _feed = widget.loadFeed();
    _saved = widget.loadLibrary();
  }

  @override
  void didUpdateWidget(covariant HomeDashboard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.refreshToken != widget.refreshToken) _refreshSaved();
  }

  void _refreshSaved() {
    final saved = widget.loadLibrary();
    setState(() {
      _saved = saved;
    });
  }

  void _refreshFeed() {
    final feed = widget.loadFeed();
    setState(() {
      _feed = feed;
    });
  }

  Future<void> _open(ProviderTitle title, {ResumePoint? resume}) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ProviderEpisodes(title: title, preferredResume: resume),
      ),
    );
    if (mounted) _refreshSaved();
  }

  Widget _heading(String text) => Padding(
    padding: const EdgeInsets.only(top: 28, bottom: 16),
    child: Text(
      text,
      style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w800),
    ),
  );
  Widget _welcome() => Container(
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(28),
      border: Border.all(color: const Color(0xff514165)),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xff3b2e51), Color(0xff211d2b), Color(0xff1b1a24)],
      ),
    ),
    child: LayoutBuilder(
      builder: (context, box) => Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'YOUR NEXT WATCH, ON DECK',
                  style: TextStyle(
                    color: Color(0xffd2bfff),
                    fontSize: 10,
                    letterSpacing: 1.8,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'A good story.\nYour kind of night.',
                  key: const ValueKey('home-welcome-title'),
                  style: TextStyle(
                    fontSize: box.maxWidth >= 640 ? 40 : 30,
                    fontWeight: FontWeight.w800,
                    height: 1.1,
                    letterSpacing: -1,
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Pick up where you left off, or find something worth staying up for.',
                  style: TextStyle(color: Color(0xffc1b8cf), height: 1.5),
                ),
                const SizedBox(height: 22),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    FilledButton.icon(
                      key: const ValueKey('home-browse'),
                      onPressed: kIsWeb ? null : widget.onBrowse,
                      icon: const Icon(Icons.search_rounded),
                      label: const Text('Browse anime'),
                    ),
                    OutlinedButton.icon(
                      onPressed: kIsWeb ? null : widget.onLibrary,
                      icon: const Icon(Icons.bookmarks_outlined),
                      label: const Text('My list'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          if (box.maxWidth >= 640)
            const Padding(
              padding: EdgeInsets.only(left: 32),
              child: _DeckMark(),
            ),
        ],
      ),
    ),
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Row(
        children: [
          Image.asset('assets/app-icon.png', width: 30, height: 30),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              'AniDeck',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.8,
                fontSize: 24,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
      actions: [
        if (!kIsWeb)
          IconButton(
            tooltip: 'AniList connection',
            icon: const Icon(Icons.sync_rounded),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const AniListPageView()),
            ),
          ),
        if (!kIsWeb)
          IconButton(
            tooltip: 'Your account',
            icon: const Icon(Icons.person_outline_rounded),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const AccountPage()),
            ),
          ),
        if (widget.onSamples != null)
          PopupMenuButton<String>(
            tooltip: 'More',
            onSelected: (_) => widget.onSamples!(context),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'samples', child: Text('Playback checks')),
            ],
          ),
      ],
    ),
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1200),
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              _welcome(),
              if (kIsWeb)
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: Text(
                    'Live browsing and your local list are available in the Android build.',
                  ),
                ),
              _heading('Continue watching'),
              FutureBuilder<List<LibraryEntry>>(
                future: _saved,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return Card(
                      child: ListTile(
                        title: const Text('Your saved shows couldn’t load.'),
                        trailing: IconButton(
                          tooltip: 'Retry saved shows',
                          onPressed: _refreshSaved,
                          icon: const Icon(Icons.refresh_rounded),
                        ),
                      ),
                    );
                  }
                  if (!snapshot.hasData) {
                    return const _HomeLoading(height: 112);
                  }
                  final continuing = snapshot.data!
                      .where((e) => e.resume != null)
                      .take(6)
                      .toList();
                  if (continuing.isEmpty) {
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Your next episode starts here.',
                              style: TextStyle(fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Save a show to My list, then play an episode to remember your place.',
                            ),
                            TextButton(
                              onPressed: kIsWeb ? null : widget.onLibrary,
                              child: const Text('Open My list'),
                            ),
                          ],
                        ),
                      ),
                    );
                  }
                  return Column(
                    children: [
                      for (final entry in continuing)
                        Card(
                          child: ListTile(
                            contentPadding: const EdgeInsets.all(16),
                            leading: ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: PosterArtwork(
                                uri: entry.title.poster,
                                width: 48,
                                height: 72,
                              ),
                            ),
                            title: Text(
                              entry.title.name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Episode ${entry.resume!.episode} • ${entry.resume!.audio == 'sub' ? 'Subtitled' : 'Dubbed'}'
                                    ' • ${entry.resume!.startPosition.inMinutes}:${(entry.resume!.startPosition.inSeconds % 60).toString().padLeft(2, '0')}',
                                  ),
                                  const SizedBox(height: 10),
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(4),
                                    child: LinearProgressIndicator(
                                      minHeight: 3,
                                      value:
                                          entry.resume!.duration.inSeconds <= 0
                                          ? 0
                                          : (entry
                                                        .resume!
                                                        .startPosition
                                                        .inSeconds /
                                                    entry
                                                        .resume!
                                                        .duration
                                                        .inSeconds)
                                                .clamp(0.0, 1.0),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            trailing: const Icon(
                              Icons.play_circle_fill_rounded,
                              color: Color(0xffc4aaff),
                              size: 32,
                            ),
                            onTap: () =>
                                _open(entry.title, resume: entry.resume),
                          ),
                        ),
                    ],
                  );
                },
              ),
              _heading('Explore Anikoto'),
              FutureBuilder<List<ProviderTitle>>(
                future: _feed,
                builder: (context, snapshot) {
                  if (snapshot.hasError) {
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'The source feed couldn’t load. You can still search or open your saved shows.',
                            ),
                            TextButton.icon(
                              onPressed: _refreshFeed,
                              icon: const Icon(Icons.refresh_rounded),
                              label: const Text('Retry feed'),
                            ),
                          ],
                        ),
                      ),
                    );
                  }
                  if (!snapshot.hasData) {
                    return const _HomeLoading(height: 240);
                  }
                  if (snapshot.data!.isEmpty) {
                    return const Text(
                      'No source picks are available right now.',
                    );
                  }
                  final cardWidth = MediaQuery.sizeOf(context).width >= 1000
                      ? 176.0
                      : MediaQuery.sizeOf(context).width >= 600
                      ? 160.0
                      : 140.0;
                  return SizedBox(
                    height:
                        cardWidth * 1.45 +
                        24 +
                        MediaQuery.textScalerOf(context).scale(14) * 3,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: snapshot.data!.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 12),
                      itemBuilder: (context, index) {
                        final title = snapshot.data![index];
                        return SizedBox(
                          key: ValueKey('home-feed-$index'),
                          width: cardWidth,
                          child: InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: () => _open(title),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(16),
                                  child: PosterArtwork(
                                    uri: title.poster,
                                    width: cardWidth,
                                    height: cardWidth * 1.45,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  title.name,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  );
                },
              ),
              const SizedBox(height: 20),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    ),
  );
}

class _DeckMark extends StatelessWidget {
  const _DeckMark();
  @override
  Widget build(BuildContext context) => SizedBox(
    width: 176,
    height: 190,
    child: Stack(
      alignment: Alignment.center,
      children: [
        for (final angle in [-0.20, 0.18, 0.0])
          Transform.rotate(
            angle: angle,
            child: Container(
              width: 108,
              height: 150,
              decoration: BoxDecoration(
                color: angle == 0
                    ? const Color(0xff3c3150)
                    : const Color(0xff292333),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xff86709f)),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x33000000),
                    blurRadius: 20,
                    offset: Offset(0, 10),
                  ),
                ],
              ),
              child: angle == 0
                  ? Center(
                      child: Image.asset(
                        'assets/app-icon.png',
                        width: 62,
                        height: 62,
                      ),
                    )
                  : null,
            ),
          ),
      ],
    ),
  );
}

class _HomeLoading extends StatelessWidget {
  const _HomeLoading({required this.height});
  final double height;
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Loading shows',
    child: Container(
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xff302a3b)),
        gradient: const LinearGradient(
          colors: [Color(0xff211d2b), Color(0xff19171f)],
        ),
      ),
      child: const Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    ),
  );
}

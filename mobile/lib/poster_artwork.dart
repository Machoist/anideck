import 'package:material_ui/material_ui.dart';

/// Decode for the actual display density, with bounded memory and no upscaling
/// of a small upstream file. Image identity changes never retain another title.
class PosterArtwork extends StatelessWidget {
  const PosterArtwork({
    super.key,
    this.uri,
    this.provider,
    required this.width,
    required this.height,
  });
  final Uri? uri;
  final ImageProvider? provider;
  final double width, height;
  Widget get _placeholder => DecoratedBox(
    decoration: const BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xff332b43), Color(0xff1d1a26)],
      ),
    ),
    child: const Center(
      child: Icon(Icons.movie_outlined, color: Color(0xff9689af), size: 28),
    ),
  );
  @override
  Widget build(BuildContext context) {
    final source =
        provider ?? (uri == null ? null : NetworkImage(uri.toString()));
    final pixels =
        ((width * MediaQuery.devicePixelRatioOf(context) / 64).ceil() * 64)
            .clamp(64, 1024);
    return SizedBox(
      width: width,
      height: height,
      child: source == null
          ? _placeholder
          : Image(
              key: ValueKey(uri?.toString() ?? source),
              image: ResizeImage(
                source,
                width: pixels,
                height: (pixels * height / width).ceil().clamp(64, 1536),
                policy: ResizeImagePolicy.fit,
                allowUpscaling: false,
              ),
              width: width,
              height: height,
              fit: BoxFit.cover,
              filterQuality: FilterQuality.medium,
              frameBuilder: (context, child, frame, synchronous) =>
                  frame == null ? _placeholder : child,
              errorBuilder: (_, _, _) => _placeholder,
            ),
    );
  }
}

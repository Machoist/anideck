import 'dart:ui' as ui;
import 'dart:typed_data';

import 'package:anideck_mobile/poster_artwork.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

Future<Uint8List> fixture(int width, int height) async {
  final recorder = ui.PictureRecorder();
  final canvas = ui.Canvas(recorder);
  for (var x = 0; x < width; x += 16) {
    canvas.drawRect(
      ui.Rect.fromLTWH(x.toDouble(), 0, 16, height.toDouble()),
      ui.Paint()
        ..color = x % 32 == 0
            ? const ui.Color(0xffbca5ff)
            : const ui.Color(0xff302440),
    );
  }
  final picture = recorder.endRecording();
  final image = await picture.toImage(width, height);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  picture.dispose();
  return bytes!.buffer.asUint8List();
}

void main() {
  testWidgets(
    'high-density poster retains actual source detail instead of the old 320px decode',
    (tester) async {
      final bytes = await tester.runAsync(() => fixture(900, 1350));
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(devicePixelRatio: 3),
            child: Center(
              child: PosterArtwork(
                provider: MemoryImage(bytes!),
                width: 140,
                height: 210,
              ),
            ),
          ),
        ),
      );
      final image = tester.widget<Image>(find.byType(Image));
      await tester.runAsync(
        () => precacheImage(image.image, tester.element(find.byType(Image))),
      );
      await tester.pump();
      final rendered = tester.renderObject<RenderImage>(find.byType(RawImage));
      expect(rendered.image!.width, greaterThanOrEqualTo(420));
      expect(rendered.image!.width, lessThanOrEqualTo(900));
      expect(
        rendered.image!.height / rendered.image!.width,
        closeTo(1.5, 0.01),
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'small source is never inflated into a pretend high-resolution decoded image',
    (tester) async {
      final bytes = await tester.runAsync(() => fixture(100, 150));
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(devicePixelRatio: 4),
            child: Center(
              child: PosterArtwork(
                provider: MemoryImage(bytes!),
                width: 176,
                height: 264,
              ),
            ),
          ),
        ),
      );
      final image = tester.widget<Image>(find.byType(Image));
      await tester.runAsync(
        () => precacheImage(image.image, tester.element(find.byType(Image))),
      );
      await tester.pump();
      final rendered = tester.renderObject<RenderImage>(find.byType(RawImage));
      expect(rendered.image!.width, 100);
      expect(rendered.image!.height, 150);
    },
  );
}

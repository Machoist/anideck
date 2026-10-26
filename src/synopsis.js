/* Choose between metadata for the same, externally mapped title. Never borrow a prequel's story. */
'use strict';
const TitleSynopsis = {
  clean(value) {
    return String(value || '').replace(/<br\s*\/?\s*>|<\/p>/gi, '\n').replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  },
  isStub(value) {
    const text = this.clean(value).replace(/\(?Source:[\s\S]*$/i, '').trim();
    // Catalog placeholders describe a sequel's relationship, without a plot of its own.
    return !text || (text.length < 240 && /^(?:the\s+)?(?:(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|final|next)\s+(?:season|part|cour)\s+of\b|sequel\s+to\b|continuation\s+of\b|season\s+\d+\s+of\b)/i.test(text)
      && text.split(/(?<=[.!?])\s+/).filter(Boolean).length <= 1);
  },
  choose(primary, alternate) {
    const first = this.clean(primary), second = this.clean(alternate);
    return (!first || (this.isStub(first) && !this.isStub(second))) ? second || first : first;
  }
};
